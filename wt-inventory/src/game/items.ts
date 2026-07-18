/**
 * 物品注册表（inventory.md §D —— 实现侧单一 source of truth）。
 *
 * 覆盖 engine-contract.ts 中全部 BlockId（AIR 除外，它不是物品）：
 *   { id, blockId, key, name, pinyin, pinyinAbbr, hardness, soundGroup, stackSize, creativeTab }
 *
 * - name 使用官方简体中文译名（草方块/圆石/橡木木板/红砖块/荧石/×色羊毛…）。
 * - pinyin / pinyinAbbr 用于创造物品栏搜索（inventory.md §A：匹配中文名/拼音首字母/id）。
 * - hardness 为徒手硬度（秒），Infinity = 不可破坏（基岩/水），数值见 inventory.md §D。
 * - soundGroup 对应 design.md §8 音效材质组；水为 null（无挖掘音效）。
 * - creativeTab 为创造物品栏分类页签（建筑方块/装饰性方块/杂项；
 *   搜索物品/生存模式物品栏为特殊页签，不参与物品分类）。
 *
 * BlockId 键与 engine-contract.ts 完全一致，请勿改动键值。
 */
import { BlockId, BLOCK_STRING_IDS } from './engine-contract';
import type { SoundMaterial } from './types';

/** 创造模式物品栏页签 id（inventory.md §A，共 5 页签） */
export type CreativeTabId = 'building' | 'decoration' | 'misc' | 'search' | 'survival';

/** 物品分类页签（search / survival 为特殊页签，不作为物品分类） */
export type CreativeCategory = 'building' | 'decoration' | 'misc';

export interface ItemDef {
  /** 物品 id（数值上 == blockId；物品 P2 扩展时使用 ≥1000 的 id 段） */
  id: number;
  /** 对应方块 id（engine-contract.ts BlockId） */
  blockId: BlockId;
  /** 字符串 id（inventory.md §D 首列，搜索/命令匹配用） */
  key: string;
  /** 官方简体中文名 */
  name: string;
  /** 全拼（小写无声调，搜索用） */
  pinyin: string;
  /** 拼音首字母缩写（搜索用） */
  pinyinAbbr: string;
  /** 徒手硬度（秒）；Infinity = 不可破坏（基岩/水） */
  hardness: number;
  /** 音效材质组（design.md §8）；水为 null */
  soundGroup: SoundMaterial | null;
  /** 最大堆叠数量（本版全部 64） */
  stackSize: number;
  /** 创造物品栏分类页签 */
  creativeTab: CreativeCategory;
}

/** [blockId, 中文名, 分类, 硬度, 音效组, 全拼, 首字母] */
type RawDef = [BlockId, string, CreativeCategory, number, SoundMaterial | null, string, string];

