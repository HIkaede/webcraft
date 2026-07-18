/**
 * 局域网扫描行（multiplayer.md §A）：`正在扫描局域网中的世界` + 省略号 4 帧循环
 *（"" → "." → ".." → "..."，500ms/帧，瞬时切换）。memo 隔离定时重渲染（react-dev 动效护栏）。
 */
import { memo, useEffect, useState } from 'react';

function ScanningLine() {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="mc-text-gray" style={{ fontSize: 'calc(8 * var(--u))' }}>
      正在扫描局域网中的世界{'.'.repeat(dots)}
    </span>
  );
}

export default memo(ScanningLine);
