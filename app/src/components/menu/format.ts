/**
 * 菜单屏共用格式化工具（worlds.md §布局）。
 */
import type { GameMode } from '@/game/types';

/** 世界列表第 2 行时间格式：`{YYYY/M/D HH:mm}`（worlds.md §条目结构） */
export function formatWorldTime(ts: number): string {
  const d = new Date(ts);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** 游戏模式 → 世界列表第 3 行文案（worlds.md：创造模式|生存模式|极限模式） */
export const GAME_MODE_LABEL: Record<GameMode, string> = {
  survival: '生存模式',
  creative: '创造模式',
  hardcore: '极限模式'
};
