// 入口简介 + 第一章开场动画（用户 11-08）。
// 进页面立刻显示游戏简介，「开始冒险」按钮不必等加载；点下去先放开场动画，动画放着的同时后台加载角色和森林。
// 动画放完（或点「跳过」）如果还没加载完，就显示进度，等加载好再进游戏。
// 动画全部是 SVG + CSS，不依赖任何下载的资源。?intro=0 或自动测试时跳过动画。
import { readChapter } from './runtime/chapter_save';

type StartOpts = { start: (resume: boolean) => void; clearSave: () => void };

const SCENES: { cls: string; text: string; dur: number }[] = [
  { cls: 'sc-island', text: '海的中间，有一座奇幻岛。岛的正中央，长着一棵会发光的大树。', dur: 6.5 },
  { cls: 'sc-dim', text: '可是最近，大树的光一天比一天暗，岛上起了雾。', dur: 6 },
  { cls: 'sc-door', text: '很久以前，造岛的「点灯人」在每一台机关上都刻了同一句话——', dur: 6.5 },
  { cls: 'sc-motto', text: '「一个人打不开的门，是留给朋友的。」', dur: 5.5 },
  { cls: 'sc-kids', text: '汤团、涵涵和派派决定一起出发，把大树的光找回来。', dur: 7 },
  { cls: 'sc-bridge', text: '第一站：森林深处，那座断掉的吊桥。', dur: 6 },
];

const CSS = `
#intro{position:fixed;inset:0;z-index:40;background:#07120d;color:#f6efdc;overflow:hidden;font-family:var(--font)}
#intro svg{position:absolute;inset:0;width:100%;height:100%}
#intro .sc{opacity:0;transition:opacity 1.4s ease}
#intro .sc.on{opacity:1}
#intro .cam{transform-origin:800px 450px;animation:introCam 40s linear forwards}
@keyframes introCam{from{transform:scale(1)}to{transform:scale(1.12)}}
#intro .cap{position:absolute;left:50%;bottom:11%;transform:translateX(-50%);width:min(860px,88vw);text-align:center;background:linear-gradient(90deg,transparent,rgba(4,10,7,.62) 15%,rgba(4,10,7,.62) 85%,transparent);padding:14px 48px;box-sizing:border-box;color:#fff8e6;font-size:clamp(18px,2.6vw,28px);line-height:1.6;letter-spacing:.06em;text-shadow:0 2px 12px rgba(0,0,0,.8);opacity:0;transition:opacity .5s ease}
#intro .cap.on{opacity:1}
#intro .ch{position:absolute;inset:0;display:grid;place-items:center;text-align:center;opacity:0;background:radial-gradient(ellipse 40% 26% at 50% 50%,rgba(4,10,7,.7),transparent);transition:opacity 1.2s ease;pointer-events:none}
#intro .ch.on{opacity:1}
#intro .ch small{display:block;font-size:16px;letter-spacing:.5em;color:#ffd76a;margin-bottom:12px;text-shadow:0 2px 8px #000}
#intro .ch b{text-shadow:0 3px 14px rgba(0,0,0,.8)}
#intro .ch b{font-size:clamp(30px,5vw,54px);font-weight:600;letter-spacing:.12em}
#intro .skip{position:absolute;right:20px;top:18px;appearance:none;border:1px solid rgba(246,239,220,.45);background:rgba(0,0,0,.25);color:#f6efdc;border-radius:999px;padding:7px 16px;font:14px var(--font);cursor:pointer}
#intro .skip:hover{background:rgba(0,0,0,.45)}
#intro .load{position:absolute;left:50%;bottom:5%;transform:translateX(-50%);width:min(360px,70vw);font-size:12px;color:rgba(246,239,220,.7);text-align:center;letter-spacing:.08em}
#intro .bar{height:3px;background:rgba(246,239,220,.18);border-radius:2px;margin-top:6px;overflow:hidden}
#intro .bar i{display:block;height:100%;width:0;background:#e2b45a;transition:width .4s ease}
#intro .star{animation:tw 3s ease-in-out infinite}
@keyframes tw{0%,100%{opacity:.25}50%{opacity:1}}
#intro .glow{animation:pulse 4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.85}50%{opacity:1}}
#intro.dimming .treeLight{animation:dim 5s ease forwards}
@keyframes dim{to{opacity:.18}}
#intro .fog{animation:fog 14s linear infinite}
@keyframes fog{from{transform:translateX(-120px)}to{transform:translateX(120px)}}
#intro .walk{animation:walk 7s linear forwards}
@keyframes walk{from{transform:translateX(-260px)}to{transform:translateX(120px)}}
#intro .bob{animation:bob .5s ease-in-out infinite alternate}
@keyframes bob{to{transform:translateY(-6px)}}
#intro .carve{stroke-dasharray:1400;stroke-dashoffset:1400}
#intro .sc-door.on .carve{animation:carve 5s ease forwards}
@keyframes carve{to{stroke-dashoffset:0}}
#intro .sway{transform-origin:800px 360px;animation:sway 3.4s ease-in-out infinite alternate}
@keyframes sway{from{transform:rotate(-2.5deg)}to{transform:rotate(2.5deg)}}
#title .intro-chars{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
#title .intro-chars div{background:#ece2c4;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.55;color:var(--ink-soft)}
#title .intro-chars b{display:block;color:var(--ink);font-size:15px;margin-bottom:2px}
#title details summary{cursor:pointer;color:var(--ink-soft);font-size:14px}
#title .ld{font-size:12px;color:var(--ink-soft);letter-spacing:.06em}
@media (max-width:520px){#title .intro-chars{grid-template-columns:1fr}}
`;

