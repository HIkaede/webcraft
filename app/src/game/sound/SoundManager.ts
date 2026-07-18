/**
 * SoundManager —— WebAudio 程序合成音效单例（design.md §8，零音频文件）。
 *
 * 全部音效由振荡器 + 噪声 + 滤波器实时合成：
 *
 * | 键                | 合成方案                                                          | 时长    |
 * |-------------------|-------------------------------------------------------------------|---------|
 * | `ui.click`        | 660Hz 方波 8ms + 高通噪声 20ms，快速衰减                           | ~60ms   |
 * | `dig.{材质}`      | 滤波白噪声 burst（stone 900 / wood 500 / grass 1400 / sand 2000 / | 80–150ms|
 * |                   | glass 3200Hz + 金属感高 Q）                                        |         |
 * | `place.{材质}`    | 同 dig，音高 +30%、时长 ×0.7                                       | ~60ms   |
 * | `step.{材质}`     | dig 的 30% 音量、50ms，双足交替 ±8% 音高                           | ~50ms   |
 * | `random.hurt`     | 220→110Hz 锯齿下滑音                                               | 150ms   |
 * | `random.pop`      | 440→880Hz 正弦上滑（拾取/获得）                                     | 80ms    |
 * | `random.levelup`  | 五声音阶琶音 4 音                                                  | 600ms   |
 * | `ambient.music`   | 简易 C418 风格和弦垫（P3，默认关）                                  | —       |
 *
 * 音量分组：master（主音量）/ music（音乐）/ block（方块）/ ui（界面）/ ambient（环境）。
 * 同时发声数 ≤ 8（超出丢弃最旧）。AudioContext 在首次用户手势后由 unlock() 解锁。
 *
 * 用法：
 * ```ts
 * import { soundManager, SOUNDS } from '@/game/sound/SoundManager';
 * window.addEventListener('pointerdown', () => soundManager.unlock(), { once: true });
 * soundManager.play(SOUNDS.UI_CLICK);
 * soundManager.play(`dig.${'stone'}`); // 或 soundManager.dig('stone')
 * ```
 */
import type { SoundMaterial } from '../types';

/** 音量分组 */
export type SoundGroup = 'master' | 'music' | 'block' | 'ui' | 'ambient';

/** 全部音效键常量（也允许直接写模板字符串 `dig.${material}`） */
export const SOUNDS = {
  UI_CLICK: 'ui.click',
  HURT: 'random.hurt',
  POP: 'random.pop',
  LEVELUP: 'random.levelup',
  AMBIENT_MUSIC: 'ambient.music'
} as const;

/** 合法音效键 */
export type SoundKey =
  | (typeof SOUNDS)[keyof typeof SOUNDS]
  | `dig.${SoundMaterial}`
  | `place.${SoundMaterial}`
  | `step.${SoundMaterial}`;

/** play() 的可选参数 */
export interface PlayOptions {
  /** 0–1，乘在分组音量上（默认 1） */
  volume?: number;
  /** 音高倍率（默认 1；>1 更尖锐） */
  pitch?: number;
}

/** dig 材质低通频率（design.md §8） */
const MATERIAL_LPF: Record<SoundMaterial, number> = {
  stone: 900,
  wood: 500,
  grass: 1400,
  sand: 2000,
  glass: 3200
};

/** 每种音效键所属音量分组 */
function groupOf(key: SoundKey): Exclude<SoundGroup, 'master'> {
  if (key.startsWith('ui.')) return 'ui';
  if (key === SOUNDS.AMBIENT_MUSIC) return 'music';
  if (key === SOUNDS.HURT || key === SOUNDS.POP || key === SOUNDS.LEVELUP) return 'block';
  return 'block'; // dig/place/step
}

const MAX_VOICES = 8;

class SoundManagerImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private groups: Partial<Record<SoundGroup, GainNode>> = {};
  private noiseBuffer: AudioBuffer | null = null;
  private voices = new Set<AudioBufferSourceNode | OscillatorNode>();
  private stepParity = false;
  private volumes: Record<SoundGroup, number> = {
    master: 0.8,
    music: 0.3,
    block: 1,
    ui: 1,
    ambient: 1
  };
  private musicTimer: ReturnType<typeof setTimeout> | null = null;

  /** 是否已解锁（AudioContext 已创建且 resume） */
  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /**
   * 在首次用户手势（pointerdown/keydown）中调用以创建/恢复 AudioContext。
   * 重复调用安全。设置 store 初始化时会自动接线本方法（见 stores/settings.ts）。
   */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return; // 无 WebAudio 环境：全部播放静默跳过
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volumes.master;
    this.master.connect(this.ctx.destination);
    for (const g of ['music', 'block', 'ui', 'ambient'] as const) {
      const gain = this.ctx.createGain();
      gain.gain.value = this.volumes[g];
      gain.connect(this.master);
      this.groups[g] = gain;
    }
    // 预生成 1s 白噪声缓冲（所有噪声音源复用）
    const len = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  /** 设置分组音量（0–1）。settings store 改动时即时生效。 */
  setGroupVolume(group: SoundGroup, v: number): void {
    const vol = Math.max(0, Math.min(1, v));
    this.volumes[group] = vol;
    const node = group === 'master' ? this.master : this.groups[group];
    if (node && this.ctx) node.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.02);
  }

  /** 读取分组音量（0–1） */
  getGroupVolume(group: SoundGroup): number {
    return this.volumes[group];
  }

  /** 播放指定音效。未解锁或分组音量为 0 时静默跳过。 */
  play(key: SoundKey, opts: PlayOptions = {}): void {
    if (!this.ctx || !this.master) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const group = groupOf(key);
    const out = this.groups[group];
    if (!out) return;
    if (this.volumes.master <= 0 || this.volumes[group] <= 0) return;

    // 同时发声数 ≤ 8：超出丢弃最旧
    if (this.voices.size >= MAX_VOICES) {
      const oldest = this.voices.values().next().value;
      if (oldest) {
        try {
          oldest.stop();
        } catch {
          /* 已停止 */
        }
        this.voices.delete(oldest);
      }
    }

    const volume = opts.volume ?? 1;
    const pitch = opts.pitch ?? 1;
    const t = this.ctx.currentTime;

    if (key === SOUNDS.UI_CLICK) this.uiClick(t, out, volume);
    else if (key === SOUNDS.HURT) this.hurt(t, out, volume * pitch);
    else if (key === SOUNDS.POP) this.pop(t, out, volume * pitch);
    else if (key === SOUNDS.LEVELUP) this.levelup(t, out, volume);
    else if (key === SOUNDS.AMBIENT_MUSIC) this.musicPad(t, out, volume);
    else if (key.startsWith('dig.'))
      this.digBurst(t, out, key.slice(4) as SoundMaterial, volume, pitch, 1, 1);
    else if (key.startsWith('place.'))
      this.digBurst(t, out, key.slice(6) as SoundMaterial, volume, pitch * 1.3, 0.7, 1);
    else if (key.startsWith('step.')) {
      // 双足交替 ±8% 音高
      this.stepParity = !this.stepParity;
      const p = pitch * (this.stepParity ? 1.08 : 0.92);
      this.digBurst(t, out, key.slice(5) as SoundMaterial, volume * 0.3, p, 0.4, 0.05);
    }
  }

  /** 便捷方法：破坏音（按住挖掘时每 250ms 循环调用） */
  dig(material: SoundMaterial, opts?: PlayOptions): void {
    this.play(`dig.${material}`, opts);
  }
  /** 便捷方法：放置音 */
  place(material: SoundMaterial, opts?: PlayOptions): void {
    this.play(`place.${material}`, opts);
  }
  /** 便捷方法：脚步音 */
  step(material: SoundMaterial, opts?: PlayOptions): void {
    this.play(`step.${material}`, opts);
  }

  /* ---------------- 内部合成器 ---------------- */

  private track<T extends AudioBufferSourceNode | OscillatorNode>(node: T): T {
    this.voices.add(node);
    node.onended = () => this.voices.delete(node);
    return node;
  }

  private envelope(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  /** ui.click：660Hz 方波 8ms + 高通噪声 20ms，快速衰减 */
  private uiClick(t: number, out: GainNode, volume: number): void {
    const ctx = this.ctx!;
    const osc = this.track(ctx.createOscillator());
    osc.type = 'square';
    osc.frequency.value = 660;
    const g = this.envelope(t, 0.5 * volume, 0.001, 0.008);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.02);

    if (this.noiseBuffer) {
      const noise = this.track(ctx.createBufferSource());
      noise.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2000;
      const ng = this.envelope(t, 0.25 * volume, 0.001, 0.02);
      noise.connect(hp).connect(ng).connect(out);
      noise.start(t);
      noise.stop(t + 0.06);
    }
  }

  /** dig/place/step 共用：滤波白噪声 burst */
  private digBurst(
    t: number,
    out: GainNode,
    material: SoundMaterial,
    volume: number,
    pitch: number,
    timeScale: number,
    fixedDuration?: number
  ): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) return;
    const dur = fixedDuration ?? (0.08 + Math.random() * 0.07) * timeScale;
    const noise = this.track(ctx.createBufferSource());
    noise.buffer = this.noiseBuffer;
    noise.playbackRate.value = pitch;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = MATERIAL_LPF[material] * pitch;
    const g = this.envelope(t, 0.9 * volume, 0.004, dur);
    noise.connect(lp).connect(g).connect(out);
    noise.start(t, Math.random() * 0.5);
    noise.stop(t + dur + 0.05);

    // glass：叠加金属感高 Q 短鸣
    if (material === 'glass') {
      const osc = this.track(ctx.createOscillator());
      osc.type = 'triangle';
      osc.frequency.value = 2600 * pitch;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600 * pitch;
      bp.Q.value = 18;
      const og = this.envelope(t, 0.18 * volume, 0.001, Math.min(0.05, dur));
      osc.connect(bp).connect(og).connect(out);
      osc.start(t);
      osc.stop(t + Math.min(0.06, dur) + 0.02);
    }
  }

  /** random.hurt：220→110Hz 锯齿下滑音，150ms */
  private hurt(t: number, out: GainNode, volume: number): void {
    const ctx = this.ctx!;
    const osc = this.track(ctx.createOscillator());
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.15);
    const g = this.envelope(t, 0.5 * volume, 0.005, 0.145);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  /** random.pop：440→880Hz 正弦上滑，80ms */
  private pop(t: number, out: GainNode, volume: number): void {
    const ctx = this.ctx!;
    const osc = this.track(ctx.createOscillator());
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.08);
    const g = this.envelope(t, 0.45 * volume, 0.005, 0.075);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  /** random.levelup：五声音阶琶音 4 音（C5 E5 G5 A5），600ms */
  private levelup(t: number, out: GainNode, volume: number): void {
    const ctx = this.ctx!;
    const notes = [523.25, 659.25, 783.99, 880.0];
    notes.forEach((freq, i) => {
      const start = t + i * 0.15;
      const osc = this.track(ctx.createOscillator());
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = this.envelope(start, 0.35 * volume, 0.005, 0.14);
      osc.connect(g).connect(out);
      osc.start(start);
      osc.stop(start + 0.16);
    });
  }

  /** ambient.music（P3）：简易 C418 风格——正弦+三角和弦垫 + 随机钢琴音 */
  private musicPad(t: number, out: GainNode, volume: number): void {
    const ctx = this.ctx!;
    const chords = [
      [261.63, 329.63, 392.0], // C
      [220.0, 261.63, 329.63], // Am
      [174.61, 220.0, 261.63], // F
      [196.0, 246.94, 293.66] // G
    ];
    const chord = chords[Math.floor(Math.random() * chords.length)];
    for (const freq of chord) {
      for (const type of ['sine', 'triangle'] as const) {
        const osc = this.track(ctx.createOscillator());
        osc.type = type;
        osc.frequency.value = freq * (type === 'triangle' ? 2 : 1);
        const g = ctx.createGain();
        const peak = 0.05 * volume;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 2.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + 7.2);
      }
    }
    // 随机钢琴音（五声音阶）
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const start = t + Math.random() * 4;
      const osc = this.track(ctx.createOscillator());
      osc.type = 'sine';
      osc.frequency.value = scale[Math.floor(Math.random() * scale.length)];
      const g = this.envelope(start, 0.12 * volume, 0.01, 1.4);
      osc.connect(g).connect(out);
      osc.start(start);
      osc.stop(start + 1.6);
    }
  }

  /** 启动环境音乐循环（30–90s 随机触发；默认关，options 音乐滑条控制音量） */
  startAmbientMusic(): void {
    if (this.musicTimer !== null) return;
    const tick = () => {
      this.play(SOUNDS.AMBIENT_MUSIC);
      this.musicTimer = setTimeout(tick, 30000 + Math.random() * 60000);
    };
    this.musicTimer = setTimeout(tick, 30000 + Math.random() * 60000);
  }

  /** 停止环境音乐循环 */
  stopAmbientMusic(): void {
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

/** 全局音效单例 */
export const soundManager = new SoundManagerImpl();
export type SoundManager = SoundManagerImpl;
