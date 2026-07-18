/**
 * OptionsScreens —— 选项各屏的共享实现（options.md）。
 *
 * 同一份内容被两类容器复用：
 * - 路由页（src/pages/Options*Page.tsx）：MCScreen bg='dirt' 泥土背景，子屏间路由跳转；
 * - 游戏内覆盖层（src/components/options/OptionsOverlay.tsx）：bg='ingame' 模糊压暗遮罩，
 *   子屏切换为内部状态（覆盖层自带 AnimatePresence 转场），主屏「完成」→ onClose()。
 *
 * 纪律：
 * - 所有设置写入 useSettingsStore（persist 自动落盘；initSettingsSideEffects 已接线
 *   音量与 --u 的即时生效；渲染距离/FOV/平滑光照等由引擎侧订阅 store 应用）。
 * - 滑块轻量改动 onChange 即时生效；重活（渲染距离）拖动中只更新本地标签，
 *   松手 onChangeEnd 才提交 store（options.md §B：避免拖动卡顿）。
 * - Esc = 完成（options.md §交互通用：子屏→主屏→来源屏），按键控制屏内改键等待时 Esc = 取消改键。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { motion } from 'framer-motion';
import {
  MCButton,
  MCCycleButton,
  MCDialog,
  MCScreen,
  MCScrollbar,
  MCSlider,
  MCTooltip
} from '@/components/mc';
import type { MCCycleOption } from '@/components/mc';
import { soundManager } from '@/game/sound/SoundManager';
import { useSettingsStore } from '@/stores/settings';
import type { BrightnessMode, GraphicsMode, KeyAction, ParticlesMode } from '@/stores/settings';
import { useWorldsStore } from '@/stores/worlds';
import type { Difficulty } from '@/game/types';

/** 选项子屏 id（主屏按钮 → 子屏） */
export type OptionsSubScreen = 'video' | 'sound' | 'mouse' | 'controls';

export interface OptionsScreenBaseProps {
  /** dirt = 标题进入全屏泥土背景；ingame = 游戏内模糊压暗遮罩 */
  bg: 'dirt' | 'ingame';
  /** 完成（路由页=返回来源/主屏；覆盖层=回主屏或 onClose） */
  onDone: () => void;
  /** 路由页入场动效开关（覆盖层由自身 AnimatePresence 处理，传 false） */
  entrance?: boolean;
  /** 覆盖层需压在游戏 HUD 之上时传 40 */
  zIndex?: number;
}

export interface OptionsMainScreenProps extends OptionsScreenBaseProps {
  /** 游戏内进入：难度循环作用于当前世界；标题进入：灰显 + tooltip「进入世界后可调整」 */
  inGame: boolean;
  onNavigate: (screen: OptionsSubScreen) => void;
}

/* ------------------------------------------------------------------ *
 * 常量与小组件
 * ------------------------------------------------------------------ */

const ON_OFF = [
  { value: 'on', label: '开' },
  { value: 'off', label: '关' }
] as const;

const GUI_SCALE_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: '1', label: '1x' },
  { value: '2', label: '2x' },
  { value: '3', label: '3x' },
  { value: '4', label: '4x' }
] as const;

const DIFFICULTY_OPTIONS = [
  { value: 'peaceful', label: '和平' },
  { value: 'easy', label: '简单' },
  { value: 'normal', label: '普通' },
  { value: 'hard', label: '困难' }
] as const satisfies readonly MCCycleOption<Difficulty>[];

const GRAPHICS_OPTIONS = [
  { value: 'fancy', label: '高品质' },
  { value: 'fast', label: '流畅' }
] as const satisfies readonly MCCycleOption<GraphicsMode>[];

const PARTICLE_OPTIONS = [
  { value: 'all', label: '所有' },
  { value: 'decreased', label: '少量' },
  { value: 'minimal', label: '最少' }
] as const satisfies readonly MCCycleOption<ParticlesMode>[];

const BRIGHTNESS_OPTIONS = [
  { value: 'bright', label: '明亮' },
  { value: 'dim', label: '昏暗' }
] as const satisfies readonly MCCycleOption<BrightnessMode>[];

/** Esc = 完成（捕获阶段 + stopImmediatePropagation，避免与其他全局 Esc 处理重复触发） */
function useOptionsEscape(onDone: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onDone();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onDone]);
}

