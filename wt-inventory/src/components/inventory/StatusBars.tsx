/**
 * StatusBars —— 红心 / 饥饿 / 经验条 HUD（game.md §6.4，由引擎页挂载为常驻 HUD）。
 *
 * - 红心 ×10 / 鸡腿 ×10：canvas 逐像素精灵绘制（9×9u/枚），空 / 半 / 满三态；
 *   受击整行抖动（x ±2px 随机，400ms），治疗白闪 200ms；
 *   生命 ≤4 持续脉冲 scale 1↔1.15（500ms），饥饿 ≤6 持续抖动（同受击参数）。
 * - 经验条 182×1.5u：底 #1C1C1C、框 1u #000、填充 #80FF20，xp 变化 width 200ms 补间；
 *   等级数字绿色居中于条上方 2u，升级时 scale 1.3→1 200ms。
 * - 数据来自 useGameStore（health/food/xp/xpLevel/mode）；创造模式隐藏；
 *   物品栏/死亡覆盖层打开时隐藏（原版 HUD 行为）。
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/stores/game';

const S = 3; // canvas 绘制倍率（9u 图标 → 27px 背存，CSS 侧按 --u 缩放）

/* 9×9 心形掩码（对称经典造型） */
const HEART_MASK = [
  '.XX...XX.',
  'XXXX.XXXX',
  'XXXXXXXXX',
  'XXXXXXXXX',
  '.XXXXXXX.',
  '..XXXXX..',
  '...XXX...',
  '....X....',
  '.........'
];

/* 9×9 鸡腿掩码（M=肉，B=骨） */
const FOOD_MASK = [
  '...MMM...',
  '..MMMMM..',
  '..MMMMM..',
  '..MMMMM..',
  '..MMM....',
  '.BB.B....',
  'BB..B....',
  'BB.......',
  'B........'
];

type IconKind = 'container' | 'full' | 'flash';

/** 绘制一枚 9×9 图标（half = 只画左半 x≤4，边缘自动压暗） */
function drawIcon(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  mask: string[],
  kind: IconKind,
  half: boolean,
  foodStyle: boolean
) {
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const ch = mask[y][x];
      if (ch === '.') continue;
      if (half && x > 4) continue;
      const below = y + 1 < 9 && mask[y + 1][x] !== '.';
      const right = x + 1 < 9 && mask[y][x + 1] !== '.' && (!half || x + 1 <= 4);
      const edge = !below || !right;
      let c: string;
      if (kind === 'container') {
        c = edge ? (foodStyle ? '#0E0C08' : '#101010') : foodStyle ? '#1E1A14' : '#262626';
        if (!foodStyle && !edge && ((x === 1 && y === 1) || (x === 2 && y === 1))) c = '#4A4A4A';
      } else if (kind === 'flash') {
        c = edge ? '#C8C8C8' : '#FFFFFF';
      } else {
        // full
        if (foodStyle) {
          if (ch === 'M') {
            const topEdge = y === 0 || mask[y - 1][x] === '.';
            c = edge ? '#6B3E0C' : topEdge ? '#D89E4A' : '#B87818';
          } else {
            c = edge ? '#A9A08C' : '#E3DCC8';
          }
        } else {
          c = edge ? '#8F1009' : '#E0231E';
          if (!edge && ((x === 1 && y === 1) || (x === 2 && y === 1) || (x === 1 && y === 2)))
            c = '#FFFFFF';
        }
      }
      ctx.fillStyle = c;
      ctx.fillRect((ox + x) * S, (oy + y) * S, S, S);
    }
  }
}

