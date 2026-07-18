/**
 * OptionsOverlay —— 游戏内选项覆盖层（GameStore overlay === 'options'，design.md §10 / options.md 双入口）。
 *
 * 自包含全屏覆盖：背景 = MCScreen bg='ingame'（rgba(12,12,12,0.60) + backdrop blur(8px)，
 * 与暂停菜单同款压暗模糊），z-40 压在游戏 HUD 之上；世界冻结由引擎侧负责。
 *
 * 内容与路由选项页完全相同（OptionsScreens 共享组件），但子屏切换是内部状态而非路由：
 * - 主屏「视频设置...」等 → 内部切屏；子屏「完成」→ 回主屏；主屏「完成」→ onClose()
 *   （由引擎页决定后续，通常为回到暂停菜单 overlay='pause'）。
 * - 转场（options.md §动效汇总）：旧屏 x 0→-16px/opacity 1→0 120ms，
 *   新屏 x 16→0/opacity 0→1 180ms delay 60ms；返回主屏时反向；减少动态效果 = 瞬时切换。
 * - Esc 逐级返回由 OptionsScreens 各屏自行处理（改键等待中 Esc = 取消改键，见按键控制屏）。
 */
import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSettingsStore } from '@/stores/settings';
import {
  OptionsControlsScreen,
  OptionsMainScreen,
  OptionsMouseScreen,
  OptionsSoundScreen,
  OptionsVideoScreen
} from '@/components/options/OptionsScreens';
import type { OptionsSubScreen } from '@/components/options/OptionsScreens';

export interface OptionsOverlayProps {
  /** 主屏「完成」/ Esc 触发（引擎页：回到暂停菜单） */
  onClose: () => void;
}

type OverlayScreen = 'main' | OptionsSubScreen;

export default function OptionsOverlay({ onClose }: OptionsOverlayProps) {
  const [screen, setScreen] = useState<OverlayScreen>('main');
  /** 转场方向：1 = 进入子屏（旧左出/新右入），-1 = 返回主屏（反向） */
  const [dir, setDir] = useState<1 | -1>(1);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);

  const goSub = useCallback((next: OptionsSubScreen) => {
    setDir(1);
    setScreen(next);
  }, []);
  const goMain = useCallback(() => {
    setDir(-1);
    setScreen('main');
  }, []);

  const base = { bg: 'ingame' as const, entrance: false, zIndex: 40 };
  const content =
    screen === 'main' ? (
      <OptionsMainScreen {...base} inGame onNavigate={goSub} onDone={onClose} />
    ) : screen === 'video' ? (
      <OptionsVideoScreen {...base} onDone={goMain} />
    ) : screen === 'sound' ? (
      <OptionsSoundScreen {...base} onDone={goMain} />
    ) : screen === 'mouse' ? (
      <OptionsMouseScreen {...base} onDone={goMain} />
    ) : (
      <OptionsControlsScreen {...base} onDone={goMain} />
    );

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={screen}
        className="fixed inset-0 z-40"
        initial={reducedMotion ? { opacity: 0 } : { x: 16 * dir, opacity: 0 }}
        animate={{
          x: 0,
          opacity: 1,
          transition: {
            duration: reducedMotion ? 0 : 0.18,
            delay: reducedMotion ? 0 : 0.06,
            ease: 'easeOut'
          }
        }}
        exit={{
          ...(reducedMotion ? { opacity: 0 } : { x: -16 * dir, opacity: 0 }),
          transition: { duration: reducedMotion ? 0 : 0.12, delay: 0 }
        }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
