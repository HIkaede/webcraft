/**
 * 多人游戏（multiplayer.md，路由 `#/multiplayer`）——对标 Java 版服务器列表。
 *
 * A. 列表主屏：标题 y=15u；列表区 y 32u → h−96u；扫描行 y=h−92u（省略号 500ms/帧，
 *    出现 3s 后淡出，刷新时重新出现）；按钮行 y = h−76u（加入服务器/直接连接/添加服务器
 *    各 98u）、y = h−52u（编辑[禁用]/删除/刷新）、y = h−28u（取消 200u）。
 *    首次进入写入两个演示服务器（localStorage `mc.web.servers`）。
 * B. 添加服务器弹窗（MCDialog 260u，标题 编辑服务器信息，名称默认 `Minecraft 服务器`）。
 *    直接连接弹窗：仅地址框 + 加入服务器/取消。
 * C. 连接中屏：正在连接服务器... / 正在登录中...（delay 400ms 淡入）+ 取消（中止计时器）。
 * D. 连接失败屏：红字 `连接失败`（scale 1.3→1）+ io.netty... 两行灰字 + 返回服务器列表。
 * E. Realms 提示屏（`?realms=1`）：蛋糕图标（hover 旋转 360°/600ms）+ 说明 + 返回。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { MCButton, MCDialog, MCScrollbar, MCScreen, MCTextInput, MCTooltip } from '@/components/mc';
import {
  CakeIcon,
  ScanningLine,
  ServerListItem,
  defaultServers,
  readServers,
  writeServers
} from '@/components/menu';
import type { ServerEntry } from '@/components/menu';
import { genWorldId } from '@/stores/worlds';
import { useSettingsStore } from '@/stores/settings';

type View = 'list' | 'connecting' | 'failed';
type Dlg = null | 'add' | 'direct';

export default function MultiplayerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const realms = searchParams.get('realms') === '1';
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);

  const [servers, setServers] = useState<ServerEntry[]>(readServers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [dlg, setDlg] = useState<Dlg>(null);
  const [leaving, setLeaving] = useState(false);
  const [pingKey, setPingKey] = useState(0);
  const [scanning, setScanning] = useState(true);
  const [addName, setAddName] = useState('Minecraft 服务器');
  const [addAddr, setAddAddr] = useState('');
  const [directAddr, setDirectAddr] = useState('');

  const connectTimer = useRef<number | null>(null);
  const navTimer = useRef<number | null>(null);

  const clearConnect = useCallback(() => {
    if (connectTimer.current !== null) {
      window.clearTimeout(connectTimer.current);
      connectTimer.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearConnect();
      if (navTimer.current !== null) window.clearTimeout(navTimer.current);
    },
    [clearConnect]
  );

  // 扫描行：出现 3s 后淡出（刷新时重新出现 3s，multiplayer.md §交互）
  useEffect(() => {
    if (!scanning) return;
    const t = window.setTimeout(() => setScanning(false), 3000);
    return () => window.clearTimeout(t);
  }, [scanning]);

  const persist = useCallback((list: ServerEntry[]) => {
    setServers(list);
    writeServers(list);
  }, []);

  const leave = useCallback(
    (to: string) => {
      setLeaving(true);
      navTimer.current = window.setTimeout(() => navigate(to), reducedMotion ? 0 : 120);
    },
    [navigate, reducedMotion]
  );

  const selected = useMemo(
    () => servers.find((s) => s.id === selectedId) ?? null,
    [servers, selectedId]
  );

  /** 加入服务器 / 双击：本地演示世界 → #/worlds；其他 → 连接中 1.5–2.5s → 连接失败 */
  const joinServer = useCallback(
    (s: ServerEntry) => {
      if (s.kind === 'local') {
        leave('/worlds');
        return;
      }
      clearConnect();
      setView('connecting');
      connectTimer.current = window.setTimeout(
        () => setView('failed'),
        1500 + Math.random() * 1000
      );
    },
    [clearConnect, leave]
  );

  /** 直接连接：仅按地址模拟连接（不写入列表） */
  const joinAddress = useCallback(
    (addr: string) => {
      if (!addr.trim()) return;
      setDlg(null);
      clearConnect();
      setView('connecting');
      connectTimer.current = window.setTimeout(
        () => setView('failed'),
        1500 + Math.random() * 1000
      );
    },
    [clearConnect]
  );

  const cancelConnect = useCallback(() => {
    clearConnect();
    setView('list');
  }, [clearConnect]);

  const deleteServer = useCallback(
    (id: string) => {
      persist(servers.filter((s) => s.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [persist, servers]
  );

  /** 刷新：演示条目重置（保留自定义），ping 动画重放，扫描行重新出现 3s */
  const refresh = useCallback(() => {
    persist([...defaultServers(), ...servers.filter((s) => s.kind === 'custom')]);
    setPingKey((k) => k + 1);
    setScanning(true);
  }, [persist, servers]);

  const addServer = useCallback(() => {
    const address = addAddr.trim();
    if (!address) return;
    const entry: ServerEntry = {
      id: genWorldId(),
      name: addName.trim() || 'Minecraft 服务器',
      address,
      kind: 'custom'
    };
    persist([...servers, entry]);
    setSelectedId(entry.id);
    setDlg(null);
    setAddAddr('');
    setAddName('Minecraft 服务器');
  }, [addAddr, addName, persist, servers]);

  // 键盘：Esc 逐层返回；列表内 ↑/↓ 选中、Enter 加入、Delete 删除
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dlg != null) return; // 弹窗由 MCDialog 处理 Esc
        if (view === 'connecting') {
          cancelConnect();
          return;
        }
        if (view === 'failed') {
          setView('list');
          return;
        }
        leave('/');
        return;
      }
      if (view !== 'list' || dlg != null) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (servers.length === 0) return;
        const idx = servers.findIndex((s) => s.id === selectedId);
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const next =
          idx < 0
            ? dir > 0
              ? 0
              : servers.length - 1
            : (idx + dir + servers.length) % servers.length;
        setSelectedId(servers[next].id);
      } else if (e.key === 'Enter' && selected != null) {
        joinServer(selected);
      } else if (e.key === 'Delete' && selectedId != null) {
        deleteServer(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dlg, view, servers, selectedId, selected, cancelConnect, deleteServer, joinServer, leave]);

  /* ================= E. Realms 提示屏（?realms=1） ================= */
  if (realms) {
    return (
      <MCScreen bg="dirt">
        <motion.div
          className="flex min-h-[100dvh] flex-col items-center justify-center"
          style={{ gap: 'calc(6 * var(--u))' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div whileHover={{ rotate: 360 }} transition={{ duration: 0.6 }}>
            <CakeIcon />
          </motion.div>
          <div className="mc-text text-center" style={{ fontSize: 'calc(8 * var(--u))' }}>
            Minecraft Realms
          </div>
          <div className="mc-text-gray text-center" style={{ fontSize: 'calc(8 * var(--u))' }}>
            Realms 需要 Mojang 官方账号与订阅
          </div>
          <div className="mc-text-gray text-center" style={{ fontSize: 'calc(8 * var(--u))' }}>
            网页版复刻暂不支持，感谢理解！
          </div>
          <MCButton label="返回" width={200} onClick={() => navigate('/')} />
        </motion.div>
      </MCScreen>
    );
  }

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
        {view === 'list' && (
          <>
            {/* 标题 */}
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
                多人游戏
              </motion.div>
            </div>

            {/* 列表区：宽 min(460u, w−24u)，y 32u → h−96u */}
            <div
              className="absolute left-0 right-0 flex justify-center"
              style={{ top: 'calc(32 * var(--u))', bottom: 'calc(96 * var(--u))' }}
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
                      {servers.map((s, i) => (
                        <ServerListItem
                          key={s.id}
                          server={s}
                          index={i}
                          pingKey={pingKey}
                          selected={s.id === selectedId}
                          tooltip={
                            s.kind === 'local' ? '多人游戏尚未开放，先去单人游戏吧！' : undefined
                          }
                          onSelect={setSelectedId}
                          onJoin={joinServer}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </MCScrollbar>
              </motion.div>
            </div>

            {/* 扫描行：y = h−92u */}
            <div
              className="pointer-events-none absolute left-0 right-0 flex justify-center"
              style={{ bottom: 'calc(92 * var(--u))' }}
            >
              <AnimatePresence>
                {scanning && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ScanningLine />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 按钮行1（y = h−76u，总宽 302u 居中） */}
            <div
              className="absolute left-0 right-0 flex justify-center"
              style={{ bottom: 'calc(76 * var(--u))' }}
            >
              <motion.div
                className="flex"
                style={{ gap: 'calc(4 * var(--u))' }}
                {...btnRowEntrance}
              >
                <MCButton
                  label="加入服务器"
                  width={98}
                  disabled={selected == null}
                  onClick={() => selected != null && joinServer(selected)}
                />
                <MCButton label="直接连接" width={98} onClick={() => setDlg('direct')} />
                <MCButton label="添加服务器" width={98} onClick={() => setDlg('add')} />
              </motion.div>
            </div>
            {/* 按钮行2（y = h−52u） */}
            <div
              className="absolute left-0 right-0 flex justify-center"
              style={{ bottom: 'calc(52 * var(--u))' }}
            >
              <motion.div
                className="flex"
                style={{ gap: 'calc(4 * var(--u))' }}
                {...btnRowEntrance}
              >
                <MCTooltip content="网页版暂未开放此功能">
                  <MCButton label="编辑" width={98} disabled />
                </MCTooltip>
                <MCButton
                  label="删除"
                  width={98}
                  disabled={selected == null}
                  onClick={() => selectedId != null && deleteServer(selectedId)}
                />
                <MCButton label="刷新" width={98} onClick={refresh} />
              </motion.div>
            </div>
            {/* 行3：取消（y = h−28u） */}
            <div
              className="absolute left-0 right-0 flex justify-center"
              style={{ bottom: 'calc(28 * var(--u))' }}
            >
              <motion.div {...btnRowEntrance}>
                <MCButton label="取消" width={200} onClick={() => leave('/')} />
              </motion.div>
            </div>
          </>
        )}

        {/* ================= C. 连接中屏 ================= */}
        {view === 'connecting' && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="absolute left-0 right-0 flex flex-col items-center"
              style={{ top: 'calc(50% - 16 * var(--u))', gap: 'calc(4 * var(--u))' }}
            >
              <div className="mc-text text-center" style={{ fontSize: 'calc(8 * var(--u))' }}>
                正在连接服务器...
              </div>
              <motion.div
                className="mc-text text-center"
                style={{ fontSize: 'calc(8 * var(--u))' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.15 }}
              >
                正在登录中...
              </motion.div>
            </div>
            <div
              className="absolute left-0 right-0 flex justify-center"
              style={{ top: 'calc(50% + 24 * var(--u))' }}
            >
              <MCButton label="取消" width={200} onClick={cancelConnect} />
            </div>
          </motion.div>
        )}

        {/* ================= D. 连接失败屏 ================= */}
        {view === 'failed' && (
          <div className="absolute inset-0">
            <div
              className="absolute left-0 right-0 flex justify-center"
              style={{ top: 'calc(50% - 40 * var(--u))' }}
            >
              <motion.div
                className="mc-text-red text-center"
                style={{ fontSize: 'calc(8 * var(--u))' }}
                initial={reducedMotion ? false : { scale: 1.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.25 }}
              >
                连接失败
              </motion.div>
            </div>
            <motion.div
              className="absolute left-0 right-0 flex flex-col items-center"
              style={{ top: 'calc(50% - 28 * var(--u))', gap: 'calc(3 * var(--u))' }}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reducedMotion ? 0 : 0.15, duration: 0.2 }}
            >
              <div
                className="mc-text-gray text-center"
                style={{ fontSize: 'calc(8 * var(--u))', maxWidth: 'calc(320 * var(--u))' }}
              >
                io.netty.channel.ConnectTimeoutException: connection timed out
              </div>
              <div
                className="mc-text-gray text-center"
                style={{ fontSize: 'calc(8 * var(--u))', maxWidth: 'calc(320 * var(--u))' }}
              >
                网页版无法连接真实服务器，这只是个演示 :)
              </div>
            </motion.div>
            <motion.div
              className="absolute left-0 right-0 flex justify-center"
              style={{ top: 'calc(50% + 8 * var(--u))' }}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reducedMotion ? 0 : 0.25, duration: 0.2 }}
            >
              <MCButton label="返回服务器列表" width={200} onClick={() => setView('list')} />
            </motion.div>
          </div>
        )}
      </motion.div>

      {/* ================= B. 添加服务器弹窗 ================= */}
      <MCDialog
        open={dlg === 'add'}
        title="编辑服务器信息"
        width={260}
        lines={[
          <div key="name" className="flex flex-col" style={{ gap: 'calc(2 * var(--u))' }}>
            <span className="mc-text-gray" style={{ fontSize: 'calc(8 * var(--u))' }}>
              服务器名称
            </span>
            <MCTextInput
              value={addName}
              onChange={setAddName}
              maxLength={32}
              width={200}
              aria-label="服务器名称"
            />
          </div>,
          <div key="addr" className="flex flex-col" style={{ gap: 'calc(2 * var(--u))' }}>
            <span className="mc-text-gray" style={{ fontSize: 'calc(8 * var(--u))' }}>
              服务器地址
            </span>
            <MCTextInput
              value={addAddr}
              onChange={setAddAddr}
              placeholder="例：mc.example.com"
              maxLength={128}
              width={200}
              autoFocus
              onEnter={addServer}
              aria-label="服务器地址"
            />
          </div>
        ]}
        buttons={[
          { label: '完成', width: 98, disabled: addAddr.trim() === '', onClick: addServer },
          { label: '取消', width: 98, onClick: () => setDlg(null) }
        ]}
        onClose={() => setDlg(null)}
      />

      {/* 直接连接弹窗（仅地址框 + 加入服务器/取消） */}
      <MCDialog
        open={dlg === 'direct'}
        title="直接连接"
        width={260}
        lines={[
          <div key="addr" className="flex flex-col" style={{ gap: 'calc(2 * var(--u))' }}>
            <span className="mc-text-gray" style={{ fontSize: 'calc(8 * var(--u))' }}>
              服务器地址
            </span>
            <MCTextInput
              value={directAddr}
              onChange={setDirectAddr}
              placeholder="例：mc.example.com"
              maxLength={128}
              width={200}
              autoFocus
              onEnter={() => joinAddress(directAddr)}
              aria-label="服务器地址"
            />
          </div>
        ]}
        buttons={[
          {
            label: '加入服务器',
            width: 98,
            disabled: directAddr.trim() === '',
            onClick: () => joinAddress(directAddr)
          },
          { label: '取消', width: 98, onClick: () => setDlg(null) }
        ]}
        onClose={() => setDlg(null)}
      />
    </MCScreen>
  );
}
