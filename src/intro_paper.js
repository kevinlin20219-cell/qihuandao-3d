// 由 scratchpad/intro_v5/build.py 从剪纸开场动画预览生成，改动请改 src.js 再重新生成。
// mountPaperIntro(root, opts)：root 里要有 .pi-c（canvas）.pi-grain .pi-cap .pi-snd；返回 { start, skip, stop, setMuted, TOTAL }
// @ts-nocheck
// 页面一打开就先把旁白文件取下来（不需要用户点击）
const PREF = {};
export function prefetchIntroVoice(base) { for (let i = 1; i <= 10; i++) { const id = String(i).padStart(2, '0'); if (!PREF[id]) PREF[id] = fetch(base + 'intro_' + id + '.mp3').then((r) => r.ok ? r.arrayBuffer() : null).catch(() => null); } }
export function mountPaperIntro(root, OPTS) {
OPTS = Object.assign({ prefetched: PREF }, OPTS);
const $ = (id) => root.querySelector('.pi-' + id);

// 奇幻岛 · 整个游戏的开场动画（平面绘本风，Canvas 程序绘制，不加载任何图片）
// 画面 1600×900 逻辑坐标；静态的大块（远山、树冠、石门）先画进离屏画布，播放时只做合成、镜头运动和粒子。
const W = 1600, H = 900;
// 三种平面风格：book 绘本（默认）/ paper 剪纸 / water 水彩。?style= 切换
const STYLE = 'paper';
if (OPTS.preview) document.documentElement.dataset.style = STYLE;
const cv = $('c'), ctx = cv.getContext('2d');
let DPR = 1, view = { s: 1, ox: 0, oy: 0 };
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * DPR; cv.height = innerHeight * DPR;
  const s = Math.max(innerWidth / W, innerHeight / H);
  view = { s: s * DPR, ox: (innerWidth * DPR - W * s * DPR) / 2, oy: (innerHeight * DPR - H * s * DPR) / 2 };
}
addEventListener('resize', resize); resize();
const unbindResize = () => removeEventListener('resize', resize);

