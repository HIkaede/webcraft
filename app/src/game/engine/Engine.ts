/**
 * Engine —— 体素引擎主类（game.md 全部系统的装配点）。
 *
 * 职责：
 * - three.js 渲染器/场景/相机、体素双通道材质（不透明 alphaTest + 透明）
 * - 区块生命周期：按渲染距离挂载/卸载，每帧 8ms 预算构建网格
 * - 玩家物理 + 视角 + 交互（挖掘进度/裂纹/放置/高亮）
 * - 昼夜（Sky）、粒子、雾、水面动画
 * - 生存系统：坠落伤害、饥饿、回复、死亡
 * - 存档快照（captureSave）与 60s 自动保存请求
 *
 * 事件（ENGINE_EVENTS）→ GamePage/HUD 订阅。
 */
import * as THREE from 'three';
import { BlockId } from '../engine-ids';
import type {
  VoxelEngine,
  VoxelEngineOptions,
  PlayerInput,
  RaycastHit,
  EngineEventName,
  EngineEventHandler
} from '../engine-ids';
import { ENGINE_EVENTS } from '../engine-ids';
import type { WorldSave, WorldMeta } from '../types';
import { createWorldGen, CHUNK, WORLD_H } from './worldgen';
import { ChunkStore, chunkKey } from './chunks';
import type { Chunk } from './chunks';
import { buildChunkMesh } from './mesher';
import type { MeshData } from './mesher';
import { createAtlas } from './atlas';
import { blockInfo } from './blocks';
import { Sky } from './sky';
import { ParticleSystem } from './particles';
import { createBody, stepPhysics, EYE_HEIGHT, type PhysicsBody } from './physics';
import { raycastVoxel } from './raycast';
import { useGameStore } from '@/stores/game';
import { useSettingsStore } from '@/stores/settings';
import { soundManager } from '../sound/SoundManager';
import type { SoundMaterial } from '../types';

/* ------------------------------------------------------------------ */
/* 体素材质（顶点色 × 光照属性 × 日照系数）                              */
/* ------------------------------------------------------------------ */

