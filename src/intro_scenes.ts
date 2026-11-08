// 开场动画的画面（用户 11-08 选「程序动画做精细」）：讲整个游戏的背景故事。
// 纯 SVG + CSS，不下载任何资源。每一幕自带镜头运动（推、摇）、前中后景分层、光晕和粒子；
// 幕与幕之间 1.6 秒交叉淡化，上下电影遮幅，四周暗角。
export const SCENES: { cls: string; text: string; dur: number }[] = [
  { cls: 'island', text: '很久很久以前，海的中间有一座奇幻岛。岛的正中央长着一棵大树，枝头的八片「光之叶」把整座岛照得亮亮的。', dur: 8 },
  { cls: 'builders', text: '第一批来到岛上的孩子，被叫作「点灯人」。他们造了吊桥、水闸、灯塔、温室和水源站。', dur: 8 },
  { cls: 'door', text: '每一台机关都装了好几处开关，要几个人同时按下才会打开。机关上都刻着同一句话——', dur: 7.5 },
  { cls: 'motto', text: '「一个人打不开的门，是留给朋友的。」', dur: 5.5 },
  { cls: 'leave', text: '后来，点灯人长大了，一个一个坐船离开。再也没有一群人一起来照看大树。', dur: 8 },
  { cls: 'dim', text: '大树一个人撑着，越来越累。光之叶一片片暗了下去，累意化成了雾——雾会把走在一起的人分开。', dur: 9 },
  { cls: 'eight', text: '这个夏天，八个好朋友来到了奇幻岛。', dur: 7 },
  { cls: 'goal', text: '他们要一起穿过森林、河流和浓雾，把八片光之叶重新点亮。', dur: 8.5 },
];

const rnd = (i: number, k = 1) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const R = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('');

/** 大树（树干渐变 + 多层树冠：暗底、中间、亮顶 + 边缘高光）；leaves=八片光之叶 */
function bigTree(cx: number, cy: number, s: number, leafCls = 'leafG') {
  const blobs = [[0, 0, 1], [-0.85, 0.35, 0.68], [0.85, 0.35, 0.68], [-0.45, -0.55, 0.66], [0.45, -0.55, 0.66], [0, -0.85, 0.55], [-1.2, -0.05, 0.5], [1.2, -0.05, 0.5]];
  const lay = (dy: number, fill: string, k: number) => blobs.map(([x, y, r]) => `<circle cx="${cx + x * 100 * s}" cy="${cy + y * 85 * s + dy}" r="${r * 92 * s * k}" fill="${fill}"/>`).join('');
  const leaves = R(8, (i) => { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; const x = cx + Math.cos(a) * 118 * s, y = cy - 10 * s + Math.sin(a) * 80 * s; return `<g transform="translate(${x} ${y}) rotate(${(a * 180) / Math.PI + 90}) scale(${s})"><path class="${leafCls}" style="--d:${i}" d="M0 -17 C12 -7 12 7 0 17 C-12 7 -12 -7 0 -17Z"/></g>`; });
  return `<path d="M${cx - 18 * s} ${cy + 260 * s} C${cx - 14 * s} ${cy + 160 * s} ${cx - 34 * s} ${cy + 90 * s} ${cx - 50 * s} ${cy + 40 * s} L${cx + 50 * s} ${cy + 40 * s} C${cx + 34 * s} ${cy + 90 * s} ${cx + 14 * s} ${cy + 160 * s} ${cx + 18 * s} ${cy + 260 * s}Z" fill="url(#gTrunk)"/>
  <path d="M${cx - 20 * s} ${cy + 80 * s} Q${cx - 70 * s} ${cy + 40 * s} ${cx - 110 * s} ${cy + 30 * s} M${cx + 16 * s} ${cy + 90 * s} Q${cx + 70 * s} ${cy + 50 * s} ${cx + 120 * s} ${cy + 40 * s}" stroke="#3b2a1a" stroke-width="${10 * s}" fill="none" stroke-linecap="round"/>
  ${lay(18 * s, '#1f4a2c', 1.02)}${lay(0, '#2f6a3c', 0.96)}${lay(-14 * s, '#4c8c4e', 0.78)}${lay(-26 * s, '#7cb35e', 0.42)}
  ${leaves}`;
}

