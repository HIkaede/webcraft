/**
 * 世界生成（game.md §1）：simplex fBm 地形 + 生物群系 + 纵层结构 + 矿脉 + 植被。
 *
 * 全部为 (seed, x, z) 的纯函数，保证跨区块一致与可复现；存档加载时按种子
 * 重建地形后回放 modified 差量。
 *
 * - 区块 16×16，世界高度 128（y=0..127），海平面 y=62
 * - 超平坦：y=0 基岩、y=1..2 泥土、y=3 草方块
 */
import { createNoise2D } from 'simplex-noise';
import type { NoiseFunction2D } from 'simplex-noise';
import { BlockId } from '../engine-ids';
import type { WorldType } from '../types';
import { hash2, hash3, mulberry32, smoothstep, clamp } from './rng';

export const CHUNK = 16;
export const WORLD_H = 128;
export const SEA_LEVEL = 62;

/** 生物群系（game.md §1.3） */
export type Biome = 'desert' | 'forest' | 'hills' | 'plains' | 'beach' | 'ocean';

/** 群系草/树叶乘色（§1.3：对灰度底纹做乘色） */
export const BIOME_GRASS_TINT: Record<Biome, [number, number, number]> = {
  desert: [0xbf / 255, 0xb7 / 255, 0x55 / 255],
  forest: [0x79 / 255, 0xc0 / 255, 0x5a / 255],
  hills: [0x91 / 255, 0xbd / 255, 0x59 / 255],
  plains: [0x91 / 255, 0xbd / 255, 0x59 / 255],
  beach: [0x91 / 255, 0xbd / 255, 0x59 / 255],
  ocean: [0x91 / 255, 0xbd / 255, 0x59 / 255]
};
export const BIOME_LEAF_TINT: Record<Biome, [number, number, number]> = {
  desert: [0x9c / 255, 0xa8 / 255, 0x4a / 255],
  forest: [0x59 / 255, 0xa8 / 255, 0x3c / 255],
  hills: [0x6b / 255, 0xa8 / 255, 0x44 / 255],
  plains: [0x67 / 255, 0xb0 / 255, 0x45 / 255],
  beach: [0x67 / 255, 0xb0 / 255, 0x45 / 255],
  ocean: [0x67 / 255, 0xb0 / 255, 0x45 / 255]
};
/** 白桦树叶固定色（原版不随群系） */
export const BIRCH_LEAF_TINT: [number, number, number] = [0x80 / 255, 0xa7 / 255, 0x55 / 255];

export interface WorldGen {
  height(x: number, z: number): number;
  biomeAt(x: number, z: number): Biome;
  /** 生成一个区块数据（含树木跨区块、矿石、植被）；写入 out（16*128*16） */
  generateChunk(cx: number, cz: number, out: Uint8Array): void;
  findSpawn(): [number, number, number];
}

function fbm2(noise: NoiseFunction2D, x: number, z: number, octaves: number, gain = 0.5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}

const idx = (x: number, y: number, z: number) => (y * CHUNK + z) * CHUNK + x;

