/**
 * 玩家物理（game.md §4：Java 版数值）。
 *
 * - 碰撞箱：宽 0.6、高 1.8、眼高 1.62
 * - 步行 4.317 m/s、疾跑 5.612、潜行 1.31、飞行 10.9（创造）
 * - 跳跃初速 8.8 m/s（≈1.25 格）、重力 32 m/s²、终端速度 -78.4
 * - 水中：阻力大、可上游、缓慢下沉
 * - 积分顺序对齐 Java：先阻力 → 跳跃冲量 → 重力 → 轴分离移动（X/Z/A? 按 Y→X→Z）
 * - 轴分离 AABB：逐轴移动，碰撞时钳制到方块边界（极值钳制法）
 */
import { blockInfo } from './blocks';
import type { ChunkStore } from './chunks';

export const PLAYER_W = 0.6;
export const PLAYER_H = 1.8;
export const EYE_HEIGHT = 1.62;

export const WALK_SPEED = 4.317;
export const SPRINT_SPEED = 5.612;
export const SNEAK_SPEED = 1.31;
export const FLY_SPEED = 10.9;
export const JUMP_VELOCITY = 8.8;
export const GRAVITY = 32;
export const TERMINAL_VELOCITY = -78.4;

export interface PhysicsBody {
  /** 脚部中心位置 */
  pos: [number, number, number];
  vel: [number, number, number];
  onGround: boolean;
  /** 是否在水中 */
  inWater: boolean;
  /** 头部是否在水中（水下雾/气泡用） */
  headInWater: boolean;
  /** 是否飞行（创造双击空格） */
  flying: boolean;
}

export function createBody(pos: [number, number, number]): PhysicsBody {
  return {
    pos: [...pos],
    vel: [0, 0, 0],
    onGround: false,
    inWater: false,
    headInWater: false,
    flying: false
  };
}

/** 检查 AABB 是否与任何固体方块重叠 */
function collides(
  store: ChunkStore,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number
): boolean {
  const x0 = Math.floor(minX);
  const y0 = Math.floor(minY);
  const z0 = Math.floor(minZ);
  const x1 = Math.floor(maxX - 1e-9);
  const y1 = Math.floor(maxY - 1e-9);
  const z1 = Math.floor(maxZ - 1e-9);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        if (blockInfo(store.getBlock(x, y, z)).solid) return true;
      }
  return false;
}

/** 玩家 AABB 是否重叠（pos = 脚部中心） */
export function playerCollides(store: ChunkStore, pos: [number, number, number]): boolean {
  const hw = PLAYER_W / 2;
  return collides(
    store,
    pos[0] - hw,
    pos[1],
    pos[2] - hw,
    pos[0] + hw,
    pos[1] + PLAYER_H,
    pos[2] + hw
  );
}

/** 某位置脚部格 / 眼部格是否为水 */
function waterAt(store: ChunkStore, x: number, y: number, z: number): boolean {
  return blockInfo(store.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))).kind === 'water';
}

export interface MoveInput {
  /** 前/后/左/右（-1..1，已含朝向换算前的局部轴） */
  strafe: number; // +右
  forward: number; // +前
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
}

const AIRborne = { accel: 14, drag: 0.02 };
const GROUND = { accel: 60, drag: 0.35 };
const FLY = { accel: 40, drag: 0.2 };

/**
 * 推进一帧物理。返回本帧是否落地（用于脚步声）。
 * @param yawDeg 玩家朝向（度，-90 = 东，与 three 约定一致）
 */
