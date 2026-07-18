/**
 * 方块内部注册表（inventory.md §D + game.md §5 硬度表烘焙）。
 * 引擎单一 source of truth：硬度 / 音效材质 / 透明剔除 / 发光 / 纹理键 / 渲染模型。
 * （engine-contract.ts 的 BlockDef 为其公开子集，本表为其超集实现。）
 */
import { BlockId } from '../engine-contract';
import type { SoundMaterial } from '../types';

/** 物品 id 段（≥1000，engine-contract 约定由物品栏扩展；引擎仅需钻石物品用于钻石矿石掉落） */
export const ITEM_ID_DIAMOND = 1001;

/** 渲染模型 */
export type RenderKind =
  | 'cube' // 普通六面体
  | 'leaves' // 立方体 + alphaTest 镂空（不透明通道）
  | 'glass' // 立方体（透明通道）
  | 'water' // 流体（透明通道，顶面 14/16 高）
  | 'cross' // 十字面片植物（双面）
  | 'torch'; // 小火把盒体

/** 群系乘色（对灰度底纹做乘色，game.md §1.3） */
export type TintKind = 'none' | 'grass' | 'leaves';

export interface BlockInfo {
  id: number;
  key: string;
  name: string;
  /** 徒手硬度（秒）；Infinity = 不可破坏；≤0.05 = 瞬间 */
  hardness: number;
  /** 音效材质组（null = 无声，如水） */
  sound: SoundMaterial | null;
  /** 透明/镂空（邻面剔除用；transparent 方块不遮挡相邻面） */
  transparent: boolean;
  /** 是否不透光（遮挡天空光 & AO 计算） */
  opaque: boolean;
  /** 发光等级 0–15 */
  light: number;
  /** 参与碰撞（AABB） */
  solid: boolean;
  /** 可被射线选中（水不可选） */
  selectable: boolean;
  /** 渲染模型 */
  kind: RenderKind;
  /** 群系乘色 */
  tint: TintKind;
  /** 纹理：六面默认 side；含 top/bottom/front 时覆盖 */
  tex: { side: string; top?: string; bottom?: string; front?: string };
  /** 放置时需要下方支撑面为固体顶面 */
  needsSupport: boolean;
  /** 破坏掉落（undefined = 掉自身；null = 不掉落） */
  drop?: number | null;
}

function def(
  partial: Partial<BlockInfo> & Pick<BlockInfo, 'id' | 'key' | 'name' | 'tex'>
): BlockInfo {
  return {
    hardness: 1,
    sound: 'stone',
    transparent: false,
    opaque: true,
    light: 0,
    solid: true,
    selectable: true,
    kind: 'cube',
    tint: 'none',
    needsSupport: false,
    ...partial
  };
}

const B = BlockId;

/** 注册表（按 BlockId 索引；未用 id 为 AIR 占位） */
export const BLOCKS: BlockInfo[] = [];
function reg(info: BlockInfo): void {
  BLOCKS[info.id] = info;
}

