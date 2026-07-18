/**
 * ServerListItem —— 多人游戏服务器条目（multiplayer.md §A）。
 *
 * 条目高 36u：32×32u 图标（可连接=程序草方块 / 无法连接=`?` 占位）+ 名称白字 + 副行灰字，
 * 右侧：信号格 10×8u（5 格绿 #55FF55，逐格点亮 80ms/格）+ 延迟 `5 ms`，
 * 或红 ✕ + 红字 `无法连接到服务器`（ping 失败态）。
 * 选中/hover/入场/删除动画与 WorldListItem 一致（stagger 25ms，删除 height 38u→0 200ms）。
 */
import { memo } from 'react';
import { motion } from 'framer-motion';
import { MCTooltip } from '@/components/mc';
import { useSettingsStore } from '@/stores/settings';
import { ServerUnknownIcon, WorldIcon } from './pixel-icons';
import type { ServerEntry } from './servers';
import { cn } from '@/lib/utils';

export interface ServerListItemProps {
  server: ServerEntry;
  /** 列表序号（入场 stagger 25ms/项） */
  index: number;
  /** 变更此值重放 ping 动画（刷新，multiplayer.md §交互） */
  pingKey: number;
  selected: boolean;
  /** hover 提示（本地演示世界用） */
  tooltip?: string;
  onSelect: (id: string) => void;
  onJoin: (server: ServerEntry) => void;
}

/** 信号格：5 格绿 #55FF55，10×8u，逐格 opacity 0→1（间隔 80ms） */
function SignalBars() {
  return (
    <div
      className="flex items-end"
      style={{
        width: 'calc(10 * var(--u))',
        height: 'calc(8 * var(--u))',
        gap: 'calc(0.5 * var(--u))'
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.08, duration: 0.05 }}
          style={{
            width: 'calc(1.6 * var(--u))',
            height: `calc(${(8 * (i + 1)) / 5} * var(--u))`,
            background: '#55FF55'
          }}
        />
      ))}
    </div>
  );
}

function ServerListItem({
  server,
  index,
  pingKey,
  selected,
  tooltip,
  onSelect,
  onJoin
}: ServerListItemProps) {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const sub = server.kind === 'local' ? '网页版中的单人游戏世界' : server.address;

  const row = (
    <div
      className={cn('relative select-none', !selected && 'hover:bg-[rgba(255,255,255,0.05)]')}
      style={{
        height: 'calc(36 * var(--u))',
        background: selected ? 'rgba(255,255,255,0.08)' : undefined,
        outline: selected ? 'calc(1 * var(--u)) solid #FFFFFF' : undefined,
        outlineOffset: 'calc(-1 * var(--u))'
      }}
      onClick={() => (selected ? onJoin(server) : onSelect(server.id))}
      onDoubleClick={() => onJoin(server)}
    >
      <div className="absolute" style={{ left: 0, top: 'calc(2 * var(--u))' }}>
        {server.kind === 'local' ? <WorldIcon seed="mc-web-local-demo" /> : <ServerUnknownIcon />}
      </div>
      <div
        className="mc-text absolute truncate"
        style={{
          left: 'calc(36 * var(--u))',
          right: 'calc(96 * var(--u))',
          top: 'calc(2 * var(--u))',
          fontSize: 'calc(8 * var(--u))'
        }}
      >
        {server.name}
      </div>
      <div
        className="mc-text-grayline absolute truncate"
        style={{
          left: 'calc(36 * var(--u))',
          right: 'calc(96 * var(--u))',
          top: 'calc(13 * var(--u))',
          fontSize: 'calc(8 * var(--u))'
        }}
      >
        {sub}
      </div>
      {server.kind === 'local' ? (
        <div
          key={pingKey}
          className="absolute flex flex-col items-end"
          style={{
            right: 'calc(4 * var(--u))',
            top: 'calc(2 * var(--u))',
            gap: 'calc(2 * var(--u))'
          }}
        >
          <SignalBars />
          <motion.span
            className="mc-text-gray"
            style={{ fontSize: 'calc(8 * var(--u))', lineHeight: 1 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.1 }}
          >
            5 ms
          </motion.span>
        </div>
      ) : (
        <div
          className="absolute flex flex-col items-end"
          style={{
            right: 'calc(4 * var(--u))',
            top: 'calc(2 * var(--u))',
            gap: 'calc(2 * var(--u))'
          }}
        >
          <span
            className="mc-text-red"
            style={{ fontSize: 'calc(8 * var(--u))', lineHeight: 'calc(8 * var(--u))' }}
          >
            ✕
          </span>
          <span className="mc-text-red" style={{ fontSize: 'calc(8 * var(--u))', lineHeight: 1 }}>
            无法连接到服务器
          </span>
        </div>
      )}
    </div>
  );

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
      {tooltip ? (
        <MCTooltip content={tooltip} className="block">
          {row}
        </MCTooltip>
      ) : (
        row
      )}
    </motion.div>
  );
}

export default memo(ServerListItem);
