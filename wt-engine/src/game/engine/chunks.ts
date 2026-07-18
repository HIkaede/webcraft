/**
 * 区块存储 + 光照（game.md §2.1）。
 *
 * - Chunk：方块数据 Uint8Array(16×128×16) + 天空光/方块光两个光照数组
 * - 天空光：列顶向下首个不透明格之上为 15，其下 0（树叶/水每格 −1 衰减）
 * - 方块光：火把 14 / 荧石 15，BFS 洪泛每格 −1（本区块范围内，边界近似截断）
 * - setBlock：记录 modified 差量（存档用）、标记本区块与相邻区块 dirty、
 *   重算光照、处理植物/火把支撑掉落
 */
import { BlockId } from '../engine-contract';
import { blockInfo } from './blocks';
import { CHUNK, WORLD_H } from './worldgen';
import type { WorldGen } from './worldgen';

const idx = (x: number, y: number, z: number) => (y * CHUNK + z) * CHUNK + x;
export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly data = new Uint8Array(CHUNK * WORLD_H * CHUNK);
  readonly sky = new Uint8Array(CHUNK * WORLD_H * CHUNK);
  readonly blk = new Uint8Array(CHUNK * WORLD_H * CHUNK);
  /** 网格是否需要重建 */
  meshDirty = true;
  /** 是否已挂载网格（引擎侧管理） */
  hasMesh = false;
  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
  }
}

export class ChunkStore {
  readonly chunks = new Map<string, Chunk>();
  /** 玩家修改差量 "x,y,z" -> blockId（0=空气），存档回放/保存用 */
  readonly modified: Record<string, number> = {};
  /** 需要重算光照+网格的区块 */
  private lightDirty = new Set<string>();

  readonly gen: WorldGen;

  constructor(gen: WorldGen, modified?: Record<string, number>) {
    this.gen = gen;
    if (modified) Object.assign(this.modified, modified);
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  /** 生成（或取已生成）区块数据：地形 → 回放 modified → 光照 */
  ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (c) return c;
    c = new Chunk(cx, cz);
    this.gen.generateChunk(cx, cz, c.data);
    // 回放修改差量
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    for (const k in this.modified) {
      const id = this.modified[k];
      const [sx, sy, sz] = k.split(',');
      const x = +sx;
      const y = +sy;
      const z = +sz;
      if (x >= x0 && x < x0 + CHUNK && z >= z0 && z < z0 + CHUNK && y >= 0 && y < WORLD_H) {
        c.data[idx(x - x0, y, z - z0)] = id;
      }
    }
    this.chunks.set(key, c);
    this.computeSkyLight(c);
    this.computeBlockLight(c);
    return c;
  }

