/**
 * F3 调试屏（game.md §7）：左列坐标/朝向/群系/光照/时间，
 * 右列目标方块信息。数据每 250ms 从引擎拉取，DOM 直写（无 React 重渲染）。
 * 切换播放 ui.click；开启 x:-8→0 150ms 入场。
 */
import { useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/game';
import { BLOCK_STRING_IDS } from '@/game/engine-contract';
import { soundManager } from '@/game/sound/SoundManager';
import type { Engine } from '@/game/engine/Engine';

const DIRS: [number, string, string][] = [
  [-90, 'east', 'Towards positive X'],
  [0, 'south', 'Towards positive Z'],
  [90, 'west', 'Towards negative X'],
  [180, 'north', 'Towards negative Z']
];

function facing(yaw: number): [string, string] {
  let best: [string, string] = ['south', 'Towards positive Z'];
  let bestD = 999;
  for (const [a, name, desc] of DIRS) {
    let d = Math.abs(yaw - a);
    if (d > 180) d = 360 - d;
    if (d < bestD) {
      bestD = d;
      best = [name, desc];
    }
  }
  return best;
}

export function DebugOverlay({ engine, seed }: { engine: Engine | null; seed: number }) {
  const visible = useGameStore((s) => s.debugVisible);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const wasVisible = useRef(false);

  useEffect(() => {
    if (visible && !wasVisible.current) soundManager.play('ui.click');
    wasVisible.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!visible || !engine) return;
    const update = () => {
      const pos = engine.getPlayerPos();
      const [yaw, pitch] = engine.getYawPitch();
      const [fname, fdesc] = facing(yaw);
      const bx = Math.floor(pos[0]);
      const by = Math.floor(pos[1]);
      const bz = Math.floor(pos[2]);
      const [loaded, rendered] = engine.getChunkStats();
      const [sky, blk] = engine.getLightAt(bx, by, bz);
      const time = engine.getTime();
      const cx = Math.floor(bx / 16);
      const cz = Math.floor(bz / 16);
      const lines = [
        'Minecraft Web 1.0.0 (vanilla/web)',
        `${Math.round(engine.getFps())} fps (${engine.getChunkUpdates()} chunk updates)  C: ${rendered}/${loaded}  E: ${engine.getParticleCount()}/512`,
        `XYZ: ${pos[0].toFixed(3)} / ${pos[1].toFixed(3)} / ${pos[2].toFixed(3)}`,
        `Block: ${bx} ${by} ${bz}   Chunk: ${bx & 15} ${by & 15} in ${cx} ${cz}`,
        `Facing: ${fname} (${fdesc}) (yaw ${yaw.toFixed(1)} / pitch ${pitch.toFixed(1)})`,
        `Biome: minecraft_web:${engine.getBiomeAt(pos[0], pos[2])}`,
        `Light: ${Math.max(sky, blk)} (${sky} sky, ${blk} block)`,
        `Time: ${Math.round(time)} (${time < 12000 ? 'day' : 'night'}), Seed: ${seed}`
      ];
      if (leftRef.current)
        leftRef.current.innerHTML = lines.map((l) => `<div class="f3line">${l}</div>`).join('');

      const hit = engine.getTargetBlock();
      if (rightRef.current) {
        if (hit) {
          rightRef.current.innerHTML = [
            `Targeted Block: ${hit.block[0]} ${hit.block[1]} ${hit.block[2]}`,
            `minecraft_web:${BLOCK_STRING_IDS[hit.id] ?? 'unknown'}`,
            `facing: ${hit.face[1] === 1 ? 'up' : hit.face[1] === -1 ? 'down' : hit.face[0] === 1 ? 'east' : hit.face[0] === -1 ? 'west' : hit.face[2] === 1 ? 'south' : 'north'}`
          ]
            .map((l) => `<div class="f3line">${l}</div>`)
            .join('');
        } else {
          rightRef.current.innerHTML = '';
        }
      }
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [visible, engine, seed]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 animate-[f3in_150ms_ease-out]">
      <div ref={leftRef} className="absolute left-1 top-1 flex flex-col items-start gap-px" />
      <div ref={rightRef} className="absolute right-1 top-1 flex flex-col items-end gap-px" />
      <style>{`
        .f3line {
          font-family: 'Minecraft', 'Press Start 2P', 'Noto Sans SC', monospace;
          font-size: calc(var(--u) * 6);
          line-height: calc(var(--u) * 7);
          color: #fff;
          background: rgba(16,16,16,0.55);
          padding: 0 calc(var(--u) * 2);
          white-space: pre;
        }
        @keyframes f3in { from { transform: translateX(-8px); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>
    </div>
  );
}
