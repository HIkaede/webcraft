/**
 * 服务器列表持久化（multiplayer.md §A：localStorage `mc.web.servers`，可删）。
 *
 * 首次进入写入两个演示服务器：
 * 1. 本地演示世界（kind 'local'：绿色信号格 + 5 ms，加入 → 跳 #/worlds）
 * 2. Hypixel 示例（kind 'down'：红 ✕ + 无法连接到服务器，展示 ping 失败态）
 * 用户添加的服务器为 kind 'custom'（网页无法真实连接，同样展示失败态）。
 */

export const SERVERS_STORAGE_KEY = 'mc.web.servers';

export type ServerKind = 'local' | 'down' | 'custom';

export interface ServerEntry {
  id: string;
  name: string;
  /** 地址（副行显示；local 条目可为空） */
  address: string;
  kind: ServerKind;
}

/** 两个演示服务器（multiplayer.md §A 默认条目） */
export function defaultServers(): ServerEntry[] {
  return [
    { id: 'demo-local', name: '本地演示世界', address: '', kind: 'local' },
    { id: 'demo-hypixel', name: 'Hypixel 示例', address: 'play.hypixel.net', kind: 'down' }
  ];
}

/** 读取服务器列表；首次（无 key）时写入演示服务器并返回 */
export function readServers(): ServerEntry[] {
  try {
    const raw = localStorage.getItem(SERVERS_STORAGE_KEY);
    if (!raw) {
      const d = defaultServers();
      writeServers(d);
      return d;
    }
    const arr = JSON.parse(raw) as ServerEntry[];
    return Array.isArray(arr) ? arr : defaultServers();
  } catch {
    return defaultServers();
  }
}

export function writeServers(list: ServerEntry[]): void {
  try {
    localStorage.setItem(SERVERS_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[servers] 写入服务器列表失败', e);
  }
}
