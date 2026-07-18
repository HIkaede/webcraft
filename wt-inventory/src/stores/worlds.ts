/**
 * WorldStore —— 世界元数据与存档持久化（design.md §11）。
 *
 * - 元数据 WorldMeta：localStorage `mc.web.worlds`（数组，worlds.md 按 lastPlayedAt 倒序展示）。
 * - 完整存档 WorldSave：IndexedDB `mc-web`（store：`worlds`，key = meta.id）；
 *   无 IndexedDB 环境时降级 localStorage `mc.web.save.<id>`。
 *
 * 加载流程（game.md / create-world.md）：按种子重建地形 → 回放 modified 差量。
 * 保存时机：退出到标题（“正在保存世界...”）与每 60s 静默自动保存。
 */
import { create } from 'zustand';
import type { WorldMeta, WorldSave } from '@/game/types';

export const WORLDS_STORAGE_KEY = 'mc.web.worlds';
export const SAVE_DB_NAME = 'mc-web';
export const SAVE_STORE = 'worlds';
const SAVE_LS_PREFIX = 'mc.web.save.';

/* ------------------------------------------------------------------ *
 * 种子工具
 * ------------------------------------------------------------------ */

/**
 * 字符串种子 → int32（design.md §11.1）。
 * 纯数字字符串直接作为数值种子（create-world.md §B），其余按 Java String.hashCode 散列。
 */
export function hashSeed(seed: string): number {
  const trimmed = seed.trim();
  if (/^-?\d+$/.test(trimmed)) {
    try {
      return Number(BigInt.asIntN(32, BigInt(trimmed)));
    } catch {
      /* fallthrough */
    }
  }
  let h = 0;
  for (let i = 0; i < trimmed.length; i++) {
    h = (Math.imul(h, 31) + trimmed.charCodeAt(i)) | 0;
  }
  return h;
}