// 数值对照 inventory.md §D 注册表；分类对应创造物品栏 5 页签中的 3 个物品页签
const RAW_DEFS: RawDef[] = [
  // —— 装饰性方块（自然地物） ——
  [BlockId.GRASS_BLOCK, '草方块', 'decoration', 0.9, 'grass', 'caofangkuai', 'cfk'],
  [BlockId.DIRT, '泥土', 'decoration', 0.75, 'grass', 'nitu', 'nt'],
  [BlockId.SAND, '沙子', 'decoration', 0.5, 'sand', 'shazi', 'sz'],
  [BlockId.GRAVEL, '沙砾', 'decoration', 0.6, 'sand', 'shali', 'sl'],
  [BlockId.OAK_LOG, '橡木原木', 'decoration', 3.0, 'wood', 'xiangmuyuanmu', 'xmym'],
  [BlockId.BIRCH_LOG, '白桦原木', 'decoration', 3.0, 'wood', 'baihuayuanmu', 'bhym'],
  [BlockId.OAK_LEAVES, '橡树树叶', 'decoration', 0.35, 'grass', 'xiangshushuye', 'xssy'],
  [BlockId.BIRCH_LEAVES, '白桦树叶', 'decoration', 0.35, 'grass', 'baihuashuye', 'bhsy'],
  [BlockId.TORCH, '火把', 'decoration', 0.05, 'wood', 'huoba', 'hb'],
  [BlockId.CACTUS, '仙人掌', 'decoration', 0.6, 'grass', 'xianrenzhang', 'xrz'],
  [BlockId.DANDELION, '蒲公英', 'decoration', 0.05, 'grass', 'pugongying', 'pgy'],
  [BlockId.POPPY, '罂粟', 'decoration', 0.05, 'grass', 'yingsu', 'ys'],
  [BlockId.TALL_GRASS, '草丛', 'decoration', 0.05, 'grass', 'caocong', 'cc'],
  [BlockId.WATER, '水', 'decoration', Infinity, null, 'shui', 's'],
  // —— 建筑方块 ——
  [BlockId.STONE, '石头', 'building', 7.5, 'stone', 'shitou', 'st'],
  [BlockId.COBBLESTONE, '圆石', 'building', 7.5, 'stone', 'yuanshi', 'ys'],
  [BlockId.STONE_BRICKS, '石砖', 'building', 7.5, 'stone', 'shizhuan', 'sz'],
  [BlockId.BRICKS, '红砖块', 'building', 7.5, 'stone', 'hongzhuankuai', 'hzk'],
  [BlockId.OAK_PLANKS, '橡木木板', 'building', 3.0, 'wood', 'xiangmumuban', 'xmmb'],
  [BlockId.SANDSTONE, '砂岩', 'building', 4.0, 'stone', 'shayan', 'sy'],
  [BlockId.GLASS, '玻璃', 'building', 0.45, 'glass', 'boli', 'bl'],
  [BlockId.GLOWSTONE, '荧石', 'building', 1.5, 'glass', 'yingshi', 'ys'],
  [BlockId.OBSIDIAN, '黑曜石', 'building', 50, 'stone', 'heiyaoshi', 'hys'],
  [BlockId.TNT, 'TNT', 'building', 0.2, 'grass', 'tnt', 'tnt'],
  [BlockId.WOOL_WHITE, '白色羊毛', 'building', 1.2, 'grass', 'baiseyangmao', 'bsym'],
  [BlockId.WOOL_GRAY, '灰色羊毛', 'building', 1.2, 'grass', 'huiseyangmao', 'hsym'],
  [BlockId.WOOL_BLACK, '黑色羊毛', 'building', 1.2, 'grass', 'heiseyangmao', 'hsym'],
  [BlockId.WOOL_RED, '红色羊毛', 'building', 1.2, 'grass', 'hongseyangmao', 'hsym'],
  [BlockId.WOOL_ORANGE, '橙色羊毛', 'building', 1.2, 'grass', 'chengseyangmao', 'csym'],
  [BlockId.WOOL_YELLOW, '黄色羊毛', 'building', 1.2, 'grass', 'huangseyangmao', 'hsym'],
  [BlockId.WOOL_GREEN, '绿色羊毛', 'building', 1.2, 'grass', 'lvseyangmao', 'lsym'],
  [BlockId.WOOL_BLUE, '蓝色羊毛', 'building', 1.2, 'grass', 'lanseyangmao', 'lsym'],
  // —— 杂项 ——
  [BlockId.BEDROCK, '基岩', 'misc', Infinity, 'stone', 'jiyan', 'jy'],
  [BlockId.COAL_ORE, '煤矿石', 'misc', 15, 'stone', 'meikuangshi', 'mks'],
  [BlockId.IRON_ORE, '铁矿石', 'misc', 15, 'stone', 'tiekuangshi', 'tks'],
  [BlockId.GOLD_ORE, '金矿石', 'misc', 15, 'stone', 'jinkuangshi', 'jks'],
  [BlockId.DIAMOND_ORE, '钻石矿石', 'misc', 15, 'stone', 'zuanshikuangshi', 'zsks'],
  [BlockId.CRAFTING_TABLE, '工作台', 'misc', 2.5, 'wood', 'gongzuotai', 'gzt'],
  [BlockId.FURNACE, '熔炉', 'misc', 17.5, 'stone', 'ronglu', 'rl']
];

/** 物品注册表：blockId → ItemDef（AIR=0 不在其中） */
export const ITEM_REGISTRY: Record<number, ItemDef> = Object.fromEntries(
  RAW_DEFS.map(([blockId, name, creativeTab, hardness, soundGroup, pinyin, pinyinAbbr]) => [
    blockId,
    {
      id: blockId as number,
      blockId,
      key: BLOCK_STRING_IDS[blockId] ?? String(blockId),
      name,
      pinyin,
      pinyinAbbr,
      hardness,
      soundGroup,
      stackSize: 64,
      creativeTab
    } satisfies ItemDef
  ])
);

/** 全部物品（按 blockId 升序），搜索页签/全物品列表用 */
export const ALL_ITEMS: ItemDef[] = RAW_DEFS.map(([blockId]) => ITEM_REGISTRY[blockId]);

/** 按 blockId 取物品定义；未注册（如 AIR）返回 undefined */
export function getItemDef(blockId: number): ItemDef | undefined {
  return ITEM_REGISTRY[blockId];
}

/** 创造物品栏搜索：匹配中文名 / 全拼 / 拼音首字母 / 字符串 id / 数字 id（inventory.md §A） */
export function searchItems(query: string): ItemDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_ITEMS;
  return ALL_ITEMS.filter(
    (d) =>
      d.name.includes(q) ||
      d.pinyin.includes(q) ||
      d.pinyinAbbr.includes(q) ||
      d.key.toLowerCase().includes(q) ||
      String(d.id) === q
  );
}

/** 创造物品栏页签定义（图标：方块 id 或特殊图标键） */
export interface CreativeTabDef {
  id: CreativeTabId;
  label: string;
  /** 页签图标：BlockId 用 ItemIcon 渲染；'search'/'chest' 由覆盖层程序绘制 */
  icon: BlockId | 'search' | 'chest';
}

export const CREATIVE_TABS: CreativeTabDef[] = [
  { id: 'building', label: '建筑方块', icon: BlockId.BRICKS },
  { id: 'decoration', label: '装饰性方块', icon: BlockId.DANDELION },
  { id: 'misc', label: '杂项', icon: BlockId.FURNACE },
  { id: 'search', label: '搜索物品', icon: 'search' },
  { id: 'survival', label: '生存模式物品栏', icon: 'chest' }
];
