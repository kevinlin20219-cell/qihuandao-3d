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
  /** 口令倒数（用户 11-08：原来只是一行大字太简陋）：圆形口令牌，数字弹出，外圈每拍走一圈，
   *  下面三颗拍点；喊到「一」变金色并提示「现在按 E！」，外圈改为按键窗口倒计时。 */
  count(text: string, beat = -1, win = 0.6) {
    let el = document.getElementById('count');
    if (!el) {
      const st = document.createElement('style'); st.textContent = `
#count{position:fixed;left:50%;top:22%;transform:translate(-50%,-50%);z-index:30;pointer-events:none;display:grid;justify-items:center;gap:10px;opacity:0;transition:opacity .25s}
#count.on{opacity:1}
#count .disc{position:relative;width:150px;height:150px;display:grid;place-items:center}
#count svg{position:absolute;inset:0;transform:rotate(-90deg)}
#count .bg{fill:rgba(246,239,220,.94);stroke:#7a5a32;stroke-width:5}
#count .ring{fill:none;stroke:#2f5a3e;stroke-width:8;stroke-linecap:round;stroke-dasharray:408;stroke-dashoffset:408}
#count .num{position:relative;z-index:1;font:800 76px/1 "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;color:#2f3d2a;text-shadow:0 2px 0 #fff8e4}
#count .num.pop{animation:cdPop .45s cubic-bezier(.2,1.7,.4,1)}
@keyframes cdPop{from{transform:scale(1.9);opacity:0}to{transform:scale(1);opacity:1}}
#count .dots{display:flex;gap:10px}
#count .dots i{width:14px;height:14px;border-radius:50%;background:rgba(246,239,220,.35);border:2px solid rgba(246,239,220,.8);transition:background .2s,transform .2s}
#count .dots i.lit{background:#e2b45a;transform:scale(1.15)}
#count .hint{font:600 17px "PingFang SC","Microsoft YaHei",sans-serif;color:#fff7e0;background:rgba(36,56,43,.82);padding:6px 16px;border-radius:999px;text-shadow:none;letter-spacing:.04em}
#count .hint kbd{font:800 15px sans-serif;background:#f6efdc;color:#24382b;border-radius:6px;padding:1px 8px;margin:0 3px}
#count.go .bg{fill:#ffd76a;stroke:#b07a1e}
#count.go .ring{stroke:#c0392b}
#count.go .num{color:#5a3200}
#count.go .disc{animation:cdGo .5s ease-in-out infinite alternate}
#count.go .hint{background:#c0392b;animation:cdGo .5s ease-in-out infinite alternate}
@keyframes cdGo{to{transform:scale(1.07)}}
#count.ok .bg{fill:#9ad08a;stroke:#2f5a3e}
#count.ok .num{color:#1f4a28}
#count.miss .bg{fill:#e9d7c0;stroke:#8a6a4a}
#count.miss .num{color:#8a4a2a;font-size:44px}
`;
      document.head.appendChild(st);
      el = document.createElement('div'); el.id = 'count';
      el.innerHTML = '<div class="disc"><svg viewBox="0 0 150 150"><circle class="bg" cx="75" cy="75" r="65"/><circle class="ring" cx="75" cy="75" r="65"/></svg><div class="num"></div></div><div class="dots"><i></i><i></i><i></i></div><div class="hint"></div>';
      document.body.appendChild(el);
    }
    const num = el.querySelector('.num') as HTMLElement, ring = el.querySelector('.ring') as SVGCircleElement, hint = el.querySelector('.hint') as HTMLElement;
    const b = beat >= 0 ? beat : text.startsWith('三') ? 0 : text.startsWith('二') ? 1 : 2;
    clearTimeout(this.countHide);
    el.classList.remove('ok', 'miss'); el.classList.toggle('go', b === 2); el.classList.add('on');
    num.textContent = text.replace(/[—！!]/g, ''); num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop');
    el.querySelectorAll('.dots i').forEach((d, i) => d.classList.toggle('lit', i <= b));
    hint.innerHTML = b === 2 ? '现在按 <kbd>E</kbd>！' : '喊到「一」时按 <kbd>E</kbd>';
    // 外圈：前两拍各走满一秒；第三拍从满圈缩到空，表示还剩多少按键时间
    ring.style.transition = 'none'; ring.style.strokeDashoffset = b === 2 ? '0' : '408'; void ring.getBoundingClientRect();
    ring.style.transition = `stroke-dashoffset ${b === 2 ? win : 1}s linear`; ring.style.strokeDashoffset = b === 2 ? '408' : '0';
  }
  /** 口令结束：ok 成功（绿色「好！」），miss 失败，空 = 直接收起 */
  countEnd(result?: 'ok' | 'miss') {
    const el = document.getElementById('count'); if (!el) return;
    clearTimeout(this.countHide);
    if (!result) { el.classList.remove('on'); return; }
    el.classList.remove('go'); el.classList.add(result);
    (el.querySelector('.num') as HTMLElement).textContent = result === 'ok' ? '好！' : '再来';
    (el.querySelector('.hint') as HTMLElement).textContent = result === 'ok' ? '一起动手！' : '没对上节拍';
    const ring = el.querySelector('.ring') as SVGCircleElement; ring.style.transition = 'none'; ring.style.strokeDashoffset = '408';
    this.countHide = window.setTimeout(() => el.classList.remove('on'), 900);
  }
  private countHide = 0;
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
