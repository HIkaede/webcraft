/**
 * 程序绘制像素图标（worlds.md / multiplayer.md §资产：零外部贴图）。
 * 16×16 canvas 放大显示（pixelated），列表图标统一 1u 黑色外框。
 */
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { hashSeed } from '@/stores/worlds';

/** mulberry32 确定性伪随机（种子 → 噪点纹理，保证同一世界图标恒定） */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function usePixelCanvas(draw: (ctx: CanvasRenderingContext2D) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) draw(ctx);
  }, [draw]);
  return ref;
}

const FRAME: CSSProperties = {
  border: 'calc(1 * var(--u)) solid #000000',
  boxSizing: 'border-box'
};

export interface PixelIconProps {
  /** 显示尺寸（u，默认 32 = 列表条目图标） */
  size?: number;
}

/**
 * 世界图标（worlds.md §条目结构）：由世界种子渲染的 16×16 草方块顶面纹理。
 * 底色 #7FBF54（同 favicon 规格），每像素亮度 0.78–1.18 噪点。
 */
export function WorldIcon({ seed, size = 32 }: PixelIconProps & { seed: string }) {
  const ref = usePixelCanvas((ctx) => {
    const rand = mulberry32(hashSeed(seed) ^ 0x9e3779b9);
    const img = ctx.createImageData(16, 16);
    for (let i = 0; i < 16 * 16; i++) {
      const f = 0.78 + rand() * 0.4;
      img.data[i * 4] = Math.min(255, Math.round(127 * f));
      img.data[i * 4 + 1] = Math.min(255, Math.round(191 * f));
      img.data[i * 4 + 2] = Math.min(255, Math.round(84 * f));
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
  return (
    <canvas
      ref={ref}
      width={16}
      height={16}
      className="pixelated block"
      style={{ width: `calc(${size} * var(--u))`, height: `calc(${size} * var(--u))`, ...FRAME }}
    />
  );
}

/** 无法连接的服务器图标（multiplayer.md §条目结构：`?` 占位） */
export function ServerUnknownIcon({ size = 32 }: PixelIconProps) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: `calc(${size} * var(--u))`,
        height: `calc(${size} * var(--u))`,
        background: '#141414',
        ...FRAME
      }}
    >
      <span className="mc-text-gray" style={{ fontSize: 'calc(8 * var(--u))' }}>
        ?
      </span>
    </div>
  );
}

/** 像素蛋糕（multiplayer.md §E Realms 提示屏，16×16 程序绘制） */
export function CakeIcon({ size = 16 }: PixelIconProps) {
  const ref = usePixelCanvas((ctx) => {
    // 侧面海绵
    ctx.fillStyle = '#D9B06A';
    ctx.fillRect(0, 5, 16, 9);
    // 侧面烤斑
    ctx.fillStyle = '#C89A50';
    const spots: [number, number][] = [
      [2, 8],
      [6, 11],
      [11, 9],
      [13, 12],
      [4, 12]
    ];
    for (const [x, y] of spots) ctx.fillRect(x, y, 2, 2);
    // 顶部奶油
    ctx.fillStyle = '#F4F4F4';
    ctx.fillRect(0, 0, 16, 5);
    // 奶油滴落
    ctx.fillRect(2, 5, 2, 2);
    ctx.fillRect(9, 5, 1, 1);
    ctx.fillRect(13, 5, 2, 2);
    // 红樱桃
    ctx.fillStyle = '#CC2222';
    ctx.fillRect(2, 1, 2, 2);
    ctx.fillRect(7, 1, 2, 2);
    ctx.fillRect(12, 1, 2, 2);
    // 底部深棕托盘
    ctx.fillStyle = '#7A4A22';
    ctx.fillRect(0, 14, 16, 2);
  });
  return (
    <canvas
      ref={ref}
      width={16}
      height={16}
      className="pixelated block"
      style={{ width: `calc(${size} * var(--u))`, height: `calc(${size} * var(--u))` }}
    />
  );
}
