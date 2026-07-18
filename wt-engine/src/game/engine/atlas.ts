/**
 * 程序纹理图集（game.md §3）：启动时 canvas 生成 256×256 图集（16×16 格/16 格每行，
 * NearestFilter、无 mipmap）+ 10 张破坏裂纹 + 方块等轴测 2.5D 图标缓存。
 *
 * 通用算法：fillRect(基色) → 每像素 brightness += (hash(px,py,tile)-0.5)*噪幅。
 * 水有两帧相位差（§3），图集渲染两份，材质每 400ms 交换 map。
 */
import * as THREE from 'three';
import { hash3 } from './rng';
import { blockInfo, ITEM_ID_DIAMOND } from './blocks';

const TILE = 16;
const COLS = 16;
const ATLAS_PX = TILE * COLS; // 256

/* ------------------------------------------------------------------ */
/* 图格清单（绘制顺序即图集序号）                                       */
/* ------------------------------------------------------------------ */
const TILE_NAMES = [
  'grass_top',
  'grass_side',
  'dirt',
  'stone',
  'cobble',
  'sand',
  'sandstone',
  'sandstone_top',
  'sandstone_bottom',
  'gravel',
  'oak_log',
  'oak_log_top',
  'birch_log',
  'oak_leaves',
  'birch_leaves',
  'planks',
  'glass',
  'sbrick',
  'bricks',
  'bedrock',
  'coal_ore',
  'iron_ore',
  'gold_ore',
  'diam_ore',
  'ctable_top',
  'ctable_side',
  'furnace_side',
  'furnace_front',
  'furnace_top',
  'glow',
  'obsidian',
  'tnt_side',
  'tnt_top',
  'wool_white',
  'wool_gray',
  'wool_black',
  'wool_red',
  'wool_orange',
  'wool_yellow',
  'wool_green',
  'wool_blue',
  'water',
  'cactus_side',
  'cactus_top',
  'dandelion',
  'poppy',
  'tuft',
  'torch'
] as const;
type TileName = (typeof TILE_NAMES)[number];
const TILE_INDEX = new Map<string, number>(TILE_NAMES.map((n, i) => [n, i]));

type RGB = [number, number, number];
/** 为裸 lambda 配方提供上下文类型 */
const P = (p: Painter): Painter => p;
/** 每像素绘制上下文：d = RGBA 数据，rnd(x,y) 确定性噪声 */
type Painter = (
  px: (x: number, y: number, c: RGB, a?: number) => void,
  rnd: (x: number, y: number) => number
) => void;

/** 基色 + 每像素噪幅 J（0–1） */
function fill(base: RGB, J: number): Painter {
  return (px, rnd) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const f = 1 + (rnd(x, y) - 0.5) * 2 * J;
        px(x, y, [base[0] * f, base[1] * f, base[2] * f]);
      }
  };
}
function compose(...painters: Painter[]): Painter {
  return (px, rnd) => painters.forEach((p) => p(px, rnd));
}
/** 局部覆盖绘制助手 */
function rect(x0: number, y0: number, w: number, h: number, c: RGB, a = 255): Painter {
  return (px) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y, c, a);
  };
}
const GRAY = (v: number): RGB => [v, v, v];

