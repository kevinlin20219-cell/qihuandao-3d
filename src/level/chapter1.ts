import * as THREE from 'three';
import { boardPose } from '../codex/bridge_pose';
import RAPIER from '@dimforge/rapier3d-compat';
import { Physics } from '../physics';
import type { CharId } from '../data/characters';

// 第一章前半段灰盒布局。坐标单位：米。+Y 向上，前进方向为 -Z。
// 正式场景由 Codex 在 Blender 中按同样尺寸搭建（见 docs/灰盒布局说明_第一章.md）。

export interface Pad {
  id: 'winch' | 'counterweight' | 'ropeclip' | 'lure_l' | 'lure_r' | 'gate_l' | 'gate_r' | 'calm';
  name: string;
  pos: THREE.Vector3;
  need?: CharId;
  ring: THREE.Mesh;
  occupant: CharId | null;
}

export type ItemId = 'iron_hook' | 'vine_rope' | 'hook_rope';
export const ITEMS: Record<ItemId, { name: string; icon: string; img?: string }> = {
  iron_hook: { name: '铁钩', icon: '🪝' },
  vine_rope: { name: '结实的藤条', icon: '🌿' },
  hook_rope: { name: '钩绳', icon: '🪢' },
};
/** 地上可以捡的材料：微微发光，visible = 现在能不能看见（比如藤条要等藤蔓拨开） */
export interface Pickup { id: ItemId; pos: THREE.Vector3; group: THREE.Group; taken: boolean; visible: boolean; item: THREE.Object3D; gray: THREE.Object3D[]; spin: boolean }

export interface Checkpoint { id: string; pos: THREE.Vector3; yaw: number; }

export interface Level {
  checkpoints: Record<string, Checkpoint>;
  vine: { group: THREE.Group; collider: RAPIER.Collider | null; footprints: THREE.Mesh[]; pos: THREE.Vector3; curtain?: { morphs: THREE.Mesh[]; legacy: THREE.Object3D[] }; opened?: boolean };
  boulder: { mesh: THREE.Mesh; body: RAPIER.RigidBody; start: THREE.Vector3; end: THREE.Vector3; radius: number; progress: number; gone: boolean };
  winch: { pos: THREE.Vector3; mesh: THREE.Group; beams: THREE.Mesh[] };
  pads: Pad[];
  roam?: { opened: boolean; open(ph: Physics): number; releaseBoulder(ph: Physics): number };
  bridge: { planks: THREE.Mesh[]; raised: number; colliders: RAPIER.Collider[]; startZ: number; endZ: number; ropes: THREE.Group; posts: THREE.Mesh[];
    anim?: THREE.Object3D[]; haul?: (r: number, t: number, w: number) => void; ropeVis?: { geo: THREE.BufferGeometry; x0: Float32Array; u: Float32Array; sx: number }[]; sway?: number };
  deadEnds: { pos: THREE.Vector3; radius: number; who: CharId; line: string }[];
  bridgeGates: RAPIER.Collider[];
  endZ: number;
  deer: THREE.Group;
  deerParts: { head: THREE.Group; plank: THREE.Mesh; aura: THREE.Mesh; moss: THREE.Mesh; collider: RAPIER.Collider | null };
  lures: Pad[];
  /** 苔鹿：low = 低头程度 0..1；lureT = 这次苔花还能让它低头几秒；cool = 苔花合上后重新张开的倒计时；calm = 派派的安抚位 */
  deerState: { group: THREE.Group; low: number; lureT: number; cool: number; side: number; freed: boolean; leave: number; calmPad: Pad };
  /** 0179：鹿角苔花光（取下断木后亮起） */
  deerFx?: THREE.Sprite;
  /** 0171：苔鹿模型（10 段动作）；有它时灰盒鹿隐藏，动作代替代码转头 */
  deerVis?: { mixer: THREE.AnimationMixer; acts: Record<string, THREE.AnimationAction>; wood: THREE.Object3D | null; cur: string; t: number; enterT: number; phase: 'idle' | 'enter' | 'hold' | 'exit' | 'fexit' | 'calm' | 'leave' | 'done' };
  /** 找物品做工具：地上的材料、工作台、坏掉的绳扣 */
  pickups: Pickup[];
  workbench: { pos: THREE.Vector3; group: THREE.Group; gray: THREE.Object3D[] };
  /** 灰盒机关外观（换 Codex 机关模型时隐藏）+ 新模型的活动节点 */
  mechVis: { winch: THREE.Object3D[]; counterweight: THREE.Object3D[]; ropeclip: THREE.Object3D[]; drum?: THREE.Object3D; handle?: THREE.Object3D; weight?: THREE.Object3D; weightRope?: THREE.Object3D; weightLever?: THREE.Object3D; latch?: THREE.Object3D };
  ropeclipFix: { hook: THREE.Group; fixed: boolean; broken: THREE.Object3D; fixedVis: THREE.Object3D; gray: THREE.Object3D[] };
  /** 入口双锁石门：两块踏石同时有人、喊口令后打开 */
  gate: { left: THREE.Object3D; right: THREE.Object3D; gray: THREE.Object3D[]; padVis: THREE.Object3D[]; text: THREE.Object3D | null; textExtra: THREE.Object3D[]; model: THREE.Object3D | null; collider: RAPIER.Collider | null; pads: Pad[]; open: number; opening: boolean; crack: number; plaque: THREE.Vector3 };
  water: THREE.Mesh;
  update(dt: number, t: number): void;
}

/** 宣传片色调（金色傍晚、苔绿、暖石、清溪）。?grade=old 换回原来的灰盒颜色做对比 */
const PROMO: Record<string, number> = { grass: 0x8e9a44, grassDark: 0x6c7a33, dirt: 0xc49c63, rock: 0x9c8765, cliff: 0xa88a62, wood: 0x8f5e33,
  woodDark: 0x5f3d1f, rope: 0xd8b77a, leaf: 0x5c8a35, leaf2: 0x89a344, trunk: 0x6e4a28, vine: 0x4f7a2e, stone: 0xb09c78, water: 0x4c9c95, deer: 0x7a8a46 };
