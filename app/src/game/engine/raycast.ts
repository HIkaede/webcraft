/**
 * 体素 DDA 射线（game.md §5：Amanatides & Woo）。
 * 从视点沿朝向步进，命中首个 selectable 方块（水不可选）。
 */
import { BlockId } from '../engine-ids';
import type { RaycastHit } from '../engine-ids';
import { blockInfo } from './blocks';
import type { ChunkStore } from './chunks';

export function raycastVoxel(
  store: ChunkStore,
  origin: [number, number, number],
  yawDeg: number,
  pitchDeg: number,
  maxDist: number
): RaycastHit | null {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  // three 约定：yaw=0 → -Z；pitch>0 → 向上
  const dx = -Math.sin(yaw) * Math.cos(pitch);
  const dy = Math.sin(pitch);
  const dz = -Math.cos(yaw) * Math.cos(pitch);

  let x = Math.floor(origin[0]);
  let y = Math.floor(origin[1]);
  let z = Math.floor(origin[2]);

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  const fracX = origin[0] - x;
  const fracY = origin[1] - y;
  const fracZ = origin[2] - z;

  let tMaxX = dx !== 0 ? (dx > 0 ? (1 - fracX) * tDeltaX : fracX * tDeltaX) : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? (1 - fracY) * tDeltaY : fracY * tDeltaY) : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? (1 - fracZ) * tDeltaZ : fracZ * tDeltaZ) : Infinity;

  let face: [number, number, number] = [0, 0, 0];
  let t = 0;
  // 起点所在格不命中（防自锁）
  for (let i = 0; i < 256; i++) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      face = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      face = [0, -stepY, 0];
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      face = [0, 0, -stepZ];
    }
    if (t > maxDist) return null;
    if (y < 0 || y > 255) {
      if (y < 0) return null; // 世界底以下无物
      return null;
    }
    const id = store.getBlock(x, y, z);
    if (id !== BlockId.AIR && blockInfo(id).selectable) {
      return {
        block: [x, y, z],
        face,
        id,
        point: [origin[0] + dx * t, origin[1] + dy * t, origin[2] + dz * t],
        distance: t
      };
    }
  }
  return null;
}