// ---------- 工具 ----------
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (t) => t * t * (3 - 2 * t);
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(c1, c2, t) { const a = hex(c1), b = hex(c2); return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`; }
function layer(w = W + 400, h = H + 200) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.translate(200, 100); return { c, g }; }
function lg(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1);
  if (STYLE === 'paper' && stops.length >= 2 && stops.every(([, c]) => /^#/.test(c))) { // 剪纸：渐变压成 4 条色带
    const N = 4; const at = (o) => { for (let i = 1; i < stops.length; i++) if (o <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; return mix(ca, cb, (o - a) / Math.max(1e-6, b - a)); } return mix(stops[stops.length - 1][1], stops[stops.length - 1][1], 0); };
    for (let i = 0; i < N; i++) { const c = at((i + 0.5) / N); gr.addColorStop(i / N, c); gr.addColorStop((i + 1) / N - 0.001, c); } return gr; }
  stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; }
function rg(g, x, y, r0, r1, stops) { const gr = g.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; }
function glow(g, x, y, r, col, a = 1) { g.save(); g.globalAlpha = a; g.fillStyle = rg(g, x, y, 0, r, [[0, col], [1, 'rgba(0,0,0,0)']]); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore(); }

// 起伏的山 / 地面：边缘带细小锯齿，再在顶缘撒草丛笔触
function hills(g, y, amp, col, colTop, seed, opts = {}) {
  const R = rng(seed); const pts = []; const step = opts.step || 70;
  for (let x = -260; x <= W + 260; x += step) pts.push([x, y - amp * (0.3 + R() * 0.7) * (opts.shape ? opts.shape(x) : 1)]);
  g.beginPath(); g.moveTo(-260, H + 120);
  pts.forEach((p, i) => { if (!i) g.lineTo(p[0], p[1]); else { const q = pts[i - 1]; g.quadraticCurveTo(q[0] + step / 2, (q[1] + p[1]) / 2 - amp * 0.15 * R(), p[0], p[1]); } });
  g.lineTo(W + 260, H + 120); g.closePath();
  g.fillStyle = lg(g, 0, y - amp, 0, y + 200, [[0, colTop], [1, col]]);
  if (STYLE === 'paper') { g.save(); g.shadowColor = 'rgba(30,20,10,.45)'; g.shadowBlur = 14; g.shadowOffsetY = -3; g.fill(); g.restore(); g.save(); g.strokeStyle = 'rgba(255,250,230,.35)'; g.lineWidth = 2; g.stroke(); g.restore(); }
  else if (STYLE === 'water') { g.save(); g.globalAlpha = 0.9; g.fill(); g.restore(); g.save(); g.clip(); g.strokeStyle = mix(col, '#000000', 0.3); for (const [w, a] of [[16, 0.06], [8, 0.08], [3, 0.12]]) { g.globalAlpha = a; g.lineWidth = w; g.stroke(); } g.restore(); }
  else g.fill();
  if (opts.tufts) { g.save(); g.clip(); for (let i = 0; i < opts.tufts; i++) { const x = -200 + R() * (W + 400), yy = y - amp * 0.2 + R() * 260; g.strokeStyle = R() < 0.5 ? opts.tuftA : opts.tuftB; g.lineWidth = 1.6; g.globalAlpha = 0.55; g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(x + k * 3, yy); g.quadraticCurveTo(x + k * 3 + 2, yy - 6, x + k * 3 + (R() - 0.5) * 8, yy - 10 - R() * 8); } g.stroke(); } g.restore(); }
}
// 叶团：上百片小叶子按「球面受光」上色——左上亮、右下暗，边缘一圈高光，能看清叶片又有体积
function leafBall(g, cx, cy, rx, ry, pal, n, seed, light = [-0.6, -0.8]) {
  if (STYLE === 'paper') return paperBall(g, cx, cy, rx, ry, pal, seed, light);
  if (STYLE === 'water') return waterBall(g, cx, cy, rx, ry, pal, seed, light);
  const R = rng(seed); const leaves = [];
  for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()); const x = Math.cos(a) * r, y = Math.sin(a) * r; leaves.push([x, y, R()]); }
  leaves.sort((a, b) => (a[0] * light[0] + a[1] * light[1]) - (b[0] * light[0] + b[1] * light[1])).reverse();
  // 底色剪影，避免叶缝里透出背景
  g.fillStyle = pal[0]; g.beginPath(); g.ellipse(cx, cy, rx * 0.92, ry * 0.9, 0, 0, 7); g.fill();
  for (const [x, y, k] of leaves) {
    const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    const lit = clamp(0.5 + 0.55 * (-(x * light[0] + y * light[1]) * 0.8 + z * 0.35) + (k - 0.5) * 0.25);
    const ci = lit < 0.3 ? 1 : lit < 0.55 ? 2 : lit < 0.8 ? 3 : 4;
    const px = cx + x * rx, py = cy + y * ry, s = (0.75 + k * 0.5) * (pal.size || 9);
    g.save(); g.translate(px, py); g.rotate(Math.atan2(y, x) + (k - 0.5) * 1.6);
    g.fillStyle = pal[ci]; g.beginPath(); g.moveTo(0, -s); g.quadraticCurveTo(s * 0.62, 0, 0, s); g.quadraticCurveTo(-s * 0.62, 0, 0, -s); g.fill();
    if (ci >= 3) { g.strokeStyle = pal[ci === 4 ? 3 : 2]; g.globalAlpha = 0.5; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, -s * 0.8); g.lineTo(0, s * 0.8); g.stroke(); }
    g.restore();
  }
  // 边缘光
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.12; g.fillStyle = rg(g, cx + rx * light[0] * 0.5, cy + ry * light[1] * 0.5, 0, rx * 1.1, [[0, '#fff3c0'], [1, 'rgba(0,0,0,0)']]); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.fill(); g.restore();
}
// 剪纸叶团：三层剪出的纸片（暗、中、亮），每层有纸影；边缘剪成锯齿叶形
function wobble(g, cx, cy, rx, ry, R, k = 14, amp = 0.12, leafy = true) {
  g.beginPath(); for (let i = 0; i <= k * 2; i++) { const a = (i / (k * 2)) * Math.PI * 2, r = (i % 2 && leafy ? 1 + amp : 1 - amp * 0.3) * (1 + (R() - 0.5) * amp); const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath();
}
function paperBall(g, cx, cy, rx, ry, pal, seed, light) {
  const R = rng(seed); g.save(); g.shadowColor = 'rgba(20,12,6,.5)'; g.shadowBlur = 10 * (rx / 100) + 4; g.shadowOffsetX = 3; g.shadowOffsetY = 5;
  g.fillStyle = pal[1]; wobble(g, cx, cy, rx, ry, R, 16, 0.14); g.fill();
  g.fillStyle = pal[2]; wobble(g, cx + light[0] * rx * 0.12, cy + light[1] * ry * 0.12, rx * 0.8, ry * 0.78, R, 14, 0.15); g.fill();
  g.fillStyle = pal[3]; wobble(g, cx + light[0] * rx * 0.3, cy + light[1] * ry * 0.3, rx * 0.5, ry * 0.48, R, 10, 0.18); g.fill();
  g.shadowBlur = 3; g.shadowOffsetX = 1; g.shadowOffsetY = 2;
  for (let i = 0; i < 7; i++) { const a = R() * 7, d = R() * 0.7; const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d, s = rx * 0.11; g.fillStyle = pal[R() < 0.5 ? 4 : 3]; g.save(); g.translate(x, y); g.rotate(R() * 6); g.beginPath(); g.moveTo(0, -s); g.quadraticCurveTo(s * 0.6, 0, 0, s); g.quadraticCurveTo(-s * 0.6, 0, 0, -s); g.fill(); g.restore(); }
  g.restore();
}
// 水彩叶团：一层层半透明晕染，颜色在边缘积起来，中间留白透亮
function waterBall(g, cx, cy, rx, ry, pal, seed, light) {
  const R = rng(seed); g.save(); g.globalAlpha = 0.16;
  for (let i = 0; i < 26; i++) { const a = R() * 7, d = Math.sqrt(R()) * 0.75, x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d, r = rx * (0.28 + R() * 0.35); const lit = -(Math.cos(a) * d * light[0] + Math.sin(a) * d * light[1]); const ci = lit > 0.25 ? 4 : lit > 0 ? 3 : lit > -0.3 ? 2 : 1; g.fillStyle = pal[ci]; wobble(g, x, y, r, r * (ry / rx), R, 9, 0.2, false); g.fill(); }
  g.globalAlpha = 0.5; g.strokeStyle = pal[1]; g.lineWidth = 1.4; wobble(g, cx, cy, rx * 0.95, ry * 0.93, R, 12, 0.12, false); g.stroke();
  g.globalAlpha = 0.55; for (let i = 0; i < 18; i++) { const a = R() * 7, d = 0.3 + R() * 0.65, x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d, s = rx * 0.07; g.fillStyle = pal[R() < 0.6 ? 1 : 2]; g.save(); g.translate(x, y); g.rotate(R() * 6); g.beginPath(); g.moveTo(0, -s); g.quadraticCurveTo(s * 0.5, 0, 0, s); g.quadraticCurveTo(-s * 0.5, 0, 0, -s); g.fill(); g.restore(); }
  g.restore();
}
const PAL_DAY = Object.assign(['#1d3f26', '#24502f', '#3a7a3e', '#5fa04a', '#9bcf6a'], { size: 10 });
const PAL_NIGHT = Object.assign(['#0f2618', '#163a24', '#245a34', '#3c7d45', '#6eac5a'], { size: 10 });
const PAL_DUSK = Object.assign(['#1e2a22', '#2c4030', '#4a6040', '#7a8a52', '#e0b070'], { size: 10 });
// 树干：锥形加树皮笔触和根
function trunk(g, x, y0, y1, w0, w1, col, seed) {
  const R = rng(seed);
  g.fillStyle = lg(g, x - w0, 0, x + w0, 0, [[0, mix(col, '#000000', 0.45)], [0.38, col], [0.62, mix(col, '#ffffff', 0.12)], [1, mix(col, '#000000', 0.5)]]);
  g.beginPath(); g.moveTo(x - w0 * 1.6, y0); g.quadraticCurveTo(x - w0 * 0.9, y0 - 20, x - w0, y0 - 40); g.lineTo(x - w1, y1); g.lineTo(x + w1, y1); g.lineTo(x + w0, y0 - 40); g.quadraticCurveTo(x + w0 * 0.9, y0 - 20, x + w0 * 1.7, y0); g.closePath(); g.fill();
  g.strokeStyle = mix(col, '#000000', 0.55); g.globalAlpha = 0.5; g.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) { const t = R(), yy = lerp(y0 - 30, y1, t), ww = lerp(w0, w1, t); const xx = x + (R() - 0.5) * ww * 1.4; g.beginPath(); g.moveTo(xx, yy); g.quadraticCurveTo(xx + (R() - 0.5) * 6, yy - 12, xx + (R() - 0.5) * 4, yy - 26 - R() * 20); g.stroke(); }
  g.globalAlpha = 1;
}
function branch(g, x0, y0, x1, y1, w, col) { g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 10, x1, y1); g.stroke(); }
// 大树：几组叶团按主枝分布
function bigTree(g, x, ground, s, pal, seed, trunkCol = '#6b4a2a') {
  trunk(g, x, ground, ground - 250 * s, 34 * s, 22 * s, trunkCol, seed);
  const bc = mix(trunkCol, '#000000', 0.2);
  branch(g, x - 6 * s, ground - 210 * s, x - 150 * s, ground - 300 * s, 16 * s, bc); branch(g, x + 6 * s, ground - 220 * s, x + 160 * s, ground - 310 * s, 16 * s, bc); branch(g, x, ground - 240 * s, x - 20 * s, ground - 380 * s, 14 * s, bc);
  const C = [[-170, -300, 120, 95], [175, -310, 125, 98], [-60, -400, 135, 105], [80, -410, 130, 100], [0, -320, 150, 110], [-240, -250, 80, 62], [245, -255, 82, 64], [10, -480, 100, 78]];
  C.sort((a, b) => a[1] - b[1]);
  C.forEach(([dx, dy, rx, ry], i) => leafBall(g, x + dx * s, ground + dy * s, rx * s, ry * s, Object.assign([...pal], { size: pal.size * s }), Math.round(260 * s * s * (rx / 120)), seed + i * 17));
}
// 远景树林剪影（带一点叶团起伏）
function forestBand(g, y, col, colTop, seed, h = 70, n = 46) {
  const R = rng(seed);
  if (STYLE === 'paper') { g.save(); g.shadowColor = 'rgba(20,14,8,.4)'; g.shadowBlur = 12; g.shadowOffsetY = -2; } if (STYLE === 'water') { g.save(); g.globalAlpha = 0.88; }
  for (let i = 0; i < n; i++) { const x = -220 + i * ((W + 440) / n) + R() * 20, r = h * (0.55 + R() * 0.6); g.fillStyle = lg(g, 0, y - r * 1.6, 0, y, [[0, colTop], [1, col]]); g.beginPath(); g.arc(x, y - r * 0.7, r, 0, 7); g.arc(x - r * 0.5, y - r * 0.4, r * 0.7, 0, 7); g.arc(x + r * 0.55, y - r * 0.35, r * 0.75, 0, 7); g.fill(); }
  g.fillStyle = col; g.fillRect(-260, y - 4, W + 520, H - y + 200);
  if (STYLE !== 'book') g.restore();
}
function clouds(g, list, col) { if (STYLE === 'paper') { g.save(); g.shadowColor = 'rgba(40,30,60,.3)'; g.shadowBlur = 10; g.shadowOffsetY = 5; } for (const [x, y, s, a] of list) { g.globalAlpha = STYLE === 'paper' ? Math.min(1, a + 0.35) : a; g.beginPath(); for (const [dx, dy, r] of [[0, 0, 50], [45, -18, 42], [90, 0, 46], [-40, 6, 34], [130, 10, 30]]) { g.moveTo(x + dx * s + r * s, y + dy * s); g.arc(x + dx * s, y + dy * s, r * s, 0, 7); } g.rect(x - 70 * s, y, 230 * s, 30 * s); g.fillStyle = lg(g, 0, y - 60 * s, 0, y + 30 * s, [[0, col], [1, mix(col, '#9aa4b8', 0.25)]]); g.fill('nonzero'); } g.globalAlpha = 1; if (STYLE === 'paper') g.restore(); }

// ---------- 孩子 ----------
// 头身比约 1:2.6 的绘本 Q 版。spec：身高、肤色、发型、衣服、配件
const KIDS = {
  tangtuan: { name: '汤团', h: 150, hair: '#6b3e22', hairStyle: 'curly', top: '#7a8450', top2: '#5d6a3c', camo: true, pants: '#5a5a3a', shoe: '#4a3a2a', bag: '#b49a5a' },
  hanhan: { name: '涵涵', h: 150, hair: '#6a3a1e', hairStyle: 'ponytail', top: '#9b5fc8', top2: '#c79ae6', pants: '#3a3448', shoe: '#b48ae0', bag: '#4a3a5a', tie: '#c26ae0' },
  paipai: { name: '派派', h: 132, hair: '#5a321a', hairStyle: 'braids', top: '#f2a8bd', top2: '#fbd1dc', pants: '#f6e2e8', shoe: '#c97a8a', hat: '#ead9a8' },
  youyou: { name: '佑佑', h: 122, hair: '#2a1c12', hairStyle: 'short', top: '#f4a63a', top2: '#ffd27a', pants: '#3b5a8a', shoe: '#e05a3a' },
  oudi: { name: '欧弟', h: 120, hair: '#1e1a18', hairStyle: 'spiky', top: '#5aa7dc', top2: '#9fd2f2', pants: '#2f5a8a', shoe: '#f2c84a', overall: true },
  beibei: { name: '北北', h: 126, hair: '#1a1410', hairStyle: 'bob', top: '#79c7a6', top2: '#b8e8d2', pants: '#79c7a6', shoe: '#e8e0d0', dress: true },
  jiaxun: { name: '甲寻', h: 135, hair: '#2a1a10', hairStyle: 'bowl', top: '#e0644a', top2: '#f59a7a', pants: '#3a3a3a', shoe: '#f2f2f2' },
  jiashuo: { name: '甲朔', h: 108, hair: '#3a2416', hairStyle: 'tuft', top: '#f6d64a', top2: '#fff0a0', pants: '#5a8ad0', shoe: '#e05a3a', raincoat: true },
};
function kid(g, k, x, ground, scale, t, opt = {}) {
  const s = (k.h / 150) * scale, headR = 30 * scale * (1 + (150 - k.h) / 400), bodyH = 78 * s, legH = 44 * s;
  const walk = opt.walk ? Math.sin(t * 9 + x) : 0, bob = opt.walk ? Math.abs(walk) * 3 * scale : Math.sin(t * 2.2 + x) * 1.2 * scale;
  const hip = ground - legH, sh = hip - bodyH + 8 * s, hy = sh - headR * 0.9 - bob;
  const OL = STYLE === 'paper' ? 'rgba(255,250,236,.95)' : STYLE === 'water' ? 'rgba(70,45,30,.28)' : 'rgba(40,24,16,.55)'; g.lineJoin = 'round';
  if (STYLE === 'paper') { g.save(); g.shadowColor = 'rgba(20,12,6,.45)'; g.shadowBlur = 8; g.shadowOffsetX = 3; g.shadowOffsetY = 4; }
  if (STYLE === 'water') { g.save(); g.globalAlpha *= 0.93; }
  g.save(); g.globalAlpha = 0.22; g.fillStyle = '#000'; g.beginPath(); g.ellipse(x, ground + 3, 30 * s, 6 * s, 0, 0, 7); g.fill(); g.restore();
  // 背包在身后
  if (k.bag) { g.fillStyle = k.bag; g.strokeStyle = OL; g.lineWidth = 2; g.beginPath(); g.roundRect(x - 30 * s, sh + 6 * s - bob, 60 * s, 62 * s, 14 * s); g.fill(); g.stroke(); }
  // 腿
  for (const side of [-1, 1]) { const sw = walk * side * 9 * s; g.fillStyle = k.pants; g.strokeStyle = OL; g.lineWidth = 2; g.beginPath(); g.roundRect(x + side * 9 * s - 7 * s + sw * 0.3, hip - 4 * s, 14 * s, legH, 6 * s); g.fill(); g.stroke(); g.fillStyle = k.shoe; g.beginPath(); g.ellipse(x + side * 9 * s + sw * 0.6 + side * 2 * s, ground - 3 * s, 11 * s, 6 * s, 0, 0, 7); g.fill(); g.stroke(); }
  // 身体
  const bw = (k.h >= 140 ? 52 : 46) * s;
  g.fillStyle = lg(g, x - bw / 2, 0, x + bw / 2, 0, [[0, k.top2], [0.35, k.top], [1, mix(k.top, '#000000', 0.25)]]);
  g.strokeStyle = OL; g.lineWidth = 2.2;
  g.beginPath();
  if (k.dress || k.raincoat) { g.moveTo(x - bw * 0.42, sh - bob); g.lineTo(x + bw * 0.42, sh - bob); g.lineTo(x + bw * 0.66, hip + 8 * s); g.lineTo(x - bw * 0.66, hip + 8 * s); g.closePath(); }
  else g.roundRect(x - bw / 2, sh - bob, bw, bodyH - 2 * s, 16 * s);
  g.fill(); g.stroke();
  if (k.camo) { const R = rng(7); g.save(); g.clip(); for (let i = 0; i < 14; i++) { g.fillStyle = ['#4a5530', '#9a9a62', '#6a5a38'][i % 3]; g.beginPath(); g.ellipse(x - bw / 2 + R() * bw, sh - bob + R() * bodyH, 8 * s, 5 * s, R() * 3, 0, 7); g.fill(); } g.restore(); }
  if (k.overall) { g.fillStyle = k.pants; g.beginPath(); g.roundRect(x - bw * 0.32, sh + bodyH * 0.35 - bob, bw * 0.64, bodyH * 0.62, 6 * s); g.fill(); g.strokeStyle = OL; g.stroke(); }
  if (k.top2 && !k.camo && !k.overall) { g.strokeStyle = k.top2; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(x, sh + 6 * s - bob); g.lineTo(x, sh + bodyH * 0.8 - bob); g.stroke(); }
  // 手臂
  for (const side of [-1, 1]) { const sw = -walk * side * 0.35; g.save(); g.translate(x + side * bw * 0.48, sh + 10 * s - bob); g.rotate(sw + side * (opt.wave && side > 0 ? -2.4 + Math.sin(t * 8) * 0.3 : 0.12)); g.fillStyle = k.top; g.strokeStyle = OL; g.lineWidth = 2; g.beginPath(); g.roundRect(-6 * s, 0, 12 * s, 40 * s, 6 * s); g.fill(); g.stroke(); g.fillStyle = '#f6d2b2'; g.beginPath(); g.arc(0, 42 * s, 6.5 * s, 0, 7); g.fill(); g.stroke(); g.restore(); }
  // 头发（后层）
  g.fillStyle = k.hair; g.strokeStyle = OL; g.lineWidth = 2;
  if (k.hairStyle === 'braids') for (const side of [-1, 1]) { g.beginPath(); g.ellipse(x + side * headR * 0.85, hy + headR * 0.9, 8 * s, headR * 0.9, side * 0.15, 0, 7); g.fill(); g.stroke(); }
  if (k.hairStyle === 'ponytail') { g.beginPath(); g.moveTo(x + headR * 0.4, hy - headR * 0.7); g.quadraticCurveTo(x + headR * 1.7, hy - headR * 0.5, x + headR * 1.3, hy + headR * 1.6 + Math.sin(t * 3) * 3); g.quadraticCurveTo(x + headR * 0.9, hy + headR * 0.5, x + headR * 0.3, hy - headR * 0.3); g.fill(); g.stroke(); g.fillStyle = k.tie; g.beginPath(); g.arc(x + headR * 0.7, hy - headR * 0.62, 5 * s, 0, 7); g.fill(); g.fillStyle = k.hair; }
  if (k.hairStyle === 'bob') { g.beginPath(); g.ellipse(x, hy - headR * 0.05, headR * 1.12, headR * 0.98, 0, 0, 7); g.fill(); g.stroke(); }
  // 脸
  g.fillStyle = lg(g, x - headR, 0, x + headR, 0, [[0, '#ffe2c8'], [1, '#f2c4a0']]); g.beginPath(); g.ellipse(x, hy, headR, headR * (k.h > 140 ? 1.02 : 0.96), 0, 0, 7); g.fill(); g.strokeStyle = OL; g.stroke();
  // 五官
  const ey = hy + headR * 0.12, ex = headR * 0.38, blink = (Math.sin(t * 1.3 + x) > 0.985) ? 0.15 : 1;
  for (const side of [-1, 1]) { g.fillStyle = '#2a1a12'; g.beginPath(); g.ellipse(x + side * ex, ey, headR * 0.13, headR * 0.17 * blink, 0, 0, 7); g.fill(); if (blink > 0.5) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x + side * ex - headR * 0.04, ey - headR * 0.06, headR * 0.05, 0, 7); g.fill(); } g.fillStyle = 'rgba(240,120,110,.35)'; g.beginPath(); g.ellipse(x + side * headR * 0.62, ey + headR * 0.3, headR * 0.16, headR * 0.1, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(60,30,20,.6)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x + side * ex - headR * 0.14, ey - headR * 0.32); g.quadraticCurveTo(x + side * ex, ey - headR * 0.4, x + side * ex + headR * 0.14, ey - headR * 0.32); g.stroke(); }
  g.strokeStyle = '#a0503a'; g.lineWidth = 2; g.beginPath(); g.arc(x, ey + headR * 0.32, headR * 0.16, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  // 头发（前层）
  g.fillStyle = lg(g, x, hy - headR, x, hy, [[0, mix(k.hair, '#ffffff', 0.15)], [1, k.hair]]); g.strokeStyle = OL; g.lineWidth = 2;
  g.beginPath();
  if (k.hairStyle === 'bowl') { g.moveTo(x - headR * 1.08, hy + headR * 0.05); g.quadraticCurveTo(x - headR * 1.1, hy - headR * 1.25, x, hy - headR * 1.15); g.quadraticCurveTo(x + headR * 1.1, hy - headR * 1.25, x + headR * 1.08, hy + headR * 0.05); g.lineTo(x - headR * 1.08, hy + headR * 0.05); }
  else if (k.hairStyle === 'curly') { for (let i = 0; i < 9; i++) { const a = Math.PI * (1.05 + i * 0.11); g.moveTo(x + Math.cos(a) * headR * 0.95, hy + Math.sin(a) * headR * 0.95); g.arc(x + Math.cos(a) * headR * 0.95, hy + Math.sin(a) * headR * 0.95, headR * 0.3, 0, 7); } }
  else if (k.hairStyle === 'tuft') { g.moveTo(x - headR, hy - headR * 0.1); for (let i = 0; i <= 6; i++) { const a = Math.PI * (1 + i / 6); g.lineTo(x + Math.cos(a) * headR * (i % 2 ? 1.35 : 1.0), hy + Math.sin(a) * headR * (i % 2 ? 1.35 : 1.0) - headR * 0.1); } g.lineTo(x + headR, hy - headR * 0.1); g.quadraticCurveTo(x, hy - headR * 0.55, x - headR, hy - headR * 0.1); }
  else { g.moveTo(x - headR * 1.02, hy + headR * 0.15); g.quadraticCurveTo(x - headR * 1.15, hy - headR * 1.2, x + headR * 0.1, hy - headR * 1.08); g.quadraticCurveTo(x + headR * 1.15, hy - headR * 1.0, x + headR * 1.02, hy + headR * 0.1); g.quadraticCurveTo(x + headR * 0.55, hy - headR * 0.45, x - headR * 0.1, hy - headR * 0.5); g.quadraticCurveTo(x - headR * 0.6, hy - headR * 0.35, x - headR * 1.02, hy + headR * 0.15); }
  g.fill(); g.stroke();
  if (k.hairStyle === 'spiky') { g.fillStyle = k.hair; for (let i = 0; i < 5; i++) { const a = Math.PI * (1.25 + i * 0.125); const bx = x + Math.cos(a) * headR * 0.92, by = hy + Math.sin(a) * headR * 0.92; g.beginPath(); g.moveTo(bx - 6 * s, by + 4 * s); g.lineTo(bx + Math.cos(a) * 14 * s, by + Math.sin(a) * 14 * s); g.lineTo(bx + 6 * s, by + 4 * s); g.fill(); } }
  if (k.hat) { g.fillStyle = k.hat; g.strokeStyle = OL; g.beginPath(); g.ellipse(x, hy - headR * 0.62, headR * 1.65, headR * 0.34, 0, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.ellipse(x, hy - headR * 0.9, headR * 0.82, headR * 0.6, 0, Math.PI, 0); g.fill(); g.stroke(); g.strokeStyle = '#e88aa0'; g.lineWidth = 4 * s; g.beginPath(); g.ellipse(x, hy - headR * 0.68, headR * 0.82, headR * 0.12, 0, Math.PI * 0.05, Math.PI * 0.95); g.stroke(); }
  if (k.raincoat) { g.fillStyle = k.top; g.strokeStyle = OL; g.beginPath(); g.ellipse(x, hy - headR * 0.4, headR * 1.15, headR * 0.85, 0, Math.PI, 0); g.fill(); g.stroke(); }
  if (opt.lantern) { const lx = x + bw * 0.6 + 14 * s, ly = sh + 50 * s - bob; glow(g, lx, ly, 46 * s, 'rgba(255,214,110,.85)', 0.9); g.fillStyle = '#5a3a20'; g.fillRect(lx - 7 * s, ly - 12 * s, 14 * s, 4 * s); g.fillStyle = '#ffe9a0'; g.beginPath(); g.roundRect(lx - 7 * s, ly - 8 * s, 14 * s, 18 * s, 4 * s); g.fill(); }
  if (STYLE !== 'book') g.restore();
}

const LEAF_POS = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; LEAF_POS.push([Math.cos(a) * 165, -300 + Math.sin(a) * 120, a]); }
function lightLeaf(g, x, y, a, s, on, t) {
  g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
  if (on > 0) { glow(g, 0, 0, 46 * s, 'rgba(255,226,130,.9)', on * (0.75 + 0.25 * Math.sin(t * 2.5 + x))); }
  g.fillStyle = on > 0.02 ? mix('#3c6a3c', '#ffe88a', on) : 'rgba(30,50,30,.7)'; g.strokeStyle = on > 0.02 ? '#fff6c0' : '#ffe58a'; g.lineWidth = 2; if (on <= 0.02) g.setLineDash([5, 4]);
  g.beginPath(); g.moveTo(0, -22 * s); g.quadraticCurveTo(15 * s, 0, 0, 22 * s); g.quadraticCurveTo(-15 * s, 0, 0, -22 * s); g.fill(); g.stroke(); g.setLineDash([]);
  g.strokeStyle = on > 0.02 ? 'rgba(200,150,40,.7)' : 'rgba(255,230,140,.4)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -16 * s); g.lineTo(0, 16 * s); g.stroke();
  g.restore();
}
function stars(g, n, maxY, t, seed) { const R = rng(seed); for (let i = 0; i < n; i++) { const x = R() * W, y = R() * maxY, r = 0.6 + R() * 1.7, ph = R() * 6; g.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1 + R() * 2) + ph)); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } g.globalAlpha = 1; }
function fireflies(g, n, y0, y1, t, seed, col = 'rgba(255,236,150,.95)') { const R = rng(seed); for (let i = 0; i < n; i++) { const x0 = R() * W, sp = 12 + R() * 25, ph = R() * 100, yy = y1 - ((t * sp + ph * 10) % (y1 - y0)), xx = x0 + Math.sin(t * 0.8 + ph) * 30; const a = clamp(Math.sin(((y1 - yy) / (y1 - y0)) * Math.PI)) * (0.6 + 0.4 * Math.sin(t * 4 + ph)); glow(g, xx, yy, 10, col, a); g.globalAlpha = a; g.fillStyle = '#fffbe0'; g.beginPath(); g.arc(xx, yy, 1.8, 0, 7); g.fill(); g.globalAlpha = 1; } }
function seaShimmer(g, t, col, y0 = 600, n = 40, seed = 3) { const R = rng(seed); g.strokeStyle = col; g.lineCap = 'round'; for (let i = 0; i < n; i++) { const y = y0 + Math.pow(R(), 1.4) * 280, x = R() * W + Math.sin(t * 0.6 + i) * 30, w = 20 + R() * 90 * (y - y0 + 40) / 280; g.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + i * 1.7)); g.lineWidth = 1.5 + (y - y0) / 120; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.stroke(); } g.globalAlpha = 1; }
function fogBank(g, t, a) { if (a <= 0) return; const R = rng(9); for (let i = 0; i < 9; i++) { const x = ((R() * 2000 + t * (14 + R() * 18)) % 2400) - 400, y = 470 + R() * 200, rx = 280 + R() * 260, ry = 50 + R() * 50; g.save(); g.globalAlpha = a * (0.35 + R() * 0.3); g.fillStyle = rg(g, x, y, 0, rx, [[0, '#dfe8ea'], [1, 'rgba(223,232,234,0)']]); g.translate(x, y); g.scale(1, ry / rx); g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore(); } }

function drawBoat(g, x, y, s, t) {
  g.save(); g.translate(x, y + Math.sin(t * 1.8) * 3 * s); g.rotate(Math.sin(t * 1.3) * 0.03); g.scale(s, s);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(70, 30, 90, 8, 0, 0, 7); g.fill();
  g.fillStyle = lg(g, 0, 0, 0, 30, [[0, '#7a5232'], [1, '#3e2614']]); g.beginPath(); g.moveTo(-10, 0); g.lineTo(150, 0); g.quadraticCurveTo(140, 26, 118, 30); g.lineTo(18, 30); g.quadraticCurveTo(0, 24, -10, 0); g.fill();
  g.strokeStyle = '#a07a4a'; g.lineWidth = 3; g.beginPath(); g.moveTo(-6, 4); g.lineTo(146, 4); g.stroke();
  g.fillStyle = '#e8dcc0'; g.fillRect(68, -118, 5, 118);
  g.fillStyle = lg(g, 73, -114, 140, 0, [[0, '#fff8e8'], [1, '#e8d4b0']]); g.beginPath(); g.moveTo(73, -112); g.quadraticCurveTo(128, -60, 134, -8); g.lineTo(73, -8); g.fill();
  g.fillStyle = '#efe0c4'; g.beginPath(); g.moveTo(68, -100); g.quadraticCurveTo(30, -50, 22, -10); g.lineTo(68, -10); g.fill();
  const cols = ['#c99a5a', '#7aa0c8', '#9bbf6a', '#d48aa6'];
  [24, 42, 98, 116].forEach((px, i) => { g.fillStyle = cols[i]; g.beginPath(); g.roundRect(px - 9, -8, 18, 12, 4); g.fill(); g.fillStyle = '#f3cfae'; g.beginPath(); g.arc(px, -16, 8, 0, 7); g.fill(); glow(g, px + 12, -22, 16, 'rgba(255,220,120,.9)', 0.8); });
  g.restore();
}
// 2 点灯人与机关
function kidBack(g, k, x, ground, scale) {
  const s = (k.h / 150) * scale, headR = 30 * scale, hip = ground - 44 * s, sh = hip - 70 * s, hy = sh - headR * 0.85;
  g.fillStyle = '#0a120c'; g.beginPath(); g.roundRect(x - 26 * s, sh, 52 * s, 76 * s, 16 * s); g.fill(); g.beginPath(); g.arc(x, hy, headR, 0, 7); g.fill();
  if (k.hat) { g.beginPath(); g.ellipse(x, hy - headR * 0.5, headR * 1.6, headR * 0.3, 0, 0, 7); g.fill(); }
  if (k.hairStyle === 'ponytail') { g.beginPath(); g.ellipse(x + headR * 0.2, hy + headR * 1.0, 9 * s, headR * 0.9, 0.1, 0, 7); g.fill(); }
  if (k.bag) { g.beginPath(); g.roundRect(x - 24 * s, sh + 8 * s, 48 * s, 52 * s, 12 * s); g.fill(); }
  g.fillRect(x - 16 * s, hip, 12 * s, 44 * s); g.fillRect(x + 4 * s, hip, 12 * s, 44 * s);
  g.strokeStyle = 'rgba(255,220,140,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(x, hy, headR, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
}

// ---------- 镜头 ----------
function camApply(c, par) { // par：视差系数（远景动得少）
  ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);
  const z = 1 + (c.z - 1) * par;
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2 + (c.x || 0) * par, -H / 2 + (c.y || 0) * par);
}


// ---------- 配乐（Web Audio 现场合成：八音盒旋律 + 柔和铺底和弦 + 简单混响） ----------
let AC = null, master = null, mus = null, rev = null, muted = !!OPTS.muted, nextBeat = 0, beatN = 0;
const CHORDS = { warm: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], sad: [[-3, 0, 4], [-7, -3, 0], [-5, -1, 2], [-3, 0, 4]], rise: [[-7, -3, 0], [-5, -1, 2], [0, 4, 7], [2, 5, 9]] };
const MOOD = { island: 'warm', builders: 'warm', door: 'warm', motto: 'rise', leave: 'sad', dim: 'sad', eight: 'warm', goal: 'rise' };
function audioInit() {
  if (AC) return; AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(AC.destination); mus = AC.createGain(); mus.connect(master);
  rev = AC.createConvolver(); const len = AC.sampleRate * 2.8, buf = AC.createBuffer(2, len, AC.sampleRate); for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); } rev.buffer = buf; const rg = AC.createGain(); rg.gain.value = 0.38; rev.connect(rg); rg.connect(mus); voiceLoad();
}
const hz = (semi) => 523.25 * Math.pow(2, semi / 12);
function note(semi, when, dur, vol, type = 'sine', bell = true) {
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = hz(semi);
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + (bell ? 0.008 : 0.6)); g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
  o.connect(g); g.connect(mus); g.connect(rev); o.start(when); o.stop(when + dur + 0.1);
  if (bell) { const o2 = AC.createOscillator(), g2 = AC.createGain(); o2.frequency.value = hz(semi) * 3.01; g2.gain.setValueAtTime(vol * 0.18, when); g2.gain.exponentialRampToValueAtTime(0.0005, when + dur * 0.4); o2.connect(g2); g2.connect(rev); g2.connect(mus); o2.start(when); o2.stop(when + dur); }
}
function musicTick(T, sceneId) {
  if (!AC || muted) return;
  const BEAT = 0.5; // 120 拍/分钟的八分音符
  if (nextBeat === 0) nextBeat = AC.currentTime + 0.1;
  while (nextBeat < AC.currentTime + 0.3) {
    const mood = T > ENDT ? 'rise' : (MOOD[sceneId] || 'warm'); const ch = CHORDS[mood][Math.floor(beatN / 8) % 4];
    if (beatN % 8 === 0) for (const n of ch) note(n - 12, nextBeat, 4.2, 0.035, 'triangle', false);
    const arp = [ch[0], ch[1], ch[2], ch[1] + 12, ch[2] + 12, ch[1] + 12, ch[2], ch[1]];
    if (!(mood === 'sad' && beatN % 2)) note(arp[beatN % 8] + (mood === 'rise' && beatN % 16 > 7 ? 12 : 0), nextBeat, 1.6, mood === 'sad' ? 0.05 : 0.07);
    nextBeat += BEAT; beatN++;
  }
}
function setMuted(m) { muted = m; const b = $('snd'); if (b) b.textContent = muted ? '🔇' : '🔊'; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, AC.currentTime, 0.2); if (muted) voiceStop(); try { OPTS.onMute?.(muted); } catch (e) { } }
{ const b = $('snd'); if (b) { b.textContent = muted ? '🔇' : '🔊'; b.onclick = (e) => { e.stopPropagation(); setMuted(!muted); }; } }
// ---------- 旁白（Codex 交付 20261108_intro_narration_selected_v001，用户选定的第一版温柔故事旁白） ----------
// 每条文件前后各有 0.2 秒静音；按每幕实际时长同步，不加速。旁白期间音乐压到 30%。
const VOICE = OPTS.voice === false ? [] : ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
const vbuf = {}, vraw = {}; let vsrc = [], vdecoding = false;
// 先把文件取下来（不需要声音环境），用户点了按钮、有了 AudioContext 再解码
for (const id of VOICE) vraw[id] = (OPTS.prefetched && OPTS.prefetched[id]) || fetch((OPTS.audioBase || 'audio/') + 'intro_' + id + '.mp3').then((r) => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).catch((e) => { console.warn('旁白加载失败', id, e); return null; });
function voiceLoad() {
  if (vdecoding || !AC) return; vdecoding = true; const ac = AC;
  for (const id of VOICE) vraw[id].then((ab) => ab && new Promise((ok, bad) => ac.decodeAudioData(ab.slice(0), ok, bad))).then((b) => { if (b) vbuf[id] = b; }).catch((e) => console.warn('旁白解码失败', id, e));
}
function voiceStop() { for (const v of vsrc) { try { v.stop(); } catch (e) { } } vsrc = []; if (mus && AC) { mus.gain.cancelScheduledValues(AC.currentTime); mus.gain.setTargetAtTime(1, AC.currentTime, 0.3); } }
// 在动画时间 at 开始播 id；off = 已经晚了多少秒（重播/跳到中间时从对应位置接上）
function voicePlay(id, off) {
  const b = vbuf[id]; if (!b || muted || !AC || off > b.duration - 0.3) return;
  const src = AC.createBufferSource(); src.buffer = b; const g = AC.createGain(); g.gain.value = 1.0; src.connect(g); g.connect(master);
  const now = AC.currentTime, end = now + (b.duration - off);
  src.start(now, Math.max(0, off)); vsrc.push(src); src.onended = () => { vsrc = vsrc.filter((x) => x !== src); };
  mus.gain.cancelScheduledValues(now); mus.gain.setTargetAtTime(0.3, now, 0.15); mus.gain.setTargetAtTime(1, end + 0.1, 0.6);
}


const ORDER = ['tangtuan', 'hanhan', 'paipai', 'youyou', 'oudi', 'beibei', 'jiaxun', 'jiashuo'];
// ================= 剪纸版 v5：像一本会动的立体书 =================
// 每一幕的纸片从下往上「立起来」（带回弹），道具按自己的轨迹运动：飞来的光之叶、掉落的木板、旋转的水车、
// 升空的孔明灯、飘落的暗叶、跳进画面的孩子、从孩子手里飞向大树的光球……
const backOut = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOut = (x) => 1 - Math.pow(1 - x, 3), easeIn = (x) => x * x * x;
const elastic = (x) => x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
function pop(lt, delay, dur = 0.8) { const k = clamp((lt - delay) / dur); return k <= 0 ? null : { k, b: backOut(k) }; }
function bez(p0, p1, p2, p3, t) { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; }
function paperShadow(g, b = 10, y = 5) { g.shadowColor = 'rgba(15,8,4,.45)'; g.shadowBlur = b; g.shadowOffsetX = 2; g.shadowOffsetY = y; }
function noShadow(g) { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0; }
// 把一个叶团单独剪成一张纸，方便单独弹出
function crownPiece(x, y, rx, ry, pal, seed) { const c = document.createElement('canvas'); c.width = rx * 2 + 70; c.height = ry * 2 + 70; const g = c.getContext('2d'); paperBall(g, c.width / 2, c.height / 2, rx, ry, pal, seed, [-0.6, -0.8]); return { x, y, c }; }
function drawPiece(p, sc = 1, rot = 0, dy = 0) { ctx.save(); ctx.translate(p.x, p.y + dy); ctx.rotate(rot); ctx.scale(sc, sc); ctx.drawImage(p.c, -p.c.width / 2, -p.c.height / 2); ctx.restore(); }
// 纸片波浪：一条剪出波纹的彩纸，左右来回滑
function waveStrip(y, amp, col, phase, speed, t, h = 260) {
  ctx.save(); paperShadow(ctx, 12, -3); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-300, y + h);
  const off = Math.sin(t * speed + phase) * 40;
  for (let x = -300; x <= W + 300; x += 40) ctx.lineTo(x + off, y + Math.sin(x * 0.018 + phase) * amp);
  ctx.lineTo(W + 300, y + h); ctx.fill(); noShadow(ctx);
  ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2; ctx.beginPath(); for (let x = -300; x <= W + 300; x += 40) { const yy = y + Math.sin(x * 0.018 + phase) * amp; x === -300 ? ctx.moveTo(x + off, yy) : ctx.lineTo(x + off, yy); } ctx.stroke(); ctx.restore();
}
// 挂在细线上的纸月亮、纸星星
function hangingMoon(x, y, r, t, col = '#fff6d8') { const sw = Math.sin(t * 0.9) * 0.05; ctx.save(); ctx.translate(x, -60); ctx.rotate(sw); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, y + 60 - r); ctx.stroke(); glow(ctx, 0, y + 60, r * 3, 'rgba(255,248,214,.35)'); paperShadow(ctx, 14, 6); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, y + 60, r, 0, 7); ctx.fill(); noShadow(ctx); ctx.fillStyle = 'rgba(200,190,150,.25)'; ctx.beginPath(); ctx.arc(-r * 0.3, y + 60 - r * 0.2, r * 0.22, 0, 7); ctx.arc(r * 0.25, y + 60 + r * 0.3, r * 0.14, 0, 7); ctx.fill(); ctx.restore(); }
function paperStar(x, y, r, t, ph) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.3 + ph) * 0.25); const a = 0.55 + 0.45 * Math.sin(t * 2 + ph); ctx.globalAlpha = a; ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, an = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.fill(); ctx.restore(); }
function sparkle(x, y, k, col = 'rgba(255,240,170,.95)', n = 10, R0 = 70) { if (k <= 0 || k >= 1) return; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, r = easeOut(k) * R0; glow(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, 9, col, 1 - k); } glow(ctx, x, y, 90 * (1 - k), 'rgba(255,240,180,.9)', 1 - k); }
// 纸雾：一条条剪成云边的白纸，从两侧滑进来
function fogStrip(y, dir, k, t, alpha = 0.85, seed = 1) { if (k <= 0) return; const R = rng(seed); const x0 = dir > 0 ? lerp(-1900, -120, easeOut(k)) : lerp(1700, -180, easeOut(k)); ctx.save(); ctx.globalAlpha = alpha; paperShadow(ctx, 16, 6); ctx.fillStyle = '#e4ecee'; ctx.beginPath(); ctx.moveTo(x0, y + 120); let x = x0; ctx.lineTo(x, y + 20); while (x < x0 + 1900) { const r = 30 + R() * 50; ctx.arc(x + r, y + Math.sin(t * 0.7 + x * 0.01) * 6, r, Math.PI, 0); x += r * 2 - 10; } ctx.lineTo(x, y + 120); ctx.fill(); ctx.restore(); }

const PAL_TIRED = Object.assign(['#1a2420', '#26302a', '#3a463a', '#55604a', '#76805e'], { size: 10 });
const CROWN_C = [[-125, -215, 95, 75], [130, -222, 98, 76], [-50, -285, 105, 82], [62, -292, 100, 80], [0, -228, 115, 86], [-185, -170, 62, 50], [190, -175, 64, 50], [8, -345, 78, 62]];
function crownSet(cx, ground, s, pal, seed) { return CROWN_C.map(([dx, dy, rx, ry], i) => crownPiece(cx + dx * s, ground + dy * s, rx * s, ry * s, Object.assign([...pal], { size: pal.size * s }), seed + i * 13)); }
// ---------- 场景 1 / 5 / 6：海岛 ----------
const ISL = {};
function buildIsland2(kind) {
  const night = kind !== 'dusk'; const pal = night ? PAL_NIGHT : PAL_DUSK;
  const sky = layer(), base = layer();
  const g = sky.g;
  g.fillStyle = night ? lg(g, 0, -100, 0, 640, [[0, '#08132a'], [0.5, '#173454'], [1, '#2f587c']]) : lg(g, 0, -100, 0, 640, [[0, '#2a2650'], [0.4, '#a5587a'], [0.72, '#f0a05a'], [1, '#ffd894']]);
  g.fillRect(-200, -100, W + 400, H + 200);
  if (!night) clouds(g, [[300, 210, 1.4, 0.6], [930, 150, 1.1, 0.55], [1320, 260, 1.2, 0.6]], '#ffd0b0');
  hills(g, 560, 80, night ? '#132a40' : '#5a4060', night ? '#1d3a58' : '#8a5a72', 11, { step: 120 });
  g.fillStyle = night ? lg(g, 0, 575, 0, 900, [[0, '#24507a'], [1, '#081626']]) : lg(g, 0, 575, 0, 900, [[0, '#e0907a'], [0.3, '#6a4a6a'], [1, '#1a1830']]);
  g.fillRect(-200, 575, W + 400, 520);
  const m = base.g;
  m.save(); paperShadow(m, 18, 8); m.fillStyle = night ? '#173a24' : '#3f3244'; m.beginPath(); m.moveTo(330, 640); m.quadraticCurveTo(420, 560, 560, 552); m.quadraticCurveTo(700, 500, 800, 506); m.quadraticCurveTo(930, 500, 1060, 552); m.quadraticCurveTo(1190, 562, 1270, 640); m.closePath(); m.fill(); m.restore();
  m.fillStyle = night ? '#245a34' : '#5a4a58'; m.beginPath(); m.moveTo(380, 625); m.quadraticCurveTo(470, 570, 590, 566); m.quadraticCurveTo(700, 530, 800, 534); m.quadraticCurveTo(910, 530, 1010, 566); m.quadraticCurveTo(1140, 572, 1220, 625); m.closePath(); m.fill();
  const R = rng(5); for (let i = 0; i < 16; i++) { const x = 420 + i * 50 + R() * 16, r = 20 + R() * 18, y = 572 - Math.sin(((x - 380) / 840) * Math.PI) * 46; paperBall(m, x, y, r, r * 0.8, pal, 200 + i, [-0.6, -0.8]); }
  // 树干单独一张，树冠拆成 8 片
  const tr = layer(); trunk(tr.g, 800, 560, 360, 26, 16, night ? '#5a3c22' : '#4a3030', 77); branch(tr.g, 795, 400, 690, 330, 12, '#4a3220'); branch(tr.g, 805, 405, 920, 335, 12, '#4a3220'); branch(tr.g, 800, 380, 790, 290, 10, '#4a3220');
  const crowns = crownSet(800, 560, 1, pal, 90), tired = night ? crownSet(800, 560, 1, PAL_TIRED, 90) : null;
  ISL[kind] = { sky: sky.c, base: base.c, trunk: tr.c, crowns, tired };
}
const LEAF8 = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; return [800 + Math.cos(a) * 140, 330 + Math.sin(a) * 100, a]; });
function islandBase(kind, t, cam) {
  const I = ISL[kind];
  ctx.save(); camApply(cam, 0.25); ctx.drawImage(I.sky, -200, -100); if (kind !== 'dusk') { const R = rng(31); for (let i = 0; i < 70; i++) paperStar(R() * W, R() * 430, 2 + R() * 4, t, i); } ctx.restore();
}
function drawIslandScene(t, lt, dur, kind) {
  const u = clamp(lt / dur);
  const cam = kind === 'night' ? { z: 1.0 + u * 0.1, y: -u * 16 } : kind === 'dim' ? { z: 1.08 + u * 0.04, y: -6 } : { z: 1.03, x: -30 + u * 60 };
  islandBase(kind === 'dim' ? 'night' : kind, t, cam);
  const I = ISL[kind === 'dim' ? 'night' : kind];
  ctx.save(); camApply(cam, 0.55);
  if (kind !== 'dusk') { // 月亮；起雾那一幕被云遮住
    hangingMoon(1270, 150, 42, t);
    if (kind === 'dim') { const k = clamp((lt - 1) / 3); ctx.save(); paperShadow(ctx, 14, 6); clouds(ctx, [[lerp(1700, 1180, easeOut(k)), 150, 1.3, 1]], '#9aa8bc'); ctx.restore(); }
  } else { glow(ctx, 1150, 590, 380, 'rgba(255,200,120,.7)'); ctx.save(); paperShadow(ctx, 14, 4); ctx.fillStyle = '#fff1c4'; ctx.beginPath(); ctx.arc(1150, 600 - u * 30, 70, 0, 7); ctx.fill(); ctx.restore(); }
  ctx.restore();
  ctx.save(); camApply(cam, 1);
  // 岛从海里立起来
  const isl = kind === 'night' ? pop(lt, 0.1, 1.0) : { b: 1 };
  if (isl) {
    const dy = (1 - isl.b) * 300;
    const dim = kind === 'dim' ? clamp((lt - 0.8) / (dur - 2)) : 0;
    glow(ctx, 800, 340 + dy, 400, kind === 'dusk' ? 'rgba(255,214,140,.45)' : 'rgba(255,226,140,.65)', (1 - dim * 0.9) * (0.85 + 0.15 * Math.sin(t * 1.5)));
    ctx.drawImage(I.base, -200, -100 + dy);
    // 树：树干从下往上长，叶团一片片弹出来
    const grow = kind === 'night' ? clamp((lt - 0.7) / 1.0) : 1;
    if (grow > 0) { ctx.save(); ctx.beginPath(); ctx.rect(0, 560 + dy - 230 * easeOut(grow) - 30, W, 300); ctx.clip(); ctx.drawImage(I.trunk, -200, -100 + dy); ctx.restore(); }
    const tired = kind === 'dim' ? clamp((lt - 1.4) / 4.5) : 0;
    I.crowns.forEach((p, i) => { const pc = kind === 'night' ? pop(lt, 1.4 + i * 0.13, 0.7) : { b: 1 }; if (!pc) return; const sway = Math.sin(t * 1.2 + i) * 0.015 * (1 - tired * 0.7);
      // 累了：树冠一团团褪色、往下垂一点、缩一点
      const sc = pc.b * (1 - tired * 0.05), droop = tired * (8 + i % 3 * 4);
      drawPiece(p, sc, sway + tired * (p.x < 800 ? -0.04 : 0.04), dy + droop);
      if (tired > 0) { ctx.save(); ctx.globalAlpha = clamp(tired * 1.3 - i * 0.04); drawPiece(I.tired[i], sc, sway + (p.x < 800 ? -0.04 : 0.04) * tired, dy + droop); ctx.restore(); } });
    // 光之叶
    LEAF8.forEach(([x, y, a], i) => {
      if (kind === 'night') { // 从夜空沿弧线飞来
        const k = clamp((lt - 2.9 - i * 0.28) / 1.1); if (k <= 0) return;
        const R = rng(400 + i); const p0 = [R() * W, -60 - R() * 80], p1 = [p0[0] + (R() - 0.5) * 600, 150 + R() * 100], p2 = [x + (R() - 0.5) * 300, y - 160];
        const e = easeOut(k); const [px, py] = bez(p0, p1, p2, [x, y], e);
        for (let j = 1; j < 6; j++) { const [qx, qy] = bez(p0, p1, p2, [x, y], Math.max(0, e - j * 0.035)); glow(ctx, qx, qy, 10 - j, 'rgba(255,236,160,.8)', (1 - j / 6) * (1 - k * 0.6)); }
        lightLeaf(ctx, px, py, a + (1 - e) * 6, 0.85, 1, t); sparkle(x, y, (k - 0.92) / 0.4 + (k >= 1 ? clamp((lt - 2.9 - i * 0.28 - 1.1) / 0.5) : 0));
      } else if (kind === 'dim') { // 一片片暗下去，然后脱落，摇摇晃晃掉进海里
        const off = clamp((lt - 1.4 - i * 0.55) / 0.5), fall = clamp((lt - 1.9 - i * 0.55) / 2.6);
        if (fall <= 0) lightLeaf(ctx, x, y, a, 0.85, 1 - off, t);
        else if (fall < 1) { const fy = y + easeIn(fall) * 520, fx = x + Math.sin(fall * 9 + i) * 50 * fall; ctx.save(); ctx.globalAlpha = 1 - fall * 0.8; lightLeaf(ctx, fx, fy, a + Math.sin(fall * 9 + i) * 1.2, 0.85, 0, t); ctx.restore(); }
      } else lightLeaf(ctx, x, y, a, 0.85, 1, t);
    });
    if (kind === 'dim') { const dk = clamp((lt - 1) / 4); ctx.fillStyle = `rgba(8,16,28,${0.35 * dk})`; ctx.fillRect(-300, -200, W + 600, H + 400); }
  }
  // 帆船和孔明灯
  if (kind === 'dusk') {
    const k = clamp(lt / (dur - 0.5)), [bx, by] = bez([700, 690], [900, 700], [1100, 650], [1380, 610], easeOut(k)); drawBoat(ctx, bx, by, 1 - k * 0.55, t);
    for (let i = 0; i < 6; i++) { const lk = clamp((lt - 1.2 - i * 0.55) / 4.5); if (lk <= 0) continue; const R = rng(700 + i); const sx = bx + 20 + R() * 100 * (1 - k * 0.5), sy = by - 30; const yy = lerp(sy, 120 + R() * 140, easeOut(lk)), xx = sx + Math.sin(lk * 6 + i) * 30 + (R() - 0.5) * 200 * lk; const s = 1 - lk * 0.55; glow(ctx, xx, yy, 34 * s, 'rgba(255,190,90,.9)', 0.9); ctx.save(); paperShadow(ctx, 6, 3); ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.roundRect(xx - 9 * s, yy - 12 * s, 18 * s, 22 * s, 6 * s); ctx.fill(); ctx.restore(); ctx.fillStyle = '#ffe9b0'; ctx.fillRect(xx - 4 * s, yy + 6 * s, 8 * s, 3 * s); }
  }
  if (kind === 'night') { shootingStar(lt, 4.4, 1300, 120); jumpFish(lt, 1.8, 330, 1, '#f6a24a'); jumpFish(lt, 5.0, 1240, -1, '#9fd2f2'); }
  if (kind === 'dusk') { const R = rng(9); for (let i = 0; i < 20; i++) { const a = clamp((lt - 2 - R() * 3) / 1.5); if (a > 0) paperStar(R() * W, R() * 260, 2 + R() * 2, t, i); } for (let i = 0; i < 3; i++) { const x = (lt * 70 + i * 140 + 200) % 1700, y = 260 + i * 26 + Math.sin(t * 2 + i) * 8, f = Math.sin(t * 6 + i) * 7; ctx.strokeStyle = 'rgba(60,30,50,.8)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 14, y - f); ctx.quadraticCurveTo(x - 6, y - 6, x, y); ctx.quadraticCurveTo(x + 6, y - 6, x + 14, y - f); ctx.stroke(); } }
  // 前景纸浪
  const night = kind !== 'dusk';
  waveStrip(700, 10, night ? '#1f4a72' : '#7a4a6a', 0.5, 0.9, t);
  waveStrip(760, 12, night ? '#173d60' : '#5a3a5a', 2.1, -0.7, t);
  waveStrip(830, 14, night ? '#10304e' : '#3e2a48', 4.0, 0.6, t);
  if (kind === 'dim') { fogStrip(560, 1, clamp((lt - 2.2) / 3), t, 0.75, 3); fogStrip(640, -1, clamp((lt - 3) / 3), t, 0.8, 4); fogStrip(720, 1, clamp((lt - 3.8) / 3), t, 0.85, 5); }
  if (kind === 'night') fireflies(ctx, 22, 300, 680, t, 4);
  ctx.restore();
}

// ---------- 场景 2：点灯人造机关 ----------
let BLD = null;
function buildBuilders2() {
  const L = layer(W + 800, H + 200), g = L.g; g.translate(200, 0);
  g.fillStyle = lg(g, 0, -100, 0, 700, [[0, '#7fb6d2'], [0.55, '#f5d9a6'], [1, '#f2b06c']]); g.fillRect(-400, -100, W + 800, H + 200);
  clouds(g, [[600, 160, 1.3, 0.8], [1250, 110, 1.6, 0.8], [1800, 190, 1.2, 0.75]], '#fff1dc');
  hills(g, 500, 90, '#9fb39c', '#c2cfb2', 31, { step: 140 });
  forestBand(g, 590, '#5f8a5a', '#86ad72', 32, 55, 60);
  hills(g, 650, 50, '#4f7e4a', '#7bab5e', 33, { tufts: 200, tuftA: '#3f6a3a', tuftB: '#9cc874' });
  // 峡谷两岸
  g.save(); paperShadow(g, 14, 6); g.fillStyle = '#7a735a'; g.beginPath(); g.moveTo(-400, 640); g.lineTo(130, 610); g.lineTo(165, 900); g.lineTo(-400, 900); g.fill(); g.beginPath(); g.moveTo(400, 610); g.lineTo(600, 650); g.lineTo(600, 900); g.lineTo(370, 900); g.fill(); g.restore();
  g.fillStyle = '#2a3428'; g.fillRect(150, 650, 240, 260);
  g.fillStyle = '#5a3a20'; g.fillRect(122, 548, 14, 66); g.fillRect(394, 548, 14, 66);
  BLD = { bg: L.c, front: null };
  const F = layer(W + 800, H + 200), f = F.g; f.translate(200, 0);
  hills(f, 735, 26, '#3c6a42', '#5f9a52', 34, { tufts: 260, tuftA: '#2f5a32', tuftB: '#8cc06a' });
  BLD.front = F.c;
}
function drawBuilders2(t, lt, dur) {
  const u = clamp(lt / dur); const camx = 120 - easeOut(u) * 480;
  ctx.save(); camApply({ z: 1.06, x: camx, y: 0 }, 1); ctx.drawImage(BLD.bg, -200, -100);
  // 吊桥木板：一块块从空中落下，铺成弧线
  ctx.save(); ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(129, 610); ctx.quadraticCurveTo(265, 690, 401, 610); ctx.stroke(); ctx.restore();
  for (let i = 1; i < 14; i++) { const tt = i / 14, x = lerp(129, 401, tt), y = 610 + Math.sin(tt * Math.PI) * 40; const k = clamp((lt - 0.2 - i * 0.14) / 0.55); if (k <= 0) continue; const yy = lerp(y - 320, y, easeIn(k)) - (k >= 1 ? 0 : 0), rot = (1 - k) * (i % 2 ? 1.5 : -1.5); ctx.save(); ctx.translate(x, yy + (k >= 1 ? Math.sin(t * 2 + i * 0.5) * 1.5 : 0)); ctx.rotate(rot); paperShadow(ctx, 5, 3); ctx.fillStyle = i % 2 ? '#a07a4a' : '#8a663c'; ctx.fillRect(-10, -5, 20, 10); ctx.restore(); }
  { const k = clamp((lt - 2.2) / 0.8); if (k > 0) { ctx.strokeStyle = '#d4b07a'; ctx.lineWidth = 3; ctx.setLineDash([400]); ctx.lineDashOffset = 400 * (1 - k); ctx.beginPath(); ctx.moveTo(129, 562); ctx.quadraticCurveTo(265, 640, 401, 562); ctx.stroke(); ctx.setLineDash([]); } }
  // 水闸：从地面弹起，齿轮转动，水流出
  const p1 = pop(lt, 0.6, 0.8); if (p1) { const dy = (1 - p1.b) * 260; ctx.save(); ctx.translate(0, dy); paperShadow(ctx, 12, 6); ctx.fillStyle = '#7d6648'; ctx.beginPath(); ctx.roundRect(640, 525, 190, 150, 6); ctx.fill(); noShadow(ctx); ctx.fillStyle = '#3e3020'; ctx.fillRect(662, 552, 146, 96); for (let i = 0; i < 6; i++) { ctx.fillStyle = '#6a5233'; ctx.fillRect(668 + i * 24, 556 - Math.max(0, Math.sin(t * 1.4)) * 30, 12, 88); }
    ctx.save(); ctx.translate(735, 505); ctx.rotate(t * 1.2); paperShadow(ctx, 6, 3); ctx.fillStyle = '#a89c80'; ctx.beginPath(); for (let i = 0; i < 20; i++) { const r = i % 2 ? 30 : 40, a = i * Math.PI / 10; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.fill(); noShadow(ctx); ctx.fillStyle = '#5b5440'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill(); ctx.restore(); ctx.restore();
    for (let i = 0; i < 14; i++) { const ph = (t * 1.2 + i / 14) % 1; ctx.fillStyle = 'rgba(150,210,240,.85)'; ctx.beginPath(); ctx.arc(670 + (i * 37) % 150 + ph * 10, 675 + dy + ph * 60, 4 - ph * 2, 0, 7); ctx.fill(); } }
  // 灯塔：立起来，光柱扫过
  const p2 = pop(lt, 1.3, 0.9); if (p2) { const dy = (1 - p2.b) * 360; ctx.save(); ctx.translate(0, dy); paperShadow(ctx, 14, 6); ctx.fillStyle = '#f6efe0'; ctx.beginPath(); ctx.moveTo(905, 705); ctx.lineTo(930, 385); ctx.lineTo(980, 385); ctx.lineTo(1005, 705); ctx.fill(); noShadow(ctx); for (let i = 0; i < 3; i++) { const y = 455 + i * 85; ctx.fillStyle = '#c84a2e'; ctx.beginPath(); ctx.moveTo(924 - i * 6, y); ctx.lineTo(986 + i * 6, y); ctx.lineTo(988 + i * 6, y + 24); ctx.lineTo(922 - i * 6, y + 24); ctx.fill(); } ctx.fillStyle = '#2a2a22'; ctx.fillRect(920, 341, 70, 44); ctx.fillStyle = '#7a2a1a'; ctx.beginPath(); ctx.moveTo(912, 341); ctx.lineTo(955, 303); ctx.lineTo(998, 341); ctx.fill();
    if (p2.k >= 1) { const a = Math.sin(t * 0.9) * 0.7 - 0.2; ctx.save(); ctx.translate(955, 363); ctx.rotate(a); ctx.fillStyle = lg(ctx, 0, 0, 560, 0, [[0, 'rgba(255,236,160,.6)'], [1, 'rgba(255,236,160,0)']]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(560, -70); ctx.lineTo(560, 70); ctx.fill(); ctx.restore(); glow(ctx, 955, 363, 46, 'rgba(255,240,180,.95)'); }
    ctx.restore(); }
  // 温室：骨架一笔笔画出来，再罩上玻璃，花一朵朵开
  { const k = clamp((lt - 2.0) / 1.4); if (k > 0) { ctx.save(); ctx.strokeStyle = '#7a8a7a'; ctx.lineWidth = 4; ctx.setLineDash([900]); ctx.lineDashOffset = 900 * (1 - k); ctx.beginPath(); ctx.moveTo(1070, 705); ctx.quadraticCurveTo(1070, 545, 1200, 545); ctx.quadraticCurveTo(1330, 545, 1330, 705); ctx.moveTo(1200, 545); ctx.lineTo(1200, 705); ctx.moveTo(1074, 635); ctx.lineTo(1326, 635); ctx.stroke(); ctx.setLineDash([]); const gk = clamp((lt - 3.2) / 0.8); if (gk > 0) { ctx.globalAlpha = 0.55 * gk; ctx.fillStyle = '#d8f4ea'; ctx.beginPath(); ctx.moveTo(1070, 705); ctx.quadraticCurveTo(1070, 545, 1200, 545); ctx.quadraticCurveTo(1330, 545, 1330, 705); ctx.fill(); ctx.globalAlpha = 1; } ctx.restore();
    [[1115, 690, '#e78aa6'], [1165, 684, '#f2d64a'], [1235, 688, '#ff9a6a'], [1285, 694, '#b48ae0']].forEach(([x, y, c], i) => { const fk = pop(lt, 3.4 + i * 0.25, 0.6); if (!fk) return; ctx.save(); ctx.translate(x, y); ctx.scale(fk.b, fk.b); ctx.strokeStyle = '#3f7a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, 0); ctx.stroke(); paperShadow(ctx, 4, 2); ctx.fillStyle = c; for (let p = 0; p < 5; p++) { const a = p * 1.256 + t * 0.3; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 7, Math.sin(a) * 7 - 4, 6, 4, a, 0, 7); ctx.fill(); } ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(0, -4, 4, 0, 7); ctx.fill(); ctx.restore(); }); } }
  // 水源站：弹起，水车转
  const p3 = pop(lt, 2.8, 0.8); if (p3) { const dy = (1 - p3.b) * 280; ctx.save(); ctx.translate(0, dy); paperShadow(ctx, 12, 6); ctx.fillStyle = '#9dbdd2'; ctx.beginPath(); ctx.roundRect(1400, 505, 150, 96, 18); ctx.fill(); noShadow(ctx); ctx.fillStyle = '#d8eaf4'; ctx.beginPath(); ctx.roundRect(1400, 505, 150, 24, 12); ctx.fill(); ctx.fillStyle = '#6b5a40'; ctx.fillRect(1418, 601, 14, 110); ctx.fillRect(1518, 601, 14, 110);
    ctx.save(); ctx.translate(1475, 660); ctx.rotate(-t * 1.5); ctx.strokeStyle = '#8a6a45'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 34, 0, 7); ctx.stroke(); for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillStyle = '#a07a4a'; ctx.fillRect(-4, -42, 8, 18); } ctx.restore(); ctx.restore(); }
  ctx.drawImage(BLD.front, -200, -100);
  // 点灯人提着灯走过
  const capes = ['#b07a3a', '#5a7aa8', '#7a9a4a', '#a8607a'];
  ['tangtuan', 'hanhan', 'paipai', 'youyou'].forEach((id, i) => { const k = Object.assign({}, KIDS[id], { top: capes[i], top2: mix(capes[i], '#ffffff', 0.35), bag: null, hat: null, camo: false, dress: true }); kid(ctx, k, 140 + i * 360 + lt * 34, 778, 0.85, t, { walk: true, lantern: true }); });
  kite(t, 140 + 360 + lt * 34 + 30, 700, clamp((lt - 0.8) / 2.5)); butterflies(t, 6, 41, [200, 600, 1500, 760]); driftLeaves(t, 10, 42, ['#9bcf6a', '#f6d64a', '#e0a050']);
  // 一行纸鸟沿正弦线飞过
  for (let i = 0; i < 5; i++) { const x = -100 + (lt * 120 + i * 60) - camx * 0.2, y = 200 + Math.sin(lt * 1.5 + i * 0.6) * 20 + Math.abs(i - 2) * 18, f = Math.sin(t * 8 + i) * 9; ctx.save(); paperShadow(ctx, 4, 3); ctx.fillStyle = '#4a3a2a'; ctx.beginPath(); ctx.moveTo(x - 18, y - f); ctx.quadraticCurveTo(x - 6, y - 6, x, y + 2); ctx.quadraticCurveTo(x + 6, y - 6, x + 18, y - f); ctx.quadraticCurveTo(x + 4, y, x, y + 6); ctx.quadraticCurveTo(x - 4, y, x - 18, y - f); ctx.fill(); ctx.restore(); }
  fgGrass(t, '#2f5a32', '#3a6a3a', 43);
  ctx.restore();
}

// ---------- 场景 3 / 4：石门 ----------
let DOOR = null;
function buildDoor2() {
  const L = layer(), g = L.g;
  g.fillStyle = lg(g, 0, -100, 0, 900, [[0, '#0d1d16'], [1, '#183022']]); g.fillRect(-200, -100, W + 400, H + 200);
  forestBand(g, 520, '#10241a', '#1a3a26', 41, 100, 34);
  forestBand(g, 650, '#0c1d14', '#163222', 42, 80, 40);
  const R = rng(51);
  g.save(); paperShadow(g, 20, 8); g.fillStyle = '#2a2820'; g.beginPath(); g.moveTo(420, 900); g.lineTo(420, 330); g.quadraticCurveTo(800, 60, 1180, 330); g.lineTo(1180, 900); g.fill(); g.restore();
  for (let row = 0; row < 9; row++) for (const side of [0, 1]) { const x0 = side ? 1080 : 420, y = 340 + row * 64; for (let c = 0; c < 2; c++) { const x = x0 + c * 50; g.save(); paperShadow(g, 4, 2); g.fillStyle = mix('#8f876f', '#5e574a', R()); g.beginPath(); g.roundRect(x + 2, y + 2, 46, 60, 8); g.fill(); g.restore(); } }
  for (let i = 0; i < 17; i++) { const a0 = Math.PI * (0.06 + i / 17 * 0.88), a1 = Math.PI * (0.06 + (i + 1) / 17 * 0.88); g.save(); paperShadow(g, 4, 2); g.fillStyle = mix('#9a9178', '#625a4b', R()); g.beginPath(); g.moveTo(800 - Math.cos(a0) * 380, 360 - Math.sin(a0) * 280); g.lineTo(800 - Math.cos(a1) * 378, 360 - Math.sin(a1) * 278); g.lineTo(800 - Math.cos(a1) * 284, 360 - Math.sin(a1) * 198); g.lineTo(800 - Math.cos(a0) * 284, 360 - Math.sin(a0) * 198); g.closePath(); g.fill(); g.restore(); }
  g.fillStyle = lg(g, 0, 300, 0, 900, [[0, '#1c1a14'], [1, '#2a261c']]); g.beginPath(); g.moveTo(520, 900); g.lineTo(520, 370); g.quadraticCurveTo(800, 170, 1080, 370); g.lineTo(1080, 900); g.fill();
  for (let i = 0; i < 9; i++) { g.strokeStyle = 'rgba(90,70,40,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(530 + i * 60, 900); g.lineTo(530 + i * 60, 340 - Math.sin((i / 8) * Math.PI) * 120); g.stroke(); }
  hills(g, 860, 20, '#1c2a1a', '#2e4a2a', 52, { tufts: 160, tuftA: '#3a6a3a', tuftB: '#5a8a4a' });
  // 两片藤帘（单独剪），开场时挡住门
  const vine = (seed) => { const c = document.createElement('canvas'); c.width = 330; c.height = 620; const v = c.getContext('2d'); const P = Object.assign(['#1d3a20', '#264a28', '#3a6e38', '#5a9a48', '#8ccc66'], { size: 6 }); for (let i = 0; i < 5; i++) { v.strokeStyle = '#2f5a2a'; v.lineWidth = 7; v.beginPath(); v.moveTo(40 + i * 60, 0); v.quadraticCurveTo(20 + i * 60, 300, 50 + i * 58, 560 - (i % 3) * 40); v.stroke(); } const R2 = rng(seed); for (let i = 0; i < 46; i++) paperBall(v, 30 + R2() * 270, 20 + R2() * 540, 24 + R2() * 14, 18 + R2() * 10, P, seed + i, [-0.6, -0.8]); return c; };
  DOOR = { bg: L.c, vl: vine(301), vr: vine(377), top: crownPiece(800, 130, 210, 60, Object.assign(['#1d3a20', '#264a28', '#3a6e38', '#5a9a48', '#8ccc66'], { size: 7 }), 333) };
}
const CARVE = 'M600 500 C640 440 690 440 730 500 S810 560 850 500 S930 440 970 500 S1010 540 1000 520';
function drawDoor2(t, lt, dur, motto) {
  const u = clamp(lt / dur);
  const cam = motto ? { z: 1.08 + u * 0.06, y: 40 } : { z: 0.92 + u * 0.12, y: 64 - u * 20 };
  ctx.save(); camApply(cam, 1); ctx.drawImage(DOOR.bg, -200, -100);
  // 刻纹：一粒光点沿着纹路走，后面留下发光的刻痕
  const path = new Path2D(CARVE); const prog = motto ? 1 : clamp((lt - 2.2) / 3.4);
  ctx.save(); ctx.strokeStyle = '#ffd76a'; ctx.lineCap = 'round'; ctx.shadowColor = '#ffc840'; ctx.shadowBlur = 20; ctx.lineWidth = 8; ctx.setLineDash([1400]); ctx.lineDashOffset = 1400 * (1 - clamp(prog * 1.3)); ctx.stroke(path);
  ctx.lineWidth = 6; ctx.setLineDash([340]); ctx.lineDashOffset = 340 * (1 - clamp(prog * 1.6 - 0.55)); ctx.beginPath(); ctx.moveTo(640, 590); ctx.lineTo(960, 590); ctx.stroke(); ctx.setLineDash([230]); ctx.lineDashOffset = 230 * (1 - clamp(prog * 1.6 - 0.8)); ctx.beginPath(); ctx.moveTo(685, 640); ctx.lineTo(915, 640); ctx.stroke(); ctx.restore();
  if (!motto && prog > 0 && prog < 1) { // 笔尖光点：用一条隐形路径取点
    const pk = clamp(prog * 1.3); const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path'); tmp.setAttribute('d', CARVE); const len = tmp.getTotalLength(); if (pk < 1) { const p = tmp.getPointAtLength(len * pk); glow(ctx, p.x, p.y, 40, 'rgba(255,240,170,.95)'); for (let i = 0; i < 6; i++) { const R = rng(i + Math.floor(t * 20)); glow(ctx, p.x + (R() - 0.5) * 40, p.y + (R() - 0.5) * 40, 5, 'rgba(255,230,140,.9)', 0.8); } } }
  // 三个锁孔；那句话出现时同时亮起，门缝透出光
  [640, 800, 960].forEach((x, i) => { ctx.save(); paperShadow(ctx, 6, 3); ctx.fillStyle = '#3a352a'; ctx.beginPath(); ctx.arc(x, 712, 28, 0, 7); ctx.fill(); ctx.restore(); ctx.strokeStyle = '#a08a5a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, 712, 28, 0, 7); ctx.stroke(); const on = motto ? clamp((lt - 0.3) / 0.3) : 0; if (on > 0) glow(ctx, x, 712, 80, 'rgba(255,214,110,.9)', on); ctx.fillStyle = on > 0 ? '#ffe58a' : '#5a5040'; ctx.beginPath(); ctx.arc(x, 712, 12, 0, 7); ctx.fill(); if (motto) sparkle(x, 712, (lt - 0.3) / 0.9, undefined, 12, 90); });
  if (motto) { const k = clamp((lt - 0.6) / 1.5); ctx.save(); ctx.fillStyle = lg(ctx, 790, 0, 810, 0, [[0, 'rgba(255,220,130,0)'], [0.5, 'rgba(255,236,170,.95)'], [1, 'rgba(255,220,130,0)']]); ctx.fillRect(800 - 10 * k, 250, 20 * k, 650); glow(ctx, 800, 600, 380, 'rgba(255,220,130,.35)', k); ctx.restore(); }
  // 三个点灯人走到锁前（剪影）
  if (!motto) [[640, 0], [800, 0.25], [960, 0.5]].forEach(([x, d], i) => { const k = clamp((lt - 1.2 - d) / 1.2); if (k <= 0) return; const xx = lerp(i === 0 ? 300 : i === 2 ? 1300 : 800, x, easeOut(k)), yy = i === 1 ? lerp(1000, 868, easeOut(k)) : 868; ctx.save(); ctx.globalAlpha = 0.92; kidBack(ctx, Object.assign({}, KIDS[['tangtuan', 'hanhan', 'paipai'][i]], { bag: null, hat: null }), xx, yy, 1.05); ctx.restore(); });
  else ['tangtuan', 'hanhan', 'paipai'].forEach((id, i) => { ctx.save(); ctx.globalAlpha = 0.92; kidBack(ctx, Object.assign({}, KIDS[id], { bag: null, hat: null }), [640, 800, 960][i], 868, 1.05); ctx.restore(); });
  // 藤帘向两边荡开
  const open = motto ? 1 : easeOut(clamp((lt - 0.2) / 1.6));
  ctx.save(); ctx.translate(500 - open * 330, 230 - open * 20); ctx.rotate(open * 0.1 + Math.sin(t * 1.4) * 0.02); paperShadow(ctx, 14, 6); ctx.drawImage(DOOR.vl, -30, 0); ctx.restore();
  ctx.save(); ctx.translate(1100 + open * 330, 230 - open * 20); ctx.rotate(-open * 0.1 - Math.sin(t * 1.4 + 1) * 0.02); ctx.scale(-1, 1); paperShadow(ctx, 14, 6); ctx.drawImage(DOOR.vr, -30, 0); ctx.restore();
  drawPiece(DOOR.top, 1, Math.sin(t) * 0.01);
  owl(t, 260, 470); owl(t + 1.7, 1370, 520); driftLeaves(t * 0.6, 8, 44, ['#3a6e38', '#5a9a48', '#8a6a3a'], 0, 900);
  fireflies(ctx, 22, 380, 860, t, 12);
  // 那句话：一卷纸从中间展开
  if (motto) { const k = easeOut(clamp((lt - 0.9) / 1.2)); if (k > 0) { const w = 900 * k, x = 800 - w / 2, y = 120; ctx.save(); paperShadow(ctx, 18, 8); ctx.fillStyle = lg(ctx, 0, y, 0, y + 110, [[0, '#f6ecd2'], [1, '#e8d8b4']]); ctx.fillRect(x, y, w, 110); noShadow(ctx); ctx.fillStyle = '#c8a86a'; ctx.fillRect(x - 14, y - 8, 14, 126); ctx.fillRect(x + w, y - 8, 14, 126); ctx.beginPath(); ctx.rect(x + 20, y, Math.max(0, w - 40), 110); ctx.clip(); ctx.fillStyle = '#5a3a1a'; ctx.font = '600 44px "Kaiti SC","STKaiti","KaiTi",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('一个人打不开的门，是留给朋友的。', 800, y + 57); ctx.restore(); } }
  ctx.restore();
}

// ---------- 场景 7：八个朋友 ----------
let BEACH = null;
function buildBeach2() {
  const L = layer(), g = L.g;
  g.fillStyle = lg(g, 0, -100, 0, 560, [[0, '#7cc0e4'], [0.7, '#cfe9f0'], [1, '#fff3d6']]); g.fillRect(-200, -100, W + 400, H + 200);
  clouds(g, [[220, 140, 1.2, 1], [700, 90, 1.5, 1], [1150, 160, 1.0, 1], [1500, 80, 1.3, 1]], '#ffffff');
  hills(g, 470, 140, '#7fae8e', '#a2c9a6', 61, { step: 160 });
  forestBand(g, 520, '#3f7a4c', '#5c9a5e', 62, 64, 50);
  g.fillStyle = lg(g, 0, 515, 0, 620, [[0, '#3aa0c8'], [1, '#6ac4dc']]); g.fillRect(-200, 515, W + 400, 110);
  g.save(); paperShadow(g, 14, -3); g.fillStyle = lg(g, 0, 600, 0, 900, [[0, '#f6e2b4'], [1, '#dcbc84']]); g.beginPath(); g.moveTo(-200, 612); g.quadraticCurveTo(800, 575, W + 200, 612); g.lineTo(W + 200, H + 100); g.lineTo(-200, H + 100); g.fill(); g.restore();
  for (const [x, y] of [[180, 830], [1430, 800], [1300, 860]]) { g.save(); paperShadow(g, 4, 2); g.fillStyle = '#f2b6a0'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, r = k % 2 ? 7 : 16; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6); } g.fill(); g.restore(); }
  bigTree(g, -60, 700, 0.8, PAL_DAY, 64); bigTree(g, 1680, 690, 0.85, PAL_DAY, 65);
  BEACH = L.c;
}
function drawBeach2(t, lt, dur) {
  const u = clamp(lt / dur);
  ctx.save(); camApply({ z: 1.1 - u * 0.06 }, 0.3); ctx.restore();
  ctx.save(); camApply({ z: 1.1 - u * 0.06 }, 1); ctx.drawImage(BEACH, -200, -100);
  // 纸太阳从海平线升起
  { const k = easeOut(clamp(lt / 3)); ctx.save(); glow(ctx, 1330, lerp(480, 190, k), 220, 'rgba(255,246,200,.8)'); paperShadow(ctx, 12, 5); ctx.fillStyle = '#fff1b8'; ctx.beginPath(); ctx.arc(1330, lerp(480, 190, k), 54, 0, 7); ctx.fill(); ctx.restore(); }
  waveStrip(598, 5, '#ffffff', t * 0.3, 1.2, t, 14);
  // 海鸥绕圈
  for (let i = 0; i < 3; i++) { const a = t * 0.6 + i * 2.1, x = 800 + Math.cos(a) * (420 + i * 80), y = 230 + Math.sin(a * 2) * 50 + i * 30, f = Math.sin(t * 7 + i) * 9; ctx.save(); paperShadow(ctx, 4, 3); ctx.fillStyle = '#f8f8f8'; ctx.beginPath(); ctx.moveTo(x - 20, y - f); ctx.quadraticCurveTo(x - 8, y - 8, x, y + 2); ctx.quadraticCurveTo(x + 8, y - 8, x + 20, y - f); ctx.quadraticCurveTo(x + 4, y + 2, x, y + 7); ctx.quadraticCurveTo(x - 4, y + 2, x - 20, y - f); ctx.fill(); ctx.restore(); }
  sparkles(t, 26, 51, [0, 520, W, 600]); crab(t, lt); butterflies(t, 3, 52, [300, 250, 1300, 420]);
  ORDER.forEach((id, i) => { const k = clamp((lt - 0.4 - i * 0.32) / 0.75); if (k <= 0) return; const x = 230 + i * 160; for (let j = 0; j < 3; j++) { const fx = lerp(-80, x, (j + 1) / 4); if (fx > lerp(-120, x, k)) continue; ctx.fillStyle = 'rgba(160,120,70,.35)'; ctx.beginPath(); ctx.ellipse(fx, 800 + (j % 2) * 10, 7, 4, 0, 0, 7); ctx.fill(); } });
  // 孩子们一个接一个跳进画面，落地时压扁再弹起；名牌挂在线上落下来晃
  ORDER.forEach((id, i) => {
    const x = 230 + i * 160, k = clamp((lt - 0.4 - i * 0.32) / 0.75); if (k <= 0) return;
    const sx = -120 - i * 30, jx = lerp(sx, x, k), jy = -Math.sin(k * Math.PI) * 220 * (1 - k * 0.3);
    const land = clamp((lt - 0.4 - i * 0.32 - 0.75) / 0.35), squash = k >= 1 ? 1 - Math.sin(land * Math.PI) * 0.12 : 1;
    ctx.save(); ctx.translate(jx, 760 + jy); ctx.scale(2 - squash, squash); ctx.translate(-jx, -(760 + jy)); kid(ctx, KIDS[id], jx, 760 + jy, 1.25, t, { walk: k < 1, wave: k >= 1 && (id === 'jiashuo' || id === 'youyou' || id === 'hanhan') }); ctx.restore();
    const tk = pop(lt, 0.4 + i * 0.32 + 0.85, 0.7); if (tk) { const sw = Math.sin(lt * 3 + i) * 0.05; ctx.save(); ctx.translate(x, 818 + (1 - tk.b) * 60); ctx.rotate(sw); ctx.scale(tk.b, tk.b); paperShadow(ctx, 6, 3); ctx.fillStyle = '#fff7e6'; ctx.beginPath(); ctx.roundRect(-38, -18, 76, 36, 8); ctx.fill(); noShadow(ctx); ctx.fillStyle = '#5a3a1a'; ctx.font = '600 24px "Kaiti SC","STKaiti","KaiTi",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(KIDS[id].name, 0, 1); ctx.restore(); }
  });
  fgGrass(t, '#4f7e4a', '#3f6a3a', 53);
  ctx.restore();
}

// ---------- 场景 8：大家一起点亮 ----------
let GOAL = null;
function buildGoal2() {
  const L = layer(), g = L.g;
  g.fillStyle = lg(g, 0, -100, 0, 900, [[0, '#06101f'], [0.6, '#132a48'], [1, '#203a52']]); g.fillRect(-200, -100, W + 400, H + 200);
  forestBand(g, 760, '#0c1c14', '#16301f', 71, 80, 36);
  const tr = layer(); trunk(tr.g, 800, 900, 640, 40, 26, '#5a3c22', 72); branch(tr.g, 792, 700, 640, 590, 18, '#4a3220'); branch(tr.g, 808, 706, 970, 600, 18, '#4a3220'); branch(tr.g, 800, 670, 790, 540, 15, '#4a3220');
  const H2 = layer(); hills(H2.g, 860, 30, '#0a160e', '#14281a', 73, { tufts: 100, tuftA: '#1f3a24', tuftB: '#2f5a32' });
  GOAL = { bg: L.c, trunk: tr.c, ground: H2.c, bright: crownSet(800, 900, 1.45, PAL_NIGHT, 500), tired: crownSet(800, 900, 1.45, PAL_TIRED, 500) };
}
function goalSlots() { return Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; return [800 + Math.cos(a) * 205, 900 - 345 + Math.sin(a) * 140, a]; }); }
function drawGoal2(t, lt, dur, title) {
  const u = clamp(lt / dur);
  ctx.save(); camApply({ z: 1.0 + u * 0.06, y: -30 + u * 40 }, 1);
  ctx.drawImage(GOAL.bg, -200, -100); { const R = rng(21); for (let i = 0; i < 50; i++) paperStar(R() * W, R() * 330, 2 + R() * 3, t, i); }
  const S = goalSlots(); const kidsX = ORDER.map((_, i) => 450 + i * 100);
  const litK = (i) => clamp((lt - 1.0 - i * 0.55 - 0.9) / 0.4);
  const n = S.reduce((a, _, i) => a + (title ? 1 : litK(i)), 0);
  if (n > 7.5) { const a = title ? 0.55 : clamp((n - 7.5) * 2) * 0.55; ctx.save(); ctx.translate(800, 560); ctx.rotate(t * 0.05); for (let i = 0; i < 18; i++) { ctx.rotate(Math.PI * 2 / 18); ctx.fillStyle = `rgba(255,232,160,${a * 0.35})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1300, -60); ctx.lineTo(1300, 60); ctx.fill(); } ctx.restore(); }
  glow(ctx, 800, 560, 560, 'rgba(255,226,140,.8)', 0.1 + n * 0.07);
  // 树：先是累了的灰绿色，每点亮一片叶子，离它最近的那团树冠就「醒」过来——变绿、鼓一下
  ctx.drawImage(GOAL.trunk, -200, -100);
  GOAL.tired.forEach((p, i) => {
    let near = 0, best = 1e9; S.forEach(([x, y], j) => { const d = Math.hypot(x - p.x, y - p.y); if (d < best) { best = d; near = j; } });
    const wake = title ? 1 : clamp((lt - 1.0 - near * 0.55 - 0.9) / 0.6), puff = wake > 0 && wake < 1 ? 1 + Math.sin(wake * Math.PI) * 0.08 : 1;
    const sway = Math.sin(t * 1.1 + i) * 0.012 * wake, droop = (1 - wake) * 10;
    drawPiece(p, puff * (0.96 + wake * 0.04), sway, droop); if (wake > 0) { ctx.save(); ctx.globalAlpha = wake; drawPiece(GOAL.bright[i], puff * (0.96 + wake * 0.04), sway, droop); ctx.restore(); }
    if (wake > 0 && wake < 1) for (let k = 0; k < 6; k++) { const a = k * 1.05 + i, r = 60 + wake * 120; ctx.save(); ctx.globalAlpha = 1 - wake; ctx.fillStyle = '#9be07a'; ctx.translate(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.7 - wake * 40); ctx.rotate(a + wake * 4); ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, 7); ctx.fill(); ctx.restore(); }
  });
  ctx.drawImage(GOAL.ground, -200, -100);
  S.forEach(([x, y, a], i) => { const on = title ? 1 : litK(i); lightLeaf(ctx, x, y, a, 1.25, on, t); if (!title) sparkle(x, y, (lt - 1.0 - i * 0.55 - 0.9) / 0.8, undefined, 12, 80); });
  // 每个孩子举手，掌心的光球沿弧线飞向一片叶子
  if (!title) S.forEach(([x, y], i) => { const k = clamp((lt - 1.0 - i * 0.55) / 0.9); if (k <= 0 || k >= 1) return; const sx = kidsX[i], sy = 700; const e = easeOut(k); const [px, py] = bez([sx, sy], [sx, sy - 260], [x + (x < 800 ? -120 : 120), y + 60], [x, y], e); for (let j = 1; j < 8; j++) { const [qx, qy] = bez([sx, sy], [sx, sy - 260], [x + (x < 800 ? -120 : 120), y + 60], [x, y], Math.max(0, e - j * 0.03)); glow(ctx, qx, qy, 12 - j, 'rgba(255,236,160,.9)', 1 - j / 8); } glow(ctx, px, py, 26, 'rgba(255,246,200,1)'); });
  // 光点绕树旋转上升
  if (n > 7.5 || title) for (let i = 0; i < 30; i++) { const a = t * 0.8 + i * 0.7, r = 260 + (i % 5) * 30, yy = 560 - ((t * 30 + i * 37) % 420); glow(ctx, 800 + Math.cos(a) * r, yy + Math.sin(a) * 30, 9, 'rgba(255,240,180,.95)', 0.8); }
  if (!title) S.forEach(([x, y], i) => petalBurst(x, y, (lt - 1.0 - i * 0.55 - 0.9) / 1.4, 600 + i)); if (n > 7.5 && !title) petalBurst(800, 520, (lt - 6.0) / 1.8, 777);
  // 八个孩子的背影（举手）
  ORDER.forEach((id, i) => { const raise = title ? 1 : clamp((lt - 0.8 - i * 0.55) / 0.3); glow(ctx, kidsX[i], 760, 70, 'rgba(255,220,140,.35)', 0.4 + raise * 0.4); kidBack(ctx, KIDS[id], kidsX[i], 818, 0.95 * (KIDS[id].h / 140)); if (raise > 0) { ctx.save(); ctx.strokeStyle = '#0a120c'; ctx.lineCap = 'round'; ctx.lineWidth = 10; ctx.beginPath(); const sx = kidsX[i] + 14, sy = 818 - KIDS[id].h * 0.62; ctx.moveTo(sx, sy); ctx.lineTo(sx + 10, sy - 50 * raise); ctx.stroke(); ctx.restore(); } });
  ctx.restore();
}

