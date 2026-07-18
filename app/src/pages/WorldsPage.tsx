/**
 * 选择世界（worlds.md，路由 `#/worlds`）——对标 Java 版"单人游戏 → 选择世界"。
 *
 * 布局（逻辑 u）：标题 `选择世界` y=15u 居中；列表区宽 min(460u, w−24u)、y 32u → h−88u；
 * 底部三行按钮 y = h−76u（进入选中的世界 150u + 创建新的世界 150u）、
 * y = h−52u（编辑/删除/重新创建 各 98u）、y = h−28u（取消 200u）。
 *
 * 交互：单击选中 / 再单击或双击进入（→ `#/game/:id`）；删除弹 MCDialog
 * （`'{名称}' 将永远消失！（真的很久！）`）；编辑/重新创建禁用 + MCTooltip；
 * ↑/↓ 选中、Enter 进入、Delete 删除、Esc 返回标题。空列表显示引导文案与一次性提示气泡。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { MCButton, MCDialog, MCScrollbar, MCScreen, MCTooltip } from '@/components/mc';
import { WorldListItem } from '@/components/menu';
import { useWorldsStore } from '@/stores/worlds';
import { useSettingsStore } from '@/stores/settings';

/** 空列表提示气泡：会话内仅出现一次（worlds.md §数据） */
let emptyHintShown = false;

