import { batchMultiDrawEnvironment } from './codex/environment_multidraw';
import { batchStaticEnvironment } from './codex/environment_batches';
import { installDeerContactShade } from './codex/deer_contact_shade';
import { collectContactBlobs } from './contact_blobs';
import { setupIntro } from './intro';
import { chooseInteractionCameraOffset } from './codex/interaction_camera';
import { chapter1Completion } from './codex/chapter1_completion';
import { createCinematicFoliageFade } from './codex/cinematic_foliage';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { createBackdrop } from './backdrop';
import { installAtmosphere } from './atmosphere';
import { initLoaders } from './assets';
import { applyGrade } from './level/chapter1';
import * as THREE from 'three';
import { Physics } from './physics';
import { Input } from './input';
import { UI } from './ui';
import { Game, Stage } from './game';
import { Music } from './music';
import { Voice, VoiceLines } from './voice';
import { CHAPTER1_SQUAD } from './data/characters';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const $ = (id: string) => document.getElementById(id)!;

async function boot() {
  // 入口简介和开场动画先出来，动画放着的时候继续往下加载（用户 11-08）
  const intro = setupIntro();
  // 开场动画一开始就放背景音乐（点按钮是用户手势，浏览器允许出声）；进游戏时直接沿用这一个
  intro.onBegin(() => { if (new URLSearchParams(location.search).get('music') === '0') return; try { const m = new Music(); m.resume(); (window as any).__qhdEarlyMusic = m; } catch (e) { console.warn('音乐无法启动', e); } });
  let bootStage = 0.05; intro.setProgress(0.03, '正在准备角色');
  const progTimer = setInterval(() => { const mp = (window as any).__qhdManifestProgress as { done: number; total: number } | undefined; const env = mp && mp.total ? mp.done / Math.max(mp.total, 150) : 0; intro.setProgress(0.3 * bootStage + 0.7 * env, env > 0 ? '正在布置森林' : '正在准备角色'); }, 300);
  const view = $('view');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // ?quality=high|mid|low 固定画质；默认 auto（自动测试 / 无头浏览器时不自动调，保证截图一致）
  let qParam = new URLSearchParams(location.search).get('quality') || 'auto';
  const PR_STEPS = [1.5, 1.25, 1.0, 0.85, 0.7].filter((v) => v <= Math.max(1, devicePixelRatio) + 0.01);
  let prNow = qParam === 'low' ? 0.85 : qParam === 'mid' ? 1.0 : Math.min(devicePixelRatio, 1.5);
  if (!PR_STEPS.includes(prNow)) PR_STEPS.unshift(prNow);
  const autoQ = qParam === 'auto' && !navigator.webdriver;
  let lowN = 0, highN = 0;
  // ?fps=1 或按 F3：左上角显示帧率、绘制次数、面数（在孩子的轻薄本上测性能用）
  let fpsEl: HTMLDivElement | null = null;
  let fpsBar: HTMLDivElement | null = null;
  const toggleFps = () => {
    if (fpsEl) { fpsEl.remove(); fpsEl = null; fpsBar?.remove(); fpsBar = null; return; }
    fpsEl = document.createElement('div'); fpsEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:4px;z-index:99;font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,.55);padding:2px 8px;border-radius:6px;pointer-events:none'; document.body.appendChild(fpsEl);
    // 测性能用：一键跳到第一章几个地方（跳过以后本次不存档）
    fpsBar = document.createElement('div'); fpsBar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:28px;z-index:99;display:flex;gap:4px;font:12px sans-serif';
    { const b = document.createElement('button'); b.textContent = '太阳光晕 开/关（L）'; b.style.cssText = 'padding:2px 8px;border:0;border-radius:6px;background:rgba(255,226,160,.95);cursor:pointer'; b.onclick = () => { (window as any).__qhdToggleSun?.(); (document.querySelector('canvas') as HTMLCanvasElement | null)?.focus(); }; fpsBar.appendChild(b); }
    for (const [k, label] of [['entry', '入口'], ['crossroads', '岔路口'], ['bridge', '吊桥'], ['deer', '苔鹿']]) {
      const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:2px 8px;border:0;border-radius:6px;background:rgba(246,239,220,.9);cursor:pointer';
      b.onclick = () => { (window as any).__qhdJump?.(k); (document.querySelector('canvas') as HTMLCanvasElement | null)?.focus(); }; fpsBar.appendChild(b);
    }
    document.body.appendChild(fpsBar);
  };
  if (new URLSearchParams(location.search).get('fps')) toggleFps();
  addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); toggleFps(); } });
  renderer.setPixelRatio(prNow);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  // Three r182 no longer maps PCFSoftShadowMap to a filtered shader.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  view.appendChild(renderer.domElement);
  initLoaders(renderer);
  renderer.domElement.tabIndex = 0;

  const scene = new THREE.Scene();
  const cinematicFoliage = createCinematicFoliageFade(scene);
  let deerContactShade: ReturnType<typeof installDeerContactShade> = null;
  // ?grade=old 原来的色调；默认 promo：照宣传片的金色傍晚（暖天际、暖雾、低角度逆光、光束）
  const grade = new URLSearchParams(location.search).get('grade') || 'promo';
  const promo = grade !== 'old';
  // 宣传片 v2（默认，?look2=0 关）：更浓的金色雾、更强逆光和泛光、调色（饱和、暖暗部、暗角）
  const look2 = promo && new URLSearchParams(location.search).get('look2') !== '0';
  // ?tone=2：0104 候选——Codex 的手绘贴图本身已带暖光，游戏灯光不再整体染橙（阳光偏金白、天光偏青、地面反光偏绿、调色减饱和、去暖暗部）
  const oldLight = new URLSearchParams(location.search).get('light') === 'v53'; // v54 起：光晕减弱、反差加大、暗部暖棕、近处雾更少
  const tone2 = look2 && new URLSearchParams(location.search).get('tone') !== '1'; // 0088 起默认；0107 用户按原画定：强暖阳 + 正面暖光 + 树冠影子透光（中性贴图 + 游戏统一给暖光）；?tone=1 回到 v34 的暖橙灯光
  // 太阳方向（从目标指向太阳）。v39：按原画放到玩家视角的左上角、树冠后面（更低、更偏左），光晕从叶缝里透出来
  const SUN_TOPLEFT = new THREE.Vector3(-20, 15, -30), SUN_OLD = new THREE.Vector3(-20, 24, -30);
  if (tone2 && new URLSearchParams(location.search).get('atmo') !== '0') installAtmosphere(); // v49：空气透视 + 峡谷水雾（?atmo=0 关掉对比）
  const SUN = (tone2 && new URLSearchParams(location.search).get('glow') !== '0' ? SUN_TOPLEFT : SUN_OLD).clone();
  if (promo) renderer.toneMappingExposure = tone2 ? 1.45 : 1.12;
  const skyTop = new THREE.Color(look2 ? 0x86b3cf : promo ? 0x8cb8d4 : 0x7fb2d8), skyHorizon = new THREE.Color(tone2 ? 0xdde6e2 : look2 ? 0xe9c995 : promo ? 0xfbe0b4 : 0xf2e2c0);
  scene.background = skyGradient(skyTop, skyHorizon, tone2 ? '#cfd6c2' : promo ? '#e9c58f' : '#d9cfae');
  scene.fog = tone2 ? (oldLight ? new THREE.Fog(0xdfe2cc, 25, 95) : new THREE.Fog(0xe2dcc0, 38, 135)) : look2 ? new THREE.Fog(0xd9b07a, 12, 125) : promo ? new THREE.Fog(0xedd3a2, 32, 175) : new THREE.Fog(0xe6dcc0, 45, 230);

  const hemi = tone2 ? new THREE.HemisphereLight(0xd8e4ea, 0x4e5034, 0.4) : look2 ? new THREE.HemisphereLight(0xffd9a0, 0x5a4020, 0.85) : promo ? new THREE.HemisphereLight(0xffe4b3, 0x6a5326, 1.05) : new THREE.HemisphereLight(0xdcecff, 0x5d6b3a, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(tone2 ? 0xffbc62 : look2 ? 0xffc36a : promo ? 0xffcd86 : 0xffe2b0, tone2 ? 3.9 : look2 ? 3.8 : promo ? 3.0 : 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3; // 0251/0253：路面阴影阶梯纹。three r182 的 PCF 按 radius 模糊边缘（默认 1）
  scene.add(sun, sun.target);
  const _sd = new THREE.Vector3(), _sr = new THREE.Vector3(), _su = new THREE.Vector3(), _sb = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  // 补光：跟着镜头从正面照，柔化脸部；轮廓光从背后勾边。都不投影。
  // ?look=old 复现改之前（人物接收阴影、无补光）；默认 new；env = new + 人物环境反射（眼睛和皮肤的高光更自然）
  const look = new URLSearchParams(location.search).get('look') || 'env';
  const fill = new THREE.DirectionalLight(0xfff1dc, look === 'old' ? 0 : 0.55);
  const rim = new THREE.DirectionalLight(look2 ? 0xffd28a : 0xcfe3ff, look === 'old' ? 0 : look2 ? 0.8 : 0.45); // 宣传片：人物和叶子边缘的金色轮廓光
  // 只给人物用的环境反射贴图（不影响场景）
  let charEnv: THREE.Texture | null = null;
  if (look === 'env') { const pm = new THREE.PMREMGenerator(renderer); charEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
  scene.add(fill, fill.target, rim, rim.target);
  // 0107 原画：太阳在拱后（逆光），朝镜头的墙面、树干、路面全在背光面。加一盏从镜头一侧左上方照来的暖光（不投影），像原画那样照亮正面
  const warmFront = new THREE.DirectionalLight(0xffc880, tone2 ? 0.35 : 0); warmFront.name = 'warm_front'; warmFront.userData.off = [-10, 16, 26];
  scene.add(warmFront, warmFront.target);
  const spotFollow = new URLSearchParams(location.search).get('lightfix') !== '0';
  const washFix = new URLSearchParams(location.search).get('wash') !== '0';
  // v67（用户：人物比环境亮）：原来 13° 的窄光圈像追光只罩住人物；保留聚光，但减半亮度、光圈放宽到约 22°、边缘全柔化（用户：可以聚光，但过头了）
  const SPOT_I = Number(new URLSearchParams(location.search).get('spotI') ?? 1.2), SPOT_A = Number(new URLSearchParams(location.search).get('spotA') ?? 0.38);
  // v38：层次感——暖光不再整片照，改成从左前上方聚光照拱门和路（中景最亮），前景两侧和远处自然暗下去
  const warmSpot = new THREE.SpotLight(0xffb85c, tone2 ? 6.0 : 0, 70, 0.22, 0.85, 0); warmSpot.name = 'warm_spot';
  warmSpot.position.set(-6, 17, 40); warmSpot.target.position.set(0, 0, 20.5); // v41：聚光主要照路面，墙留在半阴影里（对齐原画） scene.add(warmSpot, warmSpot.target);

  // 宣传片里穿过树冠的光束：几片沿阳光方向斜放的加色半透明面，跟着玩家所在的格子走
  let rays: THREE.Group | null = null;
  if (promo) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d')!;
    const v = g.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, 'rgba(255,226,160,0)'); v.addColorStop(0.25, 'rgba(255,226,160,1)'); v.addColorStop(1, 'rgba(255,226,160,0)');
    g.fillStyle = v; g.fillRect(0, 0, 64, 256);
    const h = g.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = h; g.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    rays = new THREE.Group(); rays.name = 'sun_rays';
    const dir = SUN.clone().normalize();
    const rnd = (i: number) => ((Math.sin(i * 91.7) * 43758.5) % 1 + 1) % 1;
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8 + rnd(i) * 2.4, 30), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      const off = new THREE.Vector3((i / 6 - 0.5) * 22 + (rnd(i + 3) - 0.5) * 3, 0, -6 - rnd(i + 7) * 14);
      m.position.copy(off).addScaledVector(dir, 8); m.position.y = 6 + rnd(i + 1) * 2;
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); m.rotateY(rnd(i + 5) * Math.PI);
      m.renderOrder = 5; rays.add(m);
    }
    scene.add(rays);
  }

  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);
  // 远景层：浮岛、瀑布、云海、太阳光晕（宣传片 5s / 8s）
  const backdrop = promo ? createBackdrop(SUN.clone()) : null;
  if (backdrop) scene.add(backdrop.group);
  // 宣传片 8s：拱门后面透出一片暖光——门北侧的发光光晕 + 一盏暖色点光照亮拱内侧和路面
  if (look2) {
    const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gg = gc.getContext('2d')!;
    const gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,236,180,1)'); gr.addColorStop(0.35, 'rgba(255,214,140,0.6)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128); const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, transparent: true, opacity: 0.6, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    glow.position.set(0, 2.2, 9.5); glow.scale.set(8, 6, 1); (glow.material as THREE.SpriteMaterial).opacity = tone2 ? 0.2 : 0.38; glow.name = 'arch_glow'; scene.add(glow);
    const archLight = new THREE.PointLight(tone2 ? 0xffdc9a : 0xffc070, tone2 ? 10 : 16, 14, 1.6); archLight.position.set(0, 2.4, 12.5); archLight.name = 'arch_light'; scene.add(archLight);
  }
  // 泛光：只让很亮的地方（太阳、高光、光束）发一点光；低画质或分辨率降到 0.85 以下时关掉。?bloom=0 关闭
  const bloomOn = () => promo && qParam !== 'low' && new URLSearchParams(location.search).get('bloom') !== '0' && prNow >= 1.0;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // 环境光遮蔽（树根、石缝、灌木底部的柔和暗部，动画电影观感的关键之一）；低画质或 ?ao=0 关闭
  const aoOn = look2 && qParam !== 'low' && new URLSearchParams(location.search).get('ao') === '1'; // 默认关：多画一遍整个场景（绘制翻倍），还会把拱后的发光压成灰色
  if (aoOn) { const ao = new GTAOPass(scene, camera, innerWidth, innerHeight); ao.blendIntensity = 0.85; ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1.0 }); composer.addPass(ao); (window as any).__ao = ao; }
  const bloom = tone2 ? new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.45, 0.7, 0.82) : look2 ? new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6, 0.75, 0.72) : new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.55, 0.86);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  // v57（用户 11-02：对比太高，树干发红）：对比 / 饱和 / 金色亮部都收回来；?grade2=v56 看旧调色
  const soft = tone2 && new URLSearchParams(location.search).get('grade2') !== 'v56';
  if (look2) composer.addPass(new ShaderPass({ // 调色：饱和度、暖色暗部、轻微对比、暗角（在色调映射之后、sRGB 上做）
    uniforms: { tDiffuse: { value: null }, uContrast: { value: soft ? 1.02 : tone2 && !oldLight ? 1.13 : 1.06 }, sat: { value: soft ? 0.96 : tone2 ? 1.18 : 1.22 }, warmDark: { value: soft ? new THREE.Vector3(0.015, 0.012, 0.0) : tone2 ? (oldLight ? new THREE.Vector3(0.0, 0.015, 0.01) : new THREE.Vector3(0.03, 0.012, -0.012)) : new THREE.Vector3(0.07, 0.035, -0.02) }, gold: { value: soft ? new THREE.Vector3(1.04, 1.03, 0.94) : tone2 ? new THREE.Vector3(1.1, 1.04, 0.8) : new THREE.Vector3(1.05, 1.0, 0.9) }, uSunUV: { value: new THREE.Vector2(-1, -1) }, uSunAmt: { value: 0 }, uAspect: { value: innerWidth / innerHeight } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uContrast; uniform float sat; uniform vec3 warmDark; uniform vec3 gold; uniform vec2 uSunUV; uniform float uSunAmt; uniform float uAspect; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, sat);                                   // 饱和
        c += warmDark * (1.0 - smoothstep(0.0, 0.6, l)); // 暗部偏暖棕
        c = mix(c, c * gold, smoothstep(0.5, 1.0, l));    // 亮部偏金
        c = (c - 0.5) * uContrast + 0.5;                                    // 对比
        // 太阳光晕（原画左上角被树挡住的太阳）：屏幕上以太阳为中心的一大片暖光，盖过叶子边缘，按「滤色」叠加
        vec2 sd = (vUv - uSunUV) * vec2(uAspect, 1.0); float r = length(sd);
        vec3 g = uSunAmt * (vec3(1.0, 0.84, 0.52) * 0.7 * exp(-r * 2.2) + vec3(1.0, 0.95, 0.78) * 0.6 * exp(-r * 7.0));
        c = 1.0 - (1.0 - c) * (1.0 - clamp(g, 0.0, 1.0));
        float v = smoothstep(0.95, 0.35, length(vUv - 0.5));
        c *= mix(0.78, 1.0, v);                                        // 暗角
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
  }));
  const gradePass = look2 ? composer.passes[composer.passes.length - 1] as ShaderPass : null;
  const sunGlow = { value: tone2 && new URLSearchParams(location.search).get('glow') !== '0' ? (oldLight ? 1.2 : 0.7) : 0 }; (window as any).__qhdSunGlow = sunGlow;
  // v40：按 L（或 F3 面板的按钮）切换「左上角太阳 + 光晕」和「原来的太阳位置、不加光晕」，方便对比
  const toggleSun = () => {
    if (!tone2) return;
    const on = sunGlow.value === 0; sunGlow.value = on ? 1.2 : 0; SUN.copy(on ? SUN_TOPLEFT : SUN_OLD);
    if (gradePass && !on) gradePass.uniforms.uSunAmt.value = 0;
    ui.toast?.(on ? '太阳光晕：开（左上角）' : '太阳光晕：关');
  };
  (window as any).__qhdToggleSun = toggleSun;
  addEventListener('keydown', (e) => { if (e.code === 'KeyL' && !e.repeat) toggleSun(); });
  composer.setPixelRatio(prNow); composer.setSize(innerWidth, innerHeight);
  addEventListener('resize', () => { if (gradePass) gradePass.uniforms.uAspect.value = innerWidth / innerHeight; renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

  const ph = await Physics.create();
  const input = new Input(renderer.domElement);
  const ui = new UI();
  const game = new Game(ph, scene, ui, input);
  // v58：对话泡跟着说话人（头顶上方的屏幕坐标；人不在画面里或被藏起来时返回 null）
  ui.anchor = (who) => {
    const a = game.actors[who]; if (!a || !a.root.visible) return null;
    const p = a.pos.clone(); p.y += a.def.height + 0.8; p.project(camera); // 放在名字牌上面
    if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) return null;
    return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
  };
  applyGrade(grade);
  if (new URLSearchParams(location.search).get('jump')) game.noSave = true; // ?jump 测试：一开始就不写存档，不影响孩子的进度
  if (promo) { const fh = scene.getObjectByName('far_hills'); if (fh) fh.visible = false; } // 远山灰盒由远景层代替
  // v38：灰盒占位的颜色是按旧暖橙灯光配的，v37 的强暖阳 + 正面暖光 + 曝光下被冲成刺眼的柠檬黄。只压暗灰盒（Codex 模型不在这里，不受影响）
  if (tone2) {
    const gb = scene.getObjectByName('chapter1_graybox'), seen = new Set<THREE.Material>(), hsl = { h: 0, s: 0, l: 0 };
    gb?.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; for (const mat of ([] as THREE.Material[]).concat(m.material)) {
      const sm = mat as THREE.MeshStandardMaterial; if (seen.has(mat) || !sm.isMeshStandardMaterial || sm.map || !sm.color) continue; seen.add(mat);
      sm.color.getHSL(hsl); sm.color.setHSL(hsl.h, hsl.s * 0.8, hsl.l * 0.72);
    } });
  }
  ph.step();

  // 资产接入：?model_<角色id>=<GLB 地址> 用交付的模型替换该角色的灰盒外观（QA 用）
  const params = new URLSearchParams(location.search);
  let fpsCap = 60; try { const v = Number(localStorage.getItem('qhd_fpscap') ?? params.get('fpscap') ?? 60); if ([0, 30, 60].includes(v)) fpsCap = v; } catch { /* */ }
  // 发布版可以在页面里写 window.__DEFAULT_MODELS = { tangtuan: 'models/x.glb', anim_hanhan: 'tangtuan', ... }，地址里没有 model_ 参数时使用；?gray=1 强制灰盒
  const defaults = (window as any).__DEFAULT_MODELS as Record<string, string> | undefined;
  if (defaults && !params.has('gray') && ![...params.keys()].some((k) => k.startsWith('model_'))) {
    for (const [k, v] of Object.entries(defaults)) { const k2 = k.startsWith('anim_') || k.startsWith('prop_') || k.startsWith('env_') || k.startsWith('fix_') || k.startsWith('flag') || k.startsWith('griplib_') || k === 'butterflies' ? k : 'model_' + k; if (!params.has(k2)) params.set(k2, v); } // 地址里已有的（如 env_manifest 对比旧版）优先
  }
  for (const [k, v] of params) {
    const id = k.startsWith('model_') ? k.slice(6) : '';
    if (id && game.actors[id]) {
      import('./assets').then(async ({ loadGLB }) => {
        const m = await loadGLB(v);
        // ?fix_<id>=<idle_tracks.json>：替换某段动作里的几条骨骼轨道（0185：派派站立左手拇指朝前，只换 LeftHandThumb1）
        const fx = params.get('fix_' + id);
        if (fx) try {
          const T = await (await fetch(fx)).json(), clip = m.animations.find((c) => c.name === T.clip);
          for (const t of T.tracks) { if (t.only === false) continue; const tr = clip?.tracks.find((k) => k.name === t.bone + '.quaternion'); if (tr && (!T.apply || T.apply.includes(t.bone))) { tr.times = Float32Array.from(t.times); tr.values = Float32Array.from(t.values); } }
          (window as any).__qhd.fix = { ...((window as any).__qhd.fix || {}), [id]: T.apply ?? T.tracks.map((t: { bone: string }) => t.bone) };
        } catch (e) { console.error('动作修正加载失败', id, e); }
        return { m, loadGLB };
      }).then(({ m, loadGLB }) => {
        game.actors[id].useModel(m.scene, m.animations);
        // ?anim_<id>=<另一个人物id>：本人模型没有动作时，借用同一套骨架的人物的动作片段（例如涵涵借汤团的）
        const link = () => {
          for (const [k2, src] of params) {
            if (!k2.startsWith('anim_')) continue;
            const dst = game.actors[k2.slice(5)], from = game.actors[src];
            if (dst?.model && !dst.anim && from?.clips.length) {
              // 本人原生片段优先（涵涵自己的 cheer / skill_command），缺的站走跑从借用对象补
              const own = new Set(dst.clips.map((c) => c.name));
              dst.setClips([...dst.clips, ...from.clips.filter((c) => !own.has(c.name))], from.def.walk, from.def.run, src);
            }
          }
        };
        link(); setTimeout(link, 3000); setTimeout(link, 8000);
        // 0267 ?griplib_<id>=<动作库 GLB>：吊桥起风抓扶绳（左右手各 in / loop / out），按本人骨架
        const gl = params.get('griplib_' + id);
        if (gl) loadGLB(gl).then((lib) => {
          const tryAdd = () => game.actors[id].addClips(lib.animations);
          let ok = tryAdd(); if (!ok) { setTimeout(() => { ok = tryAdd(); }, 3500); setTimeout(() => { if (!ok) tryAdd(); }, 9000); }
          (window as any).__qhd.grip = { ...((window as any).__qhd.grip || {}), [id]: lib.animations.map((c) => c.name) };
        }).catch((e) => console.error('抓绳动作库加载失败', id, e));
        // ?prop_<id>=<道具 GLB>：挂到该人物的 prop_R 挂点（派派的放大镜）
        const pu = params.get('prop_' + id);
        if (pu) loadGLB(pu).then((pm) => {
          pm.scene.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh && charEnv) for (const mt of ([] as THREE.Material[]).concat(mesh.material)) { const sm = mt as THREE.MeshStandardMaterial; if (sm.isMeshStandardMaterial) { sm.envMap = charEnv; sm.envMapIntensity = 0.45; } } });
          (window as any).__qhd.props = { ...((window as any).__qhd.props || {}), [id]: game.actors[id].attachProp(pm.scene) };
        });
        // v56 ?flag_<id>=<旗 GLB>&flaglib_<id>=<举旗动作库 GLB>：涵涵右手常持队长旗（Codex 0193）
        const fu = params.get('flag_' + id), fl = params.get('flaglib_' + id);
        if (fu && fl) Promise.all([loadGLB(fu), loadGLB(fl), import('./scene_manifest')]).then(([pm, lib, sm]) => {
          pm.scene.traverse((o) => { const mesh = o as THREE.Mesh; if (!mesh.isMesh) return; mesh.castShadow = true; mesh.receiveShadow = false; if (charEnv) for (const mt of ([] as THREE.Material[]).concat(mesh.material)) { const st = mt as THREE.MeshStandardMaterial; if (st.isMeshStandardMaterial) { st.envMap = charEnv; st.envMapIntensity = 0.45; } } });
          const wind = sm.applyWind(pm.scene, 0.02);
          const ok = game.actors[id].attachFlag(pm.scene, lib.animations);
          (window as any).__qhd.flag = { ...((window as any).__qhd.flag || {}), [id]: { ok, wind, tris: pm.triangles } };
        }).catch((e) => console.error('旗加载失败', id, e));
        m.scene.traverse((o) => {
          const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
          if (look === 'old') mesh.receiveShadow = true;
          if (charEnv) for (const mt of ([] as THREE.Material[]).concat(mesh.material)) { const sm = mt as THREE.MeshStandardMaterial; if (sm.isMeshStandardMaterial) { sm.envMap = charEnv; sm.envMapIntensity = 0.45; sm.needsUpdate = true; } }
        });
        (window as any).__qhd.look = look;
        (window as any).__qhd.models = { ...((window as any).__qhd.models || {}), [id]: { clips: m.animations.map((c) => c.name), ms: m.ms, triangles: m.triangles, meshes: m.meshes, materials: m.materials, textures: m.textures, size: m.bbox.getSize(new THREE.Vector3()).toArray(), min: m.bbox.min.toArray() } };
      }).catch((e) => console.error('模型加载失败', id, e));
    }
  }

  // ?env_gate=<GLB>：第一章入口双锁石门换成 Codex 的模型（0069）
  const envGate = params.get('env_gate');
  if (envGate) import('./assets').then(({ loadGLB }) => loadGLB(envGate)).then(async (m) => {
    const { useGateModel } = await import('./level/chapter1');
    useGateModel(game.level, m.scene, scene);
    (window as any).__qhd.env = { ...((window as any).__qhd.env || {}), gate: { triangles: m.triangles, meshes: m.meshes, materials: m.materials, textures: m.textures, ms: m.ms } };
  }).catch((e) => console.error('石门模型加载失败', e));

  // ?env_manifest=<清单>：按 Codex 的批量交付清单摆放场景模型（不改代码）
  const envMan = params.get('env_manifest');
  // 可以用逗号接多个清单，按顺序加载（例如先第一章机关道具，再入口样板）
  let windT: { value: number } | null = null;
  let life: { update(p: THREE.Vector3): void } | null = null;
  // 0105：灰盒里剩下的草、花、树冠也接同一个风场（有没有场景清单都动）
  import('./scene_manifest').then(({ applyWind, windTime, windStats, canopyDapple }) => {
    (window as any).__qhdDapple = canopyDapple;
    windT = windTime;
    for (const n of ['graybox_crowns', 'graybox_crowns2', 'graybox_tufts', 'graybox_flowers']) { const o = scene.getObjectByName(n); if (o) applyWind(o, 0.25); }
    (window as any).__qhd.wind = { time: windTime, stats: windStats };
    if (tone2 && new URLSearchParams(location.search).get('life') !== '0') import('./life').then(({ createLife }) => { life = createLife(scene, windTime, (params.get('butterflies') || '').split(',').filter(Boolean)); }); // v54：蝴蝶 / 浮尘 / 落叶 / 萤火
  });
  // 0310：新放进场景的模型先隐藏，异步编译着色器（KHR_parallel_shader_compile）并分帧上传贴图，好了再显示。
  // Windows 实测：边走边加载时每来一批模型主线程同步编译+传贴图，进门后卡顿、石头先出黑色轮廓。?warm=0 关闭
  const warmStats = { items: 0, textures: 0, ms: 0 };
  async function warmObjects(objs: THREE.Object3D[]) {
    const t0 = performance.now(); const vis = objs.map((o) => o.visible); objs.forEach((o) => (o.visible = false));
    try {
      await Promise.all(objs.map((o) => renderer.compileAsync(o, camera, scene)));
      const tex = new Set<THREE.Texture>();
      for (const o of objs) o.traverse((m: any) => { for (const mt of [].concat(m.material ?? [])) for (const v of Object.values(mt as object)) if ((v as THREE.Texture)?.isTexture) tex.add(v as THREE.Texture); });
      let n = 0; for (const t of tex) { renderer.initTexture(t); if (++n % 4 === 0) await new Promise((r) => requestAnimationFrame(r)); }
      warmStats.textures += tex.size; warmStats.items++;
    } catch (e) { console.warn('warm', e); }
    objs.forEach((o, i) => (o.visible = vis[i])); warmStats.ms += performance.now() - t0;
  }
  let farL: { obj: THREE.Object3D; hideBelow: number }[] = [];
  let environmentBatchHandle: ReturnType<typeof batchStaticEnvironment> | null = null;
  let zones: { update(dt: number, z: number): void; stats: object } | null = null;
  if (envMan) import('./scene_manifest').then(async ({ applyManifest, windTime, farLayers, setWarmup, manifestProgress }) => { windT = windTime; farL = farLayers; (window as any).__qhdManifestProgress = manifestProgress;
    if (params.get('warm') !== '0') setWarmup(warmObjects); const all = []; for (const u of envMan.split(',')) all.push(...await applyManifest(game.level, scene, u, game.ph)); return all; }).then((rep) => {
    (window as any).__qhd.manifest = rep;
    cinematicFoliage.refresh();
    deerContactShade = installDeerContactShade(THREE, scene);
    (window as any).__qhd.deerContactShade = deerContactShade?.stats;
    (window as any).__qhd.cinematicFoliage = cinematicFoliage.stats;
    // 用户（11-06）：活动区域扩大——近景能看到的地面都能走上去。按新美术的地表 / 岩石网格生成静态碰撞（三角形，世界坐标），
    // 然后拆掉只为灰盒小路设的隐形墙；跳过谜题的边界（石门一线、藤墙一线、峡谷边、对岸）保留，巨石坡两侧等推走巨石后再开。?roam=0 关闭
    if (params.get('roam') !== '0') {
      const INC = /FORK_surface_(earth|moss|stone)|boundary_banks|boundary_rocks|ground_transition|natural_bank|soft_bank|style_soil|bedrock|strata|rootflare|trunk_roots|stone_path|walkrock|rock_toe|ground_v0|_ground_|glade_mass|glade_right_rocks/i;
      const EXC = /canyon|water|FLOW|COL_|MK_|leaf|foliage|grass|fern|bush|flower|moss_pile|vine|crown|canopy|herb/i;
      const B = { x0: -30, x1: 30, z0: -100, z1: 34, y0: -2.5, y1: 14 };
      const gray = scene.getObjectByName('chapter1_graybox');
      const verts: number[] = [], idx: number[] = []; let meshes = 0;
      const tri = new THREE.Vector3(), tb = new THREE.Vector3(), tc = new THREE.Vector3(), M4 = new THREE.Matrix4(), MI = new THREE.Matrix4();
      const vis = (o: THREE.Object3D | null) => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === gray) return false; } return true; };
      scene.updateMatrixWorld(true);
      scene.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh || !INC.test(m.name) || EXC.test(m.name) || !vis(m)) return;
        // 远景层的外圈山坡（rim_*）也铺：不然从能走的地方走进去会穿过看得见的地面；太陡（>48°）的照样爬不上去
        const g = m.geometry, pos = g.getAttribute('position'); if (!pos) return;
        const index = g.index ? g.index.array : null, n = index ? index.length : pos.count;
        const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh) : null;
        const count = inst ? inst.count : 1; meshes++;
        for (let c = 0; c < count; c++) {
          if (inst) { inst.getMatrixAt(c, MI); M4.multiplyMatrices(m.matrixWorld, MI); } else M4.copy(m.matrixWorld);
          for (let k = 0; k + 2 < n; k += 3) {
            const a = index ? index[k] : k, b2 = index ? index[k + 1] : k + 1, c2 = index ? index[k + 2] : k + 2;
            tri.fromBufferAttribute(pos as THREE.BufferAttribute, a).applyMatrix4(M4); tb.fromBufferAttribute(pos as THREE.BufferAttribute, b2).applyMatrix4(M4); tc.fromBufferAttribute(pos as THREE.BufferAttribute, c2).applyMatrix4(M4);
            const cx = (tri.x + tb.x + tc.x) / 3, cy = (tri.y + tb.y + tc.y) / 3, cz = (tri.z + tb.z + tc.z) / 3;
            if (cx < B.x0 || cx > B.x1 || cz < B.z0 || cz > B.z1 || cy < B.y0 || cy > B.y1) continue;
            if (cz < -50.3 && cz > -71.7) continue; // 峡谷里不铺（掉下去照旧回到安全处）
            const base = verts.length / 3; verts.push(tri.x, tri.y, tri.z, tb.x, tb.y, tb.z, tc.x, tc.y, tc.z); idx.push(base, base + 1, base + 2);
          }
        }
      });
      if (idx.length > 3000) {
        game.ph.trimesh(new Float32Array(verts), new Uint32Array(idx));
        const n = game.level.roam?.open(game.ph) ?? 0;
        (window as any).__qhd.roam = { meshes, triangles: idx.length / 3, wallsRemoved: n };
      } else (window as any).__qhd.roam = { meshes, triangles: idx.length / 3, skipped: true };
    }
    // 第一章收尾（11-08）：绘制预算。1）细小地被（草、蕨、花、落叶、碎石、苔）不投影——影子几乎看不见，却占了大半阴影 pass 的绘制；
    // 2）新美术里半径 <12 m 的单件，离镜头超过 75 m 就不画（庭院回看岔路口那一片约一半调用在 70 m 外）。远景层（far_layer）、机关、人物不动。?cull=0 关闭
    if (params.get('cull') !== '0') {
      const SMALL = /grass|fern|flower|litter|pebble|moss|herb|fallen_leaves|tuft|petal|mushroom|clover|short_/i;
      const MECH = /boulder|winch|plate|ropeclip|counterweight|gate|bridge|kit_|vine_rope|hook|deer|plank|board/i;
      let noShadow = 0; const far: { m: THREE.Object3D; c: THREE.Vector3; r: number; out: boolean }[] = [];
      const box = new THREE.Box3(), sph = new THREE.Sphere();
      const movingOrFar = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (MECH.test(p.name)) return true; return false; };
      scene.updateMatrixWorld(true);
      scene.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh || (m as any).isSkinnedMesh) return;
        let envRoot: THREE.Object3D | null = null, gray = false;
        for (let p: THREE.Object3D | null = m; p; p = p.parent) { if (/^env_/.test(p.name)) envRoot = p; if (p.name === 'chapter1_graybox') gray = true; }
        if (!envRoot && !(gray && /^graybox_/.test(m.name))) return;      // 只管新美术和灰盒静态装饰
        if (envRoot && SMALL.test(m.name + ' ' + envRoot.name) && m.castShadow) { m.castShadow = false; noShadow++; }
        if ([].concat(m.material as any).some((mt: any) => mt?._farDone) || movingOrFar(m)) return;
        box.setFromObject(m); if (box.isEmpty()) return; box.getBoundingSphere(sph);
        if (sph.radius < 12) far.push({ m, c: sph.center.clone(), r: sph.radius, out: false });
      });
      // 用渲染层隐藏（不碰 visible，分区显隐和机关显示照常）：层 0 是相机和阴影相机都看的层
      let next = 0;
      const tick = () => {
        const now = performance.now(); if (now < next) return; next = now + 250;
        const cp = camera.position;
        for (const e of far) { const out = cp.distanceTo(e.c) - e.r > 75; if (out !== e.out) { e.out = out; if (out) e.m.layers.set(5); else e.m.layers.set(0); } }
      };
      (window as any).__qhd.cull = { noShadow, distance: far.length, tick };
    }
    // v70（用户：过不去的地方露出灰色）：灰盒地台（777f46 方块）去掉侧面，只留贴地顶面，换成新美术的苔草地材质（按世界坐标铺），并往后压深度让新地形优先
    { let moss: THREE.MeshStandardMaterial | null = null;
      scene.traverse((o: any) => { for (const m of [].concat(o.material || [])) if ((m as any)?.name === 'FORK_moss_intrinsic_neutral_v006' && (m as any).map) moss = m as any; });
      if (moss) {
        const mat = (moss as THREE.MeshStandardMaterial).clone(); mat.name = 'graybox_floor_moss'; mat.polygonOffset = true; mat.polygonOffsetFactor = 2; mat.polygonOffsetUnits = 2; mat.vertexColors = false;
        if (mat.map) { mat.map = mat.map.clone(); mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(1, 1); mat.map.offset.set(0, 0); mat.map.needsUpdate = true; }
        const slabs: THREE.Mesh[] = [];
        scene.traverse((o: any) => { if (o.isMesh && !o.isInstancedMesh && o.geometry?.type === 'BoxGeometry' && !Array.isArray(o.material) && o.material?.color?.getHex() === 0x777f46) slabs.push(o); });
        for (const o of slabs) {
          o.updateWorldMatrix(true, false); const bb = new THREE.Box3().setFromObject(o);
          const w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z, g = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(d / 2))); g.rotateX(-Math.PI / 2);
          const uv = g.getAttribute('uv'), pos = g.getAttribute('position'); const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + cx) / 4, (pos.getZ(i) + cz) / 4);
          const top = new THREE.Mesh(g, mat); top.position.set(cx, bb.max.y - 0.005, cz); top.receiveShadow = true; top.name = 'graybox_floor_top';
          o.visible = false; o.parent?.add(top); if (o.parent) { o.parent.updateWorldMatrix(true, false); top.position.applyMatrix4(o.parent.matrixWorld.clone().invert()); }
        }
        (window as any).__qhd.grayFloors = slabs.length;
      } }
    // 0316（用户 Windows 截图）：树冠满是黑色碎斑——薄叶片卡在自己身上算阴影（阴影噪点）。树冠叶片不接收阴影（仍投影），
    // 地面草、蕨、灌木照旧接收。必须在合批前设置（合批按 receiveShadow 分组）。?leafshadow=1 恢复
    if (params.get('leafshadow') !== '1') { let n = 0; scene.traverse((o: any) => { if (o.isMesh && o.receiveShadow && /crown|canopy|foliage|spray|lobe|leaves|leaf_card|treewall|tree_.*leaf/i.test(o.name) && !/COL_|MK_|bark|trunk|root|stem|litter|fallen|vine_leaf|grass|fern|bush|herb/i.test(o.name)) { o.receiveShadow = false; n++; } }); (window as any).__qhd.leafNoRecv = n; }
    // 0310 第 7 项：石头脚下的接触暗斑（合批前收集，物理碰撞就绪后摆放）
    if (params.get('contact') !== '0') { const cb = collectContactBlobs(scene); setTimeout(() => { try { (window as any).__qhd.contact = cb.finish((f, d, m) => game.ph.ray(f, d, m)).stats; } catch (e) { console.warn('contact', e); } }, 1500); }
    if (params.get('render_batches') !== '0') { const h = (renderer.extensions.has('WEBGL_multi_draw') && params.get('render_multidraw') !== '0' ? batchMultiDrawEnvironment : batchStaticEnvironment)(THREE, scene, farL); environmentBatchHandle = h; (window as any).__qhd.environmentBatches = h.stats; cinematicFoliage.refresh(); if (params.get('warm') !== '0' && h.groups?.length) void warmObjects(h.groups); }
    intro.envReady(); clearInterval(progTimer);
    if (new URLSearchParams(location.search).get('zone') !== '0') import('./scene_manifest').then(({ makeZoneCuller, farIdSet }) => { zones = makeZoneCuller(scene, farIdSet); (window as any).__qhd.zones = zones.stats; });
    if (tone2 && new URLSearchParams(location.search).get('dense') !== '0' && !/botanical/.test(envMan || '')) setTimeout(() => Promise.all([import('./atmosphere'), import('./codex/v49_art_compat')]).then(([{ densifyPlants }, { shouldSkipDensePlant }]) => { // v49：路边植被加密（等新碰撞进物理查询后再贴地）；0179：跳过新模型已铺植物的区域，避开桥头机关岗位
      const L = game.level, avoid = [...L.lures, ...L.gate.pads, ...L.pads, L.deerState.calmPad].map((p) => p.pos.clone());
      (window as any).__qhd.dense = densifyPlants(scene, (f, d, m) => game.ph.ray(f, d, m), avoid, 120000, shouldSkipDensePlant, /landscape_v([3-9]|\d\d)/.test(envMan || '') ? ['slope', 'bridgehead', 'glade'] : []);
    }), 1200);
    // v54：门后到岔路口（z −1…8.6）和庭院还剩的旧灰盒尖锥草 / 灰盒花 / 低模树冠整组收起（新模型都已铺到），?gray_veg=1 恢复
    if (new URLSearchParams(location.search).get('gray_veg') !== '1') {
      for (const n of ['graybox_tufts', 'graybox_flowers', 'graybox_crowns', 'graybox_crowns2']) { const o = scene.getObjectByName(n); if (o) o.visible = false; }
      // 0269（用户截图）：灰盒树冠收起后，没有名字的旧灰盒树干（实例化圆柱 .18/.28/2.6）还露着，一起收起
      scene.getObjectByName('chapter1_graybox')?.traverse((o) => {
        const im = o as THREE.InstancedMesh; const g = im.geometry as THREE.CylinderGeometry; const p = g?.parameters;
        if (im.isInstancedMesh && g?.type === 'CylinderGeometry' && p && Math.abs(p.radiusTop - 0.18) < 1e-5 && Math.abs(p.radiusBottom - 0.28) < 1e-5 && Math.abs(p.height - 2.6) < 1e-5) im.visible = false;
      });
    }
    // 0179：四根牵引绳 + U 形桥姿态；旧崖灰盒按精确位置 / 尺寸隐藏；鹿角和笔记石挂点
    Promise.all([import('./codex/bridge_pose'), import('./codex/v49_art_compat'), import('./codex/interaction_markers')]).then(([{ prepareHaulUpdater }, { hideLegacyCliffs }, { installInteractionMarkers }]) => {
      const Q = (window as any).__qhd, info: Record<string, unknown> = {};
      const haul = scene.getObjectByName('env_ch1_canyon_haul_art_v001_0');
      if (haul) { try { game.level.bridge.haul = prepareHaulUpdater(THREE, haul); info.haul = 4; } catch (e) { info.haul = String(e); } }
      if (scene.getObjectByName('env_ch1_canyon_layers_v004_0')) info.legacyCliffsHidden = hideLegacyCliffs(scene.getObjectByName('chapter1_graybox')!);
      const deer = scene.getObjectByName('env_ch1_moss_deer_v002_0'), note = scene.getObjectByName('env_ch1_leaf_note_stone_v001_0');
      if (deer && note) { try { const mk = installInteractionMarkers(THREE, deer, note); game.level.deerFx = addAntlerGlow(mk.antler); info.markers = 2; } catch (e) { info.markers = String(e); } }
      import('./scene_manifest').then(({ mistCount }) => { info.mistSprites = mistCount; });
      Q.art0179 = info;
    });
    // v41：石墙 / 石板比原画亮太多：石头材质整体压暗（临时，等 Codex 按 0104 调好石头底色后去掉）
    // v44 的临时挂牌已去掉：0139 门 v005 自带浅色石牌和前移的刻字
    const STONE_TINT = new THREE.Color(0.84, 0.81, 0.74); // v42：只降亮度、略去黄（原画石头是浅灰米色，不是米黄）
    if (tone2) { const seen = new Set<THREE.Material>(); scene.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; for (const mat of ([] as THREE.Material[]).concat(m.material)) { const sm = mat as THREE.MeshStandardMaterial; if (seen.has(mat) || !/stone/i.test(mat.name || '') || /_v00[4-9](\.\d+)?$/.test(mat.name || '') /* 0119：v004 墙 / 路面石材已调好底色，不再乘临时系数 */ || !sm.color) continue; seen.add(mat); sm.color.multiply(STONE_TINT); } }); }
  }).catch((e) => { console.error('场景清单加载失败', e); (window as any).__qhd.manifest = [{ id: 'manifest', ok: false, err: String(e) }]; });

  // 镜头参数
  // 镜头：比原来低一点、近一点，让人物更大、环境把人物包起来（宣传片构图）；滚轮仍可 2.5–7 m
  const cam = { yaw: 0, pitch: look2 ? 0.24 : 0.32, dist: look2 ? 3.9 : 4.5, target: new THREE.Vector3() };
  let playing = false, paused = false, finished = false;

  // 入口按钮由 intro.ts 接管：动画放完且加载好以后才调用 start
  bootStage = 1;
  intro.ready({ start: (resume) => start(resume), clearSave: () => game.clearSave() });
  if (!envMan) { intro.envReady(); clearInterval(progTimer); }

  // 背景音乐（程序合成，M 键开关；?music=0 关闭）
  let music: Music | null = null; (window as any).__qhdMusic = Music; // 测试用：离线渲染试听
  let voice: Voice | null = null; (window as any).__qhdVoice = Voice;
  // 正式配音（Codex 0221）：默认开，V 键开关；?voice=0 关闭
  let lines: VoiceLines | null = null; const voiceUrl = params.get('voice_index') ?? (window as any).__DEFAULT_MODELS?.voice_index;
  if (voiceUrl && params.get('voice') !== '0' && params.get('voice') !== 'babble') VoiceLines.load(voiceUrl).then((v) => { lines = v; (window as any).__qhdLines = v; v.prefetch([{ who: 'hanhan', text: '地图上说，吊桥就在这片林子后面。' }, { who: 'tangtuan', text: '可是路分成了三条……' }, { who: 'hanhan', text: '我们接着走吧。' }]); if (playing) v.resume(); }).catch((e) => console.warn('配音无法加载', e));
  ui.onLine = (w, t) => { if (voice) return voice.speak(w, t) && 0; const d = lines?.speak(w, t) ?? 0; lines?.prefetch(ui.upcoming()); return d; };
  ui.onLineEnd = () => lines?.stop();
  addEventListener('keydown', (e) => { if (e.code !== 'KeyV' || !playing) return; const v = lines ?? voice; if (v) ui.toast(v.toggle() ? '配音：开（V 关闭）' : '配音：关（V 打开）', 1.6); });
  // 声音总开关（用户 11-08）：左下角喇叭按钮，一键关掉音乐和配音；状态记在本机（qhd_mute）
  const sndBtn = document.createElement('button'); sndBtn.id = 'sndBtn';
  sndBtn.style.cssText = 'position:fixed;left:16px;bottom:58px;z-index:25;width:44px;height:44px;border-radius:50%;border:2px solid rgba(122,90,50,.8);background:rgba(246,239,220,.92);font-size:20px;line-height:1;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);display:none';
  let muted = false; try { muted = localStorage.getItem('qhd_mute') === '1'; } catch { /* */ }
  const applyMute = () => {
    sndBtn.textContent = muted ? '🔇' : '🔊'; sndBtn.title = muted ? '打开声音' : '关闭声音';
    try { localStorage.setItem('qhd_mute', muted ? '1' : '0'); localStorage.setItem('qhd_music', muted ? '0' : '1'); localStorage.setItem('qhd_voice', muted ? '0' : '1'); } catch { /* */ }
    if (music && music.enabled === muted) music.toggle();
    if (lines && lines.on === muted) lines.toggle();
  };
  sndBtn.onclick = (e) => { e.stopPropagation(); muted = !muted; applyMute(); ui.toast(muted ? '声音：关' : '声音：开', 1.4); (document.querySelector('canvas') as HTMLCanvasElement | null)?.focus(); };
  document.body.appendChild(sndBtn);
  addEventListener('keydown', (e) => { if (e.code === 'KeyM' && music && playing) ui.toast(music.toggle() ? '音乐：开（M 关闭）' : '音乐：关（M 打开）', 1.6); });
  function start(resume: boolean) {
    $('title').hidden = true;
    if (!music && (window as any).__qhdEarlyMusic) music = (window as any).__qhdEarlyMusic;
    if (!music && new URLSearchParams(location.search).get('music') !== '0') { try { music = new Music(); } catch (e) { console.warn('音乐无法启动', e); } }
    music?.resume();
    if (!voice && new URLSearchParams(location.search).get('voice') === 'babble') { try { voice = new Voice(); /* 用户 11-03：卡通咿呀声不合适，默认不用，只留 ?voice=babble 备查 */ } catch (e) { console.warn('说话声无法启动', e); } }
    voice?.resume(); lines?.resume();
    applyMute(); sndBtn.style.display = 'block';
    ui.showHud(true);
    ui.party(game.squad, game.active);
    if (resume && game.load()) {
      ui.leaves(game.leaves);
      ui.say('hanhan', '我们接着走吧。', 2);
    } else {
      game.applyStage(Stage.Crossroads);
      ui.leaves([]);
      ui.say('hanhan', '地图上说，吊桥就在这片林子后面。', 3.2);
      ui.say('tangtuan', '可是路分成了三条……', 2.6);
      ui.say('paipai', '我们……一条一条看看吧。', 2.8);
    }
    // ?jump=entry|crossroads|bridge|deer：测性能用，直接跳到第一章的几个地方（不存档）
    const jump = params.get('jump'); if (jump) jumpTo(jump);
    const lp = game.leader.pos; cam.target.copy(lp).add(new THREE.Vector3(0, 1.3, 0));
    playing = true;
    renderer.domElement.focus();
  }

  /** 测性能用：跳到第一章的几个地方；跳过以后本次不再写存档 */
  function jumpTo(name: string) {
    const spots: Record<string, [number, number, number, number]> = { entry: [0, 0.05, 21, Math.PI], crossroads: [0, 0.05, -4, Math.PI], bridge: [0, 1.6, -52, Math.PI], deer: [0.3, 1.6, -79, Math.PI] };
    const s = spots[name]; if (!s) return;
    game.noSave = true;
    game.openGate(true);
    if (name === 'bridge' || name === 'deer') { game.fixRopeclip(true); if (game.stage < 5) game.applyStage(5, true); }
    const [x, y, z, yaw] = s;
    (Object.values(game.actors) as any[]).forEach((a, i) => a.teleport(new THREE.Vector3(x + (i - 1) * 1.2, y, z + (a === game.leader ? 0 : 1.4)), yaw));
    cam.yaw = 0; cam.target.copy(game.leader.pos).add(new THREE.Vector3(0, 1.3, 0));
  }
  (window as any).__qhdJump = jumpTo;
  // 调试：屏幕坐标（0–1）处是哪个网格、哪个材质
  (window as any).__qhdPick = (u: number, v: number) => { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), camera); const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent)); const h = rc.intersectObjects(scene.children, true).find((x) => (x.object as THREE.Mesh).isMesh && shown(x.object) && x.object.parent?.name !== 'sun_rays'); if (!h) return null; const m = h.object as THREE.Mesh; const mat = ([] as THREE.Material[]).concat(m.material)[0] as THREE.MeshStandardMaterial; return { mesh: m.name, parent: m.parent?.name, mat: mat.name, color: mat.color?.getHexString(), map: !!mat.map, p: h.point.toArray().map((x) => +x.toFixed(2)) }; };

  function setPaused(v: boolean) {
    if (!playing || finished) return;
    paused = v; $('pause').hidden = !v; input.enabled = !v; lines?.setPaused(v);
    if (v) input.releaseLock();
  }
  $('resume').addEventListener('click', () => setPaused(false));
  // 暂停面板：风力档位（用户 11-04；应用内打开没有网址栏，改不了 ?wind=）
  import('./scene_manifest').then(({ WIND_OPTIONS, windScale, setWindScale }) => {
    const row = $('windRow'); const names: Record<number, string> = { 0: '无风', 1: '微风', 2.5: '中风', 4: '大风' };
    const btns = WIND_OPTIONS.map((v) => { const b = document.createElement('button'); b.textContent = names[v] ?? `${v}×`; b.style.cssText = 'padding:4px 12px;font-size:14px';
      b.onclick = () => { setWindScale(v); paint(); }; row.appendChild(b); return [v, b] as const; });
    const paint = () => btns.forEach(([v, b]) => { b.className = Math.abs(v - windScale.value) < 1e-6 ? '' : 'ghost'; });
    paint();
  });
  // 0310：帧率上限（用户 11-08：笔记本发烫）。高刷屏上不限帧会跑到 120/144 帧，默认限 60；省电 30。localStorage qhd_fpscap
  { const row = document.createElement('div'); row.className = 'row'; row.style.cssText = 'align-items:center;gap:6px;margin-top:8px;font-size:14px';
    row.innerHTML = '<span style="margin-right:4px">帧率</span>'; $('windRow').after(row);
    const opts: [number, string][] = [[30, '省电 30'], [60, '60'], [0, '不限']];
    const btns = opts.map(([v, n]) => { const b = document.createElement('button'); b.textContent = n; b.style.cssText = 'padding:4px 12px;font-size:14px';
      b.onclick = () => { fpsCap = v; try { localStorage.setItem('qhd_fpscap', String(v)); } catch { /* */ } paint(); }; row.appendChild(b); return [v, b] as const; });
    const paint = () => btns.forEach(([v, b]) => { b.className = v === fpsCap ? '' : 'ghost'; }); paint(); }
  $('restart').addEventListener('click', () => { game.clearSave(); location.reload(); });
  $('again').addEventListener('click', () => { game.clearSave(); location.reload(); });
  addEventListener('keydown', (e) => { if (e.code === 'Escape') setPaused(!paused); });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && playing && !paused && !finished && lockWasOn) setPaused(true); lockWasOn = !!document.pointerLockElement; });
  let lockWasOn = false;
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  game.onDone = () => {
    finished = true; input.releaseLock();
    $('doneInfo').textContent = chapter1Completion(game.time, game.falls, game.leaves.length);
    $('done').hidden = false;
    ui.showHud(false);
  };

  // 调试与自动测试接口
  (window as any).__qhd = { warm: warmStats, game, cam, ph, renderer, scene, composer, warmFront, warmSpot, camera, fill, rim, sun, get playing() { return playing; }, get paused() { return paused; }, fps: 0, frameMs: 0, squad: CHAPTER1_SQUAD, RC: THREE.Raycaster };

  // QA uses the same pixel-ratio and bloom paths as URL presets, without reloading.
  if (params.get('qa_memory') === '1') (window as any).__qhd.setQualityForReview = (quality: string, reviewPixelRatio?: number) => {
    if (!['low', 'mid', 'high'].includes(quality)) throw new Error('Invalid review quality');
    if (reviewPixelRatio !== undefined && (!Number.isFinite(reviewPixelRatio) || reviewPixelRatio < 0.7 || reviewPixelRatio > 1.5)) throw new Error('Invalid review pixel ratio');
    qParam = quality; prNow = reviewPixelRatio ?? (quality === 'low' ? 0.85 : quality === 'mid' ? 1 : Math.min(devicePixelRatio, 1.5));
    renderer.setPixelRatio(prNow); composer.setPixelRatio(prNow); lowN = 0; highN = 0;
    (window as any).__qhd.pixelRatio = prNow;
  };
  const clock = new THREE.Clock();
  let acc = 0, fpsT = 0, frames = 0;
  const FIXED = 1 / 60;
  const camFwd = new THREE.Vector3();

  let followAssistOffset = 0, followAssistChoice = 0;
  const cameraSolids: THREE.Object3D[] = [];
  const cameraOpticalRay = new THREE.Raycaster();
  const cameraProbeCache = new Map<string, number>();
  const cameraProbeTarget = new THREE.Vector3(Infinity, Infinity, Infinity);
  let cameraProbeYaw = Infinity, cameraProbePitch = Infinity, cameraProbeTime = 0;
  const cameraAssistInfo = { offset: 0, choice: 0, probes: 0, hits: [] as string[], ranges: {} as Record<string, any> };
  let cameraSolidsReady = false;
  const cameraProbeDir = new THREE.Vector3();
  let capLast = 0;
  function frame(now = performance.now()) {
    if (fpsCap > 0) { if (now - capLast < 1000 / fpsCap - 2) { requestAnimationFrame(frame); return; } capLast = now; }
    const userOrbit = Math.abs(input.mouseDX) + Math.abs(input.mouseDY) > 0 || input.wheel !== 0;
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    fpsT += dt; frames++;
    if (fpsT > 1) {
      const fps = frames / fpsT; (window as any).__qhd.fps = Math.round(fps); fpsT = 0; frames = 0;
      if (fpsEl) fpsEl.textContent = `${Math.round(fps)} 帧/秒 · 分辨率 ×${prNow} · ${renderer.info.render.calls} 次绘制 · ${Math.round(renderer.info.render.triangles / 1000)}k 面` + ((performance as any).memory ? ` · 内存 ${Math.round((performance as any).memory.usedJSHeapSize / 1048576)} MB` : '');
      // 画质自动调节（目标：Windows 轻薄本集成显卡稳定 50 帧以上）：连续 2 秒低于 45 帧就降渲染分辨率，连续 8 秒高于 58 帧再升回去
      if (autoQ && playing && !paused) {
        const tg = fpsCap || 60; if (fps < tg * 0.75) { lowN++; highN = 0; } else if (fps > tg * 0.96) { highN++; lowN = 0; } else { lowN = 0; highN = 0; }
        const i = PR_STEPS.indexOf(prNow);
        if (lowN >= 2 && i < PR_STEPS.length - 1) { prNow = PR_STEPS[i + 1]; renderer.setPixelRatio(prNow); composer.setPixelRatio(prNow); lowN = 0; }
        else if (highN >= 8 && i > 0) { prNow = PR_STEPS[i - 1]; renderer.setPixelRatio(prNow); composer.setPixelRatio(prNow); highN = 0; }
        (window as any).__qhd.pixelRatio = prNow;
      }
    }

    if (playing && !paused && !finished) {
      // 镜头输入
      cam.yaw -= input.mouseDX * 0.0032;
      cam.pitch = THREE.MathUtils.clamp(cam.pitch + input.mouseDY * 0.0026, -0.15, 1.1);
      if (input.wheel) cam.dist = THREE.MathUtils.clamp(cam.dist + input.wheel * 0.45, 2.5, 7); // 只在滚轮时限制（QA 近景可设更近）
      input.consumeMouse();
      camera.getWorldDirection(camFwd);
      acc += dt;
      while (acc >= FIXED) {
        game.update(FIXED, t, cam.yaw + followAssistOffset, camFwd);
        ph.step();
        input.endFrame();
        acc -= FIXED;
      }
    } else {
      input.endFrame(); input.consumeMouse();
      for (const a of Object.values(game.actors)) a.sync(dt, t);
      game.level.update(dt, t);
    }
    ui.update(dt);

    // 镜头位置
    const lead = game.leader;
    const desiredTarget = lead.pos.clone().add(new THREE.Vector3(0, lead.def.height * 0.85, 0));
    cam.target.lerp(desiredTarget, Math.min(1, dt * 8));
    const ov = (window as any).__qhd?.camOverride as { pos: number[]; look: number[] } | undefined;
    if (ov) { // 测试用：固定镜头拍场景模型
      camera.position.set(ov.pos[0], ov.pos[1], ov.pos[2]); camera.lookAt(ov.look[0], ov.look[1], ov.look[2]);
    } else if (game.cinematic) {
      const c = game.cinematic;
      c.t += dt;
      const u = Math.min(1, c.t / c.dur), e = u * u * (3 - 2 * u);
      camera.position.lerpVectors(c.from, c.to, e);
      camera.lookAt(c.look); c.onTick?.(u);
      if (u >= 1) { const done = c.onDone; game.cinematic = null; done?.(); }
    } else {
      const nearStation = lead.pos.distanceTo(game.level.workbench.pos) < 3 || lead.pos.distanceTo(game.level.pads[2].pos) < 2.2;
      const moving = ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(key => input.down(key));
      if (nearStation && !cameraSolidsReady && (window as any).__qhd.manifest) {
        scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !((m as any).isSkinnedMesh) && /bark|trunk|root|post|wood/i.test(m.name) && !/COL_|MK_|foliage|moss/i.test(m.name)) cameraSolids.push(m); });
        cameraSolidsReady = true;
      }
      if (cameraProbeTarget.distanceTo(cam.target) > 0.08 || Math.abs(cameraProbeYaw - cam.yaw) > 0.02 || Math.abs(cameraProbePitch - cam.pitch) > 0.02 || t - cameraProbeTime > 1) {
        cameraProbeCache.clear(); cameraAssistInfo.ranges = {}; cameraProbeTarget.copy(cam.target); cameraProbeYaw = cam.yaw; cameraProbePitch = cam.pitch; cameraProbeTime = t;
      }
      const probe = (offset: number) => {
        const key = offset.toFixed(3); if (cameraProbeCache.has(key)) return cameraProbeCache.get(key)!;
        const yaw = cam.yaw + offset;
        cameraProbeDir.set(Math.sin(yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(yaw) * Math.cos(cam.pitch));
        const h = ph.ray(cam.target, cameraProbeDir, cam.dist + 0.3);
        let distance = h === null ? cam.dist : Math.min(cam.dist, Math.max(1, h - 0.3));
        cameraOpticalRay.set(cam.target, cameraProbeDir); cameraOpticalRay.near = 0.05; cameraOpticalRay.far = cam.dist + 0.3;
        const solid = cameraOpticalRay.intersectObjects(cameraSolids, false).find(hit => { for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (!o.visible) return false; return true; });
        if (solid) { distance = Math.min(distance, Math.max(0.35, solid.distance - 0.3)); cameraAssistInfo.hits = [solid.object.name]; }
        cameraAssistInfo.probes++; cameraAssistInfo.ranges[key] = { distance, physical: h, solid: solid ? {name: solid.object.name, distance:solid.distance, point:solid.point.toArray()} : null }; cameraProbeCache.set(key, distance); return distance;
      };
      const wanted = nearStation && !moving && !userOrbit ? chooseInteractionCameraOffset(probe, cam.dist, followAssistChoice) : 0;
      followAssistChoice = wanted;
      followAssistOffset += (wanted - followAssistOffset) * Math.min(1, dt * 8);
      cameraAssistInfo.offset = followAssistOffset; cameraAssistInfo.choice = wanted;
      (window as any).__qhd.cameraAssist = cameraAssistInfo;
      const yaw = cam.yaw + followAssistOffset;
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(yaw) * Math.cos(cam.pitch));
      let d = cam.dist;
      const hit = ph.ray(cam.target, dir, d + 0.3);
      if (hit !== null) d = Math.max(1.0, hit - 0.3);
      if (nearStation) d = Math.min(d, probe(followAssistOffset));
      camera.position.copy(cam.target).addScaledVector(dir, d);
      camera.lookAt(cam.target);
    }

    // 挡在镜头和领队之间的伙伴变半透明
    for (const a of Object.values(game.actors)) {
      if (a === lead) { a.setFade(1, dt); a.label.visible = false; continue; }
      const mid = a.pos.clone().add(new THREE.Vector3(0, a.def.height * 0.6, 0));
      const seg = new THREE.Line3(camera.position.clone(), cam.target.clone());
      const closest = new THREE.Vector3(); seg.closestPointToPoint(mid, true, closest);
      const nearCam = mid.distanceTo(camera.position);
      const block = (closest.distanceTo(mid) < 0.45 && nearCam < 3.6) || nearCam < 1.4; // v61：只在真挡住视线 / 贴着镜头时才藏（以前 0.8 m / 2.4 m 太宽，跟随时反复进出）
      a.setFade(block ? 0.22 : 1, dt);
      a.label.visible = !block && nearCam >= 3.2;
    }

    fill.position.copy(camera.position).add(new THREE.Vector3(0, 1.5, 0)); fill.target.position.copy(cam.target);
    rim.position.copy(cam.target).add(new THREE.Vector3(-3, 3, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), cam.yaw + Math.PI)); rim.target.position.copy(cam.target);
    // 阴影跟着玩家走
    const lp = lead.pos;
    { const o = warmFront.userData.off as number[]; warmFront.position.set(lp.x + o[0], lp.y + o[1], lp.z + o[2]); warmFront.target.position.copy(lp); }
    // v60（Codex 0207/0213）：入口之后（z<-2）暖聚光跟着领队照中景路面；入口保持原样（原聚光本来就没挂进场景）
    if (tone2 && spotFollow) { const on = lp.z < -2; if (on && !warmSpot.parent) { warmSpot.color.setHex(0xffe0ad); warmSpot.intensity = SPOT_I; warmSpot.angle = SPOT_A; warmSpot.penumbra = 1; scene.add(warmSpot, warmSpot.target); } if (!on && warmSpot.parent) scene.remove(warmSpot, warmSpot.target);
      if (on) { warmSpot.position.set(lp.x - 6, lp.y + 17, lp.z + 12); warmSpot.target.position.set(lp.x, lp.y + 0.1, lp.z - 7); } }
    const sunOff = (window as any).__qhd?.sunOff as number[] | undefined; // 调光用：临时改太阳方向
    if (sunOff) sun.position.set(lp.x + sunOff[0], lp.y + sunOff[1], lp.z + sunOff[2]);
    else if (promo) sun.position.set(lp.x + SUN.x, lp.y + SUN.y, lp.z + SUN.z); // 低角度、从前方偏左照过来：人物和树有金色轮廓，地上影子长
    else { // 0253：阴影相机按阴影贴图的像素格对齐，人走动时阴影边缘不再一格一格地爬动
      const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
      _sd.set(22, 38, 14).normalize(); _sr.crossVectors(_up, _sd).normalize(); _su.crossVectors(_sd, _sr);
      const r = lp.dot(_sr), u = lp.dot(_su), dr = Math.round(r / texel) * texel - r, du = Math.round(u / texel) * texel - u;
      _sb.copy(lp).addScaledVector(_sr, dr).addScaledVector(_su, du);
      sun.position.set(_sb.x + 22, _sb.y + 38, _sb.z + 14);
    }
    // v72（Codex 0215 归因：桥/峡谷发白来自光束 + 屏幕泛光）：桥头往后（z -34→-40 渐变）光束压到约 3 成、泛光压到约 1/3；?wash=0 关掉这个修正
    const washK = washFix ? 1 - THREE.MathUtils.smoothstep(lp.z, -40, -34) : 0;
    if (rays) { rays.position.set(Math.round(lp.x / 12) * 12, 0, Math.round(lp.z / 12) * 12); rays.children.forEach((r, i) => { ((r as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (0.24 + Math.sin(performance.now() / 1700 + i) * 0.06) * (1 - 0.7 * washK); }); }
    if (sunOff || promo) sun.target.position.copy(lp); else sun.target.position.copy(_sb);

    const t0 = performance.now();
    renderer.info.autoReset = false; renderer.info.reset(); // 泛光的全屏通道会清零计数，改成整帧累计（含泛光约 +10 次绘制）
    backdrop?.update(camera);
    if (windT) windT.value += dt;
    life?.update(game.leader.pos);
    zones?.update(dt, camera.position.z);
    if (gradePass && sunGlow.value > 0) { // 太阳在屏幕上的位置；太阳在身后或离屏太远就淡掉
      const sp = camera.position.clone().addScaledVector(SUN.clone().normalize(), 400).project(camera);
      camera.getWorldDirection(camFwd); const facing = camFwd.dot(SUN.clone().normalize());
      const off = Math.max(Math.abs(sp.x), Math.abs(sp.y)) - 1;
      gradePass.uniforms.uSunUV.value.set(THREE.MathUtils.clamp((sp.x + 1) / 2, -0.08, 1.08), THREE.MathUtils.clamp((sp.y + 1) / 2, -0.08, 1.08)); // 离屏时光晕中心贴在画面角上
      gradePass.uniforms.uSunAmt.value = sunGlow.value * (1 - 0.68 * washK) * THREE.MathUtils.smoothstep(facing, 0.1, 0.5) * (1 - THREE.MathUtils.smoothstep(off, 0.6, 1.8));
    }
    for (const f of farL) f.obj.visible = game.leader.pos.z >= f.hideBelow;
    environmentBatchHandle?.update(camera, game.leader.pos.z, sun);
    if (music) { // 按进度和位置换音乐情绪：入口/岔路/坡 = 森林；桥头到吊桥 = 紧张；苔鹿林 = 空灵；通关 = 明亮
      const z = game.leader.pos.z, st = game.stage;
      music.setMood(st >= Stage.Done ? 'done' : z < -66 || st >= Stage.Deer ? 'glade' : (st >= Stage.ThreePoints && z < -40) || (z < -46 && z > -66) ? 'tense' : 'forest');
      music.setDuck(ui.busy()); music.gust(game.wind.phase === 'gust');
    } // 远景只在入口 / 北延伸看
    deerContactShade?.update(dt);
    cinematicFoliage.update(!!game.cinematic, camera.position.distanceTo(cam.target), !game.cinematic && !ov);
    (window as any).__qhd?.cull?.tick?.();
    { const b = bloomOn(); bloom.enabled = b; if (b || gradePass) composer.render(); else renderer.render(scene, camera); } // v60：低画质只关泛光，保留 Output/调色（以前整个 composer 被跳过，画面偏蓝偏暗）
    (window as any).__qhd.frameStats = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    (window as any).__qhd.frameMs = performance.now() - t0;
  }
  frame();
}

function skyGradient(top: THREE.Color, horizon: THREE.Color, bottom = '#d9cfae'): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#' + top.getHexString()); grd.addColorStop(0.62, '#' + horizon.getHexString()); grd.addColorStop(1, bottom);
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

boot().catch((e) => {
  console.error(e);
  const b = document.getElementById('start') as HTMLButtonElement;
  b.textContent = '启动失败：' + (e?.message || e);
});

/** 0179 鹿角挂点：取下断木后苔花亮起（软光精灵，平时不显示） */
function addAntlerGlow(at: THREE.Object3D) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(200,255,150,0.95)'); gr.addColorStop(0.4, 'rgba(150,230,100,0.4)'); gr.addColorStop(1, 'rgba(120,200,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  sp.scale.setScalar(0.9); sp.name = 'fx_antler_glow'; at.add(sp);
  return sp;
}
