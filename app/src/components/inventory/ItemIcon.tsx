/**
 * ItemIcon —— 方块等轴测 2.5D 物品图标（design.md §9 / game.md §3「手持/物品栏图标」）。
 *
 * - 内置微型纹理生成器：按 game.md §3 程序纹理配方绘制 16×16 逐像素面纹理
 *  （噪点 / 裙边 / 年轮 / 矿点 / 砖缝 / 镂空树叶 / 玻璃高光…，确定性 hash 随机）。
 * - 立方体方块渲染顶+左+右三面等轴测图标（左面 ×0.8、右面 ×0.62 压暗，原版观感）；
 *   火把/花/草丛/水用平面贴图直绘（game.md §3）。
 * - 渲染结果按 blockId 缓存到 canvas（128×128 内部精度，4px/texel 整数倍无混叠）。
 * - 组件以 `image-rendering: pixelated` 显示，size 默认 32px。
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { BlockId } from '@/game/engine-contract';
import { resolveGuiScale, useSettingsStore } from '@/stores/settings';

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

type RGB = [number, number, number];
type PxSet = (x: number, y: number, color: string | RGB | null) => void;
type PxSetA = (x: number, y: number, color: string, alpha: number) => void;
type Rnd = (x: number, y: number, salt?: number) => number;

interface PaintTools {
  set: PxSet;
  setA: PxSetA;
  rnd: Rnd;
}
type FacePaint = (t: PaintTools) => void;

const FACE = 16;

/** 确定性 per-pixel 伪随机（0..1，lowbias32 混合），同一 (x,y,salt,seed) 恒定 */
function makeRnd(seed: number): Rnd {
  return (x, y, salt = 0) => {
    let h =
      (Math.imul(x, 0x9e3779b1) ^
        Math.imul(y, 0x85ebca77) ^
        Math.imul(seed, 0xc2b2ae3d) ^
        Math.imul(salt, 0x27d4eb2f)) |
      0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
}

function hexRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 颜色按系数 f 明暗缩放 */
function shade(hex: string, f: number): RGB {
  const [r, g, b] = hexRgb(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return [c(r), c(g), c(b)];
}

/** 整面基色 + 逐像素噪点（amp 为全幅，±amp/2） */
function fillNoise(set: PxSet, rnd: Rnd, base: string, amp: number): void {
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) set(x, y, shade(base, 1 + (rnd(x, y) - 0.5) * amp));
}

/* ------------------------------------------------------------------ *
 * 逐方块纹理配方（game.md §3）
 * ------------------------------------------------------------------ */

const dirtPaint: FacePaint = (t) => {
  fillNoise(t.set, t.rnd, '#866043', 0.36);
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++)
      if (t.rnd(x >> 1, y >> 1, 7) < 0.08)
        t.set(x, y, shade('#6B4632', 1 + (t.rnd(x, y, 8) - 0.5) * 0.2));
};

const grassTopPaint: FacePaint = (t) => {
  fillNoise(t.set, t.rnd, '#7FBF54', 0.28);
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++)
      if (t.rnd(x, y, 3) < 0.06) t.set(x, y, shade('#5E9E3C', 1 + (t.rnd(x, y, 4) - 0.5) * 0.2));
};

const grassSidePaint: FacePaint = (t) => {
  dirtPaint(t);
  for (let x = 0; x < FACE; x++) {
    const depth = 3 + Math.floor(t.rnd(x, 0, 11) * 3); // 顶部 3–5px 绿色裙边
    for (let y = 0; y < depth; y++)
      t.set(x, y, shade('#7FBF54', 1 + (t.rnd(x, y, 12) - 0.5) * 0.28));
  }
};

const stonePaint: FacePaint = (t) => fillNoise(t.set, t.rnd, '#7D7D7D', 0.2);

const cobblePaint: FacePaint = (t) => {
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) {
      if (x % 4 === 0 || y % 4 === 0) {
        t.set(x, y, shade('#5A5A5A', 1 + (t.rnd(x, y, 21) - 0.5) * 0.2));
        continue;
      }
      const cell = (x >> 2) + (y >> 2) * 4;
      const base = t.rnd(cell, 0, 22) < 0.5 ? '#6E6E6E' : '#8F8F8F';
      t.set(x, y, shade(base, 1 + (t.rnd(x, y, 23) - 0.5) * 0.24));
    }
};