// ---------- 片名：纸牌挂在两根线上落下来，晃几下，再翻面成章名 ----------
function drawTitleCard(t, tt) {
  const drop = easeOut(clamp(tt / 0.9)), sw = Math.sin(tt * 5) * 0.12 * Math.exp(-tt * 1.6);
  const flip = clamp((tt - 2.9) / 0.6); const sx = Math.cos(flip * Math.PI);
  const face = flip < 0.5 ? 0 : 1;
  ctx.save(); ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);
  ctx.translate(800, lerp(-300, 420, drop)); ctx.rotate(sw);
  ctx.strokeStyle = 'rgba(255,240,200,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-200, -120); ctx.lineTo(-200, -900); ctx.moveTo(200, -120); ctx.lineTo(200, -900); ctx.stroke();
  ctx.scale(Math.abs(sx) < 0.02 ? 0.02 : Math.abs(sx), 1);
  paperShadow(ctx, 24, 10); ctx.fillStyle = face ? '#f3e6c8' : '#f6ecd2'; ctx.beginPath(); ctx.roundRect(-330, -130, 660, 250, 18); ctx.fill(); noShadow(ctx);
  ctx.strokeStyle = '#c8a86a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(-312, -112, 624, 214, 12); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!face) { ctx.fillStyle = '#a0742a'; ctx.font = '500 22px "Kaiti SC","STKaiti","KaiTi",serif'; ctx.fillText('一个人打不开的门，是留给朋友的', 0, -62); ctx.fillStyle = '#3a6a3a'; ctx.font = '700 96px "Kaiti SC","STKaiti","KaiTi",serif'; ctx.fillText('奇 幻 岛', 0, 28); }
  else { ctx.fillStyle = '#a0742a'; ctx.font = '500 26px "Kaiti SC","STKaiti","KaiTi",serif'; ctx.fillText('第 一 章', 0, -50); ctx.fillStyle = '#3a6a3a'; ctx.font = '700 66px "Kaiti SC","STKaiti","KaiTi",serif'; ctx.fillText('吊桥重新相连', 0, 30); }
  ctx.restore();
}

