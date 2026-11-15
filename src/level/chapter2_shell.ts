// 第二章灰盒（C1 空壳 → C2 七区连通）。不含玩法，只管「哪里能走、哪里不能走」。
// 区域和坐标来自 Codex《第二章落地设计 v002》的 scene_layout_draft.json（章节局部坐标，米，Y 向上，-Z 为上游）。
// 整章放在世界坐标 X = CH2_ORIGIN.x 处：离第一章很远（远于镜头远裁剪 600 m），第一章的触发、碰撞、雾和分区都碰不到这里。
// 卸载时把自己建的碰撞体、网格、几何体和材质全部释放；第一章不动（暂时常驻，真正的第一章卸载留到以后）。
//
// C2 规则：
// - 可走 = 西岸一整条（A 入口 + B 西岸 + E 码头 + D 上游西）、东岸一整条（C 东岸 + D 上游东）、G 石龟浅滩外环和出口；
//   河道 x=-6～6、石龟水池 34～44 × 52～60（walk_exclude）没有地面碰撞。
// - 河岸边：看得见的矮坎（0.35 m）+ 看不见的 2 m 挡墙（角色最高跳 1.0 m），孩子不会不小心掉进河里。
// - 外缘：2.5 m 高的土坡，既挡人也当远处的「地形」。
// - 以后要打开的口子（踏石、上筏、水闸检修台、石龟池边、木筏靠岸）先留好，默认关着，由 C4/C5/C7/C8 打开。
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics';

export const CH2_ORIGIN = new THREE.Vector3(3000, 0, 0);
type Rect = [number, number, number, number]; // x0, x1, z0, z1

/** 可走地面（局部 XZ）。B 和 E 码头重叠，按一块地铺；颜色只为灰盒里分得清区域 */
export const CH2_WALK: { id: string; xz: Rect; color: number }[] = [
  { id: 'A_entry', xz: [-22, -6, 18, 30], color: 0x9c8a62 },
  { id: 'B_west_bank', xz: [-22, -6, -20, 18], color: 0x8f8a5c },
  { id: 'D_upstream_w', xz: [-24, -6, -40, -20], color: 0x7d8058 },
  { id: 'C_east_bank', xz: [6, 22, -20, 14], color: 0x86905e },
  { id: 'D_upstream_e', xz: [6, 24, -40, -20], color: 0x7d8058 },
  { id: 'G_south', xz: [28, 50, 46, 52], color: 0x8a8670 },
  { id: 'G_north', xz: [28, 50, 60, 68], color: 0x8a8670 },
  { id: 'G_west', xz: [28, 34, 52, 60], color: 0x8a8670 },
  { id: 'G_east', xz: [44, 50, 52, 60], color: 0x8a8670 },
  { id: 'G_exit', xz: [36, 44, 68, 76], color: 0x9a9478 },
];
/** 不能走（walk_exclude + 中央河道）：测试用 */
export const CH2_NOWALK: { id: string; xz: Rect }[] = [
  { id: 'river', xz: [-6, 6, -40, 30] },
  { id: 'turtle_pool', xz: [34, 44, 52, 60] },
];
/** E 码头（B 西岸里的一块，C5 木盒、C6 试水浅湾在这里） */
export const CH2_DOCK: Rect = [-20, -6, 0, 12];
export const CH2_WATER_Y = -0.35;
/** 出生点：A 南侧入口营火（局部 -14,0,25），面朝上游 */
export const CH2_SPAWN = { pos: new THREE.Vector3(-14, 0.05, 25), yaw: Math.PI };