/** 孩子（头、头发、身体带明暗、腿；h=身高 cm） */
function kid(x: number, ground: number, h: number, body: string, hair: string, extra = '') {
  const s = h / 150;
  return `<g transform="translate(${x} ${ground - 196 * s}) scale(${s})"><g class="bob" style="animation-delay:${rnd(x) * 0.5}s">
  <ellipse cx="28" cy="196" rx="34" ry="7" fill="#000" opacity=".18"/>
  <rect x="8" y="158" width="16" height="36" rx="6" fill="#3d3a30"/><rect x="32" y="158" width="16" height="36" rx="6" fill="#3d3a30"/>
  <rect x="0" y="62" width="56" height="102" rx="22" fill="${body}"/><rect x="0" y="62" width="22" height="102" rx="12" fill="#fff" opacity=".12"/><rect x="34" y="70" width="22" height="94" rx="12" fill="#000" opacity=".12"/>
  <circle cx="28" cy="36" r="29" fill="#f3cfae"/><circle cx="18" cy="40" r="2.6" fill="#3b2c1c"/><circle cx="38" cy="40" r="2.6" fill="#3b2c1c"/><path d="M22 50 Q28 55 34 50" stroke="#a0522d" stroke-width="2" fill="none"/><circle cx="12" cy="48" r="5" fill="#f2a08a" opacity=".5"/><circle cx="44" cy="48" r="5" fill="#f2a08a" opacity=".5"/>
  <path d="M-3 40 Q-6 4 28 2 Q62 4 59 40 Q54 22 44 18 Q30 26 12 18 Q2 24 -3 40Z" fill="${hair}"/>${extra}</g></g>`;
}