function kidBack(g, k, x, ground, scale) {
  const s = (k.h / 150) * scale, headR = 30 * scale, hip = ground - 44 * s, sh = hip - 70 * s, hy = sh - headR * 0.85;
  g.save(); g.fillStyle = '#1c2a22'; g.shadowColor = 'rgba(255,214,120,.55)'; g.shadowBlur = 14;
  g.beginPath(); g.roundRect(x - 26 * s, sh, 52 * s, 76 * s, 16 * s); g.fill(); g.beginPath(); g.arc(x, hy, headR, 0, 7); g.fill();
  if (k.hat) { g.beginPath(); g.ellipse(x, hy - headR * 0.5, headR * 1.6, headR * 0.3, 0, 0, 7); g.fill(); }
  if (k.hairStyle === 'ponytail') { g.beginPath(); g.ellipse(x + headR * 0.2, hy + headR * 1.0, 9 * s, headR * 0.9, 0.1, 0, 7); g.fill(); }
  if (k.bag) { g.beginPath(); g.roundRect(x - 24 * s, sh + 8 * s, 48 * s, 52 * s, 12 * s); g.fill(); }
  g.fillRect(x - 16 * s, hip, 12 * s, 44 * s); g.fillRect(x + 4 * s, hip, 12 * s, 44 * s); g.restore();
  g.strokeStyle = 'rgba(255,224,150,.85)'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, hy, headR, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.beginPath(); g.moveTo(x - 24 * s, sh + 10 * s); g.quadraticCurveTo(x - 26 * s, sh, x - 14 * s, sh); g.moveTo(x + 24 * s, sh + 10 * s); g.quadraticCurveTo(x + 26 * s, sh, x + 14 * s, sh); g.stroke();
}

