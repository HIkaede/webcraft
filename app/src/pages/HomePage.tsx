/**
 * 标题画面（home.md，路由 `#/`）——对标 Minecraft Java 版 1.20 主菜单。
 *
 * 布局（逻辑 u）：Logo 顶距 30u、宽 274u 居中；按钮列 y = h/4 + 48u、节距 24u；
 * 第四行 [选项...](98u) + [退出游戏](98u)；语言图标按钮 20×20u @ x=w/2−124u；
 * 底行 y = h−10u 左 `Minecraft Web 1.0.0（复刻）` / 右版权行（悬停下划线）。
 *
 * 入场时间轴（home.md §动效）：全景 0ms 800ms 淡入 → Logo 150ms 弹簧 →
 * 按钮列 350ms stagger 60ms → Splash 500ms（MCLogo 内部处理）→ 底行 600ms。
 * 离开：内容层 opacity 1→0 120ms 后切换路由。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { MCButton, MCDialog, MCLogo, Panorama } from '@/components/mc';
import { useSettingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

/** 语言按钮的像素地球（程序绘制 canvas 16×16：蓝色球 + 绿块大陆，home.md §元素与文案） */
function GlobeIcon() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    // 球体
    ctx.fillStyle = '#2B5FD9';
    ctx.beginPath();
    ctx.arc(8, 8, 7, 0, Math.PI * 2);
    ctx.fill();
    // 大陆（手绘像素块）
    ctx.fillStyle = '#5E9C34';
    const land: [number, number, number, number][] = [
      [3, 4, 4, 2],
      [4, 6, 3, 2],
      [10, 5, 3, 3],
      [11, 8, 2, 2],
      [5, 10, 4, 2],
      [9, 11, 2, 2]
    ];
    for (const [x, y, w, h] of land) ctx.fillRect(x, y, w, h);
    // 右下暗边（球体感）
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(9.5, 9.5, 6.5, -Math.PI / 3, Math.PI / 1.6);
    ctx.arc(8, 8, 7, Math.PI / 1.6, -Math.PI / 3, true);
    ctx.fill();
  }, []);
  return (
    <canvas
      ref={ref}
      width={16}
      height={16}
      className="pixelated"
      style={{ width: 'calc(14 * var(--u))', height: 'calc(14 * var(--u))' }}
    />
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const [webglFailed, setWebglFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [dialog, setDialog] = useState<null | 'quit' | 'lang'>(null);
  const [copyrightHover, setCopyrightHover] = useState(false);

  /** 内容层淡出 120ms 后切换路由（home.md §离开） */
  const leave = useCallback(
    (to: string) => {
      setLeaving(true);
      window.setTimeout(() => navigate(to), reducedMotion ? 0 : 120);
    },
    [navigate, reducedMotion]
  );

  /** 退出游戏：尝试 window.close()，失败则弹原版梗提示（home.md §按钮 4/5） */
  const quit = useCallback(() => {
    window.close();
    window.setTimeout(() => setDialog('quit'), 200);
  }, []);

  const btnEntrance = (i: number) =>
    ({
      initial: { y: 24, opacity: 0 },
      animate: { y: 0, opacity: 1 },
      transition: { delay: 0.35 + i * 0.06, duration: 0.25, ease: 'easeOut' as const }
    }) as const;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* 背景：全景立方体（WebGL 失败降级为泥土背景 + 渐变罩） */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reducedMotion ? 0.12 : 0.8, ease: 'linear' }}
      >
        {webglFailed ? (
          <div className="mc-dirt-bg absolute inset-0">
            <div className="mc-title-vignette-top pointer-events-none absolute inset-0" />
            <div className="mc-title-vignette-bottom pointer-events-none absolute inset-0" />
          </div>
        ) : (
          <Panorama onFallback={() => setWebglFailed(true)} />
        )}
      </motion.div>

      {/* 内容层（离开时 120ms 淡出） */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: 0.12 }}
      >
        {/* Logo：顶距 30u，274u 宽居中，弹簧入场 */}
        <div
          className="absolute left-1/2"
          style={{ top: 'calc(30 * var(--u))', marginLeft: 'calc(-137 * var(--u))' }}
        >
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 }}
          >
            <MCLogo />
          </motion.div>
        </div>

        {/* 按钮列：y = h/4 + 48u，节距 24u */}
        <div
          className="absolute left-1/2 flex flex-col"
          style={{
            top: 'calc(25% + 48 * var(--u))',
            marginLeft: 'calc(-100 * var(--u))',
            width: 'calc(200 * var(--u))',
            gap: 'calc(4 * var(--u))'
          }}
        >
          <motion.div {...btnEntrance(0)}>
            <MCButton label="单人游戏" onClick={() => leave('/worlds')} />
          </motion.div>
          <motion.div {...btnEntrance(1)}>
            <MCButton label="多人游戏" onClick={() => leave('/multiplayer')} />
          </motion.div>
          <motion.div {...btnEntrance(2)}>
            <MCButton label="Minecraft Realms" onClick={() => leave('/multiplayer?realms=1')} />
          </motion.div>
          <motion.div {...btnEntrance(3)} className="flex" style={{ gap: 'calc(4 * var(--u))' }}>
            <MCButton label="选项..." width={98} onClick={() => leave('/options?from=title')} />
            <MCButton label="退出游戏" width={98} onClick={quit} />
          </motion.div>
        </div>

        {/* 语言图标按钮 20×20u：x = w/2 − 124u，与第四行同 y（= 25% + 120u） */}
        <motion.div
          {...btnEntrance(3)}
          className="absolute"
          style={{ left: 'calc(50% - 124 * var(--u))', top: 'calc(25% + 120 * var(--u))' }}
        >
          <MCButton
            width={20}
            label={<GlobeIcon />}
            aria-label="语言"
            onClick={() => setDialog('lang')}
          />
        </motion.div>

        {/* 底行（y = h−10u）：600ms 淡入 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          <div
            className="mc-text absolute"
            style={{
              left: 'calc(2 * var(--u))',
              bottom: 'calc(2 * var(--u))',
              fontSize: 'calc(8 * var(--u))'
            }}
          >
            Minecraft Web 1.0.0（复刻）
          </div>
          <div
            className="mc-text absolute text-right"
            style={{
              right: 'calc(2 * var(--u))',
              bottom: 'calc(2 * var(--u))',
              fontSize: 'calc(8 * var(--u))'
            }}
            onMouseEnter={() => setCopyrightHover(true)}
            onMouseLeave={() => setCopyrightHover(false)}
          >
            <span className={cn(copyrightHover && 'underline decoration-1 underline-offset-2')}>
              原作版权所有 Mojang AB · 本项目仅供学习
            </span>
          </div>
        </motion.div>
      </motion.div>

      {/* 退出游戏失败提示（原版会退出游戏） */}
      <MCDialog
        open={dialog === 'quit'}
        lines={[
          '网页版无法关闭标签页，请手动关闭 :)',
          <span key="l2" className="mc-text-gray">
            （原版会退出游戏）
          </span>
        ]}
        buttons={[{ label: '知道了', width: 98, onClick: () => setDialog(null) }]}
        onClose={() => setDialog(null)}
      />
      {/* 语言提示（网页版仅提供简体中文） */}
      <MCDialog
        open={dialog === 'lang'}
        title="语言"
        lines={[
          '简体中文',
          <span key="l2" className="mc-text-gray">
            （网页版仅提供简体中文）
          </span>
        ]}
        buttons={[{ label: '完成', width: 98, onClick: () => setDialog(null) }]}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
