/**
 * 状态条（game.md §6）：红心 / 鸡腿 / 经验条（生存 & 极限显示，创造隐藏）。
 * 全部 canvas 像素绘制（9×9u 图标），半心/半鸡腿支持，受伤抖动。
 * 经验条 182×5u，等级数字绿色居中。
 */
import { useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/game';

/** 画一颗心（9×8 像素阵，type: full/half/empty） */
function drawHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  type: 'full' | 'half' | 'empty'
) {
  // 9×8 心形位图
  const MAP = [
    'XX.XX....'.replace(/\./g, '0').replace(/X/g, '1'),
    '111111110',
    '111111110',
    '111111110',
    '011111100',
    '001111000',
    '000110000',
    '000000000'
  ];
  const fill = (cx: number, cy: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + cx * s, y + cy * s, s, s);
  };
  for (let cy = 0; cy < 8; cy++)
    for (let cx = 0; cx < 9; cx++) {
      if (MAP[cy][cx] !== '1') continue;
      let color = '#3a3a3a'; // 空心底
      if (type === 'full') color = cy <= 1 ? '#ff6b6b' : '#e01e1e';
      else if (type === 'half') color = cx < 4 ? (cy <= 1 ? '#ff6b6b' : '#e01e1e') : '#3a3a3a';
      fill(cx, cy, color);
    }
}

/** 画鸡腿（9×9 像素，简化为骨棒形） */
function drawDrumstick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  type: 'full' | 'half' | 'empty'
) {
  const MAP = [
    '000111000',
    '001111100',
    '011111110',
    '001111100',
    '000110000',
    '000110000',
    '001101100',
    '011000110',
    '000000000'
  ];
  const fill = (cx: number, cy: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + cx * s, y + cy * s, s, s);
  };
  for (let cy = 0; cy < 9; cy++)
    for (let cx = 0; cx < 9; cx++) {
      if (MAP[cy][cx] !== '1') continue;
      let color = '#3a3a3a';
      if (type === 'full') color = cy <= 3 ? '#c98a4b' : '#8a5a28';
      else if (type === 'half') color = cx < 4 ? (cy <= 3 ? '#c98a4b' : '#8a5a28') : '#3a3a3a';
      fill(cx, cy, color);
    }
}

export function StatusBars() {
  const health = useGameStore((s) => s.health);
  const food = useGameStore((s) => s.food);
  const xp = useGameStore((s) => s.xp);
  const xpLevel = useGameStore((s) => s.xpLevel);
  const mode = useGameStore((s) => s.mode);
  const overlay = useGameStore((s) => s.overlay);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shakeRef = useRef(0);
  const prevHealth = useRef(health);

  // 受伤抖动
  useEffect(() => {
    if (health < prevHealth.current) shakeRef.current = 8;
    prevHealth.current = health;
  }, [health]);

  useEffect(() => {
    if (mode === 'creative') return;
    const c = canvasRef.current;
    if (!c) return;
    const u = Math.max(
      2,
      Math.round(
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 3
      )
    );
    const W = 182 * u;
    const H = 20 * u;
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;

    const shake = shakeRef.current > 0 ? (Math.random() - 0.5) * 2 * u : 0;
    if (shakeRef.current > 0) shakeRef.current--;

    // 心（左排，10 个，从右往左画半心逻辑）
    for (let i = 0; i < 10; i++) {
      const hp = health - i * 2;
      const type = hp >= 2 ? 'full' : hp === 1 ? 'half' : 'empty';
      drawHeart(ctx, i * 8 * u + shake, 0, u, type as 'full' | 'half' | 'empty');
    }
    // 鸡腿（右排）
    for (let i = 0; i < 10; i++) {
      const fp = food - i * 2;
      const type = fp >= 2 ? 'full' : fp === 1 ? 'half' : 'empty';
      drawDrumstick(ctx, W - (i + 1) * 8 * u - u + shake, 0, u, type as 'full' | 'half' | 'empty');
    }
    // 经验条
    const barY = 14 * u;
    ctx.fillStyle = '#202020';
    ctx.fillRect(u, barY, 180 * u, 3 * u);
    ctx.fillStyle = '#80ff20';
    ctx.fillRect(u, barY, Math.round(180 * u * Math.min(1, Math.max(0, xp))), 3 * u);
  });

  if (mode === 'creative' || overlay === 'death') return null;

  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{ bottom: 'calc(var(--u) * 26)', width: 'calc(var(--u) * 182)' }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: 'calc(var(--u) * 182)',
          height: 'calc(var(--u) * 20)',
          imageRendering: 'pixelated'
        }}
      />
      {xpLevel > 0 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 font-pixel"
          style={{
            top: 'calc(var(--u) * -8)',
            fontSize: 'calc(var(--u) * 8)',
            color: '#80ff20',
            textShadow: 'calc(var(--u) * 1) calc(var(--u) * 1) 0 #203800'
          }}
        >
          {xpLevel}
        </div>
      )}
    </div>
  );
}
