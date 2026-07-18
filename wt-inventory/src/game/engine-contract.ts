/**
 * 体素引擎契约（engine-contract）。
 *
 * 本文件是「脚手架 / UI 层」与「体素引擎实现」之间的冻结接口。
 * 引擎代理将提供 createVoxelEngine 的真实实现并替换本文件末尾的 stub，
 * 但不得修改本文件中的类型与常量形状（HUD / 物品栏 / 覆盖层代理盲目依赖它们）。
 *
 * 注意：项目 tsconfig 开启 `erasableSyntaxOnly`，因此不使用 enum，
 * 以 const 对象 + 联合类型代替。
 */
import type { WorldSave, GameMode, Difficulty, WorldType, SoundMaterial } from './types';

/* ------------------------------------------------------------------ *
 * BlockId —— 方块注册表数值 id（与 inventory.md §D 注册表一一对应）
 * AIR = 0；常用别名（GRASS / PLANKS / LOG / LEAVES）一并导出。
 * 物品（镐/煤/钻石等，P2）约定使用 ≥ 1000 的 id 段，由物品栏代理扩展。
 * ------------------------------------------------------------------ */
export const BlockId = {
  AIR: 0,
  GRASS_BLOCK: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  SAND: 5,
  SANDSTONE: 6,
  GRAVEL: 7,
  OAK_LOG: 8,
  BIRCH_LOG: 9,
  OAK_LEAVES: 10,
  BIRCH_LEAVES: 11,
  OAK_PLANKS: 12,
  GLASS: 13,
  STONE_BRICKS: 14,
  BRICKS: 15,
  BEDROCK: 16,
  COAL_ORE: 17,
  IRON_ORE: 18,
  GOLD_ORE: 19,
  DIAMOND_ORE: 20,
  CRAFTING_TABLE: 21,
  FURNACE: 22,
  TORCH: 23,
  GLOWSTONE: 24,
  OBSIDIAN: 25,
  TNT: 26,
  WOOL_WHITE: 27,
  WOOL_GRAY: 28,
  WOOL_BLACK: 29,
  WOOL_RED: 30,
  WOOL_ORANGE: 31,
  WOOL_YELLOW: 32,
  WOOL_GREEN: 33,
  WOOL_BLUE: 34,
  CACTUS: 35,
  DANDELION: 36,
  POPPY: 37,
  TALL_GRASS: 38,
  WATER: 39,
  // —— 常用别名（与上文同值，便于阅读） ——
  GRASS: 1,
  LOG: 8,
  LEAVES: 10,
  PLANKS: 12
} as const;
export type BlockId = (typeof BlockId)[keyof typeof BlockId];

/** BlockId → inventory.md §D 字符串 id（命令 /give、存档调试显示用） */
export const BLOCK_STRING_IDS: Record<number, string> = {
  [BlockId.AIR]: 'air',
  [BlockId.GRASS_BLOCK]: 'grass_block',
  [BlockId.DIRT]: 'dirt',
  [BlockId.STONE]: 'stone',
  [BlockId.COBBLESTONE]: 'cobblestone',
  [BlockId.SAND]: 'sand',
  [BlockId.SANDSTONE]: 'sandstone',
  [BlockId.GRAVEL]: 'gravel',
  [BlockId.OAK_LOG]: 'oak_log',
  [BlockId.BIRCH_LOG]: 'birch_log',
  [BlockId.OAK_LEAVES]: 'oak_leaves',
  [BlockId.BIRCH_LEAVES]: 'birch_leaves',
  [BlockId.OAK_PLANKS]: 'oak_planks',
  [BlockId.GLASS]: 'glass',
  [BlockId.STONE_BRICKS]: 'stone_bricks',
  [BlockId.BRICKS]: 'bricks',
  [BlockId.BEDROCK]: 'bedrock',
  [BlockId.COAL_ORE]: 'coal_ore',
  [BlockId.IRON_ORE]: 'iron_ore',
  [BlockId.GOLD_ORE]: 'gold_ore',
  [BlockId.DIAMOND_ORE]: 'diamond_ore',
  [BlockId.CRAFTING_TABLE]: 'crafting_table',
  [BlockId.FURNACE]: 'furnace',
  [BlockId.TORCH]: 'torch',
  [BlockId.GLOWSTONE]: 'glowstone',
  [BlockId.OBSIDIAN]: 'obsidian',
  [BlockId.TNT]: 'tnt',
  [BlockId.WOOL_WHITE]: 'wool_white',
  [BlockId.WOOL_GRAY]: 'wool_gray',
  [BlockId.WOOL_BLACK]: 'wool_black',
  [BlockId.WOOL_RED]: 'wool_red',
  [BlockId.WOOL_ORANGE]: 'wool_orange',
  [BlockId.WOOL_YELLOW]: 'wool_yellow',
  [BlockId.WOOL_GREEN]: 'wool_green',
  [BlockId.WOOL_BLUE]: 'wool_blue',
  [BlockId.CACTUS]: 'cactus',
  [BlockId.DANDELION]: 'dandelion',
  [BlockId.POPPY]: 'poppy',
  [BlockId.TALL_GRASS]: 'tall_grass',
  [BlockId.WATER]: 'water'
};

/** 方块静态属性（引擎与 UI 共享的最小注册信息；物品栏代理可在此基础上扩展） */
export interface BlockDef {
  id: BlockId;
  /** 字符串 id（inventory.md §D 首列） */
  key: string;
  /** 中文名 */
  name: string;
  /** 徒手硬度（秒）；Infinity = 不可破坏（基岩），0 = 瞬间（花/草/火把） */
  hardness: number;
  /** 音效材质组（design.md §8） */
  sound: SoundMaterial | null;
  /** 是否透明/镂空（网格化时邻面剔除用） */
  transparent: boolean;
  /** 发光等级（0–15；火把 14、荧石 15） */
  light: number;
}

