/**
 * MCScreen —— 全屏菜单容器（design.md §9）。
 *
 * 背景类型：
 * - `panorama`：透明（标题画面，Panorama 组件自行渲染背景；本容器只加渐变罩可选）
 * - `dirt`：程序泥土平铺 × #404040 正片叠底（标题以外所有全屏菜单）
 * - `ingame`：世界画面之上 rgba(12,12,12,0.60) + blur(8px)（暂停/游戏内选项）
 * - `death`：径向暗红 rgba(96,0,0,0.65)→rgba(32,0,0,0.85)（死亡画面）
 *
 * 可选屏幕标题：居中、顶距 15u、8u 白字（design.md §5 度量）。
 * 窗口小于逻辑 427×240u 时允许内容溢出滚动（§5）。
 */
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type MCScreenBg = 'panorama' | 'dirt' | 'ingame' | 'death';

export interface MCScreenProps {
  bg: MCScreenBg;
  /** 屏幕标题（y=15u 居中，8u 白字硬阴影） */
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
}

const BG_CLASS: Record<MCScreenBg, string> = {
  panorama: '',
  dirt: 'mc-dirt-bg',
  ingame: 'mc-ingame-mask',
  death: 'mc-death-bg'
};

export default function MCScreen({
  bg,
  title,
  children,
  className,
  contentClassName,
  style
}: MCScreenProps) {
  return (
    <div
      className={cn('fixed inset-0 overflow-auto', BG_CLASS[bg], className)}
      style={style}
      data-mc-screen={bg}
    >
      {title != null && (
        <div
          className="mc-text pointer-events-none absolute left-1/2 -translate-x-1/2 text-center"
          style={{ top: 'calc(15 * var(--u))', fontSize: 'calc(8 * var(--u))' }}
        >
          {title}
        </div>
      )}
      <div className={cn('relative min-h-full w-full', contentClassName)}>{children}</div>
    </div>
  );
}