export function createWorldGen(seed: number, worldType: WorldType, structures: boolean): WorldGen {
  const nCont = createNoise2D(mulberry32(seed ^ 0x1a2b3c));
  const nDetail = createNoise2D(mulberry32(seed ^ 0x4d5e6f));
  const nRidge = createNoise2D(mulberry32(seed ^ 0x70819a));
  const nMask = createNoise2D(mulberry32(seed ^ 0xabcdef));
  const nTemp = createNoise2D(mulberry32(seed ^ 0x13572468));
  const nHumid = createNoise2D(mulberry32(seed ^ 0x9eafbecd));

  const isFlat = worldType === 'flat';

  /** 地形高度（game.md §1.2 公式） */
  function height(x: number, z: number): number {
    if (isFlat) return 3;
    const continental = fbm2(nCont, x / 180, z / 180, 4, 0.5);
    const detail = fbm2(nDetail, x / 35, z / 35, 3, 0.5);
    const ridge = 1 - Math.abs(nRidge(x / 90, z / 90));
    const mMask = smoothstep(0.25, 0.75, nMask(x / 300 + 91, z / 300 - 47));
    const h = 64 + continental * 18 + detail * 5 + ridge * mMask * 30;
    return Math.floor(clamp(h, 4, 120));
  }

  function mountainMask(x: number, z: number): number {
    return smoothstep(0.25, 0.75, nMask(x / 300 + 91, z / 300 - 47));
  }

  /** 群系判定（§1.3；海滩/海洋按高度覆盖） */
  function biomeAt(x: number, z: number): Biome {
    if (isFlat) return 'plains';
    const H = height(x, z);
    if (H < 58) return 'ocean';
    if (Math.abs(H - SEA_LEVEL) <= 2) return 'beach';
    const t = nTemp(x / 420, z / 420);
    const m = nHumid(x / 420 + 5.37, z / 420 - 3.11);
    if (t > 0.55 && m < 0.45) return 'desert';
    if (m > 0.55) return 'forest';
    if (mountainMask(x, z) > 0.55) return 'hills';
    return 'plains';
  }

  /* ---------------- 植被（按列 hash 确定性放置，§1.5） ---------------- */

  interface TreeSpec {
    birch: boolean;
    trunkH: number;
    canopySkip: number; // 角随机缺位种子
  }

  /** 该列是否有树（返回树参数）；仅草地表且 H≥63 */
  function treeAt(x: number, z: number): TreeSpec | null {
    if (!structures || isFlat) return null;
    const biome = biomeAt(x, z);
    let density = 0;
    if (biome === 'forest') density = 1 / 9;
    else if (biome === 'hills') density = 1 / 24;
    else if (biome === 'plains') density = 1 / 80;
    else return null;
    const H = height(x, z);
    if (H < 63 || H > 100) return null;
    const r = hash2(x, z, seed ^ 0x7ee5);
    if (r >= density) return null;
    const birch =
      biome === 'forest' ? hash2(x, z, seed ^ 0xb1c) < 0.5 : hash2(x, z, seed ^ 0xb1c) < 0.2;
    const trunkH = birch
      ? 5 + Math.floor(hash2(x, z, seed ^ 0x74ee) * 3) // 5–7
      : 4 + Math.floor(hash2(x, z, seed ^ 0x74ee) * 3); // 4–6
    return { birch, trunkH, canopySkip: Math.floor(hash2(x, z, seed ^ 0xca09) * 1e9) };
  }

  function cactusAt(x: number, z: number): number {
    if (!structures || isFlat) return 0;
    if (biomeAt(x, z) !== 'desert') return 0;
    if (hash2(x, z, seed ^ 0xcac7) >= 1 / 40) return 0;
    // 四邻无固体（近似：邻列无仙人掌/树）
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      if (hash2(x + dx, z + dz, seed ^ 0xcac7) < 1 / 40 && biomeAt(x + dx, z + dz) === 'desert')
        return 0;
      if (treeAt(x + dx, z + dz)) return 0;
    }
    return 1 + Math.floor(hash2(x, z, seed ^ 0xca67) * 3); // 1–3 高
  }

  /** 花草（平原 1/6、森林 1/5 列；花:草 = 蒲公英/罂粟 1:1 与其余草丛） */
  function plantAt(x: number, z: number): number {
    if (!structures || isFlat) return 0;
    const biome = biomeAt(x, z);
    const density = biome === 'forest' ? 1 / 5 : biome === 'plains' ? 1 / 6 : 0;
    if (density === 0) return 0;
    const H = height(x, z);
    if (H < 63) return 0;
    if (treeAt(x, z)) return 0;
    if (hash2(x, z, seed ^ 0xf10a) >= density) return 0;
    const r = hash2(x, z, seed ^ 0xf10b);
    if (r < 0.25) return BlockId.DANDELION;
    if (r < 0.5) return BlockId.POPPY;
    return BlockId.TALL_GRASS;
  }

  /** 把一棵树中属于本区块的方块写入 out（树干源点可在邻区，§1.5） */
  function writeTree(
    out: Uint8Array,
    cx: number,
    cz: number,
    tx: number,
    tz: number,
    spec: TreeSpec
  ): void {
    const H = height(tx, tz);
    const log = spec.birch ? BlockId.BIRCH_LOG : BlockId.OAK_LOG;
    const leaf = spec.birch ? BlockId.BIRCH_LEAVES : BlockId.OAK_LEAVES;
    const topY = H + spec.trunkH; // 树干顶端 y（含）
    const put = (wx: number, wy: number, wz: number, id: number, replaceAirOnly: boolean) => {
      const lx = wx - cx * CHUNK;
      const lz = wz - cz * CHUNK;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || wy < 0 || wy >= WORLD_H) return;
      const i = idx(lx, wy, lz);
      if (replaceAirOnly && out[i] !== BlockId.AIR) return;
      if (!replaceAirOnly || out[i] === BlockId.AIR) out[i] = id;
    };
    // 树冠：顶部两层 3×3（topY, topY+1），其下两层 5×5（角随机缺 1–2 格）
    for (let dy = -2; dy <= 1; dy++) {
      const y = topY + dy;
      const radius = dy <= -1 ? 2 : 1;
      for (let dx = -radius; dx <= radius; dx++)
        for (let dz = -radius; dz <= radius; dz++) {
          if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) {
            // 角随机缺 1–2 格
            const c = ((dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0) + (dy === -1 ? 0 : 4)) & 7;
            if (((spec.canopySkip >> (c * 2)) & 3) < 2) continue;
          }
          if (radius === 1 && Math.abs(dx) + Math.abs(dz) === 2) {
            if (((spec.canopySkip >> ((dx + dz + 8 + (dy & 1)) & 7)) & 1) === 0) continue; // 顶角稀疏
          }
          put(tx + dx, y, tz + dz, leaf, true);
        }
    }
    // 树干
    for (let y = H + 1; y <= topY; y++) put(tx, y, tz, log, false);
  }

  /* ---------------- 矿脉（§1.4，簇状随机团簇） ---------------- */
  function writeOres(out: Uint8Array, cx: number, cz: number): void {
    const rng = mulberry32((hash2(cx, cz, seed ^ 0x0e5) * 4294967296) | 0);
    const vein = (id: number, count: number, maxY: number, sizeMin: number, sizeMax: number) => {
      for (let v = 0; v < count; v++) {
        const vx = Math.floor(rng() * CHUNK);
        const vz = Math.floor(rng() * CHUNK);
        const vy = 2 + Math.floor(rng() * (maxY - 2));
        const size = sizeMin + Math.floor(rng() * (sizeMax - sizeMin + 1));
        for (let s = 0; s < size; s++) {
          const ox = Math.min(CHUNK - 1, Math.max(0, vx + Math.floor((rng() - 0.5) * 4)));
          const oy = Math.min(WORLD_H - 1, Math.max(1, vy + Math.floor((rng() - 0.5) * 4)));
          const oz = Math.min(CHUNK - 1, Math.max(0, vz + Math.floor((rng() - 0.5) * 4)));
          const i = idx(ox, oy, oz);
          if (out[i] === BlockId.STONE) out[i] = id;
        }
      }
    };
    vein(BlockId.COAL_ORE, 20, 118, 4, 8);
    vein(BlockId.IRON_ORE, 14, 64, 4, 8);
    vein(BlockId.GOLD_ORE, 2, 32, 4, 8);
    vein(BlockId.DIAMOND_ORE, 1, 16, 3, 6);
  }

  /* ---------------- 区块生成 ---------------- */
  function generateChunk(cx: number, cz: number, out: Uint8Array): void {
    out.fill(BlockId.AIR);
    if (isFlat) {
      for (let z = 0; z < CHUNK; z++)
        for (let x = 0; x < CHUNK; x++) {
          out[idx(x, 0, z)] = BlockId.BEDROCK;
          out[idx(x, 1, z)] = BlockId.DIRT;
          out[idx(x, 2, z)] = BlockId.DIRT;
          out[idx(x, 3, z)] = BlockId.GRASS_BLOCK;
        }
      return;
    }

    // 纵层结构（§1.4）
    for (let z = 0; z < CHUNK; z++)
      for (let x = 0; x < CHUNK; x++) {
        const wx = cx * CHUNK + x;
        const wz = cz * CHUNK + z;
        const H = height(wx, wz);
        const biome = biomeAt(wx, wz);
        const colRnd = hash3(wx, 0, wz, seed ^ 0xd1e7);

        // 表层方块
        let surface: number = BlockId.GRASS_BLOCK;
        let subsurface: number = BlockId.DIRT;
        if (biome === 'desert' || biome === 'beach') {
          surface = BlockId.SAND;
          subsurface = BlockId.SAND;
        } else if (biome === 'ocean') {
          surface = colRnd < 0.5 ? BlockId.SAND : BlockId.GRAVEL;
          subsurface = surface;
        } else if (biome === 'hills' && H > 96) {
          surface = BlockId.STONE;
          subsurface = BlockId.STONE;
        }
        const depth = 3 + (colRnd < 0.5 ? 0 : 1); // 3–4 格

        for (let y = 0; y <= H; y++) {
          let id: number;
          if (y === 0) id = BlockId.BEDROCK;
          else if (y === 1 && hash3(wx, y, wz, seed ^ 0xbed0) < 0.5) id = BlockId.BEDROCK;
          else if (y === H) id = surface;
          else if (y >= H - depth)
            id = biome === 'desert' && y < H - depth ? BlockId.SANDSTONE : subsurface;
          else id = BlockId.STONE;
          out[idx(x, y, z)] = id;
        }
        // 水：H<62 的列填至 y=62
        for (let y = H + 1; y <= SEA_LEVEL; y++) out[idx(x, y, z)] = BlockId.WATER;
      }

    writeOres(out, cx, cz);

    if (structures) {
      // 树木：收集 2 格覆盖带内的树干源点（树冠最大半径 2），只落本区块的方块
      for (let tz = cz * CHUNK - 2; tz < cz * CHUNK + CHUNK + 2; tz++)
        for (let tx = cx * CHUNK - 2; tx < cx * CHUNK + CHUNK + 2; tx++) {
          const spec = treeAt(tx, tz);
          if (spec) writeTree(out, cx, cz, tx, tz, spec);
        }
      // 仙人掌与花草（仅本区块列）
      for (let z = 0; z < CHUNK; z++)
        for (let x = 0; x < CHUNK; x++) {
          const wx = cx * CHUNK + x;
          const wz = cz * CHUNK + z;
          const H = height(wx, wz);
          const ch = cactusAt(wx, wz);
          if (ch > 0 && out[idx(x, H, z)] === BlockId.SAND) {
            for (let y = 1; y <= ch; y++)
              if (H + y < WORLD_H) out[idx(x, H + y, z)] = BlockId.CACTUS;
          } else {
            const plant = plantAt(wx, wz);
            if (
              plant &&
              out[idx(x, H, z)] === BlockId.GRASS_BLOCK &&
              H + 1 < WORLD_H &&
              out[idx(x, H + 1, z)] === BlockId.AIR
            ) {
              out[idx(x, H + 1, z)] = plant;
            }
          }
        }
    }
  }

  /* ---------------- 出生点（§1.6） ---------------- */
  function findSpawn(): [number, number, number] {
    if (isFlat) return [0.5, 4, 0.5];
    // 从 (0,0) 向外螺旋扫描，取首个「平原/森林且 H ≥ 63」的列
    let x = 0;
    let z = 0;
    let dx = 0;
    let dz = -1;
    for (let i = 0; i < 20000; i++) {
      const biome = biomeAt(x, z);
      const H = height(x, z);
      if ((biome === 'plains' || biome === 'forest') && H >= 63) {
        return [x + 0.5, H + 1, z + 0.5];
      }
      if (x === z || (x < 0 && x === -z) || (x > 0 && x === 1 - z)) {
        const t = dx;
        dx = -dz;
        dz = t;
      }
      x += dx;
      z += dz;
    }
    return [0.5, height(0, 0) + 1, 0.5];
  }

  return { height, biomeAt, generateChunk, findSpawn };
}