type WallKind = 'river' | 'outer' | 'pool';
/** 边线（局部）：x0,z0 → x1,z1 是一条水平或竖直线段；gate 表示以后会打开的口子 */
interface Seg { x0: number; z0: number; x1: number; z1: number; kind: WallKind; inside: 1 | -1; gate?: string }
// inside：墙往哪边偏（+1 往 x/z 增大方向）。河岸墙放在岸上一侧，土坡放在可走区外一侧
const GATES: Record<string, { label: string; owner: string }> = {
  stones_w: { label: '西岸踏石口（z=-8）', owner: 'C4' }, stones_e: { label: '东岸踏石口（z=-8）', owner: 'C4' },
  sluice_w: { label: '西岸水闸检修台（z=-24）', owner: 'C4' }, sluice_e: { label: '东岸水闸检修台（z=-24）', owner: 'C4' },
  raft_board: { label: '码头上筏口（-7,6）', owner: 'C7' }, raft_land: { label: '木筏靠岸口（G 西南）', owner: 'C7' },
  turtle_rim: { label: '石龟池边（北侧中间）', owner: 'C8' },
};
function riverSide(x: number, z0: number, z1: number, inside: 1 | -1, gaps: [string, number, number][]): Seg[] {
  // 沿 x=常数 的河岸，从 z0 到 z1，中间按 gaps 切出口子
  const out: Seg[] = []; let z = z0;
  for (const [g, a, b] of gaps.sort((p, q) => p[1] - q[1])) { if (a > z) out.push({ x0: x, z0: z, x1: x, z1: a, kind: 'river', inside }); out.push({ x0: x, z0: a, x1: x, z1: b, kind: 'river', inside, gate: g }); z = b; }
  if (z < z1) out.push({ x0: x, z0: z, x1: x, z1: z1, kind: 'river', inside });
  return out;
}
const SEGS: Seg[] = [
  // 西岸东缘（面向河）：踏石 z=-8、水闸 z=-24、上筏 z=6
  ...riverSide(-6, -40, 30, -1, [['stones_w', -9.5, -6.5], ['sluice_w', -25.5, -22.5], ['raft_board', 4.5, 7.5]]),
  // 东岸西缘（面向河）
  ...riverSide(6, -40, 14, 1, [['stones_e', -9.5, -6.5], ['sluice_e', -25.5, -22.5]]),
  { x0: 6, z0: 14, x1: 22, z1: 14, kind: 'river', inside: -1 },          // 东岸南缘：下游急流
  // 西侧外缘土坡
  { x0: -22, z0: -20, x1: -22, z1: 30, kind: 'outer', inside: -1 }, { x0: -24, z0: -40, x1: -24, z1: -20, kind: 'outer', inside: -1 },
  { x0: -24, z0: -20, x1: -22, z1: -20, kind: 'outer', inside: 1 },
  { x0: -24, z0: -40, x1: -6, z1: -40, kind: 'outer', inside: -1 },     // 上游尽头（远景水源在 z<-48，无碰撞）
  { x0: -22, z0: 30, x1: -6, z1: 30, kind: 'outer', inside: 1 },        // 入口南缘
  // 东侧外缘土坡
  { x0: 22, z0: -20, x1: 22, z1: 14, kind: 'outer', inside: 1 }, { x0: 24, z0: -40, x1: 24, z1: -20, kind: 'outer', inside: 1 },
  { x0: 22, z0: -20, x1: 24, z1: -20, kind: 'outer', inside: 1 },
  { x0: 6, z0: -40, x1: 24, z1: -40, kind: 'outer', inside: -1 },
  // G 石龟浅滩：南缘是水（木筏在西南靠岸），西/东是土坡，北缘留出口
  { x0: 28, z0: 46, x1: 30, z1: 46, kind: 'river', inside: 1 }, { x0: 30, z0: 46, x1: 34, z1: 46, kind: 'river', inside: 1, gate: 'raft_land' },
  { x0: 34, z0: 46, x1: 50, z1: 46, kind: 'river', inside: 1 },
  { x0: 28, z0: 46, x1: 28, z1: 68, kind: 'outer', inside: -1 }, { x0: 50, z0: 46, x1: 50, z1: 68, kind: 'outer', inside: 1 },
  { x0: 28, z0: 68, x1: 36, z1: 68, kind: 'outer', inside: 1 }, { x0: 44, z0: 68, x1: 50, z1: 68, kind: 'outer', inside: 1 },
  { x0: 36, z0: 68, x1: 36, z1: 76, kind: 'outer', inside: -1 }, { x0: 44, z0: 68, x1: 44, z1: 76, kind: 'outer', inside: 1 },
  { x0: 36, z0: 76, x1: 44, z1: 76, kind: 'outer', inside: 1 },
  // 石龟水池一圈（池边站岗位在 C8 再细分）；北侧中间留口子给龟背通道
  { x0: 34, z0: 52, x1: 44, z1: 52, kind: 'pool', inside: -1 },
  { x0: 34, z0: 60, x1: 37.5, z1: 60, kind: 'pool', inside: 1 }, { x0: 37.5, z0: 60, x1: 40.5, z1: 60, kind: 'pool', inside: 1, gate: 'turtle_rim' }, { x0: 40.5, z0: 60, x1: 44, z1: 60, kind: 'pool', inside: 1 },
  { x0: 34, z0: 52, x1: 34, z1: 60, kind: 'pool', inside: -1 }, { x0: 44, z0: 52, x1: 44, z1: 60, kind: 'pool', inside: 1 },
];

