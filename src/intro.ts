// 入口简介 + 整个游戏的开场动画（用户 11-08：讲的是整个游戏故事的背景，不是第一章简介；选「程序动画做精细」）。
// 进页面立刻显示游戏简介，「开始冒险」按钮不必等加载；点下去先放开场动画，动画放着的同时后台加载角色和森林。
// 动画放完（或点「跳过」）如果还没加载完，就停在片名上显示进度，等加载好再进游戏。?intro=0 或自动测试时跳过动画。
import { readChapter } from './runtime/chapter_save';
import { SCENES, CSS, SVG } from './intro_scenes';

type StartOpts = { start: (resume: boolean) => void; clearSave: () => void };
const TITLE_CSS = `
#title .intro-chars{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
#title .intro-chars div{background:#ece2c4;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.55;color:var(--ink-soft)}
#title .intro-chars b{display:block;color:var(--ink);font-size:15px;margin-bottom:2px}
#title details summary{cursor:pointer;color:var(--ink-soft);font-size:14px}
#title .ld{font-size:12px;color:var(--ink-soft);letter-spacing:.06em}
@media (max-width:520px){#title .intro-chars{grid-template-columns:1fr}}
`;

export function setupIntro() {
  const params = new URLSearchParams(location.search);
  const skipAnim = params.get('intro') === '0' || (navigator.webdriver && params.get('intro') !== '1');
  const style = document.createElement('style'); style.textContent = CSS + TITLE_CSS; document.head.appendChild(style);
  const card = document.querySelector('#title .card') as HTMLElement;
  const startBtn = document.getElementById('start') as HTMLButtonElement;
  const keylist = card.querySelector('.keylist');
  // 简介卡：标题、故事、三个人、操作说明（折叠）、开始按钮 + 加载进度
  card.querySelector('.tag')!.textContent = '3D 冒险 · 八个人的奇幻岛';
  card.querySelector('h1')!.textContent = '奇幻岛';
  card.querySelector('p')!.innerHTML = '奇幻岛中央的大树一天比一天暗。很久以前，造岛的「点灯人」给每一扇门都留了两把锁——<b>一个人打不开的门，是留给朋友的。</b>这个夏天，八个好朋友来到岛上，要一起把八片光之叶重新点亮。第一章，汤团、涵涵和派派先出发：';
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

  let onBegin: (() => void) | null = null;
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
    overlay = document.createElement('div'); overlay.id = 'intro'; overlay.className = 'bars';
    try { onBegin?.(); } catch { /* */ }
    overlay.innerHTML = SVG + '<div class="vig"></div><div class="cap"></div><div class="ch"><div><small class="chs">一个人打不开的门，是留给朋友的</small><b class="chb">奇幻岛</b></div></div><button class="skip">跳过 ›</button><div class="load"><span></span><div class="bar"><i></i></div></div>';
    document.body.appendChild(overlay);
    barEl = overlay.querySelector('.bar i'); loadText = overlay.querySelector('.load span'); paint();
    const cap = overlay.querySelector('.cap') as HTMLElement, ch = overlay.querySelector('.ch') as HTMLElement;
    const groups = (cls: string) => overlay!.querySelectorAll<SVGGElement>('.sc-' + cls);
    let i = 0; let timer = 0; let stopped = false;
    const finish = () => {
      if (stopped) return; stopped = true; clearTimeout(timer);
      cap.classList.remove('on'); overlay?.querySelectorAll('.sc.on').forEach((g) => g.classList.add('on'));
      ch.classList.add('on');
      (overlay!.querySelector('.skip') as HTMLElement).hidden = true;
      // 游戏片名停 3 秒，新游戏再换成第一章章名停 2.4 秒；加载没好就一直停在章名上显示进度
      const chapter = () => { const sm = ch.querySelector('.chs') as HTMLElement, bb = ch.querySelector('.chb') as HTMLElement; ch.classList.remove('on'); setTimeout(() => { sm.textContent = '第一章'; bb.textContent = '吊桥重新相连'; ch.classList.add('on', 'chap'); }, 900); };
      if (choice === false) { setTimeout(chapter, 3000); setTimeout(() => { animDone = true; tryEnter(); }, 5400); }
      else setTimeout(() => { animDone = true; tryEnter(); }, 2400);
    };
    const step = () => {
      if (stopped) return;
      if (i >= SCENES.length) { finish(); return; }
      const s = SCENES[i];
      overlay!.querySelectorAll('.sc').forEach((g) => { if (!g.classList.contains('sc-' + s.cls)) g.classList.remove('on'); });
      groups(s.cls).forEach((g) => g.classList.add('on'));
      overlay!.classList.add('s-' + s.cls);
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
    /** 开场动画开始时调用（用户点了按钮，可以开声音） */
    onBegin(f: () => void) { onBegin = f; },
  };
}
