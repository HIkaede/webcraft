/**
 * 准星（game.md §6）：+ 形，臂长 4u、宽 1u，白色，
 * mix-blend-mode: difference（原版反色效果）。
 */
export function Crosshair() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ mixBlendMode: 'difference' }}
    >
      <div
        className="relative"
        style={{ width: 'calc(var(--u) * 9)', height: 'calc(var(--u) * 9)' }}
      >
        <div
          className="absolute bg-white"
          style={{
            width: 'var(--u)',
            height: 'calc(var(--u) * 9)',
            left: 'calc(var(--u) * 4)',
            top: 0
          }}
        />
        <div
          className="absolute bg-white"
          style={{
            width: 'calc(var(--u) * 9)',
            height: 'var(--u)',
            left: 0,
            top: 'calc(var(--u) * 4)'
          }}
        />
      </div>
    </div>
  );
}