const sandPaint: FacePaint = (t) => fillNoise(t.set, t.rnd, '#DBD3A0', 0.2);

const sandstoneSidePaint: FacePaint = (t) => {
  sandPaint(t);
  for (let x = 0; x < FACE; x++) {
    for (const y of [0, 1, 14, 15])
      t.set(x, y, shade('#C7BC85', 1 + (t.rnd(x, y, 31) - 0.5) * 0.1));
    for (const y of [5, 10]) t.set(x, y, shade('#D0C492', 1 + (t.rnd(x, y, 32) - 0.5) * 0.08));
  }
};

const sandstoneTopPaint: FacePaint = (t) => {
  sandPaint(t);
  for (let i = 0; i < FACE; i++)
    for (const [x, y] of [
      [i, 0],
      [i, 1],
      [i, 14],
      [i, 15],
      [0, i],
      [1, i],
      [14, i],
      [15, i]
    ] as const)
      t.set(x, y, shade('#C7BC85', 1 + (t.rnd(x, y, 33) - 0.5) * 0.1));
};

const gravelPaint: FacePaint = (t) => {
  fillNoise(t.set, t.rnd, '#8A7F74', 0.44);
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) {
      const r = t.rnd(x, y, 41);
      if (r < 0.15) t.set(x, y, '#6E655C');
      else if (r > 0.85) t.set(x, y, '#9C9184');
    }
};

const oakLogSidePaint: FacePaint = (t) => {
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) {
      const stripe = t.rnd(x, 0, 51) < 0.4 ? 0.82 : 1;
      t.set(x, y, shade('#6B5230', stripe * (1 + (t.rnd(x, y, 52) - 0.5) * 0.2)));
    }
};

const birchLogSidePaint: FacePaint = (t) => {
  fillNoise(t.set, t.rnd, '#D8D8C8', 0.16);
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE - 1; x++)
      if (t.rnd(x >> 1, y, 55) < 0.06) {
        t.set(x, y, '#222222');
        t.set(x + 1, y, '#222222');
      }
};

/** 原木顶/底：树皮边 + 同心方环年轮 */
const logTopPaint =
  (bark: string, ringA: string, ringB: string): FacePaint =>
  (t) => {
    for (let y = 0; y < FACE; y++)
      for (let x = 0; x < FACE; x++) {
        if (x === 0 || y === 0 || x === FACE - 1 || y === FACE - 1) {
          t.set(x, y, shade(bark, 1 + (t.rnd(x, y, 53) - 0.5) * 0.2));
          continue;
        }
        const r = Math.floor(Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)));
        t.set(x, y, shade(r % 2 === 0 ? ringA : ringB, 1 + (t.rnd(x, y, 54) - 0.5) * 0.15));
      }
  };
const oakLogTopPaint = logTopPaint('#5A4227', '#9C8050', '#6B5230');
const birchLogTopPaint = logTopPaint('#B8B8A8', '#D8D8C8', '#A8A890');

/** 树叶：12% 像素透明镂空 + 大噪点 */
const leavesPaint =
  (base: string): FacePaint =>
  (t) => {
    for (let y = 0; y < FACE; y++)
      for (let x = 0; x < FACE; x++) {
        if (t.rnd(x, y, 61) < 0.12) {
          t.set(x, y, null);
          continue;
        }
        t.set(x, y, shade(base, 1 + (t.rnd(x, y, 62) - 0.5) * 0.5));
      }
  };
const oakLeavesPaint = leavesPaint('#3E8F35');
const birchLeavesPaint = leavesPaint('#5CA93F');

const planksPaint: FacePaint = (t) => {
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) {
      if (y % 4 === 3) {
        t.set(x, y, shade('#6E5836', 1 + (t.rnd(x, y, 63) - 0.5) * 0.1));
        continue;
      }
      t.set(x, y, shade('#9C8050', 1 + (t.rnd(x, y, 64) - 0.5) * 0.16));
    }
  for (const y of [0, 4, 8, 12]) {
    t.set(7, y, '#6E5836'); // 板端钉点
    t.set(15, y, '#6E5836');
  }
};

