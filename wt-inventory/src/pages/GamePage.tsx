/**
 * 游戏页（路由 `#/game/:worldId`，game.md）——脚手架占位实现。
 *
 * 当前行为：挂载 <canvas> 并尝试调用 engine-contract 的 createVoxelEngine()；
 * 该工厂目前是会抛异常的 stub（等待引擎代理实现），捕获后显示
 * 「引擎加载中…」占位屏。HUD 占位容器已按 game.md §6 布局预置，
 * 引擎代理接入时重写本文件（保留路由参数契约即可）。
 *
 * 路由参数：
 * - `:worldId` —— WorldMeta.id（stores/worlds.ts）
 * - `?fresh=1` —— 新建世界首次进入（create-world.md §C：生成地形加载屏）
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { createVoxelEngine } from '@/game/engine-contract';
import type { VoxelEngine } from '@/game/engine-contract';
import { hashSeed, useWorldsStore } from '@/stores/worlds';
import { useSettingsStore } from '@/stores/settings';
import { useGameStore } from '@/stores/game';
import { MCButton, MCScreen } from '@/components/mc';

export default function GamePage() {
  const { worldId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const fresh = searchParams.get('fresh') === '1';
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VoxelEngine | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const meta = useWorldsStore.getState().getWorld(worldId);
    const settings = useSettingsStore.getState();
    // HUD/覆盖层代理：玩家状态已按模式初始化（创造默认快捷栏）
    useGameStore.getState().resetForWorld(null, meta?.mode ?? 'creative');
    // 引擎创建放到微任务中，避免在 effect 体内同步 setState（React 19 级联渲染告警）
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        engineRef.current = createVoxelEngine(canvas, {
          seed: hashSeed(meta?.seed ?? worldId),
          worldType: meta?.worldType ?? 'default',
          mode: meta?.mode ?? 'creative',
          difficulty: meta?.difficulty ?? 'normal',
          structures: meta?.structures ?? true,
          renderDistance: settings.renderDistance,
          fov: settings.fov,
          save: null // 引擎代理接入点：fresh=1 时生成新世界，否则 loadWorld(worldId) 后回放差量
        });
        if (!cancelled) setEngineError(null);
      } catch (e) {
        console.warn('[GamePage] 体素引擎尚未就绪（脚手架阶段预期行为）：', e);
        if (!cancelled) setEngineError(e instanceof Error ? e.message : String(e));
      }
    });
    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [worldId, fresh]);

  if (engineError) {
    // 引擎 stub 阶段的占位屏（引擎代理实现后本分支自然消失）
    return (
      <MCScreen bg="dirt">
        <div
          className="flex min-h-[100dvh] flex-col items-center justify-center"
          style={{ gap: 'calc(6 * var(--u))' }}
        >
          <div className="mc-text text-center" style={{ fontSize: 'calc(8 * var(--u))' }}>
            引擎加载中…
          </div>
          <div className="mc-text-gray text-center" style={{ fontSize: 'calc(8 * var(--u))' }}>
            体素引擎正在接入（世界 id：{worldId || '未知'}）
          </div>
          <MCButton label="返回标题画面" width={200} onClick={() => navigate('/')} />
        </div>
      </MCScreen>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* 体素世界画布（引擎持有 WebGLRenderer；禁止任何 CSS transition，design.md §6.3） */}
      <canvas
        ref={canvasRef}
        className="mc-cursor-none"
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}
      />
      {/* HUD 占位容器（game.md §6；HUD 代理在此填充/或自行 portal） */}
      <div className="pointer-events-none absolute inset-0 z-10" data-hud-root>
        {/* 准星：+ 形 15u×1u，白色 difference 反色（game.md §6.2） */}
        <div
          className="mc-crosshair absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          data-hud="crosshair"
        >
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white"
            style={{ width: 'calc(15 * var(--u))', height: 'calc(1 * var(--u))' }}
          />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white"
            style={{ width: 'calc(1 * var(--u))', height: 'calc(15 * var(--u))' }}
          />
        </div>
        {/* 快捷栏占位：182×22u 底部居中（game.md §6.3） */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          data-hud="hotbar"
          style={{
            width: 'calc(182 * var(--u))',
            height: 'calc(22 * var(--u))',
            background: 'rgba(0,0,0,0.45)',
            border: 'calc(1 * var(--u)) solid rgba(255,255,255,0.35)'
          }}
        />
        {/* 状态条占位（红心/饥饿/经验，game.md §6.4） */}
        <div data-hud="status-bars" />
        {/* 覆盖层占位（暂停/物品栏/聊天/死亡；由 GameStore.overlay 驱动） */}
        <div data-hud="overlay-root" />
      </div>
    </div>
  );
}