// 1600×900 画布；每个场景一个 <g>
const SVG = `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"><defs>
<radialGradient id="iSky" cx="50%" cy="20%" r="90%"><stop offset="0" stop-color="#1d3550"/><stop offset=".6" stop-color="#0e1d2c"/><stop offset="1" stop-color="#060d14"/></radialGradient>
<radialGradient id="iGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff3b0" stop-opacity=".95"/><stop offset=".35" stop-color="#ffd76a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient>
<linearGradient id="iSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16324a"/><stop offset="1" stop-color="#081521"/></linearGradient>
<linearGradient id="iForest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c5a3c"/><stop offset="1" stop-color="#10261a"/></linearGradient>
<linearGradient id="iDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6d2"/><stop offset=".55" stop-color="#7fb08a"/><stop offset="1" stop-color="#2f5a3e"/></linearGradient>
<linearGradient id="iStone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d8471"/><stop offset="1" stop-color="#4f4a3e"/></linearGradient>
<filter id="iBlur"><feGaussianBlur stdDeviation="18"/></filter>
</defs>
<g class="cam">
<!-- 1 海上小岛与发光大树 -->
<g class="sc sc-island sc-dim">
  <rect width="1600" height="900" fill="url(#iSky)"/>
  ${Array.from({ length: 70 }, (_, i) => { const x = (i * 263) % 1600, y = (i * 137) % 430, r = 1 + (i % 3) * 0.7; return `<circle class="star" cx="${x}" cy="${y}" r="${r}" fill="#fff" style="animation-delay:${(i % 9) * 0.37}s"/>`; }).join('')}
  <rect y="560" width="1600" height="340" fill="url(#iSea)"/>
  <path d="M0 600 Q400 585 800 600 T1600 600" stroke="#2c5370" stroke-width="2" fill="none" opacity=".6"/>
  <ellipse cx="800" cy="600" rx="380" ry="46" fill="#0f2618"/>
  <path d="M440 600 Q560 470 700 500 Q800 430 900 500 Q1040 470 1160 600 Z" fill="url(#iForest)"/>
  <g class="treeLight"><circle cx="800" cy="330" r="260" fill="url(#iGlow)" class="glow"/></g>
  <path d="M790 520 C785 460 770 420 760 380 L840 380 C830 420 815 460 810 520 Z" fill="#3b2a1a"/>
  <g fill="#3e7a4b"><circle cx="800" cy="330" r="92"/><circle cx="720" cy="360" r="62"/><circle cx="880" cy="360" r="62"/><circle cx="760" cy="290" r="58"/><circle cx="845" cy="285" r="58"/></g>
  <g class="treeLight" fill="#ffe58a">${Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return `<path transform="translate(${800 + Math.cos(a) * 70} ${330 + Math.sin(a) * 52}) rotate(${(a * 180) / Math.PI})" d="M0 -10 C7 -4 7 4 0 10 C-7 4 -7 -4 0 -10Z" class="glow" style="animation-delay:${i * 0.4}s"/>`; }).join('')}</g>
  <path d="M0 640 Q400 625 800 640 T1600 640" stroke="#3a6a8a" stroke-width="1.5" fill="none" opacity=".4"/>
  <g class="fog" opacity="0"><ellipse cx="600" cy="520" rx="420" ry="70" fill="#c9d6d2" filter="url(#iBlur)" opacity=".35"/><ellipse cx="1100" cy="480" rx="380" ry="60" fill="#c9d6d2" filter="url(#iBlur)" opacity=".3"/></g>
</g>
<!-- 3 刻字的石门 -->
<g class="sc sc-door sc-motto">
  <rect width="1600" height="900" fill="#0b1712"/>
  <circle cx="800" cy="420" r="420" fill="url(#iGlow)" opacity=".18"/>
  <path d="M470 820 L470 330 Q800 110 1130 330 L1130 820 Z" fill="url(#iStone)"/>
  <path d="M560 820 L560 380 Q800 210 1040 380 L1040 820 Z" fill="#2a2a22"/>
  <g stroke="#3d3a30" stroke-width="3" opacity=".7"><path d="M470 450 H560 M1040 450 H1130 M470 600 H560 M1040 600 H1130 M470 720 H560 M1040 720 H1130"/></g>
  <g fill="#6d8f4e" opacity=".9"><path d="M470 330 C430 420 450 520 420 640 C460 560 480 470 500 380Z"/><path d="M1130 330 C1170 430 1150 540 1180 650 C1140 560 1120 470 1100 380Z"/></g>
  <path class="carve" d="M620 520 C660 470 700 470 740 520 S820 570 860 520 S940 470 980 520" stroke="#ffd76a" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path class="carve" d="M650 600 H950 M700 650 H900" stroke="#ffd76a" stroke-width="5" fill="none" stroke-linecap="round" style="animation-delay:.8s"/>
  <g fill="#ffd76a"><circle cx="680" cy="760" r="18" opacity=".8"/><circle cx="920" cy="760" r="18" opacity=".8"/></g>
</g>
<!-- 5 三个孩子走进森林 -->
<g class="sc sc-kids">
  <rect width="1600" height="900" fill="url(#iDay)"/>
  <g fill="#244a32" opacity=".55">${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 190 - 40} 640 L${i * 190 + 40} ${300 + (i % 3) * 40} L${i * 190 + 120} 640Z"/>`).join('')}</g>
  <g fill="#1d3d29">${Array.from({ length: 7 }, (_, i) => `<rect x="${i * 250 + 30}" y="160" width="${34 + (i % 2) * 14}" height="560" rx="10"/><circle cx="${i * 250 + 50}" cy="170" r="${110 + (i % 3) * 20}"/>`).join('')}</g>
  <path d="M0 720 Q800 650 1600 720 L1600 900 L0 900Z" fill="#8a6a45"/>
  <path d="M0 760 Q800 700 1600 770" stroke="#a4845a" stroke-width="40" fill="none" opacity=".5"/>
  <g class="walk"><g transform="translate(620 0)">
    <!-- 汤团：个子最大，迷彩，大背包 -->
    <g class="bob"><rect x="0" y="560" width="70" height="120" rx="22" fill="#6f7a4e"/><rect x="-22" y="575" width="34" height="80" rx="10" fill="#8a8a5a"/><circle cx="35" cy="530" r="34" fill="#f1c9a5"/><path d="M3 520 Q35 480 67 520 Q50 505 35 506 Q20 505 3 520Z" fill="#7a4a2a"/><rect x="10" y="680" width="20" height="40" rx="6" fill="#4b4f35"/><rect x="40" y="680" width="20" height="40" rx="6" fill="#4b4f35"/></g>
    <!-- 涵涵：紫色外套，高马尾 -->
    <g class="bob" style="animation-delay:.18s" transform="translate(120 30)"><rect x="0" y="560" width="54" height="96" rx="18" fill="#9b5fc0"/><circle cx="27" cy="532" r="27" fill="#f1c9a5"/><path d="M2 525 Q27 492 52 525 Q40 510 27 510 Q14 510 2 525Z" fill="#7a3f22"/><path d="M48 515 Q78 540 66 600" stroke="#7a3f22" stroke-width="12" fill="none" stroke-linecap="round"/><rect x="8" y="656" width="16" height="36" rx="5" fill="#3a2f45"/><rect x="31" y="656" width="16" height="36" rx="5" fill="#3a2f45"/></g>
    <!-- 派派：最小，粉色，遮阳帽 -->
    <g class="bob" style="animation-delay:.33s" transform="translate(220 64)"><rect x="0" y="566" width="46" height="80" rx="16" fill="#e7a1b4"/><circle cx="23" cy="542" r="23" fill="#f1c9a5"/><ellipse cx="23" cy="526" rx="38" ry="9" fill="#e9d7a8"/><path d="M6 524 Q23 500 40 524Z" fill="#e9d7a8"/><rect x="7" y="646" width="13" height="30" rx="5" fill="#8d5a6a"/><rect x="26" y="646" width="13" height="30" rx="5" fill="#8d5a6a"/></g>
  </g></g>
  <g fill="#fff8d0" opacity=".7">${Array.from({ length: 14 }, (_, i) => `<circle class="star" cx="${(i * 311) % 1600}" cy="${200 + ((i * 97) % 400)}" r="3" style="animation-delay:${i * 0.3}s"/>`).join('')}</g>