/** 0105：灰盒植物也接风——按高度给 _wind_weight（根部 0，顶部 top），由 scene_manifest 的 applyWind 接同一个风场 */
function windWeights(g: THREE.BufferGeometry, y0: number, y1: number, top: number) {
  const p = g.getAttribute('position'); const w = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))); w[i] = t * t * top; }
  g.setAttribute('_wind_weight', new THREE.BufferAttribute(w, 1));
}

export function applyGrade(grade: string) {
  if (grade === 'old') return;
  for (const [k, c] of Object.entries(PROMO)) ((M as Record<string, THREE.Material>)[k] as THREE.MeshStandardMaterial).color.setHex(c);
  (M.water as THREE.MeshStandardMaterial).roughness = 0.55; // 水面太光滑时，逆光下太阳反光被泛光放大成一团白光
}
const M = {
  grass: new THREE.MeshStandardMaterial({ color: 0x6f9a4a, roughness: 0.95 }),
  grassDark: new THREE.MeshStandardMaterial({ color: 0x557d3a, roughness: 0.95 }),
  dirt: new THREE.MeshStandardMaterial({ color: 0xa88a5c, roughness: 1 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.9, flatShading: true }),
  cliff: new THREE.MeshStandardMaterial({ color: 0x9a8466, roughness: 1, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.85 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x5e3b22, roughness: 0.9 }),
  rope: new THREE.MeshStandardMaterial({ color: 0xc9b07a, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.9, flatShading: true }),
  leaf2: new THREE.MeshStandardMaterial({ color: 0x5b8f3c, roughness: 0.9, flatShading: true }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }),
  vine: new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 0.8, side: THREE.DoubleSide }),
  thorn: new THREE.MeshStandardMaterial({ color: 0x4a3b2a, roughness: 1, flatShading: true }),
  stone: new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.8, flatShading: true }),
  print: new THREE.MeshBasicMaterial({ color: 0x3b2a1a, transparent: true, opacity: 0.0, depthWrite: false }),
  water: new THREE.MeshStandardMaterial({ color: 0x2f7f99, roughness: 0.25, metalness: 0.1 }),
  deer: new THREE.MeshStandardMaterial({ color: 0x6b7f4a, roughness: 1, flatShading: true }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.85 }),
  beam: new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.0, depthWrite: false }),
};

function boxMesh(scene: THREE.Object3D, center: THREE.Vector3Like, size: THREE.Vector3Like, mat: THREE.Material, rotY = 0, rotX = 0, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
  m.position.set(center.x, center.y, center.z);
  m.rotation.set(rotX, rotY, 0, 'YXZ');
  m.receiveShadow = true; m.castShadow = shadow;
  scene.add(m);
  return m;
}

/** 地面：可见 + 碰撞 */
function ground(scene: THREE.Object3D, ph: Physics, x0: number, x1: number, z0: number, z1: number, top: number, mat = M.grass) {
  const c = new THREE.Vector3((x0 + x1) / 2, top - 0.5, (z0 + z1) / 2);
  const s = new THREE.Vector3(Math.abs(x1 - x0), 1, Math.abs(z1 - z0));
  boxMesh(scene, c, s, mat, 0, 0, false);
  ph.box(c, s);
}

/** 看不见的墙（树林、岩壁的碰撞），高 4 米 */
function wall(ph: Physics, x0: number, x1: number, z0: number, z1: number, base: number) {
  const c = { x: (x0 + x1) / 2, y: base + 2, z: (z0 + z1) / 2 };
  const col = ph.box(c, { x: Math.max(0.4, Math.abs(x1 - x0)), y: 4, z: Math.max(0.4, Math.abs(z1 - z0)) });
  if (wallTag) roamWalls[wallTag].push(col);
  return col;
}
/** 用户（11-06）活动区域扩大：open = 地表碰撞铺好后拆掉的小路墙；boulder = 巨石坡两侧，推走巨石后再拆 */
let wallTag: 'open' | 'boulder' | null = null;
const roamWalls: Record<'open' | 'boulder', RAPIER.Collider[]> = { open: [], boulder: [] };
const tagged = (t: 'open' | 'boulder', f: () => void) => { wallTag = t; f(); wallTag = null; };

