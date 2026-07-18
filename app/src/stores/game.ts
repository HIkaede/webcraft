/**
 * GameStore —— 游戏内状态（design.md §10 屏幕状态机 + §11.2 玩家状态）。
 *
 * 覆盖层（暂停/物品栏/聊天/死亡/F3…）**不是路由**，由本 store 的 `overlay` 驱动，
 * HUD / 物品栏 / 覆盖层代理直接绑定本 store，无需触碰引擎代码。
 *
 * Esc 行为栈（design.md §10）：
 *   none → 打开 pause；pause → 回游戏(none)；inventory/chat → 关闭该层(none)；
 *   options/advancements/stats → 返回 pause；death → 无行为。
 *
 * 渲染循环纪律（design.md §14）：引擎/HUD 高频数据请用
 * `useGameStore.getState()` / `useGameStore.subscribe(...)` 直写 DOM，
 * 避免在 rAF 中触发 React 渲染。
 */
import { create } from 'zustand';
import type { GameMode, ItemStack, PlayerState } from '@/game/types';
import { BlockId } from '@/game/engine-contract';

/** 游戏内覆盖层（design.md §10 + pause.md §B/§C） */
export type OverlayState =
  'none' | 'pause' | 'options' | 'inventory' | 'chat' | 'death' | 'advancements' | 'stats';

/** 快捷栏槽数 */
export const HOTBAR_SIZE = 9;
/** 生命/食物上限（半心/半鸡腿计） */
export const MAX_HEALTH = 20;
export const MAX_FOOD = 20;

/** 创造模式默认快捷栏（design.md §11.2：首次进入世界时） */
export function defaultCreativeHotbar(): (ItemStack | null)[] {
  const ids: BlockId[] = [
    BlockId.GRASS_BLOCK,
    BlockId.DIRT,
    BlockId.STONE,
    BlockId.COBBLESTONE,
    BlockId.OAK_PLANKS,
    BlockId.OAK_LOG,
    BlockId.OAK_LEAVES,
    BlockId.GLASS,
    BlockId.TORCH
  ];
  return ids.map((id) => ({ id, count: 64 }));
}

export function emptyHotbar(): (ItemStack | null)[] {
  return Array.from({ length: HOTBAR_SIZE }, () => null);
}

export interface GameStatus {
  /** 当前覆盖层 */
  overlay: OverlayState;
  /** 生命（半心 0–20） */
  health: number;
  /** 食物度（0–20） */
  food: number;
  /** 经验进度 0–1 */
  xp: number;
  /** 经验等级 */
  xpLevel: number;
  /** 当前游戏模式（HUD 按此切换显示，命令 /gamemode 可改） */
  mode: GameMode;
  /** 快捷栏 9 槽 */
  hotbar: (ItemStack | null)[];
  /** 选中槽 0–8 */
  selectedSlot: number;
  /** 世界时间 tick（0–23999） */
  worldTime: number;
  /** F3 调试屏开关 */
  debugVisible: boolean;
}

export interface GameActions {
  setOverlay: (overlay: OverlayState) => void;
  /** Esc 行为栈（见模块注释）；返回处理后的 overlay */
  handleEscape: () => OverlayState;
  setHealth: (health: number) => void;
  setFood: (food: number) => void;
  setXp: (xp: number, xpLevel?: number) => void;
  setMode: (mode: GameMode) => void;
  setSelectedSlot: (slot: number) => void;
  /** 滚轮切换选中槽（dir=+1 向下/右移一格，循环；game.md §6.3） */
  cycleSlot: (dir: 1 | -1) => void;
  setHotbarSlot: (slot: number, stack: ItemStack | null) => void;
  setHotbar: (hotbar: (ItemStack | null)[]) => void;
  setWorldTime: (ticks: number) => void;
  toggleDebug: () => void;
  /** 扣血（半心计）；归零自动进入 death 覆盖层 */
  damage: (amount: number) => void;
  /** 回血（半心计） */
  heal: (amount: number) => void;
  /** 重生：满状态、overlay=none（死亡屏「重生」按钮） */
  respawn: () => void;
  /** 进入世界时初始化玩家状态（有存档用存档，否则创造默认） */
  resetForWorld: (player?: PlayerState | null, mode?: GameMode) => void;
}

