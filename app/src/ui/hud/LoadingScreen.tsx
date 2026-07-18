/**
 * 生成地形加载屏（create-world.md §C）：泥土背景 + 4 阶段文案 + 真实进度条。
 * 进度由引擎 initProgress 驱动（rAF 轮询）。
 */
import { useEffect, useRef, useState } from 'react';
import type { Engine } from '@/game/engine/Engine';

const STAGES = ['生成地形中...', '放置植被...', '计算光照...', '准备出生点...'];

export function LoadingScreen({ engine, worldName }: { engine: Engine | null; worldName: string }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const poll = () => {
      if (engine) setProgress(engine.initProgress);
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafRef.current);
  }, [engine]);

  const stage = STAGES[Math.min(STAGES.length - 1, Math.floor(progress * STAGES.length))];

  return (
    <div className="absolute inset-0 z-50 mc-dirt-bg flex flex-col items-center justify-center">
      <div
        className="font-pixel text-white mc-text-shadow"
        style={{ fontSize: 'calc(var(--u) * 9)', marginBottom: 'calc(var(--u) * 4)' }}
      >
        {stage}
      </div>
      <div
        className="font-pixel mc-text-shadow"
        style={{
          fontSize: 'calc(var(--u) * 6)',
          color: '#A0A0A0',
          marginBottom: 'calc(var(--u) * 8)'
        }}
      >
        正在进入「{worldName}」
      </div>
      {/* 进度条 200×4u */}
      <div
        style={{
          width: 'calc(var(--u) * 200)',
          height: 'calc(var(--u) * 4)',
          background: '#202020',
          border: 'calc(var(--u) * 1) solid #000'
        }}
      >
        <div
          className="h-full transition-[width] duration-150"
          style={{ width: `${Math.round(progress * 100)}%`, background: '#7cbb54' }}
        />
      </div>
      <div
        className="font-pixel mc-text-shadow"
        style={{
          fontSize: 'calc(var(--u) * 6)',
          color: '#A0A0A0',
          marginTop: 'calc(var(--u) * 3)'
        }}
      >
        {Math.round(progress * 100)}%
      </div>
    </div>
  );
}
