// 第一章背景音乐：全部用 WebAudio 现场合成（没有音频文件、没有版权问题）。
// 绘本风：柔和和弦垫底 + 八音盒/卡林巴拨弦旋律 + 低音 + 鸟叫和风声。按区域换情绪，M 键开关。
type Mood = 'forest' | 'tense' | 'glade' | 'done';

const WIND_K = 0.9; // 用户 11-03：0.4 → 0.65 → 0.9
export type Style = 'musicbox' | 'piano' | 'flute' | 'lively' | 'calm';
/** 备选风格：速度、主旋律乐器、伴奏方式、打击乐、密度、和弦垫和鸟叫的分量 */
export const STYLES: Record<Style, { name: string; bpm: number; lead: 'pluck' | 'piano' | 'flute' | 'marimba' | 'bell'; arp: boolean; perc: boolean; dens: number; pad: number; birds: number; bass: number }> = {
  musicbox: { name: 'A 八音盒', bpm: 72, lead: 'pluck', arp: false, perc: false, dens: 1, pad: 1, birds: 1, bass: 1 },
  piano: { name: 'B 温柔钢琴', bpm: 66, lead: 'piano', arp: true, perc: false, dens: 0.8, pad: 0.6, birds: 0.8, bass: 1 },
  flute: { name: 'C 长笛竖琴', bpm: 80, lead: 'flute', arp: true, perc: false, dens: 0.6, pad: 0.5, birds: 1.2, bass: 0.8 },
  lively: { name: 'D 轻快冒险', bpm: 104, lead: 'marimba', arp: false, perc: true, dens: 1.25, pad: 0.7, birds: 0.7, bass: 1.3 },
  calm: { name: 'E 安静氛围', bpm: 58, lead: 'bell', arp: false, perc: false, dens: 0.35, pad: 1.4, birds: 1.6, bass: 0.6 },
};
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// 每个情绪：四个和弦（每个两小节）、旋律音阶、拨弦音色亮度、风声、鸟叫多少
const MOODS: Record<Mood, { chords: number[][]; bass: number[]; scale: number[]; density: number; bright: number; wind: number; birds: number; oct: number }> = {
  // D 大调：Dmaj9 – Bm7 – Gmaj7 – A6sus4
  forest: { chords: [[62, 66, 69, 73, 76], [59, 62, 66, 69, 74], [55, 59, 62, 66, 71], [57, 62, 64, 66, 69]], bass: [38, 35, 31, 33], scale: [62, 64, 66, 69, 71, 74, 76, 78, 81], density: 0.55, bright: 1, wind: 0.015, birds: 1, oct: 0 },
  // 吊桥：B 小调，更稀、低一点，风大
  tense: { chords: [[59, 62, 66, 69], [55, 59, 62, 66], [52, 55, 59, 64], [54, 57, 61, 64]], bass: [35, 31, 28, 30], scale: [59, 61, 62, 64, 66, 69, 71, 74], density: 0.32, bright: 0.6, wind: 0.07, birds: 0.2, oct: 0 },
  // 苔鹿林间：G 利底亚，高八度的钟琴感
  glade: { chords: [[55, 59, 62, 66, 69], [57, 61, 64, 69], [52, 59, 62, 66, 71], [54, 61, 64, 69]], bass: [31, 33, 28, 30], scale: [67, 69, 71, 73, 74, 76, 78, 79, 83], density: 0.45, bright: 1.3, wind: 0.02, birds: 0.6, oct: 12 },
  // 过关：明亮的 D – G – A – D
  done: { chords: [[62, 66, 69, 74], [55, 62, 67, 71], [57, 61, 64, 69], [62, 66, 69, 74, 78]], bass: [38, 31, 33, 38], scale: [62, 64, 66, 69, 71, 74, 76, 78], density: 0.7, bright: 1.2, wind: 0.01, birds: 1.2, oct: 0 },
};

export class Music {
  private ac: BaseAudioContext;
  private master: GainNode; private musicBus: GainNode; private rev: ConvolverNode; private windGain: GainNode; private windF: BiquadFilterNode;
  private next = 0; private step = 0; private mood: Mood = 'forest'; private pending: Mood = 'forest';
  private style: Style = 'musicbox'; private BEAT = 60 / 72; private BAR = 4 * 60 / 72;
  private timer = 0; private seed = 7; private lastNote = 4; private on = true; private duck = 1;