export const CSS = `
#intro{position:fixed;inset:0;z-index:40;background:#050b08;color:#f6efdc;overflow:hidden;font-family:var(--font)}
#intro svg.stage{position:absolute;inset:0;width:100%;height:100%}
#intro .sc{opacity:0;transition:opacity 1.6s ease}
#intro .sc.on{opacity:1}
#intro .mv{transform-box:view-box;transform-origin:800px 450px}
#intro .sc.on .mv{animation:var(--cam) var(--t,9s) cubic-bezier(.3,0,.4,1) forwards}
@keyframes camIn{from{transform:scale(1.02)}to{transform:scale(1.14) translateY(14px)}}
@keyframes camPanR{from{transform:translateX(70px) scale(1.08)}to{transform:translateX(-70px) scale(1.08)}}
@keyframes camUp{from{transform:translateY(-40px) scale(1.1)}to{transform:translateY(20px) scale(1.04)}}
@keyframes camOut{from{transform:scale(1.18)}to{transform:scale(1.02)}}
@keyframes camPanL{from{transform:translateX(-60px) scale(1.06)}to{transform:translateX(60px) scale(1.06)}}
#intro .px1{animation:drift 30s linear infinite alternate}
#intro .px2{animation:drift 22s linear infinite alternate-reverse}
@keyframes drift{from{transform:translateX(-30px)}to{transform:translateX(30px)}}
#intro.bars::before,#intro.bars::after{content:'';position:absolute;left:0;right:0;height:9vh;background:#000;z-index:3}
#intro.bars::before{top:0}#intro.bars::after{bottom:0}
#intro .vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 70% at 50% 48%,transparent 55%,rgba(0,0,0,.55));z-index:2}
#intro .cap{position:absolute;left:50%;bottom:calc(9vh + 26px);transform:translateX(-50%);width:min(900px,88vw);text-align:center;font-size:clamp(17px,2.3vw,26px);line-height:1.7;letter-spacing:.08em;color:#fff6df;text-shadow:0 2px 14px rgba(0,0,0,.95),0 0 2px #000;background:radial-gradient(ellipse 60% 100% at 50% 50%,rgba(0,0,0,.5),transparent 75%);padding:10px 40px;box-sizing:border-box;opacity:0;transition:opacity .8s ease;z-index:4}
#intro .cap.on{opacity:1}
#intro.s-eight:not(.s-goal) .cap{bottom:auto;top:calc(9vh + 30px)}
#intro .ch{position:absolute;inset:0;display:grid;place-items:center;text-align:center;opacity:0;transition:opacity 1.4s ease;pointer-events:none;z-index:4}
#intro .ch.on{opacity:1}
#intro .ch small{display:block;font-size:clamp(13px,1.5vw,17px);letter-spacing:.42em;color:#ffe08a;margin-bottom:16px;text-shadow:0 2px 10px #000}
#intro .ch b{font-size:clamp(44px,8vw,96px);font-weight:700;letter-spacing:.22em;color:#fff4d0;text-shadow:0 0 28px rgba(255,214,110,.75),0 4px 18px rgba(0,0,0,.8)}
#intro .ch.chap b{font-size:clamp(30px,5vw,58px);letter-spacing:.14em}
#intro .skip{position:absolute;right:22px;top:calc(9vh + 14px);appearance:none;border:1px solid rgba(246,239,220,.45);background:rgba(0,0,0,.3);color:#f6efdc;border-radius:999px;padding:7px 16px;font:14px var(--font);cursor:pointer;z-index:5}
#intro .skip:hover{background:rgba(0,0,0,.5)}
#intro .load{position:absolute;left:50%;bottom:calc(9vh - 30px);transform:translateX(-50%);width:min(360px,70vw);font-size:12px;color:rgba(246,239,220,.75);text-align:center;letter-spacing:.08em;z-index:5}
#intro .bar{height:3px;background:rgba(246,239,220,.18);border-radius:2px;margin-top:6px;overflow:hidden}
#intro .bar i{display:block;height:100%;width:0;background:#e2b45a;transition:width .4s ease}
#intro .tw{animation:tw 3s ease-in-out infinite}
@keyframes tw{0%,100%{opacity:.2}50%{opacity:1}}
#intro .pulse{animation:pulse 4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.8}50%{opacity:1}}
#intro .fly{animation:fly var(--fd,9s) linear infinite;animation-delay:var(--fdl,0s)}
@keyframes fly{0%{transform:translate(0,0);opacity:0}15%{opacity:1}85%{opacity:.9}100%{transform:translate(var(--fx,20px),-260px);opacity:0}}
#intro .wave{animation:wave 6s ease-in-out infinite alternate}
@keyframes wave{to{transform:translateX(-60px)}}
#intro .glint{animation:tw 2.2s ease-in-out infinite}
#intro .bob{animation:bob .55s ease-in-out infinite alternate}
@keyframes bob{to{transform:translateY(-5px)}}
#intro .walkL{animation:walk 9s linear forwards}
@keyframes walk{from{transform:translateX(-120px)}to{transform:translateX(120px)}}
#intro .lamp{animation:pulse 2.2s ease-in-out infinite}
#intro .leafG{fill:#ffe68a;filter:url(#fGlow)}
#intro .leafX{display:none}
#intro.s-dim .leafG{animation:leafOff 1s ease forwards;animation-delay:calc(var(--d) * .7s + .8s)}
@keyframes leafOff{to{fill:#3a5a3a;filter:none}}
#intro.s-dim .halo{animation:haloOff 6s ease forwards}
@keyframes haloOff{to{opacity:.12}}
#intro .fog{opacity:0;transition:opacity 4s ease}
#intro.s-dim .fog{opacity:1}
#intro .fogm{animation:fogm 16s ease-in-out infinite alternate}
@keyframes fogm{from{transform:translateX(-140px)}to{transform:translateX(140px)}}
#intro .boat{opacity:0}
#intro.s-leave .boat{opacity:1;animation:sail 9s linear forwards}
@keyframes sail{from{transform:translate(0,0) scale(1)}to{transform:translate(380px,-18px) scale(.42)}}
#intro .carve{stroke-dasharray:1600;stroke-dashoffset:1600}
#intro .sc-door.on .carve{animation:carve 6s ease forwards}
@keyframes carve{to{stroke-dashoffset:0}}
#intro .motto{opacity:0;transition:opacity 1.6s ease}
#intro.s-motto .motto{opacity:1}
#intro .slot{fill:rgba(20,40,25,.6);stroke:#ffe58a;stroke-width:2.5;stroke-dasharray:5 4}
#intro .lit{fill:#ffe68a;opacity:0;filter:url(#fGlow)}
#intro .sc-goal.on .lit{animation:lit .7s ease forwards;animation-delay:calc(var(--d) * .75s + 1s)}
@keyframes lit{0%{opacity:0;transform:scale(.3)}70%{opacity:1;transform:scale(1.25)}100%{opacity:1;transform:scale(1)}}
#intro .ray{opacity:0}
#intro .sc-goal.on .ray{animation:ray 3s ease forwards 6.5s}
@keyframes ray{to{opacity:.55}}
#intro .rays{transform-origin:800px 400px;animation:spin 60s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
`;

