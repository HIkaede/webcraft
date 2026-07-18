/**
 * 输入系统（game.md §10 键位 + options.md 键位映射）。
 *
 * - Pointer Lock 鼠标视角（灵敏度 0–200%、反转Y轴）
 * - 键位从 SettingsStore 读取（支持改键）
 * - 双击 W 疾跑、双击空格飞行切换（创造）
 * - 滚轮切换快捷栏（wheelSensitivity）
 * - 数字键 1–9 选槽、E 物品栏、T// 聊天、F3 调试、Q 丢弃（P2）
 *
 * 本模块不直接操作 store 的 overlay（Esc/聊天/物品栏由 GamePage 的
 * keydown 处理器管），只负责：移动输入 + 视角 + 槽位 + 连续挖掘状态。
 */
import type { PlayerInput } from '../engine-contract';
import { useSettingsStore } from '@/stores/settings';
import type { KeyBindings } from '@/stores/settings';

export interface InputCallbacks {
  /** 视角增量（deg），由 Engine.rotate 消费 */
  onRotate: (dyaw: number, dpitch: number) => void;
  /** 滚轮切槽（+1 下一槽） */
  onCycleSlot: (dir: 1 | -1) => void;
  /** 数字键选槽 0–8 */
  onSelectSlot: (slot: number) => void;
  /** 双击空格（创造切飞行） */
  onToggleFly: () => void;
  /** 鼠标键状态变化（挖掘/放置由 GamePage 轮询 engine 处理） */
  onPrimaryChange: (down: boolean) => void;
  onSecondaryChange: (down: boolean) => void;
  /** 单击放置（右键 down 边沿触发一次） */
  onPlaceOnce: () => void;
}

export class InputSystem {
  readonly input: PlayerInput = {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    sneak: false,
    sprint: false
  };
  primaryDown = false;
  secondaryDown = false;
  /** 指针是否锁定 */
  locked = false;

  private readonly keys = new Set<string>();
  private lastWDown = 0;
  private lastSpaceDown = 0;
  private sprintKeyHeld = false;

  private readonly onKeyDown = (e: KeyboardEvent) => this.handleKey(e, true);
  private readonly onKeyUp = (e: KeyboardEvent) => this.handleKey(e, false);
  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    const s = useSettingsStore.getState();
    const sens = (s.sensitivity / 100) * 0.15; // 原版 100% ≈ 0.15°/px
    const inv = s.invertY ? -1 : 1;
    this.cb.onRotate(-e.movementX * sens, -e.movementY * sens * inv);
  };
  private readonly onMouseDown = (e: MouseEvent) => {
    if (!this.locked) return;
    if (e.button === 0) {
      this.primaryDown = true;
      this.cb.onPrimaryChange(true);
    } else if (e.button === 2) {
      this.secondaryDown = true;
      this.cb.onSecondaryChange(true);
      this.cb.onPlaceOnce();
    }
  };
  private readonly onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.primaryDown = false;
      this.cb.onPrimaryChange(false);
    } else if (e.button === 2) {
      this.secondaryDown = false;
      this.cb.onSecondaryChange(false);
    }
  };
  private readonly onWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    const s = useSettingsStore.getState();
    if (Math.abs(e.deltaY) < 1) return;
    // wheelSensitivity：累积阈值法（高灵敏 = 低阈值）
    this.wheelAcc += e.deltaY;
    const threshold = 50 / Math.max(0.2, s.wheelSensitivity);
    while (this.wheelAcc >= threshold) {
      this.wheelAcc -= threshold;
      this.cb.onCycleSlot(1);
    }
    while (this.wheelAcc <= -threshold) {
      this.wheelAcc += threshold;
      this.cb.onCycleSlot(-1);
    }
  };
  private wheelAcc = 0;
  private readonly onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) this.releaseAll();
  };
  private readonly onContextMenu = (e: Event) => e.preventDefault();

  private readonly canvas: HTMLCanvasElement;
  private readonly cb: InputCallbacks;

  constructor(canvas: HTMLCanvasElement, cb: InputCallbacks) {
    this.canvas = canvas;
    this.cb = cb;
  }

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }

  requestLock(): void {
    this.canvas.requestPointerLock();
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** 松开全部按键（失焦/覆盖层打开时防卡键） */
  releaseAll(): void {
    this.keys.clear();
    this.input.forward = this.input.back = this.input.left = this.input.right = false;
    this.input.jump = this.input.sneak = this.input.sprint = false;
    this.sprintKeyHeld = false;
    this.primaryDown = false;
    this.secondaryDown = false;
  }

  private bindings(): KeyBindings {
    return useSettingsStore.getState().keyBindings;
  }

  private handleKey(e: KeyboardEvent, down: boolean): void {
    if (!this.locked) return;
    const b = this.bindings();
    const code = e.code;
    // 双击检测
    if (down && !e.repeat) {
      const now = performance.now();
      if (code === b.forward) {
        if (now - this.lastWDown < 250) this.input.sprint = true;
        this.lastWDown = now;
      }
      if (code === b.jump) {
        if (now - this.lastSpaceDown < 250) this.cb.onToggleFly();
        this.lastSpaceDown = now;
      }
      // 数字键 1–9
      const m = /^Digit([1-9])$/.exec(code);
      if (m) this.cb.onSelectSlot(Number(m[1]) - 1);
    }
    if (down) this.keys.add(code);
    else this.keys.delete(code);

    const held = (c: string) => this.keys.has(c);
    this.input.forward = held(b.forward);
    this.input.back = held(b.back);
    this.input.left = held(b.left);
    this.input.right = held(b.right);
    this.input.jump = held(b.jump);
    this.input.sneak = held(b.sneak);
    // 疾跑：疾跑键按住 或 双击 W 锁存（松开 W 时清除锁存）
    if (down && code === b.sprint) this.sprintKeyHeld = true;
    if (!down && code === b.sprint) this.sprintKeyHeld = false;
    if (!down && code === b.forward) this.input.sprint = false;
    this.input.sprint = this.sprintKeyHeld || (this.input.sprint && this.input.forward);
  }
}