const glassPaint: FacePaint = (t) => {
  for (let i = 0; i < FACE; i++) {
    t.setA(i, 0, '#DCE8EC', 0.9);
    t.setA(i, FACE - 1, '#DCE8EC', 0.9);
    t.setA(0, i, '#DCE8EC', 0.9);
    t.setA(FACE - 1, i, '#DCE8EC', 0.9);
  }
  // 左上→右下 45° 两道高光条纹
  for (let x = 0; x < FACE; x++) {
    const y1 = x - 3;
    const y2 = x - 10;
    if (y1 >= 0) t.setA(x, y1, '#FFFFFF', 0.55);
    if (y1 - 1 >= 0 && x < 9) t.setA(x, y1 - 1, '#FFFFFF', 0.3);
    if (y2 >= 0) t.setA(x, y2, '#FFFFFF', 0.45);
  }
};

const stoneBricksPaint: FacePaint = (t) => {
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) {
      if (x % 8 === 0 || y % 8 === 0) {
        t.set(x, y, shade('#4F4F4F', 1 + (t.rnd(x, y, 71) - 0.5) * 0.1));
        continue;
      }
      t.set(x, y, shade('#767676', 1 + (t.rnd(x, y, 72) - 0.5) * 0.16));
    }
  // 随机一块砖带斜裂纹
  const cx = 1 + Math.floor(t.rnd(0, 0, 73) * 2) * 8;
  const cy = 1 + Math.floor(t.rnd(0, 1, 74) * 2) * 8;
  for (let i = 0; i < 5; i++) t.set(Math.min(14, cx + i), Math.min(14, cy + i), '#4A4A4A');
};

const bricksPaint: FacePaint = (t) => {
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) {
      const band = y >> 2;
      const off = (band % 2) * 4; // 错缝排列
      if (y % 4 === 3 || (x + off) % 8 === 7)
        t.set(x, y, shade('#BCA392', 1 + (t.rnd(x, y, 75) - 0.5) * 0.12));
      else t.set(x, y, shade('#96543F', 1 + (t.rnd(x, y, 76) - 0.5) * 0.2));
    }
};

const bedrockPaint: FacePaint = (t) => {
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) {
      const blotch = t.rnd(x >> 1, y >> 1, 77);
      const base = blotch < 0.35 ? '#3A3A3A' : blotch < 0.7 ? '#565656' : '#707070';
      t.set(x, y, shade(base, 1 + (t.rnd(x, y, 78) - 0.5) * 0.4));
    }
};

/** 矿石：石头底 + 5 簇 2×2 矿点 */
const orePaint =
  (mineral: string, hi?: string): FacePaint =>
  (t) => {
    stonePaint(t);
    for (let k = 0; k < 5; k++) {
      const cx = 1 + Math.floor(t.rnd(k, 0, 81) * 13);
      const cy = 1 + Math.floor(t.rnd(k, 1, 82) * 13);
      t.set(cx, cy, mineral);
      if (cx + 1 < FACE) t.set(cx + 1, cy, mineral);
      if (cy + 1 < FACE) t.set(cx, cy + 1, mineral);
      if (cx + 1 < FACE && cy + 1 < FACE) t.set(cx + 1, cy + 1, hi ?? mineral);
      if (t.rnd(k, 2, 83) < 0.5) t.set(t.rnd(k, 3, 84) < 0.5 ? cx - 1 : cx + 2, cy, mineral);
    }
  };

const craftingTopPaint: FacePaint = (t) => {
  planksPaint(t);
  for (let i = 0; i < FACE; i++) {
    for (const g of [3, 7, 11]) {
      t.set(g, i, '#6E5836');
      t.set(i, g, '#6E5836');
    }
    for (const [x, y] of [
      [i, 0],
      [i, 15],
      [0, i],
      [15, i]
    ] as const)
      t.set(x, y, shade('#5A4630', 1 + (t.rnd(x, y, 91) - 0.5) * 0.1));
  }
};