  /** ctx 传 OfflineAudioContext 时用于离线试听渲染（不开定时器，由 renderUntil 排程） */
  constructor(ctx?: BaseAudioContext, style?: Style) {
    let st = style; if (!st) { try { st = (new URLSearchParams(location.search).get('music_style') || 'flute') as Style; } catch { st = 'flute'; } }
    this.setStyle(STYLES[st!] ? st! : 'flute');
    this.ac = ctx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    const ac = this.ac;
    this.master = ac.createGain(); this.master.gain.value = 0; this.master.connect(ac.destination);
    // 简单混响：程序生成的指数衰减噪声脉冲
    this.rev = ac.createConvolver(); const len = ac.sampleRate * 2.6, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.rev.buffer = ir;
    const revGain = ac.createGain(); revGain.gain.value = 0.32; this.rev.connect(revGain).connect(this.master);
    this.musicBus = ac.createGain(); this.musicBus.gain.value = 0.9; this.musicBus.connect(this.master); this.musicBus.connect(this.rev);
    // 风：粉红一点的噪声 → 带通，慢慢摆动
    const nb = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate), nd = nb.getChannelData(0); let b0 = 0;
    for (let i = 0; i < nd.length; i++) { b0 = 0.985 * b0 + 0.15 * (Math.random() * 2 - 1); nd[i] = b0; }
    const noise = ac.createBufferSource(); noise.buffer = nb; noise.loop = true;
    this.windF = ac.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 500; this.windF.Q.value = 0.7;
    this.windGain = ac.createGain(); this.windGain.gain.value = 0;
    noise.connect(this.windF).connect(this.windGain).connect(this.master); noise.start();
    try { this.on = localStorage.getItem('qhd_music') !== '0'; } catch { /* 无痕窗口 */ }
    this.next = ac.currentTime + 0.2;
    if (!ctx) this.timer = window.setInterval(() => this.schedule(), 90); else this.on = true;
    this.fadeTo(this.on ? 1 : 0, 2.5);
  }

  /** 开始按钮点下后调用（浏览器要求用户操作后才能出声） */
  resume() { if (this.ac.state !== 'running' && 'resume' in this.ac) (this.ac as AudioContext).resume(); }
  /** 离线：排程到 t 秒，mood 立即生效 */
  renderUntil(t: number, mood: Mood) { this.pending = mood; this.horizon = t; this.schedule(); }
  private horizon = -1;
  toggle() { this.on = !this.on; try { localStorage.setItem('qhd_music', this.on ? '1' : '0'); } catch { /* */ } this.fadeTo(this.on ? 1 : 0, 0.8); return this.on; }
  get enabled() { return this.on; }
  get styleId() { return this.style; }
  setStyle(st: Style) { this.style = st; this.BEAT = 60 / STYLES[st].bpm; this.BAR = this.BEAT * 4; }
  setMood(m: Mood) { this.pending = m; } // 在下一个两小节边界换，不会突兀
  /** 有人说话时把音乐压低一点 */
  setDuck(talking: boolean) {
    const v = talking ? 0.55 : 1; if (v === this.duck) return; this.duck = v;
    this.musicBus.gain.setTargetAtTime(0.9 * v, this.ac.currentTime, 0.4);
  }
  private fadeTo(v: number, t: number) { const g = this.master.gain, now = this.ac.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(v * 1.4, now + t); }
  private rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  private schedule() {
    const ac = this.ac, offline = this.horizon >= 0; if (!offline && ac.state !== 'running') return;
    if (!offline && this.next < ac.currentTime - 1) this.next = ac.currentTime + 0.05; // 标签页切走回来后不补播
    const until = offline ? this.horizon : ac.currentTime + 0.35;
    while (this.next < until) {
      const s = this.step, t = this.next;
      if (s % 32 === 0 && this.pending !== this.mood) this.mood = this.pending; // 四个和弦一轮的开头换情绪（每 8 小节）
      const M = MOODS[this.mood], ST = STYLES[this.style], BEAT = this.BEAT, BAR = this.BAR; // 一步 = 八分音符，16 步 = 2 小节 = 一个和弦
      const chordIdx = Math.floor(s / 16) % 4;
      if (s % 16 === 0) { this.pad(M.chords[chordIdx], t, BAR * 2, ST.pad); this.bass(M.bass[chordIdx], t, BAR * 2, 0.045 * ST.bass); this.windTo(M.wind); }
      if (s % 8 === 4) this.bass(M.bass[chordIdx] + 7, t, BEAT * 1.5, 0.025 * ST.bass);
      if (ST.arp) { const ch = M.chords[chordIdx], k = [0, 1, 2, 3, 2, 1, 0, 2][s % 8]; this.harp(ch[k % ch.length] + (ST.lead === 'piano' ? -12 : 0), t, ST.lead === 'piano' ? 0.035 : 0.04); }
      if (ST.perc) { if (s % 4 === 2) this.shaker(t, 0.05); if (s % 2 === 1 && this.rnd() < 0.5) this.shaker(t, 0.025); if (s % 8 === 0) this.block(t, 0.12); if (s % 16 === 11) this.block(t, 0.07); }
      // 旋律：八分音符网格，按密度随机落音；小步走为主，偶尔跳；乐句末尾（每 2 小节最后两拍）多留白
      const phraseEnd = s % 16 >= 13;
      const legato = ST.lead === 'flute' || ST.lead === 'bell';
      if (this.rnd() < Math.min(0.95, M.density * ST.dens) * (phraseEnd ? 0.3 : 1) * (s % 2 === 0 ? 1 : legato ? 0.2 : 0.55)) {
        const jump = this.rnd() < 0.2 ? (this.rnd() < 0.5 ? -3 : 3) : (this.rnd() < 0.5 ? -1 : 1);
        this.lastNote = Math.max(0, Math.min(M.scale.length - 1, this.lastNote + jump));
        // 强拍上尽量落和弦音
        let note = M.scale[this.lastNote];
        if (s % 4 === 0) { const ch = M.chords[chordIdx].map((n) => n + 12); note = ch.reduce((a, b) => Math.abs(b - note) < Math.abs(a - note) ? b : a, ch[0]); if (note > 86) note -= 12; }
        const v = s % 4 === 0 ? 0.16 : 0.11, n = note + M.oct;
        if (ST.lead === 'pluck') this.pluck(n, t, M.bright, v);
        else if (ST.lead === 'piano') this.piano(n - 12, t, v * 1.1);
        else if (ST.lead === 'flute') this.flute(n, t, BEAT * (this.rnd() < 0.5 ? 1 : 2), v * 0.55);
        else if (ST.lead === 'marimba') this.marimba(n, t, v);
        else this.bellTone(n + 12, t, v * 0.7);
      }
      if (this.rnd() < 0.035 * M.birds * ST.birds * (BEAT / 0.833)) this.bird(t + this.rnd() * 0.3);
      this.step++; this.next += BEAT / 2;
    }
  }

  private pad(notes: number[], t: number, dur: number, amt = 1) {
    const ac = this.ac, f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1300, t + dur * 0.5); f.frequency.linearRampToValueAtTime(800, t + dur); f.Q.value = 0.4;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * amt, t + 1.4); g.gain.setValueAtTime(0.05 * amt, t + dur - 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
    f.connect(g).connect(this.musicBus);
    for (const n of notes) for (const det of [-6, 6]) {
      const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(n); o.detune.value = det;
      const og = ac.createGain(); og.gain.value = 0.5 / notes.length; o.connect(og).connect(f); o.start(t); o.stop(t + dur + 1.3);
    }
  }
  private bass(n: number, t: number, dur: number, vol = 0.045) {
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = mtof(n);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.08); g.gain.exponentialRampToValueAtTime(vol * 0.35, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  /** 八音盒 / 卡林巴：正弦基音 + 一点高次泛音（不整数倍，像金属舌片），快起慢落 */
  private pluck(n: number, t: number, bright: number, vol: number) {
    const ac = this.ac, f0 = mtof(n), g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    g.connect(this.musicBus);
    for (const [mul, amp, dec] of [[1, 1, 2.2], [2.0, 0.18 * bright, 0.9], [5.4, 0.06 * bright, 0.25]] as const) {
      const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = f0 * mul;
      og.gain.setValueAtTime(amp, t); og.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(og).connect(g); o.start(t); o.stop(t + dec + 0.05);
    }
  }
  private env(t: number, a: number, peak: number, dec: number) { const g = this.ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); g.connect(this.musicBus); return g; }
  private osc(type: OscillatorType, f: number, t: number, dur: number, out: AudioNode, amp = 1) { const o = this.ac.createOscillator(), g = this.ac.createGain(); o.type = type; o.frequency.value = f; g.gain.value = amp; o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05); return o; }
  /** 钢琴：几组谐波各自衰减，高频衰减快，带一点击弦 */
  private piano(n: number, t: number, vol: number) {
    const f0 = mtof(n), out = this.env(t, 0.004, vol, 3.2), lp = this.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(f0 * 8, t); lp.frequency.exponentialRampToValueAtTime(f0 * 2, t + 1.5); lp.connect(out);
    [[1, 1], [2, 0.45], [3, 0.22], [4, 0.12], [5, 0.06]].forEach(([m, a]) => this.osc('sine', f0 * m * (1 + 0.0004 * m * m), t, 3.2, lp, a));
  }
  /** 竖琴/拨弦伴奏：三角波快起慢落 */
  private harp(n: number, t: number, vol: number) { const out = this.env(t, 0.003, vol, 1.6); this.osc('triangle', mtof(n), t, 1.6, out); this.osc('sine', mtof(n) * 2, t, 0.6, out, 0.25); }
  /** 长笛：正弦 + 少量三次谐波，慢起，带颤音和气声 */
  private flute(n: number, t: number, dur: number, vol: number) {
    const ac = this.ac, g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.09); g.gain.setValueAtTime(vol * 0.85, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.15); g.connect(this.musicBus);
    const f0 = mtof(n), lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f0 * 0.006, t + 0.4); lfo.connect(lg); lfo.start(t); lfo.stop(t + dur + 0.2);
    for (const [m, a] of [[1, 1], [2, 0.12], [3, 0.08]]) { const o = this.osc('sine', f0 * m, t, dur + 0.2, g, a); lg.connect(o.frequency); }
    const nb = ac.createBufferSource(); nb.buffer = this.noiseBuf(); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * 2; bp.Q.value = 2; const ng = ac.createGain(); ng.gain.value = 0.25; nb.connect(bp).connect(ng).connect(g); nb.start(t); nb.stop(t + dur + 0.2);
  }
  /** 马林巴：木质短音，基音 + 四倍泛音，衰减快 */
  private marimba(n: number, t: number, vol: number) { const f0 = mtof(n), out = this.env(t, 0.002, vol, 0.7); this.osc('sine', f0, t, 0.7, out); this.osc('sine', f0 * 4, t, 0.12, out, 0.3); this.osc('sine', f0 * 10, t, 0.04, out, 0.1); }
  /** 钟琴/铃：不和谐泛音，很长的尾巴 */
  private bellTone(n: number, t: number, vol: number) { const f0 = mtof(n), out = this.env(t, 0.003, vol, 4.5); [[1, 1], [2.76, 0.35], [5.4, 0.15], [8.93, 0.06]].forEach(([m, a]) => this.osc('sine', f0 * m, t, 4.5, out, a)); }
  private nb: AudioBuffer | null = null;
  private noiseBuf() { if (!this.nb) { const b = this.ac.createBuffer(1, this.ac.sampleRate, this.ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.nb = b; } return this.nb; }
  /** 沙锤：高通噪声短脉冲 */
  private shaker(t: number, vol: number) { const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf(); const hp = this.ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000; const g = this.env(t, 0.003, vol, 0.06); s.connect(hp).connect(g); s.start(t); s.stop(t + 0.1); }
  /** 木鱼：很短的高音正弦 */
  private block(t: number, vol: number) { const out = this.env(t, 0.001, vol, 0.08); const o = this.osc('sine', 1250, t, 0.1, out); o.frequency.exponentialRampToValueAtTime(900, t + 0.05); }
  /** 鸟叫：两三声快速上滑的短音，随机左右 */
  private bird(t: number) {
    const ac = this.ac, pan = ac.createStereoPanner(); pan.pan.value = this.rnd() * 1.6 - 0.8; pan.connect(this.master);
    const base = 2600 + this.rnd() * 1600, n = 2 + Math.floor(this.rnd() * 3);
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.09 + this.rnd() * 0.05), o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * (1.3 + this.rnd() * 0.4), s + 0.06);
      g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(0.018, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.08);
      o.connect(g).connect(pan); o.start(s); o.stop(s + 0.1);
    }
  }
  private windTo(v: number) {
    const now = this.ac.currentTime; this.windGain.gain.setTargetAtTime(v * WIND_K, now, 2); // v64：用户说「水流声」偏大，整体压到约 4 成
    this.windF.frequency.setTargetAtTime(380 + this.rnd() * 400, now, 3);
  }
  /** 吊桥上来阵风时临时加大风声 */
  private gusting = false;
  gust(on: boolean) { if (on === this.gusting) return; this.gusting = on; this.windGain.gain.setTargetAtTime((on ? 0.16 : MOODS[this.mood].wind) * WIND_K, this.ac.currentTime, on ? 0.3 : 1.5); }
}
