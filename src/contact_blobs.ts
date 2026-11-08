// 0310 第 7 项（Claude）：踏石、岩石底部的接触阴影。
// 场景里的石头只受平行光阴影，贴地处没有遮蔽，看上去像"贴"在土上。全屏 AO（GTAO）要多画一遍场景，
// Windows 轻薄本吃不消；这里给每块石头在脚下放一张柔和的暗斑（一个 InstancedMesh、一次绘制）。
// 地面高度用物理射线在石头外圈取样（石头自身有碰撞体，不能从正上方打）。?contact=0 关闭。
import * as THREE from 'three';

const STONE = /step|stone|rock|boulder|pebble|cobble/i;
/** 整片合并的石头网格（名字来自 v033 资产） */
const MERGED = /^(FORK_surface_stone_(gate_route|slope|bridgehead|crossroads|glade|north|boulder_redesign)|VIS_irregular_stone_path|VIS_varied_stepstones|VIS_layer_moss_boulders|VIS_scattered_pebbles|FORK_path_rock_shelf|GLADE_right_rooted_rocks|FORK_natural_fork_boundary_rocks)/;
/** 按位置焊接后求三角形连通块，返回每块的局部包围盒 */
function componentBoxes(g: THREE.BufferGeometry): THREE.Box3[] {
  const pos = g.attributes.position as THREE.BufferAttribute, n = pos.count; if (!n || n > 400000) return [];
  const key = new Map<string, number>(), weld = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = `${Math.round(pos.getX(i) * 500)},${Math.round(pos.getY(i) * 500)},${Math.round(pos.getZ(i) * 500)}`; let w = key.get(k); if (w === undefined) { w = i; key.set(k, i); } weld[i] = w; }
  const par = new Int32Array(n); for (let i = 0; i < n; i++) par[i] = i;
  const find = (a: number) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const uni = (a: number, b: number) => { a = find(weld[a]); b = find(weld[b]); if (a !== b) par[a] = b; };
  const idx = g.index; const tri = idx ? idx.count : n;
  for (let t = 0; t < tri; t += 3) { const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2; uni(a, b); uni(b, c); }
  const out = new Map<number, THREE.Box3>(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { const r = find(weld[i]); let b = out.get(r); if (!b) { b = new THREE.Box3(); out.set(r, b); } b.expandByPoint(v.fromBufferAttribute(pos, i)); }
  return [...out.values()];
}
const SKIP = /^COL_|_COL_|MK_|wall|cliff|canyon|gate|arch|plaque|terrain|ground|soil|earth|bank|seam|strata|shelf|bedrock|crest|graybox|far_|contour|moss_pile|colon|vine|leaf|grass|fern/i;

function blobTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}

/** 第一步（合批前调用）：收集石头包围盒；合批后石头被并进 BatchedMesh，就找不到了。第二步 finish(ray) 等物理碰撞就绪后放暗斑 */
export function collectContactBlobs(scene: THREE.Scene, opts: { opacity?: number; max?: number } = {}) {
  const t0 = performance.now();
  const boxes: THREE.Box3[] = [];
  const box = new THREE.Box3(), m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4();
  const named = (o: THREE.Object3D) => { let s = ''; for (let p: THREE.Object3D | null = o, i = 0; p && i < 4; p = p.parent, i++) s += p.name + '|'; return s; };
  const stats = { meshes: 0, merged: 0, verts: 0 };
  scene.traverse((o: any) => {
    if (!o.isMesh || o.isBatchedMesh) return;
    const merged = MERGED.test(o.name);
    if (!merged && (!STONE.test(named(o)) || SKIP.test(o.name))) return;
    let shown = true; for (let p = o; p; p = p.parent) if (!p.visible) { shown = false; break; }
    if (!shown) return;
    const g = o.geometry as THREE.BufferGeometry; stats.meshes++;
    // 合并网格（一整片踏石/散石是一个 mesh）：按焊接后的连通块拆成一块块石头
    const local = merged ? componentBoxes(g) : (g.boundingBox ?? (g.computeBoundingBox(), g.boundingBox)) ? [g.boundingBox!] : [];
    if (merged) { stats.merged++; stats.verts += g.attributes.position.count; }
    if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); m5.multiplyMatrices(o.matrixWorld, m4); for (const b of local) boxes.push(box.copy(b).applyMatrix4(m5).clone()); } }
    else for (const b of local) boxes.push(box.copy(b).applyMatrix4(o.matrixWorld).clone());
  });
  return { candidates: boxes.length, finish: (ray: (f: THREE.Vector3, d: THREE.Vector3, m: number) => number | null) => {
  const t1 = performance.now();
  const keep: { x: number; z: number; y: number; sx: number; sz: number }[] = [];
  const f = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), sz = new THREE.Vector3(), c = new THREE.Vector3();
  for (const b of boxes) {
    b.getSize(sz); b.getCenter(c);
    const r = Math.max(sz.x, sz.z) / 2;
    if (r < 0.12 || r > 2.6 || sz.y < 0.03 || sz.y > 4) continue; // 太小看不出、太大的是岩壁地形
    // 外圈 4 点取地面高度，取中位附近
    const hs: number[] = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      f.set(c.x + dx * (sz.x / 2 + 0.15), b.max.y + 1.5, c.z + dz * (sz.z / 2 + 0.15));
      const t = ray(f, down, sz.y + 4); if (t != null) hs.push(f.y - t);
    }
    if (hs.length < 2) continue;
    hs.sort((a, b2) => a - b2); const gy = hs[Math.floor(hs.length / 2)];
    if (gy > b.max.y + 0.05 || gy < b.min.y - 0.6) continue; // 石头埋在地下，或悬空离地太远
    keep.push({ x: c.x, z: c.z, y: gy + 0.015, sx: sz.x * 1.45 + 0.15, sz: sz.z * 1.45 + 0.15 });
    if (keep.length >= (opts.max ?? 3000)) break;
  }
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x000000, transparent: true, opacity: opts.opacity ?? 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, keep.length)); im.name = 'contact_blobs'; im.count = keep.length;
  im.castShadow = false; im.receiveShadow = false; im.renderOrder = 1; im.frustumCulled = false;
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  keep.forEach((k, i) => { im.setMatrixAt(i, m4.compose(p.set(k.x, k.y, k.z), q, s.set(k.sx, 1, k.sz))); });
  im.instanceMatrix.needsUpdate = true;
  scene.add(im);
  return { mesh: im, stats: { ...stats, candidates: boxes.length, blobs: keep.length, collectMs: Math.round(t1 - t0), ms: Math.round(performance.now() - t1) } };
  } };
}