const craftingSidePaint: FacePaint = (t) => {
  planksPaint(t);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < FACE; x++)
      t.set(x, y, shade('#8A6E42', 1 + (t.rnd(x, y, 92) - 0.5) * 0.16));
  for (let y = 1; y < 3; y++) {
    for (let x = 3; x < 6; x++) t.set(x, y, '#6E5836');
    for (let x = 10; x < 13; x++) t.set(x, y, '#6E5836');
  }
};

const furnaceFrontPaint: FacePaint = (t) => {
  cobblePaint(t);
  for (let x = 0; x < FACE; x++)
    for (const y of [0, 1, 14, 15])
      t.set(x, y, shade('#9A9A9A', 1 + (t.rnd(x, y, 93) - 0.5) * 0.1));
  for (let y = 5; y <= 12; y++)
    for (let x = 4; x <= 11; x++) {
      if (y === 5 || y === 12 || x === 4 || x === 11) t.set(x, y, '#3A3A3A');
      else t.set(x, y, '#141414'); // 中央 6×6 熄火洞口
    }
};

const torchPaint: FacePaint = (t) => {
  for (let y = 6; y < FACE; y++) {
    t.set(7, y, '#8A6A3B');
    t.set(8, y, '#6E5330');
  }
  for (let y = 3; y < 6; y++) for (let x = 6; x < 10; x++) t.set(x, y, '#FFB43C');
  t.set(7, 3, '#FFF6C8');
  t.set(8, 3, '#FFF6C8');
  t.set(7, 4, '#FFD84D');
  t.set(8, 4, '#FFD84D');
};

const glowstonePaint: FacePaint = (t) => {
  fillNoise(t.set, t.rnd, '#F4D35E', 0.4);
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) {
      const r = t.rnd(x >> 1, y >> 1, 101);
      if (r < 0.3) t.set(x, y, shade('#FFF3B0', 1 + (t.rnd(x, y, 102) - 0.5) * 0.1));
      else if (r > 0.85) t.set(x, y, '#D8A832');
    }
};

const obsidianPaint: FacePaint = (t) => {
  fillNoise(t.set, t.rnd, '#14101F', 0.6);
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) if (t.rnd(x, y, 103) < 0.03) t.set(x, y, '#5B2E8C');
};

const GLYPH_T = ['XXX', '.X.', '.X.', '.X.'];
const GLYPH_N = ['X..X', 'XX.X', 'X.XX', 'X..X'];

const tntSidePaint: FacePaint = (t) => {
  fillNoise(t.set, t.rnd, '#C33A2A', 0.16);
  for (let y = 6; y < 10; y++) for (let x = 0; x < FACE; x++) t.set(x, y, '#1E1E1E');
  const drawGlyph = (rows: string[], ox: number) => {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < rows[y].length; x++)
        if (rows[y][x] === 'X') t.set(ox + x, 6 + y, '#E8E8E8');
  };
  drawGlyph(GLYPH_T, 2);
  drawGlyph(GLYPH_N, 6);
  drawGlyph(GLYPH_T, 11);
};

const tntTopPaint: FacePaint = (t) => {
  fillNoise(t.set, t.rnd, '#C33A2A', 0.16);
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) {
      const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (Math.floor(r) === 5) t.set(x, y, shade('#8A2A1E', 1 + (t.rnd(x, y, 104) - 0.5) * 0.1));
      if (r < 2.5) t.set(x, y, shade('#D84A38', 1 + (t.rnd(x, y, 105) - 0.5) * 0.1));
    }
};

const woolPaint =
  (base: string): FacePaint =>
  (t) => {
    for (let y = 0; y < FACE; y++)
      for (let x = 0; x < FACE; x++) {
        const weave = (x + y) % 2 === 0 ? 1.05 : 0.95; // 斜向编织纹
        t.set(x, y, shade(base, weave * (1 + (t.rnd(x, y, 106) - 0.5) * 0.12)));
      }
  };

