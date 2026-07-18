/**
 * InventoryOverlay —— 创造/生存物品栏覆盖层（inventory.md §A/§B，游戏内 overlay，非路由）。
 *
 * - 由引擎页在 `overlay==='inventory'` 时渲染：自带半透明压暗背景 rgba(0,0,0,0.4)，
 *   面板居中；Esc / E / 右上角 × → onClose()（关闭动画 scale 1→0.95, opacity→0, 100ms 后回调）。
 * - 创造模式（§A）：5 页签（建筑方块/装饰性方块/杂项/搜索物品/生存模式物品栏），
 *   9×5 物品网格 + MCScrollbar（内容超 5 行时可用），悬停紫框 tooltip 显示中文名；
 *   左键取 ×64 / 右键取 ×1 放入当前选中快捷栏槽（弹跳 + random.pop），面板内快捷栏与
 *   HUD 实时同步，点击面板内槽位 = 选中该槽；搜索页签键入即过滤（中文名/拼音/首字母/id），
 *   无结果显示灰字「没有找到物品」；「生存模式物品栏」页签切换为生存布局。
 * - 生存模式（§B）：盔甲槽×4（灰色剪影占位）、纸娃娃（史蒂夫配色，视线随光标 ±30°）、
 *   2×2 合成（P2 装饰）、27 主背包 + 9 快捷栏；点击整组拿放（光标持物，P1 简化）。
 * - 打开动画：面板 scale 0.92→1 opacity 0→1 150ms easeOut；网格物品 stagger 8ms/格
 *   scale 0.6→1 opacity 0→1 120ms；切换页签重放；搜索过滤直接替换（无动画）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/stores/game';
import type { ItemStack } from '@/game/types';
import { soundManager, SOUNDS } from '@/game/sound/SoundManager';
import { MCScrollbar, MCTextInput, MCTooltip } from '@/components/mc';
import ItemIcon, { useGuiPx } from './ItemIcon';
import { ALL_ITEMS, CREATIVE_TABS, getItemDef, searchItems } from '@/game/items';
import type { CreativeTabDef, CreativeTabId, ItemDef } from '@/game/items';

const SLOT = 'calc(20 * var(--u))';
const FONT8 = 'calc(8 * var(--u))';

export interface InventoryOverlayProps {
  onClose: () => void;
}

export default function InventoryOverlay({ onClose }: InventoryOverlayProps) {
  const mode = useGameStore((s) => s.mode);
  const hotbar = useGameStore((s) => s.hotbar);
  const selectedSlot = useGameStore((s) => s.selectedSlot);
  const setHotbarSlot = useGameStore((s) => s.setHotbarSlot);
  const setSelectedSlot = useGameStore((s) => s.setSelectedSlot);
  const u = useGuiPx();

  const [tab, setTab] = useState<CreativeTabId>('building');
  const [query, setQuery] = useState('');
  const [stagger, setStagger] = useState(true); // 打开/切页签时播放网格 stagger
  const [closing, setClosing] = useState(false);
  const [bump, setBump] = useState(0); // 快捷栏槽弹跳节拍
  const [held, setHeld] = useState<ItemStack | null>(null); // 光标持物（生存）
  const [storage, setStorage] = useState<(ItemStack | null)[]>(() =>
    Array.from({ length: 27 }, () => null)
  );
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const heldRef = useRef<ItemStack | null>(null);

  const updateHeld = useCallback((v: ItemStack | null) => {
    heldRef.current = v;
    setHeld(v);
  }, []);

  /** 请求关闭：先把光标持物收回背包，再播关闭动画，100ms 后 onClose */
  const requestClose = useCallback(() => {
    const cur = heldRef.current;
    if (cur) {
      heldRef.current = null;
      setHeld(null);
      setStorage((prev) => {
        const next = [...prev];
        const idx = next.findIndex((s) => s === null);
        next[idx >= 0 ? idx : 0] = cur;
        return next;
      });
    }
    setClosing(true);
  }, []);

  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(onClose, 100);
    return () => window.clearTimeout(t);
  }, [closing, onClose]);

  // Esc / E 关闭；数字键 1–9 选中槽位（输入框聚焦时只响应 Esc）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.code === 'KeyE') {
        e.preventDefault();
        requestClose();
        return;
      }
      if (/^Digit[1-9]$/.test(e.code)) setSelectedSlot(Number(e.code.slice(5)) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose, setSelectedSlot]);

  /** 创造网格取物：左键 ×64 入当前选中槽，右键 ×1（同类堆叠至 64） */
  const pickToHotbar = (def: ItemDef, right: boolean) => {
    const cur = hotbar[selectedSlot];
    const next: ItemStack = right
      ? cur && cur.id === def.id
        ? { id: def.id, count: Math.min(64, cur.count + 1) }
        : { id: def.id, count: 1 }
      : { id: def.id, count: 64 };
    setHotbarSlot(selectedSlot, next);
    setBump((b) => b + 1);
    soundManager.play(SOUNDS.POP);
  };

  const selectSlot = (i: number) => {
    setSelectedSlot(i);
    soundManager.play(SOUNDS.UI_CLICK);
  };

  /** 生存整组拿放：空手拿取 / 空槽放下 / 同类堆叠 / 异类交换 */
  const transfer = (get: () => ItemStack | null, set: (v: ItemStack | null) => void) => {
    const cur = get();
    const heldCur = heldRef.current;
    if (!heldCur) {
      if (cur) {
        updateHeld(cur);
        set(null);
        soundManager.play(SOUNDS.POP);
      }
      return;
    }
    if (!cur) {
      set(heldCur);
      updateHeld(null);
    } else if (cur.id === heldCur.id) {
      const total = cur.count + heldCur.count;
      if (total <= 64) {
        set({ id: cur.id, count: total });
        updateHeld(null);
      } else {
        set({ id: cur.id, count: 64 });
        updateHeld({ id: heldCur.id, count: total - 64 });
      }
    } else {
      set(heldCur);
      updateHeld(cur);
    }
    soundManager.play(SOUNDS.POP);
  };

  const onStorageClick = (i: number) =>
    transfer(
      () => storage[i],
      (v) =>
        setStorage((prev) => {
          const next = [...prev];
          next[i] = v;
          return next;
        })
    );
  const onHotbarClick = (i: number) =>
    transfer(
      () => hotbar[i],
      (v) => setHotbarSlot(i, v)
    );

  const onTab = (t: CreativeTabId) => {
    setTab(t);
    setStagger(true);
  };

  const survivalBody = (
    <SurvivalBody
      u={u}
      storage={storage}
      hotbar={hotbar}
      selectedSlot={selectedSlot}
      onStorageClick={onStorageClick}
      onHotbarClick={onHotbarClick}
    />
  );

  return (
    <div
      className="fixed inset-0 z-50"
      onPointerDown={() => soundManager.unlock()}
      onMouseMove={
        held ? (e: ReactMouseEvent) => setMouse({ x: e.clientX, y: e.clientY }) : undefined
      }
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: held ? 'none' : undefined }}
    >
      {/* 世界压暗背景 */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.15 }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="relative"
          initial={{ scale: 0.92, opacity: 0 }}
          animate={closing ? { scale: 0.95, opacity: 0 } : { scale: 1, opacity: 1 }}
          transition={{ duration: closing ? 0.1 : 0.15, ease: 'easeOut' }}
        >
          {mode === 'creative' ? (
            <CreativePanel
              tab={tab}
              onTab={onTab}
              query={query}
              onQuery={(q) => {
                setQuery(q);
                setStagger(false); // 搜索过滤直接替换，无动画
              }}
              stagger={stagger}
              u={u}
              onPick={pickToHotbar}
              hotbar={hotbar}
              selectedSlot={selectedSlot}
              onSelectSlot={selectSlot}
              bump={bump}
              onRequestClose={requestClose}
              survivalBody={survivalBody}
            />
          ) : (
            <div className="mc-panel relative" style={{ padding: 'calc(7 * var(--u))' }}>
              <CloseButton onClose={requestClose} />
              {survivalBody}
            </div>
          )}
        </motion.div>
      </div>
      {/* 光标持物（生存整组拿放） */}
      {held && (
        <div
          className="pointer-events-none fixed z-[70]"
          style={{ left: mouse.x - 8 * u, top: mouse.y - 8 * u }}
        >
          <ItemIcon blockId={held.id} size={16 * u} />
          {held.count > 1 && (
            <span
              className="mc-text absolute"
              style={{ right: 0, bottom: 0, fontSize: FONT8, lineHeight: 1 }}
            >
              {held.count}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 创造模式面板
 * ------------------------------------------------------------------ */

interface CreativePanelProps {
  tab: CreativeTabId;
  onTab: (t: CreativeTabId) => void;
  query: string;
  onQuery: (q: string) => void;
  stagger: boolean;
  u: number;
  onPick: (def: ItemDef, right: boolean) => void;
  hotbar: (ItemStack | null)[];
  selectedSlot: number;
  onSelectSlot: (i: number) => void;
  bump: number;
  onRequestClose: () => void;
  survivalBody: ReactNode;
}

function CreativePanel(props: CreativePanelProps) {
  const {
    tab,
    onTab,
    query,
    onQuery,
    stagger,
    u,
    onPick,
    hotbar,
    selectedSlot,
    onSelectSlot,
    bump,
    onRequestClose
  } = props;
  const items =
    tab === 'search'
      ? searchItems(query)
      : tab === 'survival'
        ? []
        : ALL_ITEMS.filter((d) => d.creativeTab === tab);

  return (
    <div className="relative">
      {/* 页签行 */}
      <div
        className="flex"
        style={{ gap: 'calc(1 * var(--u))', paddingLeft: 'calc(4 * var(--u))' }}
      >
        {CREATIVE_TABS.map((t) => (
          <TabButton key={t.id} def={t} active={t.id === tab} u={u} onSelect={() => onTab(t.id)} />
        ))}
      </div>
      {/* 面板 */}
      <div className="mc-panel relative" style={{ padding: 'calc(7 * var(--u))' }}>
        <CloseButton onClose={onRequestClose} />
        {tab === 'survival' ? (
          props.survivalBody
        ) : (
          <>
            {tab === 'search' && (
              <div style={{ marginBottom: 'calc(4 * var(--u))' }}>
                <MCTextInput
                  value={query}
                  onChange={onQuery}
                  width={180}
                  maxLength={32}
                  autoFocus
                  aria-label="搜索物品"
                  style={{ height: 'calc(12 * var(--u))', fontSize: FONT8 }}
                />
              </div>
            )}
            <div className="relative">
              <MCScrollbar height={100} wheelStep={40 * u}>
                <div
                  key={tab}
                  className="grid"
                  style={{
                    gridTemplateColumns: 'repeat(9, calc(20 * var(--u)))',
                    marginRight: 'calc(8 * var(--u))'
                  }}
                >
                  {items.map((def, i) => (
                    <CreativeSlot
                      key={`${tab}:${def.id}`}
                      def={def}
                      index={i}
                      stagger={stagger}
                      u={u}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </MCScrollbar>
              {items.length === 0 && (
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  style={{ color: '#707070', fontSize: FONT8 }}
                >
                  没有找到物品
                </div>
              )}
            </div>
            <div
              className="mc-text-dark"
              style={{ fontSize: FONT8, margin: 'calc(6 * var(--u)) 0 calc(2 * var(--u))' }}
            >
              物品栏
            </div>
            <div className="flex">
              {hotbar.map((stack, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelectSlot(i)}
                  className="mc-slot relative flex items-center justify-center"
                  style={{ width: SLOT, height: SLOT }}
                >
                  {i === selectedSlot && (
                    <div
                      className="pointer-events-none absolute"
                      style={{
                        inset: 'calc(-2 * var(--u))',
                        border: 'calc(2 * var(--u)) solid rgba(255,255,255,0.95)',
                        zIndex: 2
                      }}
                    />
                  )}
                  {stack && (
                    <motion.span
                      key={`${i}:${bump}`}
                      initial={{ scale: i === selectedSlot ? 1.25 : 1 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.12 }}
                      className="flex"
                    >
                      <ItemIcon blockId={stack.id} size={16 * u} />
                    </motion.span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 创造网格物品槽（悬停白框 + 紫框 tooltip + 入场 stagger） */
function CreativeSlot({
  def,
  index,
  stagger,
  u,
  onPick
}: {
  def: ItemDef;
  index: number;
  stagger: boolean;
  u: number;
  onPick: (def: ItemDef, right: boolean) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <motion.div
      initial={stagger ? { scale: 0.6, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.12, delay: stagger ? Math.min(index, 44) * 0.008 : 0 }}
    >
      <MCTooltip content={def.name}>
        <button
          type="button"
          className="mc-slot relative flex items-center justify-center"
          style={{
            width: SLOT,
            height: SLOT,
            boxShadow: hover
              ? 'inset 0 0 0 calc(1 * var(--u)) #FFFFFF, inset calc(1 * var(--u)) calc(1 * var(--u)) 0 var(--mc-panel-dark), inset calc(-1 * var(--u)) calc(-1 * var(--u)) 0 var(--mc-panel-hi)'
              : undefined
          }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onClick={() => onPick(def, false)}
          onContextMenu={(e) => {
            e.preventDefault();
            onPick(def, true);
          }}
        >
          <ItemIcon blockId={def.blockId} size={16 * u} />
        </button>
      </MCTooltip>
    </motion.div>
  );
}

/** 页签按钮（选中态面板凸起、底色与面板相连） */
function TabButton({
  def,
  active,
  u,
  onSelect
}: {
  def: CreativeTabDef;
  active: boolean;
  u: number;
  onSelect: () => void;
}) {
  return (
    <MCTooltip content={def.label}>
      <button
        type="button"
        onClick={() => {
          soundManager.play(SOUNDS.UI_CLICK);
          onSelect();
        }}
        className="relative flex items-center justify-center"
        style={{
          width: 'calc(28 * var(--u))',
          height: 'calc(26 * var(--u))',
          background: active ? 'var(--mc-panel)' : '#A8A8A8',
          border: 'calc(2 * var(--u)) solid var(--mc-panel-dark)',
          borderBottom: active ? 'none' : undefined,
          marginBottom: active ? 'calc(-2 * var(--u))' : 0,
          paddingBottom: active ? 'calc(2 * var(--u))' : 0,
          zIndex: active ? 2 : 1,
          boxShadow:
            'inset calc(1 * var(--u)) calc(1 * var(--u)) 0 var(--mc-panel-hi), inset calc(-1 * var(--u)) calc(-1 * var(--u)) 0 var(--mc-panel-lo)'
        }}
        aria-label={def.label}
      >
        {def.icon === 'search' ? (
          <SearchIconCanvas size={16 * u} />
        ) : def.icon === 'chest' ? (
          <ChestIconCanvas size={16 * u} />
        ) : (
          <ItemIcon blockId={def.icon} size={16 * u} />
        )}
      </button>
    </MCTooltip>
  );
}

/* ------------------------------------------------------------------ *
 * 生存背包主体（生存模式 & 创造「生存模式物品栏」页签共用）
 * ------------------------------------------------------------------ */

interface SurvivalBodyProps {
  u: number;
  storage: (ItemStack | null)[];
  hotbar: (ItemStack | null)[];
  selectedSlot: number;
  onStorageClick: (i: number) => void;
  onHotbarClick: (i: number) => void;
}

function SurvivalBody({
  u,
  storage,
  hotbar,
  selectedSlot,
  onStorageClick,
  onHotbarClick
}: SurvivalBodyProps) {
  return (
    <div>
      <div className="flex items-start" style={{ gap: 'calc(6 * var(--u))' }}>
        {/* 盔甲槽×4（灰色剪影占位） */}
        <div className="flex flex-col">
          {(['helmet', 'chest', 'legs', 'boots'] as const).map((k) => (
            <div
              key={k}
              className="mc-slot flex items-center justify-center"
              style={{ width: SLOT, height: SLOT }}
            >
              <MaskIcon rows={ARMOR_MASKS[k]} size={14 * u} />
            </div>
          ))}
        </div>
        {/* 玩家纸娃娃（视线随光标） */}
        <div
          className="flex items-center justify-center"
          style={{ width: 'calc(40 * var(--u))', height: 'calc(80 * var(--u))' }}
        >
          <PaperDoll />
        </div>
        {/* 2×2 合成（P2 装饰） */}
        <div className="flex flex-col" style={{ gap: 'calc(2 * var(--u))' }}>
          <span className="mc-text-dark" style={{ fontSize: FONT8 }}>
            合成
          </span>
          <div className="flex items-center" style={{ gap: 'calc(4 * var(--u))' }}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2, calc(20 * var(--u)))' }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="mc-slot" style={{ width: SLOT, height: SLOT }} />
              ))}
            </div>
            <CraftArrow />
            <div className="mc-slot" style={{ width: SLOT, height: SLOT }} />
          </div>
        </div>
      </div>
      <div
        className="mc-text-dark"
        style={{ fontSize: FONT8, margin: 'calc(6 * var(--u)) 0 calc(2 * var(--u))' }}
      >
        物品栏
      </div>
      {/* 主背包 9×3 */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(9, calc(20 * var(--u)))' }}>
        {storage.map((stack, i) => (
          <InvSlot key={i} stack={stack} u={u} onClick={() => onStorageClick(i)} />
        ))}
      </div>
      {/* 快捷栏 9×1（与 HUD 同步） */}
      <div className="flex" style={{ marginTop: 'calc(4 * var(--u))' }}>
        {hotbar.map((stack, i) => (
          <div key={i} className="relative">
            {i === selectedSlot && (
              <div
                className="pointer-events-none absolute"
                style={{
                  inset: 'calc(-2 * var(--u))',
                  border: 'calc(2 * var(--u)) solid rgba(255,255,255,0.95)',
                  zIndex: 2
                }}
              />
            )}
            <InvSlot stack={stack} u={u} onClick={() => onHotbarClick(i)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 生存槽位（图标 + 数量 + tooltip） */
function InvSlot({
  stack,
  u,
  onClick
}: {
  stack: ItemStack | null;
  u: number;
  onClick: () => void;
}) {
  const name = stack ? getItemDef(stack.id)?.name : undefined;
  const btn = (
    <button
      type="button"
      onClick={onClick}
      className="mc-slot relative flex items-center justify-center"
      style={{ width: SLOT, height: SLOT }}
    >
      {stack && (
        <>
          <ItemIcon blockId={stack.id} size={16 * u} />
          {stack.count > 1 && (
            <span
              className="mc-text absolute"
              style={{ right: 'calc(1 * var(--u))', bottom: 0, fontSize: FONT8, lineHeight: 1 }}
            >
              {stack.count}
            </span>
          )}
        </>
      )}
    </button>
  );
  return name ? <MCTooltip content={name}>{btn}</MCTooltip> : btn;
}

/** 右上角关闭按钮（Esc / E 之外的手动关闭） */
function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="关闭"
      onClick={() => {
        soundManager.play(SOUNDS.UI_CLICK);
        onClose();
      }}
      className="absolute flex items-center justify-center hover:bg-[#DCDCDC]"
      style={{
        top: 'calc(3 * var(--u))',
        right: 'calc(3 * var(--u))',
        width: 'calc(12 * var(--u))',
        height: 'calc(12 * var(--u))',
        border: 'calc(1 * var(--u)) solid var(--mc-panel-dark)',
        background: 'var(--mc-panel)',
        boxShadow:
          'inset calc(1 * var(--u)) calc(1 * var(--u)) 0 var(--mc-panel-hi), inset calc(-1 * var(--u)) calc(-1 * var(--u)) 0 var(--mc-panel-lo)',
        color: '#3F3F3F',
        fontSize: FONT8,
        lineHeight: 1,
        zIndex: 5
      }}
    >
      ×
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * 程序绘制小图标（纸娃娃 / 盔甲剪影 / 合成箭头 / 页签特殊图标）
 * ------------------------------------------------------------------ */

/** 玩家纸娃娃：史蒂夫配色（头 #C8966E / 衣 #00A8A8 / 裤 #3A3ACF），头部与视线随光标 yaw ±30° */
function PaperDoll() {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [gaze, setGaze] = useState(0); // -1..1（±30° 映射）

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2 + 60);
      setGaze(Math.max(-1, Math.min(1, dx)));
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const S = 8; // 逻辑 16×32 → 128×256
    ctx.clearRect(0, 0, 128, 256);
    const P = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x * S, y * S, w * S, h * S);
    };
    const headDx = Math.round(gaze); // 头部随光标偏移 ±1px
    const pupilDx = Math.round(gaze * 1.2);
    // 头
    P(4 + headDx, 0, 8, 8, '#C8966E');
    P(4 + headDx, 0, 8, 2, '#3B2A1A'); // 头发
    P(4 + headDx, 2, 1, 2, '#3B2A1A');
    P(11 + headDx, 2, 1, 2, '#3B2A1A');
    P(5 + headDx, 4, 2, 1, '#FFFFFF'); // 眼白
    P(9 + headDx, 4, 2, 1, '#FFFFFF');
    P(6 + headDx + pupilDx, 4, 1, 1, '#4A3FD8'); // 瞳孔
    P(9 + headDx + pupilDx, 4, 1, 1, '#4A3FD8');
    P(7 + headDx, 6, 2, 1, '#A87B56'); // 嘴
    // 身体
    P(4, 8, 8, 12, '#00A8A8');
    P(4, 8, 8, 1, '#008A8A');
    P(0, 8, 4, 12, '#00A8A8'); // 手臂
    P(12, 8, 4, 12, '#00A8A8');
    P(0, 17, 4, 3, '#C8966E'); // 手
    P(12, 17, 4, 3, '#C8966E');
    // 腿
    P(4, 20, 4, 12, '#3A3ACF');
    P(8, 20, 4, 12, '#3A3ACF');
    P(4, 30, 4, 2, '#6E6E6E'); // 鞋
    P(8, 30, 4, 2, '#6E6E6E');
  }, [gaze]);

  return (
    <div ref={wrapRef}>
      <canvas
        ref={ref}
        width={128}
        height={256}
        className="pixelated"
        style={{ width: 'calc(32 * var(--u))', height: 'calc(64 * var(--u))' }}
      />
    </div>
  );
}

const ARMOR_MASKS: Record<'helmet' | 'chest' | 'legs' | 'boots', string[]> = {
  helmet: ['..XXXXXX..', '.XXXXXXXX.', '.XX....XX.', '.XX....XX.', '.XX....XX.'],
  chest: [
    '.XX....XX.',
    '.XXX..XXX.',
    '..XXXXXX..',
    '..XXXXXX..',
    '..XXXXXX..',
    '..XXXXXX..',
    '..XXXXXX..'
  ],
  legs: [
    '..XXXXXX..',
    '..XXXXXX..',
    '..XXX.XXX..',
    '..XX...XX..',
    '..XX...XX..',
    '..XX...XX..',
    '..XX...XX..'
  ],
  boots: ['..XX...XX..', '..XX...XX..', '..XXX.XXX..', '..XXX.XXX..']
};

/** 盔甲槽灰色剪影（#8B8B8B） */
function MaskIcon({ rows, size }: { rows: string[]; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const S = 4; // 逻辑 12×12 → 48×48
    ctx.clearRect(0, 0, 48, 48);
    ctx.fillStyle = '#8B8B8B';
    const ox = Math.floor((12 - rows[0].length) / 2);
    const oy = Math.floor((12 - rows.length) / 2);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++)
        if (row[x] === 'X') ctx.fillRect((ox + x) * S, (oy + y) * S, S, S);
    });
  }, [rows]);
  return (
    <canvas
      ref={ref}
      width={48}
      height={48}
      className="pixelated"
      style={{ width: size, height: size }}
    />
  );
}

/** 合成箭头（22×15u 灰色，配方未完成时半透明） */
function CraftArrow() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const S = 2; // 逻辑 22×15 → 44×30
    ctx.clearRect(0, 0, 44, 30);
    ctx.fillStyle = '#8B8B8B';
    for (let x = 0; x < 14; x++) for (let y = 6; y < 9; y++) ctx.fillRect(x * S, y * S, S, S);
    for (let i = 0; i < 8; i++)
      for (let y = 7 - i; y <= 7 + i; y++) ctx.fillRect((14 + i) * S, y * S, S, S);
  }, []);
  return (
    <canvas
      ref={ref}
      width={44}
      height={30}
      className="pixelated"
      style={{ width: 'calc(22 * var(--u))', height: 'calc(15 * var(--u))', opacity: 0.6 }}
    />
  );
}

/** 搜索页签图标：放大镜 */
function SearchIconCanvas({ size }: { size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const S = 2;
    ctx.clearRect(0, 0, 32, 32);
    const px = (x: number, y: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x * S, y * S, S, S);
    };
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 6, y - 5);
        if (d >= 3 && d < 4.2) px(x, y, '#C0C0C0');
        else if (d < 3) px(x, y, 'rgba(255,255,255,0.28)');
      }
    for (let i = 0; i < 5; i++) {
      px(10 + i, 9 + i, '#8A8A8A');
      px(11 + i, 9 + i, '#8A8A8A');
    }
  }, []);
  return (
    <canvas
      ref={ref}
      width={32}
      height={32}
      className="pixelated"
      style={{ width: size, height: size }}
    />
  );
}

/** 生存模式物品栏页签图标：箱子 */
function ChestIconCanvas({ size }: { size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const S = 2;
    ctx.clearRect(0, 0, 32, 32);
    const px = (x: number, y: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x * S, y * S, S, S);
    };
    for (let y = 4; y < 14; y++)
      for (let x = 1; x < 15; x++) {
        if (x === 1 || x === 14 || y === 4 || y === 13) px(x, y, '#3A240F');
        else if (y < 8) px(x, y, '#9C6A35');
        else px(x, y, '#8A5A2B');
      }
    for (let y = 6; y < 10; y++)
      for (let x = 7; x < 9; x++) px(x, y, y === 9 ? '#8A8A8A' : '#C0C0C0'); // 锁扣
  }, []);
  return (
    <canvas
      ref={ref}
      width={32}
      height={32}
      className="pixelated"
      style={{ width: size, height: size }}
    />
  );
}