/** 开/关循环按钮（MCCycleButton 的布尔便捷封装） */
function BoolCycle({
  prefix,
  value,
  onChange,
  width = 150
}: {
  prefix: string;
  value: boolean;
  onChange: (v: boolean) => void;
  width?: number;
}) {
  return (
    <MCCycleButton
      width={width}
      prefix={prefix}
      options={ON_OFF}
      value={value ? 'on' : 'off'}
      onChange={(v) => onChange(v === 'on')}
    />
  );
}

/** 屏幕标题（y=15u 居中，8u 白字硬阴影；主屏带 y -12→0 入场） */
function ScreenTitle({ title, anim = false }: { title: ReactNode; anim?: boolean }) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center"
      style={{ top: 'calc(15 * var(--u))' }}
    >
      <motion.div
        className="mc-text"
        style={{ fontSize: 'calc(8 * var(--u))' }}
        initial={anim ? { y: -12, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {title}
      </motion.div>
    </div>
  );
}

/** 两列控件网格（列宽 150u、列间距 4u、总宽 304u 居中；行距 24u = 20u 控件 + 4u 间隙） */
function OptionsGrid({ rows, anim }: { rows: [ReactNode, ReactNode][]; anim: boolean }) {
  return (
    <div
      className="flex flex-col"
      style={{ gap: 'calc(4 * var(--u))', width: 'calc(304 * var(--u))' }}
    >
      {rows.map(([left, right], i) => (
        <motion.div
          key={i}
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(2, calc(150 * var(--u)))',
            gap: 'calc(4 * var(--u))'
          }}
          initial={anim ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: anim ? i * 0.03 : 0, duration: 0.2, ease: 'easeOut' }}
        >
          <div>{left}</div>
          <div>{right}</div>
        </motion.div>
      ))}
    </div>
  );
}

/** 难度循环：游戏内进入控制当前世界（worlds store）；标题进入灰显 + tooltip（options.md §A） */
function DifficultyCycle({ inGame }: { inGame: boolean }) {
  const { worldId } = useParams();
  const worlds = useWorldsStore((s) => s.worlds);
  const updateWorld = useWorldsStore((s) => s.updateWorld);
  const world = worldId ? worlds.find((w) => w.id === worldId) : undefined;
  const enabled = inGame && !!world;
  return (
    <MCTooltip content="进入世界后可调整" disabled={enabled}>
      <MCCycleButton
        width={150}
        prefix="难度: "
        options={DIFFICULTY_OPTIONS}
        value={world?.difficulty ?? 'normal'}
        onChange={(v) => world && updateWorld(world.id, { difficulty: v })}
        disabled={!enabled}
      />
    </MCTooltip>
  );
}

/** 子屏公共骨架：MCScreen + 滑入入场（x 16→0, opacity 0→1, 180ms, delay 60ms）+ 标题 + 完成行 */
function SubScreenShell({
  bg,
  zIndex,
  entrance = true,
  onDone,
  title,
  children,
  footer
}: OptionsScreenBaseProps & { title: string; children: ReactNode; footer?: ReactNode }) {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  useOptionsEscape(onDone);
  const anim = entrance && !reducedMotion;
  return (
    <MCScreen bg={bg} style={zIndex != null ? { zIndex } : undefined}>
      <motion.div
        className="min-h-[100dvh]"
        initial={anim ? { x: 16, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.18, delay: 0.06, ease: 'easeOut' }}
      >
        <ScreenTitle title={title} />
        <div
          className="flex min-h-[100dvh] flex-col items-center"
          style={{ paddingTop: 'calc(40 * var(--u))', paddingBottom: 'calc(8 * var(--u))' }}
        >
          {children}
          <div className="flex-1" style={{ minHeight: 'calc(12 * var(--u))' }} />
          {footer ?? <MCButton label="完成" width={200} onClick={onDone} />}
        </div>
      </motion.div>
    </MCScreen>
  );
}

/* ------------------------------------------------------------------ *
 * A. 选项主屏（options.md §A）
 * ------------------------------------------------------------------ */