export function buildChapter1(scene: THREE.Scene, ph: Physics): Level {
  const root = new THREE.Group(); root.name = 'chapter1_graybox'; scene.add(root);
  const rng = mulberry(7);

  // ---------- 区域 A：林间空地与岔路口（y = 0） ----------
  ground(root, ph, -15, 15, -15, 15, 0);
  // 小路（纯视觉）
  boxMesh(root, { x: 0, y: 0.01, z: 2 }, { x: 2.4, y: 0.02, z: 22 }, M.dirt, 0, 0, false);
  boxMesh(root, { x: -9, y: 0.011, z: -8 }, { x: 14, y: 0.02, z: 2.2 }, M.dirt, 0, 0, false);
  boxMesh(root, { x: 9, y: 0.011, z: -8 }, { x: 14, y: 0.02, z: 2.2 }, M.dirt, 0, 0, false);
  // 空地四周的树墙（留出西、东、北三个口）
  wall(ph, -15, -2.2, 15, 15, 0); wall(ph, 2.2, 15, 15, 15, 0);
  // ---------- 入口小道与双锁石门（剧情 v0.2 第一章「起」） ----------
  ground(root, ph, -3, 3, 15, 30, 0, M.dirt);
  tagged('open', () => { wall(ph, -3.2, -3.2, 15, 30, 0); wall(ph, 3.2, 3.2, 15, 30, 0); wall(ph, -3.2, 3.2, 30.2, 30.2, 0); });
  const gateGray: THREE.Object3D[] = []; // 灰盒石门的可见部分；换成 Codex 的石门模型时一起隐藏
  for (const sx of [-1, 1]) { // 门两侧的石柱
    gateGray.push(boxMesh(root, { x: sx * 2.7, y: 1.7, z: 15.2 }, { x: 1.0, y: 3.4, z: 1.0 }, M.rock, 0, 0, true));
    for (let i = 0; i < 11; i++) boxMesh(root, { x: sx * 3.4, y: 1.5, z: 16 + i * 1.4 }, { x: 0.8, y: 3, z: 1.3 }, M.grassDark, 0, 0, true);
  }
  gateGray.push(boxMesh(root, { x: 0, y: 3.55, z: 15.2 }, { x: 6.4, y: 0.5, z: 1.1 }, M.rock, 0, 0, true)); // 门楣
  const gateL = boxMesh(root, { x: -1.1, y: 1.65, z: 15.2 }, { x: 2.2, y: 3.3, z: 0.5 }, M.rock, 0, 0, true);
  const gateR = boxMesh(root, { x: 1.1, y: 1.65, z: 15.2 }, { x: 2.2, y: 3.3, z: 0.5 }, M.rock, 0, 0, true);
  gateGray.push(gateL, gateR);
  const gateCollider = ph.box({ x: 0, y: 1.7, z: 15.2 }, { x: 4.4, y: 3.4, z: 0.6 });
  const gatePads: Pad[] = ([['gate_l', '左边的踏石', -1.7], ['gate_r', '右边的踏石', 1.7]] as const).map(([id, name, x]) => {
    const pos = new THREE.Vector3(x, 0, 18.2);
    gateGray.push(boxMesh(root, { x, y: 0.06, z: 18.2 }, { x: 1.1, y: 0.12, z: 1.1 }, M.rock, 0, 0, false));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0xe2b45a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.14, 18.2); root.add(ring);
    return { id, name, pos, ring, occupant: null } as Pad;
  });
  // ---------- 找物品做工具：铁钩（西边观景台木桩）、藤条（藤蔓拨开后）、桥头木盒工作台 ----------
  const mkPickup = (id: ItemId, pos: THREE.Vector3, visible: boolean): Pickup => {
    const g = new THREE.Group(); g.position.copy(pos); root.add(g);
    const gray: THREE.Object3D[] = []; let item!: THREE.Object3D;
    if (id === 'iron_hook') {
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.55, 10), M.trunk); stump.position.y = 0.27; stump.castShadow = true; g.add(stump);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 14, Math.PI * 1.3), new THREE.MeshStandardMaterial({ color: 0x5a5a60, metalness: 0.6, roughness: 0.4 }));
      hook.position.set(0, 0.62, 0); hook.rotation.set(0, 0.6, 0.4); hook.name = 'item'; g.add(hook); gray.push(stump, hook); item = hook;
    } else {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 18), M.vine); coil.rotation.x = Math.PI / 2; coil.position.y = 0.06; coil.name = 'item'; g.add(coil); gray.push(coil); item = coil;
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = id === 'iron_hook' ? 0.57 : 0.02; ring.name = 'glow'; g.add(ring);
    g.visible = visible;
    return { id, pos, group: g, taken: false, visible, item, gray, spin: true };
  };
  const pickups: Pickup[] = [
    mkPickup('iron_hook', new THREE.Vector3(-24.2, 0, -7.2), true),
    mkPickup('vine_rope', new THREE.Vector3(1.2, 0.073, -16.2), false),
  ];
  // 0237/0239：制作点改到桥头原有木盒上，去掉通路中间的灰盒树桩；kit_bench 只放盒盖上的工具小件
  const wbGroup = new THREE.Group(); wbGroup.position.set(-6.5, 1.5, -40); root.add(wbGroup);
  ph.box({ x: -6.5, y: 1.82, z: -40 }, { x: 0.8, y: 0.64, z: 0.74 });
  // 绳扣上的钩子：一开始是断的（只剩半截），装上钩绳后显示完整的钩子
  const clipHook = new THREE.Group(); clipHook.position.set(2.6, 1.5, -49.5); root.add(clipHook);
  { const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), M.woodDark); post.position.y = 1.3; post.castShadow = true; clipHook.add(post);
    const broken = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 12, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: 0x5a5a60, metalness: 0.6, roughness: 0.4 }));
    broken.position.set(0, 2.4, 0.15); broken.name = 'broken'; clipHook.add(broken);
    const fixed = new THREE.Group(); fixed.name = 'fixed'; fixed.visible = false; clipHook.add(fixed);
    const hk = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 14, Math.PI * 1.4), broken.material); hk.position.set(0, 2.4, 0.15); fixed.add(hk);
    const rp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), M.rope); rp.position.set(0, 1.9, 0.15); fixed.add(rp); }

  // 门上的刻字石板
  gateGray.push(boxMesh(root, { x: 0, y: 2.6, z: 15.48 }, { x: 1.6, y: 0.5, z: 0.06 }, M.woodDark, 0, 0, false)); // 灰盒挂牌：换成 Codex 石门时一起隐藏（v45 前漏了，挡在真挂牌前面）
  tagged('open', () => { wall(ph, -15, -15, -15, -10.2, 0); wall(ph, -15, -15, -5.8, 15, 0);
  wall(ph, 15, 15, -15, -10.2, 0); wall(ph, 15, 15, -5.8, 15, 0); });
  wall(ph, -15, -2.2, -15, -15, 0); wall(ph, 2.2, 15, -15, -15, 0);

  // 西路：通向悬崖观景台（死路）
  ground(root, ph, -27, -15, -10.2, -5.8, 0);
  tagged('open', () => { wall(ph, -27, -15, -10.4, -10.4, 0); wall(ph, -27, -15, -5.6, -5.6, 0); wall(ph, -27.2, -27.2, -10.4, -5.6, 0); });
  for (let i = 0; i < 5; i++) rock(root, -27.5, 0, -10 + i, 0.7 + rng() * 0.5);
  // 悬崖下方的远景
  boxMesh(root, { x: -33, y: -6, z: -8 }, { x: 10, y: 12, z: 30 }, M.cliff, 0, 0, false);

  // 东路：荆棘丛（死路）
  ground(root, ph, 15, 27, -10.2, -5.8, 0);
  tagged('open', () => { wall(ph, 15, 27, -10.4, -10.4, 0); wall(ph, 15, 27, -5.6, -5.6, 0); wall(ph, 25, 25, -10.4, -5.6, 0); });
  for (let i = 0; i < 9; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.35 + rng() * 0.3, 1.4 + rng(), 5), M.thorn);
    t.position.set(24 + rng() * 2.5, 0.7, -10 + rng() * 4); t.rotation.set(rng() - 0.5, rng() * 3, rng() - 0.5); t.castShadow = true; root.add(t);
  }

  // 北口的藤蔓墙（派派的细节之眼能看出后面有路）
  const vine = new THREE.Group(); vine.position.set(0, 0, -15.2); root.add(vine);
  for (let i = 0; i < 26; i++) {
    const h = 2.2 + rng() * 1.6;
    const strand = new THREE.Mesh(new THREE.PlaneGeometry(0.35 + rng() * 0.3, h), M.vine);
    strand.position.set(-2 + rng() * 4, h / 2, (rng() - 0.5) * 0.5); strand.rotation.y = (rng() - 0.5) * 0.8;
    vine.add(strand);
  }
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + rng() * 0.4, 0), M.leaf2);
    b.position.set(-2 + rng() * 4, 2.4 + rng() * 1.2, rng() * 0.6 - 0.3); b.castShadow = true; vine.add(b);
  }
  const vineCollider = ph.box({ x: 0, y: 1.6, z: -15.2 }, { x: 4.6, y: 3.2, z: 0.6 });
  // 藤蔓前地面上的脚印（只有观察时显现）
  const footprints: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const fp = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10), M.print.clone());
    fp.rotation.x = -Math.PI / 2; fp.scale.set(0.8, 1.6, 1);
    fp.position.set((i % 2 ? 0.18 : -0.18) + Math.sin(i * 0.6) * 0.3, 0.025, -9.5 - i * 0.7);
    root.add(fp); footprints.push(fp);
  }

  // ---------- 北路：上坡到落石坡（y 0 → 1.5） ----------
  ground(root, ph, -2.5, 2.5, -18, -15, 0, M.dirt);
  // 坡道
  const rampLen = Math.hypot(8, 1.5), ang = Math.atan2(1.5, 8);
  const rampC = new THREE.Vector3(0, 0.75 - 0.5 * Math.cos(ang), -22);
  boxMesh(root, rampC, { x: 5, y: 1, z: rampLen }, M.dirt, 0, ang, false);
  ph.box(rampC, { x: 5, y: 1, z: rampLen }, 0, ang);
  ground(root, ph, -2.5, 2.5, -38, -26, 1.5, M.dirt);
  // 两侧岩壁
  for (const side of [-1, 1]) {
    boxMesh(root, { x: side * 4, y: 2.2, z: -26 }, { x: 3, y: 4.4, z: 23 }, M.cliff);
    tagged('boulder', () => wall(ph, side * 2.6, side * 2.6, -38, -15, 0));
  }
  // 巨石所在处收窄
  for (const side of [-1, 1]) {
    boxMesh(root, { x: side * 2.1, y: 2.4, z: -30 }, { x: 0.9, y: 1.8, z: 2.2 }, M.rock);
    ph.box({ x: side * 2.1, y: 2.4, z: -30 }, { x: 0.9, y: 1.8, z: 2.2 });
  }

  // ---------- 区域 B：巨石与机关石板 ----------
  const bR = 1.35;
  const bStart = new THREE.Vector3(0, 1.5 + bR, -30.0);
  const bEnd = new THREE.Vector3(0, 1.5 + bR, -38.5);
  const boulderMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(bR, 1), M.rock);
  boulderMesh.position.copy(bStart); boulderMesh.castShadow = true; boulderMesh.receiveShadow = true; root.add(boulderMesh);
  const boulderBody = ph.kinematicBall(bStart, bR);

  // 巨石下压着的机关石板：刻着齿轮纹
  const winch = new THREE.Group(); winch.position.set(0, 1.5, -30); root.add(winch);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.12, 16), M.stone); plate.position.y = 0.06; plate.receiveShadow = true; winch.add(plate);
  const gear = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 6, 12), M.glow); gear.rotation.x = Math.PI / 2; gear.position.y = 0.14; winch.add(gear);
  winch.visible = false;

  // ---------- 区域 C：断桥头平台（y = 1.5） ----------
  ground(root, ph, -8, 8, -50, -38, 1.5);
  tagged('open', () => { wall(ph, -8, -8, -50, -38, 1.5); wall(ph, 8, 8, -50, -38, 1.5); });
  for (const side of [-1, 1]) boxMesh(root, { x: side * 10, y: 2.6, z: -44 }, { x: 4, y: 2.2, z: 13 }, M.cliff);
  // 东侧缺口：巨石推下去的地方
  // 峡谷：两侧崖壁 + 谷底水面
  boxMesh(root, { x: 0, y: -5.5, z: -44 }, { x: 16, y: 14, z: 12 }, M.cliff, 0, 0, false);
  boxMesh(root, { x: 0, y: -5.5, z: -82 }, { x: 20, y: 14, z: 20 }, M.cliff, 0, 0, false);
  boxMesh(root, { x: -14, y: -5, z: -61 }, { x: 8, y: 12, z: 22 }, M.cliff, 0, 0, false);
  boxMesh(root, { x: 14, y: -5, z: -61 }, { x: 8, y: 12, z: 22 }, M.cliff, 0, 0, false);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), M.water);
  water.rotation.x = -Math.PI / 2; water.position.set(0, -11, -61); root.add(water);
  // 远处的瀑布和水车（远景，参照宣传片）
  // 瀑布：上亮下淡的竖向渐变、半透明、受雾影响（原来是纯白不受光的平面，在泛光下太刺眼）
  const fc = document.createElement('canvas'); fc.width = 8; fc.height = 128; const fg = fc.getContext('2d')!;
  const fgr = fg.createLinearGradient(0, 0, 0, 128); fgr.addColorStop(0, 'rgba(235,246,244,0.85)'); fgr.addColorStop(0.6, 'rgba(205,230,228,0.5)'); fgr.addColorStop(1, 'rgba(205,230,228,0)');
  fg.fillStyle = fgr; fg.fillRect(0, 0, 8, 128); const ftex = new THREE.CanvasTexture(fc); ftex.colorSpace = THREE.SRGBColorSpace;
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(5, 20), new THREE.MeshBasicMaterial({ map: ftex, color: 0xcfdcd6, transparent: true, opacity: 0.55, depthWrite: false }));
  fall.name = 'graybox_waterfall';
  fall.position.set(-9.8, -1, -61); fall.rotation.y = Math.PI / 2; root.add(fall);

  // 桥头柱
  const bridgePosts: THREE.Mesh[] = [];
  for (const z of [-49.6, -72.4]) for (const x of [-1.3, 1.3]) {
    bridgePosts.push(boxMesh(root, { x, y: 2.6, z }, { x: 0.35, y: 2.2, z: 0.35 }, M.woodDark));
    ph.box({ x, y: 2.6, z }, { x: 0.35, y: 2.2, z: 0.35 });
  }

  // 三个机关点：绞盘（需汤团）、配重、绳扣
  const padDefs: { id: Pad['id']; name: string; pos: THREE.Vector3; need?: CharId }[] = [
    { id: 'winch', name: '绞盘', pos: new THREE.Vector3(-5, 1.5, -46), need: 'tangtuan' },
    { id: 'counterweight', name: '配重石', pos: new THREE.Vector3(5, 1.5, -46) },
    { id: 'ropeclip', name: '绳扣', pos: new THREE.Vector3(2.6, 1.5, -48.6) },
  ];
  const pads: Pad[] = padDefs.map((d) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0xe2b45a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(d.pos).add(new THREE.Vector3(0, 0.03, 0)); root.add(ring);
    return { ...d, ring, occupant: null };
  });
  // 机关点外观
  const winchProp = new THREE.Group(); winchProp.position.set(-5, 1.5, -46.9); root.add(winchProp);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 12), M.wood); drum.rotation.z = Math.PI / 2; drum.position.y = 0.7; drum.castShadow = true; winchProp.add(drum);
  for (const sx of [-0.7, 0.7]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 0.3), M.woodDark); p.position.set(sx, 0.5, 0); p.castShadow = true; winchProp.add(p); }
  const cwProp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), M.stone); cwProp.position.set(5, 1.85, -46.9); cwProp.castShadow = true; root.add(cwProp);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), M.woodDark); lever.position.set(5.6, 2.1, -46.2); lever.rotation.z = -0.4; root.add(lever);
  const clip = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 6, 12), M.rope); clip.position.set(2.0, 2.4, -49.3); root.add(clip);

  // 汤团机关透视时出现的连线
  const beams: THREE.Mesh[] = pads.map((p) => {
    const from = new THREE.Vector3(0, 1.7, -40);
    const to = p.pos.clone().add(new THREE.Vector3(0, 0.2, 0));
    const len = from.distanceTo(to);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 6), M.beam.clone());
    m.position.copy(from).lerp(to, 0.5); m.lookAt(to); m.rotateX(Math.PI / 2); root.add(m);
    return m;
  });

  // 峡谷边缘的隐形护栏；桥口有一道「门」，升桥后移除
  for (const z of [-50.15, -71.85]) {
    wall(ph, -10, -1.1, z, z, 1.5); wall(ph, 1.1, 10, z, z, 1.5);
  }
  const bridgeGates = [ph.box({ x: 0, y: 3.5, z: -50.15 }, { x: 2.2, y: 4, z: 0.4 }), ph.box({ x: 0, y: 3.5, z: -71.85 }, { x: 2.2, y: 4, z: 0.4 })];

  // ---------- 吊桥：初始垂在对岸，三点同时后升起 ----------
  const startZ = -49.8, endZ = -72.2;
  const planks: THREE.Mesh[] = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.7), i % 2 ? M.wood : M.woodDark);
    p.castShadow = true; p.receiveShadow = true; root.add(p); planks.push(p);
  }
  const ropes = new THREE.Group(); root.add(ropes);
  for (const x of [-1.15, 1.15]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, endZ - startZ, 6), M.rope);
    r.rotation.x = Math.PI / 2; r.position.set(x, 2.4, (startZ + endZ) / 2); ropes.add(r);
  }
  ropes.visible = false;

  // ---------- 对岸（y = 1.5） ----------
  ground(root, ph, -10, 10, -92, -72, 1.5);
  wall(ph, -10, -10, -92, -72, 1.5); wall(ph, 10, 10, -92, -72, 1.5); wall(ph, -10, 10, -92, -92, 1.5);
  // 守护兽苔鹿（灰盒剪影，下一段）
  // 面朝 +Z（朝向走过来的孩子们）。头颈是一个可转动的组，轴心在颈根。
  const deer = new THREE.Group(); deer.position.set(0, 1.5, -86); root.add(deer);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 2.2), M.deer); torso.position.y = 1.5; deer.add(torso);
  for (const [x, z] of [[-0.35, 0.8], [0.35, 0.8], [-0.35, -0.8], [0.35, -0.8]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), M.deer); l.position.set(x, 0.55, z); deer.add(l); }
  const deerHead = new THREE.Group(); deerHead.position.set(0, 1.9, 0.95); deer.add(deerHead);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 0.4), M.deer); neck.position.set(0, 0.35, 0.18); neck.rotation.x = 0.45; deerHead.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.8), M.deer); head.position.set(0, 0.85, 0.5); deerHead.add(head);
  for (const sd of [-1, 1]) { const a = new THREE.Mesh(new THREE.ConeGeometry(0.06, 1.0, 5), M.woodDark); a.position.set(sd * 0.25, 1.45, 0.35); a.rotation.z = sd * -0.4; deerHead.add(a); }
  const stuck = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.3), M.wood); stuck.position.set(0.3, 1.65, 0.35); stuck.rotation.z = 0.3; deerHead.add(stuck);
  const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: 0x9fc26a, emissive: 0x000000, flatShading: true }));
  moss.position.set(-0.25, 1.85, 0.35); deerHead.add(moss);
  const aura = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe0503a, transparent: true, opacity: 0, depthWrite: false }));
  aura.position.set(0, 1.5, 0.35); deerHead.add(aura);
  deer.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== aura) (o as THREE.Mesh).castShadow = true; });
  // 苔鹿挡住出口：两侧的墙 + 鹿身碰撞
  wall(ph, -10, -2.2, -88.5, -88.5, 1.5); wall(ph, 2.2, 10, -88.5, -88.5, 1.5);
  const deerCollider = ph.box({ x: 0, y: 3.0, z: -86 }, { x: 4.4, y: 3, z: 3.2 });
  // 两处苔花：有人站上去，苔鹿会转头去闻，低下头
  const lures: Pad[] = [new THREE.Vector3(-4.2, 1.5, -81.5), new THREE.Vector3(4.2, 1.5, -81.5)].map((pos, i) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0xb6e07a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(pos).add(new THREE.Vector3(0, 0.03, 0)); root.add(ring);
    for (let k = 0; k < 7; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshStandardMaterial({ color: 0xc9e88a, emissive: 0x334411 })); f.position.copy(pos).add(new THREE.Vector3(Math.cos(k) * 0.4, 0.12, Math.sin(k * 1.7) * 0.4)); root.add(f); }
    return { id: (i ? 'lure_r' : 'lure_l') as any, name: '苔花', pos, ring, occupant: null };
  });

  const calmRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0xf2a6c0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  calmRing.rotation.x = -Math.PI / 2; calmRing.position.set(-1.5, 1.53, -82.9); root.add(calmRing);
  const calmPad: Pad = { id: 'calm', name: '苔鹿身边', pos: new THREE.Vector3(-1.5, 1.5, -82.9), need: 'paipai', ring: calmRing, occupant: null };

  // ---------- 植被：树（实例化） ----------
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.6, 6); trunkGeo.translate(0, 1.3, 0);
  const crownGeo = new THREE.ConeGeometry(1.5, 3.4, 7); crownGeo.translate(0, 3.8, 0);
  const crown2Geo = new THREE.IcosahedronGeometry(1.5, 0); crown2Geo.translate(0, 3.4, 0);
  const treeSpots: [number, number, number][] = [];
  const ring = (cx: number, cz: number, rx: number, rz: number, count: number, y: number) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng() * 0.3;
      treeSpots.push([cx + Math.cos(a) * (rx + rng() * 4), y, cz + Math.sin(a) * (rz + rng() * 4)]);
    }
  };
  ring(0, 0, 17, 17, 46, 0);
  for (let i = 0; i < 30; i++) treeSpots.push([-12 + rng() * 24, 1.5, -95 - rng() * 14]);
  for (let i = 0; i < 18; i++) treeSpots.push([(rng() < 0.5 ? -1 : 1) * (6 + rng() * 4), 4.5, -18 - rng() * 18]);
  // 避开路口
  const okSpot = (x: number, z: number) => !(Math.abs(z + 8) < 3 && Math.abs(x) > 13 && Math.abs(x) < 30) && !(Math.abs(x) < 4 && z < -12 && z > -40);
  const spots = treeSpots.filter(([x, , z]) => okSpot(x, z));
  const trunks = new THREE.InstancedMesh(trunkGeo, M.trunk, spots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, M.leaf, spots.length);
  const crowns2 = new THREE.InstancedMesh(crown2Geo, M.leaf2, spots.length);
  const mtx = new THREE.Matrix4();
  spots.forEach(([x, y, z], i) => {
    const s = 0.8 + rng() * 0.6;
    mtx.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6, 0)), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, mtx);
    crowns.setMatrixAt(i, rng() < 0.55 ? mtx : new THREE.Matrix4().makeScale(0, 0, 0));
    crowns2.setMatrixAt(i, mtx);
  });
  for (const im of [trunks, crowns, crowns2]) { im.castShadow = true; im.receiveShadow = true; root.add(im); }
  windWeights(crownGeo, 2.1, 5.5, 0.5); windWeights(crown2Geo, 1.9, 4.9, 0.5); crowns.name = 'graybox_crowns'; crowns2.name = 'graybox_crowns2';

  // 草丛和花（实例化，纯装饰）
  const tuftGeo = new THREE.ConeGeometry(0.12, 0.35, 4); tuftGeo.translate(0, 0.17, 0);
  const tufts = new THREE.InstancedMesh(tuftGeo, M.grassDark, 900);
  for (let i = 0; i < 900; i++) {
    let x = -14 + rng() * 28, z = -14 + rng() * 28, y = 0;
    if (i > 600) { x = -9 + rng() * 18; z = -91 + rng() * 18; y = 1.5; }
    if (Math.abs(x) < 1.4 && i <= 600) x += 2.5;
    mtx.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(1, 0.6 + rng(), 1));
    tufts.setMatrixAt(i, mtx);
  }
  windWeights(tuftGeo, 0, 0.35, 0.3); tufts.name = 'graybox_tufts';
  root.add(tufts);
  const flowerGeo = new THREE.SphereGeometry(0.07, 6, 4); flowerGeo.translate(0, 0.25, 0);
  const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ color: 0xfff3d6 }), 220);
  for (let i = 0; i < 220; i++) { mtx.makeTranslation(-13 + rng() * 26, 0, -13 + rng() * 26); flowers.setMatrixAt(i, mtx); }
  windWeights(flowerGeo, 0.0, 0.32, 0.3); flowers.name = 'graybox_flowers';
  root.add(flowers);
  // 远山
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x6d8d78, roughness: 1, flatShading: true });
  const hills = new THREE.Group(); hills.name = 'far_hills'; root.add(hills); // 宣传片调色下由远景层（浮岛 / 云海）代替
  for (let i = 0; i < 9; i++) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(18 + rng() * 14, 20 + rng() * 18, 6), hillMat);
    h.position.set(-90 + i * 22, -2, -150 - rng() * 30); hills.add(h);
  }
  // 远处的岛心大树（剪影）
  const bigTree = new THREE.Group(); bigTree.position.set(30, 0, -190); root.add(bigTree);
  const bt = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 34, 8), M.trunk); bt.position.y = 17; bigTree.add(bt);
  const bc = new THREE.Mesh(new THREE.IcosahedronGeometry(22, 1), new THREE.MeshStandardMaterial({ color: 0x5f8a5a, flatShading: true, roughness: 1 })); bc.position.y = 44; bigTree.add(bc);

  const level: Level = {
    checkpoints: {
      start: { id: 'start', pos: new THREE.Vector3(0, 0.05, 22.5), yaw: 0 },
      gate: { id: 'gate', pos: new THREE.Vector3(0, 0.05, 12), yaw: 0 },
      north: { id: 'north', pos: new THREE.Vector3(0, 0.05, -13.5), yaw: 0 },
      slope: { id: 'slope', pos: new THREE.Vector3(0, 1.55, -27.5), yaw: 0 },
      bridgehead: { id: 'bridgehead', pos: new THREE.Vector3(0, 1.55, -41), yaw: 0 },
      bridge1: { id: 'bridge1', pos: new THREE.Vector3(0, 1.6, -51.2), yaw: 0 },
      bridge2: { id: 'bridge2', pos: new THREE.Vector3(0, 1.6, -58.5), yaw: 0 },
      bridge3: { id: 'bridge3', pos: new THREE.Vector3(0, 1.6, -65.5), yaw: 0 },
      far: { id: 'far', pos: new THREE.Vector3(0, 1.55, -74.5), yaw: 0 },
    },
    vine: { group: vine, collider: vineCollider, footprints, pos: new THREE.Vector3(0, 0, -15) },
    boulder: { mesh: boulderMesh, body: boulderBody, start: bStart, end: bEnd, radius: bR, progress: 0, gone: false },
    winch: { pos: new THREE.Vector3(0, 1.5, -30), mesh: winch, beams },
    mechVis: { winch: [winchProp], counterweight: [cwProp, lever], ropeclip: [clip] },
    pads,
    pickups, workbench: { pos: new THREE.Vector3(-6.5, 1.5, -40), group: wbGroup, gray: [...wbGroup.children] }, ropeclipFix: { hook: clipHook, fixed: false, broken: clipHook.getObjectByName('broken')!, fixedVis: clipHook.getObjectByName('fixed')!, gray: [...clipHook.children] },
    gate: { left: gateL, right: gateR, gray: gateGray, padVis: [], text: null, textExtra: [], model: null, collider: gateCollider, pads: gatePads, open: 0, opening: false, crack: 0, plaque: new THREE.Vector3(0, 0, 15.6) },
    bridge: { planks, raised: 0, colliders: [], startZ, endZ, ropes, posts: bridgePosts },
    roam: {
      opened: false,
      /** 地表碰撞铺好后调用：拆小路墙，补上更外圈的边界（石门一线、藤墙一线、峡谷边向两侧延长，外框） */
      open(ph: Physics) {
        if (this.opened) return 0; this.opened = true;
        const n = roamWalls.open.length; roamWalls.open.forEach((c) => ph.remove(c)); roamWalls.open = [];
        // 用户（11-06 晚）：放太大了，远景到近处不好看 → 只在原来的路两侧适当放宽
        wall(ph, -10, -10, 15, 32, 0); wall(ph, 10, 10, 15, 32, 0); wall(ph, -10, 10, 32, 32, 0);            // 入口：±3.2 → ±10，尽头 30.2 → 32
        wall(ph, -21, -15, 15, 15, 0); wall(ph, 15, 21, 15, 15, 0);                                          // 石门一线补到 ±21
        wall(ph, -21, -21, -15, -10.4, 0); wall(ph, -21, -21, -5.6, 15, 0); wall(ph, 21, 21, -15, -10.4, 0); wall(ph, 21, 21, -5.6, 15, 0); // 岔路口 ±15 → ±21
        wall(ph, -27, -21, -10.4, -10.4, 0); wall(ph, -27, -21, -5.6, -5.6, 0); wall(ph, -27.2, -27.2, -10.4, -5.6, 0); // 西死路（宽度不变）
        wall(ph, 21, 27, -10.4, -10.4, 0); wall(ph, 21, 27, -5.6, -5.6, 0); wall(ph, 25, 25, -10.4, -5.6, 0);           // 东死路
        wall(ph, -21, -15, -15, -15, 0); wall(ph, 15, 21, -15, -15, 0);                                      // 藤墙一线补到 ±21
        wall(ph, -8, -8, -38, -15, 0); wall(ph, 8, 8, -38, -15, 0);                                          // 巨石坡：推走巨石后 ±2.6 → ±8
        wall(ph, -13, -8, -38, -38, 0); wall(ph, 8, 13, -38, -38, 0);
        wall(ph, -13, -13, -50, -38, 1.5); wall(ph, 13, 13, -50, -38, 1.5);                                   // 桥头 ±8 → ±13
        wall(ph, -13, -10, -50.15, -50.15, 1.5); wall(ph, 10, 13, -50.15, -50.15, 1.5);                       // 峡谷边补到 ±13
        return n;
      },
      releaseBoulder(ph: Physics) {
        if (!this.opened || !roamWalls.boulder.length) return 0;
        const n = roamWalls.boulder.length; roamWalls.boulder.forEach((c) => ph.remove(c)); roamWalls.boulder = []; return n;
      },
    },
    deadEnds: [
      { pos: new THREE.Vector3(-25.5, 0, -8), radius: 2.2, who: 'paipai', line: '这边是悬崖……下面好深，过不去的。' },
      { pos: new THREE.Vector3(23, 0, -8), radius: 2.2, who: 'hanhan', line: '全是刺，别往里钻了，换条路。' },
    ],
    endZ: -76,
    bridgeGates,
    deer,
    deerParts: { head: deerHead, plank: stuck, aura, moss, collider: deerCollider },
    lures,
    deerState: { group: deer, low: 0, lureT: 0, cool: 0, side: 0, freed: false, leave: 0, calmPad },
    water,
    update(dt: number, t: number) {
      // 吊桥：raised 0 = 垂在对岸崖壁，1 = 铺平
      const r = this.bridge.raised, B = this.bridge;
      // 0147 新吊桥：驱动模型里的 28 个 ANIM_plank 组（轴心 = 铺平时板心）；垂下挂点 z 用 endZ+0.6（旧灰盒是 endZ−0.6）
      const boards: THREE.Object3D[] = B.anim ?? planks, hangZ = B.anim ? endZ + 0.6 : endZ - 0.6;
      if (B.anim && B.haul) { // 0179：U 形提起 + 展开 + 最后 10% 落座；完全升起与旧公式板心一致。四根牵引绳跟着首末板内边
        B.anim.forEach((p, i) => { const q = boardPose(i, r, t, windSway); p.position.fromArray(q.position); p.rotation.set(q.pitch, 0, q.roll, 'XYZ'); });
        B.haul(r, t, windSway);
      } else boards.forEach((p, i) => {
        const u = (i + 0.5) / n;
        const flatZ = startZ + (endZ - startZ) * u;
        const sag = Math.sin(u * Math.PI) * 0.35;
        const flat = new THREE.Vector3(0, 1.44 - sag * r, flatZ);
        // 垂下：从对岸桥头往下挂
        const hang = new THREE.Vector3(0, 1.2 - (1 - u) * (endZ - startZ) * -0.9, hangZ);
        p.position.lerpVectors(hang, flat, easeInOut(Math.min(1, r * 1.0)));
        p.rotation.x = (1 - r) * Math.PI / 2;
        // 风吹时左右摆动
        p.rotation.z = Math.sin(t * 1.3 + u * 3) * 0.015 * r + windSway * Math.sin(u * Math.PI);
        p.position.x = windSway * 6 * Math.sin(u * Math.PI);
      });
      if (B.ropeVis) { // 护绳：两端固定，按 u 逐顶点横摆，和桥板一致
        if (B.sway !== windSway) { B.sway = windSway;
          for (const rv of B.ropeVis) { const a = rv.geo.getAttribute('position') as THREE.BufferAttribute;
            for (let k = 0; k < a.count; k++) a.setX(k, rv.x0[k] + windSway * 6 * Math.sin(rv.u[k] * Math.PI) / rv.sx); a.needsUpdate = true; } }
      } else ropes.children.forEach((c, i) => { c.position.x = (i ? 1.15 : -1.15) + windSway * 4; });
      (M.water as THREE.MeshStandardMaterial).color.setHSL(0.54, 0.5, 0.36 + Math.sin(t * 0.8) * 0.02);
      // 石门：打开时两扇向两侧滑开；只有一个人踩时开一条缝
      { const G = level.gate; if (G.opening) G.open = Math.min(1, G.open + dt / 1.6);
        const gap = Math.max(G.open * 1.9, G.crack); G.left.position.x = -1.1 - gap; G.right.position.x = 1.1 + gap;
        // 石门模型：踏石被踩时下沉 4 厘米；门完全打开后才显出刻字
        G.padVis.forEach((pv, i) => { pv.position.y += ((G.pads[i].occupant ? -0.04 : 0) - pv.position.y) * Math.min(1, dt * 12); });
        if (G.text) G.text.visible = G.open >= 0.98;
        for (const o of G.textExtra) o.visible = G.open >= 0.98; } // 新样板的刻字底板 / 吊架跟着刻字显隐（0087）
      // 材料微光一闪一闪
      for (const pk of level.pickups) { if (!pk.group.visible) continue; const gl = pk.group.getObjectByName('glow') as THREE.Mesh; (gl.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 3 + pk.pos.x) * 0.2; if (pk.spin && !pk.taken) pk.item.rotation.y += dt * 0.8; }
      [...pads, ...lures, ...level.gate.pads, level.deerState.calmPad].forEach((p) => {
        const m = p.ring.material as THREE.MeshBasicMaterial;
        m.opacity = p.occupant ? 0.9 : 0.3 + Math.sin(t * 3) * 0.08;
        m.color.set(p.id === 'ropeclip' && !level.ropeclipFix.fixed ? 0xd0644a : p.occupant ? 0xffe9a6 : 0xe2b45a);
      });
    },
  };
  return level;
}