const DEFS = `<defs>
<linearGradient id="gNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1730"/><stop offset=".55" stop-color="#1c3556"/><stop offset="1" stop-color="#2d4d6a"/></linearGradient>
<linearGradient id="gDusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2a52"/><stop offset=".45" stop-color="#b8607a"/><stop offset=".75" stop-color="#f2a65a"/><stop offset="1" stop-color="#ffd58a"/></linearGradient>
<linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fc3d8"/><stop offset=".6" stop-color="#f6d9a0"/><stop offset="1" stop-color="#f3b874"/></linearGradient>
<linearGradient id="gMorning" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec9e6"/><stop offset=".7" stop-color="#d9eef0"/><stop offset="1" stop-color="#fff4d6"/></linearGradient>
<linearGradient id="gSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#21466a"/><stop offset="1" stop-color="#07131f"/></linearGradient>
<linearGradient id="gSeaDusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c77a6a"/><stop offset=".3" stop-color="#5a4a6a"/><stop offset="1" stop-color="#1a1a30"/></linearGradient>
<linearGradient id="gSeaDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4aa6c8"/><stop offset="1" stop-color="#2a6f94"/></linearGradient>
<linearGradient id="gTrunk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1c10"/><stop offset=".45" stop-color="#6b4a2a"/><stop offset="1" stop-color="#2a1c10"/></linearGradient>
<linearGradient id="gStone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a39a83"/><stop offset=".6" stop-color="#6d6555"/><stop offset="1" stop-color="#3f3a30"/></linearGradient>
<linearGradient id="gSand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1dcaa"/><stop offset="1" stop-color="#d4b47a"/></linearGradient>
<radialGradient id="gHalo"><stop offset="0" stop-color="#fff6c2" stop-opacity=".95"/><stop offset=".3" stop-color="#ffd76a" stop-opacity=".5"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient>
<radialGradient id="gSun"><stop offset="0" stop-color="#fff8dc"/><stop offset=".25" stop-color="#ffe2a0" stop-opacity=".9"/><stop offset="1" stop-color="#ffb060" stop-opacity="0"/></radialGradient>
<radialGradient id="gMoon"><stop offset="0" stop-color="#fffbe8"/><stop offset=".6" stop-color="#f4ecc8"/><stop offset="1" stop-color="#f4ecc8" stop-opacity="0"/></radialGradient>
<filter id="fGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="fSoft"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="fFar"><feGaussianBlur stdDeviation="1.6"/></filter>
<filter id="fFog" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="26"/></filter>
</defs>`;

const stars = (n: number, maxY: number) => R(n, (i) => `<circle class="tw" cx="${(rnd(i) * 1700) | 0}" cy="${(rnd(i, 2) * maxY) | 0}" r="${(0.6 + rnd(i, 3) * 1.6).toFixed(1)}" fill="#fff" style="animation-delay:${(rnd(i, 4) * 3).toFixed(2)}s"/>`);
const flies = (n: number, y0: number, y1: number, col = '#ffe9a0') => R(n, (i) => `<circle class="fly" cx="${(rnd(i, 5) * 1600) | 0}" cy="${(y0 + rnd(i, 6) * (y1 - y0)) | 0}" r="${(1.5 + rnd(i, 7) * 2.5).toFixed(1)}" fill="${col}" filter="url(#fGlow)" style="--fd:${(7 + rnd(i, 8) * 7).toFixed(1)}s;--fdl:${(-rnd(i, 9) * 10).toFixed(1)}s;--fx:${((rnd(i, 10) - 0.5) * 120) | 0}px"/>`);
const hills = (y: number, amp: number, fill: string, seed: number, extra = '') => { let d = `M-100 900 L-100 ${y}`; for (let x = -100; x <= 1700; x += 100) d += ` Q${x + 50} ${y - amp * (0.4 + rnd(x, seed))} ${x + 100} ${y - amp * 0.3 * rnd(x + 7, seed)}`; return `<path d="${d} L1700 900Z" fill="${fill}" ${extra}/>`; };
const treeline = (y: number, fill: string, seed: number, h = 60) => R(40, (i) => { const x = i * 44 - 40 + rnd(i, seed) * 20, r = h * (0.5 + rnd(i, seed + 1) * 0.6); return `<circle cx="${x}" cy="${y - r * 0.6}" r="${r}" fill="${fill}"/>`; }) + `<rect x="-50" y="${y - 10}" width="1700" height="${900 - y + 10}" fill="${fill}"/>`;