export interface Ch2Gate { id: string; label: string; owner: string; readonly open: boolean; setOpen(v: boolean): void }
export interface Ch2Shell {
  root: THREE.Group;
  /** 局部坐标 → 世界坐标 */
  world(x: number, y: number, z: number): THREE.Vector3;
  spawn: { pos: THREE.Vector3; yaw: number };
  gates: Record<string, Ch2Gate>;
  /** 可走 / 不可走的矩形（局部），自动测试用 */
  layout: { walk: typeof CH2_WALK; nowalk: typeof CH2_NOWALK; dock: Rect };
  stats: { regions: number; colliders: number; meshes: number; walls: number; gates: number };
  update(dt: number, t: number): void;
  dispose(): void;
}

export function buildChapter2Shell(scene: THREE.Scene, ph: Physics): Ch2Shell {
  const root = new THREE.Group(); root.name = 'chapter2_shell'; root.position.copy(CH2_ORIGIN); scene.add(root);
  const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [], cols: RAPIER.Collider[] = [];
  const world = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).add(CH2_ORIGIN);
  const mat = (c: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, ...extra }); mats.push(m); return m; };
  let meshes = 0;
  const addBox = (name: string, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, m: THREE.Material | null, collide: boolean) => {
    let mesh: THREE.Mesh | null = null; let col: RAPIER.Collider | null = null;
    if (m) { const g = new THREE.BoxGeometry(sx, sy, sz); geos.push(g); mesh = new THREE.Mesh(g, m); mesh.name = 'ch2_' + name; mesh.position.set(cx, cy, cz); mesh.receiveShadow = true; mesh.castShadow = sy > 1; root.add(mesh); meshes++; }
    if (collide) { col = ph.box(world(cx, cy, cz), { x: sx, y: sy, z: sz }); cols.push(col); }
    return { mesh, col };
  };

  // 地面：每块 1 m 厚，顶面 y=0
  for (const r of CH2_WALK) { const [x0, x1, z0, z1] = r.xz; addBox(r.id, (x0 + x1) / 2, -0.5, (z0 + z1) / 2, x1 - x0, 1, z1 - z0, mat(r.color), true); }

  // 边线
  const curbM = mat(0x8a7a5a), bermM = mat(0x6f6a4c), poolM = mat(0x7d7466);
  const gates: Record<string, Ch2Gate> = {}; let walls = 0;
  const gateParts: Record<string, { meshes: THREE.Mesh[]; boxes: { c: THREE.Vector3; s: THREE.Vector3 }[]; cols: (RAPIER.Collider | null)[] }> = {};
  for (const s of SEGS) {
    const alongX = s.z0 === s.z1; const len = alongX ? Math.abs(s.x1 - s.x0) : Math.abs(s.z1 - s.z0); if (len < 0.01) continue;
    const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2;
    const off = (d: number) => alongX ? [mx, mz + s.inside * d] : [mx + s.inside * d, mz];
    const size = (w: number) => alongX ? [len, w] : [w, len];
    const parts: { mesh: THREE.Mesh | null; col: RAPIER.Collider | null; c: THREE.Vector3; s: THREE.Vector3 }[] = [];
    const piece = (name: string, d: number, w: number, h: number, y: number, m: THREE.Material | null, collide = true) => {
      const [cx, cz] = off(d), [sx, sz] = size(w); const r = addBox(name, cx, y, cz, sx, h, sz, m, collide);
      parts.push({ ...r, c: new THREE.Vector3(cx, y, cz), s: new THREE.Vector3(sx, h, sz) });
    };
    if (s.kind === 'outer') { piece(`berm_${walls}`, 1.0, 2.0, 2.5, 1.25, bermM); }
    else { // 河岸 / 池边：矮坎（看得见，有碰撞）+ 2 m 隐形挡墙（同位置，稍窄）
      piece(`${s.kind}_curb_${walls}`, 0.25, 0.5, 0.35, 0.175, s.kind === 'pool' ? poolM : curbM);
      piece(`${s.kind}_wall_${walls}`, 0.1, 0.2, 2.0, 1.0, null);
    }
    walls++;
    if (s.gate) {
      const gp = (gateParts[s.gate] ??= { meshes: [], boxes: [], cols: [] });
      for (const p of parts) { if (p.mesh) gp.meshes.push(p.mesh); if (p.col) { gp.boxes.push({ c: p.c, s: p.s }); gp.cols.push(p.col); } }
    }
  }
  for (const [id, gp] of Object.entries(gateParts)) {
    let open = false;
    gates[id] = { id, ...GATES[id], get open() { return open; }, setOpen(v: boolean) {
      if (v === open) return; open = v;
      for (const m of gp.meshes) m.visible = !v;
      gp.cols.forEach((c, i) => {
        if (v) { if (c) { ph.remove(c); const k = cols.indexOf(c); if (k >= 0) cols.splice(k, 1); } gp.cols[i] = null; }
        else { const b = gp.boxes[i]; const nc = ph.box(world(b.c.x, b.c.y, b.c.z), b.s); cols.push(nc); gp.cols[i] = nc; }
      });
    } };
  }

  // 河面（只看不走，没有碰撞；掉下去会从出生点重来）
  const wg = new THREE.PlaneGeometry(130, 150); geos.push(wg);
  const water = new THREE.Mesh(wg, mat(0x5f8f97, { roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.85 }));
  water.name = 'ch2_water'; water.rotation.x = -Math.PI / 2; water.position.set(14, CH2_WATER_Y, 18); root.add(water); meshes++;
  // 河底（水下 3 m）：没有碰撞，只为看起来不是悬空
  const bg = new THREE.PlaneGeometry(130, 150); geos.push(bg);
  const bed = new THREE.Mesh(bg, mat(0x3f4d3e)); bed.name = 'ch2_riverbed'; bed.rotation.x = -Math.PI / 2; bed.position.set(14, CH2_WATER_Y - 3, 18); root.add(bed); meshes++;

  // 灰盒标记（不发光源，只是看得见的方块）：营火、水闸、码头木盒、石龟
  const marker = (name: string, x: number, z: number, sx: number, sy: number, sz: number, c: number, emissive = 0) => {
    const g = new THREE.BoxGeometry(sx, sy, sz); geos.push(g); const m = new THREE.Mesh(g, mat(c, emissive ? { emissive, emissiveIntensity: 0.8 } : {}));
    m.name = 'ch2_' + name; m.position.set(x, sy / 2 + (name === 'sluice_marker' ? CH2_WATER_Y : 0), z); m.castShadow = true; root.add(m); meshes++; return m;
  };
  const fire = marker('campfire_marker', -12.5, 26.5, 1.2, 0.3, 1.2, 0xd98a3a, 0xd9761f);
  marker('sluice_marker', 0, -24, 12, 1.6, 0.6, 0x6b5a44);        // 横跨河道的旧闸（只看，无碰撞）
  marker('crate_marker', -12, 7, 1.0, 0.8, 1.0, 0x9a6b3c);        // 码头木盒（C5）
  marker('turtle_marker', 39, 56, 7, 1.4, 5.5, 0x6e7a6a);          // 石龟（C8）

  let t0 = 0;
  return {
    root, world, gates, layout: { walk: CH2_WALK, nowalk: CH2_NOWALK, dock: CH2_DOCK },
    spawn: { pos: world(CH2_SPAWN.pos.x, CH2_SPAWN.pos.y, CH2_SPAWN.pos.z), yaw: CH2_SPAWN.yaw },
    stats: { regions: CH2_WALK.length, colliders: cols.length, meshes, walls, gates: Object.keys(gates).length },
    update(dt) { t0 += dt; (fire.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.75 + Math.sin(t0 * 7) * 0.12 + Math.sin(t0 * 13) * 0.06; }, // 不加点光源：灯数一变全场着色器要重编（11-09 卡顿的原因）
    dispose() {
      for (const c of cols) ph.remove(c);
      cols.length = 0;
      for (const g of Object.values(gateParts)) g.cols.length = 0;
      scene.remove(root);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      geos.length = 0; mats.length = 0;
    },
  };
}