const waterPaint: FacePaint = (t) => {
  fillNoise(t.set, t.rnd, '#3F76E4', 0.12);
  for (let x = 0; x < FACE; x++)
    for (const y of [4, 5, 11, 12])
      if (t.rnd(x, y, 107) < 0.6) t.set(x, y, shade('#5C8FF0', 1 + (t.rnd(x, y, 108) - 0.5) * 0.1));
};

const cactusSidePaint: FacePaint = (t) => {
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) {
      let f = 1;
      if (x === 0 || x === FACE - 1) f = 0.75;
      else if (x % 4 === 3) f = 0.85;
      t.set(x, y, shade('#58822D', f * (1 + (t.rnd(x, y, 111) - 0.5) * 0.15)));
    }
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) if (t.rnd(x, y, 112) < 0.05) t.set(x, y, '#A8D06E');
};

const cactusTopPaint: FacePaint = (t) => {
  for (let y = 0; y < FACE; y++)
    for (let x = 0; x < FACE; x++) {
      const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      let c = '#58822D';
      if (Math.floor(r) === 6) c = '#466B22';
      if (r < 1.5) c = '#6FA03C';
      t.set(x, y, shade(c, 1 + (t.rnd(x, y, 113) - 0.5) * 0.15));
    }
};

const dandelionPaint: FacePaint = (t) => {
  for (let y = 8; y < FACE; y++) t.set(7, y, shade('#3E7A2B', 1 + (t.rnd(7, y, 121) - 0.5) * 0.2));
  t.set(6, 11, '#3E7A2B');
  t.set(8, 13, '#3E7A2B');
  for (let y = 2; y < 7; y++)
    for (let x = 5; x < 10; x++) {
      if (Math.abs(x - 7) + Math.abs(y - 4) > 3) continue;
      t.set(x, y, t.rnd(x, y, 122) < 0.75 ? '#FCEE4B' : '#E8C832');
    }
  t.set(7, 4, '#D8B828');
};

const poppyPaint: FacePaint = (t) => {
  for (let y = 8; y < FACE; y++) t.set(7, y, shade('#3E7A2B', 1 + (t.rnd(7, y, 121) - 0.5) * 0.2));
  t.set(6, 12, '#3E7A2B');
  t.set(8, 10, '#3E7A2B');
  for (let y = 2; y < 7; y++)
    for (let x = 5; x < 11; x++) {
      if (Math.abs(x - 7.5) + Math.abs(y - 4) > 3.5) continue;
      t.set(x, y, t.rnd(x, y, 123) < 0.7 ? '#C0271C' : '#A01A12');
    }
  t.set(7, 4, '#2E0A06');
  t.set(8, 4, '#2E0A06');
};

const tallGrassPaint: FacePaint = (t) => {
  for (const bx of [2, 4, 6, 8, 10, 12, 14]) {
    const h = 5 + Math.floor(t.rnd(bx, 0, 124) * 10);
    const lean = t.rnd(bx, 1, 125) < 0.5 ? 0 : 1;
    for (let y = FACE - h; y < FACE; y++) {
      const x = bx + (lean && y < 12 ? 1 : 0);
      t.set(x, y, shade('#5E9E3C', 1 + (t.rnd(x, y, 126) - 0.5) * 0.3));
    }
    const h2 = Math.max(3, h - 4);
    for (let y = FACE - h2; y < FACE; y++)
      t.set(bx + 1, y, shade('#4A7A2B', 1 + (t.rnd(bx + 1, y, 127) - 0.5) * 0.3));
  }
};

/* ------------------------------------------------------------------ *
 * 面组装表：top / side / front（缺省 front=side）；flat = 平面直绘
 * ------------------------------------------------------------------ */

interface BlockFaces {
  top: FacePaint;
  side: FacePaint;
  front?: FacePaint;
  flat?: boolean;
}

const same = (p: FacePaint): BlockFaces => ({ top: p, side: p });

