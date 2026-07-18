/**
 * 按键控制（路由 `#/options/controls`，options.md §E）。
 * 内容实现见 components/options/OptionsScreens.tsx；「完成」返回选项主屏（携带 ?from）。
 */
import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { OptionsControlsScreen } from '@/components/options/OptionsScreens';

export default function OptionsControlsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') ?? 'title';
  const onDone = useCallback(
    () => navigate(`/options?from=${encodeURIComponent(from)}`),
    [navigate, from]
  );

  return <OptionsControlsScreen bg="dirt" onDone={onDone} />;
}