// ================= 点缀：让每一幕更热闹的小东西 =================
// 流星：从右上划到左下，拖一条渐隐的尾巴
function shootingStar(lt, at, x0, y0) { const k = clamp((lt - at) / 0.9); if (k <= 0 || k >= 1) return; const x = x0 - easeOut(k) * 520, y = y0 + easeOut(k) * 220; ctx.save(); ctx.strokeStyle = lg(ctx, x, y, x + 160, y - 68, [[0, 'rgba(255,250,220,.95)'], [1, 'rgba(255,250,220,0)']]); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.globalAlpha = Math.sin(k * Math.PI); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 160, y - 68); ctx.stroke(); ctx.restore(); glow(ctx, x, y, 18, 'rgba(255,250,220,.95)', Math.sin(k * Math.PI)); }
// 纸鱼跃出海面：抛物线，翻身，落水溅起水花
function jumpFish(lt, at, x0, dir, col) { const k = clamp((lt - at) / 1.1); if (k <= 0) return; const x = x0 + dir * k * 170, y = 700 - Math.sin(k * Math.PI) * 150; if (k < 1) { ctx.save(); ctx.translate(x, y); ctx.rotate(dir * (k - 0.5) * 2.4); ctx.scale(dir, 1); paperShadow(ctx, 6, 3); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, 22, 10, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-34, -12); ctx.lineTo(-34, 12); ctx.fill(); noShadow(ctx); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(10, -3, 3, 0, 7); ctx.fill(); ctx.restore(); }
  for (const [kk, xx] of [[k, x0], [k - 1, x0 + dir * 170]]) { const s = clamp(kk < 0.15 ? kk / 0.15 : 0) ; } // 占位
  for (const [st, xx] of [[0, x0], [1, x0 + dir * 170]]) { const sk = clamp((lt - at - st * 1.1) / 0.6); if (sk <= 0 || sk >= 1) continue; for (let i = 0; i < 7; i++) { const a = Math.PI + i / 6 * Math.PI, r = sk * 34; ctx.fillStyle = `rgba(200,230,255,${1 - sk})`; ctx.beginPath(); ctx.arc(xx + Math.cos(a) * r, 700 + Math.sin(a) * r * 0.8 - sk * 14, 4 * (1 - sk) + 1, 0, 7); ctx.fill(); } } }
