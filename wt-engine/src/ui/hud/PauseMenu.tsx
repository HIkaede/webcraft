/**
 * 暂停菜单（pause.md）：回到游戏 / 进度(禁用) / 统计(禁用) /
 * 对局域网开放(禁用) / 选项... / 保存并退出到标题画面。
 * 世界冻结由 GamePage 在 overlay!=none 时 setPaused(true) 保证。
 */
import { motion } from 'framer-motion';
import { MCButton, MCTooltip } from '@/components/mc';
import { useGameStore } from '@/stores/game';

interface Props {
  onResume: () => void;
  onOptions: () => void;
  onSaveQuit: () => void;
  saving: boolean;
}

export function PauseMenu({ onResume, onOptions, onSaveQuit, saving }: Props) {
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mode = useGameStore((s) => s.mode);

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center"
      style={{ background: 'rgba(12,12,12,0.60)', backdropFilter: 'blur(8px)' }}
    >
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12 }}
        className="flex flex-col items-center w-full"
        style={{ marginTop: 'calc(var(--u) * 40)' }}
      >
        <div
          className="font-pixel text-white mc-text-shadow text-center"
          style={{ fontSize: 'calc(var(--u) * 8)', marginBottom: 'calc(var(--u) * 4)' }}
        >
          游戏菜单
        </div>
        <div
          className="font-pixel mc-text-shadow text-center"
          style={{
            fontSize: 'calc(var(--u) * 6)',
            color: '#A0A0A0',
            marginBottom: 'calc(var(--u) * 12)'
          }}
        >
          {mode === 'creative' ? '创造模式' : mode === 'hardcore' ? '极限模式' : '生存模式'}
        </div>

        <div
          className="flex flex-col"
          style={{ gap: 'calc(var(--u) * 4)', width: 'calc(var(--u) * 200)' }}
        >
          <MCButton label="回到游戏" onClick={onResume} />
          <div className="flex" style={{ gap: 'calc(var(--u) * 4)' }}>
            <MCTooltip content="进度系统将在后续版本开放">
              <MCButton label="进度" width={98} disabled onClick={() => {}} />
            </MCTooltip>
            <MCTooltip content="统计系统将在后续版本开放">
              <MCButton label="统计" width={98} disabled onClick={() => {}} />
            </MCTooltip>
          </div>
          <div className="flex" style={{ gap: 'calc(var(--u) * 4)' }}>
            <MCTooltip content="网页版暂不支持局域网联机">
              <MCButton label="对局域网开放" width={98} disabled onClick={() => {}} />
            </MCTooltip>
            <MCButton label="选项..." width={98} onClick={onOptions} />
          </div>
          <MCButton
            label={saving ? '正在保存世界...' : '保存并退出到标题画面'}
            onClick={onSaveQuit}
            disabled={saving}
            variant="danger"
          />
        </div>
      </motion.div>
    </div>
  );
}