const FACES: Record<number, BlockFaces> = {
  [BlockId.GRASS_BLOCK]: { top: grassTopPaint, side: grassSidePaint },
  [BlockId.DIRT]: same(dirtPaint),
  [BlockId.STONE]: same(stonePaint),
  [BlockId.COBBLESTONE]: same(cobblePaint),
  [BlockId.SAND]: same(sandPaint),
  [BlockId.SANDSTONE]: { top: sandstoneTopPaint, side: sandstoneSidePaint },
  [BlockId.GRAVEL]: same(gravelPaint),
  [BlockId.OAK_LOG]: { top: oakLogTopPaint, side: oakLogSidePaint },
  [BlockId.BIRCH_LOG]: { top: birchLogTopPaint, side: birchLogSidePaint },
  [BlockId.OAK_LEAVES]: same(oakLeavesPaint),
  [BlockId.BIRCH_LEAVES]: same(birchLeavesPaint),
  [BlockId.OAK_PLANKS]: same(planksPaint),
  [BlockId.GLASS]: same(glassPaint),
  [BlockId.STONE_BRICKS]: same(stoneBricksPaint),
  [BlockId.BRICKS]: same(bricksPaint),
  [BlockId.BEDROCK]: same(bedrockPaint),
  [BlockId.COAL_ORE]: same(orePaint('#2B2B2B')),
  [BlockId.IRON_ORE]: same(orePaint('#D8AF93')),
  [BlockId.GOLD_ORE]: same(orePaint('#FCEE4B')),
  [BlockId.DIAMOND_ORE]: same(orePaint('#5DF5E3', '#BFFFF5')),
  [BlockId.CRAFTING_TABLE]: { top: craftingTopPaint, side: craftingSidePaint },
  [BlockId.FURNACE]: { top: cobblePaint, side: cobblePaint, front: furnaceFrontPaint },
  [BlockId.TORCH]: { top: torchPaint, side: torchPaint, flat: true },
  [BlockId.GLOWSTONE]: same(glowstonePaint),
  [BlockId.OBSIDIAN]: same(obsidianPaint),
  [BlockId.TNT]: { top: tntTopPaint, side: tntSidePaint },
  [BlockId.WOOL_WHITE]: same(woolPaint('#E9ECEC')),
  [BlockId.WOOL_GRAY]: same(woolPaint('#3E4447')),
  [BlockId.WOOL_BLACK]: same(woolPaint('#141414')),
  [BlockId.WOOL_RED]: same(woolPaint('#A02722')),
  [BlockId.WOOL_ORANGE]: same(woolPaint('#F07613')),
  [BlockId.WOOL_YELLOW]: same(woolPaint('#F8C627')),
  [BlockId.WOOL_GREEN]: same(woolPaint('#5E7C16')),
  [BlockId.WOOL_BLUE]: same(woolPaint('#35399D')),
  [BlockId.CACTUS]: { top: cactusTopPaint, side: cactusSidePaint },
  [BlockId.DANDELION]: { top: dandelionPaint, side: dandelionPaint, flat: true },
  [BlockId.POPPY]: { top: poppyPaint, side: poppyPaint, flat: true },
  [BlockId.TALL_GRASS]: { top: tallGrassPaint, side: tallGrassPaint, flat: true },
  [BlockId.WATER]: { top: waterPaint, side: waterPaint, flat: true }
};

/* ------------------------------------------------------------------ *
 * 纹理 / 图标缓存
 * ------------------------------------------------------------------ */