export default function WorldsPage() {
  const navigate = useNavigate();
  const worlds = useWorldsStore((s) => s.worlds);
  const loaded = useWorldsStore((s) => s.loaded);
  const deleteWorld = useWorldsStore((s) => s.deleteWorld);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const navTimer = useRef<number | null>(null);

  // 挂载时重新读取 localStorage（App 已首读，这里幂等兜底）
  useEffect(() => {
    useWorldsStore.getState().refresh();
  }, []);

  useEffect(
    () => () => {
      if (navTimer.current !== null) window.clearTimeout(navTimer.current);
    },
    []
  );

  // 空列表首次进入：右上角提示气泡（150ms 淡入，3s 后淡出）
  useEffect(() => {
    if (!loaded || worlds.length > 0 || emptyHintShown) return;
    emptyHintShown = true;
    let hideT: number | undefined;
    // 推迟到下一拍，避免在 effect 体内同步 setState（React 19 级联渲染告警）
    const showT = window.setTimeout(() => {
      setHintVisible(true);
      hideT = window.setTimeout(() => setHintVisible(false), 3000);
    }, 0);
    return () => {
      window.clearTimeout(showT);
      if (hideT !== undefined) window.clearTimeout(hideT);
    };
  }, [loaded, worlds.length]);

  /** 内容层淡出 120ms 后切换路由（worlds.md：进入时淡出 120ms） */
  const leave = useCallback(
    (to: string) => {
      setLeaving(true);
      navTimer.current = window.setTimeout(() => navigate(to), reducedMotion ? 0 : 120);
    },
    [navigate, reducedMotion]
  );

  const enterWorld = useCallback(
    (id: string) => {
      useWorldsStore.getState().touchLastPlayed(id);
      leave(`/game/${id}`);
    },
    [leave]
  );

  const deletingWorld = deletingId != null ? worlds.find((w) => w.id === deletingId) : undefined;

  const confirmDelete = useCallback(() => {
    if (deletingId == null) return;
    deleteWorld(deletingId);
    setSelectedId((cur) => (cur === deletingId ? null : cur));
    setDeletingId(null);
  }, [deleteWorld, deletingId]);

  // 键盘：↑/↓ 移动选中；Enter 进入；Delete 删除（弹确认）；Esc 返回标题（worlds.md §交互）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (deletingId != null) return; // 弹窗打开时由 MCDialog 处理 Esc
      if (e.key === 'Escape') {
        leave('/');
        return;
      }
      if (worlds.length === 0) return;
      const idx = worlds.findIndex((w) => w.id === selectedId);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const next =
          idx < 0 ? (dir > 0 ? 0 : worlds.length - 1) : (idx + dir + worlds.length) % worlds.length;
        setSelectedId(worlds[next].id);
      } else if (e.key === 'Enter' && selectedId != null) {
        enterWorld(selectedId);
      } else if (e.key === 'Delete' && selectedId != null) {
        setDeletingId(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [worlds, selectedId, deletingId, enterWorld, leave]);

  const btnRowEntrance = {
    initial: reducedMotion ? (false as const) : { y: 16, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { delay: reducedMotion ? 0 : 0.12, duration: 0.25 }
  };

  return (
    <MCScreen bg="dirt">
      {/* 内容层（离开时 120ms 淡出） */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: 0.12 }}
      >
        {/* 标题：y=15u 居中，y -12→0 + 淡入 200ms easeOut */}
        <div
          className="pointer-events-none absolute left-0 right-0 flex justify-center"
          style={{ top: 'calc(15 * var(--u))' }}
        >
          <motion.div
            className="mc-text text-center"
            style={{ fontSize: 'calc(8 * var(--u))' }}
            initial={reducedMotion ? false : { y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            选择世界
          </motion.div>
        </div>

        {/* 列表区：宽 min(460u, w−24u)，y 32u → h−88u，淡入 250ms delay 60ms */}
        <div
          className="absolute left-0 right-0 flex justify-center"
          style={{ top: 'calc(32 * var(--u))', bottom: 'calc(88 * var(--u))' }}
        >
          <motion.div
            style={{
              width: 'min(calc(460 * var(--u)), calc(100% - 24 * var(--u)))',
              height: '100%'
            }}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reducedMotion ? 0 : 0.06, duration: 0.25 }}
          >
            <MCScrollbar
              height="100%"
              contentClassName="pb-[calc(4*var(--u))] pr-[calc(8*var(--u))] pt-[calc(4*var(--u))]"
            >
              <div
                className="min-h-full"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setSelectedId(null);
                }}
              >
                <AnimatePresence>
                  {worlds.map((w, i) => (
                    <WorldListItem
                      key={w.id}
                      world={w}
                      index={i}
                      selected={w.id === selectedId}
                      onSelect={setSelectedId}
                      onEnter={enterWorld}
                    />
                  ))}
                </AnimatePresence>
              </div>
              {/* 空列表态（worlds.md §布局） */}
              {loaded && worlds.length === 0 && (
                <div
                  className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                  style={{ gap: 'calc(4 * var(--u))' }}
                >
                  <div
                    className="mc-text-grayline text-center"
                    style={{ fontSize: 'calc(8 * var(--u))' }}
                  >
                    没有找到任何世界
                  </div>
                  <div
                    className="mc-text-gray text-center"
                    style={{ fontSize: 'calc(8 * var(--u))' }}
                  >
                    点击"创建新的世界"开始游戏
                  </div>
                </div>
              )}
            </MCScrollbar>
          </motion.div>
        </div>

        {/* 底部三行按钮（y = h−76u / h−52u / h−28u），y 16→0 + 淡入 250ms delay 120ms */}
        <div
          className="absolute left-0 right-0 flex justify-center"
          style={{ bottom: 'calc(76 * var(--u))' }}
        >
          <motion.div className="flex" style={{ gap: 'calc(4 * var(--u))' }} {...btnRowEntrance}>
            <MCButton
              label="进入选中的世界"
              width={150}
              disabled={selectedId == null}
              onClick={() => selectedId != null && enterWorld(selectedId)}
            />
            <MCButton label="创建新的世界" width={150} onClick={() => leave('/create')} />
          </motion.div>
        </div>
        <div
          className="absolute left-0 right-0 flex justify-center"
          style={{ bottom: 'calc(52 * var(--u))' }}
        >
          <motion.div className="flex" style={{ gap: 'calc(4 * var(--u))' }} {...btnRowEntrance}>
            <MCTooltip content="网页版暂未开放此功能">
              <MCButton label="编辑" width={98} disabled />
            </MCTooltip>
            <MCButton
              label="删除"
              width={98}
              disabled={selectedId == null}
              onClick={() => setDeletingId(selectedId)}
            />
            <MCTooltip content="网页版暂未开放此功能">
              <MCButton label="重新创建" width={98} disabled />
            </MCTooltip>
          </motion.div>
        </div>
        <div
          className="absolute left-0 right-0 flex justify-center"
          style={{ bottom: 'calc(28 * var(--u))' }}
        >
          <motion.div {...btnRowEntrance}>
            <MCButton label="取消" width={200} onClick={() => leave('/')} />
          </motion.div>
        </div>

        {/* 空列表一次性提示气泡（右上角） */}
        <AnimatePresence>
          {hintVisible && (
            <motion.div
              className="mc-tooltip absolute"
              style={{ top: 'calc(8 * var(--u))', right: 'calc(8 * var(--u))' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              还没有世界，点"创建新的世界"！
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 删除确认弹窗（worlds.md §删除确认弹窗，文案一字不差） */}
      <MCDialog
        open={deletingId != null}
        lines={[
          '你确定要删除这个世界吗？',
          <span
            key="warn"
            className="mc-text-gray"
          >{`'${deletingWorld?.name ?? ''}' 将永远消失！（真的很久！）`}</span>
        ]}
        buttons={[
          { label: '删除', variant: 'danger', width: 98, onClick: confirmDelete },
          { label: '取消', width: 98, onClick: () => setDeletingId(null) }
        ]}
        onClose={() => setDeletingId(null)}
      />
    </MCScreen>
  );
}
