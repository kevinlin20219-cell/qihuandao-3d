// 入口简介 + 整个游戏的开场动画（用户 11-08：讲的是整个游戏故事的背景，不是第一章简介；选「程序动画做精细」）。
// 进页面立刻显示游戏简介，「开始冒险」按钮不必等加载；点下去先放开场动画，动画放着的同时后台加载角色和森林。
// 动画放完（或点「跳过」）如果还没加载完，就停在片名上显示进度，等加载好再进游戏。?intro=0 或自动测试时跳过动画。
import { readChapter } from './runtime/chapter_save';
import { mountPaperIntro, prefetchIntroVoice, type PaperIntro } from './intro_paper.js';

const PAPER_CSS = `
#intro{position:fixed;inset:0;z-index:60;background:#050b08;color:#fff6df;overflow:hidden}
#intro canvas{position:absolute;inset:0;width:100%;height:100%;display:block;filter:saturate(1.08) contrast(1.04)}
#intro .pi-grain{position:absolute;inset:0;pointer-events:none;z-index:1;opacity:.32;mix-blend-mode:multiply;background-size:256px 256px}
#intro .pi-vig{position:absolute;inset:0;pointer-events:none;z-index:2;background:radial-gradient(ellipse 78% 72% at 50% 48%,transparent 58%,rgba(0,0,0,.5))}
#intro .pi-bar{position:absolute;left:0;right:0;height:8vh;background:#000;z-index:3}
#intro .pi-bar.t{top:0}#intro .pi-bar.b{bottom:0}
#intro .pi-cap{position:absolute;left:50%;bottom:calc(8vh + 22px);transform:translateX(-50%);width:min(940px,90vw);text-align:center;font-family:"Kaiti SC","STKaiti","KaiTi","BiauKai",serif;font-size:clamp(16px,2.25vw,26px);line-height:1.75;letter-spacing:.08em;text-shadow:0 2px 12px rgba(0,0,0,.95),0 0 3px #000;opacity:0;transition:opacity .8s;z-index:4}
#intro .pi-cap.on{opacity:1}#intro .pi-cap.top{bottom:auto;top:calc(8vh + 22px)}
#intro .pi-btn{position:absolute;z-index:6;appearance:none;border:1px solid rgba(246,239,220,.5);background:rgba(0,0,0,.35);color:#fff6df;border-radius:999px;padding:8px 18px;font:15px inherit;cursor:pointer}
#intro .pi-btn:hover{background:rgba(0,0,0,.55)}
#intro .pi-skip{right:16px;top:calc(8vh + 12px)}
#intro .pi-snd{right:16px;bottom:calc(8vh + 12px);width:42px;height:42px;padding:0;font-size:18px}
#intro .pi-load{position:absolute;left:50%;bottom:calc(8vh - 30px);transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:10px;font-size:12px;color:rgba(255,246,223,.75);opacity:.55;transition:opacity .6s}
#intro .pi-load .bar{width:160px;height:4px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden}
#intro .pi-load .bar i{display:block;height:100%;width:0;background:#e2b45a;transition:width .3s}
#intro.ended .pi-load{opacity:1;bottom:calc(8vh + 26px)}
`;
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
  if (!skipAnim && params.get('introvoice') !== '0') prefetchIntroVoice('audio/intro/');
  const style = document.createElement('style'); style.textContent = PAPER_CSS + TITLE_CSS; document.head.appendChild(style);
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
  let overlay: HTMLDivElement | null = null, barEl: HTMLElement | null = null, loadText: HTMLElement | null = null, player: PaperIntro | null = null;
  const paint = () => {
    const pct = Math.round(progress * 100);
    ld.textContent = opts && envOk ? '森林准备好了' : `${label}… ${pct}%`;
    if (barEl) barEl.style.width = pct + '%';
    if (loadText) loadText.textContent = opts && envOk ? '' : `${label}… ${pct}%`;
  };
  const tryEnter = () => {
    if (choice === null || !animDone || !opts || !envOk) return;
    const o = opts; const resume = choice; choice = null;
    if (overlay) { overlay.style.transition = 'opacity .8s'; overlay.style.opacity = '0'; const ov = overlay, pl = player; setTimeout(() => { pl?.stop(); ov.remove(); }, 850); overlay = null; player = null; }
    if (!resume) o.clearSave();
    o.start(resume);
  };

  // 剪纸开场动画（intro_paper.js，由预览页同一份代码生成）+ 旁白（Codex 20261108_intro_narration_selected_v001）
  function mount(play: boolean) {
    overlay = document.createElement('div'); overlay.id = 'intro';
    overlay.innerHTML = '<canvas class="pi-c"></canvas><div class="pi-grain"></div><div class="pi-vig"></div><div class="pi-bar t"></div><div class="pi-bar b"></div><div class="pi-cap"></div>'
      + '<button class="pi-btn pi-skip">跳过 ›</button><button class="pi-btn pi-snd" title="声音"></button><div class="pi-load"><span></span><div class="bar"><i></i></div></div>';
    document.body.appendChild(overlay);
    barEl = overlay.querySelector('.pi-load .bar i'); loadText = overlay.querySelector('.pi-load span'); paint();
    let muted = false; try { muted = localStorage.getItem('qhd_mute') === '1'; } catch { /* */ }
    const ov = overlay;
    const p = player = mountPaperIntro(ov, {
      audioBase: 'audio/intro/', muted, voice: params.get('introvoice') !== '0',
      onMute: (m) => { try { localStorage.setItem('qhd_mute', m ? '1' : '0'); } catch { /* */ } },
      onEnd: () => { ov.classList.add('ended'); (ov.querySelector('.pi-skip') as HTMLElement).hidden = true; animDone = true; tryEnter(); },
    });
    (ov.querySelector('.pi-skip') as HTMLElement).onclick = (e) => { e.stopPropagation(); p.skip(); };
    if (play) { try { onBegin?.(); } catch { /* */ } p.start(0); } else p.skip();
  }
  const playIntro = () => mount(true);
  const waitScreen = () => mount(false); // 继续冒险：不放动画，停在章名卡上显示进度
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
