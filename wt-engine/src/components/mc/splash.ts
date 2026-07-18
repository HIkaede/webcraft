/**
 * 闪烁标语（Splash）与 Minceraft 彩蛋的共享常量/工具（home.md §闪烁标语池）。
 * 独立成模块以满足 react-refresh 规则（组件文件只导出组件）。
 */

/** 闪烁标语池（每次进入标题画面随机取一，节日覆盖） */
export const SPLASH_POOL: readonly string[] = [
  '试试泰拉瑞亚！',
  'Punch trees, get wood!',
  '100% 纯网页！',
  'Three.js 驱动！',
  '体素万岁！',
  '无限世界！',
  '生于浏览器！',
  '小心苦力怕！',
  '挖三填一！',
  'Herobrine 已被移除！',
  '不含微交易！',
  '像素级复刻！',
  '钻石在深处！',
  '右键放置！',
  'WASD！',
  '昼夜交替！',
  '程序生成！',
  '也是开源的！',
  '可以吃苹果！',
  'Hello, 世界！',
  '单文件全景！',
  '别碰基岩！'
];

/** 节日覆盖（home.md：1/1、12/24、10/31 覆盖随机池） */
export function holidaySplash(): string | null {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  if (m === 1 && d === 1) return '新年快乐！';
  if (m === 12 && d === 24) return 'Merry X-mas!';
  if (m === 10 && d === 31) return 'OOoooOOOoooo! Spooky!';
  return null;
}

const MINCERAFT_KEY = 'mc.web.minceraft';

/** 本次会话是否使用 Minceraft 彩蛋 Logo（1/10000，sessionStorage 记忆） */
export function isMinceraftSession(): boolean {
  try {
    const v = sessionStorage.getItem(MINCERAFT_KEY);
    if (v !== null) return v === '1';
    const roll = Math.random() < 1 / 10000;
    sessionStorage.setItem(MINCERAFT_KEY, roll ? '1' : '0');
    return roll;
  } catch {
    return false;
  }
}

/** 随机取一条标语（节日优先；except 用于点击 Logo 换一条时避免重复） */
export function pickSplash(except?: string): string {
  const holiday = holidaySplash();
  if (holiday) return holiday;
  let next = SPLASH_POOL[Math.floor(Math.random() * SPLASH_POOL.length)];
  if (except && SPLASH_POOL.length > 1) {
    while (next === except) next = SPLASH_POOL[Math.floor(Math.random() * SPLASH_POOL.length)];
  }
  return next;
}
