/**
 * 聊天与命令（game.md §8）：T 或 / 打开，输入框左下 320×12u，
 * 历史最近 10 条（回显灰/错误红/成功黄），5s 未开框淡出，↑/↓ 翻输入历史。
 * 命令：/gamemode /time /give /tp /kill /help（cheats 关闭时红字拒绝）。
 */
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/stores/game';
import { blockIdByKey, displayName } from '@/game/engine/blocks';
import { soundManager } from '@/game/sound/SoundManager';
import type { Engine } from '@/game/engine/Engine';

interface Msg {
  id: number;
  text: string;
  color: string;
  time: number;
}

let msgId = 0;

const GRAY = '#A0A0A0';
const RED = '#FF5555';
const YELLOW = '#FFFF55';

export function ChatLayer({ engine, cheats }: { engine: Engine | null; cheats: boolean }) {
  const overlay = useGameStore((s) => s.overlay);
  const open = overlay === 'chat';
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [, forceTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时聚焦 + 预填（'/' 打开时预填斜杠，由 GamePage 写入 draft 初始值）
  useEffect(() => {
    if (open) {
      const pre = sessionStorage.getItem('mc.chat.prefill') ?? '';
      setDraft(pre);
      sessionStorage.removeItem('mc.chat.prefill');
      setHistIdx(-1);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 5s 淡出：每秒强制刷新一次可见性
  useEffect(() => {
    if (open) return;
    const id = window.setInterval(() => forceTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [open]);

  const push = (text: string, color: string) => {
    setMessages((m) => [...m.slice(-9), { id: ++msgId, text, color, time: Date.now() }]);
  };

  const runCommand = (raw: string) => {
    if (!engine) return;
    const gs = useGameStore.getState();
    push(raw, GRAY);
    const parts = raw.slice(1).trim().split(/\s+/);
    const cmd = (parts[0] ?? '').toLowerCase();
    if (!cheats) {
      push('此世界未开启作弊', RED);
      return;
    }
    switch (cmd) {
      case 'gamemode': {
        const arg = (parts[1] ?? '').toLowerCase();
        const mode =
          arg === 'creative' || arg === '1' || arg === 'c'
            ? 'creative'
            : arg === 'survival' || arg === '0' || arg === 's'
              ? 'survival'
              : null;
        if (!mode) {
          push('用法: /gamemode <creative|survival>', RED);
          return;
        }
        gs.setMode(mode);
        engine.setMode(mode);
        push(`游戏模式已更新为${mode === 'creative' ? '创造' : '生存'}模式`, YELLOW);
        return;
      }
      case 'time': {
        if (parts[1] === 'set') {
          const arg = parts[2] ?? '';
          const t =
            arg === 'day'
              ? 1000
              : arg === 'night'
                ? 13000
                : /^\d+$/.test(arg)
                  ? Math.min(23999, Math.max(0, parseInt(arg, 10)))
                  : null;
          if (t === null) {
            push('用法: /time set <day|night|0-24000>', RED);
            return;
          }
          engine.setTime(t);
          push(`已将时间设为 ${t}`, YELLOW);
          return;
        }
        push('用法: /time set <day|night|0-24000>', RED);
        return;
      }
      case 'give': {
        const key = (parts[1] ?? '').toLowerCase();
        const id = blockIdByKey(key);
        if (id === null) {
          push(`未知的物品: ${key}`, RED);
          return;
        }
        const count = Math.min(64, Math.max(1, parseInt(parts[2] ?? '64', 10) || 64));
        // 优先当前槽，其次首个空槽
        const slot =
          gs.hotbar[gs.selectedSlot] === null
            ? gs.selectedSlot
            : gs.hotbar.findIndex((s) => s === null);
        const target = slot >= 0 ? slot : gs.selectedSlot;
        gs.setHotbarSlot(target, { id, count });
        soundManager.play('random.pop');
        push(`已给予 ${displayName(id)} ×${count}`, YELLOW);
        return;
      }
      case 'tp': {
        const [x, y, z] = [
          parseFloat(parts[1] ?? ''),
          parseFloat(parts[2] ?? ''),
          parseFloat(parts[3] ?? '')
        ];
        if ([x, y, z].some(Number.isNaN)) {
          push('用法: /tp <x> <y> <z>', RED);
          return;
        }
        if (y < 1 || y > 127) {
          push(`无效的 y 坐标: ${y}（需在 1 到 127 之间）`, RED);
          return;
        }
        const [yaw, pitch] = engine.getYawPitch();
        engine.spawnPlayer([x, y, z], yaw, pitch);
        push(`已传送至 ${x}, ${y}, ${z}`, YELLOW);
        return;
      }
      case 'kill': {
        useGameStore.getState().damage(999);
        push('你死了', RED);
        return;
      }
      case 'clear': {
        gs.setHotbar(Array.from({ length: 9 }, () => null));
        push('已清空快捷栏', YELLOW);
        return;
      }
      case 'help': {
        push('/gamemode <creative|survival> — 切换游戏模式', GRAY);
        push('/time set <day|night|0-24000> — 设置时间', GRAY);
        push('/give <方块id> [数量] — 获取方块', GRAY);
        push('/tp <x> <y> <z> — 传送', GRAY);
        push('/clear — 清空快捷栏', GRAY);
        push('/kill — 自杀', GRAY);
        return;
      }
      default:
        push('未知的命令。输入 /help 获取帮助', RED);
    }
  };

  const submit = () => {
    const text = draft.trim();
    if (text) {
      setHistory((h) => [text, ...h.slice(0, 19)]);
      if (text.startsWith('/')) runCommand(text);
      else push(`<玩家> ${text}`, '#FFFFFF');
    }
    setDraft('');
    useGameStore.getState().setOverlay('none');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') {
      setDraft('');
      useGameStore.getState().setOverlay('none');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      if (history[next]) {
        setHistIdx(next);
        setDraft(history[next]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = histIdx - 1;
      setHistIdx(next);
      setDraft(next >= 0 ? history[next] : '');
    }
  };

  const now = Date.now();
  const visibleMsgs = open ? messages : messages.filter((m) => now - m.time < 5000);
  if (!open && visibleMsgs.length === 0) return null;

  return (
    <div
      className="absolute left-0 bottom-0 z-40 pointer-events-none"
      style={{ width: 'calc(var(--u) * 330)', padding: 'calc(var(--u) * 2)' }}
    >
      {/* 历史 */}
      <div
        className="flex flex-col justify-end"
        style={{ minHeight: 'calc(var(--u) * 12)', marginBottom: 'calc(var(--u) * 1)' }}
      >
        {visibleMsgs.map((m) => (
          <div
            key={m.id}
            className="font-pixel"
            style={{
              fontSize: 'calc(var(--u) * 7)',
              lineHeight: 'calc(var(--u) * 9)',
              color: m.color,
              textShadow: 'calc(var(--u) * 0.5) calc(var(--u) * 0.5) 0 rgba(0,0,0,0.8)',
              background: open ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.25)',
              padding: '0 calc(var(--u) * 1)',
              opacity: open ? 1 : Math.max(0, 1 - (now - m.time - 4000) / 1000)
            }}
          >
            {m.text}
          </div>
        ))}
      </div>
      {/* 输入框 */}
      {open && (
        <div
          className="pointer-events-auto flex items-center"
          style={{
            width: 'calc(var(--u) * 320)',
            height: 'calc(var(--u) * 12)',
            background: 'rgba(0,0,0,0.5)'
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={100}
            className="w-full h-full bg-transparent outline-none font-pixel text-white"
            style={{
              fontSize: 'calc(var(--u) * 7)',
              padding: '0 calc(var(--u) * 1)',
              caretColor: '#fff'
            }}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      )}
    </div>
  );
}
