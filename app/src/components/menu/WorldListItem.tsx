/**
 * WorldListItem —— 选择世界列表条目（worlds.md §布局）。
 *
 * 条目高 36u（含 2u 间距后节距 38u）：左侧 32×32u 世界图标 + 三行文本
 * （世界名 / `{名称} ({YYYY/M/D HH:mm})` / `{模式}{, 作弊}`，x+36u，y 2/12/21u）。
 * 选中态：1u 白描边 + rgba(255,255,255,0.08)；hover rgba(255,255,255,0.05)（瞬时，0ms）。
 * 入场：stagger 25ms，y 8→0，opacity 0→1，200ms（design.md §6.1）；
 * 删除：height 38u→0 + opacity 1→0，200ms easeIn（worlds.md §动效）。
 */
import { memo } from 'react';
import { motion } from 'framer-motion';
import type { WorldMeta } from '@/game/types';
import { useSettingsStore } from '@/stores/settings';
import { GAME_MODE_LABEL, formatWorldTime } from './format';
import { WorldIcon } from './pixel-icons';
import { cn } from '@/lib/utils';

export interface WorldListItemProps {
  world: WorldMeta;
  /** 列表序号（入场 stagger 25ms/项） */
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onEnter: (id: string) => void;
}

function WorldListItem({ world, index, selected, onSelect, onEnter }: WorldListItemProps) {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const line2 = `${world.name} (${formatWorldTime(world.lastPlayedAt)})`;
  const line3 = GAME_MODE_LABEL[world.mode] + (world.cheats ? ', 作弊' : '');

  return (
    <motion.div
      style={{ height: 'calc(38 * var(--u))', overflow: 'hidden' }}
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        height: 'calc(0 * var(--u))',
        transition: { duration: 0.2, ease: 'easeIn', delay: 0 }
      }}
      transition={{ delay: reducedMotion ? 0 : index * 0.025, duration: 0.2 }}
    >
      <div
        className={cn('relative select-none', !selected && 'hover:bg-[rgba(255,255,255,0.05)]')}
        style={{
          height: 'calc(36 * var(--u))',
          background: selected ? 'rgba(255,255,255,0.08)' : undefined,
          outline: selected ? 'calc(1 * var(--u)) solid #FFFFFF' : undefined,
          outlineOffset: 'calc(-1 * var(--u))'
        }}
        onClick={() => (selected ? onEnter(world.id) : onSelect(world.id))}
        onDoubleClick={() => onEnter(world.id)}
      >
        <div className="absolute" style={{ left: 0, top: 'calc(2 * var(--u))' }}>
          <WorldIcon seed={world.seed} />
        </div>
        <div
          className="mc-text absolute truncate"
          style={{
            left: 'calc(36 * var(--u))',
            right: 'calc(2 * var(--u))',
            top: 'calc(2 * var(--u))',
            fontSize: 'calc(8 * var(--u))'
          }}
        >
          {world.name}
        </div>
        <div
          className="mc-text-grayline absolute truncate"
          style={{
            left: 'calc(36 * var(--u))',
            right: 'calc(2 * var(--u))',
            top: 'calc(12 * var(--u))',
            fontSize: 'calc(8 * var(--u))'
          }}
        >
          {line2}
        </div>
        <div
          className="mc-text-grayline absolute truncate"
          style={{
            left: 'calc(36 * var(--u))',
            right: 'calc(2 * var(--u))',
            top: 'calc(21 * var(--u))',
            fontSize: 'calc(8 * var(--u))'
          }}
        >
          {line3}
        </div>
      </div>
    </motion.div>
  );
}

export default memo(WorldListItem);
