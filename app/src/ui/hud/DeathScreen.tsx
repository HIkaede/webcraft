/**
 * 死亡屏（game.md §9）：径向暗红背景、"你死了！"、重生 / 标题画面。
 * 进入 800ms 淡入；标题 scale 1.4→1 500ms easeOut。
 */
import { motion } from 'framer-motion';
import { MCButton } from '@/components/mc';
import { useGameStore } from '@/stores/game';

interface Props {
  onRespawn: () => void;
  onQuit: () => void;
}

export function DeathScreen({ onRespawn, onQuit }: Props) {
  const hardcore = useGameStore((s) => s.mode === 'hardcore');
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(96,0,0,0.65) 0%, rgba(32,0,0,0.85) 100%)'
      }}
    >
      <motion.div
        initial={{ scale: 1.4 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="font-pixel text-white mc-text-shadow text-center"
        style={{ fontSize: 'calc(var(--u) * 12)', marginBottom: 'calc(var(--u) * 8)' }}
      >
        你死了！
      </motion.div>
      <div
        className="font-pixel mc-text-shadow text-center"
        style={{
          fontSize: 'calc(var(--u) * 7)',
          color: '#A0A0A0',
          marginBottom: 'calc(var(--u) * 16)'
        }}
      >
        {hardcore ? '极限模式下死亡无法重生' : '在主世界重生'}
      </div>
      <div
        className="flex flex-col"
        style={{ gap: 'calc(var(--u) * 4)', width: 'calc(var(--u) * 200)' }}
      >
        {!hardcore && <MCButton label="重生" onClick={onRespawn} />}
        <MCButton label="标题画面" onClick={onQuit} />
      </div>
    </motion.div>
  );
}
