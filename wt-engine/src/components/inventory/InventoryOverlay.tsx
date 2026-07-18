// STUB — replaced by parallel agent (branch `inventory` 的真实实现会覆盖本文件)
import { MCButton } from '@/components/mc';

export default function InventoryOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div
        className="mc-panel flex flex-col items-center"
        style={{ padding: 'calc(var(--u) * 8)', gap: 'calc(var(--u) * 6)' }}
      >
        <div className="font-pixel" style={{ fontSize: 'calc(var(--u) * 8)' }}>
          物品栏（建设中）
        </div>
        <MCButton label="关闭" onClick={onClose} />
      </div>
    </div>
  );
}
