/**
 * 方块破坏粒子（design.md §6.2）：20–25 个 0.06m 碎片 quad，
 * 初速 1–4m/s 上抛、重力 -20m/s²、寿命 0.5–1.0s、落地即隐。
 * 单个 InstancedMesh 池（上限 512），逐实例着色（方块代表色），零逐帧分配。
 */
import * as THREE from 'three';
import { mulberry32 } from './rng';
import { BlockId } from '../engine-ids';

const MAX = 512;

/** 方块代表色（碎片染色近似；按顶面/侧面主色） */
const BLOCK_COLORS: Record<number, number> = {
  [BlockId.GRASS_BLOCK]: 0x7fb354,
  [BlockId.DIRT]: 0x866043,
  [BlockId.STONE]: 0x7d7d7d,
  [BlockId.COBBLESTONE]: 0x6e6e6e,
  [BlockId.SAND]: 0xdbd3a0,
  [BlockId.SANDSTONE]: 0xd8ce9b,
  [BlockId.GRAVEL]: 0x8a7f74,
  [BlockId.OAK_LOG]: 0x6b5230,
  [BlockId.BIRCH_LOG]: 0xd8d8c8,
  [BlockId.OAK_LEAVES]: 0x4a8f28,
  [BlockId.BIRCH_LEAVES]: 0x67a844,
  [BlockId.OAK_PLANKS]: 0x9c8050,
  [BlockId.GLASS]: 0xdfefff,
  [BlockId.STONE_BRICKS]: 0x767676,
  [BlockId.BRICKS]: 0x96543f,
  [BlockId.BEDROCK]: 0x565656,
  [BlockId.COAL_ORE]: 0x4a4a4a,
  [BlockId.IRON_ORE]: 0xa8917c,
  [BlockId.GOLD_ORE]: 0xa89b5e,
  [BlockId.DIAMOND_ORE]: 0x6fb7ad,
  [BlockId.CRAFTING_TABLE]: 0x9c8050,
  [BlockId.FURNACE]: 0x5a5a5a,
  [BlockId.TORCH]: 0xffd84d,
  [BlockId.GLOWSTONE]: 0xf4d35e,
  [BlockId.OBSIDIAN]: 0x14101f,
  [BlockId.TNT]: 0xc33a2a,
  [BlockId.CACTUS]: 0x58822d,
  [BlockId.DANDELION]: 0xffd83d,
  [BlockId.POPPY]: 0xd02a2a,
  [BlockId.TALL_GRASS]: 0x6f9c40,
  [BlockId.WATER]: 0x3f76e4
};

interface Particle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  life: number;
  maxLife: number;
  size: number;
  ground: boolean;
}

export class ParticleSystem {
  readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly geo: THREE.PlaneGeometry;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly rng = mulberry32(20260717);
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private count = 0;

  constructor() {
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < MAX; i++) {
      this.particles.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        color: new THREE.Color(0xffffff),
        life: 0,
        maxLife: 1,
        size: 0.06,
        ground: false
      });
      this.mesh.setColorAt(i, this.particles[i].color);
    }
  }

  /** 当前活跃粒子数（F3 E: 显示用） */
  get activeCount(): number {
    return this.count;
  }

  /** 在方块中心爆裂 */
  burst(
    x: number,
    y: number,
    z: number,
    blockId: number,
    mode: 'all' | 'decreased' | 'minimal'
  ): void {
    if (mode === 'minimal') return;
    const n = mode === 'decreased' ? 8 : 22;
    const base = BLOCK_COLORS[blockId] ?? 0x999999;
    for (let i = 0; i < n; i++) {
      const p = this.particles.find((q) => !q.alive);
      if (!p) return;
      p.alive = true;
      p.ground = false;
      p.pos.set(
        x + 0.5 + (this.rng() - 0.5) * 0.6,
        y + 0.5 + (this.rng() - 0.5) * 0.6,
        z + 0.5 + (this.rng() - 0.5) * 0.6
      );
      p.vel.set((this.rng() - 0.5) * 3, 1.5 + this.rng() * 2.5, (this.rng() - 0.5) * 3);
      p.life = 0;
      p.maxLife = 0.5 + this.rng() * 0.5;
      p.size = 0.05 + this.rng() * 0.03;
      const f = 0.8 + this.rng() * 0.4;
      p.color.setHex(base).multiplyScalar(f);
    }
  }

  update(dt: number, camQuat: THREE.Quaternion): void {
    let n = 0;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        continue;
      }
      if (!p.ground) {
        p.vel.y -= 20 * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.vel.y < 0 && p.pos.y < Math.floor(p.pos.y) + 0.03) {
          p.ground = true;
          p.vel.set(0, 0, 0);
        }
      }
      const fade = 1 - p.life / p.maxLife;
      this.q.copy(camQuat);
      this.s.setScalar(p.size * (0.5 + 0.5 * fade));
      this.m4.compose(p.pos, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m4);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.count = n;
    this.mesh.count = n;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