/* ------------------------------------------------------------------ *
 * ENGINE_EVENTS —— 引擎 → UI 的事件名常量（通过 VoxelEngine.on 订阅）
 * ------------------------------------------------------------------ */
export const ENGINE_EVENTS = {
  /** 引擎完成世界生成/读取并渲染出第一帧（payload: null） */
  READY: 'ready',
  /** 方块变化（payload: { x, y, z, id, prev }） */
  BLOCK_CHANGE: 'blockchange',
  /** 玩家位置/朝向更新（payload: { pos, yaw, pitch, onGround }；F3 用，≤20Hz） */
  PLAYER_MOVE: 'playermove',
  /** 玩家受伤（payload: { health, amount }） */
  PLAYER_DAMAGE: 'playerdamage',
  /** 玩家死亡（payload: { health: 0 }） */
  PLAYER_DEATH: 'playerdeath',
  /** 玩家状态（生命/食物/经验）任意变化（payload: Partial<PlayerState>） */
  PLAYER_STATS: 'playerstats',
  /** 世界时间变化（payload: { time }，tick 0–23999，低频） */
  TIME_UPDATE: 'timeupdate',
  /** 准星目标方块变化（payload: RaycastHit | null） */
  TARGET_BLOCK: 'targetblock',
  /** 请求静默自动保存（每 60s；payload: () => WorldSave，由 GamePage 落盘） */
  REQUEST_SAVE: 'requestsave',
  /** 引擎内部错误（payload: { message }） */
  ERROR: 'error'
} as const;
export type EngineEventName = (typeof ENGINE_EVENTS)[keyof typeof ENGINE_EVENTS];
export type EngineEventHandler = (payload: unknown) => void;

/* ------------------------------------------------------------------ *
 * 射线检测结果（game.md §5：体素 DDA，生存 4.5 格 / 创造 5.0 格）
 * ------------------------------------------------------------------ */
export interface RaycastHit {
  /** 命中方块坐标 */
  block: [number, number, number];
  /** 命中面法线（放置时目标格 = block + face） */
  face: [number, number, number];
  /** 命中方块的 id */
  id: BlockId;
  /** 命中点世界坐标 */
  point: [number, number, number];
  /** 射线距离（米） */
  distance: number;
}

/** 引擎启动参数（createVoxelEngine 第二参） */
export interface VoxelEngineOptions {
  /** int32 种子（worlds.ts 的 hashSeed(meta.seed) 结果） */
  seed: number;
  worldType: WorldType;
  mode: GameMode;
  difficulty: Difficulty;
  structures: boolean;
  /** 渲染距离（区块，2–12） */
  renderDistance: number;
  /** 视场角（30–110） */
  fov: number;
  /** 存档（继续游戏时传入；新游戏传 null） */
  save: WorldSave | null;
}

/** 玩家操控输入（引擎每帧读取；由 GamePage/输入层写入） */
export interface PlayerInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
}

/* ------------------------------------------------------------------ *
 * VoxelEngine —— 引擎实例接口
 * ------------------------------------------------------------------ */
export interface VoxelEngine {
  /** 设置方块（含合法性与光照/网格重建调度） */
  setBlock(x: number, y: number, z: number, id: BlockId): void;
  /** 读取方块（未加载区域返回 AIR） */
  getBlock(x: number, y: number, z: number): BlockId;
  /** 从玩家视点做体素 DDA 射线；maxDist 米内无命中返回 null */
  raycast(maxDist: number): RaycastHit | null;
  /** 放置/重置玩家到指定位置与朝向 */
  spawnPlayer(pos: [number, number, number], yaw: number, pitch: number): void;
  /** 设置世界时间（tick 0–23999） */
  setTime(t: number): void;
  /** 读取世界时间 */
  getTime(): number;
  /** 玩家输入状态（引擎每帧读取，输入层直接改字段即可） */
  readonly input: PlayerInput;
  /** 视角旋转增量（Pointer Lock 鼠标移动直接调用，内部按灵敏度换算） */
  rotate(deltaYawDeg: number, deltaPitchDeg: number): void;
  /** 玩家眼部世界坐标（HUD/F3/手部视图用） */
  getEyePosition(): [number, number, number];
  /** 暂停/恢复世界 tick（暂停菜单、覆盖层打开时冻结） */
  setPaused(paused: boolean): void;
  /** 采集当前存档快照（自动保存与退出流程用） */
  captureSave(): WorldSave;
  /** 订阅引擎事件（ENGINE_EVENTS）；返回取消订阅函数 */
  on(event: EngineEventName, handler: EngineEventHandler): () => void;
  /** 退订引擎事件 */
  off(event: EngineEventName, handler: EngineEventHandler): void;
  /** 释放全部 WebGL/内存资源（路由离开时必须调用） */
  dispose(): void;
}

/**
 * 创建体素引擎（工厂）。
 *
 * ⚠️ 当前为脚手架 stub：总是抛出异常。
 * 引擎代理实现后替换本函数（保持签名不变）；GamePage 会捕获该异常并
 * 显示「引擎加载中…」占位，因此脚手架阶段路由仍可正常进入。
 */
export function createVoxelEngine(
  _canvas: HTMLCanvasElement,
  _opts: VoxelEngineOptions
): VoxelEngine {
  void _canvas;
  void _opts;
  throw new Error(
    '[engine-contract] VoxelEngine 尚未实现：等待引擎代理接入 createVoxelEngine()。' +
      '签名与事件见 src/game/engine-contract.ts。'
  );
}

// 仅用于类型重导出，避免下游重复 import types.ts 路径
export type { WorldSave, GameMode, Difficulty, WorldType, SoundMaterial };