export function OptionsMainScreen({
  bg,
  inGame,
  onNavigate,
  onDone,
  entrance = true,
  zIndex
}: OptionsMainScreenProps) {
  const fov = useSettingsStore((s) => s.fov);
  const guiScale = useSettingsStore((s) => s.guiScale);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const set = useSettingsStore((s) => s.set);
  useOptionsEscape(onDone);
  const anim = entrance && !reducedMotion;

  const rows: [ReactNode, ReactNode][] = [
    [
      <MCSlider
        key="fov"
        width={150}
        min={30}
        max={110}
        step={1}
        value={fov}
        label={(v) => `视场角: ${v}`}
        onChange={(v) => set('fov', v)}
      />,
      <MCCycleButton
        key="gui"
        width={150}
        prefix="界面尺寸: "
        options={GUI_SCALE_OPTIONS}
        value={guiScale === 'auto' ? 'auto' : String(guiScale)}
        onChange={(v) => set('guiScale', v === 'auto' ? 'auto' : (Number(v) as 1 | 2 | 3 | 4))}
      />
    ],
    [
      <DifficultyCycle key="diff" inGame={inGame} />,
      <BoolCycle
        key="rm"
        prefix="减少动态效果: "
        value={reducedMotion}
        onChange={(v) => set('reducedMotion', v)}
      />
    ],
    [
      <MCButton key="video" width={150} label="视频设置..." onClick={() => onNavigate('video')} />,
      <MCButton key="sound" width={150} label="声音设置..." onClick={() => onNavigate('sound')} />
    ],
    [
      <MCButton key="mouse" width={150} label="鼠标设置..." onClick={() => onNavigate('mouse')} />,
      <MCButton
        key="controls"
        width={150}
        label="按键控制..."
        onClick={() => onNavigate('controls')}
      />
    ],
    [
      <MCTooltip key="lang" content="网页版暂未开放此功能">
        <MCButton width={150} label="语言..." disabled />
      </MCTooltip>,
      <MCTooltip key="rp" content="网页版暂未开放此功能">
        <MCButton width={150} label="资源包..." disabled />
      </MCTooltip>
    ]
  ];

  return (
    <MCScreen bg={bg} style={zIndex != null ? { zIndex } : undefined}>
      <ScreenTitle title="选项" anim={anim} />
      <div
        className="flex min-h-[100dvh] flex-col items-center"
        style={{ paddingTop: 'calc(40 * var(--u))', paddingBottom: 'calc(8 * var(--u))' }}
      >
        <OptionsGrid rows={rows} anim={anim} />
        <div className="flex-1" style={{ minHeight: 'calc(12 * var(--u))' }} />
        <MCButton label="完成" width={200} onClick={onDone} />
      </div>
    </MCScreen>
  );
}

/* ------------------------------------------------------------------ *
 * B. 视频设置（options.md §B）
 * ------------------------------------------------------------------ */
