import { setWindBounds } from './codex/environment_batches';
// 场景清单导入：Codex 每批交付附一个 scene_manifest.json，静态场景模型按清单摆放，不需要改代码。
// 用法：?env_manifest=<清单地址>（清单里的 glb 路径相对清单所在目录）；发布版用 window.__DEFAULT_MODELS.env_manifest。
// 格式见 docs/场景模型批量交付规范_v0.1.md
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { addFallMist } from './atmosphere';
import { shouldAutoMist } from './codex/v49_art_compat';
export let mistCount = 0;
import type { Level } from './level/chapter1';
import { useGateModel, useKitModel, ITEMS, type ItemId } from './level/chapter1';
import { loadGLB } from './assets';

export interface ManifestItem {
  id: string;
  glb: string;
  sha256?: string;
  /** 0197：林下新增分组不投影 */
  castShadow?: boolean;
  kind?: 'static' | 'gate' | 'kit_hook' | 'kit_vine' | 'kit_bench' | 'kit_post' | 'vine_curtain' | 'mech' | 'bridge' | 'deer';
  place?: { pos: [number, number, number]; rotY?: number; scale?: number }[];
  /** 远处换低模：lod1 的 GLB 和切换距离（米） */
  lod?: { glb: string; distance: number; sha256?: string };
  hideGrayInBox?: [[number, number, number], [number, number, number]][];
  /** kind=mech：替换哪个灰盒机关（0147 机关清单） */
  mech?: 'boulder' | 'plate' | 'winch' | 'counterweight' | 'ropeclip';
}
export interface Manifest {
  batch: string; chapter: number; items: ManifestItem[]; icons?: Record<string, string>;
  /** 0087：旧石门要隐藏的可见节点、跟着刻字显隐的新节点 */
  gate_visual?: { hide: string[]; follow_text: string[] };
  /** 0087：只过滤这些框里的旧灰盒实例（InstancedMesh 按实例平移判断，不整个隐藏） */
  legacy_instance_boxes?: [[number, number, number], [number, number, number]][];
  /** 0087：风（顶点属性 _wind_weight，0 = 不动，1 = 叶尖） */
  wind?: { max_m: number };
  /** 0145：这些名字开头的 COL 网格生成真正的三角网格碰撞（自然岩路），不只是隐藏 */
  trimesh_col?: string[];
  hide_nodes?: string[];
  /** 0111：远景层——不投/收影、不吃全局雾，单独做空气透视（越远越淡偏蓝）；玩家焦点 z 低于 hide_focus_z_below 时隐藏 */
  far_layer?: { ids: string[]; fog: { near: number; far: number; color: string; max: number }; hide_focus_z_below?: number };
  /** 0095：旧灰盒的大地面 / 土路只裁掉样张范围里的可见部分（物理不改、其余区域保留） */
  surface_cutouts?: { center: [number, number, number]; size: [number, number, number]; cut_x: [number, number]; cut_z: [number, number] }[];
  /** 0095：布景老树的树干碰撞（圆柱：x, z, 半径, 高度） */
  collision_cylinders?: [number, number, number, number][];
}

export interface ItemReport { id: string; ok: boolean; err?: string; lod1Triangles?: number; windMeshes?: number; triangles?: number; meshes?: number; materials?: number; textures?: number; instances?: number; hiddenGray?: number; colHidden?: number; ms?: number; center?: number[] }

/** 关卡里玩法要用的物体（拾取物、机关、苔鹿……）不能被清单的灰盒隐藏框误藏 */
function protectedSet(level: Level) {
  const s = new Set<THREE.Object3D>();
  const visit = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 3) return;
    if ((v as THREE.Object3D).isObject3D) { if ((v as THREE.Object3D).name !== 'chapter1_graybox') s.add(v as THREE.Object3D); return; }
    for (const x of Array.isArray(v) ? v : Object.values(v as object)) visit(x, depth + 1);
  };
  for (const [k, v] of Object.entries(level)) if (k !== 'gate') visit(v, 0);
  return s;
}

