/**
 * 确定性随机源（game.md §1.1）：mulberry32 / 坐标 hash。
 * 所有世界生成随机都必须来自这些纯函数，保证跨区块一致与可复现。
 */

/** mulberry32 PRNG（种子 int32 → [0,1) 序列） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D 坐标 hash → [0,1)（纯函数，跨区块一致） */
export function hash2(x: number, z: number, seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ Math.imul(x | 0, 374761393), 668265263);
  h = Math.imul(h ^ Math.imul(z | 0, 2246822519), 3266489917);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 3D 坐标 hash → [0,1)（纹理噪声、矿石等用） */
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ Math.imul(x | 0, 374761393), 668265263);
  h = Math.imul(h ^ Math.imul(y | 0, 3266489917), 2246822519);
  h = Math.imul(h ^ Math.imul(z | 0, 1013904223), 3266489917);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** smoothstep（game.md 山地掩码公式用） */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
