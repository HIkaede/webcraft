/**
 * Hotbar —— HUD 快捷栏（game.md §6.3，常驻 HUD，由引擎页挂载）。
 *
 * - 182×22u、9 槽（20×20u）：槽底 rgba(0,0,0,0.45)、槽框 1u rgba(255,255,255,0.35)；
 *   选中槽白框 2u rgba(255,255,255,0.95) 并外扩 1u。
 * - 数据全部来自 useGameStore（hotbar / selectedSlot / mode）；物品图标为 ItemIcon（16u 居中）。
 * - 数量角标仅生存模式显示（白字 + 硬阴影，>1 才显示，game.md §6.3）。
 * - 切换选中槽时新槽物品图标 scale 1.25→1 120ms；选中物品名显示于快捷栏上方 14u，
 *   opacity 0→1 150ms，1.2s 后 500ms 淡出。
 * - 物品栏/死亡覆盖层打开时隐藏（原版 HUD 行为；面板内自带快捷栏）。
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '@/stores/game';
import ItemIcon, { useGuiPx } from './ItemIcon';
import { getItemDef } from '@/game/items';

export default function Hotbar() {
  const hotbar = useGameStore((s) => s.hotbar);
  const selectedSlot = useGameStore((s) => s.selectedSlot);
  const mode = useGameStore((s) => s.mode);
  const overlay = useGameStore((s) => s.overlay);
  const u = useGuiPx();

  const selStack = hotbar[selectedSlot] ?? null;
  const selId = selStack?.id ?? 0;

  // 选中物品名：切换时淡入，1.2s 后淡出
  const [nameShown, setNameShown] = useState<string | null>(null);
  const [nameTick, setNameTick] = useState(0);
  useEffect(() => {
    const def = selId ? getItemDef(selId) : undefined;
    if (!def) {
      setNameShown(null);
      return;
    }
    setNameShown(def.name);
    setNameTick((t) => t + 1);
    const t = window.setTimeout(() => setNameShown(null), 1350);
    return () => window.clearTimeout(t);
  }, [selId, selectedSlot]);

  if (overlay === 'inventory' || overlay === 'death') return null;

  return (
    <div
      className="pointer-events-none absolute bottom-0 left-1/2 z-10 -translate-x-1/2"
      style={{ width: 'calc(182 * var(--u))', height: 'calc(22 * var(--u))' }}
    >
      {/* 选中物品名（快捷栏上方 14u，居中） */}
      <div
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
        style={{ bottom: 'calc(36 * var(--u))' }}
      >
        <AnimatePresence>
          {nameShown && (
            <motion.div
              key={nameTick}
              className="mc-text text-center"
              style={{ fontSize: 'calc(8 * var(--u))' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.5 } }}
              transition={{ duration: 0.15 }}
            >
              {nameShown}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 快捷栏主体 */}
      <div
        className="relative h-full w-full"
        style={{
          background: 'rgba(0,0,0,0.45)',
          border: 'calc(1 * var(--u)) solid rgba(255,255,255,0.35)',
          boxSizing: 'border-box'
        }}
      >
        {hotbar.map((stack, i) => (
          <div
            key={i}
            className="absolute flex items-center justify-center"
            style={{
              left: `calc(${1 + i * 20} * var(--u))`,
              top: 'calc(1 * var(--u))',
              width: 'calc(20 * var(--u))',
              height: 'calc(20 * var(--u))',
              borderLeft: i > 0 ? 'calc(1 * var(--u)) solid rgba(255,255,255,0.35)' : undefined
            }}
          >
            {stack && (
              <motion.span
                key={`${i}:${i === selectedSlot}`}
                initial={{ scale: i === selectedSlot ? 1.25 : 1 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.12 }}
                className="flex"
              >
                <ItemIcon blockId={stack.id} size={16 * u} />
              </motion.span>
            )}
            {stack && mode !== 'creative' && stack.count > 1 && (
              <span
                className="mc-text absolute"
                style={{
                  right: 'calc(1 * var(--u))',
                  bottom: 0,
                  fontSize: 'calc(8 * var(--u))',
                  lineHeight: 1,
                  zIndex: 3
                }}
              >
                {stack.count}
              </span>
            )}
          </div>
        ))}
        {/* 选中槽白框（2u，外扩 1u，瞬时移动无过渡） */}
        <div
          className="pointer-events-none absolute"
          style={{
            left: `calc(${1 + selectedSlot * 20 - 2} * var(--u))`,
            top: 'calc(-1 * var(--u))',
            width: 'calc(24 * var(--u))',
            height: 'calc(24 * var(--u))',
            border: 'calc(2 * var(--u)) solid rgba(255,255,255,0.95)',
            boxSizing: 'border-box'
          }}
        />
      </div>
    </div>
  );
}