reg(
  def({
    id: B.AIR,
    key: 'air',
    name: '空气',
    hardness: Infinity,
    sound: null,
    transparent: true,
    opaque: false,
    solid: false,
    selectable: false,
    kind: 'cross',
    tex: { side: 'glass' }
  })
);
reg(
  def({
    id: B.GRASS_BLOCK,
    key: 'grass_block',
    name: '草方块',
    hardness: 0.9,
    sound: 'grass',
    tint: 'grass',
    tex: { side: 'grass_side', top: 'grass_top', bottom: 'dirt' },
    drop: B.DIRT
  })
);
reg(
  def({
    id: B.DIRT,
    key: 'dirt',
    name: '泥土',
    hardness: 0.75,
    sound: 'grass',
    tex: { side: 'dirt' }
  })
);
reg(
  def({
    id: B.STONE,
    key: 'stone',
    name: '石头',
    hardness: 7.5,
    tex: { side: 'stone' },
    drop: B.COBBLESTONE
  })
);
reg(
  def({
    id: B.COBBLESTONE,
    key: 'cobblestone',
    name: '圆石',
    hardness: 7.5,
    tex: { side: 'cobble' }
  })
);
reg(
  def({
    id: B.SAND,
    key: 'sand',
    name: '沙子',
    hardness: 0.5,
    sound: 'sand',
    tex: { side: 'sand' }
  })
);
reg(
  def({
    id: B.SANDSTONE,
    key: 'sandstone',
    name: '砂岩',
    hardness: 4.0,
    tex: { side: 'sandstone', top: 'sandstone_top', bottom: 'sandstone_bottom' }
  })
);
reg(
  def({
    id: B.GRAVEL,
    key: 'gravel',
    name: '沙砾',
    hardness: 0.6,
    sound: 'sand',
    tex: { side: 'gravel' }
  })
);
reg(
  def({
    id: B.OAK_LOG,
    key: 'oak_log',
    name: '橡木原木',
    hardness: 3.0,
    sound: 'wood',
    tex: { side: 'oak_log', top: 'oak_log_top', bottom: 'oak_log_top' }
  })
);
reg(
  def({
    id: B.BIRCH_LOG,
    key: 'birch_log',
    name: '白桦原木',
    hardness: 3.0,
    sound: 'wood',
    tex: { side: 'birch_log', top: 'oak_log_top', bottom: 'oak_log_top' }
  })
);
reg(
  def({
    id: B.OAK_LEAVES,
    key: 'oak_leaves',
    name: '橡树树叶',
    hardness: 0.35,
    sound: 'grass',
    transparent: true,
    opaque: false,
    kind: 'leaves',
    tint: 'leaves',
    tex: { side: 'oak_leaves' },
    drop: null
  })
);
reg(
  def({
    id: B.BIRCH_LEAVES,
    key: 'birch_leaves',
    name: '白桦树叶',
    hardness: 0.35,
    sound: 'grass',
    transparent: true,
    opaque: false,
    kind: 'leaves',
    tint: 'leaves',
    tex: { side: 'birch_leaves' },
    drop: null
  })
);
reg(
  def({
    id: B.OAK_PLANKS,
    key: 'oak_planks',
    name: '橡木木板',
    hardness: 3.0,
    sound: 'wood',
    tex: { side: 'planks' }
  })
);
reg(
  def({
    id: B.GLASS,
    key: 'glass',
    name: '玻璃',
    hardness: 0.45,
    sound: 'glass',
    transparent: true,
    opaque: false,
    kind: 'glass',
    tex: { side: 'glass' },
    drop: null
  })
);
reg(
  def({
    id: B.STONE_BRICKS,
    key: 'stone_bricks',
    name: '石砖',
    hardness: 7.5,
    tex: { side: 'sbrick' }
  })
);
reg(def({ id: B.BRICKS, key: 'bricks', name: '砖块', hardness: 7.5, tex: { side: 'bricks' } }));
reg(
  def({ id: B.BEDROCK, key: 'bedrock', name: '基岩', hardness: Infinity, tex: { side: 'bedrock' } })
);
reg(
  def({ id: B.COAL_ORE, key: 'coal_ore', name: '煤矿石', hardness: 15, tex: { side: 'coal_ore' } })
);
reg(
  def({ id: B.IRON_ORE, key: 'iron_ore', name: '铁矿石', hardness: 15, tex: { side: 'iron_ore' } })
);
reg(
  def({ id: B.GOLD_ORE, key: 'gold_ore', name: '金矿石', hardness: 15, tex: { side: 'gold_ore' } })
);
reg(
  def({
    id: B.DIAMOND_ORE,
    key: 'diamond_ore',
    name: '钻石矿石',
    hardness: 15,
    tex: { side: 'diam_ore' },
    drop: ITEM_ID_DIAMOND
  })
);
reg(
  def({
    id: B.CRAFTING_TABLE,
    key: 'crafting_table',
    name: '工作台',
    hardness: 2.5,
    sound: 'wood',
    tex: { side: 'ctable_side', top: 'ctable_top', bottom: 'planks' }
  })
);
reg(
  def({
    id: B.FURNACE,
    key: 'furnace',
    name: '熔炉',
    hardness: 17.5,
    tex: { side: 'furnace_side', top: 'furnace_top', bottom: 'furnace_top', front: 'furnace_front' }
  })
);
reg(
  def({
    id: B.TORCH,
    key: 'torch',
    name: '火把',
    hardness: 0.05,
    sound: 'wood',
    transparent: true,
    opaque: false,
    light: 14,
    solid: false,
    kind: 'torch',
    tex: { side: 'torch' },
    needsSupport: true
  })
);
reg(
  def({
    id: B.GLOWSTONE,
    key: 'glowstone',
    name: '荧石',
    hardness: 1.5,
    sound: 'glass',
    light: 15,
    tex: { side: 'glow' }
  })
);
reg(
  def({ id: B.OBSIDIAN, key: 'obsidian', name: '黑曜石', hardness: 50, tex: { side: 'obsidian' } })
);
reg(
  def({
    id: B.TNT,
    key: 'tnt',
    name: 'TNT',
    hardness: 0.2,
    sound: 'grass',
    tex: { side: 'tnt_side', top: 'tnt_top', bottom: 'tnt_top' }
  })
);
reg(
  def({
    id: B.WOOL_WHITE,
    key: 'wool_white',
    name: '白色羊毛',
    hardness: 1.2,
    sound: 'grass',
    tex: { side: 'wool_white' }
  })
);
reg(
  def({
    id: B.WOOL_GRAY,
    key: 'wool_gray',
    name: '灰色羊毛',
    hardness: 1.2,
    sound: 'grass',
    tex: { side: 'wool_gray' }
  })
);
reg(
  def({
    id: B.WOOL_BLACK,
    key: 'wool_black',
    name: '黑色羊毛',
    hardness: 1.2,
    sound: 'grass',
    tex: { side: 'wool_black' }
  })
);
reg(
  def({
    id: B.WOOL_RED,
    key: 'wool_red',
    name: '红色羊毛',
    hardness: 1.2,
    sound: 'grass',
    tex: { side: 'wool_red' }
  })
);
reg(
  def({
    id: B.WOOL_ORANGE,
    key: 'wool_orange',
    name: '橙色羊毛',
    hardness: 1.2,
    sound: 'grass',
    tex: { side: 'wool_orange' }
  })
);
reg(def(defWool(B.WOOL_YELLOW, 'wool_yellow', '黄色羊毛')));
reg(
  def({
    id: B.WOOL_GREEN,
    key: 'wool_green',
    name: '绿色羊毛',
    hardness: 1.2,
    sound: 'grass',
    tex: { side: 'wool_green' }
  })
);
reg(
  def({
    id: B.WOOL_BLUE,
    key: 'wool_blue',
    name: '蓝色羊毛',
    hardness: 1.2,
    sound: 'grass',
    tex: { side: 'wool_blue' }
  })
);
function defWool(
  id: number,
  key: string,
  name: string
): Partial<BlockInfo> & Pick<BlockInfo, 'id' | 'key' | 'name' | 'tex'> {
  return { id, key, name, hardness: 1.2, sound: 'grass', tex: { side: key } };
}
reg(
  def({
    id: B.CACTUS,
    key: 'cactus',
    name: '仙人掌',
    hardness: 0.6,
    sound: 'grass',
    tex: { side: 'cactus_side', top: 'cactus_top', bottom: 'cactus_top' },
    needsSupport: true
  })
);
reg(
  def({
    id: B.DANDELION,
    key: 'dandelion',
    name: '蒲公英',
    hardness: 0.05,
    sound: 'grass',
    transparent: true,
    opaque: false,
    solid: false,
    kind: 'cross',
    tex: { side: 'dandelion' },
    needsSupport: true
  })
);
reg(
  def({
    id: B.POPPY,
    key: 'poppy',
    name: '罂粟',
    hardness: 0.05,
    sound: 'grass',
    transparent: true,
    opaque: false,
    solid: false,
    kind: 'cross',
    tex: { side: 'poppy' },
    needsSupport: true
  })
);
reg(
  def({
    id: B.TALL_GRASS,
    key: 'tall_grass',
    name: '草丛',
    hardness: 0.05,
    sound: 'grass',
    transparent: true,
    opaque: false,
    solid: false,
    kind: 'cross',
    tint: 'grass',
    tex: { side: 'tuft' },
    needsSupport: true
  })
);
reg(
  def({
    id: B.WATER,
    key: 'water',
    name: '水',
    hardness: Infinity,
    sound: null,
    transparent: true,
    opaque: false,
    solid: false,
    selectable: false,
    kind: 'water',
    tex: { side: 'water' }
  })
);

/** 钻石物品（引擎内部最小定义；完整物品注册表由物品栏代理的 items.ts 扩展） */
export const DIAMOND_ITEM = { id: ITEM_ID_DIAMOND, key: 'diamond', name: '钻石' };

/** id（方块或物品）→ 中文名（HUD 选中物品名 / 聊天用） */
export function displayName(id: number): string {
  if (id === ITEM_ID_DIAMOND) return DIAMOND_ITEM.name;
  return BLOCKS[id]?.name ?? `未知(${id})`;
}

/** 字符串 id → BlockId（/give 命令用） */
export function blockIdByKey(key: string): number | null {
  for (const b of BLOCKS) {
    if (b && b.key === key) return b.id;
  }
  if (key === 'diamond') return ITEM_ID_DIAMOND;
  return null;
}

export function blockInfo(id: number): BlockInfo {
  return BLOCKS[id] ?? BLOCKS[0];
}
