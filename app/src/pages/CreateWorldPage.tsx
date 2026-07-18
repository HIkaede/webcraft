/**
 * 创建新的世界（create-world.md，路由 `#/create`）——主屏 + "更多世界选项"展开态。
 *
 * 主屏（标题 y=15u，控件列 200u 居中，入场 stagger 40ms）：
 * 世界名称（默认 新的世界，maxLength 32）→ 游戏模式（创造→生存→极限，默认创造，
 * 原版描述行）→ 难度（和平→…→困难；极限锁定 困难 且禁用）→ 允许作弊（创造=开/生存=关；
 * 极限锁定 关 且禁用）→ 更多世界选项...；底部 y=h−28u：创建新的世界(98u) + 取消(98u)。
 *
 * 展开态（副标题 更多世界选项 y=26u）：种子（留空随机）/ 生成建筑 / 世界类型（默认→超平坦）
 * / 奖励箱 + 提示行；完成（记住选择）/ 取消（放弃）。列切换：旧列 x 0→−16px 淡出 120ms，
 * 新列 x 16→0 淡入 180ms delay 60ms（返回时反向）。
 *
 * 创建：WorldStore.createWorld（seed 空 → randomSeedString()；hashSeed 由游戏页引擎接入处
 * 统一转换）→ 跳转 `#/game/:id?fresh=1`（生成地形加载屏由游戏页实现）。
 * Esc：主屏 = 取消返回 `#/worlds`；展开态 = 完成返回主屏。Enter（名称框）= 创建。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { MCButton, MCCycleButton, MCScreen, MCTextInput } from '@/components/mc';
import { randomSeedString, useWorldsStore } from '@/stores/worlds';
import { useSettingsStore } from '@/stores/settings';
import type { Difficulty, GameMode, WorldType } from '@/game/types';

const MODE_OPTIONS = [
  { value: 'creative', label: '创造' },
  { value: 'survival', label: '生存' },
  { value: 'hardcore', label: '极限' }
] as const satisfies readonly { value: GameMode; label: string }[];

/** 模式描述行（create-world.md §A，原版文案） */
const MODE_DESC: Record<GameMode, string> = {
  creative: '无限的资源、自由地飞翔，并且能够瞬间破坏方块',
  survival: '探索世界、收集资源、合成道具、升级、生存，还有秘密',
  hardcore: '难度锁定在困难的生存模式，且只有一条生命'
};

const DIFFICULTY_OPTIONS = [
  { value: 'peaceful', label: '和平' },
  { value: 'easy', label: '简单' },
  { value: 'normal', label: '普通' },
  { value: 'hard', label: '困难' }
] as const satisfies readonly { value: Difficulty; label: string }[];

const ON_OFF_OPTIONS = [
  { value: 'on', label: '开' },
  { value: 'off', label: '关' }
] as const;

const WORLD_TYPE_OPTIONS = [
  { value: 'default', label: '默认' },
  { value: 'flat', label: '超平坦' }
] as const satisfies readonly { value: WorldType; label: string }[];

type OnOff = (typeof ON_OFF_OPTIONS)[number]['value'];

interface MoreOptions {
  seed: string;
  worldType: WorldType;
  structures: boolean;
  bonusChest: boolean;
}

const DEFAULT_MORE: MoreOptions = {
  seed: '',
  worldType: 'default',
  structures: true,
  bonusChest: false
};

