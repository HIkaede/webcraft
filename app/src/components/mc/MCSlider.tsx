/**
 * MCSlider —— 像素滑条（design.md §9 / options.md）。
 *
 * 结构：轨道高 4u（#000 + 1u 边框），滑块 8×20u 按钮样式；标签居中叠在 20u 滑条上
 * （格式如 `渲染距离: 6 个区块`，由 label 函数给出）。
 *
 * 行为（options.md §A/§B）：
 * - 拖动中滑块跟手（无惯性）、标签数值即时刷新 → onChange 高频回调；
 * - 松手才触发 onChangeEnd（播放 ui.click；重活如区块重建挂在这里）；
 * - 聚焦后 ←/→ 方向键按 step 微调。
 */
import { useCallback, useRef } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { soundManager, SOUNDS } from '@/game/sound/SoundManager';

export interface MCSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** 静态文本或格式化函数，如 (v) => `渲染距离: ${v} 个区块` */
  label: string | ((value: number) => string);
  /** 拖动中实时回调（仅更新显示/轻量状态） */
  onChange: (value: number) => void;
  /** 松手回调（提交重操作；已自动播放 ui.click） */
  onChangeEnd?: (value: number) => void;
  disabled?: boolean;
  /** 宽度（u），默认 200 */
  width?: number;
  className?: string;
}

/** 读取当前 --u 的 CSS px 值 */
function uPx(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--u').trim();
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

function snap(v: number, min: number, max: number, step: number): number {
  const s = Math.round((v - min) / step) * step + min;
  const fixed = Number(s.toFixed(6));
  return Math.min(max, Math.max(min, fixed));
}

export default function MCSlider({
  value,
  min,
  max,
  step = 1,
  label,
  onChange,
  onChangeEnd,
  disabled = false,
  width = 200,
  className
}: MCSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const clamped = snap(value, min, max, step);
  const ratio = max > min ? (clamped - min) / (max - min) : 0;
  const text = typeof label === 'function' ? label(clamped) : label;

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return clamped;
      const rect = el.getBoundingClientRect();
      const thumbW = 8 * uPx();
      const x = clientX - rect.left - thumbW / 2;
      const usable = rect.width - thumbW;
      const r = usable > 0 ? Math.min(1, Math.max(0, x / usable)) : 0;
      return snap(min + r * (max - min), min, max, step);
    },
    [clamped, max, min, step]
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(valueFromClientX(e.clientX));
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || disabled) return;
    onChange(valueFromClientX(e.clientX));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || disabled) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const v = valueFromClientX(e.clientX);
    onChange(v);
    soundManager.unlock();
    soundManager.play(SOUNDS.UI_CLICK);
    onChangeEnd?.(v);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = snap(clamped - step, min, max, step);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
      next = snap(clamped + step, min, max, step);
    if (next !== null) {
      e.preventDefault();
      onChange(next);
      soundManager.play(SOUNDS.UI_CLICK);
      onChangeEnd?.(next);
    }
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={clamped}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className={cn('relative touch-none select-none', disabled && 'opacity-60', className)}
      style={{ width: `calc(${width} * var(--u))`, height: 'calc(20 * var(--u))' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {/* 轨道：4u 高 #000 + 1u 边框，垂直居中 */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: 'calc(8 * var(--u))',
          height: 'calc(4 * var(--u))',
          background: '#000000',
          border: 'calc(1 * var(--u)) solid #2B2B2B'
        }}
      />
      {/* 滑块：8×20u 按钮样式 */}
      <div
        className="mc-btn absolute top-0"
        style={{
          width: 'calc(8 * var(--u))',
          height: 'calc(20 * var(--u))',
          left: `calc(${ratio} * (${width} - 8) * var(--u))`,
          padding: 0,
          pointerEvents: 'none'
        }}
      />
      {/* 标签：居中叠加，8u 白字硬阴影 */}
      <div
        className="mc-text pointer-events-none absolute inset-0 flex items-center justify-center"
        style={{ fontSize: 'calc(8 * var(--u))' }}
      >
        {text}
      </div>
    </div>
  );
}