// 风筝：一个点灯人放的纸风筝，线和尾巴随风摆
function kite(t, hx, hy, k) { if (k <= 0) return; const kx = hx + 160 + Math.sin(t * 0.9) * 40, ky = lerp(hy, 230, easeOut(k)) + Math.sin(t * 1.3) * 20; ctx.save(); ctx.strokeStyle = 'rgba(90,70,40,.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo((hx + kx) / 2 + 40, (hy + ky) / 2 + 60, kx, ky); ctx.stroke(); ctx.translate(kx, ky); ctx.rotate(Math.sin(t * 1.1) * 0.25); paperShadow(ctx, 8, 4); ctx.fillStyle = '#e0644a'; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(24, 0); ctx.lineTo(0, 40); ctx.lineTo(-24, 0); ctx.closePath(); ctx.fill(); noShadow(ctx); ctx.fillStyle = '#f6d64a'; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(24, 0); ctx.lineTo(0, 0); ctx.fill(); ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 40); for (let i = 1; i <= 8; i++) ctx.lineTo(Math.sin(t * 3 + i * 0.8) * 10, 40 + i * 12); ctx.stroke(); for (let i = 2; i <= 8; i += 2) { ctx.fillStyle = i % 4 ? '#5aa0d0' : '#f2a8bd'; ctx.save(); ctx.translate(Math.sin(t * 3 + i * 0.8) * 10, 40 + i * 12); ctx.rotate(0.6); ctx.fillRect(-5, -2, 10, 4); ctx.restore(); } ctx.restore(); }
// 蝴蝶：8 字形绕飞，翅膀开合
function butterflies(t, n, seed, area) { const R = rng(seed); for (let i = 0; i < n; i++) { const cx = area[0] + R() * (area[2] - area[0]), cy = area[1] + R() * (area[3] - area[1]), ph = R() * 6, col = ['#f2a8bd', '#f6d64a', '#9fd2f2', '#ffb070'][i % 4]; const x = cx + Math.sin(t * 0.8 + ph) * 60, y = cy + Math.sin(t * 1.6 + ph) * 26, f = Math.abs(Math.sin(t * 11 + ph)); ctx.save(); ctx.translate(x, y); paperShadow(ctx, 3, 2); ctx.fillStyle = col; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 7 * f, -3, 8 * f + 1, 6, s * 0.4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(s * 5 * f, 5, 5 * f + 1, 4, s * 0.4, 0, 7); ctx.fill(); } ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-1, -6, 2, 12); ctx.restore(); } }
// 飘落的纸叶子（白天）或纸屑
function driftLeaves(t, n, seed, cols, y0 = -40, y1 = 900) { const R = rng(seed); for (let i = 0; i < n; i++) { const sp = 40 + R() * 50, ph = R() * 50, x0 = R() * (W + 300) - 150; const y = y0 + ((t * sp + ph * 20) % (y1 - y0)), x = x0 + Math.sin(t * 1.2 + ph) * 60 - ((t * 20) % 300); ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2 + ph); ctx.scale(1, Math.sin(t * 3 + ph)); paperShadow(ctx, 3, 2); ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(6, 0, 0, 9); ctx.quadraticCurveTo(-6, 0, 0, -9); ctx.fill(); ctx.restore(); } }
// 猫头鹰：林子里两只发光的眼睛，偶尔眨一下、转头
function owl(t, x, y) { const blink = (t % 4.3) < 0.15 ? 0.1 : 1, look = Math.sin(t * 0.7) * 4; ctx.save(); ctx.fillStyle = '#1a2a1e'; ctx.beginPath(); ctx.ellipse(x, y + 18, 26, 32, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 22, y - 4); ctx.lineTo(x - 16, y - 22); ctx.lineTo(x - 6, y - 8); ctx.moveTo(x + 22, y - 4); ctx.lineTo(x + 16, y - 22); ctx.lineTo(x + 6, y - 8); ctx.fill(); for (const s of [-1, 1]) { glow(ctx, x + s * 10 + look, y + 6, 14, 'rgba(255,214,90,.7)', blink); ctx.fillStyle = '#ffd65a'; ctx.beginPath(); ctx.ellipse(x + s * 10 + look, y + 6, 6, 6 * blink, 0, 0, 7); ctx.fill(); } ctx.restore(); }
// 小螃蟹横着走
function crab(t, lt) { const x = lerp(1520, 1080, clamp(lt / 6)), y = 852, step = Math.sin(t * 14); ctx.save(); ctx.translate(x, y); paperShadow(ctx, 4, 2); ctx.fillStyle = '#e0644a'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 12, 0, 0, 7); ctx.fill(); for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 26, -10 + step * s * 2, 8, 0, 7); ctx.fill(); for (let l = 0; l < 3; l++) { ctx.strokeStyle = '#c04a32'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s * 12, 4 + l * 3); ctx.lineTo(s * 26, 12 + l * 4 + (l % 2 ? step : -step) * 3); ctx.stroke(); } } noShadow(ctx); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-6, -12, 4, 0, 7); ctx.arc(6, -12, 4, 0, 7); ctx.fill(); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-6, -12, 2, 0, 7); ctx.arc(6, -12, 2, 0, 7); ctx.fill(); ctx.restore(); }
// 水面闪光
function sparkles(t, n, seed, area) { const R = rng(seed); for (let i = 0; i < n; i++) { const x = area[0] + R() * (area[2] - area[0]), y = area[1] + R() * (area[3] - area[1]), ph = R() * 6, a = Math.max(0, Math.sin(t * 2.5 + ph)); if (a < 0.3) continue; ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#ffffff'; ctx.translate(x, y); ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(2, 0); ctx.lineTo(0, 7); ctx.lineTo(-2, 0); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(0, 2); ctx.lineTo(7, 0); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill(); ctx.restore(); } }
// 前景剪纸草丛（画面最前面一层，带视差，像立体书的前景框）
function fgGrass(t, col, colB, seed) { const R = rng(seed); ctx.save(); paperShadow(ctx, 14, -4); for (const side of [0, 1]) { ctx.fillStyle = side ? colB : col; ctx.beginPath(); const bx = side ? W + 120 : -120; ctx.moveTo(bx, H + 50); for (let i = 0; i < 9; i++) { const x = side ? W + 100 - i * 34 : -100 + i * 34, h = 120 + R() * 140, sw = Math.sin(t * 1.4 + i) * 8; ctx.quadraticCurveTo(x + sw, H - h * 0.5, x + 10 + sw * 1.5, H - h); ctx.quadraticCurveTo(x + 14, H - h * 0.4, x + 24, H + 50); } ctx.closePath(); ctx.fill(); } ctx.restore(); }
// 花瓣迸开（树复苏时）
function petalBurst(cx, cy, k, seed) { if (k <= 0 || k >= 1) return; const R = rng(seed); for (let i = 0; i < 26; i++) { const a = R() * Math.PI * 2, sp = 200 + R() * 260, x = cx + Math.cos(a) * sp * easeOut(k), y = cy + Math.sin(a) * sp * easeOut(k) * 0.7 + k * k * 160; ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(x, y); ctx.rotate(a + k * 6); ctx.fillStyle = ['#f2a8bd', '#ffe68a', '#ffffff', '#b8e8a0'][i % 4]; ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, 7); ctx.fill(); ctx.restore(); } }
// 片名纸屑
function confetti(tt, seed) { if (tt < 3.2) return; const k = tt - 3.2, R = rng(seed); ctx.save(); ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy); for (let i = 0; i < 70; i++) { const x = R() * W, sp = 120 + R() * 160, y = -40 + k * sp + Math.sin(k * 3 + i) * 12 - R() * 200, rot = k * (3 + R() * 4); if (y > H + 20 || y < -50) continue; ctx.save(); ctx.translate(x + Math.sin(k * 2 + i) * 30, y); ctx.rotate(rot); ctx.scale(1, Math.sin(k * 6 + i)); ctx.fillStyle = ['#e0644a', '#f6d64a', '#5aa0d0', '#9bcf6a', '#f2a8bd', '#ffffff'][i % 6]; ctx.fillRect(-6, -3, 12, 6); ctx.restore(); } ctx.restore(); }

