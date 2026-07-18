/**
 * SettingsStore —— 全局设置（design.md §11.3，persist 到 localStorage `mc.web.settings`）。
 *
 * 默认值：FOV 70 / 界面尺寸 auto / 渲染距离 6 / 图像品质 fancy / 平滑光照 开 /
 * 云 开 / 粒子 all / 视角摇晃 开 / 减少动态效果 关 / 主音量 80 / 音乐 30 /
 * 方块 100 / 界面 100 / 环境 100 / 灵敏度 100 / 反转Y轴 关 / 滚轮灵敏度 1.0 /
 * 键位映射（见 DEFAULT_KEY_BINDINGS，options.md §E）。
 *
 * 副作用（initSettingsSideEffects，App 挂载时调用一次）：
 *  - 界面尺寸 → 计算并写入 CSS 变量 `--u`（design.md §5：auto = clamp(floor(min(vw/427, vh/240)), 2, 3)）
 *  - 音量 → SoundManager.setGroupVolume（即时生效）
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { soundManager } from '@/game/sound/SoundManager';

export const SETTINGS_STORAGE_KEY = 'mc.web.settings';

/** 界面尺寸设置：自动或 1x–4x 覆盖 */
export type GuiScaleSetting = 'auto' | 1 | 2 | 3 | 4;
export type GraphicsMode = 'fancy' | 'fast';
export type ParticlesMode = 'all' | 'decreased' | 'minimal';
export type BrightnessMode = 'bright' | 'dim';

/** 可改键的动作（值为 KeyboardEvent.code） */
export interface KeyBindings {
  forward: string;
  back: string;
  left: string;
  right: string;
  jump: string;
  sneak: string;
  sprint: string;
  inventory: string;
  chat: string;
  drop: string;
  debug: string;
  screenshot: string;
}
export type KeyAction = keyof KeyBindings;

/** 默认键位（options.md §E / game.md §10） */
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sneak: 'ShiftLeft',
  sprint: 'ControlLeft',
  inventory: 'KeyE',
  chat: 'KeyT',
  drop: 'KeyQ',
  debug: 'F3',
  screenshot: 'F2'
};

/** 设置值（不含函数） */
export interface SettingsValues {
  fov: number;
  guiScale: GuiScaleSetting;
  renderDistance: number;
  graphics: GraphicsMode;
  smoothLighting: boolean;
  clouds: boolean;
  particles: ParticlesMode;
  viewBobbing: boolean;
  reducedMotion: boolean;
  entityShadows: boolean;
  brightness: BrightnessMode;
  fullscreen: boolean;
  masterVolume: number;
  musicVolume: number;
  blockVolume: number;
  uiVolume: number;
  ambientVolume: number;
  sensitivity: number;
  invertY: boolean;
  wheelSensitivity: number;
  keyBindings: KeyBindings;
}

export const DEFAULT_SETTINGS: SettingsValues = {
  fov: 70,
  guiScale: 'auto',
  renderDistance: 6,
  graphics: 'fancy',
  smoothLighting: true,
  clouds: true,
  particles: 'all',
  viewBobbing: true,
  reducedMotion: false,
  entityShadows: true,
  brightness: 'bright',
  fullscreen: false,
  masterVolume: 80,
  musicVolume: 30,
  blockVolume: 100,
  uiVolume: 100,
  ambientVolume: 100,
  sensitivity: 100,
  invertY: false,
  wheelSensitivity: 1.0,
  keyBindings: DEFAULT_KEY_BINDINGS
};