/** 取走材料：只藏材料本身和微光，木桩之类的底座留着（0071） */
export function takePickup(pk: Pickup) {
  pk.taken = true; pk.item.visible = false;
  const gl = pk.group.getObjectByName('glow'); if (gl) gl.visible = false;
  if (pk.id === 'vine_rope') pk.group.visible = false;
}

/** 换上 Codex 的第一章钩绳套件（0071）：模型挂到同坐标的组下（本地 0），灰盒可见部分隐藏，COL_ 隐藏，物理沿用灰盒 */
export function useKitModel(level: Level, kind: 'hook' | 'vine' | 'bench' | 'post', scene: THREE.Object3D) {
  scene.traverse((o) => { if (o.name.startsWith('COL_') || o.name.startsWith('MK_')) { o.visible = false; o.traverse((c) => { (c as THREE.Mesh).castShadow = false; }); } });
  scene.position.set(0, 0, 0);
  const pk = (id: ItemId) => level.pickups.find((p) => p.id === id)!;
  if (kind === 'hook' || kind === 'vine') {
    const p = pk(kind === 'hook' ? 'iron_hook' : 'vine_rope');
    p.gray.forEach((o) => { o.visible = false; });
    const it = scene.getObjectByName(kind === 'hook' ? 'ITEM_iron_hook' : 'ITEM_vine_rope');
    if (!it) { console.error('钩绳套件缺少 ITEM 节点', kind); return; }
    p.item = it; p.spin = false; it.visible = !p.taken;
    p.group.add(scene);
  } else if (kind === 'bench') {
    level.workbench.gray.forEach((o) => { o.visible = false; });
    level.workbench.group.add(scene);
  } else {
    const F = level.ropeclipFix;
    const b = scene.getObjectByName('broken'), f = scene.getObjectByName('fixed');
    if (!b || !f) { console.error('绳扣柱缺少 broken/fixed'); return; }
    F.gray.forEach((o) => { o.visible = false; });
    F.broken = b; F.fixedVis = f; b.visible = !F.fixed; f.visible = F.fixed;
    F.hook.add(scene);
  }
}