</g>
<!-- 6 峡谷上断掉的吊桥 -->
<g class="sc sc-bridge">
  <rect width="1600" height="900" fill="url(#iDay)"/>
  <path d="M0 380 L560 420 L600 900 L0 900Z" fill="#5b5a48"/><path d="M1600 380 L1040 420 L1000 900 L1600 900Z" fill="#5b5a48"/>
  <path d="M0 380 L560 420 L540 470 L0 440Z" fill="#3f6b45"/><path d="M1600 380 L1040 420 L1060 470 L1600 440Z" fill="#3f6b45"/>
  <rect x="580" y="420" width="440" height="480" fill="#22302a"/><rect x="580" y="700" width="440" height="200" fill="#c9d6d2" opacity=".25" filter="url(#iBlur)"/>
  <rect x="520" y="300" width="16" height="130" fill="#6b4a2a"/><rect x="1064" y="300" width="16" height="130" fill="#6b4a2a"/>
  <g class="sway"><path d="M536 330 Q640 420 700 560" stroke="#a9875a" stroke-width="6" fill="none"/>${Array.from({ length: 6 }, (_, i) => `<rect x="${560 + i * 22}" y="${380 + i * 34}" width="44" height="10" rx="2" fill="#8a6a45" transform="rotate(${50 - i * 4} ${560 + i * 22} ${380 + i * 34})"/>`).join('')}</g>
  <path d="M1064 330 Q980 400 950 470" stroke="#a9875a" stroke-width="6" fill="none"/>
