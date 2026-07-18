/**
 * MCScrollbar —— MC 风格滚动条容器（design.md §9）。
 *
 * 结构：内容区（原生滚动，隐藏原生滚动条）+ 右侧 6u 轨道（#000）
 * + 滑块（#C0C0C0 带斜角，可拖拽）。滚轮每格滚动 wheelStep（默认 ≈3 个列表条目）。
 * 仅当内容超出可视高度时显示轨道（inventory.md：内容超 5 行时可用）。
 *
 * 用法：
 * ```tsx
 * <MCScrollbar height={200} className="w-full">
 *   {items.map(...)}
 * </MCScrollbar>
 * // 或通过 ref 拿到内部滚动容器：scrollRef.current.scrollTop = 0
 * ```
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MCScrollbarProps {
  /** 高度：数字 = 逻辑像素 u；字符串 = 任意 CSS 值（默认 '100%'） */
  height?: number | string;
  /** 滚轮步长（CSS px），默认 114（≈3 个 36u 条目 @S=3） */
  wheelStep?: number;
  children: ReactNode;
  className?: string;
  /** 内容区内边距等（注意为轨道预留右侧 6u+ 间距） */
  contentClassName?: string;
}

export interface MCScrollbarHandle {
  /** 内部滚动容器（可直接读写 scrollTop） */
  scroller: HTMLDivElement | null;
}

interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

const MCScrollbar = forwardRef<MCScrollbarHandle, MCScrollbarProps>(function MCScrollbar(
  { height = '100%', wheelStep = 114, children, className, contentClassName },
  ref
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    scrollTop: 0,
    clientHeight: 0,
    scrollHeight: 0
  });
  const dragRef = useRef<{ startY: number; startScrollTop: number } | null>(null);

  useImperativeHandle(ref, () => ({ scroller: scrollRef.current }), []);

  const sync = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMetrics({
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight
    });
  }, []);

  // 尺寸变化（窗口/内容）时重新测量
  useEffect(() => {
    sync();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [sync]);

  // 滚轮步长（非 passive，保证原版“3 条目/格”手感）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollTop += Math.sign(e.deltaY) * wheelStep;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [wheelStep]);

  const onScroll = () => sync();

  const scrollable = metrics.scrollHeight > metrics.clientHeight + 1;
  const thumbH = scrollable
    ? Math.max(20, (metrics.clientHeight / metrics.scrollHeight) * metrics.clientHeight)
    : 0;
  const maxThumbTop = Math.max(1, metrics.clientHeight - thumbH);
  const maxScroll = Math.max(1, metrics.scrollHeight - metrics.clientHeight);
  const thumbTop = scrollable ? (metrics.scrollTop / maxScroll) * maxThumbTop : 0;

  const onThumbPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startY: e.clientY, startScrollTop: scrollRef.current?.scrollTop ?? 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onThumbPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollRef.current;
    if (!drag || !el) return;
    const dy = e.clientY - drag.startY;
    el.scrollTop = drag.startScrollTop + (dy / maxThumbTop) * maxScroll;
  };
  const onThumbPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const up = e.clientY < rect.top + thumbTop + thumbH / 2;
    el.scrollTop += (up ? -1 : 1) * metrics.clientHeight;
  };

  const heightCss = typeof height === 'number' ? `calc(${height} * var(--u))` : height;

  return (
    <div className={cn('relative', className)} style={{ height: heightCss }}>
      <div
        ref={scrollRef}
        className={cn('mc-no-scrollbar h-full overflow-y-auto', contentClassName)}
        onScroll={onScroll}
      >
        {children}
      </div>
      {scrollable && (
        <div
          className="absolute bottom-0 right-0 top-0"
          style={{ width: 'calc(6 * var(--u))', background: '#000000' }}
          onPointerDown={onTrackPointerDown}
        >
          <div
            className="absolute left-0 right-0"
            style={{
              top: thumbTop,
              height: thumbH,
              background: '#C0C0C0',
              boxShadow:
                'inset calc(1 * var(--u)) calc(1 * var(--u)) 0 rgba(255,255,255,0.6), inset calc(-1 * var(--u)) calc(-1 * var(--u)) 0 rgba(0,0,0,0.35)',
              touchAction: 'none'
            }}
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove}
            onPointerUp={onThumbPointerUp}
          />
        </div>
      )}
    </div>
  );
});

export default MCScrollbar;
