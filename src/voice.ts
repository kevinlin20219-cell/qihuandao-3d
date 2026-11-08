// 卡通「咿呀」说话声（像动物森友会）：每个字一个短音节，元音共振峰 + 各角色自己的音高和音色。
// 不读真实字词，字幕照常显示。全部 WebAudio 现场合成，没有音频文件。V 键开关。
import type { CharId } from './data/characters';

const VOICES: Partial<Record<CharId, { pitch: number; spread: number; rate: number; wave: OscillatorType; bright: number; vol: number }>> = {
  hanhan: { pitch: 330, spread: 0.22, rate: 11, wave: 'triangle', bright: 1.0, vol: 0.2 },  // 队长：清亮、语速中等
  paipai: { pitch: 440, spread: 0.3, rate: 12.5, wave: 'triangle', bright: 1.25, vol: 0.18 }, // 最小：高、快、跳
  tangtuan: { pitch: 220, spread: 0.16, rate: 9.5, wave: 'sawtooth', bright: 0.75, vol: 0.16 }, // 男孩：低、稳、慢一点
};
const DEFAULT = { pitch: 300, spread: 0.2, rate: 11, wave: 'triangle' as OscillatorType, bright: 1, vol: 0.18 };
// 元音共振峰（F1, F2）：a o e i u ü
const VOWELS: [number, number][] = [[800, 1200], [500, 850], [550, 1500], [300, 2300], [330, 800], [300, 1900]];