export type GameStore = GameStatus & GameActions;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const useGameStore = create<GameStore>()((set, get) => ({
  overlay: 'none',
  health: MAX_HEALTH,
  food: MAX_FOOD,
  xp: 0,
  xpLevel: 0,
  mode: 'creative',
  hotbar: defaultCreativeHotbar(),
  selectedSlot: 0,
  worldTime: 1000, // 新建世界从 t=1000 开始（game.md §2.2）
  debugVisible: false,

  setOverlay: (overlay) => set({ overlay }),

  handleEscape: () => {
    const cur = get().overlay;
    let next: OverlayState;
    switch (cur) {
      case 'none':
        next = 'pause';
        break;
      case 'pause':
      case 'inventory':
      case 'chat':
        next = 'none';
        break;
      case 'options':
      case 'advancements':
      case 'stats':
        next = 'pause';
        break;
      case 'death':
      default:
        next = cur; // 死亡屏 Esc 无行为
    }
    if (next !== cur) set({ overlay: next });
    return next;
  },

  setHealth: (health) => set({ health: clamp(Math.round(health), 0, MAX_HEALTH) }),
  setFood: (food) => set({ food: clamp(Math.round(food), 0, MAX_FOOD) }),
  setXp: (xp, xpLevel) => set((s) => ({ xp: clamp(xp, 0, 1), xpLevel: xpLevel ?? s.xpLevel })),
  setMode: (mode) => set({ mode }),
  setSelectedSlot: (slot) => set({ selectedSlot: clamp(Math.round(slot), 0, HOTBAR_SIZE - 1) }),
  cycleSlot: (dir) =>
    set((s) => ({ selectedSlot: (s.selectedSlot + dir + HOTBAR_SIZE) % HOTBAR_SIZE })),
  setHotbarSlot: (slot, stack) =>
    set((s) => {
      if (slot < 0 || slot >= HOTBAR_SIZE) return s;
      const hotbar = [...s.hotbar];
      hotbar[slot] = stack;
      return { hotbar };
    }),
  setHotbar: (hotbar) =>
    set({ hotbar: Array.from({ length: HOTBAR_SIZE }, (_, i) => hotbar[i] ?? null) }),
  setWorldTime: (ticks) => set({ worldTime: ((Math.round(ticks) % 24000) + 24000) % 24000 }),
  toggleDebug: () => set((s) => ({ debugVisible: !s.debugVisible })),

  damage: (amount) => {
    const health = clamp(get().health - Math.round(amount), 0, MAX_HEALTH);
    set(health <= 0 ? { health, overlay: 'death' } : { health });
  },
  heal: (amount) => set((s) => ({ health: clamp(s.health + Math.round(amount), 0, MAX_HEALTH) })),
  respawn: () => set({ overlay: 'none', health: MAX_HEALTH, food: MAX_FOOD, xp: 0, xpLevel: 0 }),

  resetForWorld: (player, mode) => {
    if (player) {
      set({
        overlay: 'none',
        health: clamp(player.health, 0, MAX_HEALTH),
        food: clamp(player.food, 0, MAX_FOOD),
        xp: clamp(player.xp, 0, 1),
        xpLevel: player.xpLevel,
        mode: player.mode,
        hotbar: Array.from({ length: HOTBAR_SIZE }, (_, i) => player.hotbar[i] ?? null),
        selectedSlot: 0,
        debugVisible: false
      });
    } else {
      const m = mode ?? 'creative';
      set({
        overlay: 'none',
        health: MAX_HEALTH,
        food: MAX_FOOD,
        xp: 0,
        xpLevel: 0,
        mode: m,
        hotbar: m === 'creative' ? defaultCreativeHotbar() : emptyHotbar(),
        selectedSlot: 0,
        debugVisible: false
      });
    }
  }
}));