let GDY = 0;
function camApply(c, par) { ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy + GDY * view.s); const z = 1 + ((c.z || 1) - 1) * par; ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2 + (c.x || 0) * par, -H / 2 + (c.y || 0) * par); }

// ---------- 时间线 ----------
// tr：进入这一幕时用什么转场。tear 撕纸、iris 圆形开合、rise 纸片从下往上立起、none 同一场景继续
const SCENES = [
  { id: 'island', dur: 8.2, tr: 'none', v: [['01', 0.9]], text: '很久以前，海中央有一座奇幻岛。大树上的八片光之叶，照亮了整座岛。', draw: (t, lt, d) => drawIslandScene(t, lt, d, 'night') },
  { id: 'builders', top: true, dur: 7.6, tr: 'tear', v: [['02', 0.35]], text: '第一批来到岛上的孩子，叫「点灯人」。他们造了吊桥、水闸、灯塔和温室。', draw: drawBuilders2 },
  { id: 'door', top: true, dur: 7.2, tr: 'iris', v: [['03', 0.45]], text: '每一台机关，都要几个人一起按下，才能打开。上面刻着同一句话——', draw: (t, lt, d) => drawDoor2(t, lt, d, false) },
  { id: 'motto', dur: 5.6, tr: 'none', v: [['04', 0.5]], text: '', draw: (t, lt, d) => drawDoor2(t, lt, d, true) },
  { id: 'leave', dur: 6.6, tr: 'tear', v: [['05', 0.5]], text: '后来，点灯人长大了，一个一个，坐船离开了小岛。', draw: (t, lt, d) => drawIslandScene(t, lt, d, 'dusk') },
  { id: 'dim', dur: 8.8, tr: 'iris', v: [['06', 0.35]], text: '大树累了，光之叶一片片暗了下去。它的累化成了雾，会把走在一起的人分开。', draw: (t, lt, d) => drawIslandScene(t, lt, d, 'dim') },
  { id: 'eight', dur: 7, top: true, tr: 'rise', v: [['07', 0.9]], text: '这个夏天，八个好朋友，来到了奇幻岛。', draw: drawBeach2 },
  { id: 'goal', dur: 7, tr: 'tear', v: [['08', 0.5]], text: '他们要一起穿过森林、河流和浓雾，把光之叶重新点亮。', draw: (t, lt, d) => drawGoal2(t, lt, d, false) },
];
// 片名卡：0.9 秒落下时念「奇幻岛」，3.5 秒翻成章名时念「第一章，吊桥重新相连」
const TITLE_V = [['09', 0.8], ['10', 3.45]];
const TITLE = 6.6, XF = 1.1;
const starts = []; { let a = 0; for (const s of SCENES) { starts.push(a); a += s.dur; } }
const ENDT = starts[starts.length - 1] + SCENES[SCENES.length - 1].dur, TOTAL = ENDT + TITLE;

