/**
 * MCTextInput —— MC 黑底输入框（design.md §5/§9）。
 *
 * 样式：200×20u，底 #000000、框 1u #A0A0A0（聚焦时 #FFFFFF），白字硬阴影。
 * 光标闪烁、选中色等由浏览器原生处理；外观对齐原版。
 */
import { forwardRef } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface MCTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  /** 宽度（u），默认 200 */
  width?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  onEnter?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  'aria-label'?: string;
}

const MCTextInput = forwardRef<HTMLInputElement, MCTextInputProps>(function MCTextInput(
  {
    value,
    onChange,
    placeholder,
    maxLength,
    width = 200,
    autoFocus,
    disabled,
    className,
    style,
    onEnter,
    onKeyDown,
    ...rest
  },
  ref
) {
  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      disabled={disabled}
      aria-label={rest['aria-label']}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter?.();
        onKeyDown?.(e);
      }}
      className={cn(
        'mc-text box-border block bg-black text-white outline-none',
        'placeholder:text-[#707070] placeholder:[text-shadow:none]',
        className
      )}
      style={{
        width: `calc(${width} * var(--u))`,
        height: 'calc(20 * var(--u))',
        border: 'calc(1 * var(--u)) solid #A0A0A0',
        padding: '0 calc(4 * var(--u))',
        fontSize: 'calc(8 * var(--u))',
        ...style
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = '#FFFFFF';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = '#A0A0A0';
      }}
      spellCheck={false}
      autoComplete="off"
    />
  );
});

export default MCTextInput;