/** 第 1、5、6 幕共用的海岛（夜、黄昏、雾夜由幕的 class 控制） */
const ISLAND = (sky: string, sea: string, night: boolean) => `
  <rect width="1600" height="900" fill="url(#${sky})"/>
  ${night ? stars(110, 470) + '<circle cx="1260" cy="150" r="70" fill="url(#gMoon)"/><circle cx="1260" cy="150" r="34" fill="#fffbe8"/>' : '<circle cx="1180" cy="560" r="230" fill="url(#gSun)"/><circle cx="1180" cy="560" r="64" fill="#fff1c4"/>'}
  <g class="px1" filter="url(#fFar)">${hills(560, 70, night ? '#16283c' : '#6a4a6a', 3)}</g>
  <rect y="575" width="1600" height="325" fill="url(#${sea})"/>
  <g class="wave" opacity=".55">${R(18, (i) => `<path d="M${(rnd(i, 11) * 1700 - 80) | 0} ${600 + i * 16} h${40 + ((rnd(i, 12) * 140) | 0)}" stroke="${night ? '#8fb4d0' : '#ffd9a0'}" stroke-width="2" stroke-linecap="round" class="glint" style="animation-delay:${(rnd(i, 13) * 2).toFixed(2)}s"/>`)}</g>
  ${night ? '' : '<path d="M1150 590 L1210 590 L1300 900 L1060 900Z" fill="#ffe0a0" opacity=".25"/>'}
  <ellipse cx="800" cy="612" rx="430" ry="44" fill="${night ? '#0a1a10' : '#2a2030'}"/>
  <path d="M370 612 Q470 520 600 540 Q700 470 800 470 Q900 470 1000 540 Q1130 520 1230 612Z" fill="${night ? '#1d4a2c' : '#4a3a48'}"/>
  ${R(14, (i) => { const x = 450 + i * 52 + rnd(i, 21) * 20, r = 22 + rnd(i, 22) * 18; return `<circle cx="${x}" cy="${560 - Math.sin((i / 13) * Math.PI) * 50}" r="${r}" fill="${night ? '#24583a' : '#5a4458'}"/>`; })}
  <g class="halo"><circle cx="800" cy="360" r="330" fill="url(#gHalo)" class="pulse"/></g>
  ${bigTree(800, 330, 1)}
  <g class="fog"><g class="fogm"><ellipse cx="560" cy="540" rx="520" ry="80" fill="#d0dad6" opacity=".55" filter="url(#fFog)"/><ellipse cx="1150" cy="500" rx="460" ry="70" fill="#d0dad6" opacity=".45" filter="url(#fFog)"/><ellipse cx="820" cy="610" rx="700" ry="60" fill="#e0e8e4" opacity=".5" filter="url(#fFog)"/></g></g>
  ${night ? flies(26, 300, 600) : ''}`;