/** 所有风材质共用一个时间（每帧在 main 里更新） */
export const windTime = { value: 0 };
// 峡谷水流（0147）：溪水贴图沿 V 滚动；瀑布 / 泡沫无贴图，用世界坐标条纹往下 / 往下游流。材质只在加载时克隆一次，时间用 windTime（暂停时冻结）
function applyFlow(root: THREE.Object3D) {
  let n = 0; const falls: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mm = o as THREE.Mesh; if (!mm.isMesh || !o.name.startsWith('FLOW_')) return; n++;
    const mat = (mm.material as THREE.MeshStandardMaterial).clone(); mm.material = mat;
    const kind = o.name.includes('waterfall') ? 1 : o.name.includes('foam') ? 2 : 0;
    if (kind === 1) falls.push(mm);
    if (kind === 0 && mat.map) { mat.map = mat.map.clone(); mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.needsUpdate = true; }
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uFlowT = windTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFlowW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFlowW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      let f = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlowT;\nvarying vec3 vFlowW;');
      if (kind === 0) f = f.replace('#include <map_fragment>', '#ifdef USE_MAP\n  vec4 sampledDiffuseColor = texture2D(map, vMapUv + vec2(0.0, -0.10 * uFlowT));\n  diffuseColor *= sampledDiffuseColor;\n#endif');
      else f = f.replace('#include <map_fragment>', `#include <map_fragment>
  { float s = ${kind === 1 ? 'vFlowW.y * 1.6 + uFlowT * 2.2 + sin(vFlowW.z * 3.1 + vFlowW.x * 2.3) * 1.5' : 'vFlowW.x * 0.9 + uFlowT * 0.6 + sin(vFlowW.z * 2.7) * 1.2'};
    float streak = smoothstep(0.55, 1.0, sin(s) * 0.5 + 0.5) * (0.55 + 0.45 * sin(vFlowW.x * 7.0 + vFlowW.z * 5.0));
    diffuseColor.rgb = mix(diffuseColor.rgb * 0.82, diffuseColor.rgb * 1.12, streak); }`);
      sh.fragmentShader = f;
    };
    mat.customProgramCacheKey = () => 'flow' + kind + (kind === 2 ? 'x' : '');
  });
  root.updateMatrixWorld(true); const atmoOn = new URLSearchParams(location.search).get('atmo') !== '0';
  for (const f of falls) { if (!shouldAutoMist(f, atmoOn)) continue; const g = addFallMist(f, windTime); if (g) { root.add(g); mistCount += g.children.length; } } // v49 瀑布底部水雾；0179：远瀑布 no_auto_mist 不加
  return n;
}
/** 远景层（每帧按玩家位置显隐，见 main） */
export const farLayers: { obj: THREE.Object3D; hideBelow: number }[] = [];
/** 风的实际统计（0105：要看真的非零权重，不只是"有这个属性"） */
export const windStats = { meshes: 0, zeroMeshes: 0, movingVerts: 0, maxWeight: 0, shadowMats: 0, compiled: 0 };
const windDone = new WeakMap<THREE.Material, THREE.Material>();
/** 树冠透光：只在影子里给树冠挖一块块光斑（叶子本身照常显示），光斑跟着风一起晃。value = 透光比例（0 关闭） */
export const canopyDapple = { value: 0.55 };
const crownDepth = new WeakMap<THREE.Material, THREE.Material>();
function dappleHook(amp: number) {
  const wind = windHook(amp);
  return (sh: THREE.WebGLProgramParametersWithUniforms) => {
    wind(sh);
    sh.uniforms.uDapple = canopyDapple;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDapW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_BATCHING
        vDapW = (modelMatrix * batchingMatrix * vec4(transformed, 1.0)).xyz;
        #elif defined(USE_INSTANCING)
        vDapW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
        vDapW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDapW;\nuniform float uDapple;')
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        {
          // 低频的软噪声（几种不同方向的正弦叠加），大约 1–2 米一块光斑
          vec3 q = vDapW * 0.9;
          float n = sin(q.x * 1.7 + q.y * 0.6) * sin(q.z * 1.9 - q.y * 0.4) + 0.6 * sin(q.x * 3.1 + q.z * 2.3 + q.y) + 0.35 * sin(q.z * 4.7 - q.x * 1.3);
          if (n > mix(2.0, -1.2, uDapple)) discard;
        }`);
  };
}
/** 用户（11-04）：近处的草几乎不动 → 全局风力倍数（着色器共用一个 uniform，暂停面板里可以随时改，记在 localStorage qhd_wind）。
 *  清单的 wind.max_m × 这个值；?wind=1 是原值，?wind=0 关掉 */
export const WIND_OPTIONS = [0, 1, 2.5, 4];
export const windScale = { value: (() => {
  try { const v = parseFloat(new URLSearchParams(location.search).get('wind') ?? ''); if (isFinite(v) && v >= 0) return v; } catch { /* 预览环境 */ }
  try { const v = parseFloat(localStorage.getItem('qhd_wind') ?? ''); if (isFinite(v) && v >= 0) return v; } catch { /* 存储不可用 */ }
  return 2.5; })() };
export function setWindScale(v: number) { windScale.value = v; try { localStorage.setItem('qhd_wind', String(v)); } catch { /* 存储不可用 */ } }
function windHook(amp: number) {
  return (sh: THREE.WebGLProgramParametersWithUniforms) => {
    windStats.compiled++;
    sh.uniforms.uWindT = windTime; sh.uniforms.uWindAmp = { value: amp }; sh.uniforms.uWindScale = windScale;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float _wind_weight;\nuniform float uWindT;\nuniform float uWindAmp;\nuniform float uWindScale;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_BATCHING
          vec4 wp = modelMatrix * batchingMatrix * vec4(transformed, 1.0);
          #elif defined(USE_INSTANCING)
          vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          #else
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          #endif
          // 相位按世界位置错开（入口主模型是合并网格，不能用模型原点）；空间频率低，同一株叶子基本同步
          float ph = wp.x * 0.55 + wp.z * 0.37;
          float w = _wind_weight * uWindAmp * uWindScale;
          float gust = 0.75 + 0.25 * sin(uWindT * 0.45 + wp.x * 0.05);
          transformed.x += (sin(uWindT * 1.6 + ph) * 0.7 + sin(uWindT * 3.7 + ph * 2.3) * 0.3) * w * gust;
          transformed.z += (sin(uWindT * 1.2 + ph * 1.3) * 0.5 + sin(uWindT * 4.3 + ph * 1.7) * 0.15) * w * gust;
        }`);
  };
}
/** 给网格接上风：材质顶点位移 + 影子用同样位移的深度材质 + 包围范围加裕量。amp 是模型局部单位的最大位移 */
export function applyWind(root: THREE.Object3D, amp: number): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const attr = m.isMesh ? m.geometry.getAttribute('_wind_weight') : null;
    if (!attr) return;
    let moving = 0, mx = 0;
    for (let i = 0; i < attr.count; i++) { const w = attr.getX(i); if (w > 1e-4) moving++; if (w > mx) mx = w; }
    windStats.meshes++;
    if (!moving) { windStats.zeroMeshes++; return; } // 全零（石头、门、地面）：不挂风，省着色器
    windStats.movingVerts += moving; windStats.maxWeight = Math.max(windStats.maxWeight, mx); n++;
    const mats = ([] as THREE.Material[]).concat(m.material);
    for (const mat of mats) {
      if (windDone.has(mat)) continue;
      mat.onBeforeCompile = windHook(amp); mat.customProgramCacheKey = () => 'wind' + amp; mat.needsUpdate = true;
      // 影子：深度材质也要有同样的位移，透明叶片沿用同一张贴图和 0.45 裁切
      const sm = mat as THREE.MeshStandardMaterial;
      const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: sm.map ?? null, alphaMap: sm.alphaMap ?? null, alphaTest: sm.alphaTest || 0, side: sm.side });
      dm.onBeforeCompile = windHook(amp); dm.customProgramCacheKey = () => 'wind_depth' + amp;
      windDone.set(mat, dm); windStats.shadowMats++;
    }
    if (m.castShadow && /crown/i.test(m.name)) { // 树冠：影子透光
      const sm = mats[0] as THREE.MeshStandardMaterial;
      if (!crownDepth.has(sm)) { const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: sm.map ?? null, alphaMap: sm.alphaMap ?? null, alphaTest: sm.alphaTest || 0.001, side: sm.side }); dm.onBeforeCompile = dappleHook(amp); dm.customProgramCacheKey = () => 'wind_dapple' + amp; crownDepth.set(sm, dm); }
      m.customDepthMaterial = crownDepth.get(sm);
    } else if (m.castShadow) m.customDepthMaterial = windDone.get(mats[0]);
    // 包围范围：最大位移 amp × 权重，按局部单位加 1.25 倍裕量，免得摆到画面边上被裁掉
    const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingBox) g.computeBoundingBox();
    const pad = amp * mx * 1.25 * Math.max(...WIND_OPTIONS); // 按最大档风力留裕量
    setWindBounds(THREE, g, pad);
    const im = m as THREE.InstancedMesh; if (im.isInstancedMesh) { im.boundingSphere = null; im.boundingBox = null; im.computeBoundingSphere(); im.computeBoundingBox(); }
  });
  return n;
}

