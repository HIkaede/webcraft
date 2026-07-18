import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// 注意：不使用 <React.StrictMode>（会导致 three.js canvas 效果执行两次）。
// 路由为 HashRouter（静态托管友好），在 App.tsx 内部声明。
createRoot(document.getElementById('root')!).render(<App />);