export default function StatusBars() {
  const health = useGameStore((s) => s.health);
  const food = useGameStore((s) => s.food);
  const xp = useGameStore((s) => s.xp);
  const xpLevel = useGameStore((s) => s.xpLevel);
  const mode = useGameStore((s) => s.mode);
  const overlay = useGameStore((s) => s.overlay);

  const heartsRef = useRef<HTMLCanvasElement>(null);
  const foodRef = useRef<HTMLCanvasElement>(null);
  const [shakeTick, setShakeTick] = useState(0);
  const [flash, setFlash] = useState(false);
  const prevHealth = useRef(health);

  // 受击 → 抖动；回复 → 白闪 200ms
  useEffect(() => {
    const p = prevHealth.current;
    prevHealth.current = health;
    if (health < p) {
      setShakeTick((t) => t + 1);
    } else if (health > p) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 200);
      return () => window.clearTimeout(t);
    }
  }, [health]);

  // 红心行绘制（空/半/满 + 白闪）
  useEffect(() => {
    const canvas = heartsRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 10; i++) {
      const v = health - i * 2;
      drawIcon(ctx, i * 9, 0, HEART_MASK, 'container', false, false);
      if (v >= 2) drawIcon(ctx, i * 9, 0, HEART_MASK, flash ? 'flash' : 'full', false, false);
      else if (v === 1) drawIcon(ctx, i * 9, 0, HEART_MASK, flash ? 'flash' : 'full', true, false);
    }
  }, [health, flash]);

  // 饥饿行绘制（自右向左填充）
  useEffect(() => {
    const canvas = foodRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 10; i++) {
      const v = food - i * 2;
      const ox = (9 - i) * 9;
      drawIcon(ctx, ox, 0, FOOD_MASK, 'container', false, true);
      if (v >= 2) drawIcon(ctx, ox, 0, FOOD_MASK, 'full', false, true);
      else if (v === 1) drawIcon(ctx, ox, 0, FOOD_MASK, 'full', true, true);
    }
  }, [food]);

  if (mode === 'creative' || overlay === 'inventory' || overlay === 'death') return null;

  const lowHealth = health > 0 && health <= 4;
  const lowFood = food <= 6;

  return (
    <div
      className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2"
      style={{
        bottom: 'calc(22 * var(--u))',
        width: 'calc(182 * var(--u))',
        height: 'calc(24.5 * var(--u))'
      }}
    >
      {/* 红心（左） / 鸡腿（右） */}
      <motion.div
        key={shakeTick}
        initial={false}
        animate={shakeTick > 0 ? { x: [0, -2, 2, -2, 1, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="absolute left-0 top-0"
      >
        <motion.div
          animate={lowHealth ? { scale: [1, 1.15, 1] } : { scale: 1 }}
          transition={lowHealth ? { duration: 0.5, repeat: Infinity } : { duration: 0.1 }}
          style={{ transformOrigin: 'left bottom' }}
        >
          <canvas
            ref={heartsRef}
            width={90 * S}
            height={9 * S}
            className="pixelated"
            style={{ width: 'calc(90 * var(--u))', height: 'calc(9 * var(--u))' }}
          />
        </motion.div>
      </motion.div>
      <motion.div
        className="absolute right-0 top-0"
        animate={lowFood ? { x: [0, -2, 2, -2, 1, 0] } : { x: 0 }}
        transition={lowFood ? { duration: 0.4, repeat: Infinity } : { duration: 0.1 }}
      >
        <canvas
          ref={foodRef}
          width={90 * S}
          height={9 * S}
          className="pixelated"
          style={{ width: 'calc(90 * var(--u))', height: 'calc(9 * var(--u))' }}
        />
      </motion.div>

      {/* 等级数字（绿色，居中于经验条上方 2u） */}
      {xpLevel > 0 && (
        <motion.div
          key={xpLevel}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2 }}
          className="mc-text-xp absolute left-1/2 -translate-x-1/2"
          style={{ bottom: 'calc(5.5 * var(--u))', fontSize: 'calc(8 * var(--u))', lineHeight: 1 }}
        >
          {xpLevel}
        </motion.div>
      )}

      {/* 经验条（182×1.5u，紧贴快捷栏上缘） */}
      <div
        className="absolute bottom-0 left-0"
        style={{
          width: 'calc(182 * var(--u))',
          height: 'calc(3.5 * var(--u))',
          border: 'calc(1 * var(--u)) solid #000000',
          background: '#1C1C1C',
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.max(0, Math.min(1, xp)) * 100}%`,
            background: 'var(--mc-xp-green)',
            transition: 'width 0.2s linear'
          }}
        />
      </div>
    </div>
  );
}
