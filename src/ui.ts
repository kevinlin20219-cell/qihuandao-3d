import { CHARS, CharId } from './data/characters';

const $ = (id: string) => document.getElementById(id)!;

interface Line { who: CharId | null; text: string; dur: number; }

export class UI {
  private queue: Line[] = [];
  private lineT = 0;
  private toastT = 0;
  private spokenOnce = new Set<string>();
  current: Line | null = null;
  /** v58：返回说话人头顶的屏幕坐标（看不到时 null），对话泡跟着他；main 里设置 */
  anchor: ((who: CharId) => { x: number; y: number } | null) | null = null;
  private bub: { x: number; y: number } | null = null;
  /** 每句台词开始显示时调用（播放说话声） */
  /** 新的一句开始时调用；返回配音秒数时，字幕至少停留到配音念完 */
  onLine: ((who: CharId | null, text: string) => number | void) | null = null;
  /** 一句结束（念完、跳过或被打断）时调用 */
  onLineEnd: (() => void) | null = null;
  /** 接下来排队的台词（用来提前加载配音） */
  upcoming() { return this.queue.slice(0, 2); }

  showHud(on: boolean) {
    for (const id of ['objective', 'leaves', 'party', 'keys']) $(id).hidden = !on;
    this.hudOn = on; const b = document.getElementById('bag'); if (b) b.style.display = on && this.bagN ? 'flex' : 'none';
  }