/** 换上 Codex 的入口双锁石门（env_entrance_gate_v001，0069）：整体放 (0,0,15.2)，COL_ 只是碰撞参考要隐藏，物理继续用灰盒碰撞。 */
export function useGateModel(level: Level, scene: THREE.Object3D, parent: THREE.Object3D) {
  const G = level.gate;
  scene.position.set(0, 0, 15.2);
  scene.traverse((o) => {
    if (o.name.startsWith('COL_') || o.name.startsWith('MK_')) { o.visible = false; o.traverse((c) => { (c as THREE.Mesh).castShadow = false; }); }
  });
  const dl = scene.getObjectByName('ANIM_door_L'), dr = scene.getObjectByName('ANIM_door_R');
  const pl = scene.getObjectByName('ANIM_pad_L'), pr = scene.getObjectByName('ANIM_pad_R');
  if (!dl || !dr) { console.error('石门模型缺少 ANIM_door_L/R'); return; }
  G.gray.forEach((o) => { o.visible = false; });
  G.left = dl; G.right = dr;
  G.padVis = [pl, pr].filter(Boolean) as THREE.Object3D[];
  G.text = scene.getObjectByName('TEXT_friendship') ?? null;
  if (G.text) G.text.visible = G.open >= 0.98;
  G.model = scene;
  parent.add(scene);
}

export let windSway = 0;
export function setWindSway(v: number) { windSway = v; }

function rock(root: THREE.Object3D, x: number, y: number, z: number, s: number) {
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), M.rock);
  r.position.set(x, y + s * 0.6, z); r.castShadow = true; r.receiveShadow = true; root.add(r);
}
function easeInOut(x: number) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