// 转场遮罩：返回一个 Path2D（逻辑坐标），新场景只画在里面
function tornMask(k, seed) { const R = rng(seed), x = lerp(-120, W + 160, easeOut(k)); const p = new Path2D(); p.moveTo(-300, -200); let y = -200; p.lineTo(x, y); while (y < H + 200) { y += 18 + R() * 26; p.lineTo(x + (R() - 0.5) * 46, y); } p.lineTo(-300, H + 200); p.closePath(); return { p, x }; }
function drawTornEdge(k, seed) { const R = rng(seed), x = lerp(-120, W + 160, easeOut(k)); ctx.save(); ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy); ctx.beginPath(); let y = -200; ctx.moveTo(x, y); while (y < H + 200) { y += 18 + R() * 26; ctx.lineTo(x + (R() - 0.5) * 46, y); } ctx.strokeStyle = '#f6ecd6'; ctx.lineWidth = 7; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 16; ctx.shadowOffsetX = 6; ctx.stroke(); ctx.restore(); }
function withClip(path, fn) { ctx.save(); ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy); ctx.clip(path); ctx.setTransform(1, 0, 0, 1, 0, 0); fn(); ctx.restore(); }

const capEl = $('cap'), timeEl = $('time');
let t0 = 0, playing = false, lastCap = -1, built = false, ended = false, played = new Set();
// 所有旁白在全片时间轴上的开始时刻
const VCUES = []; SCENES.forEach((sc, i) => (sc.v || []).forEach(([id, o]) => VCUES.push([id, starts[i] + o]))); TITLE_V.forEach(([id, o]) => VCUES.push([id, ENDT + o]));
// 第一帧（含从中间开始）按偏移接上；之后如果解码慢了，1.2 秒内仍从头念（不切掉开头），再晚就跳过这一句
let vfirst = true;
function voiceTick(T) { for (const [id, at] of VCUES) { if (played.has(id) || T < at) continue; const late = T - at; if (!vbuf[id] || (!vfirst && late > 1.2)) { if (late > 1.2) played.add(id); continue; } played.add(id); voicePlay(id, vfirst ? late : 0); } vfirst = false; }
function build() { if (built) return; buildIsland2('night'); buildIsland2('dusk'); buildBuilders2(); buildDoor2(); buildBeach2(); buildGoal2(); built = true; }
function sceneAt(T) { for (let i = 0; i < SCENES.length; i++) if (T < starts[i] + SCENES[i].dur) return i; return SCENES.length - 1; }
function frame(now) {
  if (!playing) return;
  const T = (now - t0) / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  const idx = sceneAt(T), s = SCENES[idx], lt = T - starts[idx];
  if (T >= ENDT) { drawGoal2(T, s.dur, s.dur, true); drawTitleCard(T, T - ENDT); confetti(T - ENDT, 5); }
  else {
    s.draw(T, lt, s.dur);
    const nx = SCENES[idx + 1], into = lt - (s.dur - XF);
    if (nx && into > 0) {
      const k = clamp(into / XF), drawNext = () => nx.draw(T, 0, nx.dur);
      if (nx.tr === 'tear') { withClip(tornMask(k, idx * 7 + 3).p, drawNext); drawTornEdge(k, idx * 7 + 3); }
      else if (nx.tr === 'iris') { // 先收成一个圆，再从圆里打开下一幕
        const p = new Path2D(); const r = k < 0.5 ? lerp(1100, 0, easeIn(k * 2)) : 0; p.rect(-300, -200, W + 600, H + 400); p.arc(800, 450, Math.max(1, r), 0, 7, true);
        if (k < 0.5) { withClip(p, () => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#060a08'; ctx.fillRect(0, 0, cv.width, cv.height); }); }
        else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#060a08'; ctx.fillRect(0, 0, cv.width, cv.height); const q = new Path2D(); q.arc(800, 450, lerp(0, 1100, easeOut((k - 0.5) * 2)), 0, 7); withClip(q, drawNext); }
      }
      else if (nx.tr === 'rise') { GDY = (1 - backOut(k)) * 900; drawNext(); GDY = 0; }
      else { ctx.save(); ctx.globalAlpha = k; drawNext(); ctx.restore(); }
    }
    if (idx === 0 && lt < 1.2) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(0,0,0,${1 - lt / 1.2})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  }
  ctx.globalAlpha = 1;
  const capIdx = T < ENDT ? idx : -2;
  if (capIdx !== lastCap) { lastCap = capIdx; capEl.classList.remove('on'); if (capIdx >= 0 && SCENES[capIdx].text) setTimeout(() => { if (lastCap !== capIdx) return; capEl.textContent = SCENES[capIdx].text; capEl.classList.toggle('top', !!SCENES[capIdx].top); capEl.classList.add('on'); }, 350); }
  musicTick(T, T < ENDT ? s.id : 'goal'); voiceTick(T);
  if (timeEl) timeEl.textContent = `${T.toFixed(1)} / ${TOTAL.toFixed(0)} 秒`;
  if (T > TOTAL + (OPTS.preview ? 1.5 : 0)) { playing = false; if (!ended) { ended = true; try { OPTS.onEnd?.(); } catch (e) { } } if (OPTS.preview) { $('replay').hidden = false; const pb = $('play'); pb.hidden = false; pb.textContent = '▶ 再看一遍'; } return; }
  requestAnimationFrame(frame);
}
function start(at = 0) { try { audioInit(); AC.resume(); nextBeat = 0; beatN = 0; } catch (e) { } voiceStop(); build(); t0 = performance.now() - at * 1000; playing = true; ended = false; lastCap = -1; played = new Set(); vfirst = true; if (OPTS.preview) { $('play').hidden = true; $('replay').hidden = false; } requestAnimationFrame(frame); }
// 跳过：停掉旁白，直接到片名卡最后（章名已翻出来）
function skip() { voiceStop(); playing = false; build(); played = new Set(VCUES.map((c) => c[0])); const T = TOTAL; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height); drawGoal2(T, 7, 7, true); drawTitleCard(T, T - ENDT); lastCap = -3; capEl.classList.remove('on'); if (!ended) { ended = true; try { OPTS.onEnd?.(); } catch (e) { } } }
function stopAll() { playing = false; voiceStop(); try { if (AC) AC.close(); } catch (e) { } AC = null; unbindResize(); }
if (OPTS.preview) { $('play').onclick = () => start(0); $('replay').onclick = () => start(0); }
// 纸张纹理
{ const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const id = g.createImageData(256, 256); const R = rng(99);
  for (let i = 0; i < id.data.length; i += 4) { const v = 225 + R() * 30; id.data[i] = v; id.data[i + 1] = v - 4; id.data[i + 2] = v - 12; id.data[i + 3] = 255; } g.putImageData(id, 0, 0);
  g.strokeStyle = 'rgba(150,130,100,.25)'; for (let i = 0; i < 90; i++) { g.lineWidth = 0.6; g.beginPath(); const x = R() * 256, y = R() * 256; g.moveTo(x, y); g.quadraticCurveTo(x + (R() - 0.5) * 30, y + (R() - 0.5) * 30, x + (R() - 0.5) * 50, y + (R() - 0.5) * 50); g.stroke(); }
  $('grain').style.backgroundImage = `url(${c.toDataURL()})`; }
if (OPTS.preview) { const at = new URLSearchParams(location.search).get('at'); if (at !== null) start(parseFloat(at)); else { build(); drawIslandScene(0, 6, 7, 'night'); } }
const API = { start, skip, stop: stopAll, setMuted, TOTAL, starts, get T() { return playing ? (performance.now() - t0) / 1000 : -1; } };
if (OPTS.preview) window.__intro = API;

return API;
}