  /** 任务：「标题：说明」拆成两行（粗体标题 + 说明），没有冒号就整句一行 */
  objective(text: string) {
    const el = $('objective'), i = text.search(/[：:]/);
    const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
    const html = i > 0 && i < 16 ? `<span><b>${esc(text.slice(0, i))}</b>${esc(text.slice(i + 1))}</span>` : `<span>${esc(text)}</span>`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  party(squad: CharId[], active: CharId) {
    const el = $('party');
    el.innerHTML = '';
    el.classList.toggle('compact', squad.length > 4);
    squad.forEach((id, i) => {
      const d = CHARS[id];
      const div = document.createElement('div');
      div.className = 'member paper' + (id === active ? ' active' : '');
      div.innerHTML = `<span class="dot" style="background:#${d.body.toString(16).padStart(6, '0')}">${d.name.slice(0, 1)}</span><span><b><span class="k">${i + 1}</span>${d.name}</b><small>${d.skill} · ${d.role}</small></span>`;
      el.appendChild(div);
    });
  }

  leaves(lit: CharId[], total = 8) {
    const el = $('leaves');
    el.innerHTML = '<span>光之叶</span>';
    for (let i = 0; i < total; i++) {
      const leaf = document.createElement('i');
      if (i < lit.length) { leaf.className = 'on'; leaf.title = CHARS[lit[i]].name; }
      el.appendChild(leaf);
    }
  }

  keys(list: [string, string][]) {
    // 左下角横排：当下要做的动作（第一项）高亮，换人 / 提示这类常驻操作调淡
    const always = new Set(['1 2 3', 'H', 'G']);
    const html = list.map(([k, t], i) => `<span class="${always.has(k) ? 'dim' : i === 0 ? 'main' : ''}"><kbd>${k}</kbd>${t}</span>`).join('');
    const el = $('keys'); if (el.innerHTML !== html) el.innerHTML = html;
  }

  /** 排队说一句话。key 不为空时，同一句只说一次。 */
  say(who: CharId | null, text: string, dur = 3.2, key?: string, interrupt = false) {
    if (key) { if (this.spokenOnce.has(key)) return; this.spokenOnce.add(key); }
    const line = { who, text, dur };
    if (interrupt) { this.queue = [line]; if (this.current) this.onLineEnd?.(); this.current = null; this.lineT = 0; }
    else this.queue.push(line);
  }

  sayOnceReset(key: string) { this.spokenOnce.delete(key); }

  busy() { return !!this.current || this.queue.length > 0; }

  toast(text: string, dur = 3.5) { const t = $('toast'); t.textContent = text; t.hidden = false; this.toastT = dur; }

  /** 持续机关的进度条（屏幕上方中间）；text = null 时隐藏 */
  hold(text: string | null, frac: number) {
    let el = document.getElementById('holdbar');
    if (!el) {
      el = document.createElement('div'); el.id = 'holdbar';
      el.style.cssText = 'position:fixed;left:50%;top:78px;transform:translateX(-50%);padding:6px 14px 8px;border-radius:12px;background:rgba(246,239,220,.92);color:#24382b;font:600 14px/1.3 "PingFang SC","Noto Sans CJK SC",sans-serif;pointer-events:none;z-index:25;min-width:220px;text-align:center';
      el.innerHTML = '<div class="t"></div><div style="height:6px;border-radius:3px;background:#d8ccab;margin-top:5px;overflow:hidden"><div class="f" style="height:100%;background:#2f5a3e;width:0"></div></div>';
      document.body.appendChild(el);
    }
    el.style.display = text ? 'block' : 'none';
    if (text) { (el.querySelector('.t') as HTMLElement).textContent = text; (el.querySelector('.f') as HTMLElement).style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%'; }
  }
  /** 口令倒数：屏幕中间的大字，短暂放大后淡出 */
  count(text: string) {
    let el = document.getElementById('count');
    if (!el) {
      el = document.createElement('div'); el.id = 'count';
      el.style.cssText = 'position:fixed;left:50%;top:38%;transform:translate(-50%,-50%) scale(1);font:700 96px/1 "PingFang SC","Noto Sans CJK SC",sans-serif;color:#fff7e0;text-shadow:0 4px 18px rgba(60,40,10,.55),0 0 2px #6b4a1a;pointer-events:none;transition:transform .25s ease-out,opacity .6s ease-in;opacity:0;z-index:30';
      document.body.appendChild(el);
    }
    el.textContent = text; el.style.transition = 'none'; el.style.opacity = '1'; el.style.transform = 'translate(-50%,-50%) scale(1.35)';
    void el.offsetWidth;
    el.style.transition = 'transform .25s ease-out, opacity .6s ease-in .35s'; el.style.transform = 'translate(-50%,-50%) scale(1)'; el.style.opacity = '0';
  }
  private hudOn = false;
  /** 背包：右下角一排小格子 */
  bag(items: { icon: string; name: string; img?: string }[]) {
    let el = document.getElementById('bag');
    if (!el) {
      el = document.createElement('div'); el.id = 'bag';
      el.style.cssText = 'position:fixed;right:20px;bottom:20px;display:flex;gap:8px;align-items:center;font:600 13px/1.2 "PingFang SC","Noto Sans CJK SC",sans-serif;color:#24382b;pointer-events:none;z-index:20';
      document.body.appendChild(el);
    }
    el.style.display = this.hudOn && items.length ? 'flex' : 'none';
    // v58：只显示真的拿到的东西（不再摆空格子），纸张小卡片
    el.innerHTML = items.slice(0, 6).map((it) => `<div class="paper" title="${it.name}" style="width:54px;height:54px;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0">${it.img ? `<img src="${it.img}" alt="${it.name}" style="width:30px;height:30px;object-fit:contain">` : `<div style="font-size:20px;line-height:1">${it.icon}</div>`}<div style="font-size:${it.name.length > 4 ? 9 : 10.5}px;margin-top:2px;color:#5a4428;white-space:nowrap;letter-spacing:${it.name.length > 4 ? '-0.5px' : '0'}">${it.name}</div></div>`).join('');
    this.bagN = items.length;
  }
  private bagN = 0;
  warn(on: boolean) { $('warn').classList.toggle('on', on); }
  observe(on: boolean) { $('observe').classList.toggle('on', on); }
  crosshair(on: boolean) { $('crosshair').hidden = !on; }
  fade(on: boolean) { $('fade').classList.toggle('on', on); }

  xray(html: string | null) { const x = $('xray'); if (html) { x.innerHTML = html; x.hidden = false; } else x.hidden = true; }

  update(dt: number) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').hidden = true; }
    if (!this.current && this.queue.length) { this.current = this.queue.shift()!; this.lineT = this.current.dur; this.render(); }
    if (this.current) {
      this.place(dt);
      this.lineT -= dt;
      if (this.lineT <= 0) { this.current = null; this.onLineEnd?.(); if (!this.queue.length) $('say').hidden = true; }
    }
  }

  skipLine() { if (this.current) this.lineT = 0; }

  /** 对话泡：说话人在画面里就放到他头顶（限制在屏幕内、尾巴指向他），否则回到屏幕下方中间 */
  private place(dt: number) {
    const s = $('say'), l = this.current; if (!l) return;
    const p = l.who && this.anchor ? this.anchor(l.who) : null;
    if (!p) { this.bub = null; s.classList.remove('bubble'); s.style.left = ''; s.style.top = ''; return; }
    const k = this.bub ? Math.min(1, dt * 8) : 1;
    this.bub = this.bub ? { x: this.bub.x + (p.x - this.bub.x) * k, y: this.bub.y + (p.y - this.bub.y) * k } : { ...p };
    const w = s.offsetWidth || 300, h = s.offsetHeight || 60, W = innerWidth, M = 14;
    const y = Math.max(h + 70, Math.min(innerHeight - 120, this.bub.y));
    const party = document.getElementById('party'), pr = party && !party.hidden ? party.getBoundingClientRect() : null;
    const right = pr && y - h < pr.bottom + 8 ? pr.left - 10 : W - M; // 别压到右上角的角色卡
    const x = Math.max(w / 2 + M, Math.min(right - w / 2, this.bub.x));
    s.classList.add('bubble'); s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.setProperty('--tail', Math.max(18, Math.min(w - 18, this.bub.x - x + w / 2)) + 'px');
  }

  private render() {
    const s = $('say');
    const l = this.current!;
    (s.querySelector('b') as HTMLElement).textContent = l.who ? CHARS[l.who].name : '';
    s.style.setProperty('--who', l.who ? '#' + CHARS[l.who].body.toString(16).padStart(6, '0') : '#6a8a4a');
    this.bub = null; this.place(0);
    (s.querySelector('span') as HTMLElement).textContent = l.text;
    s.hidden = false;
    const vd = this.onLine?.(l.who, l.text);
    if (typeof vd === 'number' && vd > 0) this.lineT = Math.max(this.lineT, vd + 0.45);
  }
}
