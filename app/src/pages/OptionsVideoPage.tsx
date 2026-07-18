/**
 * 视频设置（路由 `#/options/video`，options.md §B）。
 * 内容实现见 components/options/OptionsScreens.tsx；「完成」返回选项主屏（携带 ?from）。
 */
import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { OptionsVideoScreen } from '@/components/options/OptionsScreens';

export default function OptionsVideoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') ?? 'title';
  const onDone = useCallback(
    () => navigate(`/options?from=${encodeURIComponent(from)}`),
    [navigate, from]
  );

  return <OptionsVideoScreen bg="dirt" onDone={onDone} />;
}
