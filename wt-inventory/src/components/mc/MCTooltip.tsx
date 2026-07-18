/**
 * MCTooltip —— 紫框悬浮提示（design.md §3.1/§9，跟随光标）。
 *
 * - 底 rgba(16,0,16,0.94)，边框 1u 紫渐变 #5000FF→#28007F（见 index.css .mc-tooltip）。
 * - 跟随光标偏移 (12u, −8u)（design.md §6.1）；靠近右/下边缘时自动翻转，避免溢出。
 * - 淡入 100ms、延迟 150ms；多行文本时首行白、其余灰 #A0A0A0（原版物品提示风格）。
 *
 * 用法：
 * ```tsx
 * <MCTooltip content="网页版暂未开放此功能">
 *   <MCButton label="编辑" disabled />
 * </MCTooltip>
 * ```
 * 注意：disabled 按钮不触发原生 hover，本组件用外层 span 捕获事件，故禁用元素也能提示。
 */
import { useCallback, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface MCTooltipProps {
  /** 提示内容：字符串按行拆分（'\n'），或直接传 ReactNode 数组 */
  content: ReactNode | ReactNode[];
  children: ReactNode;
  /** 是否禁用提示（如按钮可用时无需提示） */
  disabled?: boolean;
  className?: string;
}

interface TipPos {
  x: number;
  y: number;
}

export default function MCTooltip({
  content,
  children,
  disabled = false,
  className
}: MCTooltipProps) {
  const [pos, setPos] = useState<TipPos | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const lines: ReactNode[] = Array.isArray(content)
    ? content
    : typeof content === 'string'
      ? content.split('\n')
      : [content];

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), 150); // 150ms 延迟
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
    setPos(null);
  }, []);

  const onMove = useCallback((e: ReactMouseEvent) => {
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 3;
    let x = e.clientX + 12 * u;
    let y = e.clientY - 8 * u;
    const tip = tipRef.current;
    if (tip) {
      const rect = tip.getBoundingClientRect();
      if (x + rect.width > window.innerWidth - 4) x = e.clientX - rect.width - 4 * u;
      if (y + rect.height > window.innerHeight - 4) y = window.innerHeight - rect.height - 4;
      if (y < 4) y = 4;
    }
    setPos({ x, y });
  }, []);

  if (disabled) return <>{children}</>;

  return (
    <span
      className={cn('inline-block', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseMove={onMove}
    >
      {children}
      <AnimatePresence>
        {visible && pos && (
          <motion.div
            ref={tipRef}
            className="mc-tooltip fixed z-[60]"
            style={{ left: pos.x, top: pos.y }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            {lines.map((line, i) => (
              <div key={i} className={i === 0 ? 'mc-text' : 'mc-text-gray'}>
                {line}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