function hideHelpers(o: THREE.Object3D) {
  let n = 0;
  o.traverse((c) => {
    if (c.name.startsWith('COL_') || c.name.startsWith('MK_')) { c.visible = false; n++; c.traverse((d) => { (d as THREE.Mesh).castShadow = false; }); }
  });
  return n;
}

/** 把一块旧灰盒方块的可见面挖掉 xz 里的一个矩形：隐藏原方块，换成最多 4 块剩余部分（不动物理）。
 *  同一块可以挖多次（0103：北侧延伸），后一次在前一次剩下的碎块上继续挖 */
function cutBox(gray: THREE.Object3D, c: [number, number, number], s: [number, number, number], cx: [number, number], cz: [number, number]): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
  const m = gray.children.find((o) => { const b = o as THREE.Mesh; const g = b.geometry as THREE.BoxGeometry; return b.isMesh && g?.type === 'BoxGeometry' && !o.userData.cutOf && near(b.position.x, c[0]) && near(b.position.y, c[1]) && near(b.position.z, c[2]) && near(g.parameters.width, s[0]) && near(g.parameters.height, s[1]) && near(g.parameters.depth, s[2]); }) as THREE.Mesh | undefined;
  if (!m) return false;
  const targets: THREE.Mesh[] = m.visible ? [m] : (gray.children.filter((o) => o.userData.cutOf === m.uuid) as THREE.Mesh[]);
  for (const t of targets) {
    const g = t.geometry as THREE.BoxGeometry;
    const x0 = t.position.x - g.parameters.width / 2, x1 = t.position.x + g.parameters.width / 2, z0 = t.position.z - g.parameters.depth / 2, z1 = t.position.z + g.parameters.depth / 2;
    const ax = Math.max(x0, cx[0]), bx = Math.min(x1, cx[1]), az = Math.max(z0, cz[0]), bz = Math.min(z1, cz[1]);
    if (bx - ax < 0.01 || bz - az < 0.01) continue; // 这块不挨着
    if (t === m) m.visible = false; else gray.remove(t);
    const parts: [number, number, number, number][] = [[x0, x1, z0, az], [x0, x1, bz, z1], [x0, ax, az, bz], [bx, x1, az, bz]];
    for (const [p0, p1, q0, q1] of parts) {
      if (p1 - p0 < 0.01 || q1 - q0 < 0.01) continue;
      const piece = new THREE.Mesh(new THREE.BoxGeometry(p1 - p0, s[1], q1 - q0), m.material);
      piece.position.set((p0 + p1) / 2, c[1], (q0 + q1) / 2); piece.receiveShadow = m.receiveShadow; piece.castShadow = m.castShadow; piece.name = (m.name || 'gray') + '_cut'; piece.userData.cutOf = m.uuid;
      gray.add(piece);
    }
  }
  return true;
}