export class Voice {
  private ac: BaseAudioContext; private out: GainNode; private on = true; private seed = 3;
  constructor(ctx?: BaseAudioContext) {
    this.ac = ctx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    this.out = this.ac.createGain(); this.out.gain.value = 0.7; this.out.connect(this.ac.destination);
    if (!ctx) try { this.on = localStorage.getItem('qhd_voice') !== '0'; } catch { /* */ }
  }
  resume() { if ('resume' in this.ac && this.ac.state !== 'running') (this.ac as AudioContext).resume(); }
  toggle() { this.on = !this.on; try { localStorage.setItem('qhd_voice', this.on ? '1' : '0'); } catch { /* */ } return this.on; }
  private rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  private hash(s: string) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 2147483647; return h || 1; }

  /** 说一句：返回大约用时（秒）。t0 不传就是现在 */
  speak(who: CharId | null, text: string, t0?: number) {
    if (!this.on || !who) return 0;
    const V = VOICES[who] ?? DEFAULT, ac = this.ac; let t = t0 ?? ac.currentTime + 0.03;
    this.seed = this.hash(text); // 同一句话每次听起来一样
    const chars = [...text].slice(0, 40); // 太长的句子只念前面一段，免得拖
    const start = t;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (/[，、；：,;:]/.test(c)) { t += 0.16; continue; }
      if (/[。！？!?…—.]/.test(c)) { t += 0.26; continue; }
      if (/\s|[“”"'（）()《》「」]/.test(c)) continue;
      const last = i === chars.length - 1 || /[。！？!?]/.test(chars[i + 1] ?? '');
      const q = /[？?]/.test(text.slice(i, i + 3)); // 问句末尾上扬
      const dur = (1 / V.rate) * (0.8 + this.rnd() * 0.4) * (last ? 1.6 : 1);
      const p = V.pitch * (1 + (this.rnd() * 2 - 1) * V.spread) * (last ? (q ? 1.25 : 0.88) : 1);
      this.syllable(t, dur, p, VOWELS[Math.floor(this.rnd() * VOWELS.length)], V, last && q);
      t += dur * 1.05;
    }
    return t - start;
  }

  private syllable(t: number, dur: number, f0: number, [f1, f2]: [number, number], V: typeof DEFAULT, rise: boolean) {
    const ac = this.ac, o = ac.createOscillator(); o.type = V.wave;
    o.frequency.setValueAtTime(f0 * 0.94, t); o.frequency.linearRampToValueAtTime(f0 * (rise ? 1.18 : 1.03), t + dur * 0.6); o.frequency.linearRampToValueAtTime(f0 * (rise ? 1.25 : 0.96), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(V.vol, t + 0.012); g.gain.setValueAtTime(V.vol * 0.9, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const mix = ac.createGain(); mix.gain.value = 1; mix.connect(g); g.connect(this.out);
    for (const [f, q, a] of [[f1, 5, 1], [f2 * V.bright, 7, 0.6]] as const) {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const ga = ac.createGain(); ga.gain.value = a * 3; o.connect(bp).connect(ga).connect(mix);
    }
    const dry = ac.createGain(); dry.gain.value = 0.25; o.connect(dry).connect(mix); // 保留一点原声，听起来更圆
    o.start(t); o.stop(t + dur + 0.02);
  }
}

// ───────── 正式配音（Codex 0221 交付，269 句 MP3，按台词文字对上） ─────────
// 配音打成几个大包（发布页文件数有上限）：用到哪包才下载哪包；只解码当前和接下来两句，最多缓存 8 句。
type VLine = [number, number, number, number, string]; // 包号, 起点, 字节数, 秒数, 编号
export function voiceKey(who: string, text: string) {
  return who + '|' + text.replace(/[（(][^）)]*[）)]/g, '').replace(/[\s，。、；：！？…—,.;:!?“”"'（）()《》「」·~～]/g, '');
}
export class VoiceLines {
  private ac: AudioContext; private out: GainNode; on = true;
  private packs = new Map<number, Promise<ArrayBuffer>>(); private bufs = new Map<string, Promise<AudioBuffer | null>>();
  private src: AudioBufferSourceNode | null = null; private token = 0;
  missing: string[] = []; played = 0; asked = 0; lateMs: number[] = [];
  private constructor(private base: string, private lines: Record<string, VLine>, private files: string[]) {
    this.ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.out = this.ac.createGain(); this.out.gain.value = 1; this.out.connect(this.ac.destination);
    try { this.on = localStorage.getItem('qhd_voice') !== '0'; } catch { /* */ }
    this.pack(0);
  }
  static async load(url: string) {
    const r = await fetch(url); if (!r.ok) throw new Error('配音索引 ' + r.status);
    const j = await r.json(); return new VoiceLines(url.replace(/[^/]*$/, ''), j.lines, j.packs);
  }
  resume() { if (this.ac.state !== 'running') this.ac.resume(); this.fetchAll(); }
  private all = false;
  /** 开始游戏以后在后台一包一包地下载其余配音（每包约 2 MB），免得念到时才下载 */
  private async fetchAll() { if (this.all) return; this.all = true; for (let i = 0; i < this.files.length; i++) await this.pack(i)!.catch(() => null); }
  setPaused(p: boolean) { if (p) { if (this.ac.state === 'running') this.ac.suspend(); } else this.resume(); }
  toggle() { this.on = !this.on; if (!this.on) this.stop(); try { localStorage.setItem('qhd_voice', this.on ? '1' : '0'); } catch { /* */ } return this.on; }
  find(who: string | null, text: string) { return who ? this.lines[voiceKey(who, text)] ?? null : null; }
  private pack(i: number) {
    let p = this.packs.get(i);
    if (!p && i < this.files.length) { p = fetch(this.base + this.files[i]).then((r) => r.arrayBuffer()); this.packs.set(i, p); }
    return p;
  }
  private buf(l: VLine) {
    let b = this.bufs.get(l[4]);
    if (!b) {
      b = this.pack(l[0])!.then((ab) => this.ac.decodeAudioData(ab.slice(l[1], l[1] + l[2]))).catch(() => null);
      this.bufs.set(l[4], b);
      while (this.bufs.size > 8) this.bufs.delete(this.bufs.keys().next().value!);
      if (l[0] + 1 < this.files.length) this.pack(l[0] + 1); // 顺手预取下一包
    }
    return b;
  }
  /** 提前解码接下来要说的话 */
  prefetch(next: { who: string | null; text: string }[]) { if (this.on) for (const n of next) { const l = this.find(n.who, n.text); if (l) this.buf(l); } }
  /** 念一句；返回配音秒数（没有配音或关着返回 0） */
  speak(who: string | null, text: string) {
    this.stop(); if (!this.on || !who) return 0;
    const l = this.find(who, text); if (!l) { this.missing.push(who + ':' + text); return 0; }
    const tk = this.token, t0 = performance.now(); this.asked++;
    this.buf(l).then((b) => {
      if (!b || tk !== this.token) return;
      const s = this.ac.createBufferSource(); s.buffer = b; s.connect(this.out);
      s.start(); this.src = s; this.played++; this.lateMs.push(Math.round(performance.now() - t0)); // 加载慢了也从头念；这句字幕已经结束（token 变了）就不念
    });
    return l[3];
  }
  stop() { this.token++; if (this.src) { try { this.src.stop(); } catch { /* */ } this.src = null; } }
}
