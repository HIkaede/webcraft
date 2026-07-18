/**
 * 声音设置（路由 `#/options/sound`，options.md §C「音乐和声音」）。
 * 内容实现见 components/options/OptionsScreens.tsx；「完成」返回选项主屏（携带 ?from）。
 */
import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { OptionsSoundScreen } from '@/components/options/OptionsScreens';

export default function OptionsSoundPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') ?? 'title';
  const onDone = useCallback(
    () => navigate(`/options?from=${encodeURIComponent(from)}`),
    [navigate, from]
  );

  return <OptionsSoundScreen bg="dirt" onDone={onDone} />;
}