/* ------------------------------------------------------------------ */
/* 逐方块配方（game.md §3 表）                                          */
/* ------------------------------------------------------------------ */
const RECIPES: Record<TileName, Painter | ((phase: number) => Painter)> = {
  // 草方块顶：灰度底（按群系乘色），J=14%，散布 5% 深绿点
  grass_top: compose(fill(GRAY(235), 0.14), (px, rnd) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) if (rnd(x + 31, y + 77) < 0.05) px(x, y, GRAY(190));
  }),
  // 草方块侧：泥土底 + 顶部 3–5px 绿色裙边，每列向下随机延伸 1–3px
  grass_side: compose(fill([0x86, 0x60, 0x43], 0.18), (px, rnd) => {
    for (let x = 0; x < TILE; x++) {
      const ext = 2 + Math.floor(rnd(x, 91) * 3); // 顶 2px 全绿 + 1–3px 延伸
      for (let y = 0; y <= ext; y++) {
        const f = 0.9 + rnd(x, y + 3) * 0.2;
        px(x, y, [0x7f * f, 0xb3 * f, 0x4e * f]);
      }
    }
  }),
  dirt: compose(fill([0x86, 0x60, 0x43], 0.18), (px, rnd) => {
    for (let y = 0; y < TILE; y += 2)
      for (let x = 0; x < TILE; x += 2)
        if (rnd(x * 3, y * 5) < 0.02) {
          px(x, y, [0x6b, 0x4a, 0x33]);
          px(x + 1, y, [0x6b, 0x4a, 0x33]);
          px(x, y + 1, [0x6b, 0x4a, 0x33]);
          px(x + 1, y + 1, [0x6b, 0x4a, 0x33]);
        }
  }),
  stone: fill([0x7d, 0x7d, 0x7d], 0.1),
  // 圆石：缝隙底 + 6–8 个 3–5px 圆角深灰块
  cobble: compose(fill([0x5a, 0x5a, 0x5a], 0.06), (px, rnd) => {
    for (let i = 0; i < 8; i++) {
      const ox = Math.floor(rnd(i, 1) * 13),
        oy = Math.floor(rnd(i, 2) * 13);
      const w = 3 + Math.floor(rnd(i, 3) * 3),
        h = 3 + Math.floor(rnd(i, 4) * 3);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1) && w > 3 && h > 3) continue; // 圆角
          const f = 0.95 + rnd(x + i * 7, y + i * 13) * 0.17;
          px((ox + x) % 16, (oy + y) % 16, [0x7a * f, 0x7a * f, 0x7a * f]);
        }
    }
  }),
  sand: fill([0xdb, 0xd3, 0xa0], 0.1),
  // 砂岩侧：沙色 + 上下 2px 深色边线 + 中部横向浅纹
  sandstone: compose(
    fill([0xdb, 0xd3, 0xa0], 0.08),
    rect(0, 0, 16, 2, [0xc9, 0xbd, 0x8b]),
    rect(0, 14, 16, 2, [0xc9, 0xbd, 0x8b]),
    rect(0, 8, 16, 1, [0xe6, 0xe0, 0xb8])
  ),
  sandstone_top: compose(fill([0xdb, 0xd3, 0xa0], 0.08), rect(0, 0, 16, 1, [0xd0, 0xc7, 0x96])),
  sandstone_bottom: fill([0xc4, 0xba, 0x8a], 0.08),
  gravel: compose(fill([0x8a, 0x7f, 0x74], 0.22), (px, rnd) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const r = rnd(x + 55, y + 21);
        if (r < 0.3) px(x, y, r < 0.15 ? [0x6e, 0x65, 0x5c] : [0xa4, 0x99, 0x8d]);
      }
  }),
  // 橡木原木侧：竖条纹，每 2–3px 一条深 15% 竖线
  oak_log: compose(fill([0x6b, 0x52, 0x30], 0.1), (px, rnd) => {
    for (let x = 0; x < TILE; x++)
      if (rnd(x, 3) < 0.35) for (let y = 0; y < TILE; y++) px(x, y, [0x57, 0x41, 0x26]);
  }),
  // 原木顶/底：年轮同心方环交替
  oak_log_top: P((px, rnd) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) | 0;
        const ring = (8 - d) % 2 === 0;
        const c = ring ? [0x9c, 0x80, 0x50] : [0x6b, 0x52, 0x30];
        const f = 0.92 + rnd(x, y) * 0.16;
        px(x, y, [c[0] * f, c[1] * f, c[2] * f]);
      }
  }),
  birch_log: compose(fill([0xd8, 0xd8, 0xc8], 0.06), (px, rnd) => {
    for (let i = 0; i < 12; i++) {
      const ox = Math.floor(rnd(i, 11) * 14),
        oy = Math.floor(rnd(i, 12) * 16);
      px(ox, oy, [0x2a, 0x2a, 0x24]);
      px(ox + 1, oy, [0x2a, 0x2a, 0x24]);
    }
  }),
  // 树叶：灰度底（群系乘色）J=25%，12% 透明镂空
  oak_leaves: P((px, rnd) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        if (rnd(x + 7, y + 7) < 0.12) {
          px(x, y, [0, 0, 0], 0);
          continue;
        }
        const f = 1 + (rnd(x, y) - 0.5) * 0.5;
        px(x, y, GRAY(158 * f));
      }
  }),
  birch_leaves: P((px, rnd) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        if (rnd(x + 17, y + 29) < 0.1) {
          px(x, y, [0, 0, 0], 0);
          continue;
        }
        const f = 1 + (rnd(x, y) - 0.5) * 0.5;
        px(x, y, GRAY(172 * f));
      }
  }),
  // 木板：4px 板条横缝 + 板端钉点
  planks: compose(fill([0x9c, 0x80, 0x50], 0.08), (px, rnd) => {
    for (let y = 3; y < TILE; y += 4) for (let x = 0; x < TILE; x++) px(x, y, [0x6e, 0x58, 0x36]);
    for (let band = 0; band < 4; band++) {
      const jx = Math.floor(rnd(band, 41) * 15);
      for (let y = band * 4; y < band * 4 + 3; y++) px(jx, y, [0x6e, 0x58, 0x36]);
      px((jx + 2) % 16, band * 4 + 1, [0x6e, 0x58, 0x36]); // 钉点
    }
  }),
  // 玻璃：透明底 + 1px 白边 + 45° 两道高光条纹
  glass: P((px) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        if (x === 0 || y === 0 || x === 15 || y === 15) px(x, y, [0xdf, 0xdf, 0xdf]);
        else {
          const d = (x - y + 16) % 16;
          if (d === 3 || d === 4 || d === 11 || d === 12) px(x, y, [0xff, 0xff, 0xff], 153);
        }
      }
  }),
  // 石砖：8×8 砖格 2×2 排列
  sbrick: compose(fill([0x76, 0x76, 0x76], 0.08), (px, rnd) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const band = (y / 8) | 0;
        if (y % 8 === 7 || (x + band * 4) % 8 === 7) px(x, y, [0x4f, 0x4f, 0x4f]);
      }
    const cx = Math.floor(rnd(1, 51) * 14),
      cy = Math.floor(rnd(2, 52) * 14);
    px(cx, cy, [0x3a, 0x3a, 0x3a]);
    px(cx + 1, cy + 1, [0x3a, 0x3a, 0x3a]);
    px(cx, cy + 1, [0x3a, 0x3a, 0x3a]); // 裂纹
  }),
  // 砖块：4×2 红砖错缝
  bricks: compose(fill([0xbc, 0xa3, 0x92], 0.04), (px, rnd) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        if (y % 4 === 3) continue;
        const row = (y / 4) | 0;
        if ((x + row * 2) % 4 === 3) continue;
        const f = 0.9 + rnd(x, y) * 0.2;
        px(x, y, [0x96 * f, 0x54 * f, 0x3f * f]);
      }
  }),
  // 基岩：大对比块状团斑
  bedrock: P((px, rnd) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const f = 1 + (rnd((x / 2) | 0, (y / 2) | 0) - 0.5) * 0.8;
        px(x, y, GRAY(0x56 * f));
      }
  }),
  coal_ore: ore([0x2b, 0x2b, 0x2b]),
  iron_ore: ore([0xd8, 0xaf, 0x93]),
  gold_ore: ore([0xfc, 0xee, 0x4b]),
  diam_ore: ore([0x5d, 0xf5, 0xe3], true),
  ctable_top: compose(fill([0x9c, 0x80, 0x50], 0.08), (px) => {
    for (let i = 0; i < TILE; i++) {
      px(i, 0, [0x5e, 0x4a, 0x2e]);
      px(i, 15, [0x5e, 0x4a, 0x2e]);
      px(0, i, [0x5e, 0x4a, 0x2e]);
      px(15, i, [0x5e, 0x4a, 0x2e]);
    }
    for (let g = 3; g < 15; g += 4) {
      for (let i = 1; i < 15; i++) {
        px(i, g, [0x6e, 0x58, 0x36]);
        px(g, i, [0x6e, 0x58, 0x36]);
      }
    }
  }),
  ctable_side: compose(fill([0x9c, 0x80, 0x50], 0.08), (px, rnd) => {
    for (let x = 0; x < TILE; x++) {
      px(x, 0, [0x7a, 0x62, 0x3a]);
      px(x, 1, [0x7a, 0x62, 0x3a]);
    }
    for (let i = 0; i < 5; i++)
      px(Math.floor(rnd(i, 61) * 15), 2 + Math.floor(rnd(i, 62) * 2), [0x5e, 0x4a, 0x2e]); // 工具刻痕
    for (let y = 3; y < TILE; y += 4) for (let x = 0; x < TILE; x++) px(x, y, [0x6e, 0x58, 0x36]);
  }),
  furnace_side: compose(fill([0x5a, 0x5a, 0x5a], 0.06), cobbleBlobs),
  furnace_top: compose(fill([0x5a, 0x5a, 0x5a], 0.06), cobbleBlobs),
  furnace_front: compose(
    fill([0x5a, 0x5a, 0x5a], 0.06),
    cobbleBlobs,
    rect(5, 5, 6, 6, [0x14, 0x14, 0x14]),
    rect(6, 6, 4, 4, [0x05, 0x05, 0x05])
  ),
  glow: compose(fill([0xf4, 0xd3, 0x5e], 0.2), (px, rnd) => {
    for (let i = 0; i < 4; i++) {
      const ox = Math.floor(rnd(i, 71) * 13),
        oy = Math.floor(rnd(i, 72) * 13);
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++) px(ox + x, oy + y, [0xfb, 0xe9, 0xa0]);
    }
  }),
  obsidian: compose(fill([0x14, 0x10, 0x1f], 0.3), (px, rnd) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) if (rnd(x + 83, y + 37) < 0.03) px(x, y, [0x3b, 0x2a, 0x5e]);
  }),
  tnt_side: compose(
    fill([0xc3, 0x3a, 0x2a], 0.08),
    rect(0, 6, 16, 4, [0x1a, 0x1a, 0x1a]),
    (px, rnd) => {
      for (let i = 0; i < 3; i++) {
        const bx = 3 + i * 4;
        for (let y = 6; y < 10; y++) px(bx, y, [0xe0, 0xd8, 0xc8]);
      } // 像素字条
      void rnd;
    }
  ),
  tnt_top: compose(fill([0xc3, 0x3a, 0x2a], 0.08), (px) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) | 0;
        if (d === 4) px(x, y, [0x8a, 0x24, 0x18]);
        if (d <= 1) px(x, y, [0x40, 0x40, 0x40]);
      }
  }),
  wool_white: wool([0xe9, 0xec, 0xec]),
  wool_gray: wool([0x3e, 0x44, 0x47]),
  wool_black: wool([0x14, 0x14, 0x14]),
  wool_red: wool([0xa0, 0x27, 0x22]),
  wool_orange: wool([0xf0, 0x76, 0x13]),
  wool_yellow: wool([0xf8, 0xc6, 0x27]),
  wool_green: wool([0x5e, 0x7c, 0x16]),
  wool_blue: wool([0x35, 0x39, 0x9d]),
  // 水：两帧相位差（phase 0/1）
  water: (phase: number) =>
    compose(fill([0x3f, 0x76, 0xe4], 0.06), (px, rnd) => {
      const r1 = (3 + phase * 5) % 16,
        r2 = (11 - phase * 3 + 16) % 16;
      for (let x = 0; x < TILE; x++) {
        if (rnd(x, r1) < 0.7) px(x, r1, [0x5a, 0x8f, 0xf0]);
        if (rnd(x, r2) < 0.7) px(x, r2, [0x5a, 0x8f, 0xf0]);
      }
    }),
  cactus_side: compose(fill([0x58, 0x82, 0x2d], 0.1), (px, rnd) => {
    for (let x = 0; x < TILE; x++)
      if (x % 4 === 0) for (let y = 0; y < TILE; y++) px(x, y, [0x3e, 0x6b, 0x1f]);
    for (let i = 0; i < 8; i++)
      px(Math.floor(rnd(i, 81) * 16), Math.floor(rnd(i, 82) * 16), [0xa9, 0xc9, 0x7a]); // 刺点
  }),
  cactus_top: P((px, rnd) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) | 0;
        const c = d > 6 ? [0x3e, 0x6b, 0x1f] : d > 3 ? [0x58, 0x82, 0x2d] : [0x6f, 0x9c, 0x40];
        const f = 0.92 + rnd(x, y) * 0.16;
        px(x, y, [c[0] * f, c[1] * f, c[2] * f]);
      }
  }),
  // 十字面片植物：透明底 + 像素画
  dandelion: compose(plantStem, (px, rnd) => {
    for (let y = 3; y < 7; y++)
      for (let x = 6; x < 10; x++) {
        const f = 0.85 + rnd(x, y) * 0.3;
        px(x, y, [0xff * f, 0xd8 * f, 0x3d * f]);
      }
  }),
  poppy: compose(plantStem, (px, rnd) => {
    for (let y = 3; y < 7; y++)
      for (let x = 6; x < 10; x++) {
        const f = 0.85 + rnd(x, y) * 0.3;
        px(x, y, [0xd0 * f, 0x2a * f, 0x2a * f]);
      }
    px(7, 4, [0x4a, 0x20, 0x20]);
    px(8, 5, [0x4a, 0x20, 0x20]);
  }),
  tuft: P((px, rnd) => {
    for (let i = 0; i < 6; i++) {
      const bx = 2 + i * 2 + Math.floor(rnd(i, 92) * 2);
      const h = 6 + Math.floor(rnd(i, 93) * 5);
      for (let y = 15 - h; y < 16; y++) {
        const f = 0.75 + rnd(bx, y) * 0.45;
        px(bx, y, GRAY(150 * f));
        if (rnd(bx, y + 40) < 0.3 && bx + 1 < 16) px(bx + 1, y, GRAY(140 * f));
      }
    }
  }),
  torch: P((px, rnd) => {
    for (let y = 6; y < 16; y++) {
      px(7, y, [0x8a, 0x6b, 0x3d]);
      px(8, y, [0x6e, 0x54, 0x2e]);
    }
    for (let y = 2; y < 6; y++)
      for (let x = 6; x < 10; x++) {
        const f = 0.9 + rnd(x, y) * 0.2;
        px(x, y, y === 2 ? [0xff, 0xf2, 0xb0] : [0xff * f, 0xd8 * f, 0x4d * f]);
      }
  })
};

