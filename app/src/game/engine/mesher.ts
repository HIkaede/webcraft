/**
 * 区块网格化（game.md §2.1）：面剔除 + 顶点 AO + 平滑光照。
 *
 * - 每区块产出 opaque（含 alphaTest 树叶/十字植物）与 transparent（水/玻璃）两份数据
 * - 顶点属性：position / uv / color（AO×面明暗×群系乘色）/ light（天空光+方块光，
 *   日照系数在材质 shader 中应用，昼夜变化无需重建网格）
 * - 面朝向明暗（原版常数）：顶 1.0、底 0.5、X± 0.6、Z± 0.8
 * - 顶点 AO：每角采样 3 邻居，等级 0–3 → 亮度 ×(0.5/0.65/0.8/1.0)
 */
import { BlockId } from '../engine-ids';
import { blockInfo } from './blocks';
import type { Atlas } from './atlas';
import type { ChunkStore, Chunk } from './chunks';
import { CHUNK, WORLD_H, BIOME_GRASS_TINT, BIOME_LEAF_TINT, BIRCH_LEAF_TINT } from './worldgen';

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  /** 每顶点 2 字节：天空光 / 方块光（0–15） */
  lights: Uint8Array;
  indices: Uint32Array;
}

export interface ChunkMeshResult {
  opaque: MeshData | null;
  transparent: MeshData | null;
}

const AO_FACTOR = [0.5, 0.65, 0.8, 1.0];

interface FaceDef {
  dir: [number, number, number];
  corners: [number, number, number][];
  shade: number;
}
/** 六面（CCW 外向；threejs 体素惯例） */
const FACES: FaceDef[] = [
  {
    dir: [-1, 0, 0],
    corners: [
      [0, 1, 0],
      [0, 0, 0],
      [0, 1, 1],
      [0, 0, 1]
    ],
    shade: 0.6
  }, // -X
  {
    dir: [1, 0, 0],
    corners: [
      [1, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
      [1, 0, 0]
    ],
    shade: 0.6
  }, // +X
  {
    dir: [0, -1, 0],
    corners: [
      [1, 0, 1],
      [0, 0, 1],
      [1, 0, 0],
      [0, 0, 0]
    ],
    shade: 0.5
  }, // -Y
  {
    dir: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [0, 1, 0],
      [1, 1, 0]
    ],
    shade: 1.0
  }, // +Y
  {
    dir: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 0]
    ],
    shade: 0.8
  }, // -Z
  {
    dir: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 1]
    ],
    shade: 0.8
  } // +Z
];

class BufferBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  lights: number[] = [];
  indices: number[] = [];
  get empty(): boolean {
    return this.indices.length === 0;
  }
  build(): MeshData {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      colors: new Float32Array(this.colors),
      lights: new Uint8Array(this.lights),
      indices: new Uint32Array(this.indices)
    };
  }
}

