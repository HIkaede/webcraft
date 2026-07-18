/**
 * MCLogo —— Minecraft Logo + 闪烁标语（design.md §9 / home.md）。
 *
 * - Logo SVG 274×44u（/logo.svg，透明背景，"网页版" 小字已内嵌右下）。
 * - Minceraft 彩蛋：每次会话 1/10000 概率换用 /logo-minceraft.svg（sessionStorage 记忆）。
 * - 闪烁标语（Splash）：锚点 = Logo 盒内 (227u, 40u)（等价于 home.md 的 (w/2+90u, 70u)），
 *   整体旋转 -20°，黄色 #FFFF00 + 阴影 #3F3F00；脉冲为原版公式
 *   `scale = (1.8 - |sin(t·2π)|·0.1) × 100/(文本宽+32)`，周期 1s。
 * - 点击 Logo：立即换一条标语并重新弹入（300ms）。
 * - 减少动态效果（设置或 prefers-reduced-motion）：静止不脉冲。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { isMinceraftSession, pickSplash } from './splash';

/** 用 canvas 测量标语在 8px 像素字体下的逻辑宽度（原版自适应公式用） */
function measureSplashWidth(text: string): number {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return text.length * 9;
    ctx.font = `8px Minecraft, 'Press Start 2P', 'Noto Sans SC', monospace`;
    return Math.max(10, ctx.measureText(text).width);
  } catch {
    return text.length * 9;
  }
}

export interface MCLogoProps {
  className?: string;
  style?: CSSProperties;
  /** 点击 Logo 额外回调（标语重roll始终执行） */
  onLogoClick?: () => void;
}

export default function MCLogo({ className, style, onLogoClick }: MCLogoProps) {
  const reducedMotionOption = useSettingsStore((s) => s.reducedMotion);
  const [splash, setSplash] = useState<string>(() => pickSplash());
  const [splashKey, setSplashKey] = useState(0);
  const [baseScale, setBaseScale] = useState(1.5);
  const minceraft = useMemo(() => isMinceraftSession(), []);

  const [prefersReduced, setPrefersReduced] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  const reducedMotion = reducedMotionOption || prefersReduced;

  // 文本宽度测量（字体加载完成后重测一次，保证自适应公式准确）
  useEffect(() => {
    const compute = () => {
      const w = measureSplashWidth(splash);
      // 原版：scale = pulse × 100/(文本宽+32)；pulse 均值 ≈ 1.75
      setBaseScale(Math.min(2.2, Math.max(0.7, 100 / (w + 32))));
    };
    compute();
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) compute();
    });
    return () => {
      cancelled = true;
    };
  }, [splash]);

  const reroll = useCallback(() => {
    setSplash((prev) => pickSplash(prev));
    setSplashKey((k) => k + 1);
    onLogoClick?.();
  }, [onLogoClick]);

  const logoSrc = `${import.meta.env.BASE_URL}${minceraft ? 'logo-minceraft.svg' : 'logo.svg'}`;
  const pulseLo = baseScale * 1.7;
  const pulseHi = baseScale * 1.8;

  return (
    <div
      className={cn('relative select-none', className)}
      style={{ width: 'calc(274 * var(--u))', height: 'calc(44 * var(--u))', ...style }}
      onClick={reroll}
      role="img"
      aria-label="Minecraft 网页版"
    >
      <img
        src={logoSrc}
        alt="Minecraft"
        draggable={false}
        className="pixelated block h-full w-full"
      />
      {/* 闪烁标语（锚点 Logo 盒内 (227u, 40u)，旋转 -20°） */}
      <div
        className="absolute"
        style={{
          left: 'calc(227 * var(--u))',
          top: 'calc(40 * var(--u))',
          transform: 'translate(-50%, -50%) rotate(-20deg)'
        }}
      >
        <motion.div
          key={splashKey}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut', delay: splashKey === 0 ? 0.5 : 0 }}
        >
          <motion.div
            animate={reducedMotion ? { scale: baseScale * 1.75 } : { scale: [pulseLo, pulseHi] }}
            transition={
              reducedMotion
                ? { duration: 0.2 }
                : { duration: 0.5, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }
            }
          >
            <span
              className="mc-text-yellow block whitespace-nowrap text-center"
              style={{ fontSize: 'calc(8 * var(--u))', lineHeight: 1 }}
            >
              {splash}
            </span>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