/* 共享子配方 */
function cobbleBlobs(px: Parameters<Painter>[0], rnd: Parameters<Painter>[1]): void {
  for (let i = 0; i < 8; i++) {
    const ox = Math.floor(rnd(i, 1) * 13),
      oy = Math.floor(rnd(i, 2) * 13);
    const w = 3 + Math.floor(rnd(i, 3) * 3),
      h = 3 + Math.floor(rnd(i, 4) * 3);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1) && w > 3 && h > 3) continue;
        const f = 0.95 + rnd(x + i * 7, y + i * 13) * 0.17;
        px((ox + x) % 16, (oy + y) % 16, [0x7a * f, 0x7a * f, 0x7a * f]);
      }
  }
}
function ore(color: RGB, highlight = false): Painter {
  return compose(fill([0x7d, 0x7d, 0x7d], 0.1), (px, rnd) => {
    for (let i = 0; i < 4; i++) {
      const ox = 1 + Math.floor(rnd(i, 101) * 12),
        oy = 1 + Math.floor(rnd(i, 102) * 12);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) px(ox + x, oy + y, color);
      if (highlight) px(ox, oy, [0xd0, 0xff, 0xfa]);
    }
  });
}
function wool(base: RGB): Painter {
  return compose(fill(base, 0.08), (px) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++)
        if ((x + y) % 4 === 0) px(x, y, [base[0] * 0.92, base[1] * 0.92, base[2] * 0.92]); // 斜向编织纹
  });
}
function plantStem(px: Parameters<Painter>[0], rnd: Parameters<Painter>[1]): void {
  for (let y = 6; y < 16; y++) {
    const f = 0.85 + rnd(7, y) * 0.3;
    px(7, y, [0x4a * f, 0x8f * f, 0x28 * f]);
    if (y > 10 && rnd(8, y) < 0.4) px(8, y, [0x3d * f, 0x77 * f, 0x20 * f]);
  }
}

