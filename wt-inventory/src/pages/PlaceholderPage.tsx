/**
 * 路由占位屏 —— 脚手架阶段为尚未实现的路由提供居中占位（泥土背景 + 标题 + 返回按钮）。
 * 各屏幕代理实现对应页面后，直接在 App.tsx 中替换 element 即可。
 */
import { useNavigate } from 'react-router';
import { MCButton, MCScreen } from '@/components/mc';

export interface PlaceholderPageProps {
  /** 屏幕标题（y=15u 居中） */
  title: string;
  /** 附加说明（灰字） */
  note?: string;
}

export default function PlaceholderPage({ title, note }: PlaceholderPageProps) {
  const navigate = useNavigate();
  return (
    <MCScreen bg="dirt" title={title}>
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center"
        style={{ gap: 'calc(8 * var(--u))' }}
      >
        <div className="mc-text" style={{ fontSize: 'calc(8 * var(--u))' }}>
          {title}
        </div>
        <div className="mc-text-gray" style={{ fontSize: 'calc(8 * var(--u))' }}>
          {note ?? '该屏幕正在接入，敬请期待'}
        </div>
        <MCButton label="返回标题画面" width={200} onClick={() => navigate('/')} />
      </div>
    </MCScreen>
  );
}
