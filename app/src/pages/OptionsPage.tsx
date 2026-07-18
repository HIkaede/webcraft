/**
 * 选项主屏（路由 `#/options?from=title|pause`，options.md §A）。
 *
 * 泥土背景全屏；控件实现见 components/options/OptionsScreens.tsx（与游戏内覆盖层共享）。
 * 子屏跳转携带 ?from 以便逐级返回来源；「完成」：from=title → `#/`；
 * from=pause 正常由游戏内覆盖层处理（非路由），此处兜底回退历史。
 */
import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { OptionsMainScreen } from '@/components/options/OptionsScreens';
import type { OptionsSubScreen } from '@/components/options/OptionsScreens';

export default function OptionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') ?? 'title';
  const suffix = `?from=${encodeURIComponent(from)}`;

  const onNavigate = useCallback(
    (screen: OptionsSubScreen) => navigate(`/options/${screen}${suffix}`),
    [navigate, suffix]
  );
  const onDone = useCallback(() => {
    if (from === 'pause') navigate(-1);
    else navigate('/');
  }, [from, navigate]);

  return <OptionsMainScreen bg="dirt" inGame={false} onNavigate={onNavigate} onDone={onDone} />;
}
