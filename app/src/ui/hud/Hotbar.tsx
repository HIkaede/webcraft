/**
 * 快捷栏 HUD（game.md §6）：182×22u，9 槽 20×20u，选中槽白框，
 * 图标为引擎图集渲染的等轴测 2.5D 图标；生存模式显示数量角标。
 * 选中物品名在栏上方短暂浮现（原版行为）。
 */
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/stores/game';
import { blockInfo } from '@/game/engine/blocks';
import type { Engine } from '@/game/engine/Engine';

interface Props {
  engine: Engine | null;
}

export function Hotbar({ engine }: Props) {
  const hotbar = useGameStore((s) => s.hotbar);
  const selected = useGameStore((s) => s.selectedSlot);
  const mode = useGameStore((s) => s.mode);
  const overlay = useGameStore((s) => s.overlay);
  const [nameFlash, setNameFlash] = useState<string | null>(null);
  const flashTimer = useRef<number>(0);
  const prevSelected = useRef(selected);

  // 选中物品名浮现 1.5s
  useEffect(() => {
    if (prevSelected.current === selected) return;
    prevSelected.current = selected;
    const stack = hotbar[selected];
    if (stack) {
      setNameFlash(blockInfo(stack.id).name);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setNameFlash(null), 1500);
    }
  }, [selected, hotbar]);

  if (overlay === 'death') return null;

  return (
    <div
      className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center"
      style={{ marginBottom: 'calc(var(--u) * 2)' }}
    >
      {/* 选中物品名 */}
      <div
        className="transition-opacity duration-300 font-pixel text-white mc-text-shadow"
        style={{
          fontSize: 'calc(var(--u) * 8)',
          opacity: nameFlash ? 1 : 0,
          marginBottom: 'calc(var(--u) * 3)'
        }}
      >
        {nameFlash ?? ''}
      </div>
      {/* 栏体 */}
      <div
        className="relative flex"
        style={{
          width: 'calc(var(--u) * 182)',
          height: 'calc(var(--u) * 22)',
          background: 'rgba(0,0,0,0.45)',
          border: 'calc(var(--u) * 1) solid rgba(20,20,20,0.9)'
        }}
      >
        {hotbar.map((stack, i) => (
          <HotbarSlot
            key={i}
            engine={engine}
            stack={stack}
            selected={i === selected}
            showCount={mode !== 'creative'}
          />
        ))}
      </div>
    </div>
  );
}

function HotbarSlot({
  engine,
  stack,
  selected,
  showCount
}: {
  engine: Engine | null;
  stack: { id: number; count: number } | null;
  selected: boolean;
  showCount: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    if (stack && engine) {
      const icon = engine.getIconCanvas(stack.id);
      ctx.drawImage(icon, 0, 0, c.width, c.height);
    }
  }, [engine, stack]);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: 'calc(var(--u) * 20)',
        height: 'calc(var(--u) * 20)',
        margin: 'calc(var(--u) * 1) 0 0 calc(var(--u) * 1)',
        outline: selected ? 'calc(var(--u) * 1) solid #ffffff' : 'none',
        outlineOffset: 'calc(var(--u) * -1)',
        background: selected ? 'rgba(255,255,255,0.12)' : 'transparent'
      }}
    >
      <canvas
        ref={canvasRef}
        width={46}
        height={46}
        style={{
          width: 'calc(var(--u) * 16)',
          height: 'calc(var(--u) * 16)',
          imageRendering: 'pixelated'
        }}
      />
      {showCount && stack && stack.count > 1 && (
        <span
          className="absolute bottom-0 right-0 font-pixel text-white mc-text-shadow"
          style={{ fontSize: 'calc(var(--u) * 8)', lineHeight: 1 }}
        >
          {stack.count}
        </span>
      )}
    </div>
  );
}
