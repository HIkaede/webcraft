/**
 * 共享游戏类型（纯类型模块，无运行时依赖）。
 *
 * 本模块是 stores / engine-contract / 各页面共用的单一类型来源，
 * 避免 worlds.ts ↔ engine-contract.ts 之间产生循环引用。
 * 对应 design.md §11（数据与持久化）与 inventory.md §D（注册表）。
 */

/** 游戏模式（design.md §11.1 WorldMeta.mode） */
export type GameMode = 'survival' | 'creative' | 'hardcore';

/** 难度（design.md §11.1） */
export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard';

/** 世界类型（create-world.md §B：默认 / 超平坦） */
export type WorldType = 'default' | 'flat';

/** 音效材质组（design.md §8：dig/place/step 按材质合成） */
export type SoundMaterial = 'stone' | 'wood' | 'grass' | 'sand' | 'glass';

/**
 * 物品堆（design.md §11.2 WorldSave.player.hotbar 元素）。
 * id 为 engine-contract.ts 中的 BlockId（物品 P2 扩展时使用 ≥1000 的物品 id 段）。
 */
export interface ItemStack {
  /** 方块/物品 id（见 engine-contract.ts BlockId） */
  id: number;
  /** 堆叠数量（1–64） */
  count: number;
}

/** 玩家持久化状态（design.md §11.2 WorldSave.player） */
export interface PlayerState {
  /** 脚部位置 [x, y, z]（世界坐标，米） */
  pos: [number, number, number];
  /** 水平朝向（度，-180..180，东方为 -90） */
  yaw: number;
  /** 俯仰（度，-89.9..89.9） */
  pitch: number;
  /** 生命（半心计，0–20） */
  health: number;
  /** 食物度（0–20） */
  food: number;
  /** 经验进度（0–1，升级到下一级所需的比例） */
  xp: number;
  /** 经验等级 */
  xpLevel: number;
  /** 快捷栏 9 槽（null = 空） */
  hotbar: (ItemStack | null)[];
  /** 当前游戏模式 */
  mode: GameMode;
}

/** 世界元数据（design.md §11.1，localStorage `mc.web.worlds` 元素） */
export interface WorldMeta {
  /** 唯一 id（创建时生成） */
  id: string;
  /** 世界名称（默认“新的世界”） */
  name: string;
  /** 字符串种子（hashSeed() 转为 int32 后驱动所有随机源） */
  seed: string;
  mode: GameMode;
  difficulty: Difficulty;
  /** 允许作弊（命令） */
  cheats: boolean;
  worldType: WorldType;
  /** 生成建筑（树/仙人掌/花草总开关） */
  structures: boolean;
  /** 奖励箱（P2） */
  bonusChest: boolean;
  /** 创建时间戳 ms */
  createdAt: number;
  /** 最近游玩时间戳 ms（世界列表按此倒序） */
  lastPlayedAt: number;
}

/** 完整世界存档（design.md §11.2，IndexedDB `mc-web` / store `worlds`） */
export interface WorldSave {
  meta: WorldMeta;
  /** 世界时间 tick（0–23999；日出 0、正午 6000、日落 12000、午夜 18000） */
  time: number;
  player: PlayerState;
  /** 出生点 [x, y, z] */
  spawn: [number, number, number];
  /** 玩家修改差量："x,y,z" → blockId（0 = 空气；加载时按种子重建地形后回放） */
  modified: Record<string, number>;
  /** 已达成的进度 id 列表（pause.md §B，P2） */
  advancements?: string[];
  /** 统计计数（pause.md §C，P2） */
  stats?: Record<string, number>;
}