export function OptionsVideoScreen({
  bg,
  onDone,
  entrance = true,
  zIndex
}: OptionsScreenBaseProps) {
  const graphics = useSettingsStore((s) => s.graphics);
  const renderDistance = useSettingsStore((s) => s.renderDistance);
  const smoothLighting = useSettingsStore((s) => s.smoothLighting);
  const clouds = useSettingsStore((s) => s.clouds);
  const particles = useSettingsStore((s) => s.particles);
  const viewBobbing = useSettingsStore((s) => s.viewBobbing);
  const entityShadows = useSettingsStore((s) => s.entityShadows);
  const brightness = useSettingsStore((s) => s.brightness);
  const fullscreen = useSettingsStore((s) => s.fullscreen);
  const set = useSettingsStore((s) => s.set);

  // 渲染距离：拖动中只更新本地标签，松手才提交 store（options.md §B 即时反馈细节）
  const [rd, setRd] = useState(renderDistance);
  useEffect(() => setRd(renderDistance), [renderDistance]);

  // 全屏：切换 document.fullscreen；外部退出（Esc/F11）时同步回 store
  const [fsFailed, setFsFailed] = useState(false);
  useEffect(() => {
    const onFsChange = () => set('fullscreen', !!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [set]);
  const applyFullscreen = useCallback(
    async (target: boolean) => {
      setFsFailed(false);
      try {
        if (target) {
          if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        } else if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
        set('fullscreen', target);
      } catch {
        // 浏览器拒绝了全屏请求：回读真实状态并点亮 tooltip 提示
        set('fullscreen', !!document.fullscreenElement);
        setFsFailed(true);
      }
    },
    [set]
  );

  const rows: [ReactNode, ReactNode][] = [
    [
      <MCCycleButton
        key="g"
        width={150}
        prefix="图像品质: "
        options={GRAPHICS_OPTIONS}
        value={graphics}
        onChange={(v) => set('graphics', v)}
      />,
      <div key="rd">
        <MCSlider
          width={150}
          min={2}
          max={12}
          step={1}
          value={rd}
          label={(v) => `渲染距离: ${v} 个区块`}
          onChange={setRd}
          onChangeEnd={(v) => set('renderDistance', v)}
        />
        {/* >8 常驻灰注（options.md §B），占位避免布局跳动 */}
        <div
          className="mc-text-grayline text-center"
          style={{
            fontSize: 'calc(8 * var(--u))',
            height: 'calc(10 * var(--u))',
            visibility: rd > 8 ? 'visible' : 'hidden'
          }}
        >
          较高数值可能降低帧率
        </div>
      </div>
    ],
    [
      <BoolCycle
        key="sl"
        prefix="平滑光照: "
        value={smoothLighting}
        onChange={(v) => set('smoothLighting', v)}
      />,
      <BoolCycle key="cl" prefix="云: " value={clouds} onChange={(v) => set('clouds', v)} />
    ],
    [
      <MCCycleButton
        key="p"
        width={150}
        prefix="粒子: "
        options={PARTICLE_OPTIONS}
        value={particles}
        onChange={(v) => set('particles', v)}
      />,
      <BoolCycle
        key="vb"
        prefix="视角摇晃: "
        value={viewBobbing}
        onChange={(v) => set('viewBobbing', v)}
      />
    ],
    [
      <BoolCycle
        key="es"
        prefix="实体阴影: "
        value={entityShadows}
        onChange={(v) => set('entityShadows', v)}
      />,
      <MCCycleButton
        key="br"
        width={150}
        prefix="亮度: "
        options={BRIGHTNESS_OPTIONS}
        value={brightness}
        onChange={(v) => set('brightness', v)}
      />
    ],
    [
      <MCTooltip key="fs" content="浏览器拒绝了全屏请求" disabled={!fsFailed}>
        <MCCycleButton
          width={150}
          prefix="全屏: "
          options={ON_OFF}
          value={fullscreen ? 'on' : 'off'}
          onChange={(v) => void applyFullscreen(v === 'on')}
        />
      </MCTooltip>,
      <span key="fs-empty" />
    ]
  ];

  return (
    <SubScreenShell bg={bg} zIndex={zIndex} entrance={entrance} onDone={onDone} title="视频设置">
      <OptionsGrid rows={rows} anim={false} />
    </SubScreenShell>
  );
}

/* ------------------------------------------------------------------ *
 * C. 声音设置（options.md §C：单列 200u 滑条组；松手播放对应组示例音）
 * ------------------------------------------------------------------ */
const SOUND_SLIDERS: {
  key: 'masterVolume' | 'musicVolume' | 'blockVolume' | 'uiVolume' | 'ambientVolume';
  label: string;
  /** 松手试听（界面组由 MCSlider 内置 ui.click 覆盖；方块组补播 dig.stone） */
  sample?: () => void;
}[] = [
  { key: 'masterVolume', label: '主音量' },
  { key: 'musicVolume', label: '音乐' },
  { key: 'blockVolume', label: '方块', sample: () => soundManager.play('dig.stone') },
  { key: 'uiVolume', label: '界面' },
  { key: 'ambientVolume', label: '环境' }
];

export function OptionsSoundScreen({
  bg,
  onDone,
  entrance = true,
  zIndex
}: OptionsScreenBaseProps) {
  const masterVolume = useSettingsStore((s) => s.masterVolume);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  const blockVolume = useSettingsStore((s) => s.blockVolume);
  const uiVolume = useSettingsStore((s) => s.uiVolume);
  const ambientVolume = useSettingsStore((s) => s.ambientVolume);
  const set = useSettingsStore((s) => s.set);

  const values = { masterVolume, musicVolume, blockVolume, uiVolume, ambientVolume };

  return (
    <SubScreenShell bg={bg} zIndex={zIndex} entrance={entrance} onDone={onDone} title="音乐和声音">
      <div
        className="flex flex-col"
        style={{ gap: 'calc(4 * var(--u))', width: 'calc(200 * var(--u))' }}
      >
        {SOUND_SLIDERS.map(({ key, label, sample }) => (
          <MCSlider
            key={key}
            width={200}
            min={0}
            max={100}
            step={1}
            value={values[key]}
            label={(v) => `${label}: ${v}%`}
            onChange={(v) => set(key, v)}
            onChangeEnd={() => sample?.()}
          />
        ))}
      </div>
    </SubScreenShell>
  );
}

/* ------------------------------------------------------------------ *
 * D. 鼠标设置（options.md §D）
 * ------------------------------------------------------------------ */
export function OptionsMouseScreen({
  bg,
  onDone,
  entrance = true,
  zIndex
}: OptionsScreenBaseProps) {
  const sensitivity = useSettingsStore((s) => s.sensitivity);
  const invertY = useSettingsStore((s) => s.invertY);
  const wheelSensitivity = useSettingsStore((s) => s.wheelSensitivity);
  const set = useSettingsStore((s) => s.set);

  const rows: [ReactNode, ReactNode][] = [
    [
      <MCSlider
        key="sens"
        width={150}
        min={25}
        max={200}
        step={1}
        value={sensitivity}
        label={(v) => `灵敏度: ${v}%`}
        onChange={(v) => set('sensitivity', v)}
      />,
      <BoolCycle key="iy" prefix="反转Y轴: " value={invertY} onChange={(v) => set('invertY', v)} />
    ],
    [
      <MCSlider
        key="wheel"
        width={150}
        min={0.2}
        max={3}
        step={0.1}
        value={wheelSensitivity}
        label={(v) => `滚轮灵敏度: ${v.toFixed(1)}`}
        onChange={(v) => set('wheelSensitivity', v)}
      />,
      <span key="wheel-empty" />
    ]
  ];

  return (
    <SubScreenShell bg={bg} zIndex={zIndex} entrance={entrance} onDone={onDone} title="鼠标设置">
      <OptionsGrid rows={rows} anim={false} />
    </SubScreenShell>
  );
}

/* ------------------------------------------------------------------ *
 * E. 按键控制（options.md §E：点击改键、冲突标红、全部重置二次确认）
 * ------------------------------------------------------------------ */

/** 键位行（顺序对齐 options.md §E 与 DEFAULT_KEY_BINDINGS） */
const KEY_ROWS: { action: KeyAction; label: string }[] = [
  { action: 'forward', label: '移动：前进' },
  { action: 'back', label: '移动：后退' },
  { action: 'left', label: '移动：左移' },
  { action: 'right', label: '移动：右移' },
  { action: 'jump', label: '跳跃' },
  { action: 'sneak', label: '潜行' },
  { action: 'sprint', label: '疾跑' },
  { action: 'inventory', label: '物品栏' },
  { action: 'chat', label: '聊天' },
  { action: 'drop', label: '丢弃物品' },
  { action: 'debug', label: '切换调试屏' },
  { action: 'screenshot', label: '截图' }
];

/** KeyboardEvent.code 特殊键显示名（其余按 KeyX/DigitX/NumpadX/F* 规则推导） */
const SPECIAL_KEY_NAMES: Record<string, string> = {
  Space: 'Space',
  ShiftLeft: '左 Shift',
  ShiftRight: '右 Shift',
  ControlLeft: '左 Ctrl',
  ControlRight: '右 Ctrl',
  AltLeft: '左 Alt',
  AltRight: '右 Alt',
  MetaLeft: '左 Meta',
  MetaRight: '右 Meta',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Tab: 'Tab',
  CapsLock: 'Caps Lock',
  Backspace: '退格',
  Enter: '回车',
  Escape: 'Esc',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`'
};

/** KeyboardEvent.code → 按钮上显示的键名（options.md §E：右側 98u 按钮显示当前键名） */
export function keyName(code: string): string {
  const special = SPECIAL_KEY_NAMES[code];
  if (special) return special;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `小键盘 ${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  return code;
}

export function OptionsControlsScreen({
  bg,
  onDone,
  entrance = true,
  zIndex
}: OptionsScreenBaseProps) {
  const keyBindings = useSettingsStore((s) => s.keyBindings);
  const setKeyBinding = useSettingsStore((s) => s.setKeyBinding);
  const resetKeyBindings = useSettingsStore((s) => s.resetKeyBindings);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const [waiting, setWaiting] = useState<KeyAction | null>(null);
  const [justBound, setJustBound] = useState<KeyAction | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const justBoundTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (justBoundTimer.current !== null) window.clearTimeout(justBoundTimer.current);
    },
    []
  );

  /** 冲突集合：同一 code 被多个动作占用时，这些行全部标红（options.md §E：允许共存，玩家自行解决） */
  const conflicts = useMemo(() => {
    const byCode = new Map<string, KeyAction[]>();
    for (const { action } of KEY_ROWS) {
      const code = keyBindings[action];
      const list = byCode.get(code);
      if (list) list.push(action);
      else byCode.set(code, [action]);
    }
    const set = new Set<KeyAction>();
    for (const list of byCode.values()) {
      if (list.length > 1) for (const a of list) set.add(a);
    }
    return set;
  }, [keyBindings]);

  /**
   * 改键流程 + Esc 行为（捕获阶段 + stopImmediatePropagation，优先于其它全局键处理）：
   * - 等待按键中：任意键绑定并立即保存；Esc = 取消改键（不绑定 Esc，也不触发屏幕返回）；
   * - 非等待：Esc = 完成（确认弹窗打开时让位给 MCDialog 自己的 Esc 关闭）。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (waiting) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key !== 'Escape') {
          setKeyBinding(waiting, e.code);
          setJustBound(waiting);
          if (justBoundTimer.current !== null) window.clearTimeout(justBoundTimer.current);
          justBoundTimer.current = window.setTimeout(() => setJustBound(null), 240);
        }
        setWaiting(null);
        return;
      }
      if (e.key === 'Escape' && !confirmReset) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onDone();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [waiting, confirmReset, setKeyBinding, onDone]);

  const anim = entrance && !reducedMotion;

  return (
    <MCScreen bg={bg} style={zIndex != null ? { zIndex } : undefined}>
      <motion.div
        className="min-h-[100dvh]"
        initial={anim ? { x: 16, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.18, delay: 0.06, ease: 'easeOut' }}
      >
        <ScreenTitle title="按键控制" />
        <div
          className="flex min-h-[100dvh] flex-col items-center"
          style={{ paddingTop: 'calc(40 * var(--u))', paddingBottom: 'calc(8 * var(--u))' }}
        >
          {/* 列表：宽 320u、滚动（MCScrollbar 轨道 6u，内容右留 8u）；高度随窗口拉伸 */}
          <div
            className="flex w-full flex-1 flex-col items-center"
            style={{ minHeight: 'calc(96 * var(--u))', flexBasis: 0 }}
          >
            <div className="h-full" style={{ width: 'calc(320 * var(--u))' }}>
              <MCScrollbar height="100%">
                <div
                  className="flex flex-col"
                  style={{ gap: 'calc(4 * var(--u))', paddingRight: 'calc(8 * var(--u))' }}
                >
                  {KEY_ROWS.map(({ action, label }) => {
                    const isWaiting = waiting === action;
                    const isConflict = conflicts.has(action);
                    const btnLabel: ReactNode = isWaiting ? (
                      <motion.span
                        style={{ color: '#FFFF55', textShadow: 'var(--u) var(--u) 0 #3F3F15' }}
                        animate={reducedMotion ? undefined : { opacity: [1, 0.5, 1] }}
                        transition={
                          reducedMotion
                            ? undefined
                            : { duration: 0.6, repeat: Infinity, ease: 'linear' }
                        }
                      >
                        {'> ... <'}
                      </motion.span>
                    ) : isConflict ? (
                      <span className="mc-text-red">{keyName(keyBindings[action])}</span>
                    ) : (
                      keyName(keyBindings[action])
                    );
                    return (
                      <div
                        key={action}
                        className="flex items-center justify-between"
                        style={{ height: 'calc(20 * var(--u))' }}
                      >
                        <span className="mc-text-gray" style={{ fontSize: 'calc(8 * var(--u))' }}>
                          {label}
                        </span>
                        <motion.div
                          animate={justBound === action ? { scale: [1.1, 1] } : { scale: 1 }}
                          transition={{ duration: 0.12 }}
                        >
                          <MCButton
                            width={98}
                            label={btnLabel}
                            onClick={() => setWaiting(isWaiting ? null : action)}
                          />
                        </motion.div>
                      </div>
                    );
                  })}
                </div>
              </MCScrollbar>
            </div>
          </div>
          {/* 底部：全部重置（二次确认 MCDialog）+ 完成（各 98u，options.md §E） */}
          <div
            className="flex"
            style={{ gap: 'calc(4 * var(--u))', marginTop: 'calc(8 * var(--u))' }}
          >
            <MCButton label="全部重置" width={98} onClick={() => setConfirmReset(true)} />
            <MCButton label="完成" width={98} onClick={onDone} />
          </div>
        </div>
      </motion.div>
      <MCDialog
        open={confirmReset}
        lines={['确定要重置所有按键吗？']}
        buttons={[
          {
            label: '重置',
            variant: 'danger',
            width: 98,
            onClick: () => {
              resetKeyBindings();
              setConfirmReset(false);
            }
          },
          { label: '取消', width: 98, onClick: () => setConfirmReset(false) }
        ]}
        onClose={() => setConfirmReset(false)}
      />
    </MCScreen>
  );
}