export default function CreateWorldPage() {
  const navigate = useNavigate();
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);

  const [name, setName] = useState('新的世界');
  const [mode, setMode] = useState<GameMode>('creative');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [cheats, setCheats] = useState(true);
  const [more, setMore] = useState<MoreOptions>(DEFAULT_MORE);
  const [draft, setDraft] = useState<MoreOptions>(DEFAULT_MORE);
  const [expanded, setExpanded] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const navTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (navTimer.current !== null) window.clearTimeout(navTimer.current);
    },
    []
  );

  const leave = useCallback(
    (to: string) => {
      setLeaving(true);
      navTimer.current = window.setTimeout(() => navigate(to), reducedMotion ? 0 : 120);
    },
    [navigate, reducedMotion]
  );

  /** 模式切换：极限 → 难度锁困难+禁用、作弊锁关+禁用；其他 → 作弊回到该模式默认（创造=开/生存=关） */
  const changeMode = useCallback((m: GameMode) => {
    setMode(m);
    if (m === 'hardcore') {
      setDifficulty('hard');
      setCheats(false);
    } else {
      setCheats(m === 'creative');
    }
  }, []);

  const hardcore = mode === 'hardcore';

  const create = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const meta = useWorldsStore.getState().createWorld({
      name: trimmed,
      seed: more.seed.trim() || randomSeedString(),
      mode,
      difficulty,
      cheats,
      worldType: more.worldType,
      structures: more.structures,
      bonusChest: more.bonusChest
    });
    leave(`/game/${meta.id}?fresh=1`);
  }, [name, more, mode, difficulty, cheats, leave]);

  const openMore = useCallback(() => {
    setDraft(more);
    setExpanded(true);
  }, [more]);
  const commitMore = useCallback(() => {
    setMore(draft);
    setExpanded(false);
  }, [draft]);
  const discardMore = useCallback(() => setExpanded(false), []);

  // Esc：展开态 = 完成返回主屏；主屏 = 取消返回 #/worlds（create-world.md §交互）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (expanded) commitMore();
      else leave('/worlds');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, commitMore, leave]);

  /** 控件列入场：stagger 40ms，y 12→0，opacity 0→1，220ms easeOut（create-world.md §动效汇总） */
  const ctrl = (i: number) =>
    ({
      initial: reducedMotion ? false : { y: 12, opacity: 0 },
      animate: { y: 0, opacity: 1 },
      transition: { delay: reducedMotion ? 0 : i * 0.04, duration: 0.22, ease: 'easeOut' as const }
    }) as const;

  // 列切换动效（§B）：旧列 x 0→∓16px + 淡出 120ms；新列 x ±16→0 + 淡入 180ms delay 60ms
  const SHOW = { x: 0, opacity: 1, visibility: 'visible' as const };
  const HIDE_L = reducedMotion
    ? { opacity: 0, visibility: 'hidden' as const }
    : { x: -16, opacity: 0, visibility: 'hidden' as const };
  const HIDE_R = reducedMotion
    ? { opacity: 0, visibility: 'hidden' as const }
    : { x: 16, opacity: 0, visibility: 'hidden' as const };
  const enterT = { duration: reducedMotion ? 0.01 : 0.18, delay: reducedMotion ? 0 : 0.06 };
  const exitT = { duration: reducedMotion ? 0.01 : 0.12 };

  const labelStyle = {
    fontSize: 'calc(8 * var(--u))',
    marginBottom: 'calc(2 * var(--u))'
  } as const;
  const w200 = { width: 'calc(200 * var(--u))' } as const;

  return (
    <MCScreen bg="dirt">
      {/* 内容层（离开时 120ms 淡出） */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: 0.12 }}
      >
        {/* 标题 + 展开态副标题（y=26u 灰字） */}
        <div
          className="pointer-events-none absolute left-0 right-0 flex justify-center"
          style={{ top: 'calc(15 * var(--u))' }}
        >
          <div className="mc-text text-center" style={{ fontSize: 'calc(8 * var(--u))' }}>
            创建新的世界
          </div>
        </div>
        <motion.div
          className="pointer-events-none absolute left-0 right-0 flex justify-center"
          style={{ top: 'calc(26 * var(--u))' }}
          initial={false}
          animate={{ opacity: expanded ? 1 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="mc-text-gray text-center" style={{ fontSize: 'calc(8 * var(--u))' }}>
            更多世界选项
          </div>
        </motion.div>

        {/* ===== 主屏控件列 ===== */}
        <motion.div
          className="absolute left-0 right-0 flex justify-center"
          style={{ top: 'calc(40 * var(--u))' }}
          initial={false}
          animate={expanded ? HIDE_L : SHOW}
          transition={expanded ? exitT : enterT}
        >
          <div className="flex flex-col" style={w200}>
            <motion.div {...ctrl(0)}>
              <div className="mc-text-gray" style={labelStyle}>
                世界名称
              </div>
              <MCTextInput
                value={name}
                onChange={setName}
                maxLength={32}
                width={200}
                autoFocus
                onEnter={create}
                aria-label="世界名称"
              />
            </motion.div>
            <motion.div {...ctrl(1)} style={{ marginTop: 'calc(8 * var(--u))' }}>
              <MCCycleButton
                options={MODE_OPTIONS}
                value={mode}
                onChange={changeMode}
                prefix="游戏模式："
              />
              {/* 描述行：文字瞬时切换 + opacity 0→1 150ms（key 重挂载实现） */}
              <motion.div
                key={mode}
                className="mc-text-gray text-center"
                style={{
                  ...w200,
                  marginTop: 'calc(2 * var(--u))',
                  minHeight: 'calc(20 * var(--u))',
                  fontSize: 'calc(8 * var(--u))',
                  lineHeight: 'calc(10 * var(--u))'
                }}
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
              >
                {MODE_DESC[mode]}
              </motion.div>
            </motion.div>
            <motion.div {...ctrl(2)} style={{ marginTop: 'calc(4 * var(--u))' }}>
              <MCCycleButton
                options={DIFFICULTY_OPTIONS}
                value={difficulty}
                onChange={setDifficulty}
                prefix="难度："
                disabled={hardcore}
              />
            </motion.div>
            <motion.div {...ctrl(3)} style={{ marginTop: 'calc(4 * var(--u))' }}>
              <MCCycleButton
                options={ON_OFF_OPTIONS}
                value={cheats ? 'on' : 'off'}
                onChange={(v: OnOff) => setCheats(v === 'on')}
                prefix="允许作弊："
                disabled={hardcore}
              />
            </motion.div>
            <motion.div {...ctrl(4)} style={{ marginTop: 'calc(4 * var(--u))' }}>
              <MCButton label="更多世界选项..." width={200} onClick={openMore} />
            </motion.div>
          </div>
        </motion.div>

        {/* ===== 更多世界选项（展开态） ===== */}
        <motion.div
          className="absolute left-0 right-0 flex justify-center"
          style={{ top: 'calc(40 * var(--u))' }}
          initial={false}
          animate={expanded ? SHOW : HIDE_R}
          transition={expanded ? enterT : exitT}
        >
          <div className="flex flex-col items-center" style={{ width: 'calc(220 * var(--u))' }}>
            <div style={w200}>
              <div className="mc-text-gray" style={labelStyle}>
                世界生成器的种子
              </div>
              <MCTextInput
                value={draft.seed}
                onChange={(v) => setDraft((d) => ({ ...d, seed: v }))}
                placeholder="留空则随机生成"
                maxLength={64}
                width={200}
                aria-label="世界生成器的种子"
              />
            </div>
            <div style={{ ...w200, marginTop: 'calc(8 * var(--u))' }}>
              <MCCycleButton
                options={ON_OFF_OPTIONS}
                value={draft.structures ? 'on' : 'off'}
                onChange={(v: OnOff) => setDraft((d) => ({ ...d, structures: v === 'on' }))}
                prefix="生成建筑："
              />
            </div>
            <div style={{ ...w200, marginTop: 'calc(4 * var(--u))' }}>
              <MCCycleButton
                options={WORLD_TYPE_OPTIONS}
                value={draft.worldType}
                onChange={(v: WorldType) => setDraft((d) => ({ ...d, worldType: v }))}
                prefix="世界类型："
              />
            </div>
            <div style={{ ...w200, marginTop: 'calc(4 * var(--u))' }}>
              <MCCycleButton
                options={ON_OFF_OPTIONS}
                value={draft.bonusChest ? 'on' : 'off'}
                onChange={(v: OnOff) => setDraft((d) => ({ ...d, bonusChest: v === 'on' }))}
                prefix="奖励箱："
              />
            </div>
            <div
              className="mc-text-grayline text-center"
              style={{
                width: 'calc(220 * var(--u))',
                marginTop: 'calc(6 * var(--u))',
                fontSize: 'calc(8 * var(--u))'
              }}
            >
              种子相同的世界，地形将完全一致
            </div>
          </div>
        </motion.div>

        {/* 底部按钮行（y = h−28u，随列切换联动） */}
        <motion.div
          className="absolute left-0 right-0 flex justify-center"
          style={{ bottom: 'calc(28 * var(--u))', gap: 'calc(4 * var(--u))' }}
          initial={false}
          animate={expanded ? HIDE_L : SHOW}
          transition={expanded ? exitT : enterT}
        >
          <MCButton
            label="创建新的世界"
            width={98}
            disabled={name.trim() === ''}
            onClick={create}
          />
          <MCButton label="取消" width={98} onClick={() => leave('/worlds')} />
        </motion.div>
        <motion.div
          className="absolute left-0 right-0 flex justify-center"
          style={{ bottom: 'calc(28 * var(--u))', gap: 'calc(4 * var(--u))' }}
          initial={false}
          animate={expanded ? SHOW : HIDE_R}
          transition={expanded ? enterT : exitT}
        >
          <MCButton label="完成" width={98} onClick={commitMore} />
          <MCButton label="取消" width={98} onClick={discardMore} />
        </motion.div>
      </motion.div>
    </MCScreen>
  );
}