  /** 卸载区块（引擎负责先 dispose 网格） */
  removeChunk(cx: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cz));
  }

  getBlock(x: number, y: number, z: number): BlockId {
    if (y < 0 || y >= WORLD_H) return BlockId.AIR;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return BlockId.AIR;
    return c.data[idx(x - cx * CHUNK, y, z - cz * CHUNK)] as BlockId;
  }

  /** 是否已加载（未加载区域物理视为空气） */
  isLoaded(x: number, z: number): boolean {
    return this.chunks.has(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
  }

  /**
   * 设置方块（玩家交互）：数据 + 差量 + dirty 标记 + 光照重算 + 支撑检查。
   * 返回是否实际改变。
   */
  setBlock(x: number, y: number, z: number, id: BlockId, record = true): boolean {
    if (y < 0 || y >= WORLD_H) return false;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const key = chunkKey(cx, cz);
    const c = this.chunks.get(key);
    if (!c) return false;
    const lx = x - cx * CHUNK;
    const lz = z - cz * CHUNK;
    const i = idx(lx, y, lz);
    const prev = c.data[i];
    if (prev === id) return false;
    c.data[i] = id;
    if (record) this.modified[`${x},${y},${z}`] = id;

    // 边界方块变化 → 相邻区块也要重建（game.md §2.1）
    this.lightDirty.add(key);
    if (lx === 0) this.lightDirty.add(chunkKey(cx - 1, cz));
    if (lx === CHUNK - 1) this.lightDirty.add(chunkKey(cx + 1, cz));
    if (lz === 0) this.lightDirty.add(chunkKey(cx, cz - 1));
    if (lz === CHUNK - 1) this.lightDirty.add(chunkKey(cx, cz + 1));
    // 高度变化跨区块不影响（光照按列），但邻区块光照近似重算
    this.flushLightDirty();

    // 支撑检查：上方植物/火把失去支撑时掉落（game.md §5 P2，低成本直接做）
    if (y + 1 < WORLD_H) {
      const above = this.getBlock(x, y + 1, z);
      const aInfo = blockInfo(above);
      if (aInfo.needsSupport && !this.isSolidTop(x, y, z)) {
        this.setBlock(x, y + 1, z, BlockId.AIR);
      }
    }
    // 自身若是支撑依赖方块，检查脚下
    if (blockInfo(id).needsSupport && !this.isSolidTop(x, y - 1, z)) {
      this.setBlock(x, y, z, BlockId.AIR);
      return false;
    }
    return true;
  }

  /** 顶面是否固体（植物/火把支撑判定） */
  isSolidTop(x: number, y: number, z: number): boolean {
    if (y < 0) return false;
    const b = blockInfo(this.getBlock(x, y, z));
    return b.opaque;
  }

  /** 重算所有标记区块的光照并标记网格 dirty */
  flushLightDirty(): void {
    if (this.lightDirty.size === 0) return;
    for (const key of this.lightDirty) {
      const c = this.chunks.get(key);
      if (!c) continue;
      this.computeSkyLight(c);
      this.computeBlockLight(c);
      c.meshDirty = true;
    }
    this.lightDirty.clear();
  }

  /** 天空光：列顶向下扫描；不透明 → 0；树叶/水每格 −1 */
  computeSkyLight(c: Chunk): void {
    for (let z = 0; z < CHUNK; z++)
      for (let x = 0; x < CHUNK; x++) {
        let l = 15;
        for (let y = WORLD_H - 1; y >= 0; y--) {
          const i = idx(x, y, z);
          const id = c.data[i];
          if (id !== BlockId.AIR) {
            const info = blockInfo(id);
            if (info.opaque) l = 0;
            else l = Math.max(0, l - (id === BlockId.WATER ? 2 : 1));
          }
          c.sky[i] = l;
        }
      }
  }

  /** 方块光：BFS 洪泛（本区块内，每格 −1，≤0 止） */
  computeBlockLight(c: Chunk): void {
    c.blk.fill(0);
    // 队列（预分配，避免热循环分配）
    const queue = new Int32Array(CHUNK * WORLD_H * CHUNK);
    let head = 0;
    let tail = 0;
    for (let y = 0; y < WORLD_H; y++)
      for (let z = 0; z < CHUNK; z++)
        for (let x = 0; x < CHUNK; x++) {
          const i = idx(x, y, z);
          const info = blockInfo(c.data[i]);
          if (info.light > 0) {
            c.blk[i] = info.light;
            queue[tail++] = i;
          }
        }
    const DIRS = [1, -1, CHUNK, -CHUNK, CHUNK * CHUNK, -CHUNK * CHUNK];
    while (head < tail) {
      const i = queue[head++];
      const l = c.blk[i] - 1;
      if (l <= 0) continue;
      const x = i % CHUNK;
      const z = ((i / CHUNK) | 0) % CHUNK;
      const y = (i / (CHUNK * CHUNK)) | 0;
      for (let d = 0; d < 6; d++) {
        // 边界检查（不跨区块：近似截断）
        if (d === 0 && x === CHUNK - 1) continue;
        if (d === 1 && x === 0) continue;
        if (d === 2 && z === CHUNK - 1) continue;
        if (d === 3 && z === 0) continue;
        if (d === 4 && y === WORLD_H - 1) continue;
        if (d === 5 && y === 0) continue;
        const ni = i + DIRS[d];
        if (c.blk[ni] >= l) continue;
        if (blockInfo(c.data[ni]).opaque) continue;
        c.blk[ni] = l;
        queue[tail++] = ni;
      }
    }
  }

  /** 读取天空光（未加载 → 15） */
  skyLight(x: number, y: number, z: number): number {
    if (y < 0) return 0;
    if (y >= WORLD_H) return 15;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 15;
    return c.sky[idx(x - cx * CHUNK, y, z - cz * CHUNK)];
  }

  /** 读取方块光（未加载 → 0） */
  blockLight(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_H) return 0;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 0;
    return c.blk[idx(x - cx * CHUNK, y, z - cz * CHUNK)];
  }
}