function makeVoxelMaterial(
  map: THREE.Texture,
  opts: { alphaTest: boolean; transparent: boolean }
): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      map: { value: map },
      sunFactor: { value: 1.0 },
      opacity: { value: opts.transparent ? 0.85 : 1.0 }
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute vec2 light;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec2 vLight;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vColor = color;
        vLight = light;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float sunFactor;
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec2 vLight;
      #include <fog_pars_fragment>
      void main() {
        vec4 tex = texture2D(map, vUv);
        ${opts.alphaTest ? 'if (tex.a < 0.5) discard;' : ''}
        float sky = vLight.x / 15.0 * sunFactor;
        float blk = vLight.y / 15.0;
        float l = clamp(max(sky, blk), 0.06, 1.0);
        l = pow(l, 0.85);
        gl_FragColor = vec4(tex.rgb * vColor * l, tex.a * opacity);
        #include <fog_fragment>
      }
    `,
    transparent: opts.transparent,
    depthWrite: !opts.transparent,
    fog: true,
    side: THREE.FrontSide
  });
  return mat;
}

function meshDataToGeometry(data: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  g.setAttribute('light', new THREE.BufferAttribute(data.lights, 2));
  g.setIndex(new THREE.BufferAttribute(data.indices, 1));
  return g;
}

interface ChunkMeshes {
  opaque: THREE.Mesh | null;
  transparent: THREE.Mesh | null;
}

/* ------------------------------------------------------------------ */

export class Engine implements VoxelEngine {
  readonly input: PlayerInput;
  /** GamePage 注入：世界元数据（captureSave 用） */
  worldMeta: WorldMeta | null = null;
  /** 初始加载进度 0–1（加载屏用） */
  initProgress = 0;
  isReady = false;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly atlas = createAtlas();
  private readonly store: ChunkStore;
  private readonly sky: Sky;
  private readonly particles = new ParticleSystem();
  private readonly matOpaque: THREE.ShaderMaterial;
  private readonly matTransparent: THREE.ShaderMaterial;
  private readonly chunkMeshes = new Map<string, ChunkMeshes>();

  private readonly body: PhysicsBody;
  private yawDeg = 0;
  private pitchDeg = 0;
  private timeTicks = 1000;
  private paused = false;
  private disposed = false;

  private readonly spawnPoint: [number, number, number];
  private mode: 'survival' | 'creative' | 'hardcore';
  private readonly difficulty: string;
  private renderDistance: number;

  // 交互状态
  private digTarget: string | null = null;
  private digProgress = 0;
  private digSoundTimer = 0;
  private placeCooldown = 0;
  private readonly highlight: THREE.LineSegments;
  private readonly crackMesh: THREE.Mesh;
  private currentHit: RaycastHit | null = null;
  private lastTargetKey: string | null = null;

  // 交互输入（InputSystem 写入）
  primaryDown = false;
  secondaryDown = false;

  // 生存系统
  private fallDistance = 0;
  private hungerTimer = 0;
  private regenTimer = 0;
  private stepDistance = 0;

  // 事件
  private readonly handlers = new Map<string, Set<EngineEventHandler>>();

  // 帧调度
  private lastFrame = 0;
  private rafId = 0;
  private saveTimer = 0;
  private moveEmitTimer = 0;
  private timeEmitTimer = 0;
  private waterFrame = 0;
  private waterTimer = 0;
  private fpsSamples: number[] = [];
  private chunkUpdatesLastSec = 0;
  private chunkUpdateCounter = 0;
  private fpsTimer = 0;
  private readonly camPos = new THREE.Vector3();

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, opts: VoxelEngineOptions) {
    this.canvas = canvas;
    this.mode = opts.mode;
    this.difficulty = opts.difficulty;
    this.renderDistance = opts.renderDistance;
    this.input = {
      forward: false,
      back: false,
      left: false,
      right: false,
      jump: false,
      sneak: false,
      sprint: false
    };

    const gen = createWorldGen(opts.seed, opts.worldType, opts.structures);
    this.store = new ChunkStore(gen, opts.save?.modified);
    this.spawnPoint = opts.save?.spawn ?? gen.findSpawn();
    this.timeTicks = opts.save?.time ?? 1000;

    // 玩家初始位置
    const startPos = opts.save?.player.pos ?? this.spawnPoint;
    this.body = createBody([...startPos]);
    this.yawDeg = opts.save?.player.yaw ?? 0;
    this.pitchDeg = opts.save?.player.pitch ?? 0;

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio, 1), 2));
    this.renderer.setSize(
      canvas.clientWidth || window.innerWidth,
      canvas.clientHeight || window.innerHeight,
      false
    );

    this.camera = new THREE.PerspectiveCamera(opts.fov, 1, 0.08, 1200);
    this.camera.rotation.order = 'YXZ';
    this.resize();

    // 材质与天空
    this.matOpaque = makeVoxelMaterial(this.atlas.textures[0], {
      alphaTest: true,
      transparent: false
    });
    this.matTransparent = makeVoxelMaterial(this.atlas.textures[0], {
      alphaTest: false,
      transparent: true
    });
    this.sky = new Sky(this.renderDistance);
    this.scene.add(this.sky.group);
    this.scene.fog = new THREE.Fog(
      0xc0d8ff,
      (this.renderDistance - 1.5) * 16,
      this.renderDistance * 16
    );
    this.scene.background = new THREE.Color(0x78a7ff);

    // 方块高亮线框（外扩 0.002，game.md §6）
    const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.highlight = new THREE.LineSegments(
      hlGeo,
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8 })
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // 裂纹覆盖（10 阶段）
    this.crackMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.004, 1.004, 1.004),
      new THREE.MeshBasicMaterial({
        map: this.atlas.crackTextures[0],
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1
      })
    );
    this.crackMesh.visible = false;
    this.scene.add(this.crackMesh);

    this.scene.add(this.particles.mesh);

    // 预生成出生点周围区块数据（首帧不空）
    const scx = Math.floor(startPos[0] / CHUNK);
    const scz = Math.floor(startPos[2] / CHUNK);
    this.store.ensureChunk(scx, scz);

    window.addEventListener('resize', this.resize);
    this.lastFrame = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  /* ---------------- 事件 ---------------- */
  on(event: EngineEventName, handler: EngineEventHandler): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }
  off(event: EngineEventName, handler: EngineEventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }
  private emit(event: EngineEventName, payload: unknown): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(payload);
      } catch {
        /* 忽略 UI 侧异常 */
      }
    });
  }

  /* ---------------- 契约方法 ---------------- */
  setBlock(x: number, y: number, z: number, id: BlockId): void {
    const prev = this.store.getBlock(x, y, z);
    if (this.store.setBlock(x, y, z, id)) {
      this.emit(ENGINE_EVENTS.BLOCK_CHANGE, { x, y, z, id, prev });
    }
  }
  getBlock(x: number, y: number, z: number): BlockId {
    return this.store.getBlock(x, y, z);
  }
  raycast(maxDist: number): RaycastHit | null {
    return raycastVoxel(this.store, this.getEyePosition(), this.yawDeg, this.pitchDeg, maxDist);
  }
  spawnPlayer(pos: [number, number, number], yaw: number, pitch: number): void {
    this.body.pos = [...pos];
    this.body.vel = [0, 0, 0];
    this.body.flying = false;
    this.yawDeg = yaw;
    this.pitchDeg = pitch;
    this.fallDistance = 0;
  }
  setTime(t: number): void {
    this.timeTicks = ((t % 24000) + 24000) % 24000;
    this.emit(ENGINE_EVENTS.TIME_UPDATE, { time: this.timeTicks });
  }
  getTime(): number {
    return this.timeTicks;
  }
  rotate(deltaYawDeg: number, deltaPitchDeg: number): void {
    this.yawDeg = (((this.yawDeg + deltaYawDeg) % 360) + 360) % 360;
    if (this.yawDeg > 180) this.yawDeg -= 360;
    this.pitchDeg = Math.max(-89.9, Math.min(89.9, this.pitchDeg + deltaPitchDeg));
  }
  getEyePosition(): [number, number, number] {
    return [this.body.pos[0], this.body.pos[1] + EYE_HEIGHT, this.body.pos[2]];
  }
  getYawPitch(): [number, number] {
    return [this.yawDeg, this.pitchDeg];
  }
  setPaused(paused: boolean): void {
    this.paused = paused;
  }
  /** 切换创造飞行（双击空格） */
  toggleFly(): void {
    if (this.mode !== 'creative') return;
    this.body.flying = !this.body.flying;
    if (this.body.flying) this.body.vel[1] = 0;
  }
  /** 切换模式（/gamemode 命令） */
  setMode(mode: 'survival' | 'creative' | 'hardcore'): void {
    this.mode = mode;
    if (mode !== 'creative') this.body.flying = false;
  }
  getSpawn(): [number, number, number] {
    return [...this.spawnPoint];
  }
  getBiomeAt(x: number, z: number): string {
    return this.store.gen.biomeAt(Math.floor(x), Math.floor(z));
  }
  getLightAt(x: number, y: number, z: number): [number, number] {
    return [this.store.skyLight(x, y, z), this.store.blockLight(x, y, z)];
  }
  getFps(): number {
    if (this.fpsSamples.length === 0) return 0;
    return this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
  }
  getChunkStats(): [number, number] {
    return [this.store.chunks.size, this.chunkMeshes.size];
  }
  getParticleCount(): number {
    return this.particles.activeCount;
  }
  getChunkUpdates(): number {
    return this.chunkUpdatesLastSec;
  }
  getTargetBlock(): RaycastHit | null {
    return this.currentHit;
  }
  isHeadInWater(): boolean {
    return this.body.headInWater;
  }
  getPlayerPos(): [number, number, number] {
    return [...this.body.pos];
  }
  isOnGround(): boolean {
    return this.body.onGround;
  }
  isFlying(): boolean {
    return this.body.flying;
  }
  getIconCanvas(id: number): HTMLCanvasElement {
    return this.atlas.getIcon(id);
  }

  captureSave(): WorldSave {
    const gs = useGameStore.getState();
    return {
      meta: this.worldMeta as WorldMeta,
      time: Math.round(this.timeTicks),
      player: {
        pos: [this.body.pos[0], this.body.pos[1], this.body.pos[2]],
        yaw: this.yawDeg,
        pitch: this.pitchDeg,
        health: gs.health,
        food: gs.food,
        xp: gs.xp,
        xpLevel: gs.xpLevel,
        hotbar: gs.hotbar,
        mode: gs.mode
      },
      spawn: [...this.spawnPoint],
      modified: { ...this.store.modified }
    };
  }

  /* ---------------- 主循环 ---------------- */
  private readonly tick = (now: number) => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.tick);
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;

    // FPS 统计（1s 滑动）
    this.fpsTimer += dt;
    if (dt > 0) this.fpsSamples.push(1 / dt);
    if (this.fpsTimer >= 1) {
      if (this.fpsSamples.length > 120) this.fpsSamples.splice(0, this.fpsSamples.length - 120);
      this.chunkUpdatesLastSec = this.chunkUpdateCounter;
      this.chunkUpdateCounter = 0;
      this.fpsTimer = 0;
    }

    if (!this.paused) {
      // 世界时间（20 tick/s）
      this.timeTicks = (this.timeTicks + dt * 20) % 24000;
      this.timeEmitTimer += dt;
      if (this.timeEmitTimer >= 1) {
        this.timeEmitTimer = 0;
        this.emit(ENGINE_EVENTS.TIME_UPDATE, { time: Math.round(this.timeTicks) });
      }

      this.stepPlayer(dt);
      this.stepInteraction(dt);
      this.stepSurvival(dt);

      // 自动保存
      this.saveTimer += dt;
      if (this.saveTimer >= 60) {
        this.saveTimer = 0;
        this.emit(ENGINE_EVENTS.REQUEST_SAVE, () => this.captureSave());
      }
    }

    // 区块维护（始终执行，保证暂停时也能完成加载）
    this.maintainChunks();

    // 天空/雾
    const eye = this.getEyePosition();
    this.camPos.set(eye[0], eye[1], eye[2]);
    this.sky.update(this.timeTicks, this.camPos, dt);
    this.matOpaque.uniforms.sunFactor.value = this.sky.sunFactor.value;
    this.matTransparent.uniforms.sunFactor.value = this.sky.sunFactor.value;
    (this.scene.background as THREE.Color).copy(this.sky.skyColor);
    const fog = this.scene.fog as THREE.Fog;
    if (this.body.headInWater) {
      fog.color.set(0x0a2472);
      fog.near = 2;
      fog.far = 12;
      (this.scene.background as THREE.Color).set(0x0a2472);
    } else {
      fog.color.copy(this.sky.fogColor);
      fog.near = Math.max(8, (this.renderDistance - 1.5) * 16);
      fog.far = this.renderDistance * 16;
    }

    // 水面动画（每 400ms 换帧）
    this.waterTimer += dt;
    if (this.waterTimer >= 0.4) {
      this.waterTimer = 0;
      this.waterFrame = 1 - this.waterFrame;
      const tex = this.atlas.textures[this.waterFrame];
      this.matTransparent.uniforms.map.value = tex;
    }

    // 粒子
    this.particles.update(dt, this.camera.quaternion);

    // 相机
    this.camera.position.copy(this.camPos);
    this.camera.rotation.set((this.pitchDeg * Math.PI) / 180, (this.yawDeg * Math.PI) / 180, 0);

    // 玩家移动事件（≤20Hz）
    this.moveEmitTimer += dt;
    if (this.moveEmitTimer >= 0.05) {
      this.moveEmitTimer = 0;
      this.emit(ENGINE_EVENTS.PLAYER_MOVE, {
        pos: [...this.body.pos],
        yaw: this.yawDeg,
        pitch: this.pitchDeg,
        onGround: this.body.onGround,
        inWater: this.body.inWater,
        headInWater: this.body.headInWater,
        flying: this.body.flying
      });
    }

    this.renderer.render(this.scene, this.camera);

    // 就绪判定
    if (!this.isReady && this.initProgress >= 1) {
      this.isReady = true;
      this.emit(ENGINE_EVENTS.READY, null);
    }
  };

  /* ---------------- 玩家 ---------------- */
  private stepPlayer(dt: number): void {
    const wasOnGround = this.body.onGround;
    const input = this.input;

    stepPhysics(
      this.store,
      this.body,
      {
        strafe: (input.right ? 1 : 0) - (input.left ? 1 : 0),
        forward: (input.forward ? 1 : 0) - (input.back ? 1 : 0),
        jump: input.jump,
        sneak: input.sneak,
        sprint: input.sprint
      },
      this.yawDeg,
      dt
    );

    // 坠落距离累计
    if (!this.body.onGround && !this.body.flying && !this.body.inWater) {
      this.fallDistance += Math.max(0, -this.body.vel[1] * dt);
    } else if (this.body.inWater || this.body.flying) {
      this.fallDistance = 0;
    }

    // 落地
    if (!wasOnGround && this.body.onGround) {
      if (this.fallDistance > 3 && this.mode !== 'creative') {
        const dmg = Math.floor(this.fallDistance - 3);
        if (dmg > 0) this.applyDamage(dmg);
      }
      this.fallDistance = 0;
      // 脚步声（落地）
      this.playStepSound();
    }

    // 行走脚步声
    if (this.body.onGround) {
      const vx = this.body.vel[0];
      const vz = this.body.vel[2];
      this.stepDistance += Math.hypot(vx, vz) * dt;
      if (this.stepDistance >= 2.2) {
        this.stepDistance = 0;
        this.playStepSound();
      }
    }
  }

  private playStepSound(): void {
    const below = this.store.getBlock(
      Math.floor(this.body.pos[0]),
      Math.floor(this.body.pos[1] - 0.5),
      Math.floor(this.body.pos[2])
    );
    const mat = blockInfo(below).sound;
    if (mat) soundManager.step(mat as SoundMaterial);
  }

  private applyDamage(amount: number): void {
    const gs = useGameStore.getState();
    gs.damage(amount);
    soundManager.play('random.hurt');
    this.emit(ENGINE_EVENTS.PLAYER_DAMAGE, { health: useGameStore.getState().health, amount });
    if (useGameStore.getState().health <= 0) {
      this.emit(ENGINE_EVENTS.PLAYER_DEATH, { health: 0 });
    }
  }

  private stepSurvival(dt: number): void {
    if (this.mode === 'creative') return;
    const gs = useGameStore.getState();
    const peaceful = this.difficulty === 'peaceful';

    // 饥饿消耗（约 90s 掉半格）
    this.hungerTimer += dt;
    if (this.hungerTimer >= 45) {
      this.hungerTimer = 0;
      if (!peaceful && gs.food > 0) gs.setFood(gs.food - 1);
    }

    // 回复 / 饥饿伤害
    this.regenTimer += dt;
    if (this.regenTimer >= 4) {
      this.regenTimer = 0;
      if ((peaceful || gs.food >= 18) && gs.health < 20 && gs.health > 0) {
        gs.heal(1);
      } else if (gs.food <= 0 && !peaceful && gs.health > 1) {
        this.applyDamage(1);
      }
    }
  }

  /* ---------------- 交互 ---------------- */
  private stepInteraction(dt: number): void {
    const gs = useGameStore.getState();
    const creative = gs.mode === 'creative';
    const reach = creative ? 5.0 : 4.5;
    const hit = this.raycast(reach);
    this.currentHit = hit;

    // 目标变化事件
    const key = hit ? hit.block.join(',') : null;
    if (key !== this.lastTargetKey) {
      this.lastTargetKey = key;
      this.emit(ENGINE_EVENTS.TARGET_BLOCK, hit);
      // 换目标重置挖掘
      this.digProgress = 0;
      this.digTarget = null;
    }

    // 高亮线框
    if (hit) {
      this.highlight.visible = true;
      this.highlight.position.set(hit.block[0] + 0.5, hit.block[1] + 0.5, hit.block[2] + 0.5);
    } else {
      this.highlight.visible = false;
    }

    // 挖掘
    if (this.primaryDown && hit && gs.overlay === 'none') {
      const info = blockInfo(hit.id);
      if (info.hardness !== Infinity) {
        const tKey = hit.block.join(',');
        if (this.digTarget !== tKey) {
          this.digTarget = tKey;
          this.digProgress = 0;
        }
        const hardness = creative ? 0.05 : Math.max(info.hardness, 0.05);
        this.digProgress += dt / hardness;
        // 挖掘循环音（每 250ms）
        this.digSoundTimer += dt;
        if (this.digSoundTimer >= 0.25 && info.sound) {
          this.digSoundTimer = 0;
          soundManager.dig(info.sound as SoundMaterial, { volume: 0.5 });
        }
        // 裂纹
        if (this.digProgress < 1) {
          const stage = Math.min(9, Math.floor(this.digProgress * 10));
          (this.crackMesh.material as THREE.MeshBasicMaterial).map =
            this.atlas.crackTextures[stage];
          this.crackMesh.visible = true;
          this.crackMesh.position.copy(this.highlight.position);
        }
        if (this.digProgress >= 1) {
          this.breakBlock(hit);
          this.digProgress = 0;
          this.digTarget = null;
        }
      }
    } else {
      this.digProgress = 0;
      this.digTarget = null;
      this.crackMesh.visible = false;
    }

    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
  }

  private breakBlock(hit: RaycastHit): void {
    const info = blockInfo(hit.id);
    this.setBlock(hit.block[0], hit.block[1], hit.block[2], BlockId.AIR);
    if (info.sound) soundManager.dig(info.sound as SoundMaterial);
    const particles = useSettingsStore.getState().particles;
    this.particles.burst(hit.block[0], hit.block[1], hit.block[2], hit.id, particles);
    soundManager.play('random.pop', { volume: 0.3, pitch: 0.8 });
  }

  /** 右键放置（InputSystem 边沿触发 + 长按连放由 GamePage 驱动） */
  tryPlace(): void {
    const gs = useGameStore.getState();
    if (gs.overlay !== 'none') return;
    if (this.placeCooldown > 0) return;
    const hit = this.currentHit ?? this.raycast(gs.mode === 'creative' ? 5.0 : 4.5);
    if (!hit) return;
    const stack = gs.hotbar[gs.selectedSlot];
    if (!stack || stack.id >= 1000) return; // 物品段不可放置
    const tx = hit.block[0] + hit.face[0];
    const ty = hit.block[1] + hit.face[1];
    const tz = hit.block[2] + hit.face[2];
    if (ty < 0 || ty >= WORLD_H) return;
    const existing = this.store.getBlock(tx, ty, tz);
    if (existing !== BlockId.AIR && blockInfo(existing).kind !== 'water') return;
    // 不与玩家重叠
    if (blockInfo(stack.id).solid && this.wouldCollidePlayer(tx, ty, tz)) return;
    this.setBlock(tx, ty, tz, stack.id as BlockId);
    const info = blockInfo(stack.id);
    if (info.sound) soundManager.place(info.sound as SoundMaterial);
    // 生存扣数量
    if (gs.mode !== 'creative') {
      const next = stack.count - 1;
      gs.setHotbarSlot(gs.selectedSlot, next > 0 ? { ...stack, count: next } : null);
    }
    this.placeCooldown = 0.2;
    this.emit(ENGINE_EVENTS.PLAYER_STATS, { placed: true });
  }

  private wouldCollidePlayer(bx: number, by: number, bz: number): boolean {
    const hw = 0.3;
    const p = this.body.pos;
    // 玩家 AABB 与方块 AABB 相交测试
    return !(
      p[0] + hw <= bx ||
      p[0] - hw >= bx + 1 ||
      p[1] + 1.8 <= by ||
      p[1] >= by + 1 ||
      p[2] + hw <= bz ||
      p[2] - hw >= bz + 1
    );
  }

  /* ---------------- 区块维护 ---------------- */
  private maintainChunks(): void {
    const pcx = Math.floor(this.body.pos[0] / CHUNK);
    const pcz = Math.floor(this.body.pos[2] / CHUNK);
    const rd = this.renderDistance;

    // 收集需要构建的区块（未生成 or meshDirty），按距离排序
    const needed: { cx: number; cz: number; d: number }[] = [];
    let totalNeeded = 0;
    let totalBuilt = 0;
    for (let dx = -rd; dx <= rd; dx++)
      for (let dz = -rd; dz <= rd; dz++) {
        totalNeeded++;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = chunkKey(cx, cz);
        const c = this.store.getChunk(cx, cz);
        const meshes = this.chunkMeshes.get(key);
        if (!c || c.meshDirty || !meshes) {
          needed.push({ cx, cz, d: dx * dx + dz * dz });
        } else {
          totalBuilt++;
        }
      }

    // 初始加载进度
    if (!this.isReady) {
      this.initProgress = totalBuilt / Math.max(1, totalNeeded);
    }

    needed.sort((a, b) => a.d - b.d);

    // 每帧 8ms 构建预算
    const budget = 8;
    const t0 = performance.now();
    const smooth = useSettingsStore.getState().smoothLighting;
    for (const n of needed) {
      if (performance.now() - t0 > budget) break;
      const c = this.store.ensureChunk(n.cx, n.cz);
      if (!c.meshDirty && this.chunkMeshes.get(chunkKey(n.cx, n.cz))) continue;
      this.buildChunk(c, smooth);
      this.chunkUpdateCounter++;
    }

    // 卸载过远区块
    const unloadR = rd + 2;
    for (const [key, c] of this.store.chunks) {
      const dx = c.cx - pcx;
      const dz = c.cz - pcz;
      if (Math.max(Math.abs(dx), Math.abs(dz)) > unloadR) {
        this.disposeChunkMeshes(key);
        this.store.removeChunk(c.cx, c.cz);
      }
    }
  }

  private buildChunk(c: Chunk, smooth: boolean): void {
    const key = chunkKey(c.cx, c.cz);
    const result = buildChunkMesh(this.store, c, this.atlas, smooth);
    this.disposeChunkMeshes(key);
    const meshes: ChunkMeshes = { opaque: null, transparent: null };
    if (result.opaque) {
      const m = new THREE.Mesh(meshDataToGeometry(result.opaque), this.matOpaque);
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      meshes.opaque = m;
    }
    if (result.transparent) {
      const m = new THREE.Mesh(meshDataToGeometry(result.transparent), this.matTransparent);
      m.matrixAutoUpdate = false;
      m.renderOrder = 1;
      this.scene.add(m);
      meshes.transparent = m;
    }
    this.chunkMeshes.set(key, meshes);
    c.meshDirty = false;
    c.hasMesh = true;
  }

  private disposeChunkMeshes(key: string): void {
    const meshes = this.chunkMeshes.get(key);
    if (!meshes) return;
    if (meshes.opaque) {
      this.scene.remove(meshes.opaque);
      meshes.opaque.geometry.dispose();
    }
    if (meshes.transparent) {
      this.scene.remove(meshes.transparent);
      meshes.transparent.geometry.dispose();
    }
    this.chunkMeshes.delete(key);
  }

  /* ---------------- 设置热更新 ---------------- */
  applySettings(): void {
    const s = useSettingsStore.getState();
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    if (s.renderDistance !== this.renderDistance) {
      this.renderDistance = s.renderDistance;
    }
    this.sky.setCloudsVisible(s.clouds);
  }

  private readonly resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.resize);
    for (const key of [...this.chunkMeshes.keys()]) this.disposeChunkMeshes(key);
    this.sky.dispose();
    this.particles.dispose();
    this.atlas.dispose();
    this.matOpaque.dispose();
    this.matTransparent.dispose();
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
    this.crackMesh.geometry.dispose();
    (this.crackMesh.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.handlers.clear();
  }
}
