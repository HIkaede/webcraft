/**
 * MCButton —— Minecraft 风格按钮（design.md §3.1 三态 / §9）。
 *
 * - 尺寸以逻辑像素 u 计：标准 200×20u、半宽 98×20u、图标按钮 20×20u（width 传 20）。
 * - hover 瞬时换高亮态（0ms 原版手感）；`:active` 文本阴影消失、文字下移 1u（见 index.css .mc-btn）。
 * - click 播放 `ui.click` 音效（design.md §6.1 必须）；disabled 时不发音不响应。
 * - 键盘可达：Tab 聚焦（1u 白虚线框），Enter/Space 触发。
 *
 * 视觉样式集中在 index.css 的 `.mc-btn`，本组件只负责结构与行为。
 */
import { forwardRef, useCallback } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { soundManager, SOUNDS } from '@/game/sound/SoundManager';

export interface MCButtonProps {
  /** 按钮文本（自动带 MC 硬阴影） */
  label: ReactNode;
  /** 宽度（逻辑像素 u）。常用：200（标准）/ 98（半宽）/ 150 / 20（图标按钮） */
  width?: number;
  /** 禁用态：灰面灰字、不响应、不发音 */
  disabled?: boolean;
  onClick?: () => void;
  /** danger = 文字 #FF5555（删除等危险操作） */
  variant?: 'default' | 'danger';
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  title?: string;
  'aria-label'?: string;
}

const MCButton = forwardRef<HTMLButtonElement, MCButtonProps>(function MCButton(
  {
    label,
    width = 200,
    disabled = false,
    onClick,
    variant = 'default',
    className,
    style,
    autoFocus,
    title,
    ...rest
  },
  ref
) {
  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (disabled) {
        e.preventDefault();
        return;
      }
      soundManager.unlock(); // 点击即用户手势，确保 AudioContext 已解锁
      soundManager.play(SOUNDS.UI_CLICK);
      onClick?.();
    },
    [disabled, onClick]
  );

  return (
    <button
      ref={ref}
      type="button"
      className={cn('mc-btn', variant === 'danger' && 'mc-btn-danger', className)}
      style={{ width: `calc(${width} * var(--u))`, ...style }}
      disabled={disabled}
      onClick={handleClick}
      autoFocus={autoFocus}
      title={title}
      aria-label={rest['aria-label']}
    >
      <span className="mc-btn-label">{label}</span>
    </button>
  );
});

export default MCButton;