/** 随机 19 位数字字符串种子（create-world.md §A） */
export function randomSeedString(): string {
  let s = '';
  for (let i = 0; i < 19; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** 生成世界 id（短小随机串） */
export function genWorldId(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID().slice(0, 8);
  }
  if (c) {
    const buf = new Uint8Array(6);
    c.getRandomValues(buf);
    return Array.from(buf, (b) => (b % 36).toString(36)).join('');
  }
  return Math.random().toString(36).slice(2, 10);
}

/* ------------------------------------------------------------------ *
 * localStorage 元数据读写（同步、容错）
 * ------------------------------------------------------------------ */

function readWorlds(): WorldMeta[] {
  try {
    const raw = localStorage.getItem(WORLDS_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as WorldMeta[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeWorlds(worlds: WorldMeta[]): void {
  try {
    localStorage.setItem(WORLDS_STORAGE_KEY, JSON.stringify(worlds));
  } catch (e) {
    console.warn('[WorldStore] 写入世界列表失败', e);
  }
}

/** 按 lastPlayedAt 倒序（worlds.md §数据） */
function sortWorlds(worlds: WorldMeta[]): WorldMeta[] {
  return [...worlds].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

/* ------------------------------------------------------------------ *
 * IndexedDB 最小 promise 封装（含 localStorage 降级）
 * ------------------------------------------------------------------ */

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SAVE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SAVE_STORE)) db.createObjectStore(SAVE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'));
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb request failed'));
  });
}

/* ------------------------------------------------------------------ *
 * 存档 API（异步）
 * ------------------------------------------------------------------ */

/** 写入完整存档（自动保存 / 退出保存）。 */
export async function saveWorld(save: WorldSave): Promise<void> {
  if (idbAvailable()) {
    try {
      const db = await openDb();
      await idbRequest(
        db.transaction(SAVE_STORE, 'readwrite').objectStore(SAVE_STORE).put(save, save.meta.id)
      );
      db.close();
      return;
    } catch (e) {
      console.warn('[WorldStore] IndexedDB 写入失败，降级 localStorage', e);
    }
  }
  try {
    localStorage.setItem(SAVE_LS_PREFIX + save.meta.id, JSON.stringify(save));
  } catch (e) {
    console.warn('[WorldStore] localStorage 存档写入失败', e);
    throw e;
  }
}

/** 读取完整存档；无存档返回 null。 */
export async function loadWorld(id: string): Promise<WorldSave | null> {
  if (idbAvailable()) {
    try {
      const db = await openDb();
      const val = await idbRequest<WorldSave | undefined>(
        db.transaction(SAVE_STORE, 'readonly').objectStore(SAVE_STORE).get(id)
      );
      db.close();
      if (val) return val;
    } catch (e) {
      console.warn('[WorldStore] IndexedDB 读取失败，尝试 localStorage', e);
    }
  }
  try {
    const raw = localStorage.getItem(SAVE_LS_PREFIX + id);
    return raw ? (JSON.parse(raw) as WorldSave) : null;
  } catch {
    return null;
  }
}

/** 删除完整存档。 */
export async function deleteWorldSave(id: string): Promise<void> {
  if (idbAvailable()) {
    try {
      const db = await openDb();
      await idbRequest(db.transaction(SAVE_STORE, 'readwrite').objectStore(SAVE_STORE).delete(id));
      db.close();
    } catch (e) {
      console.warn('[WorldStore] IndexedDB 删除失败', e);
    }
  }
  try {
    localStorage.removeItem(SAVE_LS_PREFIX + id);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * Zustand store（元数据 CRUD）
 * ------------------------------------------------------------------ */

/** createWorld 的输入（可只给部分字段，其余取默认：创造/普通/作弊开/默认世界/生成建筑开） */
export type CreateWorldInput = Partial<Omit<WorldMeta, 'id' | 'createdAt' | 'lastPlayedAt'>>;

export interface WorldsState {
  /** 世界元数据列表（lastPlayedAt 倒序） */
  worlds: WorldMeta[];
  /** 是否已完成首次读取 */
  loaded: boolean;
  /** 从 localStorage 重新读取 */
  refresh: () => void;
  /** 创建世界元数据并落盘，返回新 meta */
  createWorld: (input?: CreateWorldInput) => WorldMeta;
  /** 更新元数据字段并落盘 */
  updateWorld: (id: string, patch: Partial<Omit<WorldMeta, 'id'>>) => void;
  /** 删除世界（元数据立即移除；IndexedDB 存档异步清理） */
  deleteWorld: (id: string) => void;
  /** 刷新 lastPlayedAt 为当前时间 */
  touchLastPlayed: (id: string) => void;
  /** 按 id 查询 */
  getWorld: (id: string) => WorldMeta | undefined;
}

export const useWorldsStore = create<WorldsState>()((set, get) => ({
  worlds: [],
  loaded: false,

  refresh: () => set({ worlds: sortWorlds(readWorlds()), loaded: true }),

  createWorld: (input = {}) => {
    const now = Date.now();
    const meta: WorldMeta = {
      id: genWorldId(),
      name: input.name?.trim() || '新的世界',
      seed: input.seed?.trim() || randomSeedString(),
      mode: input.mode ?? 'creative',
      difficulty: input.difficulty ?? 'normal',
      cheats: input.cheats ?? true,
      worldType: input.worldType ?? 'default',
      structures: input.structures ?? true,
      bonusChest: input.bonusChest ?? false,
      createdAt: now,
      lastPlayedAt: now
    };
    const worlds = sortWorlds([...readWorlds(), meta]);
    writeWorlds(worlds);
    set({ worlds, loaded: true });
    return meta;
  },

  updateWorld: (id, patch) => {
    const worlds = sortWorlds(
      readWorlds().map((w) => (w.id === id ? { ...w, ...patch, id: w.id } : w))
    );
    writeWorlds(worlds);
    set({ worlds });
  },

  deleteWorld: (id) => {
    const worlds = readWorlds().filter((w) => w.id !== id);
    writeWorlds(worlds);
    set({ worlds });
    void deleteWorldSave(id);
  },

  touchLastPlayed: (id) => {
    get().updateWorld(id, { lastPlayedAt: Date.now() });
  },

  getWorld: (id) => get().worlds.find((w) => w.id === id)
}));

// 类型重导出，便于下游只 import '@/stores/worlds'
export type { WorldMeta, WorldSave };