</g>
</g></svg>`;

export function setupIntro() {
  const params = new URLSearchParams(location.search);
  const skipAnim = params.get('intro') === '0' || (navigator.webdriver && params.get('intro') !== '1');
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const card = document.querySelector('#title .card') as HTMLElement;
  const startBtn = document.getElementById('start') as HTMLButtonElement;
  const keylist = card.querySelector('.keylist');
  // 简介卡：标题、故事、三个人、操作说明（折叠）、开始按钮 + 加载进度
  card.querySelector('.tag')!.textContent = '3D 冒险 · 第一章';
  card.querySelector('h1')!.textContent = '奇幻岛';
  card.querySelector('p')!.innerHTML = '奇幻岛中央的大树一天比一天暗。很久以前，造岛的「点灯人」给每一扇门都留了两把锁——<b>一个人打不开的门，是留给朋友的。</b>三个好朋友决定一起出发，把大树的光找回来。';
  const chars = document.createElement('div'); chars.className = 'intro-chars';
  chars.innerHTML = '<div><b>汤团</b>力气最大，能推开大石头、拉动绞盘。</div><div><b>涵涵</b>会指挥大家，派伙伴守住机关、一起喊口令。</div><div><b>派派</b>观察最仔细，能发现别人看不到的痕迹。</div>';
  card.querySelector('p')!.after(chars);
  if (keylist) { const d = document.createElement('details'); d.innerHTML = '<summary>操作说明</summary>'; keylist.replaceWith(d); d.appendChild(keylist); }
  const ld = document.createElement('div'); ld.className = 'ld'; ld.textContent = '正在准备森林…';
  startBtn.disabled = false; startBtn.textContent = '开始冒险';
  const hasSave = !!readChapter('ch1');
  let fresh: HTMLButtonElement | null = null;
  if (hasSave) {
    startBtn.textContent = '继续冒险';
    fresh = document.createElement('button'); fresh.className = 'ghost'; fresh.textContent = '从头开始（看开场动画）';
    fresh.style.cssText = 'background:#e4dabd;color:#24382b';
    startBtn.after(fresh);
  }
  (fresh ?? startBtn).after(ld);

  let progress = 0, label = '正在准备森林';
  let opts: StartOpts | null = null, envOk = false, choice: boolean | null = null, animDone = false;
  let overlay: HTMLDivElement | null = null, barEl: HTMLElement | null = null, loadText: HTMLElement | null = null;
  const paint = () => {
    const pct = Math.round(progress * 100);
    ld.textContent = opts && envOk ? '森林准备好了' : `${label}… ${pct}%`;
    if (barEl) barEl.style.width = pct + '%';
    if (loadText) loadText.textContent = opts && envOk ? '' : `${label}… ${pct}%`;
  };
  const tryEnter = () => {
    if (choice === null || !animDone || !opts || !envOk) return;
    const o = opts; const resume = choice; choice = null;
    if (overlay) { overlay.style.transition = 'opacity .8s'; overlay.style.opacity = '0'; const ov = overlay; setTimeout(() => ov.remove(), 850); overlay = null; }
    if (!resume) o.clearSave();
    o.start(resume);
  };

  function playIntro() {
    overlay = document.createElement('div'); overlay.id = 'intro';
    overlay.innerHTML = SVG + '<div class="cap"></div><div class="ch"><div><small>第一章</small><b>吊桥重新相连</b></div></div><button class="skip">跳过 ›</button><div class="load"><span></span><div class="bar"><i></i></div></div>';
    document.body.appendChild(overlay);
    barEl = overlay.querySelector('.bar i'); loadText = overlay.querySelector('.load span'); paint();
    const cap = overlay.querySelector('.cap') as HTMLElement, ch = overlay.querySelector('.ch') as HTMLElement;
    const groups = (cls: string) => overlay!.querySelectorAll<SVGGElement>('.' + cls);
    let i = 0; let timer = 0; let stopped = false;
    const finish = () => {
      if (stopped) return; stopped = true; clearTimeout(timer);
      cap.classList.remove('on'); overlay?.querySelectorAll('.sc.on').forEach((g) => g.classList.add('on'));
      ch.classList.add('on');
      (overlay!.querySelector('.skip') as HTMLElement).hidden = true;
      // 片名停 2.4 秒；加载没好就一直停在片名上显示进度
      setTimeout(() => { animDone = true; tryEnter(); }, 2400);
    };
    const step = () => {
      if (stopped) return;
      if (i >= SCENES.length) { overlay?.querySelectorAll('.sc').forEach((g) => g.classList.remove('on')); groups('sc-bridge').forEach((g) => g.classList.add('on')); finish(); return; }
      const s = SCENES[i];
      overlay!.querySelectorAll('.sc').forEach((g) => { if (!g.classList.contains(s.cls)) g.classList.remove('on'); });
      groups(s.cls).forEach((g) => g.classList.add('on'));
      if (s.cls === 'sc-dim') overlay!.classList.add('dimming');
      if (s.cls === 'sc-dim') overlay!.querySelectorAll<SVGGElement>('.fog').forEach((f) => (f.style.transition = 'opacity 3s', f.style.opacity = '1'));
      cap.classList.remove('on');
      cap.textContent = s.text; void cap.offsetWidth; cap.classList.add('on');
      i++; timer = window.setTimeout(step, s.dur * 1000);
    };
    (overlay.querySelector('.skip') as HTMLElement).onclick = () => finish();
    step();
  }
  function waitScreen() {
    // 继续冒险：不放动画，只显示片名和进度
    playIntro(); const o = overlay!; o.querySelectorAll('.sc').forEach((g) => g.classList.remove('on'));
    (o.querySelector('.skip') as HTMLElement).click();
  }
  const go = (resume: boolean) => {
    choice = resume;
    (document.getElementById('title') as HTMLElement).hidden = true;
    if (skipAnim) { animDone = true; if (!(opts && envOk)) waitScreen(); tryEnter(); return; }
    if (resume) waitScreen(); else playIntro();
    tryEnter();
  };
  startBtn.addEventListener('click', () => go(hasSave));
  fresh?.addEventListener('click', () => go(false));

  return {
    /** 加载进度 0–1 */
    setProgress(p: number, text?: string) { progress = Math.max(progress, Math.min(1, p)); if (text) label = text; paint(); },
    /** 角色和关卡都好了（boot 走到最后） */
    ready(o: StartOpts) { opts = o; paint(); tryEnter(); setTimeout(() => { if (!envOk) { envOk = true; console.warn('森林加载超过 3 分钟，先进入游戏，剩下的边走边加载'); tryEnter(); } }, 180000); },
    /** 森林场景（清单）全部加载好 */
    envReady() { envOk = true; progress = 1; paint(); tryEnter(); },
    hasSave,
  };
}