export function buildChunkMesh(
  store: ChunkStore,
  chunk: Chunk,
  atlas: Atlas,
  smooth: boolean
): ChunkMeshResult {
  const op = new BufferBuilder();
  const tr = new BufferBuilder();
  const cx0 = chunk.cx * CHUNK;
  const cz0 = chunk.cz * CHUNK;
  const data = chunk.data;

  const blockAt = (x: number, y: number, z: number): number => store.getBlock(x, y, z);
  const opaqueAt = (x: number, y: number, z: number): boolean => {
    if (y < 0) return true;
    if (y >= WORLD_H) return false;
    return blockInfo(store.getBlock(x, y, z)).opaque;
  };
  const skyAt = (x: number, y: number, z: number) => store.skyLight(x, y, z);
  const blkAt = (x: number, y: number, z: number) => store.blockLight(x, y, z);

  /** 计算一个面四个顶点的 AO 与光照（平滑光照开/关） */
  const aoOut = [3, 3, 3, 3];
  const skyOut = [15, 15, 15, 15];
  const blkOut = [0, 0, 0, 0];
  function computeCornerLight(wx: number, wy: number, wz: number, face: FaceDef): void {
    const ox = wx + face.dir[0];
    const oy = wy + face.dir[1];
    const oz = wz + face.dir[2];
    // 切向两轴
    let a1 = 0;
    let a2 = 1;
    if (face.dir[0] !== 0) {
      a1 = 1;
      a2 = 2;
    } else if (face.dir[1] !== 0) {
      a1 = 0;
      a2 = 2;
    } else {
      a1 = 0;
      a2 = 1;
    }

    const o = [ox, oy, oz];
    for (let i = 0; i < 4; i++) {
      const c = face.corners[i];
      const s1 = c[a1] === 1 ? 1 : -1;
      const s2 = c[a2] === 1 ? 1 : -1;
      const p1 = [o[0], o[1], o[2]];
      p1[a1] += s1;
      const p2 = [o[0], o[1], o[2]];
      p2[a2] += s2;
      const pc = [o[0], o[1], o[2]];
      pc[a1] += s1;
      pc[a2] += s2;
      if (!smooth) {
        aoOut[i] = 3;
        skyOut[i] = skyAt(o[0], o[1], o[2]);
        blkOut[i] = blkAt(o[0], o[1], o[2]);
        continue;
      }
      const o1 = opaqueAt(p1[0], p1[1], p1[2]) ? 1 : 0;
      const o2 = opaqueAt(p2[0], p2[1], p2[2]) ? 1 : 0;
      const oc = opaqueAt(pc[0], pc[1], pc[2]) ? 1 : 0;
      aoOut[i] = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
      // 平滑光照：4 格平均
      skyOut[i] = Math.round(
        (skyAt(o[0], o[1], o[2]) +
          skyAt(p1[0], p1[1], p1[2]) +
          skyAt(p2[0], p2[1], p2[2]) +
          skyAt(pc[0], pc[1], pc[2])) /
          4
      );
      blkOut[i] = Math.round(
        (blkAt(o[0], o[1], o[2]) +
          blkAt(p1[0], p1[1], p1[2]) +
          blkAt(p2[0], p2[1], p2[2]) +
          blkAt(pc[0], pc[1], pc[2])) /
          4
      );
    }
  }

  function emitFace(
    bb: BufferBuilder,
    wx: number,
    wy: number,
    wz: number,
    face: FaceDef,
    tile: string,
    tint: [number, number, number] | null,
    useAO: boolean,
    min?: [number, number, number],
    max?: [number, number, number]
  ): void {
    if (useAO) computeCornerLight(wx, wy, wz, face);
    else {
      const ox = wx + face.dir[0];
      const oy = wy + face.dir[1];
      const oz = wz + face.dir[2];
      for (let i = 0; i < 4; i++) {
        aoOut[i] = 3;
        skyOut[i] = skyAt(ox, oy, oz);
        blkOut[i] = blkAt(ox, oy, oz);
      }
    }
    const [u0, v0, u1, v1] = atlas.uv(tile);
    const ndx = bb.positions.length / 3;
    const mn = min ?? [0, 0, 0];
    const mx = max ?? [1, 1, 1];
    for (let i = 0; i < 4; i++) {
      const c = face.corners[i];
      const px = wx + mn[0] + c[0] * (mx[0] - mn[0]);
      const py = wy + mn[1] + c[1] * (mx[1] - mn[1]);
      const pz = wz + mn[2] + c[2] * (mx[2] - mn[2]);
      bb.positions.push(px, py, pz);
      bb.normals.push(face.dir[0], face.dir[1], face.dir[2]);
      // uv：顶/底面用 (x,z)，侧面用水平轴 + y
      let u: number;
      let v: number;
      if (face.dir[1] !== 0) {
        u = c[0];
        v = c[2];
      } else if (face.dir[0] !== 0) {
        u = c[2];
        v = c[1];
      } else {
        u = c[0];
        v = c[1];
      }
      bb.uvs.push(u0 + u * (u1 - u0), v0 + v * (v1 - v0));
      const f = face.shade * AO_FACTOR[aoOut[i]];
      if (tint) bb.colors.push(f * tint[0], f * tint[1], f * tint[2]);
      else bb.colors.push(f, f, f);
      bb.lights.push(skyOut[i], blkOut[i]);
    }
    bb.indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
  }

  /** 十字面片（双面发射） */
  function emitCross(
    bb: BufferBuilder,
    wx: number,
    wy: number,
    wz: number,
    tile: string,
    tint: [number, number, number] | null
  ): void {
    const [u0, v0, u1, v1] = atlas.uv(tile);
    const sky = skyAt(wx, wy, wz);
    const blk = blkAt(wx, wy, wz);
    const quads: [number, number, number][][] = [
      [
        [0, 0, 0],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 0]
      ],
      [
        [1, 0, 0],
        [0, 0, 1],
        [0, 1, 1],
        [1, 1, 0]
      ]
    ];
    for (const q of quads) {
      for (let rev = 0; rev < 2; rev++) {
        const ndx = bb.positions.length / 3;
        const order = rev === 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];
        for (const oi of order) {
          const c = q[oi];
          bb.positions.push(wx + c[0], wy + c[1], wz + c[2]);
          bb.normals.push(0, 1, 0);
          bb.uvs.push(u0 + c[0] * (u1 - u0), v0 + c[1] * (v1 - v0));
          if (tint) bb.colors.push(tint[0], tint[1], tint[2]);
          else bb.colors.push(1, 1, 1);
          bb.lights.push(sky, blk);
        }
        bb.indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
      }
    }
  }

  /** 火把（小盒体，0.125 宽、0.625 高，居中） */
  function emitTorch(bb: BufferBuilder, wx: number, wy: number, wz: number, tile: string): void {
    const mn: [number, number, number] = [0.4375, 0, 0.4375];
    const mx: [number, number, number] = [0.5625, 0.625, 0.5625];
    for (const face of FACES) {
      if (face.dir[1] === -1) continue; // 底面不画
      emitFace(bb, wx, wy, wz, face, tile, null, false, mn, mx);
    }
  }

  const biomeCache = new Map<string, ReturnType<typeof storeBiome>>();
  function storeBiome(x: number, z: number) {
    return store.gen.biomeAt(x, z);
  }
  const biomeAt = (x: number, z: number) => {
    const key = `${x},${z}`;
    let b = biomeCache.get(key);
    if (!b) {
      b = storeBiome(x, z);
      biomeCache.set(key, b);
    }
    return b;
  };

  for (let y = 0; y < WORLD_H; y++)
    for (let z = 0; z < CHUNK; z++)
      for (let x = 0; x < CHUNK; x++) {
        const id = data[(y * CHUNK + z) * CHUNK + x];
        if (id === BlockId.AIR) continue;
        const info = blockInfo(id);
        const wx = cx0 + x;
        const wy = y;
        const wz = cz0 + z;

        if (info.kind === 'cross') {
          const tint = info.tint === 'grass' ? BIOME_GRASS_TINT[biomeAt(wx, wz)] : null;
          emitCross(op, wx, wy, wz, info.tex.side, tint as [number, number, number] | null);
          continue;
        }
        if (info.kind === 'torch') {
          emitTorch(op, wx, wy, wz, info.tex.side);
          continue;
        }

        if (info.kind === 'water') {
          const above = blockAt(wx, wy + 1, wz);
          const topH: [number, number, number] = [1, above === BlockId.WATER ? 1 : 0.875, 1];
          for (const face of FACES) {
            const nx = wx + face.dir[0];
            const ny = wy + face.dir[1];
            const nz = wz + face.dir[2];
            const n = blockAt(nx, ny, nz);
            if (n === BlockId.WATER) continue;
            if (blockInfo(n).opaque) continue;
            if (face.dir[1] === 1 && above === BlockId.WATER) continue;
            emitFace(tr, wx, wy, wz, face, info.tex.side, null, false, [0, 0, 0], topH);
          }
          continue;
        }

        // 立方体（不透明 / 树叶 / 玻璃 / 仙人掌等）
        const isGlass = info.kind === 'glass';
        const bb = isGlass ? tr : op;
        let tint: [number, number, number] | null = null;
        if (info.tint === 'leaves') {
          tint = id === BlockId.BIRCH_LEAVES ? BIRCH_LEAF_TINT : BIOME_LEAF_TINT[biomeAt(wx, wz)];
        }
        for (const face of FACES) {
          const nx = wx + face.dir[0];
          const ny = wy + face.dir[1];
          const nz = wz + face.dir[2];
          const n = blockAt(nx, ny, nz);
          if (n !== BlockId.AIR) {
            const nInfo = blockInfo(n);
            if (nInfo.opaque) continue; // 被不透明邻居遮挡
            if (n === id) continue; // 同种透明方块互剔（玻璃/树叶/水）
            if (isGlass && nInfo.kind === 'glass') continue;
          }
          // 面纹理选择
          let tile = info.tex.side;
          if (face.dir[1] === 1 && info.tex.top) tile = info.tex.top;
          else if (face.dir[1] === -1 && info.tex.bottom) tile = info.tex.bottom;
          else if (face.dir[2] === 1 && info.tex.front) tile = info.tex.front; // 熔炉正面固定 +Z（无朝向状态，简化）
          // 草方块仅顶面乘群系色（侧面绿色裙边已预烘焙）
          const faceTint =
            info.tint === 'grass' && face.dir[1] === 1
              ? (BIOME_GRASS_TINT[biomeAt(wx, wz)] as [number, number, number])
              : tint;
          emitFace(bb, wx, wy, wz, face, tile, faceTint, true);
        }
      }

  return {
    opaque: op.empty ? null : op.build(),
    transparent: tr.empty ? null : tr.build()
  };
}
