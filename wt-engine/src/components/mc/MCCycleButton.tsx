/**
 * MCCycleButton —— 循环选项按钮（design.md §9：游戏模式/难度/开关等）。
 *
 * 点击循环到下一项（到达末尾回到首项）并播放 ui.click；Shift+点击反向循环。
 * 按钮文本 = `prefix + 当前项 label`（prefix 含冒号，页面决定全角/半角，
 * 如 `游戏模式：` 或 `界面尺寸: `）。描述行由页面自行渲染并随 value 刷新。
 */
import { useMemo } from 'react';
import MCButton from '@/components/mc/MCButton';

export interface MCCycleOption<T extends string = string> {
  value: T;
  label: string;
}

export interface MCCycleButtonProps<T extends string = string> {
  /** 选项列表（按循环顺序） */
  options: readonly MCCycleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 文本前缀，如 `游戏模式：`（含冒号与空格由调用方决定） */
  prefix?: string;
  /** 禁用（如极限模式下难度锁定） */
  disabled?: boolean;
  /** 宽度（u），默认 200 */
  width?: number;
  className?: string;
  title?: string;
}

export default function MCCycleButton<T extends string = string>({
  options,
  value,
  onChange,
  prefix = '',
  disabled = false,
  width = 200,
  className,
  title
}: MCCycleButtonProps<T>) {
  const current = useMemo(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx >= 0 ? options[idx] : options[0];
  }, [options, value]);

  const cycle = (dir: 1 | -1) => {
    const idx = options.findIndex((o) => o.value === current.value);
    const next = options[(idx + dir + options.length) % options.length];
    onChange(next.value);
  };

  return (
    <MCButton
      label={`${prefix}${current.label}`}
      width={width}
      disabled={disabled}
      className={className}
      title={title}
      onClick={() => cycle(1)}
    />
  );
}