/** 藤帘开合进度 0..1 → 四个形态键 Open_25/50/75/Open（相邻两键插值） */
export function setVineProgress(level: Level, progress: number) {
  const c = level.vine.curtain; if (!c) return;
  const names = ['Open_25', 'Open_50', 'Open_75', 'Open'], q = Math.max(0, Math.min(1, progress)) * 4, i = Math.min(3, Math.floor(q)), f = q - i;
  for (const m of c.morphs) {
    const d = m.morphTargetDictionary!, w = m.morphTargetInfluences!; w.fill(0);
    if (i > 0 && d[names[i - 1]] !== undefined) w[d[names[i - 1]]] = 1 - f;
    if (d[names[i]] !== undefined) w[d[names[i]]] = progress >= 1 ? 1 : f;
  }
}

// v56（0189）：同一个植物 GLB 在多个区域清单里重复出现：只下载 / 解码一次，之后克隆（几何、材质、贴图共用）
/** 0310：每个清单项放进场景后先异步编译着色器、上传贴图，再显示（Windows 实测进门卡顿、石头黑轮廓）。main 里设置 */
let warmup: ((objs: THREE.Object3D[]) => Promise<void>) | null = null;
export function setWarmup(f: typeof warmup) { warmup = f; }
const glbCache = new Map<string, Promise<Awaited<ReturnType<typeof loadGLB>>>>();
async function loadShared(url: string) {
  const p = glbCache.get(url);
  // 0227：缓存里的模板从不交出去（以前第一次直接返回它，第一次摆放写的位置/旋转/缩放会被后面的克隆继承）
  if (!p) { const q = loadGLB(url); glbCache.set(url, q); const m = await q; return { ...m, scene: cloneTpl(m.scene) }; }
  const m = await p; return { ...m, scene: cloneTpl(m.scene), ms: 0 };
}
function cloneTpl(o: THREE.Object3D) { // 有骨骼动画的模型用骨架克隆，否则普通深克隆（几何、材质、贴图共用）
  let skinned = false; o.traverse((c) => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) skinned = true; });
  return skinned ? skeletonClone(o) : o.clone(true);
}
export const manifestCache = glbCache;

/** v56 分区显隐（0138 / 0189）：静态场景件按 z 范围只在领队附近显示——前方 55 m、身后 30 m；远景层（far_layer）始终显示。
 * 每 0.3 秒更新一次；返回统计给 __qhd。 */
export const farIdSet = new Set<string>();
export function makeZoneCuller(scene: THREE.Scene, farIds: Set<string>) {
  const list: { o: THREE.Object3D; z0: number; z1: number }[] = [], b = new THREE.Box3();
  for (const o of scene.children) {
    if (!o.userData.zone) continue;
    const id = o.name.replace(/^env_/, '').replace(/_\d+$/, ''); if (farIds.has(id)) continue;
    b.setFromObject(o); if (b.isEmpty()) continue; list.push({ o, z0: b.min.z, z1: b.max.z });
  }
  let acc = 1, lastZ = NaN;
  const stats = { objects: list.length, shown: list.length, ahead: 55, behind: 30 };
  return { stats, update(dt: number, z: number) {
    acc += dt; if (acc < 0.3 && Math.abs(z - lastZ) < 3) return; acc = 0; lastZ = z;
    let n = 0; for (const e of list) { const v = e.z1 > z - stats.ahead && e.z0 < z + stats.behind; e.o.visible = v; if (v) n++; }
    stats.shown = n;
  } };
}