export const SVG = `<svg class="stage" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">${DEFS}
<!-- 1 夜里发光的大树 -->
<g class="sc sc-island sc-dim"><g class="mv" style="--cam:camIn;--t:18s">${ISLAND('gNight', 'gSea', true)}</g></g>
<!-- 2 点灯人与他们造的机关（金色傍晚的全景，向右摇） -->
<g class="sc sc-builders"><g class="mv" style="--cam:camPanR;--t:9s">
  <rect x="-200" width="2000" height="900" fill="url(#gGold)"/>
  <circle cx="300" cy="420" r="260" fill="url(#gSun)" opacity=".8"/>
  <g filter="url(#fFar)" opacity=".8">${hills(520, 80, '#a7b7a0', 31)}</g>
  ${treeline(600, '#6f9466', 32, 50)}
  ${hills(640, 50, '#5b8a54', 33)}
  <!-- 吊桥 -->
  <path d="M-120 640 L120 600 L150 900 L-120 900Z" fill="#6d6a55"/><path d="M380 600 L560 640 L560 900 L360 900Z" fill="#6d6a55"/>
  <path d="M120 602 Q250 660 380 602" stroke="#7a5a35" stroke-width="12" fill="none"/>${R(11, (i) => { const t = (i + 1) / 12, x = 120 + 260 * t, y = 602 + Math.sin(t * Math.PI) * 58; return `<rect x="${x - 8}" y="${y - 4}" width="16" height="9" fill="#9a7448"/>`; })}
  <path d="M120 560 Q250 616 380 560" stroke="#c9a46a" stroke-width="3" fill="none"/><rect x="113" y="545" width="12" height="62" fill="#5a3a20"/><rect x="375" y="545" width="12" height="62" fill="#5a3a20"/>
  <!-- 水闸 -->
  <rect x="600" y="540" width="190" height="130" rx="4" fill="#7d6a4a"/><rect x="622" y="566" width="146" height="84" fill="#4d3d28"/>${R(5, (i) => `<rect x="${630 + i * 28}" y="572" width="6" height="72" fill="#3a2d1d"/>`)}
  <circle cx="695" cy="520" r="30" fill="#9a8f78" stroke="#5b5440" stroke-width="7"/>${R(8, (i) => `<rect x="692" y="487" width="6" height="14" fill="#5b5440" transform="rotate(${i * 45} 695 520)"/>`)}
  <path d="M600 672 H790 V708 H600Z" fill="#5aa0c8" opacity=".85"/><path d="M610 690 h40 M680 700 h50" stroke="#dff2ff" stroke-width="3" class="glint"/>
  <!-- 灯塔 -->
  <path d="M880 700 L904 400 H952 L976 700Z" fill="#f4ecd6"/><path d="M880 700 L904 400 H928 L920 700Z" fill="#fff" opacity=".35"/>${R(3, (i) => `<path d="M${897 - i * 6} ${470 + i * 80} H${959 + i * 6} V${488 + i * 80} H${897 - i * 6}Z" fill="#c0442b"/>`)}
  <rect x="896" y="366" width="64" height="36" rx="4" fill="#2a2a22"/><circle cx="928" cy="384" r="40" fill="url(#gHalo)" class="lamp"/><circle cx="928" cy="384" r="10" fill="#fff4c0"/><path d="M892 366 L928 336 L964 366Z" fill="#7a2a1a"/>
  <!-- 温室 -->
  <path d="M1040 700 Q1040 552 1160 552 Q1280 552 1280 700Z" fill="#d8f0e6" opacity=".8" stroke="#7a8a7a" stroke-width="4"/><path d="M1085 700 Q1085 598 1160 598 Q1235 598 1235 700 M1160 552 V700 M1040 640 H1280" stroke="#7a8a7a" stroke-width="3" fill="none"/>
  <circle cx="1100" cy="672" r="18" fill="#5aa04a"/><circle cx="1150" cy="664" r="24" fill="#73b85a"/><circle cx="1210" cy="670" r="18" fill="#e7a1b4"/><circle cx="1240" cy="680" r="12" fill="#f2d64a"/>
  <!-- 水源站 -->
  <rect x="1340" y="520" width="130" height="80" rx="16" fill="#8db0c8"/><rect x="1340" y="520" width="130" height="22" rx="10" fill="#a9c8dc"/><rect x="1358" y="600" width="12" height="100" fill="#6b5a40"/><rect x="1440" y="600" width="12" height="100" fill="#6b5a40"/><path d="M1405 600 V700" stroke="#5aa0c8" stroke-width="10"/>
  ${hills(720, 30, '#3f6b45', 34)}
  <!-- 提灯的点灯人 -->
  <g class="walkL">${[[250, '#c99a5a'], [520, '#7aa0c8'], [820, '#9bbf6a'], [1010, '#d48aa6'], [1300, '#e0b050']].map(([x, c]) => `<g transform="translate(${x} 742)"><g class="bob"><ellipse cx="0" cy="12" rx="16" ry="4" fill="#000" opacity=".2"/><circle cx="0" cy="-60" r="14" fill="#f3cfae"/><path d="M-14 -62 Q0 -82 14 -62Z" fill="#5a3a20"/><rect x="-13" y="-47" width="26" height="42" rx="10" fill="${c}"/><rect x="-10" y="-6" width="8" height="18" fill="#3d3a30"/><rect x="2" y="-6" width="8" height="18" fill="#3d3a30"/><path d="M12 -38 L28 -30" stroke="#6b4a2a" stroke-width="3"/><circle cx="30" cy="-22" r="20" fill="url(#gHalo)" class="lamp"/><circle cx="30" cy="-22" r="6" fill="#fff0b0"/></g></g>`).join('')}</g>
  ${flies(18, 450, 760, '#fff1b8')}
</g></g>
<!-- 3、4 刻字的石门 -->
<g class="sc sc-door sc-motto"><g class="mv" style="--cam:camIn;--t:14s">
  <rect width="1600" height="900" fill="#0c1610"/>
  <circle cx="800" cy="430" r="520" fill="url(#gHalo)" opacity=".16"/>
  <g filter="url(#fSoft)" opacity=".7">${treeline(520, '#12261a', 41, 90)}</g>
  <path d="M430 860 L430 330 Q800 70 1170 330 L1170 860 Z" fill="url(#gStone)"/>
  ${R(16, (i) => { const a = Math.PI * (0.08 + (i / 15) * 0.84), x = 800 - Math.cos(a) * 345, y = 360 - Math.sin(a) * 250; return `<path d="M${x} ${y} L${800 - Math.cos(a) * 285} ${360 - Math.sin(a) * 200}" stroke="#4a443a" stroke-width="3"/>`; })}
  <path d="M520 860 L520 380 Q800 180 1080 380 L1080 860 Z" fill="#1e1d17"/>
  ${R(7, (i) => `<path d="M430 ${400 + i * 65} H520 M1080 ${400 + i * 65} H1170" stroke="#4a443a" stroke-width="3"/>`)}
  <path d="M440 330 C400 430 430 540 396 660 C446 580 466 470 490 380Z M1160 330 C1200 440 1170 560 1206 670 C1156 580 1136 470 1112 380Z" fill="#5f8a44"/>${R(12, (i) => `<ellipse cx="${i < 6 ? 410 + rnd(i) * 70 : 1120 + rnd(i) * 70}" cy="${380 + rnd(i, 2) * 300}" rx="16" ry="9" fill="#7bb05a" transform="rotate(${(rnd(i, 3) * 80 - 40) | 0} ${i < 6 ? 440 : 1150} ${500})"/>`)}
  <path class="carve" d="M600 500 C640 440 690 440 730 500 S810 560 850 500 S930 440 970 500 S1010 540 1000 520" stroke="#ffd76a" stroke-width="7" fill="none" stroke-linecap="round" filter="url(#fGlow)"/>
  <path class="carve" d="M640 590 H960 M690 640 H910" stroke="#ffd76a" stroke-width="5" fill="none" stroke-linecap="round" filter="url(#fGlow)" style="animation-delay:1s"/>
  ${R(3, (i) => `<g transform="translate(${640 + i * 160} 760)"><circle r="26" fill="#3a352a" stroke="#8a7a5a" stroke-width="4"/><circle r="12" fill="#ffd76a" class="motto" filter="url(#fGlow)"/></g>`)}
  <g class="motto"><circle cx="800" cy="560" r="300" fill="url(#gHalo)" opacity=".35"/></g>
  ${flies(16, 400, 820)}
</g></g>
<!-- 5 黄昏，点灯人坐船离开 -->
<g class="sc sc-leave"><g class="mv" style="--cam:camPanL;--t:9s">${ISLAND('gDusk', 'gSeaDusk', false)}
  <g class="boat"><g transform="translate(1000 640)"><path d="M0 0 H140 L118 28 H20Z" fill="#5a3a22"/><path d="M8 4 H132" stroke="#7a5a35" stroke-width="3"/><rect x="66" y="-96" width="5" height="96" fill="#e8dcc0"/><path d="M71 -92 L126 -10 H71Z" fill="#f6ecd2"/><path d="M66 -84 L24 -12 H66Z" fill="#e8d8b8"/>
  ${[22, 40, 96, 112].map((x, i) => `<circle cx="${x}" cy="-12" r="9" fill="#f3cfae"/><rect x="${x - 8}" y="-4" width="16" height="10" rx="3" fill="${['#c99a5a', '#7aa0c8', '#9bbf6a', '#d48aa6'][i]}"/><circle cx="${x + 10}" cy="-18" r="9" fill="url(#gHalo)" class="lamp"/>`).join('')}</g></g>
</g></g>
<!-- 7 八个好朋友来到海滩（早晨） -->
<g class="sc sc-eight"><g class="mv" style="--cam:camOut;--t:9s">
  <rect width="1600" height="900" fill="url(#gMorning)"/>
  <circle cx="1300" cy="200" r="200" fill="url(#gSun)" opacity=".7"/>
  ${R(5, (i) => `<g opacity=".85" class="px${1 + (i % 2)}"><ellipse cx="${200 + i * 330}" cy="${130 + rnd(i) * 80}" rx="${90 + rnd(i, 2) * 60}" ry="24" fill="#fff"/><ellipse cx="${240 + i * 330}" cy="${115 + rnd(i) * 80}" rx="60" ry="26" fill="#fff"/></g>`)}
  <g filter="url(#fFar)">${hills(470, 120, '#7fa88a', 51)}</g>
  ${treeline(520, '#4f8a5a', 52, 70)}
  <rect y="520" width="1600" height="90" fill="url(#gSeaDay)"/>
  <g class="wave">${R(10, (i) => `<path d="M${(rnd(i, 61) * 1700) | 0} ${540 + i * 6} h${60 + ((rnd(i, 62) * 120) | 0)}" stroke="#fff" stroke-width="3" opacity=".7" stroke-linecap="round"/>`)}</g>
  <path d="M-100 600 Q800 560 1700 600 L1700 900 L-100 900Z" fill="url(#gSand)"/>
  <path d="M-100 604 Q800 566 1700 604" stroke="#fff" stroke-width="6" opacity=".6" class="wave"/>
  ${[[150, 150, '#6f7a4e', '#7a4a2a'], [310, 150, '#9b5fc0', '#7a3f22'], [470, 132, '#e7a1b4', '#5a3a22'], [610, 122, '#f0b44a', '#3a2a1a'], [740, 120, '#5a9fd0', '#2a2a2a'], [870, 126, '#7ac0a0', '#1a1a1a'], [1010, 135, '#d06a4a', '#2a1a10'], [1150, 108, '#f2d64a', '#4a3020']].map(([x, h, b, hr]) => kid(x as number + 80, 640, h as number, b as string, hr as string)).join('')}
  ${['汤团', '涵涵', '派派', '佑佑', '欧弟', '北北', '甲寻', '甲朔'].map((n, i) => `<text x="${[258, 418, 575, 712, 842, 974, 1118, 1248][i]}" y="676" text-anchor="middle" font-size="24" font-weight="600" fill="#5a4020" font-family="sans-serif">${n}</text>`).join('')}
</g></g>
<!-- 8 八片光之叶重新点亮 -->
<g class="sc sc-goal"><g class="mv" style="--cam:camUp;--t:12s">
  <rect width="1600" height="900" fill="url(#gNight)"/>${stars(90, 600)}
  <g class="ray"><g class="rays">${R(16, (i) => `<path d="M800 400 L${800 + Math.cos((i / 16) * Math.PI * 2) * 1200} ${400 + Math.sin((i / 16) * Math.PI * 2) * 1200} L${800 + Math.cos((i / 16 + 0.02) * Math.PI * 2) * 1200} ${400 + Math.sin((i / 16 + 0.02) * Math.PI * 2) * 1200}Z" fill="#ffe8a0" opacity=".18"/>`)}</g></g>
  <circle cx="800" cy="400" r="420" fill="url(#gHalo)" opacity=".35" class="pulse"/>
  ${bigTree(800, 380, 2.05, 'leafX')}
  ${R(8, (i) => { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; const x = 800 + Math.cos(a) * 242, y = 380 - 20 + Math.sin(a) * 164; const d = 'M0 -30 C21 -12 21 12 0 30 C-21 12 -21 -12 0 -30Z'; return `<g transform="translate(${x} ${y}) rotate(${(a * 180) / Math.PI + 90})"><path class="slot" d="${d}"/><path class="lit" style="--d:${i};transform-box:fill-box;transform-origin:center" d="${d}"/></g>`; })}
  ${flies(30, 300, 900)}
</g></g>
</svg>`;