function makeFaceCanvas(paint: FacePaint, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FACE;
  canvas.height = FACE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(FACE, FACE);
  // 默认全透明（植物/玻璃/火把依赖）
  const set: PxSet = (x, y, color) => {
    if (x < 0 || x >= FACE || y < 0 || y >= FACE) return;
    const i = (y * FACE + x) * 4;
    if (color === null) {
      img.data[i + 3] = 0;
      return;
    }
    const [r, g, b] = typeof color === 'string' ? hexRgb(color) : color;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  };
  const setA: PxSetA = (x, y, color, alpha) => {
    if (x < 0 || x >= FACE || y < 0 || y >= FACE) return;
    const i = (y * FACE + x) * 4;
    const [r, g, b] = hexRgb(color);
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = Math.round(alpha * 255);
  };
  paint({ set, setA, rnd: makeRnd(seed) });
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const faceCache = new Map<string, HTMLCanvasElement>();

type FaceKind = 'top' | 'side' | 'front';

function getFaceCanvas(blockId: number, kind: FaceKind): HTMLCanvasElement | null {
  const key = `${blockId}:${kind}`;
  let canvas = faceCache.get(key);
  if (canvas) return canvas;
  const faces = FACES[blockId];
  if (!faces) return null;
  const paint =
    kind === 'top' ? faces.top : kind === 'front' ? (faces.front ?? faces.side) : faces.side;
  canvas = makeFaceCanvas(paint, blockId * 31 + (kind === 'top' ? 1 : kind === 'front' ? 3 : 2));
  faceCache.set(key, canvas);
  return canvas;
}

/** 面压暗副本（等轴测图标光照：顶 1.0 / 左 0.8 / 右 0.62） */
function shadedFace(face: HTMLCanvasElement, darken: number): HTMLCanvasElement {
  if (darken <= 0) return face;
  const canvas = document.createElement('canvas');
  canvas.width = FACE;
  canvas.height = FACE;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(face, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(0,0,0,${darken})`;
  ctx.fillRect(0, 0, FACE, FACE);
  return canvas;
}

const ICON_RES = 128; // 32 逻辑 px × 4（整数倍，无混叠）
const iconCache = new Map<number, HTMLCanvasElement>();

/** 取某 blockId 的等轴测 2.5D 图标画布（128×128，按 blockId 缓存；未知/AIR 返回空画布） */
export function getIconCanvas(blockId: number): HTMLCanvasElement {
  let icon = iconCache.get(blockId);
  if (icon) return icon;
  icon = document.createElement('canvas');
  icon.width = ICON_RES;
  icon.height = ICON_RES;
  const faces = FACES[blockId];
  if (faces) {
    const ctx = icon.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const S = ICON_RES / 32; // 4 px / texel
    if (faces.flat) {
      const face = getFaceCanvas(blockId, 'side');
      if (face) ctx.drawImage(face, 0, 0, ICON_RES, ICON_RES);
    } else {
      // 顶面（菱形：(0,8S)-(16S,0)-(32S,8S)-(16S,16S)）
      const top = getFaceCanvas(blockId, 'top');
      if (top) {
        ctx.setTransform(S, -S / 2, S, S / 2, 0, 8 * S);
        ctx.drawImage(top, 0, 0);
      }
      // 左面（front，×0.8）
      const front = getFaceCanvas(blockId, 'front');
      if (front) {
        ctx.setTransform(S, S / 2, 0, S, 0, 8 * S);
        ctx.drawImage(shadedFace(front, 0.2), 0, 0);
      }
      // 右面（side，×0.62）
      const side = getFaceCanvas(blockId, 'side');
      if (side) {
        ctx.setTransform(S, -S / 2, 0, S, 16 * S, 16 * S);
        ctx.drawImage(shadedFace(side, 0.38), 0, 0);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  iconCache.set(blockId, icon);
  return icon;
}

/* ------------------------------------------------------------------ *
 * React 组件
 * ------------------------------------------------------------------ */

export interface ItemIconProps {
  /** 方块 id（engine-contract BlockId） */
  blockId: number;
  /** 显示尺寸（px，画布像素与 CSS 尺寸一致），默认 32 */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export default function ItemIcon({ blockId, size = 32, className, style }: ItemIconProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(getIconCanvas(blockId), 0, 0, size, size);
  }, [blockId, size]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className={cn('pixelated', className)}
      style={{ width: size, height: size, ...style }}
    />
  );
}

/** 当前 --u 的像素值（随界面尺寸设置与窗口缩放更新）；供图标尺寸 = Nu × u 计算 */
export function useGuiPx(): number {
  const guiScale = useSettingsStore((s) => s.guiScale);
  const [vp, setVp] = useState(() => ({
    w: typeof window === 'undefined' ? 1280 : window.innerWidth,
    h: typeof window === 'undefined' ? 720 : window.innerHeight
  }));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return resolveGuiScale(guiScale, vp.w, vp.h);
}