export async function applyManifest(level: Level, scene: THREE.Scene, url: string, ph?: { cylinder(c: THREE.Vector3Like, r: number, h: number): unknown; trimesh?(v: Float32Array, i: Uint32Array): unknown }): Promise<ItemReport[]> {
  const base = new URL(url, location.href);
  const man = (await (await fetch(base)).json()) as Manifest;
  const gray = scene.getObjectByName('chapter1_graybox')!;
  const keep = protectedSet(level);
  for (const [id, path] of Object.entries(man.icons ?? {})) if (ITEMS[id as ItemId]) ITEMS[id as ItemId].img = new URL(path, base).href;
  const reports: ItemReport[] = [];
  const box = new THREE.Box3(), c = new THREE.Vector3();
  const urlOf = (it: ManifestItem) => new URL(it.glb, base).href;
  const prefetch = (k: number) => { const it = man.items[k]; if (!it || (it.kind && it.kind !== 'static') || (Array.isArray(it.place) && !it.place.length)) return; const u = urlOf(it); if (!glbCache.has(u)) { const q = loadGLB(u); q.catch(() => glbCache.delete(u)); glbCache.set(u, q); } };
  for (let k = 0; k < man.items.length; k++) {
    const it = man.items[k];
    for (let j = 1; j <= 3; j++) prefetch(k + j); // 0310：后面几项先并行下载解码，公网上逐个等太慢
    const before = new Set(scene.children);
    // 清单里写了 place: [] 表示"这一项不摆"（如 v10 撤掉的 tree_depth_shrub）；不能退回到原点摆一份，否则会在路口中间冒出一棵树
    if (Array.isArray(it.place) && it.place.length === 0 && (!it.kind || it.kind === 'static')) { reports.push({ id: it.id, ok: true, instances: 0 }); continue; }
    try {
      const m = await (it.kind === 'static' || !it.kind ? loadShared : loadGLB)(new URL(it.glb, base).href);
      if (applyFlow(m.scene)) { level.water.visible = false; const f = scene.getObjectByName('graybox_waterfall'); if (f) f.visible = false; } // 新溪水 / 瀑布接管，灰盒水面和瀑布片收起
      const r: ItemReport = { id: it.id, ok: true, triangles: m.triangles, meshes: m.meshes, materials: m.materials, textures: m.textures, ms: m.ms, hiddenGray: 0 };
      if (man.trimesh_col && ph?.trimesh) { // 0145：先在原始模型上取 COL 三角（世界坐标，place 为原点）
        let tris = 0; m.scene.updateMatrixWorld(true);
        m.scene.traverse((o) => {
          const mm = o as THREE.Mesh; if (!mm.isMesh || !man.trimesh_col!.some((pre) => o.name.startsWith(pre))) return;
          const g = mm.geometry, pos = g.getAttribute('position'), v = new Float32Array(pos.count * 3), t = new THREE.Vector3();
          for (let k = 0; k < pos.count; k++) { t.fromBufferAttribute(pos, k).applyMatrix4(mm.matrixWorld); v.set([t.x, t.y, t.z], k * 3); }
          const idx = g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: pos.count }, (_, k) => k);
          ph.trimesh!(v, idx); tris += idx.length / 3;
        });
        if (tris) (r as any).colTriangles = tris;
      }
      if (it.kind === 'vine_curtain') { // 0151–0161：派派的苔藤门，四个形态键按进度打开
        const root = m.scene.children.length === 1 ? m.scene.children[0] : m.scene; root.position.set(0, 0, 0); // 模型自带 (0,0,-15.2)，挂到藤墙组前清零
        const vg = level.vine.group; const legacy = [...vg.children]; legacy.forEach((c) => { c.visible = false; });
        m.scene.name = `env_${it.id}_0`; vg.add(m.scene); vg.visible = true;
        const morphs: THREE.Mesh[] = []; m.scene.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh && mm.morphTargetDictionary) morphs.push(mm); });
        level.vine.curtain = { morphs, legacy };
        setVineProgress(level, level.vine.opened ? 1 : 0);
        r.instances = 1; r.meshes = morphs.length;
      } else if (it.kind === 'bridge') { // 0147：28 板吊桥 + 双护绳 + 四柱，世界坐标原样放；板由关卡 update 按升桥进度驱动
        const o = m.scene, B = level.bridge; hideHelpers(o); o.name = `env_${it.id}_0`; scene.add(o);
        B.planks.forEach((p) => (p.visible = false)); B.posts.forEach((p) => (p.visible = false));
        B.anim = Array.from({ length: 28 }, (_, i) => o.getObjectByName(`ANIM_plank_${String(i).padStart(2, '0')}`)!);
        // 护绳挂进原护绳组（沿用其显隐：升好才显示），灰盒绳隐藏；逐顶点横摆用的原始 x 和 u 记下
        B.ropes.children.forEach((c) => (c.visible = false)); B.ropeVis = [];
        for (const n of ['ANIM_ropes_L', 'ANIM_ropes_R']) {
          const g = o.getObjectByName(n); if (!g) continue; B.ropes.add(g);
          g.updateWorldMatrix(true, true);
          g.traverse((c) => { const mm = c as THREE.Mesh; if (!mm.isMesh) return;
            // 网格是量化过的（局部坐标 × 节点缩放）：u 用世界 z 算，横摆量换算回局部单位
            const geo = mm.geometry = mm.geometry.clone(), a = geo.getAttribute('position'), wp = new THREE.Vector3();
            const sx = new THREE.Vector3().setFromMatrixScale(mm.matrixWorld).x;
            const x0 = new Float32Array(a.count), u = new Float32Array(a.count);
            for (let k = 0; k < a.count; k++) { x0[k] = a.getX(k); wp.fromBufferAttribute(a, k).applyMatrix4(mm.matrixWorld); u[k] = Math.min(1, Math.max(0, (B.startZ - wp.z) / (B.startZ - B.endZ))) ; }
            B.ropeVis!.push({ geo, x0, u, sx }); });
        }
        B.sway = NaN; r.instances = 1;
      } else if (it.kind === 'deer') { // 0169/0171：苔鹿，根在鹿组原点 (0,1.5,-86)，朝向不改；灰盒鹿身隐藏
        const o = m.scene, D = level.deerState; hideHelpers(o); o.name = `env_${it.id}_0`;
        D.group.children.forEach((c) => (c.visible = false)); D.group.add(o);
        o.traverse((c) => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) c.frustumCulled = false; }); // 让路时骨骼带着走出原包围球
        const mixer = new THREE.AnimationMixer(o), acts: Record<string, THREE.AnimationAction> = {};
        for (const clip of m.animations ?? []) acts[clip.name] = mixer.clipAction(clip);
        for (const n of ['head_shake', 'bow_enter', 'bow_exit', 'leave_rootmotion']) if (acts[n]) { acts[n].setLoop(THREE.LoopOnce, 1); acts[n].clampWhenFinished = true; }
        const wood = o.getObjectByName('ITEM_stuck_wood') ?? null; if (wood) wood.visible = !D.freed;
        level.deerVis = { mixer, acts, wood, cur: '', t: 0, enterT: 0, phase: 'idle' };
        r.instances = 1; (r as any).clips = Object.keys(acts).length;
      } else if (it.kind === 'mech' && it.mech) { // 0147：古旧机关，换掉灰盒外观，活动节点交给 game 按升桥进度驱动
        const o = m.scene; hideHelpers(o); o.name = `env_${it.id}_0`; const V = level.mechVis;
        const find = (n: string) => o.getObjectByName(n) ?? undefined;
        if (it.mech === 'boulder') { // 原点 = 球心；挂到灰盒巨石下，跟着推和滚
          const bm = level.boulder.mesh; (bm.material as THREE.Material).visible = false; bm.add(o);
        } else if (it.mech === 'plate') { // 机关石板组 (0,1.5,-30)：巨石滚走后才显示
          level.winch.mesh.children.forEach((c) => (c.visible = false)); level.winch.mesh.add(o);
        } else {
          const at = it.place?.[0]?.pos; if (at) o.position.set(...at); o.rotation.y = it.place?.[0]?.rotY ?? 0; scene.add(o);
          V[it.mech].forEach((g) => (g.visible = false));
          if (it.mech === 'winch') { V.drum = find('ANIM_winch_drum'); V.handle = find('ANIM_winch_handle'); }
          if (it.mech === 'counterweight') { V.weight = find('ANIM_counterweight'); V.weightRope = find('ANIM_counterweight_rope'); V.weightLever = find('ANIM_counterweight_lever'); }
          if (it.mech === 'ropeclip') V.latch = find('ANIM_ropeclip_latch');
        }
        r.instances = 1;
      } else if (it.kind === 'gate') {
        useGateModel(level, m.scene, scene); r.instances = 1; r.colHidden = 7;
      } else if (it.kind?.startsWith('kit_')) {
        let n = 0; m.scene.traverse((o) => { if (o.name.startsWith('COL_')) n++; });
        useKitModel(level, it.kind.slice(4) as 'hook' | 'vine' | 'bench' | 'post', m.scene); r.instances = 1; r.colHidden = n;
        m.scene.name = `env_${it.id}_0`;
      } else {
        const places = it.place?.length ? it.place : [{ pos: [0, 0, 0] as [number, number, number] }];
        // 同一个小件摆很多份（蕨、花、叶）：合成 InstancedMesh，一种一次绘制；小植物不投阴影
        const meshes: THREE.Mesh[] = []; m.scene.updateMatrixWorld(true);
        m.scene.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh && !o.name.startsWith('COL_') && !o.name.startsWith('MK_')) meshes.push(mm); });
        if (!it.lod && places.length >= 4 && meshes.length <= 3 && meshes.every((mm) => !(mm as THREE.SkinnedMesh).isSkinnedMesh)) {
          const grp = new THREE.Group(); grp.name = `env_${it.id}_0`;
          const P = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
          for (const mm of meshes) {
            const im = new THREE.InstancedMesh(mm.geometry, mm.material, places.length);
            places.forEach((p, i) => { P.compose(new THREE.Vector3(...p.pos), q.setFromAxisAngle(up, p.rotY ?? 0), new THREE.Vector3().setScalar(p.scale ?? 1)); im.setMatrixAt(i, P.clone().multiply(mm.matrixWorld)); });
            im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
            const small = mm.geometry.index ? mm.geometry.index.count / 3 < 2000 : true;
            // 0217：清单显式写了 castShadow 就照办（新的小岩石要投影）；0223：收影和名称那两句以前被这行注释吞掉了
            im.castShadow = it.castShadow ?? !small;
            im.receiveShadow = true;
            im.name = mm.name;
            grp.add(im);
          }
          grp.userData.zone = true; scene.add(grp); r.instances = places.length; r.meshes = meshes.length;
          reports.push(r); continue;
        }
        const lod1 = it.lod ? await loadGLB(new URL(it.lod.glb, base).href) : null;
        if (lod1) { r.lod1Triangles = lod1.triangles; hideHelpers(lod1.scene); }
        places.forEach((p, i) => {
          const o0 = i === 0 ? m.scene : m.scene.clone(true);
          r.colHidden = hideHelpers(o0);
          let o: THREE.Object3D = o0;
          if (lod1 && it.lod) { // 远处换低模（LOD1 只在这里用，不在原点单独摆）
            const L = new THREE.LOD(); L.addLevel(o0, 0); L.addLevel(i === 0 ? lod1.scene : lod1.scene.clone(true), it.lod.distance); o = L;
          }
          o.position.set(...p.pos); o.rotation.y = p.rotY ?? 0; o.scale.setScalar(p.scale ?? 1);
          o.name = `env_${it.id}_${i}`;
          if (!it.kind || it.kind === 'static') o.userData.zone = true;
          scene.add(o);
          if (it.castShadow === false) o.traverse((d) => { d.castShadow = false; });
          o.traverse((d) => { if (d.name === 'FORK_surface_moss_glade_microislands') d.traverse((x: any) => { x.castShadow = false; for (const mm of [].concat(x.material || [])) (mm as THREE.Material).depthWrite = false; }); }); // 0213：贴地苔藓岛不投影、不写深度
        });
        r.instances = places.length;
      }
      for (const [a, b] of it.hideGrayInBox ?? []) {
        const hb = new THREE.Box3(new THREE.Vector3(...a), new THREE.Vector3(...b));
        for (const ch of gray.children) {
          if (!ch.visible || keep.has(ch)) continue;
          box.setFromObject(ch); box.getCenter(c);
          if (hb.containsPoint(c)) { ch.visible = false; r.hiddenGray!++; }
        }
      }
      const first = scene.getObjectByName(`env_${it.id}_0`) ?? m.scene;
      first.updateMatrixWorld(true); box.setFromObject(first); box.getCenter(c);
      r.center = c.toArray().map((v) => +v.toFixed(2));
      if (warmup) { const added = scene.children.filter((o) => !before.has(o)); if (added.length) await warmup(added); }
      reports.push(r);
    } catch (e) {
      reports.push({ id: it.id, ok: false, err: String(e) });
      console.error('清单模型加载失败', it.id, e);
    }
  }
  // 旧石门：隐藏静态框，新样板的刻字底板 / 吊架跟刻字显隐
  if (man.gate_visual && level.gate.model) {
    for (const n of man.gate_visual.hide) { const o = level.gate.model.getObjectByName(n); if (o) o.visible = false; }
    for (const n of man.gate_visual.follow_text) { scene.traverse((o) => { if (o.name === n) { level.gate.textExtra.push(o); o.visible = level.gate.open >= 0.98; } }); }
    reports.push({ id: 'gate_visual', ok: true, hiddenGray: man.gate_visual.hide.length, instances: level.gate.textExtra.length });
  }
  // 0189：精确隐藏前面清单里的某些节点（北路：入口 v45 文件里的 VIS_north_path_extension_0/1，前门和正面原路保留）
  if (man.hide_nodes) {
    let n = 0; for (const nm of man.hide_nodes) scene.traverse((o) => { if (o.name === nm && o.visible) { o.visible = false; n++; } });
    reports.push({ id: 'hide_nodes', ok: n >= man.hide_nodes.length, hiddenGray: n, err: n >= man.hide_nodes.length ? undefined : `只找到 ${n}/${man.hide_nodes.length}` });
  }
  // 旧灰盒的实例（树 / 草 / 花）：只把框里的实例缩成 0
  if (man.legacy_instance_boxes) {
    let n = 0; const mtx = new THREE.Matrix4(), pos = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const boxes = man.legacy_instance_boxes.map(([a, b]) => new THREE.Box3(new THREE.Vector3(...a), new THREE.Vector3(...b)));
    gray.traverse((o) => {
      const im = o as THREE.InstancedMesh; if (!im.isInstancedMesh) return;
      for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, mtx); pos.setFromMatrixPosition(mtx).applyMatrix4(im.matrixWorld); if (boxes.some((bx) => bx.containsPoint(pos))) { im.setMatrixAt(i, zero); n++; } }
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    });
    reports.push({ id: 'legacy_instances', ok: true, hiddenGray: n });
  }
  if (man.surface_cutouts) {
    let n = 0; for (const s of man.surface_cutouts) if (cutBox(gray, s.center, s.size, s.cut_x, s.cut_z)) n++;
    reports.push({ id: 'surface_cutouts', ok: n === man.surface_cutouts.length, hiddenGray: n, err: n === man.surface_cutouts.length ? undefined : `只找到 ${n}/${man.surface_cutouts.length} 块` });
  }
  if (man.collision_cylinders && ph) {
    for (const [x, z, r, h] of man.collision_cylinders) ph.cylinder({ x, y: h / 2, z }, r, h);
    reports.push({ id: 'collision_cylinders', ok: true, instances: man.collision_cylinders.length });
  }
  if (man.wind) {
    let n = 0; const amp = man.wind.max_m; for (const it of man.items) { scene.traverse((o) => { if (o.name.startsWith(`env_${it.id}_`)) n += applyWind(o, amp); }); }
    reports.push({ id: 'wind', ok: n > 0, windMeshes: n, ...windStats } as ItemReport);
  }
  if (man.far_layer) {
    const fl = man.far_layer, col = new THREE.Color(fl.fog.color); // sRGB → 线性（Three 的颜色管理自动转）
    for (const id of fl.ids) farIdSet.add(id);
    const farMats = new Map<THREE.Material, THREE.Material>();
    let n = 0;
    for (const id of fl.ids) scene.traverse((o) => {
      if (!o.name.startsWith(`env_${id}_`)) return;
      farLayers.push({ obj: o, hideBelow: fl.hide_focus_z_below ?? -Infinity });
      o.traverse((c) => {
        const m = c as THREE.Mesh; if (!m.isMesh) return;
        m.castShadow = false; m.receiveShadow = false; n++;
        // 0227：远景层的材质单独克隆一份再加远雾，免得同一个模型摆在近处的那些也被染上
        const mats = ([] as THREE.Material[]).concat(m.material).map((mt) => { if ((mt as any)._farDone) return mt; let c = farMats.get(mt); if (!c) { c = mt.clone(); c.onBeforeCompile = mt.onBeforeCompile; c.customProgramCacheKey = mt.customProgramCacheKey; farMats.set(mt, c); } return c; }); // 0243：clone() 不带 onBeforeCompile / cacheKey，要手动带上，否则风动丢失
        m.material = Array.isArray(m.material) ? mats : mats[0];
        for (const mat of mats) {
          if ((mat as any)._farDone) continue; (mat as any)._farDone = true;
          (mat as THREE.MeshStandardMaterial).fog = false;
          const prev = mat.onBeforeCompile;
          mat.onBeforeCompile = (sh, r) => {
            prev?.call(mat, sh, r);
            sh.uniforms.uFarCol = { value: col }; sh.uniforms.uFarN = { value: fl.fog.near }; sh.uniforms.uFarF = { value: fl.fog.far }; sh.uniforms.uFarMax = { value: fl.fog.max };
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vFarD;').replace('#include <project_vertex>', '#include <project_vertex>\nvFarD = -mvPosition.z;');
            // 在色调映射之前，对线性的出射光做混合；alpha 不动
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFarD;\nuniform vec3 uFarCol; uniform float uFarN; uniform float uFarF; uniform float uFarMax;')
              .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, uFarCol, uFarMax * smoothstep(uFarN, uFarF, vFarD));\n#include <opaque_fragment>');
          };
          const pk = mat.customProgramCacheKey?.bind(mat); mat.customProgramCacheKey = () => (pk ? pk() : '') + '_far'; mat.needsUpdate = true;
        }
      });
    });
    reports.push({ id: 'far_layer', ok: n > 0, meshes: n });
  }
  return reports;
}
