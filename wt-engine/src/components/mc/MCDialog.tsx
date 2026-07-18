/**
 * MCDialog —— 模态确认框（design.md §9 / worlds.md 删除确认）。
 *
 * 结构：rgba(0,0,0,0.5) 遮罩（泥土背景仍可见）+ 泥土背景面板（默认宽 280u）
 * + 可选标题 + 文本行 + 按钮行。
 *
 * 动效（worlds.md）：遮罩 opacity 0→1 150ms；面板 scale 0.9→1 + opacity 0→1 180ms easeOut；
 * 关闭反向 120ms。Esc / 点击遮罩 = onClose（传了 onClose 才可关）。
 *
 * 用法：
 * ```tsx
 * <MCDialog
 *   open={confirming}
 *   lines={['你确定要删除这个世界吗？', `'${name}' 将永远消失！（真的很久！）`]}
 *   buttons={[
 *     { label: '删除', variant: 'danger', width: 98, onClick: doDelete },
 *     { label: '取消', width: 98, onClick: () => setConfirming(false) },
 *   ]}
 *   onClose={() => setConfirming(false)}
 * />
 * ```
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MCButton from '@/components/mc/MCButton';
import { cn } from '@/lib/utils';

export interface MCDialogButton {
  label: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  /** 宽度（u），默认 98 */
  width?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}

export interface MCDialogProps {
  open: boolean;
  /** 面板标题（白字，可选） */
  title?: ReactNode;
  /** 文本行（默认白字硬阴影；需要灰字时自行包一层 span.mc-text-gray） */
  lines?: ReactNode[];
  buttons: MCDialogButton[];
  /** Esc 与点击遮罩触发；不传则只能点按钮关闭 */
  onClose?: () => void;
  /** 面板宽度（u），默认 280 */
  width?: number;
  className?: string;
}

export default function MCDialog({
  open,
  title,
  lines,
  buttons,
  onClose,
  width = 280,
  className
}: MCDialogProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="mc-dialog-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            key="mc-dialog-panel"
            className={cn('mc-dirt-bg flex flex-col items-center', className)}
            style={{
              width: `calc(${width} * var(--u))`,
              border: 'calc(2 * var(--u)) solid #000000',
              padding: 'calc(8 * var(--u)) calc(10 * var(--u))'
            }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {title != null && (
              <div
                className="mc-text text-center"
                style={{ fontSize: 'calc(8 * var(--u))', marginBottom: 'calc(6 * var(--u))' }}
              >
                {title}
              </div>
            )}
            {lines?.map((line, i) => (
              <div
                key={i}
                className="mc-text text-center"
                style={{ fontSize: 'calc(8 * var(--u))', marginBottom: 'calc(3 * var(--u))' }}
              >
                {line}
              </div>
            ))}
            <div
              className="flex"
              style={{ gap: 'calc(4 * var(--u))', marginTop: 'calc(5 * var(--u))' }}
            >
              {buttons.map((b, i) => (
                <MCButton
                  key={i}
                  label={b.label}
                  width={b.width ?? 98}
                  variant={b.variant ?? 'default'}
                  disabled={b.disabled}
                  autoFocus={b.autoFocus}
                  onClick={b.onClick}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