export interface SettingsState extends SettingsValues {
  /** 更新单个设置（即时生效 + 落盘） */
  set: <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => void;
  /** 批量更新 */
  update: (patch: Partial<SettingsValues>) => void;
  /** 改键（options.md §E：冲突允许共存，由 UI 标红） */
  setKeyBinding: (action: KeyAction, code: string) => void;
  /** 全部重置键位 */
  resetKeyBindings: () => void;
  /** 全部恢复默认 */
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      update: (patch) => set(patch),
      setKeyBinding: (action, code) =>
        set((s) => ({ keyBindings: { ...s.keyBindings, [action]: code } })),
      resetKeyBindings: () => set({ keyBindings: { ...DEFAULT_KEY_BINDINGS } }),
      reset: () => set({ ...DEFAULT_SETTINGS, keyBindings: { ...DEFAULT_KEY_BINDINGS } })
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 1,
      // 只持久化值字段（函数不可序列化，merge 时保留当前实现的函数）
      partialize: (s) => {
        const values: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(s)) {
          if (typeof v !== 'function') values[k] = v;
        }
        return values as unknown as SettingsValues;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsValues>;
        return {
          ...current,
          ...p,
          keyBindings: { ...DEFAULT_KEY_BINDINGS, ...(p.keyBindings ?? {}) }
        };
      }
    }
  )
);

/* ------------------------------------------------------------------ *
 * GUI Scale → `--u`（design.md §5）
 * ------------------------------------------------------------------ */

/** 自动界面尺寸：S = clamp(floor(min(vw/427, vh/240)), 2, 3) */
export function computeAutoGuiScale(vw: number, vh: number): 2 | 3 {
  const s = Math.floor(Math.min(vw / 427, vh / 240));
  return Math.min(3, Math.max(2, s)) as 2 | 3;
}

/** 计算当前生效的 S（1–4） */
export function resolveGuiScale(setting: GuiScaleSetting, vw: number, vh: number): number {
  return setting === 'auto' ? computeAutoGuiScale(vw, vh) : setting;
}

/** 把界面尺寸写入 CSS 变量 --u（1u = S px） */
export function applyGuiScale(setting?: GuiScaleSetting): number {
  const s = setting ?? useSettingsStore.getState().guiScale;
  const resolved = resolveGuiScale(s, window.innerWidth, window.innerHeight);
  document.documentElement.style.setProperty('--u', `${resolved}px`);
  return resolved;
}

/**
 * 挂载设置副作用（App.tsx useEffect 中调用一次；返回清理函数）：
 * 1. 立即应用一次 --u 与音量；
 * 2. resize 时（auto 模式）重算 --u；
 * 3. 订阅设置变化：guiScale → --u；音量 → SoundManager。
 */
export function initSettingsSideEffects(): () => void {
  applyGuiScale();
  syncVolumes();

  const onResize = () => {
    if (useSettingsStore.getState().guiScale === 'auto') applyGuiScale('auto');
  };
  window.addEventListener('resize', onResize);

  const unsub = useSettingsStore.subscribe((state, prev) => {
    if (state.guiScale !== prev.guiScale) applyGuiScale(state.guiScale);
    if (
      state.masterVolume !== prev.masterVolume ||
      state.musicVolume !== prev.musicVolume ||
      state.blockVolume !== prev.blockVolume ||
      state.uiVolume !== prev.uiVolume ||
      state.ambientVolume !== prev.ambientVolume
    ) {
      syncVolumes();
    }
  });

  return () => {
    window.removeEventListener('resize', onResize);
    unsub();
  };
}

function syncVolumes(): void {
  const s = useSettingsStore.getState();
  soundManager.setGroupVolume('master', s.masterVolume / 100);
  soundManager.setGroupVolume('music', s.musicVolume / 100);
  soundManager.setGroupVolume('block', s.blockVolume / 100);
  soundManager.setGroupVolume('ui', s.uiVolume / 100);
  soundManager.setGroupVolume('ambient', s.ambientVolume / 100);
}

/** React 便捷读取：当前 --u 像素值（随设置/窗口变化） */
export function useGuiScalePx(): number {
  const guiScale = useSettingsStore((s) => s.guiScale);
  if (typeof window === 'undefined') return 3;
  return resolveGuiScale(guiScale, window.innerWidth, window.innerHeight);
}
