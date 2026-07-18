/**
 * 应用根组件：HashRouter（design.md §10，静态托管友好）+ 路由表。
 *
 * 注意：react-dev.md 默认建议 BrowserRouter，但本项目设计文档明确要求
 * Hash 路由（纯静态托管、任意子路径可部署），请勿改回 BrowserRouter。
 *
 * 路由表（design.md §10）：
 * | 路由                     | 屏幕                                |
 * |--------------------------|-------------------------------------|
 * | `#/`                     | 标题画面（pages/HomePage）           |
 * | `#/worlds`               | 单人游戏·选择世界                    |
 * | `#/create`               | 创建新的世界                         |
 * | `#/multiplayer`          | 多人游戏（含 `?realms=1` Realms 屏） |
 * | `#/options`              | 选项（`?from=title|pause`）          |
 * | `#/options/video|sound|controls|mouse` | 选项子屏                |
 * | `#/game/:worldId`        | 游戏（pages/GamePage，`?fresh=1` 新建）|
 *
 * 游戏内覆盖层（暂停/物品栏/聊天/死亡/F3）不是路由，由 stores/game.ts 的 overlay 驱动。
 */
import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import HomePage from '@/pages/HomePage';
import GamePage from '@/pages/GamePage';
import WorldsPage from '@/pages/WorldsPage';
import CreateWorldPage from '@/pages/CreateWorldPage';
import MultiplayerPage from '@/pages/MultiplayerPage';
import OptionsPage from '@/pages/OptionsPage';
import OptionsVideoPage from '@/pages/OptionsVideoPage';
import OptionsSoundPage from '@/pages/OptionsSoundPage';
import OptionsControlsPage from '@/pages/OptionsControlsPage';
import OptionsMousePage from '@/pages/OptionsMousePage';
import PlaceholderPage from '@/pages/PlaceholderPage';
import { initSettingsSideEffects } from '@/stores/settings';
import { useWorldsStore } from '@/stores/worlds';
import { soundManager } from '@/game/sound/SoundManager';

export default function App() {
  // 设置副作用：--u（GUI 缩放）与音量接线（一次）
  useEffect(() => initSettingsSideEffects(), []);
  // 世界列表首读
  useEffect(() => {
    useWorldsStore.getState().refresh();
  }, []);
  // 首次用户手势解锁 WebAudio（design.md §8）
  useEffect(() => {
    const unlock = () => soundManager.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/worlds" element={<WorldsPage />} />
        <Route path="/create" element={<CreateWorldPage />} />
        <Route path="/multiplayer" element={<MultiplayerPage />} />
        <Route path="/options" element={<OptionsPage />} />
        <Route path="/options/video" element={<OptionsVideoPage />} />
        <Route path="/options/sound" element={<OptionsSoundPage />} />
        <Route path="/options/controls" element={<OptionsControlsPage />} />
        <Route path="/options/mouse" element={<OptionsMousePage />} />
        <Route path="/game/:worldId" element={<GamePage />} />
        <Route path="*" element={<PlaceholderPage title="页面不存在" note="未知的哈希路由" />} />
      </Routes>
    </HashRouter>
  );
}
