/**
 * 游戏页（路由 `#/game/:worldId`，game.md）——引擎与全部 HUD 的装配点。
 *
 * 流程：读取 meta/save → 创建引擎（LoadingScreen 显示 initProgress）→
 * READY → 点击进入（Pointer Lock）→ 游玩；Esc→暂停、E→物品栏、T→聊天、
 * F3→调试；暂停/死亡/选项/物品栏覆盖层由 GameStore.overlay 驱动；
 * 60s 自动保存 + 退出保存（saveWorld）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { createVoxelEngine, ENGINE_EVENTS } from '@/game/engine-contract';
import type { Engine } from '@/game/engine/Engine';
import { InputSystem } from '@/game/engine/input';
import { hashSeed, useWorldsStore, loadWorld, saveWorld } from '@/stores/worlds';
import type { WorldMeta, WorldSave } from '@/stores/worlds';
import { useSettingsStore } from '@/stores/settings';
import { useGameStore } from '@/stores/game';
import { MCButton } from '@/components/mc';
import OptionsOverlay from '@/components/options/OptionsOverlay';
import InventoryOverlay from '@/components/inventory/InventoryOverlay';
import { Crosshair } from '@/ui/hud/Crosshair';
import { Hotbar } from '@/ui/hud/Hotbar';
import { StatusBars } from '@/ui/hud/StatusBars';
import { DebugOverlay } from '@/ui/hud/DebugOverlay';
import { ChatLayer } from '@/ui/hud/ChatLayer';
import { PauseMenu } from '@/ui/hud/PauseMenu';
import { DeathScreen } from '@/ui/hud/DeathScreen';
import { LoadingScreen } from '@/ui/hud/LoadingScreen';
import { HandView } from '@/ui/hud/HandView';
import { soundManager } from '@/game/sound/SoundManager';

export default function GamePage() {
  const { worldId = '' } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const inputRef = useRef<InputSystem | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [meta, setMeta] = useState<WorldMeta | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const overlay = useGameStore((s) => s.overlay);
  const seedNumRef = useRef(0);

  /* ---------- 读取世界 meta + save ---------- */
  const saveRef = useRef<WorldSave | null>(null);
  const [saveLoaded, setSaveLoaded] = useState(false);
  useEffect(() => {
    const m = useWorldsStore.getState().getWorld(worldId) ?? null;
    setMeta(m);
    if (!m) return;
    useWorldsStore.getState().touchLastPlayed(worldId);
    void loadWorld(worldId).then((s) => {
      saveRef.current = s;
      setSaveLoaded(true);
    });
  }, [worldId]);

  /* ---------- 创建引擎 ---------- */
  useEffect(() => {
    if (!meta || !saveLoaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const settings = useSettingsStore.getState();
    const save = saveRef.current;
    const mode = save?.player.mode ?? meta.mode;
    useGameStore.getState().resetForWorld(save?.player ?? null, mode);
    seedNumRef.current = hashSeed(meta.seed);

    const eng = createVoxelEngine(canvas, {
      seed: seedNumRef.current,
      worldType: meta.worldType,
      mode,
      difficulty: meta.difficulty,
      structures: meta.structures,
      renderDistance: settings.renderDistance,
      fov: settings.fov,
      save
    }) as Engine;
    eng.worldMeta = meta;
    engineRef.current = eng;

    // 输入系统
    const gs = useGameStore.getState();
    const input = new InputSystem(
      canvas,
      {
        onRotate: (dy, dp) => eng.rotate(dy, dp),
        onCycleSlot: (dir) => useGameStore.getState().cycleSlot(dir),
        onSelectSlot: (slot) => useGameStore.getState().setSelectedSlot(slot),
        onToggleFly: () => eng.toggleFly(),
        onPrimaryChange: (down) => {
          eng.primaryDown = down;
        },
        onSecondaryChange: (down) => {
          eng.secondaryDown = down;
        },
        onPlaceOnce: () => eng.tryPlace()
      },
      eng.input
    );
    input.attach();
    inputRef.current = input;
    void gs;

    // 引擎事件
    const unsubs = [
      eng.on(ENGINE_EVENTS.READY, () => setReady(true)),
      eng.on(ENGINE_EVENTS.TIME_UPDATE, (p) => {
        useGameStore.getState().setWorldTime((p as { time: number }).time);
      }),
      eng.on(ENGINE_EVENTS.REQUEST_SAVE, (fn) => {
        const capture = fn as () => WorldSave;
        void saveWorld(capture());
      }),
      eng.on(ENGINE_EVENTS.ERROR, (p) => console.error('[engine]', p))
    ];

    // 设置热更新
    const unsubSettings = useSettingsStore.subscribe((s, prev) => {
      if (
        s.fov !== prev.fov ||
        s.renderDistance !== prev.renderDistance ||
        s.clouds !== prev.clouds
      ) {
        eng.applySettings();
      }
    });

    setEngine(eng);

    return () => {
      unsubs.forEach((u) => u());
      unsubSettings();
      input.detach();
      // 离开前保存
      try {
        void saveWorld(eng.captureSave());
      } catch {
        /* 忽略 */
      }
      eng.dispose();
      engineRef.current = null;
      inputRef.current = null;
      setEngine(null);
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, saveLoaded]);

  /* ---------- Pointer Lock 状态跟踪 ---------- */
  useEffect(() => {
    const onChange = () => {
      const isLocked = document.pointerLockElement === canvasRef.current;
      setLocked(isLocked);
      // 锁定丢失且本应游戏中 → 打开暂停菜单
      if (!isLocked && useGameStore.getState().overlay === 'none' && ready) {
        useGameStore.getState().setOverlay('pause');
      }
    };
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, [ready]);

  /* ---------- 覆盖层 ↔ 引擎暂停/输入 ---------- */
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (overlay !== 'none') {
      eng.setPaused(true);
      inputRef.current?.releaseAll();
      if (document.pointerLockElement) inputRef.current?.exitLock();
    } else {
      eng.setPaused(false);
    }
  }, [overlay, engine]);

  const requestLock = useCallback(() => {
    inputRef.current?.requestLock();
  }, []);

  /* ---------- 全局按键（Esc 栈 / E / T / F3） ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const gs = useGameStore.getState();
      const bindings = useSettingsStore.getState().keyBindings;
      if (e.code === 'Escape') {
        if (gs.overlay !== 'none') {
          e.preventDefault();
          gs.handleEscape();
        }
        return;
      }
      if (gs.overlay !== 'none') return; // 覆盖层打开时不处理游戏键
      if (e.code === bindings.inventory) {
        e.preventDefault();
        gs.setOverlay('inventory');
        soundManager.play('ui.click');
      } else if (e.code === bindings.chat) {
        e.preventDefault();
        gs.setOverlay('chat');
      } else if (e.code === 'Slash') {
        e.preventDefault();
        sessionStorage.setItem('mc.chat.prefill', '/');
        gs.setOverlay('chat');
      } else if (e.code === bindings.debug) {
        e.preventDefault();
        gs.toggleDebug();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- 保存退出 / 重生 ---------- */
  const saveAndQuit = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng || saving) return;
    setSaving(true);
    try {
      await saveWorld(eng.captureSave());
    } finally {
      navigate('/');
    }
  }, [navigate, saving]);

  const respawn = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    useGameStore.getState().respawn();
    eng.spawnPlayer(eng.getSpawn(), 0, 0);
    eng.setPaused(false);
    requestLock();
  }, [requestLock]);

  /* ---------- 渲染 ---------- */
  if (meta === null) {
    return (
      <div className="fixed inset-0 mc-dirt-bg flex flex-col items-center justify-center gap-6">
        <div
          className="font-pixel text-white mc-text-shadow"
          style={{ fontSize: 'calc(var(--u) * 9)' }}
        >
          找不到这个世界
        </div>
        <MCButton label="返回" onClick={() => navigate('/worlds')} />
      </div>
    );
  }

  const inGame = overlay === 'none';
  const showEnterGate = ready && inGame && !locked;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* 加载屏 */}
      {!ready && meta && <LoadingScreen engine={engine} worldName={meta.name} />}

      {/* 点击进入门 */}
      {showEnterGate && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
        >
          <MCButton label="点击进入游戏" onClick={requestLock} autoFocus />
          <div
            className="font-pixel mc-text-shadow mt-4"
            style={{ fontSize: 'calc(var(--u) * 6)', color: '#A0A0A0' }}
          >
            WASD 移动 · 空格跳跃 · 左键破坏 · 右键放置 · E 物品栏 · Esc 菜单
          </div>
        </div>
      )}

      {/* HUD */}
      {ready && inGame && <Crosshair />}
      {ready && <Hotbar engine={engine} />}
      {ready && <StatusBars />}
      {ready && <HandView engine={engine} />}
      {ready && <DebugOverlay engine={engine} seed={seedNumRef.current} />}
      {ready && <ChatLayer engine={engine} cheats={meta?.cheats ?? true} />}

      {/* 覆盖层 */}
      {ready && overlay === 'pause' && (
        <PauseMenu
          onResume={() => {
            useGameStore.getState().setOverlay('none');
            requestLock();
          }}
          onOptions={() => useGameStore.getState().setOverlay('options')}
          onSaveQuit={() => void saveAndQuit()}
          saving={saving}
        />
      )}
      {ready && overlay === 'options' && (
        <OptionsOverlay onClose={() => useGameStore.getState().setOverlay('pause')} />
      )}
      {ready && overlay === 'inventory' && (
        <InventoryOverlay onClose={() => useGameStore.getState().setOverlay('none')} />
      )}
      {ready && overlay === 'death' && (
        <DeathScreen onRespawn={respawn} onQuit={() => void saveAndQuit()} />
      )}
    </div>
  );
}