export function stepPhysics(
  store: ChunkStore,
  body: PhysicsBody,
  input: MoveInput,
  yawDeg: number,
  dt: number
): void {
  const clampDt = Math.min(dt, 0.05);
  const [px, py, pz] = body.pos;

  // 水中状态
  body.inWater = waterAt(store, px, py + 0.4, pz);
  body.headInWater = waterAt(store, px, py + EYE_HEIGHT, pz);

  // 期望水平速度（局部 → 世界）
  const yaw = (yawDeg * Math.PI) / 180;
  // three 约定：yaw=0 朝 -Z，yaw=-90 朝 +X（东）
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // 前方向量 = (-sin(yaw), 0, -cos(yaw))？three 的相机默认看 -Z，yaw 绕 Y 轴逆时针。
  // forward 世界向量 = (−sin(yaw), 0, −cos(yaw))；右方 = (cos(yaw), 0, −sin(yaw))
  const fwdX = -sin;
  const fwdZ = -cos;
  const rightX = cos;
  const rightZ = -sin;

  let wishX = fwdX * input.forward + rightX * input.strafe;
  let wishZ = fwdZ * input.forward + rightZ * input.strafe;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  let targetSpeed = WALK_SPEED;
  if (input.sprint && input.forward > 0 && !input.sneak) targetSpeed = SPRINT_SPEED;
  if (input.sneak) targetSpeed = SNEAK_SPEED;

  if (body.flying) {
    // 飞行：无重力，垂直由 jump/sneak 控制
    const cfg = FLY;
    const tx = wishX * FLY_SPEED;
    const tz = wishZ * FLY_SPEED;
    body.vel[0] = approach(body.vel[0], tx, cfg.accel * clampDt);
    body.vel[2] = approach(body.vel[2], tz, cfg.accel * clampDt);
    const vy = (input.jump ? FLY_SPEED * 0.6 : 0) + (input.sneak ? -FLY_SPEED * 0.6 : 0);
    body.vel[1] = approach(body.vel[1], vy, cfg.accel * clampDt);
    body.onGround = false;
  } else if (body.inWater) {
    // 水中：慢速、可上浮
    const tx = wishX * targetSpeed * 0.5;
    const tz = wishZ * targetSpeed * 0.5;
    body.vel[0] = approach(body.vel[0], tx, 20 * clampDt);
    body.vel[2] = approach(body.vel[2], tz, 20 * clampDt);
    if (input.jump) body.vel[1] = approach(body.vel[1], 3.2, 30 * clampDt);
    else body.vel[1] = approach(body.vel[1], -1.6, 8 * clampDt);
    body.vel[1] = Math.max(body.vel[1], -4);
  } else {
    // 常规：先阻力 → 跳跃冲量 → 重力
    const cfg = body.onGround ? GROUND : AIRborne;
    const tx = wishX * targetSpeed;
    const tz = wishZ * targetSpeed;
    body.vel[0] = approach(body.vel[0], tx, cfg.accel * clampDt);
    body.vel[2] = approach(body.vel[2], tz, cfg.accel * clampDt);
    if (input.jump && body.onGround) {
      body.vel[1] = JUMP_VELOCITY;
      body.onGround = false;
    }
    body.vel[1] -= GRAVITY * clampDt;
    if (body.vel[1] < TERMINAL_VELOCITY) body.vel[1] = TERMINAL_VELOCITY;
  }

  // 轴分离移动（Y → X → Z）
  const hw = PLAYER_W / 2;
  body.onGround = false;

  // Y
  let ny = body.pos[1] + body.vel[1] * clampDt;
  if (
    collides(
      store,
      body.pos[0] - hw,
      ny,
      body.pos[2] - hw,
      body.pos[0] + hw,
      ny + PLAYER_H,
      body.pos[2] + hw
    )
  ) {
    if (body.vel[1] < 0) {
      // 落地：脚部所在格顶面 = floor(ny)+1
      ny = Math.floor(ny) + 1;
      // 极端情况（斜向挤入）下仍重叠时逐 0.01 上抬
      let guard = 0;
      while (
        guard++ < 200 &&
        collides(
          store,
          body.pos[0] - hw,
          ny,
          body.pos[2] - hw,
          body.pos[0] + hw,
          ny + PLAYER_H,
          body.pos[2] + hw
        )
      )
        ny += 0.01;
      body.onGround = true;
    } else {
      ny = Math.floor(ny + PLAYER_H) - PLAYER_H - 1e-4;
    }
    body.vel[1] = 0;
  }
  body.pos[1] = ny;

  // X
  let nx = body.pos[0] + body.vel[0] * clampDt;
  if (
    collides(
      store,
      nx - hw,
      body.pos[1],
      body.pos[2] - hw,
      nx + hw,
      body.pos[1] + PLAYER_H,
      body.pos[2] + hw
    )
  ) {
    nx = body.vel[0] > 0 ? Math.floor(nx + hw) - hw - 1e-4 : Math.ceil(nx - hw) + hw + 1e-4;
    body.vel[0] = 0;
  }
  body.pos[0] = nx;

  // Z
  let nz = body.pos[2] + body.vel[2] * clampDt;
  if (
    collides(
      store,
      body.pos[0] - hw,
      body.pos[1],
      nz - hw,
      body.pos[0] + hw,
      body.pos[1] + PLAYER_H,
      nz + hw
    )
  ) {
    nz = body.vel[2] > 0 ? Math.floor(nz + hw) - hw - 1e-4 : Math.ceil(nz - hw) + hw + 1e-4;
    body.vel[2] = 0;
  }
  body.pos[2] = nz;

  // 世界底部保护
  if (body.pos[1] < -16) {
    body.pos[1] = -16;
    body.vel[1] = 0;
  }
}

function approach(cur: number, target: number, delta: number): number {
  if (cur < target) return Math.min(cur + delta, target);
  if (cur > target) return Math.max(cur - delta, target);
  return cur;
}