/* ------------------------------------------------------------------ */
/* 图集构建                                                            */
/* ------------------------------------------------------------------ */
export interface Atlas {
  /** 两张图集纹理（仅水相位不同），每 400ms 交换实现水流动 */
  textures: [THREE.Texture, THREE.Texture];
  /** 图格名 → UV [u0, vBottom, u1, vTop]（three 坐标，v 自底向上） */
  uv(name: string): [number, number, number, number];
  /** 10 阶段破坏裂纹贴图 */
  crackTextures: THREE.Texture[];
  /** 方块/物品等轴测 2.5D 图标（46×46 canvas 缓存） */
  getIcon(id: number): HTMLCanvasElement;
  dispose(): void;
}

export function createAtlas(): Atlas {
  const canvases: HTMLCanvasElement[] = [];
  const tileCanvases = new Map<string, HTMLCanvasElement>();

  const drawTile = (ctx: CanvasRenderingContext2D, name: TileName, phase: number) => {
    const idx = TILE_INDEX.get(name)!;
    const x0 = (idx % COLS) * TILE;
    const y0 = Math.floor(idx / COLS) * TILE;
    const img = ctx.createImageData(TILE, TILE);
    const d = img.data;
    const px = (x: number, y: number, c: RGB, a = 255) => {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      const o = (y * TILE + x) * 4;
      d[o] = Math.min(255, Math.max(0, c[0]));
      d[o + 1] = Math.min(255, Math.max(0, c[1]));
      d[o + 2] = Math.min(255, Math.max(0, c[2]));
      d[o + 3] = a;
    };
    const rnd = (x: number, y: number) => hash3(x, y, idx * 7919 + 13, 20240501);
    const recipe = RECIPES[name];
    const painter =
      name === 'water' ? (recipe as (p: number) => Painter)(phase) : (recipe as Painter);
    painter(px, rnd);
    ctx.putImageData(img, x0, y0);
    // 单格画布缓存（图标用）
    if (phase === 0) {
      const tc = document.createElement('canvas');
      tc.width = TILE;
      tc.height = TILE;
      tc.getContext('2d')!.putImageData(img, 0, 0);
      tileCanvases.set(name, tc);
    }
  };

  for (let phase = 0; phase < 2; phase++) {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_PX;
    canvas.height = ATLAS_PX;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, ATLAS_PX, ATLAS_PX);
    for (const name of TILE_NAMES) drawTile(ctx, name, phase);
    canvases.push(canvas);
  }

  const makeTex = (c: HTMLCanvasElement): THREE.Texture => {
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const textures: [THREE.Texture, THREE.Texture] = [makeTex(canvases[0]), makeTex(canvases[1])];

  // 裂纹：阶段 n ≈ (n+1)×6 条 1px 黑色线段
  const crackTextures: THREE.Texture[] = [];
  for (let stage = 0; stage < 10; stage++) {
    const c = document.createElement('canvas');
    c.width = TILE;
    c.height = TILE;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, TILE, TILE);
    const img = ctx.createImageData(TILE, TILE);
    const segs = (stage + 1) * 6;
    for (let i = 0; i < segs; i++) {
      let x = Math.floor(hash3(i, stage, 1, 777) * 14) + 1;
      let y = Math.floor(hash3(i, stage, 2, 777) * 14) + 1;
      const len = 1 + Math.floor(hash3(i, stage, 3, 777) * 3);
      const horiz = hash3(i, stage, 4, 777) < 0.5;
      for (let s = 0; s < len; s++) {
        const xx = Math.min(15, horiz ? x + s : x);
        const yy = Math.min(15, horiz ? y : y + s);
        const o = (yy * TILE + xx) * 4;
        img.data[o + 3] = 170;
      }
      x += 2;
      y += 1;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    crackTextures.push(t);
  }

  /* 图标缓存（等轴测 2.5D，46×46） */
  const iconCache = new Map<number, HTMLCanvasElement>();
  const getIcon = (id: number): HTMLCanvasElement => {
    const hit = iconCache.get(id);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = 46;
    c.height = 46;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    if (id === ITEM_ID_DIAMOND) {
      drawDiamondIcon(ctx);
    } else {
      const info = blockInfo(id);
      const side = tileCanvases.get(info.tex.side)!;
      if (info.kind === 'cross' || info.kind === 'torch') {
        ctx.drawImage(side, 3, 3, 40, 40);
      } else {
        const top = tileCanvases.get(info.tex.top ?? info.tex.side)!;
        // 顶面
        ctx.setTransform(22 / 16, 11 / 16, -22 / 16, 11 / 16, 23, 0);
        ctx.drawImage(top, 0, 0);
        // 左面（×0.8 暗）
        ctx.setTransform(22 / 16, 11 / 16, 0, 22 / 16, 1, 11);
        ctx.drawImage(side, 0, 0);
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.fillRect(0, 0, 16, 16);
        // 右面（×0.6 暗）
        ctx.setTransform(22 / 16, -11 / 16, 0, 22 / 16, 23, 22);
        ctx.drawImage(side, 0, 0);
        ctx.fillStyle = 'rgba(0,0,0,0.40)';
        ctx.fillRect(0, 0, 16, 16);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
    iconCache.set(id, c);
    return c;
  };

  return {
    textures,
    uv(name: string) {
      const idx = TILE_INDEX.get(name) ?? 0;
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      return [col / COLS, 1 - (row + 1) / COLS, (col + 1) / COLS, 1 - row / COLS];
    },
    crackTextures,
    getIcon,
    dispose() {
      textures.forEach((t) => t.dispose());
      crackTextures.forEach((t) => t.dispose());
    }
  };
}

/** 钻石物品图标（P2 物品段最小支持） */
function drawDiamondIcon(ctx: CanvasRenderingContext2D): void {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const x = c.getContext('2d')!;
  const img = x.createImageData(16, 16);
  const set = (px: number, py: number, col: RGB) => {
    const o = (py * 16 + px) * 4;
    img.data[o] = col[0];
    img.data[o + 1] = col[1];
    img.data[o + 2] = col[2];
    img.data[o + 3] = 255;
  };
  for (let py = 0; py < 16; py++)
    for (let px = 0; px < 16; px++) {
      const d = Math.abs(px - 8) / 8 + Math.abs(py - 8) / 7;
      if (d < 0.95) set(px, py, py < 6 ? [0x8f, 0xfa, 0xf0] : [0x5d, 0xf5, 0xe3]);
      else if (d < 1.1) set(px, py, [0x2a, 0xa8, 0xa0]);
    }
  x.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 3, 3, 40, 40);
}
