/**
 * 第一人称手部视图（game.md §6.2，DOM 简化版）：
 * 右下角显示选中方块图标；挖掘/放置时挥动（rotation.x 0→-1.2→0 300ms），
 * 行走时摆动（|sin| 位移）。视角摇晃选项关闭时静止。
 */
import { useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/game';
import { useSettingsStore } from '@/stores/settings';
import type { Engine } from '@/game/engine/Engine';

export function HandView({ engine }: { engine: Engine | null }) {
  const selected = useGameStore((s) => s.selectedSlot);
  const hotbar = useGameStore((s) => s.hotbar);
  const overlay = useGameStore((s) => s.overlay);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const swingRef = useRef(0); // 0..1 挥动进度
  const swingingRef = useRef(false);
  const walkRef = useRef(0);
  const lastPos = useRef<[number, number, number] | null>(null);

  // 图标
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !engine) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    const stack = hotbar[selected];
    if (stack) ctx.drawImage(engine.getIconCanvas(stack.id), 0, 0, c.width, c.height);
  }, [engine, hotbar, selected]);

  // 挥动 + 行走摆动动画循环
  useEffect(() => {
    if (!engine) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const el = wrapRef.current;
      if (!el) return;
      const viewBobbing = useSettingsStore.getState().viewBobbing;

      // 挖掘/放置触发挥动
      if (engine.primaryDown || swingingRef.current) {
        swingingRef.current = true;
        swingRef.current += dt / 0.3;
        if (swingRef.current >= 1) {
          swingRef.current = 0;
          if (!engine.primaryDown) swingingRef.current = false;
        }
      }

      // 行走距离
      const pos = engine.getPlayerPos();
      if (lastPos.current) {
        const d = Math.hypot(pos[0] - lastPos.current[0], pos[2] - lastPos.current[2]);
        walkRef.current += d;
      }
      lastPos.current = pos;

      const swing = Math.sin(Math.min(swingRef.current, 1) * Math.PI);
      const bobY = viewBobbing ? Math.abs(Math.sin(walkRef.current * 4.7)) * 6 : 0;
      const bobX = viewBobbing ? Math.sin(walkRef.current * 9.4) * 3 : 0;
      el.style.transform = `translate(${bobX}px, ${bobY + swing * -24}px) rotate(${swing * -35}deg)`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  if (overlay === 'death') return null;
  const stack = hotbar[selected];

  return (
    <div
      className="pointer-events-none absolute bottom-0 right-0 z-20"
      style={{ width: 160, height: 160 }}
    >
      <div ref={wrapRef} style={{ transformOrigin: '80% 90%' }}>
        {stack && (
          <canvas
            ref={canvasRef}
            width={92}
            height={92}
            style={{
              width: 160,
              height: 160,
              imageRendering: 'pixelated',
              transform: 'scale(1.6) translate(10px, 24px)'
            }}
          />
        )}
      </div>
    </div>
  );
}
