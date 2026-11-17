// 第二章·冲刷河岸：整章玩法（灰盒）。C3 追踪水痕 → C4 分队救援 → C5 材料与木盒 → C6 浮力实验 → C7 木筏急流 → C8 杠杆与石龟，
// 外加 C9 三级提示（H / 屏幕右下「？」）、C10 实验笔记（N / 「笔记」）。
// 依据：Codex《第二章落地设计 v002》（区域、坐标、状态名）+ Claude《第二章设计与任务单 v0.1》（两个实验、提示、笔记、30 分钟）。
// 用户已定：分队时西岸由涵涵、东岸由佑佑发起全队动作；木筏上「用力」由佑佑喊；答错不惩罚。
// 全部东西挂在第二章 shell 的 root 下；离开章节时 dispose() 释放自己建的网格、碰撞、DOM 面板和临时角色。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Game } from '../game';
import { Actor } from '../actor';
import { CHARS, type CharId } from '../data/characters';
import { readChapter, writeChapter } from '../runtime/chapter_save';
import { buildTracks, type Ch2Tracks, type ClueId } from './chapter2_tracks';
import { buildRescueKit, type Ch2RescueKit, BRACE, LEVER, SENSE_EAST, SEG_END_X, SEGMENTS, STONE_Z, STONE_TOPS } from './chapter2_rescue_kit';
import { CH2_SPAWN, CH2_WATER_Y, CH2_WALK } from './chapter2_shell';
/** 0413 地面混合图对应的可走区（局部 x0,x1,z0,z1） */
const GROUND_RECTS: [string, [number, number, number, number]][] = CH2_WALK.map((r) => [r.id, r.xz as [number, number, number, number]]);

export type Ch2Stage = 'tracks' | 'spotted' | 'reunited' | 'raft' | 'turtle' | 'done';
const WEST: CharId[] = ['tangtuan', 'hanhan', 'paipai'];
const EAST: CharId[] = ['youyou', 'beibei'];
const ALL5: CharId[] = ['tangtuan', 'hanhan', 'paipai', 'youyou', 'beibei'];
const V = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);

// ---------- C5 材料 ----------
type MatKind = 'dry' | 'soaked' | 'rope' | 'oar';
const MATS: { id: string; kind: MatKind; x: number; z: number }[] = [
  { id: 'dry_w1', kind: 'dry', x: -16, z: -1 }, { id: 'dry_w2', kind: 'dry', x: -20, z: 13 },     // 西岸 2 根
  { id: 'dry_e1', kind: 'dry', x: 16, z: 4 }, { id: 'dry_e2', kind: 'dry', x: 11, z: -13 },        // 东岸 1 根 + 伙伴台旧浮木 1 根
  { id: 'soak_w1', kind: 'soaked', x: -13, z: -12 }, { id: 'soak_w2', kind: 'soaked', x: -15.5, z: -18 }, // 泡水木 2 根（C6 之后才分得出）
  { id: 'rope', kind: 'rope', x: -20, z: -6 },
  { id: 'oar', kind: 'oar', x: -19.2, z: -14.6 },                                                  // 旧船屋里，佑佑读门牌才开
];
const BOATHOUSE = V(-19, -14), BOATHOUSE_DOOR = V(-16.6, -14);
const CRATE = V(-12, 7), COVE = V(-7.6, 11), DOCK = V(-7, 6); // 试水槽靠河边、南北向放，别挡住 C3 的脚印路
// ---------- C7 木筏 ----------
const RAFT_PATH = [V(-3.2, 6), V(0, 11), V(0, 26), V(6, 33), V(12, 37), V(22, 42), V(27, 45), V(31.5, 47.6)];
const SEC_START = [0, 20.5, 46]; // 三段的起点（沿路径的距离，大约）：教学 / 礁石 / 倒木急流
const ROCKS = [{ d: 25, u: 1.0 }, { d: 31, u: -1.0 }, { d: 37, u: 0.9 }];
const LOG_D = 51, RAPID_D = 48.5;
// ---------- C8 石龟 ----------
const PRACTICE = V(30.6, 55.5), TURTLE = V(39, 56), PUSH_ST = V(39, 50.9), TOUCH_ST = V(32.9, 56), LOOK_ST = V(45.1, 56), EXIT_Z = 72.5;
const LANDING = V(31.5, 48.6);

interface FloatNote { guess: string[] | null; concl: number | null; tries: number }
interface LeverNote { guess: number | null; tried: number[]; concl: number | null }
interface Save {
  v: 2; cp: string; time: number; stage: Ch2Stage; clues: ClueId[]; segs: number; fails: number; relaxed: boolean;
  taken: string[]; carry: { dry: number; soaked: number; rope: boolean; oar: boolean }; boathouse: boolean; crafted: boolean;
  float: FloatNote & { done: boolean }; raftSec: number; lever: LeverNote & { done: boolean }; fulcrum: boolean; turtle: boolean; leaves: CharId[];
}
const FRESH = (): Save => ({ v: 2, cp: 'A_entry', time: 0, stage: 'tracks', clues: [], segs: 0, fails: 0, relaxed: false, taken: [], carry: { dry: 0, soaked: 0, rope: false, oar: false },
  boathouse: false, crafted: false, float: { guess: null, concl: null, tries: 0, done: false }, raftSec: 0, lever: { guess: null, tried: [], concl: null, done: false }, fulcrum: false, turtle: false, leaves: [] });

// ---------- C9 提示：每个卡点三级（问一句 → 指给你看 → 直接说做法） ----------
type Step = 'tracks' | 'post_brace' | 'post_lever' | 'sense' | 'shout' | 'window' | 'reunite' | 'gather' | 'float' | 'boathouse' | 'craft' | 'board' | 'steer' | 'rocks' | 'paddle' | 'lever' | 'fulcrum' | 'see_stone' | 'heartbeat' | 'exit' | 'done';
const HINTS: Record<Step, [CharId, string][]> = {
  tracks: [['hanhan', '地上的痕迹往哪边去了？'], ['paipai', '我用放大镜看看——跟着亮起来的脚印走。'], ['hanhan', '按 3 换派派，按 Q 举放大镜，走到发光的圈里。']],
  post_brace: [['hanhan', '闸门这边谁力气最大？'], ['tangtuan', '西岸上游那根撑杆，我去顶！'], ['hanhan', '换汤团（按 1），走到西岸上游发光的撑杆旁按 E。']],
  post_lever: [['youyou', '对岸那根拉杆谁来守？'], ['youyou', '我在对岸，拉杆就在我上游一点。'], ['hanhan', '按 G 换到对岸小队，佑佑走到发光的拉杆旁按 E。']],
  sense: [['beibei', '哪块石头是稳的？用耳朵听，用手摸……'], ['beibei', '我到河边蹲下摸一摸。'], ['youyou', '换北北，走到河边发光的地方按 Q 摸石头。']],
  shout: [['hanhan', '都站好了，还差什么？'], ['youyou', '要有人喊口令，水才会退。'], ['hanhan', '西岸换涵涵、对岸换佑佑，按 F 喊口令。']],
  window: [['youyou', '快！水退了！'], ['beibei', '踩着露出来的石头走到这一段的尽头。'], ['youyou', '北北一直往对岸走，走过这一段最后一块石头就稳住了。']],
  reunite: [['hanhan', '石头路通了！'], ['youyou', '我们过河去找大家。'], ['hanhan', '北北和佑佑沿着石头走到西岸。']],
  gather: [['youyou', '做木筏要什么？浮木、藤绳、船桨……'], ['youyou', '地图上的旧船屋在西岸上游，浮木两岸都有。'], ['hanhan', '找齐 4 根浮木、藤绳、船桨，拿到码头的木盒按 E。']],
  float: [['tangtuan', '这些木头都能浮吗？'], ['hanhan', '码头边的小水槽可以试一试。'], ['hanhan', '走到码头边的试水槽按 E，做浮力实验。']],
  boathouse: [['youyou', '船屋门上有门牌……'], ['youyou', '让我来读吧。'], ['hanhan', '换佑佑（按 4），走到船屋门口按 E 读门牌。']],
  craft: [['tangtuan', '材料齐了吗？'], ['hanhan', '木盒在码头上。'], ['hanhan', '带着材料到码头的木盒按 E。']],
  board: [['youyou', '木筏做好了！'], ['youyou', '大家到码头边上筏。'], ['hanhan', '走到码头边（发光处）按 E 上筏。']],
  steer: [['youyou', '我来掌舵！'], ['youyou', 'A 往左、D 往右。'], ['youyou', '按 A / D 让木筏左右挪。']],
  rocks: [['paipai', '前面有石头！'], ['paipai', '看礁石在哪边，往另一边划。'], ['paipai', '礁石在右就按 A，在左就按 D。']],
  paddle: [['youyou', '水太急了，要一起使劲！'], ['youyou', '听我喊，喊到「用力！」一起划。'], ['youyou', '喊到「用力！」的时候按 F，同时往左躲开倒木（A）。']],
  lever: [['tangtuan', '石龟壳缝里的石头太紧了……'], ['hanhan', '旁边那块练习石，先用船桨试试撬。'], ['hanhan', '走到西边的练习石按 E，做杠杆实验。']],
  fulcrum: [['tangtuan', '垫石放哪儿最省力？'], ['hanhan', '想想刚才的实验。'], ['hanhan', '支点放「近」——离夹石最近的地方。']],
  see_stone: [['beibei', '它的心跳好快……'], ['paipai', '我看看是哪里压着它。'], ['hanhan', '北北到西边按 Q 听心跳，派派到东边按 Q 看夹石。']],
  heartbeat: [['beibei', '等它的心跳慢下来。'], ['beibei', '我数「咚、咚」，第三下压。'], ['hanhan', '汤团在南边按 E 开始，数到「压！」再按 E。']],
  exit: [['youyou', '石龟让路了！'], ['hanhan', '北边就是出口。'], ['hanhan', '绕到石龟北边，从出口出去。']],
  done: [['hanhan', '我们做到了！'], ['hanhan', '第二章完成。'], ['hanhan', '第二章完成。']],
};

export class Ch2Play {
  g: Game; root: THREE.Group;
  tracks: Ch2Tracks; kit: Ch2RescueKit;
  s: Save;
  extras: Actor[] = [];
  team: 'west' | 'east' = 'west';
  private lastActive: Record<string, CharId> = { west: 'tangtuan', east: 'youyou' };
  posted: { brace: boolean; lever: boolean } = { brace: false, lever: false };
  sensed = [false, false, false];
  shout: { t: number; beat: number; kind: 'rescue' } | null = null;
  window: { t: number; dur: number; k: number; phase: 'rise' | 'open' | 'sink'; ok: boolean } | null = null;
  private geos: THREE.BufferGeometry[] = []; private mats: THREE.Material[] = []; private cols: RAPIER.Collider[] = [];
  private said = new Set<string>();
  private pickMeshes = new Map<string, THREE.Object3D>();
  private doorCol: RAPIER.Collider | null = null; private door!: THREE.Mesh;
  private raftMesh!: THREE.Group; private raft: { d: number; u: number; speed: number; sec: number; hitT: number; rhythm: { t: number; beat: number } | null; paddled: boolean; warned: Set<number> } | null = null;
  private rocks: THREE.Mesh[] = []; private log!: THREE.Mesh;
  private sample: { dry: THREE.Mesh; soaked: THREE.Mesh; slab: THREE.Mesh; w1: THREE.Mesh; w2: THREE.Mesh; anim: { t: number; mode: 'drop' | 'weight' } | null };
  private leverRig: { plank: THREE.Group; slot: number; anim: { t: number; slot: number } | null; fulc: THREE.Mesh };
  private turtle: { body: THREE.Object3D; stone: THREE.Mesh; fulcrum: THREE.Mesh; heard: boolean; seen: boolean; rhythm: { t: number; beat: number } | null; pop: number; calm: number };
  private exitCol: RAPIER.Collider | null = null;
  private beacon!: THREE.Mesh; private beaconT = 0;
  // 提示
  private step: Step = 'tracks'; private tier = 0; private stepIdle = 0; private stepErr = 0;
  private panelEl: HTMLDivElement | null = null; private hud: HTMLDivElement;
  private fallT = 0; private fallen: Actor | null = null;
  private youyouPath: THREE.Vector3[] = [];
  /** 北北摸完稳石后守着的石头路起点（局部）；退水开始时清掉 */
  private bbSpot: THREE.Vector3 | null = null;

  constructor(g: Game) {
    this.g = g; const sh = g.ch2!; this.root = sh.root;
    const raw = readChapter('ch2') as any;
    this.s = Object.assign(FRESH(), raw && raw.v === 2 ? raw : {}, raw && raw.v !== 2 && raw ? { time: raw.time || 0, clues: raw.clues || [], stage: raw.stage === 'spotted' ? 'spotted' : 'tracks' } : {});
    this.tracks = buildTracks(this.root);
    for (const c of this.tracks.clues) c.found = this.s.clues.includes(c.id);
    const water = this.root.getObjectByName('ch2_water') as THREE.Mesh;
    this.kit = buildRescueKit(this.root, g.ph, (x, y, z) => sh.world(x, y, z), water);
    this.sample = this.buildCove(); this.buildMats(); this.buildBoathouse(); this.buildRaft(); this.leverRig = this.buildPractice(); this.turtle = this.buildTurtle();
    this.beacon = this.mesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.beacon.position.y = 3; this.root.add(this.beacon);
    this.exitCol = g.ph.box(sh.world(40, 1, 68.2), { x: 8, y: 2, z: 0.4 }); this.cols.push(this.exitCol);
    this.hud = this.buildHud();
    void this.loadArt();
    this.applyLook(); this.buildWater();
    this.restore();
  }

  // ======================= 搭场景 =======================
  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material) { this.geos.push(geo); this.mats.push(mat); return new THREE.Mesh(geo, mat); }
  private std(c: number) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }); }
  private W(v: THREE.Vector3, y = v.y) { return this.g.ch2!.world(v.x, y, v.z); }
  private buildMats() {
    for (const m of MATS) {
      let o: THREE.Object3D;
      if (m.kind === 'dry' || m.kind === 'soaked') { o = this.mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.6, 8), this.std(m.kind === 'dry' ? 0xc9a774 : 0x6e5a42)); o.rotation.set(Math.PI / 2, 0, 0.4); o.position.set(m.x, 0.17, m.z); }
      else if (m.kind === 'rope') { o = this.mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 16), this.std(0x6f8a3a)); o.rotation.x = Math.PI / 2; o.position.set(m.x, 0.07, m.z); }
      else { o = this.mesh(new THREE.BoxGeometry(0.16, 0.06, 1.5), this.std(0xa07a4a)); o.position.set(m.x, 0.05, m.z); o.rotation.y = 0.6; }
      o.name = 'ch2_mat_' + m.id; o.castShadow = true; this.root.add(o); this.pickMeshes.set(m.id, o);
    }
  }
  private bhGray: THREE.Object3D[] = [];
  private buildBoathouse() {
    const n0 = this.root.children.length;
    const wall = this.std(0x7c6448), sh = this.g.ch2!, ph = this.g.ph;
    const box = (x: number, z: number, sx: number, sz: number, h = 2.2) => { const b = this.mesh(new THREE.BoxGeometry(sx, h, sz), wall); b.position.set(x, h / 2, z); b.castShadow = true; this.root.add(b); this.cols.push(ph.box(sh.world(x, h / 2, z), { x: sx, y: h, z: sz })); };
    box(-21, -14, 0.3, 4); box(-19, -16, 4, 0.3); box(-19, -12, 4, 0.3); box(-17, -15.4, 0.3, 1.2); box(-17, -12.6, 0.3, 1.2);
    const roof = this.mesh(new THREE.BoxGeometry(4.6, 0.2, 4.6), this.std(0x5a4632)); roof.position.set(-19, 2.3, -14); this.root.add(roof);
    this.door = this.mesh(new THREE.BoxGeometry(0.15, 2.0, 1.6), this.std(0x8a6a3e)); this.door.position.set(-17, 1.0, -14); this.root.add(this.door);
    const sign = this.mesh(new THREE.BoxGeometry(0.06, 0.4, 0.9), this.std(0xd8c49a)); sign.position.set(-16.9, 2.0, -14); this.root.add(sign);
    this.doorCol = ph.box(sh.world(-17, 1.0, -14), { x: 0.3, y: 2, z: 1.6 }); this.cols.push(this.doorCol);
    this.bhGray = this.root.children.slice(n0);
  }
  private buildCove() {
    // C6 试水槽：码头边一个木水槽（不挖地，免得碰撞复杂）。三个样品一样大：干浮木、泡水木、石板
    const tub = this.mesh(new THREE.BoxGeometry(1.3, 0.6, 2.6), this.std(0x8a6a44)); tub.position.set(COVE.x, 0.3, COVE.z); this.root.add(tub);
    this.cols.push(this.g.ph.box(this.W(COVE, 0.3), { x: 1.3, y: 0.6, z: 2.6 }));
    const water = this.mesh(new THREE.PlaneGeometry(1.1, 2.4), new THREE.MeshStandardMaterial({ color: 0x6fa3ad, transparent: true, opacity: 0.75, roughness: 0.2 }));
    water.rotation.x = -Math.PI / 2; water.position.set(COVE.x, 0.62, COVE.z); this.root.add(water);
    // 三个样品沿水槽一字排开（北→南：干浮木、泡水木、石板），没放下水时摆在水槽西边的木板上
    const mk = (c: number, z: number) => { const m = this.mesh(new THREE.BoxGeometry(0.3, 0.18, 0.5), this.std(c)); m.position.set(COVE.x - 0.95, 0.95, COVE.z + z); m.userData.z = COVE.z + z; m.castShadow = true; this.root.add(m); return m; };
    const w = (z: number) => { const m = this.mesh(new THREE.SphereGeometry(0.09, 8, 6), this.std(0x8b8b86)); m.position.set(COVE.x - 1.25, 0.95, COVE.z + z); m.visible = false; this.root.add(m); return m; };
    return { dry: mk(0xc9a774, -0.8), soaked: mk(0x6e5a42, 0), slab: mk(0x8f8f8a, 0.8), w1: w(-0.8), w2: w(0), anim: null as null | { t: number; mode: 'drop' | 'weight' } };
  }
  private buildRaft() {
    const g = new THREE.Group(); g.name = 'ch2_raft';
    for (let i = 0; i < 5; i++) { const log = this.mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.0, 8), this.std(0xc9a774)); log.rotation.x = Math.PI / 2; log.position.set(-0.84 + i * 0.42, 0, 0); g.add(log); }
    const tie = this.mesh(new THREE.BoxGeometry(2.2, 0.06, 0.12), this.std(0x6f8a3a)); tie.position.set(0, 0.2, 0.9); g.add(tie); const tie2 = tie.clone(); tie2.position.z = -0.9; g.add(tie2);
    const oar = this.mesh(new THREE.BoxGeometry(0.1, 0.05, 1.6), this.std(0xa07a4a)); oar.position.set(0, 0.35, 1.5); oar.rotation.x = 0.3; g.add(oar);
    g.visible = false; this.root.add(g); this.raftMesh = g;
    const rockM = this.std(0x6d6a63);
    for (const r of ROCKS) { const m = this.mesh(new THREE.DodecahedronGeometry(0.85, 0), rockM); const p = this.pathAt(r.d, r.u); m.position.set(p.x, CH2_WATER_Y + 0.25, p.z); m.castShadow = true; this.root.add(m); this.rocks.push(m); }
    this.log = this.mesh(new THREE.CylinderGeometry(0.35, 0.4, 3.6, 10), this.std(0x5e4630));
    const lp = this.pathAt(LOG_D, 1.0), dir = this.pathDir(LOG_D); this.log.position.set(lp.x, CH2_WATER_Y + 0.35, lp.z); this.log.rotation.set(0, Math.atan2(dir.x, dir.z) + Math.PI / 2, Math.PI / 2); this.log.castShadow = true; this.root.add(this.log);
  }
  private buildPractice() {
    // C8 练习石：圆石卡在两块岩石间 + 带 3 个槽的石板 + 船桨当撬棍
    const base = this.mesh(new THREE.BoxGeometry(2.6, 0.12, 0.7), this.std(0x9a9488)); base.position.set(PRACTICE.x, 0.06, PRACTICE.z); this.root.add(base);
    const ball = this.mesh(new THREE.SphereGeometry(0.32, 12, 8), this.std(0x7d7a70)); ball.position.set(PRACTICE.x - 1.1, 0.4, PRACTICE.z); ball.name = 'ch2_practice_ball'; this.root.add(ball);
    for (const dz of [-0.5, 0.5]) { const r = this.mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), this.std(0x6d6a63)); r.position.set(PRACTICE.x - 1.1, 0.3, PRACTICE.z + dz); this.root.add(r); }
    const slotM = new THREE.MeshBasicMaterial({ color: 0x3b3a34 });
    [-0.6, 0, 0.6].forEach((dx) => { const s = this.mesh(new THREE.BoxGeometry(0.16, 0.02, 0.5), slotM); s.position.set(PRACTICE.x + dx, 0.13, PRACTICE.z); this.root.add(s); });
    const plank = new THREE.Group(); plank.position.set(PRACTICE.x - 0.6, 0.3, PRACTICE.z); this.root.add(plank);
    const oar = this.mesh(new THREE.BoxGeometry(2.0, 0.06, 0.14), this.std(0xa07a4a)); oar.position.x = 0.3; plank.add(oar);
    const fulc = this.mesh(new THREE.ConeGeometry(0.16, 0.22, 4), this.std(0x8f8f8a)); fulc.position.set(PRACTICE.x - 0.6, 0.22, PRACTICE.z); this.root.add(fulc);
    plank.visible = false; fulc.visible = false;
    this.cols.push(this.g.ph.box(this.W(PRACTICE, 0.3), { x: 2.6, y: 0.6, z: 0.8 }));
    return { plank, slot: -1, anim: null as null | { t: number; slot: number }, fulc };
  }
  private buildTurtle() {
    const body = this.root.getObjectByName('ch2_turtle_marker')!;
    const stone = this.mesh(new THREE.DodecahedronGeometry(0.45, 0), this.std(0x9a8a6a)); stone.position.set(TURTLE.x, 1.55, TURTLE.z - 2.2); stone.castShadow = true; this.root.add(stone);
    const fulcrum = this.mesh(new THREE.ConeGeometry(0.3, 0.4, 4), this.std(0x8f8f8a)); fulcrum.position.set(TURTLE.x, 0.2, 52.6); fulcrum.visible = false; this.root.add(fulcrum);
    return { body, stone, fulcrum, heard: false, seen: false, rhythm: null as null | { t: number; beat: number }, pop: 0, calm: 0 };
  }
  private buildHud() {
    const d = document.createElement('div'); d.id = 'ch2hud';
    d.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:25;display:flex;gap:10px';
    d.innerHTML = '<button data-h="notes" style="padding:9px 14px;border-radius:12px;border:2px solid rgba(122,90,50,.7);background:rgba(246,239,220,.95);color:#24382b;font:600 15px sans-serif;cursor:pointer">📒 笔记 <kbd style="font-size:12px">N</kbd></button>'
      + '<button data-h="hint" style="width:44px;height:44px;border-radius:50%;border:2px solid rgba(122,90,50,.7);background:rgba(246,239,220,.95);color:#24382b;font:800 20px sans-serif;cursor:pointer" title="提示（H）">？</button>'
      + '<button data-h="jump" style="padding:9px 12px;border-radius:12px;border:2px solid rgba(122,90,50,.7);background:rgba(246,239,220,.95);color:#24382b;font:600 15px sans-serif;cursor:pointer" title="试玩用：直接跳到某一段">⏩ 跳段</button>';
    d.addEventListener('mousedown', (e) => e.stopPropagation());
    d.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (!b) return; e.stopPropagation(); if (b.dataset.h === 'hint') this.hint(); else if (b.dataset.h === 'jump') this.openJump(); else this.openNotes(); });
    document.body.appendChild(d); return d;
  }

  // ======================= 试玩跳段（用户 11-15：方便直接看 C12 美术）=======================
  // 写一份对应阶段的存档，刷新页面后从开始画面进第二章就落在那一段；会覆盖第二章当前进度
  private openJump() {
    const all = MATS.map((m) => m.id), done = { float: { guess: null, concl: null, tries: 0, done: true } };
    const base = (o: Partial<Save>): Save => Object.assign(FRESH(), o);
    const P: Record<string, [string, Save, [number, number] | null]> = {
      camp: ['营火开头（追水痕）', base({}), null],
      rescue: ['分队救援（稳石、水闸）', base({ stage: 'spotted', clues: ['twig', 'prints', 'water'] }), [-9, -5]],
      craft: ['收集材料、做木筏（浮木、佑佑北北）', base({ stage: 'reunited', clues: ['twig', 'prints', 'water'], segs: 3 }), [-10, 9]],
      raft: ['上木筏（木筏、划桨）', base({ stage: 'reunited', clues: ['twig', 'prints', 'water'], segs: 3, taken: all, carry: { dry: 4, soaked: 2, rope: true, oar: true }, boathouse: true, crafted: true, ...done }), [-7, 4.5]],
      turtle: ['石龟浅滩（杠杆实验）', base({ stage: 'turtle', clues: ['twig', 'prints', 'water'], segs: 3, taken: all, boathouse: true, crafted: true, raftSec: 3, ...done }), null],
    };
    const acts: Record<string, () => void> = { close: () => this.closePanel() };
    for (const [k, [, sv, at]] of Object.entries(P)) acts[k] = () => {
      sv.leaves = []; writeChapter('ch2', sv as unknown as Record<string, unknown>);
      try { sessionStorage.setItem('qhd_ch2_at', at ? JSON.stringify(at) : ''); history.replaceState(null, '', '#chapter-2'); } catch { /* 存不了就只换存档 */ }
      this.disposed = true; location.reload();
    };
    this.panel('⏩ 跳到某一段（试玩用）', '<p style="margin:0 0 8px">会覆盖第二章现在的进度。点了以后页面会刷新，再点开始画面右边的「第二章」进来。</p>'
      + Object.entries(P).map(([k, [t]]) => `<p style="margin:6px 0"><button data-a="${k}">${t}</button></p>`).join('') + '<p><button data-a="close">取消</button></p>', acts);
  }

  // ======================= 存档 / 恢复 =======================
  save() {
    if (this.g.noSave) return;
    this.s.time = this.g.ch2Time; this.s.clues = this.tracks.clues.filter((c) => c.found).map((c) => c.id);
    writeChapter('ch2', this.s as any);
  }
  private restore() {
    const s = this.s, g = this.g, sh = g.ch2!;
    for (let k = 0; k < s.segs; k++) this.kit.lock(k);
    if (s.segs > 0) sh.gates.stones_e.setOpen(true);
    if (s.segs >= 3) sh.gates.stones_w.setOpen(true);
    for (const id of s.taken) this.pickMeshes.get(id)!.visible = false;
    if (s.boathouse) this.openDoor();
    if (s.crafted) this.showRaftAtDock();
    if (s.lever.done) { this.leverRig.plank.visible = true; this.leverRig.fulc.visible = true; }
    if (s.fulcrum) this.turtle.fulcrum.visible = true;
    if (s.turtle) this.calmTurtle(true);
    if (s.stage === 'raft') s.stage = 'reunited'; // 木筏中途存的档：回码头重新上筏（检查点只在码头）
    if (s.stage !== 'tracks') this.spawnExtras();
    if (s.stage === 'turtle' || s.stage === 'done') { this.setSquad(ALL5, 'tangtuan'); this.placeAll(LANDING); }
    else if (s.stage === 'reunited') { this.setSquad(ALL5, 'hanhan'); }
    this.refreshLeaves();
    try { const at = sessionStorage.getItem('qhd_ch2_at'); sessionStorage.removeItem('qhd_ch2_at'); if (at) { const [x, z] = JSON.parse(at); this.placeAll(V(x, z)); } } catch { /* 没有跳段位置 */ }
  }

  // ======================= 队伍 =======================
  private spawnExtras() {
    if (this.extras.length) return;
    const g = this.g, sh = g.ch2!;
    const yyPos = this.s.stage === 'spotted' ? V(12, -9) : V(-9, 22), bbPos = this.s.stage === 'spotted' ? (this.s.segs > 0 ? V(SEG_END_X[this.s.segs - 1], STONE_Z, STONE_TOPS[3]) : V(14, -11)) : V(-10, 23);
    const yy = new Actor(CHARS.youyou, g.ph, g.scene, sh.world(yyPos.x, yyPos.y + 0.05, yyPos.z));
    const bb = new Actor(CHARS.beibei, g.ph, g.scene, sh.world(bbPos.x, bbPos.y + 0.05, bbPos.z));
    g.actors.youyou = yy; g.actors.beibei = bb; this.extras = [yy, bb];
    (g as any).loadCharModel?.('youyou'); (g as any).loadCharModel?.('beibei'); // C12 Codex 正式模型（地址里没有就保持灰盒）
  }
  setSquad(ids: CharId[], active: CharId) {
    const g = this.g; g.squad = ids.slice(); g.observing = false; g.ui.observe(false);
    g.active = ids.includes(active) ? active : ids[0]; g.crumbs = [];
    for (const id of ids) { const a = g.actors[id]; if (a && !(id === 'tangtuan' && this.posted.brace) && !(id === 'youyou' && this.posted.lever)) { a.goal = null; a.holding = false; } }
    g.ui.party(g.squad, g.active); this.repostAll();
  }
  /** 守岗位的人（汤团撑杆、佑佑拉杆、北北石头路起点）：不是自己在操作时就回到岗位站着。换人、换队后都要重新挂上 */
  private repostAll() {
    const g = this.g;
    const keep = (id: CharId, on: boolean, p: THREE.Vector3 | null) => { const a = g.actors[id]; if (!a || !on || !p || g.active === id) return; a.goal = this.W(p, 0.05); a.holding = true; };
    keep('tangtuan', this.posted.brace, BRACE); keep('youyou', this.posted.lever, LEVER); keep('beibei', !!this.bbSpot, this.bbSpot);
    if (this.s.stage === 'turtle') for (const [id, p] of Object.entries(this.tPost) as [CharId, THREE.Vector3][]) keep(id, true, p);
  }
  // 石龟（用户 11-16）：①涵涵按 F 分站位：北北→西边听心跳、派派→东边看壳缝、汤团→南边压船桨；②自己走过去的人，换人后也留在站位上
  private tPost: Partial<Record<CharId, THREE.Vector3>> = {};
  private static T_ST: [CharId, THREE.Vector3, string][] = [['beibei', TOUCH_ST, '北北去石龟西边听心跳'], ['paipai', LOOK_ST, '派派去东边看壳缝'], ['tangtuan', PUSH_ST, '汤团去南边拿船桨']];
  private turtleAssign() {
    const g = this.g;
    for (const [id, p] of Ch2Play.T_ST) if (g.actors[id] && g.active !== id) this.tPost[id] = p;
    this.repostAll();
    g.ui.say('hanhan', Ch2Play.T_ST.map((x) => x[2]).join('，') + '！到了以后换过去，按 Q 或 E。', 3.6, undefined, true);
  }
  private sw(id: CharId) {
    const prev = this.g.active;
    if (this.s.stage === 'turtle') { const st = Ch2Play.T_ST.find((x) => x[0] === prev); if (st && this.distL(st[1]) < 2.2) this.tPost[prev] = st[1]; }
    delete this.tPost[id];
    this.g.switchTo(id); this.repostAll();
  }
  private setTeam(t: 'west' | 'east', who?: CharId) {
    this.lastActive[this.team] = this.g.active; this.team = t;
    this.setSquad(t === 'west' ? WEST : EAST, who ?? this.lastActive[t]);
  }
  private placeAll(p: THREE.Vector3) {
    this.g.squad.forEach((id, i) => this.g.actors[id]?.teleport(this.W(V(p.x + (i % 3 - 1) * 1.1, p.z + Math.floor(i / 3) * 1.1), 0.05), 0));
    this.g.crumbs = [];
  }
  private refreshLeaves() { this.g.ui.leaves([...this.g.leaves, ...this.s.leaves]); }
  private giveLeaf(who: CharId) { if (this.s.leaves.includes(who)) return; this.s.leaves.push(who); this.refreshLeaves(); this.g.leader.playOnce('cheer'); this.g.ui.say(who, '光之叶亮了！', 2.2); }

  // ======================= 主循环 =======================
  // ======================= C12 美术（Codex 资产）=======================
  // 做法：灰盒的碰撞和玩法一律不动，只把灰盒方块换成透明、把 Codex 模型挂上去跟着动。?ch2art=0 或 ?gray=1 回到纯灰盒
  private art: { stones: THREE.Object3D[]; grayStones: THREE.Object3D[]; seats: Partial<Record<CharId, THREE.Object3D>>; banks?: number; plants?: { instances: number; meshes: number } } | null = null;
  private artTex: THREE.Texture[] = []; private artGround: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  private artDoor: { play(): void } | null = null; private artDoorAction: THREE.AnimationAction | null = null; private artDoorStop = 0; private artTumble: (() => void) | null = null;
  private disposed = false; private artObjs: THREE.Object3D[] = []; private artMixers: THREE.AnimationMixer[] = [];
  private async loadArt() {
    const q = new URLSearchParams(location.search), base = q.get('ch2art') ?? (window as any).__DEFAULT_MODELS?.ch2art;
    if (!base || base === '0' || q.has('gray')) return;
    const { loadGLB } = await import('../assets');
    const ldG = (n: string) => loadGLB(base + n).then((m) => m, (e) => { console.error('第二章美术加载失败', n, e); return null; });
    const ld = (n: string) => ldG(n).then((m) => m?.scene ?? null);
    const [stoneM, sluiceM, raftM, dryM, soakM] = await Promise.all(['stones.wasm', 'sluice.wasm', 'raft.wasm', 'floatwood_dry.wasm', 'floatwood_soaked.wasm'].map(ld));
    if (this.disposed) return;
    const hide = new THREE.MeshBasicMaterial({ visible: false }); this.mats.push(hide);
    const prep = (o: THREE.Object3D) => { this.artObjs.push(o); o.traverse((c) => { if (/^COL_/.test(c.name)) c.visible = false; const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
    const skin = (target: THREE.Object3D, vis: THREE.Object3D) => { target.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = hide; }); target.add(vis); };
    const A: NonNullable<typeof this.art> = { stones: [], grayStones: [], seats: {} };
    // 稳石：每段一份，模型 +X 是往东变高，灰盒是往西变高 → 转 180°；升降跟着灰盒第一块石头走（灰盒的 6 秒退水 / 锁定逻辑不变）
    if (stoneM) {
      this.root.traverse((c) => { if (c.name === 'ch2_steady_stone') A.grayStones.push(c); });
      SEGMENTS.forEach((seg, k) => {
        const o = prep(k ? stoneM.clone() : stoneM); const anim = o.getObjectByName('ANIM_steady_segment_1'); if (anim) anim.position.y = 0;
        o.rotation.y = Math.PI; o.position.set((seg[0] + seg[3]) / 2, 0, STONE_Z); o.name = 'ch2_art_stones_' + k; this.root.add(o); A.stones.push(o);
      });
      for (const gs of A.grayStones) gs.visible = false;
    }
    if (sluiceM) { const m = this.root.getObjectByName('ch2_sluice_marker'); if (m) m.visible = false; prep(sluiceM); sluiceM.position.set(0, 0, -24); sluiceM.name = 'ch2_art_sluice'; this.root.add(sluiceM); }
    // 浮木：挂到灰盒圆柱上（圆柱长轴是本地 y，模型长轴是 x）
    for (const m of MATS) if ((m.kind === 'dry' && dryM) || (m.kind === 'soaked' && soakM)) {
      const v = prep((m.kind === 'dry' ? dryM! : soakM!).clone()); v.rotation.z = Math.PI / 2; skin(this.pickMeshes.get(m.id)!, v);
    }
    // 木筏：模型筏心放到灰盒筏心，座位用模型自己的 MK_ch2_seat_*（0403 问的：程序侧按最终椅位节点对齐）
    if (raftM) {
      prep(raftM); const box = new THREE.Box3().setFromObject(raftM), c = box.getCenter(new THREE.Vector3());
      raftM.position.set(-c.x, -0.2 - box.min.y, -c.z); skin(this.raftMesh, raftM);
      for (const id of ALL5) { const mk = raftM.getObjectByName('MK_ch2_seat_' + id); if (mk) A.seats[id] = mk; }
    }
    this.art = A; // 先让第一批（稳石升降、木筏座位）生效，再等第二批
    // ---- C12 第二批：大树 3 棵、远景 3 层、河岸岩石和倒木、实验小件（都只看不碰，放在可走区外或河边水里）----
    const [t1, t2, t3, f1, f2, f3, rockM, logM, kitM] = await Promise.all(['tree1.wasm', 'tree2.wasm', 'tree3.wasm', 'far1.wasm', 'far2.wasm', 'far3.wasm', 'boulder.wasm', 'log.wasm', 'kit.wasm'].map(ldG));
    if (this.disposed) return;
    /** 按包围盒把模型摆好：高度缩到 h（或宽度缩到 w），底面贴 y，水平中心放到 (x,z) */
    const place = (o: THREE.Object3D, x: number, y: number, z: number, opt: { h?: number; w?: number; s?: number; ry?: number }) => {
      prep(o); o.rotation.y = opt.ry ?? 0; o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3());
      const k = opt.s ?? (opt.h ? opt.h / Math.max(sz.y, 1e-3) : opt.w ? opt.w / Math.max(sz.x, sz.z, 1e-3) : 1);
      o.scale.multiplyScalar(k); o.updateMatrixWorld(true); const b2 = new THREE.Box3().setFromObject(o), c = b2.getCenter(new THREE.Vector3());
      o.position.x += x - c.x; o.position.z += z - c.z; o.position.y += y - b2.min.y; this.root.add(o); return o;
    };
    const anim = (g: { scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null, o: THREE.Object3D) => {
      if (!g?.animations?.length) return; const mx = new THREE.AnimationMixer(o); for (const c of g.animations) mx.clipAction(c).play(); mx.update(Math.random() * 3); this.artMixers.push(mx);
    };
    // 大树：用户 11-15 定 3 棵。西岸营火北边、西岸上游、东岸，都在可走区外一点，树冠伸到路上
    ([[t1, -26.5, 9, 0.6], [t2, 27, -4, 2.4], [t3, -28.5, -30, 4.2]] as const).forEach(([g, x, z, ry], i) => { if (g) { place(g.scene, x, -0.1, z, { h: 10 + i * 0.8, ry }); g.scene.name = 'ch2_art_tree_' + (i + 1); anim(g, g.scene); } });
    // 远景：西、东、北三面各一层，离河 60–90 米，只当背景
    ([[f1, -78, -5, Math.PI / 2], [f2, 80, 10, -Math.PI / 2], [f3, 20, 120, Math.PI]] as const).forEach(([g, x, z, ry], i) => { if (g) { place(g.scene, x, -2, z, { w: 110, ry }); g.scene.name = 'ch2_art_far_' + (i + 1); anim(g, g.scene); } });
    // 河岸岩石 / 倒木：放在河边水里（河是 x −6..6），不挡任何路
    if (rockM) ([[-5.3, -31, 1.6, 0.3], [5.4, -17, 1.3, 1.9], [-5.4, 19, 1.5, 4.0], [5.3, 25, 1.8, 2.7], [5.5, -36, 1.2, 5.1]] as const).forEach(([x, z, sc, ry], i) => place(i ? rockM.scene.clone() : rockM.scene, x, CH2_WATER_Y - 0.35, z, { s: sc, ry }));
    if (logM) ([[-4.8, 26, 3.2, 0.25], [4.9, -27, 2.8, -0.35]] as const).forEach(([x, z, sc, ry], i) => place(i ? logM.scene.clone() : logM.scene, x, CH2_WATER_Y - 0.12, z, { s: sc, ry }));
    // 实验小件：摆在试水槽北边岸上（三个样品、三槽、配重和练习圆石）
    if (kitM) place(kitM.scene, -11.2, 0, 13.2, { s: 1, ry: Math.PI / 2 });
    // ---- C12 第三批（0407/0409/0411，用户 11-16「先全部导入，不足先标记」）----
    const [turtleG, bankG, bhG, reefG, rlogG] = await Promise.all(['turtle.wasm', 'bank.wasm', 'boathouse.wasm', 'reef.wasm', 'rlog.wasm'].map(ldG));
    if (this.disposed) return;
    // 石龟 v085：挂在灰盒龟身上（跟着灰盒的害怕摇晃 / 平静下来），最长边缩到 7 米；夹石是模型里独立的 EXPERIMENT_detachable_surface，石头撬开时播 0–4 秒翻落
    if (turtleG) {
      const T = this.turtle, o = prep(turtleG.scene); o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = 7 / Math.max(sz.x, sz.z);
      o.scale.multiplyScalar(k); o.updateMatrixWorld(true); const b2 = new THREE.Box3().setFromObject(o), c = b2.getCenter(new THREE.Vector3());
      o.position.set(-c.x, -T.body.position.y - b2.min.y + 0.05, -c.z); skin(T.body, o); T.stone.material = hide;
      const mx = new THREE.AnimationMixer(o), idle = turtleG.animations.find((a) => /idle/i.test(a.name)), tumble = turtleG.animations.find((a) => /tumble/i.test(a.name));
      if (idle) mx.clipAction(idle).play();
      if (tumble) { const a = mx.clipAction(tumble); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; this.artTumble = () => { a.reset().play(); }; if (this.s.turtle) { a.play(); a.time = tumble.duration; mx.update(0); } }
      this.artMixers.push(mx);
    }
    // 船屋 v009：屋心 (-19,-14)、门朝东；灰盒墙和碰撞保留（只变透明），开门时播开门动画到 90° 停住
    if (bhG) {
      const o = place(bhG.scene, -19, 0, -14, { s: 1 }); for (const gm of this.bhGray) gm.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = hide; });
      const clip = bhG.animations[0];
      if (clip) { const mx = new THREE.AnimationMixer(o), a = mx.clipAction(clip); a.play(); a.paused = true; a.time = 0; mx.update(0); this.artMixers.push(mx);
        const openT = 24 / 24; this.artDoor = { play: () => { a.paused = false; a.time = 0; this.artDoorStop = openT; } }; this.artDoorAction = a;
        if (this.s.boathouse) { a.time = openT; mx.update(0); } }
    }
    // 岸线 v001d：6 种变体，每段 4 米。只放在看得见的几段（营火边、过河处、码头、东岸），一整段连着时只留两头的端盖。
    // 每段原来 100–190 个网格：不动的部分按材质合并成几块，减少绘制次数；风动的草还用原动画
    if (bankG?.scenes?.length) {
      const runs: [number, number, number, number, number][] = [ // [x, 起点z, 段数, 朝向(1=西岸 −1=东岸), 起始变体]
        [-6, 18, 3, 1, 0], [-6, -14, 3, 1, 3], [6, -14, 3, -1, 1], [6, 2, 3, -1, 4], [-6, -30, 2, 1, 2], [6, -32, 2, -1, 5]];
      let nSeg = 0;
      for (const [x, z0, n, side, v0] of runs) for (let i = 0; i < n; i++) {
        const vi = (v0 + i) % bankG.scenes.length, src = bankG.scenes[vi], o = src.clone(true);
        o.traverse((c) => { if (/_CAP_L$/.test(c.name) && i > 0) c.visible = false; if (/_CAP_R$/.test(c.name) && i < n - 1) c.visible = false; });
        o.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; o.position.set(x, 0, z0 + side * 0 + (i + 0.5) * 4); prep(o); mergeStatic(o); this.root.add(o); nSeg++;
        const clips = bankG.animations.filter((a) => a.name.endsWith(src.name.replace(/^VAR_bank/, '_')) || a.name.endsWith('_' + src.name.replace(/^VAR_bank_/, '')));
        if (clips.length) { const mx = new THREE.AnimationMixer(o); for (const cl of clips) mx.clipAction(cl).play(); mx.update(Math.random() * 2); this.artMixers.push(mx); }
      }
      A.banks = nSeg;
    }
    // 急流的 3 块礁石和倒木：0413 专用模型（礁石 1.7 m、倒木 3.6 m）；没有就暂用河岸岩石 / 倒木。碰撞和航线不动
    if (reefG) for (const r of this.rocks) { const v = prep(reefG.scene.clone()); v.scale.setScalar(1.15); v.rotation.set(0, Math.random() * 6, 0); v.position.set(0, -0.62, 0); skin(r, v); }
    else if (rockM) for (const r of this.rocks) { const v = prep(rockM.scene.clone()); v.scale.setScalar(2.1); v.rotation.set(0, Math.random() * 6, 0); v.position.set(0, -0.6, 0); skin(r, v); }
    if (rlogG) { const v = prep(rlogG.scene); v.rotation.set(0, 0, Math.PI / 2); v.position.set(0.3, 0, 0); skin(this.log, v); }
    else if (logM) { const v = prep(logM.scene.clone()); v.scale.set(3.8, 2.4, 2.4); v.rotation.set(0, 0, Math.PI / 2); v.position.set(0.36, 0, 0); skin(this.log, v); }
    // ---- 0413 / 0415：外缘草土坡、地面草土贴图、岸上草和花蕨灌木、三棵树下的中景 ----
    const [landG, bushG, fernG, flowerG, g0, g1, g2] = await Promise.all(['landform.wasm', 'p_bush.wasm', 'p_fern.wasm', 'p_flower.wasm', 'gc/grass0.wasm', 'gc/grass1.wasm', 'gc/grass2.wasm'].map(ldG));
    if (this.disposed) return;
    // 外缘草土坡（单网格，章节局部坐标）：盖住 16 段外侧直墙；墙的碰撞保留，只把墙变透明
    // 河边矮坎（灰盒蓝灰色）换成和土路接近的颜色，地面和岸线之间不再有一条灰边（碰撞不变）
    { const done = new Set<THREE.Material>(); this.root.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && /^ch2_(river|pool)_curb_/.test(c.name) && !Array.isArray(m.material) && !done.has(m.material)) { done.add(m.material); (m.material as THREE.MeshStandardMaterial).color?.setHex(0x9c8566); } }); }
    if (landG) { const o = prep(landG.scene); o.name = 'ch2_art_landform'; this.root.add(o); this.root.traverse((c) => { if (c.name.startsWith('ch2_berm_')) (c as THREE.Mesh).material = hide; }); }
    // 地面：每块可走区顶面换成「草地 / 土路」混合（黑白图：黑=土路，白=草），碰撞不变
    try {
      const tl = new THREE.TextureLoader(), lt = (n: string, srgb: boolean, rep2: boolean) => new Promise<THREE.Texture>((res, rej) => tl.load(base + 'gc/' + n, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (rep2) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; res(t); }, undefined, rej));
      const [meadow, soil] = await Promise.all([lt('meadow_albedo_1024.png', true, true), lt('light_soil_albedo_512.png', true, true)]);
      const O = this.g.ch2!.world(0, 0, 0); this.artTex.push(meadow, soil);
      for (const [id, rect] of GROUND_RECTS) {
        const mesh = this.root.getObjectByName('ch2_' + id) as THREE.Mesh | undefined; if (!mesh || Array.isArray(mesh.material)) continue;
        const mask = await lt(id + '.png', false, false); if (this.disposed) return; this.artTex.push(mask);
        const gm = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }); this.mats.push(gm);
        gm.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, { uMask: { value: mask }, uMeadow: { value: meadow }, uSoil: { value: soil }, uRect: { value: new THREE.Vector4(...rect) }, uO: { value: new THREE.Vector2(O.x, O.z) } });
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW; uniform sampler2D uMask, uMeadow, uSoil; uniform vec4 uRect; uniform vec2 uO;')
            .replace('#include <map_fragment>', `vec2 lp = vGW.xz - uO; vec2 mu = vec2((lp.x - uRect.x) / (uRect.y - uRect.x), (lp.y - uRect.z) / (uRect.w - uRect.z));
              float w = texture2D(uMask, clamp(mu, 0.001, 0.999)).r; vec3 md = mix(texture2D(uMeadow, lp / 7.0).rgb, texture2D(uMeadow, mat2(0.8, 0.6, -0.6, 0.8) * lp / 19.0).rgb, 0.45), sl = texture2D(uSoil, lp / 3.5).rgb;
              md *= vec3(0.9, 1.06, 0.84); // 草地往绿里压一点（Codex 换更绿的草地图后可去掉）
              vec3 gcol = mix(sl, md, smoothstep(0.1, 0.6, w));
              // 水边湿土带：离河（|x|<6）或石龟池 2.5 米以内逐渐变深、变湿
              float dRiver = (lp.y < 31.0 && lp.y > -42.0) ? abs(lp.x) - 6.0 : 99.0;
              vec2 pq = max(vec2(34.0, 52.0) - lp, lp - vec2(44.0, 60.0)); float dPool = length(max(pq, 0.0)) + min(max(pq.x, pq.y), 0.0);
              float wet = 1.0 - smoothstep(0.0, 2.5, min(dRiver, abs(dPool)));
              gcol = mix(gcol, vec3(0.36, 0.3, 0.22), wet * 0.8);
              diffuseColor.rgb *= gcol;`);
        };
        const orig = mesh.material; mesh.material = [orig, orig, gm, orig, orig, orig]; this.artGround.push([mesh, orig]);
      }
    } catch (e) { console.error('第二章地面贴图加载失败', e); }
    // 植物：每种原型的每个子网格做一个实例化网格，按 16 米格子分块（看不见的格子整块不画）；风动用第一章的 _WIND_WEIGHT 着色器
    try {
      const { applyWind } = await import('../scene_manifest');
      const plants = await (await fetch(base + 'gc/plants.json')).json() as { grass: number[][]; bush: number[][]; fern: number[][]; flower: number[][]; under: Record<string, number[][]> };
      if (this.disposed) return;
      const parts = (g: { scene: THREE.Object3D } | null) => { if (!g) return null; g.scene.updateMatrixWorld(true); const r: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; m: THREE.Matrix4 }[] = []; g.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) r.push({ geo: m.geometry, mat: m.material, m: m.matrixWorld.clone() }); }); this.artObjs.push(g.scene); return r; };
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), S = new THREE.Vector3();
      let nInst = 0, nMesh = 0;
      const plant = (pp: ReturnType<typeof parts>, list: number[][], name: string, shadow: boolean) => {
        if (!pp || !list.length) return; const cells = new Map<string, number[][]>();
        for (const it of list) { const k = Math.floor(it[0] / 16) + ',' + Math.floor(it[1] / 16); (cells.get(k) ?? cells.set(k, []).get(k)!).push(it); }
        for (const cl of cells.values()) for (const p of pp) {
          const im = new THREE.InstancedMesh(p.geo, p.mat, cl.length);
          cl.forEach(([x, z, yaw, sc], i) => { q.setFromAxisAngle(up, yaw); M.compose(P.set(x, 0.005, z), q, S.set(sc, sc, sc)).multiply(p.m); im.setMatrixAt(i, M); });
          im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = shadow; im.receiveShadow = true; im.name = 'ch2_art_' + name; this.root.add(im); this.artObjs.push(im); applyWind(im, 0.05); nMesh++;
        }
        nInst += list.length;
      };
      const gp = [parts(g0), parts(g1), parts(g2)];
      for (let k = 0; k < 3; k++) plant(gp[k], plants.grass.filter((g) => g[0] === k).map((g) => g.slice(1)), 'grass' + k, false);
      const bp = parts(bushG), fp = parts(fernG), lp2 = parts(flowerG);
      plant(bp, [...plants.bush, ...plants.under.bush], 'bush', true); plant(fp, [...plants.fern, ...plants.under.fern], 'fern', false); plant(lp2, [...plants.flower, ...plants.under.flower], 'flower', false);
      A.plants = { instances: nInst, meshes: nMesh };
    } catch (e) { console.error('第二章植物加载失败', e); }
    (window as any).__qhd.ch2art = { plants: A.plants, landform: !!landG, ground: this.artGround.length, reef: !!reefG, banks: A.banks ?? 0, turtle: !!turtleG, boathouse: !!bhG, trees: [t1, t2, t3].filter(Boolean).length, far: [f1, f2, f3].filter(Boolean).length, rocks: !!rockM, logs: !!logM, kit: !!kitM, stones: A.stones.length, sluice: !!sluiceM, raft: !!raftM, seats: Object.keys(A.seats), floatwood: !!dryM && !!soakM };
  }
  private updateArt(dt = 0) {
    for (const mx of this.artMixers) mx.update(dt);
    const da = this.artDoorAction; if (da && !da.paused && this.artDoorStop && da.time >= this.artDoorStop) { da.time = this.artDoorStop; da.paused = true; }
    const A = this.art; if (!A || !A.grayStones.length) return;
    A.stones.forEach((o, k) => { const g0 = A.grayStones[k * 4]; if (g0) o.position.y = g0.position.y + 0.5 - STONE_TOPS[0]; });
  }

  // 背包（用户 11-16：第二章拿到的东西也要显示）：干浮木、湿浮木、绳子、船桨；做好木筏后显示木筏
  private bagSig = '';
  private refreshBag() {
    const s = this.s, c = s.carry, sig = [c.dry, c.soaked, c.rope, c.oar, s.crafted].join();
    if (sig === this.bagSig) return; this.bagSig = sig;
    const it: { icon: string; name: string }[] = [];
    if (s.crafted) it.push({ icon: '🛶', name: '小木筏' });
    else { if (c.dry) it.push({ icon: '🪵', name: `干木×${c.dry}` }); if (c.soaked) it.push({ icon: '💧', name: `湿木×${c.soaked}` }); if (c.rope) it.push({ icon: '🪢', name: '绳子' }); }
    if (c.oar) it.push({ icon: '🚣', name: '船桨' });
    this.g.ui.bag(it); const el = document.getElementById('bag'); if (el) el.style.bottom = '78px'; // 让开右下角的笔记 / ？ / 跳段按钮
  }

  // ======================= 第二章的光、雾、水（用户 11-17：环境美术意见里 Claude 负责的部分）=======================
  private lookSaved: { exp: number; fog: [number, number, number] | null; lights: [THREE.Light, number][] } | null = null;
  private applyLook() {
    const q = (window as any).__qhd; if (!q?.renderer || new URLSearchParams(location.search).has('ch2look0')) return;
    const r = q.renderer as THREE.WebGLRenderer, sc = q.scene as THREE.Scene, f = sc.fog as THREE.Fog | null;
    const lights: [THREE.Light, number][] = []; sc.traverse((o) => { const l = o as THREE.Light; if (l.isLight) lights.push([l, l.intensity]); });
    this.lookSaved = { exp: r.toneMappingExposure, fog: f ? [f.color.getHex(), f.near, f.far] : null, lights };
    r.toneMappingExposure *= 0.9; // 降一点亮度
    for (const [l, i] of lights) l.intensity = (l as THREE.HemisphereLight).isHemisphereLight || (l as THREE.AmbientLight).isAmbientLight ? i * 0.72 : (l as THREE.DirectionalLight).castShadow ? i * 1.08 : i * 0.8; // 环境光少一点、太阳略强 → 阴影更深、更立体
    if (f) { f.color.setHex(0xc8d2c2); f.near = 32; f.far = 120; } // 远处一层偏青的薄雾，远景往后退
  }
  private restoreLook() {
    const L = this.lookSaved, q = (window as any).__qhd; if (!L || !q?.renderer) return;
    q.renderer.toneMappingExposure = L.exp; for (const [l, i] of L.lights) l.intensity = i;
    const f = q.scene.fog as THREE.Fog | null; if (f && L.fog) { f.color.setHex(L.fog[0]); f.near = L.fog[1]; f.far = L.fog[2]; }
    this.lookSaved = null;
  }
  /** 水面：顺流（往 +z）流动的细波纹、河中间深两边浅、稳石 / 礁石 / 倒木四周和急流段一圈白沫。只改河面材质，不碰玩法 */
  private waterU: { uT: { value: number } } | null = null;
  private buildWater() {
    const w = this.root.getObjectByName('ch2_water') as THREE.Mesh | undefined; if (!w || new URLSearchParams(location.search).has('ch2water0')) return;
    const m = w.material as THREE.MeshStandardMaterial, O = this.g.ch2!.world(0, 0, 0);
    const pts: THREE.Vector3[] = [];
    for (const seg of SEGMENTS) for (const x of seg) pts.push(new THREE.Vector3(x, STONE_Z, 0.75));
    for (const r of this.rocks) pts.push(new THREE.Vector3(r.position.x, r.position.z, 1.3));
    if (this.log) pts.push(new THREE.Vector3(this.log.position.x, this.log.position.z, 2.0));
    for (let d = RAPID_D - 4; d <= RAPID_D + 4; d += 2) { const p = this.pathAt(d, 0); pts.push(new THREE.Vector3(p.x, p.z, 2.4)); }
    const N = 24; while (pts.length < N) pts.push(new THREE.Vector3(9999, 9999, 0.01)); pts.length = N;
    const U = { uT: { value: 0 } }; this.waterU = U;
    m.transparent = true; m.opacity = 0.9; m.roughness = 0.12; m.color.setHex(0xffffff);
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, { uO: { value: new THREE.Vector2(O.x, O.z) }, uP: { value: pts } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWW; uniform float uT; uniform vec2 uO; uniform vec3 uP[${N}];
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hsh(i), hsh(i+vec2(1,0)), f.x), mix(hsh(i+vec2(0,1)), hsh(i+vec2(1,1)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `vec2 lp = vWW.xz - uO;
  float river = 1.0 - smoothstep(4.0, 6.2, abs(lp.x)) * step(lp.y, 30.0) * step(-42.0, lp.y);
  vec3 deep = vec3(0.16, 0.34, 0.38), shal = vec3(0.42, 0.62, 0.58);
  diffuseColor.rgb = mix(shal, deep, river * (1.0 - smoothstep(0.0, 5.5, abs(lp.x))) * 0.9 + 0.1);
  vec2 fl = vec2(lp.x * 1.3, lp.y * 0.55 - uT * 1.4);
  float rip = vn(fl * 1.6) * 0.6 + vn(fl * 4.1 + 7.0) * 0.4;
  float foam = 0.0;
  for (int i = 0; i < ${N}; i++) { vec2 d = lp - uP[i].xy; d.y -= 0.35 * uP[i].z; float r = length(d * vec2(1.0, 0.75)); float ring = 1.0 - smoothstep(uP[i].z * 0.55, uP[i].z * 1.25, r); foam = max(foam, ring * smoothstep(0.35, 0.75, vn(lp * 3.2 + vec2(0.0, -uT * 2.2)) + ring * 0.25)); }
  foam = max(foam, smoothstep(5.55, 5.95, abs(lp.x)) * step(lp.y, 30.0) * smoothstep(0.45, 0.8, vn(vec2(lp.x * 6.0, lp.y * 1.5 - uT * 1.8))));
  diffuseColor.rgb += (rip - 0.5) * 0.06;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 0.95), foam * 0.85);
  diffuseColor.a = mix(diffuseColor.a, 1.0, foam * 0.8);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec2 e = vec2(0.08, 0.0); float h0 = vn(fl * 1.6), hx = vn((fl + e.xy) * 1.6), hz = vn((fl + e.yx) * 1.6); normal = normalize(normal + vec3(h0 - hx, 0.0, h0 - hz) * 1.1); }`);
    };
    m.needsUpdate = true;
  }

  update(dt: number, t: number, camYaw: number) {
    if (this.waterU) this.waterU.uT.value += dt;
    this.updateArt(dt); this.refreshBag();
    const g = this.g, inp = g.input, lead = g.leader, s = this.s;
    g.ch2Time += dt;
    const panel = !!this.panelEl;
    const locked = g.respawning > 0 || panel || this.fallT > 0;
    const inWindow = !!this.window && this.window.phase !== 'sink';
    if (!panel) {
      if (!this.raft && !inWindow) for (let i = 0; i < g.squad.length; i++) if (inp.pressed('Digit' + (i + 1))) { this.sw(g.squad[i]); this.unpostIfMovedAway(); }
      if (inp.pressed('Enter')) g.ui.skipLine();
      if (inp.pressed('KeyH')) this.hint();
      if (inp.pressed('KeyN')) this.openNotes();
      if (!locked) {
        if (inp.pressed('KeyG')) this.switchTeam();
        if (inp.pressed('KeyQ')) this.skill();
        if (inp.pressed('KeyE')) this.interact();
        if (inp.pressed('KeyF')) this.callF();
      }
    } else if (inp.pressed('Escape')) this.closePanel();

    if (this.raft) this.updateRaft(dt, t, locked);
    else {
      const f = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw)), r = new THREE.Vector3(-f.z, 0, f.x), wish = new THREE.Vector3();
      if (!locked) {
        if (inp.down('KeyW') || inp.down('ArrowUp')) wish.add(f);
        if (inp.down('KeyS') || inp.down('ArrowDown')) wish.sub(f);
        if (inp.down('KeyD') || inp.down('ArrowRight')) wish.add(r);
        if (inp.down('KeyA') || inp.down('ArrowLeft')) wish.sub(r);
      }
      const tw = (window as any).__qhdTestWish; if (tw && !locked) wish.set(tw.x, 0, tw.z); // 自动测试用：世界坐标方向
      if (wish.lengthSq() > 0) wish.normalize();
      let speed = inp.down('ShiftLeft') || inp.down('ShiftRight') ? lead.def.run : lead.def.walk;
      if (g.observing) speed *= 0.5;
      const postedLead = (g.active === 'tangtuan' && this.posted.brace) || (g.active === 'youyou' && this.posted.lever);
      lead.pose = g.observing ? 'observe' : postedLead && wish.lengthSq() === 0 ? (g.active === 'tangtuan' ? 'push' : 'hold') : 'idle';
      lead.interWant = null; lead.lockYaw = false; lead.pushMoving = false;
      lead.move(dt, wish.multiplyScalar(locked ? 0 : speed), !locked && inp.pressed('Space'));
      if (wish.lengthSq() > 0) this.unpostIfMovedAway();
      g.updateFollowers(dt, false, () => false);
      for (const id of g.squad) { const a = g.actors[id]; if (a === lead) continue; a.interWant = null; if (id === 'tangtuan' && this.posted.brace) a.pose = 'push'; }
      // 不在当前小队的角色：站着；有路线的（佑佑过河）自己走
      for (const a of Object.values(g.actors)) if (!g.squad.includes(a.def.id)) {
        if (a.goal && !a.holding) this.walkTo(a, dt); else a.move(dt, new THREE.Vector3(), false);
        a.pose = a.holding ? (a.def.id === 'tangtuan' ? 'push' : 'hold') : s.stage === 'spotted' && EAST.includes(a.def.id) && this.team === 'west' ? 'cheer' : 'idle';
      }
      // C12：有 Codex 正式模型时，守岗用共用交互动作（汤团双手顶撑杆、佑佑扳拉杆）；灰盒没有这些片段，自动忽略
      if (this.posted.brace && g.actors.tangtuan) g.actors.tangtuan.interWant = 'brace_door';
      if (this.posted.lever && g.actors.youyou) g.actors.youyou.interWant = 'pry';
      this.updateYouyouPath();
      this.checkFalls(dt);
    }
    for (const a of Object.values(g.actors)) { a.sync(dt, t); a.setActiveLook(a === g.leader); }

    // 各阶段
    if (s.stage === 'tracks') this.updateTracks();
    if (s.stage === 'spotted') this.updateRescue(dt);
    if (s.stage === 'turtle') this.updateTurtle(dt, t);
    this.tracks.update(dt, t, g.observing && g.active === 'paipai');
    this.kit.setPosted('brace', this.posted.brace); this.kit.setPosted('lever', this.posted.lever);
    this.kit.update(dt, t);
    this.animProps(dt, t);
    this.updateHints(dt);
    this.updateKeys();
    this.objective();
  }

  private walkTo(a: Actor, dt: number) {
    const d = a.goal!.clone().sub(a.pos); d.y = 0; const dist = d.length();
    if (dist < 0.3) { a.move(dt, new THREE.Vector3(), false); return; }
    a.move(dt, d.normalize().multiplyScalar(a.def.walk), false);
  }
  private checkFalls(dt: number) {
    const g = this.g;
    if (this.fallT > 0) {
      this.fallT -= dt;
      if (this.fallT <= 0.35 && this.fallT + dt > 0.35 && this.fallen) { this.fallen.teleport(this.safeFor(this.fallen), 0); if (this.fallen === g.leader) g.crumbs = []; }
      if (this.fallT <= 0) { this.fallT = 0; this.fallen = null; g.ui.fade(false); }
      return;
    }
    for (const a of Object.values(g.actors)) if (a.pos.y < -2.5) {
      if (a === g.leader) { this.fallT = 0.9; this.fallen = a; g.ui.fade(true); g.ui.say(this.team === 'east' && this.s.stage === 'spotted' ? 'youyou' : 'hanhan', '小心水！先回到岸上。', 2.4, undefined, true); this.stepErr++; }
      else a.teleport(this.safeFor(a), 0);
      break;
    }
  }
  /** 掉水后回到哪里：对岸小队回东岸（北北回最后一段稳住的石头），其余回所在区域的安全点 */
  safeFor(a: Actor): THREE.Vector3 {
    const s = this.s, id = a.def.id;
    if (s.stage === 'spotted' && EAST.includes(id) && !(id === 'beibei' && s.segs >= 3)) {
      if (id === 'beibei' && s.segs > 0) return this.W(V(SEG_END_X[s.segs - 1], STONE_Z), STONE_TOPS[3] + 0.05);
      return this.W(id === 'beibei' ? V(SENSE_EAST.x + 0.6, SENSE_EAST.z) : V(9, -13), 0.05);
    }
    if (s.stage === 'turtle' || s.stage === 'done') return this.W(LANDING, 0.05);
    if (s.stage === 'reunited' || s.stage === 'raft') return this.W(V(-11, 5), 0.05);
    return this.g.ch2!.spawn.pos.clone();
  }

  // ======================= 按键 =======================
  private switchTeam() {
    if (this.s.stage !== 'spotted') { if (this.s.stage === 'tracks') return; this.g.ui.say(this.g.active, '大家已经在一起了。', 1.6, 'g_together'); return; }
    if (this.window) return;
    this.setTeam(this.team === 'west' ? 'east' : 'west');
    this.g.ui.say(this.g.active, this.team === 'east' ? '这边是佑佑和北北！' : '回到西岸这边。', 1.4, undefined, true);
  }
  private skill() {
    const g = this.g, s = this.s, who = g.active;
    if (who === 'paipai') {
      g.observing = !g.observing; g.ui.observe(g.observing);
      if (!g.observing) return;
      if (s.stage === 'tracks' && !this.nearClue()) g.ui.say('paipai', '这里没什么……顺着地上的脚印再往前看看。', 2.4, 'ch2_pp_none_' + Math.round(g.leader.pos.x / 6) + '_' + Math.round(g.leader.pos.z / 6));
      if (s.stage === 'turtle' && !this.turtle.seen && this.distL(LOOK_ST) < 2.6) { this.turtle.seen = true; g.ui.say('paipai', '看壳缝里，那块石头压着它了。', 3, undefined, true); this.progress(); }
      else if (s.stage === 'turtle' && !this.turtle.seen) g.ui.say('paipai', '离得太远了……到石龟东边（发光处）再看。', 2.4, 'pp_turtle_far');
      return;
    }
    if (s.stage === 'tracks') { g.ui.say(who, '我看不出什么……派派眼睛最尖，让她来看看吧（按 3 换派派）。', 2.8, 'ch2_q_' + who); return; }
    if (who === 'beibei') {
      if (s.stage === 'spotted' && s.segs < 3) {
        const k = s.segs, spot = k === 0 ? SENSE_EAST : V(SEG_END_X[k - 1], STONE_Z);
        if (this.distL(spot) < (k === 0 ? 2.2 : 1.4)) {
          this.bbSpot = spot.clone(); // 摸完就守在石头路起点，换人去喊口令时不会跟着走
          if (!this.sensed[k]) { this.sensed[k] = true; g.actors.beibei?.interactOnce('crouch_grab_rope'); this.kit.setSensed(k, true); g.ui.say('beibei', k === 0 ? '这块石头下面的水声，和别的不一样。' : '下面这几块也是稳的，我摸到了。', 3, undefined, true); this.progress(); }
          else g.ui.say('beibei', '我记住了，就是这几块。', 1.6, undefined, true);
        } else { g.ui.say('beibei', '这里摸不到……到河边离石头近一点（发光处）。', 2.4, 'bb_far_' + k); this.stepErr++; }
        return;
      }
      if (s.stage === 'turtle' && !this.turtle.heard) {
        if (this.distL(TOUCH_ST) < 2.6) { this.turtle.heard = true; g.ui.say('beibei', '它的心跳好快……它很害怕。等它慢下来，我数给你们听。', 3.4, undefined, true); this.progress(); }
        else g.ui.say('beibei', '要贴着龟壳才听得见……到石龟西边（发光处）。', 2.4, 'bb_turtle_far');
        return;
      }
      g.ui.say('beibei', '我摸一摸……这里没什么特别的。', 1.8, 'bb_none');
      return;
    }
    if (who === 'youyou') { g.ui.say('youyou', s.stage === 'reunited' && !s.boathouse ? '地图上的旧船屋在西岸上游，门上有门牌。' : '我看看地图……我们走的方向没错！', 2.4, undefined, true); return; }
    g.ui.say(who, who === 'tangtuan' ? '我力气大，有重活叫我！' : '我来安排大家！有事按 F 叫我喊口令。', 2, 'q_' + who);
  }
  private distL(p: THREE.Vector3, a: Actor = this.g.leader) { const O = this.g.ch2!.world(0, 0, 0), q = a.pos; return Math.hypot(q.x - O.x - p.x, q.z - O.z - p.z); }
  private local(a: Actor = this.g.leader) { const O = this.g.ch2!.world(0, 0, 0), q = a.pos; return new THREE.Vector3(q.x - O.x, q.y, q.z - O.z); }

  private interact() {
    const g = this.g, s = this.s, who = g.active;
    if (this.turtle.rhythm) { this.turtlePress(); return; }
    if (this.raft) return;
    // C4 撑杆 / 拉杆
    if (s.stage === 'spotted') {
      if (this.distL(BRACE) < 1.6) {
        if (who !== 'tangtuan') { g.ui.say(who, '撑杆太重了，得汤团来顶。', 2.2, undefined, true); this.stepErr++; return; }
        this.posted.brace = true; const a = g.leader; a.goal = this.W(BRACE, 0.05); a.holding = true; a.faceTo(this.W(V(BRACE.x + 1, BRACE.z)));
        g.ui.say('tangtuan', '我顶住闸门，你们先站稳。', 2.6, undefined, true); this.progress(); return;
      }
      if (this.distL(LEVER) < 1.6) {
        if (who !== 'youyou') { g.ui.say(who, '这根拉杆是佑佑在守的。', 2, undefined, true); this.stepErr++; return; }
        this.posted.lever = true; const a = g.leader; a.goal = this.W(LEVER, 0.05); a.holding = true;
        g.ui.say('youyou', '拉杆交给我！喊口令的时候我一拉，水就退。', 2.8, undefined, true); this.progress(); return;
      }
    }
    // C5 船屋门牌
    if (!s.boathouse && this.distL(BOATHOUSE_DOOR) < 2.0) {
      if (s.stage !== 'reunited') { g.ui.say(who, '一间旧船屋……门锁着。', 2, 'bh_locked'); return; }
      if (who !== 'youyou') { g.ui.say(who, '门牌上的字好古老……佑佑会看地图，让她来读？', 2.6, undefined, true); this.stepErr++; return; }
      this.openDoor(); s.boathouse = true; g.ui.say('youyou', '门牌上画着一支桨——这就是船屋！门开了。', 3, undefined, true); this.save(); this.progress(); return;
    }
    // C5 拾取
    for (const m of MATS) {
      if (s.taken.includes(m.id) || this.distL(V(m.x, m.z)) > 1.6) continue;
      if (s.stage !== 'reunited') { g.ui.say(who, '先去找佑佑和北北吧。', 1.8, 'pick_early'); return; }
      this.take(m); return;
    }
    // C6 试水槽
    if (this.distL(COVE) < 2.0 && s.stage === 'reunited') { this.openFloat(); return; }
    // C5 木盒
    if (this.distL(CRATE) < 1.9 && s.stage === 'reunited') { this.craft(); return; }
    // C7 上筏
    if (s.crafted && s.stage === 'reunited' && this.distL(DOCK) < 2.4) { this.board(); return; }
    // C8 练习石 / 石龟
    if (s.stage === 'turtle') {
      if (this.distL(PRACTICE) < 2.2) { this.openLever(); return; }
      if (this.distL(PUSH_ST) < 2.0) { this.turtlePush(); return; }
    }
  }
  private callF() {
    const g = this.g, s = this.s;
    if (this.raft) { this.raftPaddle(); return; }
    if (s.stage !== 'spotted' || this.window || this.shout) { if (s.stage === 'turtle') { if (g.active === 'hanhan' && !s.turtle) this.turtleAssign(); else g.ui.say(g.active, '要分站位得涵涵来喊——按 2 换涵涵再按 F。', 2.4, 'f_turtle'); } return; }
    const captain: CharId = this.team === 'west' ? 'hanhan' : 'youyou', cn = CHARS[captain].name;
    if (g.active !== captain) { g.ui.say(g.active, `大家一起做的事，得${cn}来喊——按 ${g.squad.indexOf(captain) + 1} 换${cn}。`, 2.6, undefined, true); this.stepErr++; return; }
    const k = s.segs, miss: string[] = [];
    if (!this.posted.brace) miss.push('汤团还没顶住西岸的撑杆');
    if (!this.posted.lever) miss.push('佑佑还没守住东岸的拉杆');
    if (!this.sensed[k]) miss.push('北北还没摸出下一段稳石');
    const bb = this.g.actors.beibei, spot = k === 0 ? SENSE_EAST : V(SEG_END_X[k - 1], STONE_Z);
    if (this.sensed[k] && this.distL(spot, bb) > (k === 0 ? 2.6 : 1.6)) miss.push('北北要站在石头路的起点');
    if (miss.length) { g.ui.say(captain, miss[0] + '，先准备好再喊。', 2.8, undefined, true); this.stepErr++; return; }
    this.shout = { t: 0, beat: 0, kind: 'rescue' };
    g.ui.say(captain, '都准备好了吗？听口令再走。', 2, undefined, true);
  }
  private unpostIfMovedAway() {
    const g = this.g;
    if (this.posted.brace && this.distL(BRACE, g.actors.tangtuan) > 1.3) { this.posted.brace = false; const a = g.actors.tangtuan; a.holding = false; a.goal = null; if (this.s.stage === 'spotted' && this.s.segs < 3) g.ui.say('tangtuan', '我离开撑杆了。', 1.4, undefined, true); }
    const yy = g.actors.youyou;
    if (yy && this.posted.lever && this.distL(LEVER, yy) > 1.3) { this.posted.lever = false; yy.holding = false; yy.goal = null; }
    const bb = g.actors.beibei;
    if (bb && this.bbSpot && g.active === 'beibei' && this.distL(this.bbSpot, bb) > 2.5) { this.bbSpot = null; bb.holding = false; bb.goal = null; }
  }

  // ======================= C3 追踪水痕 =======================
  nearClue() {
    for (const c of this.tracks.clues) if (!c.found && this.distL(c.local) < c.radius) return c;
    return null;
  }
  private updateTracks() {
    const g = this.g; if (this.fallT > 0) return;
    const c = this.nearClue();
    if (c && g.active === 'paipai' && g.observing) {
      c.found = true; g.ui.say('paipai', c.line, 3.2, undefined, true);
      const n = this.tracks.clues.filter((x) => x.found).length;
      if (n < 3) g.ui.say(n === 1 ? 'hanhan' : 'tangtuan', n === 1 ? '脚印还往前走呢，跟上！' : '快到河边了……', 2.2);
      this.save(); this.progress();
      if (n === 3) this.spotted();
    } else if (c && g.active !== 'paipai' && !this.said.has('near_' + c.id)) {
      this.said.add('near_' + c.id); g.ui.say(g.active, '地上好像有什么……派派，你来看看？（按 3 换派派，按 Q）', 3, undefined, true);
    }
  }
  private spotted() {
    this.s.stage = 'spotted'; this.spawnExtras();
    this.g.ui.say('hanhan', '佑佑，北北！别急，我们一起想办法。', 3);
    this.g.ui.say('youyou', '我们在这儿！这边的拉杆还能动。', 3);
    this.g.ui.say('hanhan', '两边各有半套水闸——我们分两队：按 G 可以换到对岸。', 3.4);
    this.save(); this.progress();
  }

  // ======================= C4 分队救援 =======================
  private updateRescue(dt: number) {
    const g = this.g, s = this.s, sh = g.ch2!;
    if (this.shout) {
      const S = this.shout; S.t += dt;
      const words = ['三——', '二——', '一！'];
      while (S.beat < 3 && S.t >= S.beat * 0.9) { g.ui.count(words[S.beat], S.beat, 0.6); this.countHint(S.beat === 2 ? '水退了——北北快走！' : '数到「一」水就退'); S.beat++; }
      if (S.t > 2.0) { this.shout = null; g.ui.countEnd('ok'); this.startWindow(); }
      return;
    }
    const W = this.window; if (!W) {
      if (s.segs >= 3) this.updateReunion();
      return;
    }
    W.t += dt;
    const k = W.k;
    if (W.phase === 'rise') { const r = Math.min(1, W.t / 0.6); this.kit.setDrain(r); this.kit.setRaise(k, r); if (r >= 1) { W.phase = 'open'; W.t = 0; } }
    else if (W.phase === 'open') {
      const left = W.dur - W.t; g.ui.hold(`退水中：带北北走过第 ${k + 1} 段（还有 ${Math.max(0, Math.ceil(left))} 秒）`, left / W.dur);
      const p = this.local(g.actors.beibei);
      if (p.x <= SEG_END_X[k] + 0.25 && Math.abs(p.z - STONE_Z) < 0.9 && p.y > -0.2) { W.ok = true; W.phase = 'sink'; W.t = 0; this.segDone(k); }
      else if (left <= 0) { W.ok = false; W.phase = 'sink'; W.t = 0; this.segFail(k); }
    } else {
      const r = Math.max(0, 1 - W.t / 0.6); this.kit.setDrain(r); if (!W.ok) this.kit.setRaise(k, r);
      if (r <= 0) { this.window = null; g.ui.hold(null, 0); }
    }
    void sh;
  }
  private countHint(text: string) { const h = document.querySelector('#count .hint') as HTMLElement | null; if (h) h.textContent = text; }
  private startWindow() {
    const g = this.g, s = this.s, k = s.segs;
    this.window = { t: 0, dur: s.relaxed ? 10 : 6, k, phase: 'rise', ok: false };
    if (k === 0) g.ch2!.gates.stones_e.setOpen(true);
    if (this.team !== 'east' || g.active !== 'beibei') this.setTeam('east', 'beibei');
    this.bbSpot = null; { const bb = g.actors.beibei; bb.holding = false; bb.goal = null; }
    g.ui.say('youyou', '拉！水退了——北北，走！', 1.8, undefined, true);
  }
  private segDone(k: number) {
    const g = this.g, s = this.s;
    this.kit.lock(k); s.segs = k + 1; this.sensed[k] = false; s.fails = 0;
    g.ui.hold(null, 0);
    g.ui.say('beibei', ['第一段稳住了。下一段也能慢慢来。', '第二段也稳了！', '最后一段！我过来了！'][k], 2.6, undefined, true);
    if (k === 2) { g.ch2!.gates.stones_w.setOpen(true); this.posted.lever = false; const yy = g.actors.youyou; yy.holding = false; yy.goal = null; this.youyouPath = [V(7.2, STONE_Z), V(-8, STONE_Z)]; g.ui.say('youyou', '派派，我们过来了！', 2.4); }
    this.save(); this.progress();
  }
  private segFail(k: number) {
    const g = this.g, s = this.s, bb = g.actors.beibei;
    s.fails++;
    const p = this.local(bb);
    const onSeg = Math.abs(p.z - STONE_Z) < 1.2 && p.x <= SEGMENTS[k][0] + 0.7 && p.x >= SEG_END_X[k] - 0.7;
    if (onSeg) { this.fallen = bb; this.fallT = 0.9; g.ui.fade(true); }
    if (s.fails >= 3 && !s.relaxed) { s.relaxed = true; g.ui.say('tangtuan', '没关系！这次我多顶一会儿——水会退十秒。', 3, undefined, true); }
    else g.ui.say('tangtuan', '水回来了！没关系，北北先回到稳的地方，再来一次。', 3, undefined, true);
    this.stepErr++; this.save();
  }
  private updateYouyouPath() {
    const yy = this.g.actors.youyou; if (!yy || !this.youyouPath.length) return;
    const tgt = this.youyouPath[0];
    if (!yy.goal || yy.goal.distanceTo(this.W(tgt, 0)) > 0.01) { yy.goal = this.W(tgt, 0); yy.holding = false; }
    if (this.distL(tgt, yy) < 0.45) { this.youyouPath.shift(); yy.goal = this.youyouPath.length ? this.W(this.youyouPath[0], 0) : null; }
  }
  private updateReunion() {
    const g = this.g, bb = this.local(g.actors.beibei), yy = this.local(g.actors.youyou);
    if (bb.x < -6.4 && yy.x < -6.4 && Math.abs(bb.z - STONE_Z) < 6 && Math.abs(yy.z - STONE_Z) < 6) {
      this.s.stage = 'reunited'; this.youyouPath = [];
      this.posted.brace = false; const tt = g.actors.tangtuan; tt.holding = false; tt.goal = null;
      this.setSquad(ALL5, g.active);
      // 西岸三人走过来汇合（太远的直接到身边）
      for (const id of WEST) { const a = g.actors[id]; if (this.distL(V(-9, STONE_Z), a) > 12) a.teleport(this.W(V(-10 - WEST.indexOf(id), STONE_Z + 1.5), 0.05), 0); }
      g.ui.say('youyou', '……谢谢你们来找我。', 2.8, undefined, true);
      g.ui.say('hanhan', '我们是一起的呀。', 2);
      g.ui.say('youyou', '你们看，我在对岸捡到一张古地图——地图上有间旧船屋，桨应该在那里。', 3.6);
      g.ui.say('tangtuan', '要做木筏！浮木、藤绳、船桨，都去找来。', 3);
      this.giveLeaf('youyou'); this.save(); this.progress();
    }
  }

  // ======================= C5 材料与木盒 =======================
  private take(m: typeof MATS[number]) {
    const g = this.g, s = this.s, c = s.carry;
    s.taken.push(m.id); this.pickMeshes.get(m.id)!.visible = false; this.g.leader.interactOnce('crouch_grab_rope');
    if (m.kind === 'dry' || m.kind === 'soaked') {
      c[m.kind]++;
      const firstWood = c.dry + c.soaked === 1;
      if (!s.float.done && firstWood) { g.ui.say('tangtuan', m.kind === 'soaked' ? '这根怎么这么沉，它能浮吗？' : '浮木！……不过不是所有木头都能浮吧？', 2.8, undefined, true); g.ui.say('hanhan', '码头边有个试水槽，可以先试一试。', 2.6); }
      else if (s.float.done && m.kind === 'soaked') g.ui.say(g.active, '这根是泡透的木头……先拿着，到木盒那儿再看。', 2.6, undefined, true);
      else g.ui.say(g.active, '一根浮木！', 1.4, undefined, true);
    } else if (m.kind === 'rope') { c.rope = true; g.ui.say(g.active, '结实的藤绳，绑木筏正好。', 2, undefined, true); }
    else { c.oar = true; g.ui.say(g.active, '船桨！有了它就能掌舵了。', 2, undefined, true); }
    this.save(); this.progress();
  }
  private craft() {
    const g = this.g, s = this.s, c = s.carry;
    if (s.crafted) { g.ui.say(g.active, '木筏已经做好了，到码头边上筏吧。', 2, undefined, true); return; }
    if (!s.float.done) { g.ui.say('hanhan', '先试试哪种木头能浮——码头边的试水槽。', 2.6, undefined, true); this.stepErr++; return; }
    if (c.soaked > 0) { g.ui.say('tangtuan', `这${c.soaked > 1 ? '几' : ''}根泡透的木头太沉，会把筏压下去——先放在木盒旁边。`, 3, undefined, true); c.soaked = 0; }
    const need: string[] = [];
    if (c.dry < 4) need.push(`浮木还差 ${4 - c.dry} 根`);
    if (!c.rope) need.push('还没有藤绳');
    if (!c.oar) need.push('还没有船桨');
    if (need.length) { g.ui.say('hanhan', need.join('，') + '。', 2.8); this.stepErr++; this.save(); return; }
    s.crafted = true; c.dry -= 4; c.rope = false; c.oar = false;
    g.ui.say('tangtuan', '浮木、藤绳、船桨，都齐了。就在木盒上做吧。', 2.8, undefined, true);
    g.ui.say('youyou', '木筏做好了！大家到码头边上筏。', 2.6);
    this.showRaftAtDock(); this.save(); this.progress();
  }
  private openDoor() { this.door.visible = false; this.artDoor?.play(); if (this.doorCol) { this.g.ph.remove(this.doorCol); this.cols.splice(this.cols.indexOf(this.doorCol), 1); this.doorCol = null; } }

  // ======================= C6 浮力实验 =======================
  private openFloat() {
    const s = this.s;
    if (s.float.done) { this.g.ui.say(this.g.active, '刚才已经试过了：一样大的东西，越轻浮得越高。', 2.4, undefined, true); return; }
    const step1 = () => this.panel('浮力测试 · 1/4 猜一猜', '<p>三样东西一样大：<b>干浮木</b>、<b>泡水木</b>、<b>石板</b>。你觉得哪些能浮在水上？（可以多选）</p>'
      + ['干浮木', '泡水木', '石板'].map((n) => `<label style="display:inline-flex;gap:6px;margin:6px 14px 6px 0;font-size:17px"><input type="checkbox" data-g="${n}">${n}</label>`).join('')
      + '<p><button data-a="guess">我猜好了</button></p>', { guess: (el) => { s.float.guess = [...el.querySelectorAll('input:checked')].map((i) => (i as HTMLInputElement).dataset.g!); step2(); } });
    const step2 = () => { this.drop('drop'); this.panel('浮力测试 · 2/4 放下水', '<p>汤团把三样东西一起放进水槽……</p><p class="seen">干浮木露出一大半；泡水木只露出一条边；石板沉到底了。</p><p><button data-a="next">放上配重石试试</button></p>', { next: step3 }); };
    const step3 = () => { this.drop('weight'); this.panel('浮力测试 · 3/4 加重物', '<p>给浮着的两样各放一块一样重的配重石（就像坐上去的人）……</p><p class="seen">干浮木往下沉了一点，还浮着；泡水木整个沉下去了。</p><p><button data-a="next">我知道为什么了</button></p>', { next: step4 }); };
    const step4 = () => this.panel('浮力测试 · 4/4 说结论', '<p>哪句话说得对？</p>'
      + ['一样大的东西，越轻浮得越高，能驮的也越多', '木头都能浮，石头都会沉', '东西越大越容易沉'].map((t, i) => `<p><button data-a="c${i}" style="width:100%;text-align:left">${t}</button></p>`).join(''),
      { c0: () => finish(0), c1: () => wrong(1), c2: () => wrong(2) });
    const wrong = (i: number) => { s.float.tries++; s.float.concl = i; this.stepErr++; this.panel('我们再看一眼', `<p>${i === 1 ? '泡水木也是木头，可是它加了配重就沉了哦。' : '三样东西一样大，可是浮得不一样。'}</p><p><button data-a="next">再看一次</button></p>`, { next: step3 }); };
    const finish = (i: number) => {
      s.float.concl = i; s.float.done = true; s.float.tries++; this.closePanel();
      this.g.ui.say('paipai', '我记在笔记里了！泡透的木头太重，不能做木筏。', 2.8, undefined, true);
      this.g.ui.say('hanhan', '做木筏只要干浮木——找 4 根，再加藤绳和船桨。', 3);
      this.save(); this.progress();
    };
    step1();
  }
  private drop(mode: 'drop' | 'weight') { this.sample.anim = { t: 0, mode }; this.sample.w1.visible = mode === 'weight'; this.sample.w2.visible = mode === 'weight'; }

  // ======================= C7 木筏 =======================
  private pathLen() { let L = 0; for (let i = 1; i < RAFT_PATH.length; i++) L += RAFT_PATH[i].distanceTo(RAFT_PATH[i - 1]); return L; }
  private pathAt(d: number, u = 0) {
    let acc = 0;
    for (let i = 1; i < RAFT_PATH.length; i++) {
      const a = RAFT_PATH[i - 1], b = RAFT_PATH[i], l = a.distanceTo(b);
      if (acc + l >= d || i === RAFT_PATH.length - 1) { const f = Math.min(1, Math.max(0, (d - acc) / l)); const p = a.clone().lerp(b, f); const dir = b.clone().sub(a).normalize(); return p.add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(u)); } // u>0 = 顺水方向的右手边（和镜头的「右」一致：D 往右）
      acc += l;
    }
    return RAFT_PATH[RAFT_PATH.length - 1].clone();
  }
  private pathDir(d: number) { const a = this.pathAt(d), b = this.pathAt(d + 0.5); return b.sub(a).normalize(); }
  private showRaftAtDock() { const p = this.pathAt(0); this.raftMesh.position.set(p.x, CH2_WATER_Y + 0.1, p.z); this.raftMesh.rotation.y = Math.atan2(this.pathDir(0).x, this.pathDir(0).z); this.raftMesh.visible = true; this.g.ch2!.gates.raft_board.setOpen(true); }
  private board() {
    const g = this.g, s = this.s;
    const far = ALL5.filter((id) => this.distL(DOCK, g.actors[id]) > 9);
    if (far.length) { g.ui.say('youyou', `还差${far.map((id) => CHARS[id].name).join('、')}——五个人都到码头再出发。`, 2.8, undefined, true); this.stepErr++; return; }
    s.stage = 'raft'; this.setSquad(ALL5, 'youyou');
    this.raft = { d: SEC_START[s.raftSec] ?? 0, u: 0, speed: 2.6, sec: s.raftSec, hitT: 0, rhythm: null, paddled: false, warned: new Set() };
    g.ui.say('hanhan', '五个人都坐好了，我们再出发。', 2.4, undefined, true);
    g.ui.say('youyou', '我来掌舵！A 往左，D 往右。', 2.6);
    this.progress();
  }
  private updateRaft(dt: number, t: number, locked: boolean) {
    const R = this.raft!, g = this.g, inp = g.input, total = this.pathLen();
    if (R.hitT > 0) { R.hitT -= dt; if (R.hitT <= 0.35 && R.hitT + dt > 0.35) { R.d = SEC_START[R.sec]; R.u = 0; R.rhythm = null; R.paddled = false; R.warned.clear(); } if (R.hitT <= 0) g.ui.fade(false); }
    else if (!locked) {
      const steer = (inp.down('KeyA') || inp.down('ArrowLeft') ? -1 : 0) + (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0) + ((window as any).__qhdTestSteer ?? 0);
      R.u = Math.max(-1.8, Math.min(1.8, R.u + steer * 2.2 * dt));
      // 第三段：急流前停下来，等口令划桨
      if (!R.paddled && R.d >= RAPID_D - 0.1 && R.d < LOG_D + 1) {
        R.d = Math.min(R.d, RAPID_D);
        if (!R.rhythm) { R.rhythm = { t: -1.2, beat: 0 }; g.ui.say('youyou', '水太急了！听我喊——喊到「用力！」一起划（F）！', 2.6, 'raft_rhythm_' + R.sec + '_' + Math.floor(t)); }
        const Rh = R.rhythm; Rh.t += dt;
        const words = ['划——', '划——', '用力！'];
        while (Rh.beat < 3 && Rh.t >= Rh.beat * 0.9) { g.ui.count(words[Rh.beat], Rh.beat, 0.9); this.countHint(Rh.beat === 2 ? '现在按 F！' : '喊到「用力！」按 F'); Rh.beat++; }
        if (Rh.t > 1.8 + 0.9) { g.ui.countEnd('miss'); R.rhythm = null; this.stepErr++; g.ui.say('youyou', '慢了一点！没关系，再来——听到「用力！」马上按 F。', 2.6, undefined, true); }
      } else {
        const sp = R.paddled && R.d < LOG_D + 3 ? 4.2 : R.speed;
        R.d += sp * dt;
      }
      // 礁石：提前 2.5 秒预警
      ROCKS.forEach((r, i) => {
        if (!R.warned.has(i) && r.d - R.d < 7 && r.d > R.d) { R.warned.add(i); g.ui.say('paipai', `前面有礁石……往${r.u > 0 ? '左' : '右'}一点！`, 2.2, undefined, true); }
        if (Math.abs(r.d - R.d) < 0.9 && Math.abs(r.u - R.u) < 1.45) this.raftHit('撞到礁石了！没关系，回到回水湾再来。');
      });
      if (!R.warned.has(9) && LOG_D - R.d < 9 && R.d < LOG_D) { R.warned.add(9); g.ui.say('paipai', '前面有倒木横在右边——往左躲！', 2.4, undefined, true); }
      if (Math.abs(LOG_D - R.d) < 1.0 && R.u > -0.5) this.raftHit('撞到倒木了！回到回水湾，再往左一点。');
      // 回水湾检查点
      for (let k = SEC_START.length - 1; k > R.sec; k--) if (R.d >= SEC_START[k]) { R.sec = k; this.s.raftSec = k; this.g.ui.say('hanhan', '到回水湾了，先歇一下。', 2, undefined, true); this.save(); this.progress(); break; }
      if (R.d >= total - 0.05) { this.land(); return; }
    }
    // 摆放木筏和五个人
    const p = this.pathAt(R.d, R.u), dir = this.pathDir(R.d), yaw = Math.atan2(dir.x, dir.z), y = CH2_WATER_Y + 0.1 + Math.sin(t * 2.2) * 0.03;
    this.raftMesh.position.set(p.x, y, p.z); this.raftMesh.rotation.y = yaw; this.raftMesh.rotation.z = Math.sin(t * 1.7) * 0.03;
    const seats: [CharId, number, number][] = [['youyou', 0, -1.15], ['tangtuan', -0.55, 0.15], ['hanhan', 0.55, 0.15], ['paipai', -0.45, 1.05], ['beibei', 0.45, 1.05]];
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    this.raftMesh.updateMatrixWorld(true);
    for (const [id, sx, sz] of seats) { const a = g.actors[id]; const mk = this.art?.seats[id]; const q = p.clone().addScaledVector(right, -sx).addScaledVector(dir, sz);
      if (mk) { const w = mk.getWorldPosition(new THREE.Vector3()); a.teleport(new THREE.Vector3(w.x, this.g.ch2!.world(0, y + 0.22, 0).y, w.z), yaw); } else a.teleport(this.W(q, y + 0.22), yaw); a.pose = id === 'youyou' ? 'hold' : 'idle'; a.interWant = id === 'youyou' ? null : 'row'; } // C12：四人划桨
  }
  private raftHit(line: string) { const R = this.raft!; if (R.hitT > 0) return; R.hitT = 0.9; this.g.ui.fade(true); this.g.ui.say('youyou', line, 2.6, undefined, true); this.stepErr++; }
  private raftPaddle() {
    const R = this.raft!, g = this.g;
    if (!R.rhythm) { g.ui.say('youyou', '还没到急流——听我喊口令再划。', 1.6, 'raft_early_f'); return; }
    if (R.rhythm.beat < 3 || R.rhythm.t < 1.8 - 0.25) { g.ui.countEnd('miss'); R.rhythm = null; this.stepErr++; g.ui.say('youyou', '早了一点！等我喊到「用力！」。', 2.2, undefined, true); return; }
    g.ui.countEnd('ok'); R.rhythm = null; R.paddled = true; g.ui.say('youyou', '用力！', 1.2, undefined, true); g.ui.say('tangtuan', '冲过去了！', 1.6);
  }
  private land() {
    const g = this.g, s = this.s;
    this.raft = null; s.stage = 'turtle'; s.raftSec = 0;
    g.ch2!.gates.raft_land.setOpen(true);
    this.setSquad(ALL5, 'tangtuan'); this.placeAll(LANDING);
    g.ui.say('beibei', '它的心跳好快……它很害怕。', 2.6, undefined, true);
    g.ui.say('hanhan', '河中间那只石龟在乱转，掀起好大的浪——出口被挡住了。', 3.2);
    g.ui.say('tangtuan', '壳缝里好像卡着东西……西边那块练习石，先试试用船桨撬。', 3.2);
    this.save(); this.progress();
  }

  // ======================= C8 杠杆与石龟 =======================
  private openLever() {
    const s = this.s, L = s.lever;
    if (L.done) { this.g.ui.say(this.g.active, '记住了：支点离石头越近，越省力。', 2.2, undefined, true); return; }
    this.leverRig.plank.visible = true; this.leverRig.fulc.visible = true;
    const slotName = ['槽 1（靠近圆石）', '槽 2（中间）', '槽 3（靠近手）'];
    const step1 = () => this.panel('杠杆实验 · 1/3 猜一猜', '<p>船桨当撬棍，垫石当支点。垫石放进哪个槽，最省力？</p>' + slotName.map((n, i) => `<p><button data-a="g${i}" style="width:100%;text-align:left">${n}</button></p>`).join(''),
      { g0: () => { L.guess = 0; step2(); }, g1: () => { L.guess = 1; step2(); }, g2: () => { L.guess = 2; step2(); } });
    const RES = ['汤团一个人就撬起来了！', '一个人压不动……涵涵来帮忙，才撬动了一点。', '两个人都压不动。'];
    const step2 = (msg = '') => this.panel('杠杆实验 · 2/3 试一试', `<p>把垫石放进一个槽，让汤团压船桨。至少试两个槽。</p>${msg ? `<p class="seen">${msg}</p>` : ''}`
      + slotName.map((n, i) => `<p><button data-a="t${i}" style="width:100%;text-align:left">${L.tried.includes(i) ? '✓ ' : ''}放进${n}</button></p>`).join('')
      + `<p><button data-a="next" ${L.tried.length >= 2 ? '' : 'disabled'}>我知道为什么了</button></p>`,
      { t0: () => tryS(0), t1: () => tryS(1), t2: () => tryS(2), next: () => { if (L.tried.length >= 2) step3(); } });
    const tryS = (i: number) => { if (!L.tried.includes(i)) L.tried.push(i); this.leverRig.anim = { t: 0, slot: i }; step2(`${slotName[i]}：${RES[i]}`); };
    const step3 = () => this.panel('杠杆实验 · 3/3 说结论', '<p>哪句话说得对？</p>' + ['支点离石头越近，越省力', '支点越靠近手，越省力', '支点放在哪儿都一样'].map((t, i) => `<p><button data-a="c${i}" style="width:100%;text-align:left">${t}</button></p>`).join(''),
      { c0: () => fin(), c1: () => wrong(), c2: () => wrong() });
    const wrong = () => { this.stepErr++; step2('我们再看一眼：垫石在槽 1 的时候，汤团一个人就撬起来了。'); };
    const fin = () => { L.concl = 0; L.done = true; this.closePanel(); this.g.ui.say('paipai', '记进笔记了！支点离石头越近，越省力。', 2.6, undefined, true); this.g.ui.say('tangtuan', '那我去石龟那儿，把垫石放在离夹石最近的地方！', 2.8); this.save(); this.progress(); };
    step1();
  }
  private turtlePush() {
    const g = this.g, s = this.s, T = this.turtle;
    if (s.turtle) return;
    if (!s.lever.done) { g.ui.say(g.active, '夹石卡得太紧了……先去西边练习石试试怎么撬。', 2.6, undefined, true); this.stepErr++; return; }
    if (!s.fulcrum) {
      this.panel('支点放在哪里？', '<p>垫石放在龟壳旁的浅滩石上，离夹石：</p>' + ['近', '中', '远'].map((t, i) => `<p><button data-a="f${i}" style="width:100%;text-align:left">${t}</button></p>`).join(''), {
        f0: () => { s.fulcrum = true; T.fulcrum.visible = true; this.closePanel(); g.ui.say('tangtuan', '放好了，离夹石最近！', 2, undefined, true); this.save(); this.progress(); },
        f1: () => { this.closePanel(); this.stepErr++; g.ui.say('tangtuan', '压不动……支点离夹石再近一点？', 2.4, undefined, true); },
        f2: () => { this.closePanel(); this.stepErr++; g.ui.say('tangtuan', '完全压不动！想想刚才的实验。', 2.4, undefined, true); },
      }); return;
    }
    if (!T.heard || !T.seen) { g.ui.say('hanhan', !T.heard ? '先让北北到石龟西边按 Q 听听它的心跳。' : '派派到石龟东边按 Q，看看是哪里卡住了。', 2.8, undefined, true); this.stepErr++; return; }
    if (g.active !== 'tangtuan') { g.ui.say(g.active, '压船桨要汤团来——按 1 换汤团。', 2.2, undefined, true); return; }
    T.rhythm = { t: -1.4, beat: 0 };
    g.ui.say('beibei', '它的心跳慢下来了……我数：咚、咚，第三下压！', 2.6, undefined, true);
  }
  private turtlePress() {
    const T = this.turtle, g = this.g, Rh = T.rhythm!;
    if (Rh.beat < 3 || Rh.t < 2.4 - 0.25) { g.ui.countEnd('miss'); T.rhythm = null; this.stepErr++; g.ui.say('beibei', '早了一点……它又慌了。没关系，站好别动，再来一次（按 E）。', 3, undefined, true); return; }
    g.ui.countEnd('ok'); T.rhythm = null; this.calmTurtle(false);
  }
  private calmTurtle(quiet: boolean) {
    const g = this.g, s = this.s, T = this.turtle;
    s.turtle = true; if (!quiet) this.artTumble?.(); T.pop = quiet ? 1 : 0.0001; T.calm = quiet ? 1 : 0.0001;
    if (quiet) { T.stone.visible = false; }
    if (this.exitCol) { g.ph.remove(this.exitCol); this.cols.splice(this.cols.indexOf(this.exitCol), 1); this.exitCol = null; }
    g.ch2!.gates.turtle_rim.setOpen(true);
    if (!quiet) {
      g.ui.say('beibei', '这次听清了。慢一点，一起。', 2.4, undefined, true);
      g.ui.say('youyou', '它把背留给我们了！', 2.2);
      g.ui.say('hanhan', '大家跟上，出口就在北边。', 2.4);
      this.giveLeaf('beibei'); this.save(); this.progress();
    }
  }
  private updateTurtle(dt: number, t: number) {
    const T = this.turtle, g = this.g;
    if (T.rhythm) {
      const Rh = T.rhythm; Rh.t += dt;
      const words = ['咚——', '咚——', '压！'];
      while (Rh.beat < 3 && Rh.t >= Rh.beat * 1.2) { g.ui.count(words[Rh.beat], Rh.beat, 0.8); this.countHint(Rh.beat === 2 ? '现在按 E！' : '数到第三下按 E'); Rh.beat++; }
      if (Rh.t > 2.4 + 0.8) { g.ui.countEnd('miss'); T.rhythm = null; this.stepErr++; g.ui.say('beibei', '慢了一点……没关系，再来一次（按 E）。', 2.4, undefined, true); }
    }
    const tt = g.actors.tangtuan; if (tt) tt.interWant = T.rhythm ? 'push_stone' : null; // C12：数心跳时汤团推石
    if (this.s.turtle && this.local().z > EXIT_Z && this.s.stage === 'turtle') this.finish();
  }
  private finish() {
    const s = this.s, g = this.g; s.stage = 'done'; this.save();
    const m = Math.floor(g.ch2Time / 60), sec = Math.round(g.ch2Time % 60);
    g.ui.say('hanhan', '大家跟上，灯塔就在前面。', 2.4, undefined, true);
    this.panel('第二章 · 冲刷河岸 完成！', `<p>用时 ${m} 分 ${sec} 秒。光之叶：${s.leaves.map((id) => CHARS[id].name).join('、')}。</p><p>夜里，湖那边的灯塔一直没有亮……（第三章还在做）</p>`
      + '<p><button data-a="notes">看实验笔记</button> <button data-a="ch1">回到第一章</button> <button data-a="again">再玩一次第二章</button></p>', {
      notes: () => this.openNotes(), ch1: () => { this.closePanel(); g.enterChapter('ch1'); },
      again: () => { this.closePanel(); writeChapter('ch2', FRESH() as any); g.enterChapter('ch1'); g.enterChapter('ch2'); },
    });
  }

  // ======================= 道具动画 =======================
  private animProps(dt: number, t: number) {
    const S = this.sample, base = 0.62;
    if (S.anim) {
      S.anim.t += dt; const u = Math.min(1, S.anim.t / 1.2), e = 1 - Math.pow(1 - u, 3);
      const wy = S.anim.mode === 'weight';
      const target = { dry: base + (wy ? 0.03 : 0.07), soaked: base + (wy ? -0.35 : -0.05), slab: 0.12 };
      for (const k of ['dry', 'soaked', 'slab'] as const) { const m = S[k]; const from = S.anim.mode === 'drop' ? 0.95 : m.position.y; m.position.y = from + (target[k] - from) * e; m.position.x = COVE.x; m.position.z = m.userData.z; }
      S.w1.position.set(S.dry.position.x, S.dry.position.y + 0.14, S.dry.position.z); S.w2.position.set(S.soaked.position.x, S.soaked.position.y + 0.14, S.soaked.position.z);
      if (u >= 1) S.anim = null;
    }
    const L = this.leverRig;
    if (L.anim) { L.anim.t += dt; const u = Math.min(1, L.anim.t / 1.4); const amt = [0.35, 0.12, 0.0][L.anim.slot]; const sl = [-0.6, 0, 0.6][L.anim.slot];
      L.fulc.position.x = PRACTICE.x + sl; L.plank.position.x = PRACTICE.x + sl; L.plank.rotation.z = -Math.sin(u * Math.PI) * amt;
      const ball = this.root.getObjectByName('ch2_practice_ball')!; ball.position.y = 0.4 + Math.sin(u * Math.PI) * amt * 0.9; if (u >= 1) L.anim = null; }
    const T = this.turtle;
    if (!this.s.turtle) { T.body.rotation.y = Math.sin(t * 1.3) * 0.35; T.body.position.y = 0.7 + Math.sin(t * 2.6) * 0.08; T.stone.position.y = 1.55 + Math.sin(t * 2.6) * 0.08; }
    else {
      if (T.pop > 0 && T.pop < 1) { T.pop = Math.min(1, T.pop + dt / 1.2); T.stone.position.set(TURTLE.x + T.pop * 3.5, 1.55 + Math.sin(T.pop * Math.PI) * 1.5, TURTLE.z - 2.2 - T.pop * 2); if (T.pop >= 1) T.stone.visible = false; }
      T.calm = Math.min(1, T.calm + dt / 2); T.body.rotation.y *= 1 - Math.min(1, dt * 2); T.body.position.y = 0.7 + T.calm * 0.25 + Math.sin(t * 0.8) * 0.03;
    }
    if (this.beaconT > 0) { this.beaconT -= dt; (this.beacon.material as THREE.MeshBasicMaterial).opacity = Math.min(0.35, this.beaconT * 0.2) * (0.7 + Math.sin(t * 5) * 0.3); }
  }

  // ======================= C9 提示 =======================
  currentStep(): Step {
    const s = this.s, c = s.carry;
    switch (s.stage) {
      case 'tracks': return 'tracks';
      case 'spotted':
        if (this.window) return 'window';
        if (s.segs >= 3) return 'reunite';
        if (!this.posted.brace) return 'post_brace';
        if (!this.posted.lever) return 'post_lever';
        if (!this.sensed[s.segs]) return 'sense';
        return 'shout';
      case 'reunited':
        if (s.crafted) return 'board';
        if (!s.float.done && (c.dry + c.soaked > 0)) return 'float';
        if (!s.boathouse && !c.oar) return c.dry >= 4 && c.rope ? 'boathouse' : 'gather';
        if (c.dry >= 4 && c.rope && c.oar) return s.float.done ? 'craft' : 'float';
        return 'gather';
      case 'raft': { const R = this.raft; if (!R) return 'board'; return R.sec === 0 ? 'steer' : R.sec === 1 ? 'rocks' : 'paddle'; }
      case 'turtle':
        if (s.turtle) return 'exit';
        if (!s.lever.done) return 'lever';
        if (!s.fulcrum) return 'fulcrum';
        if (!this.turtle.heard || !this.turtle.seen) return 'see_stone';
        return 'heartbeat';
      default: return 'done';
    }
  }
  private hintTarget(st: Step): THREE.Vector3 | null {
    const s = this.s;
    switch (st) {
      case 'tracks': { const c = this.tracks.clues.find((x) => !x.found); return c ? c.local : null; }
      case 'post_brace': return BRACE; case 'post_lever': return LEVER;
      case 'sense': return s.segs === 0 ? SENSE_EAST : V(SEG_END_X[s.segs - 1], STONE_Z);
      case 'float': return COVE; case 'craft': return CRATE; case 'board': return DOCK; case 'boathouse': return BOATHOUSE_DOOR;
      case 'gather': { const m = MATS.find((x) => !s.taken.includes(x.id) && (x.kind !== 'soaked') && !(x.kind === 'oar' && !s.boathouse)); return m ? V(m.x, m.z) : BOATHOUSE_DOOR; }
      case 'lever': return PRACTICE; case 'fulcrum': case 'heartbeat': return PUSH_ST;
      case 'see_stone': return !this.turtle.heard ? TOUCH_ST : LOOK_ST;
      case 'exit': return V(40, 72);
      default: return null;
    }
  }
  /** 主动要提示（H 或「？」）：给当前卡点的下一级 */
  hint() {
    const st = this.currentStep(), tiers = HINTS[st], [who, text] = tiers[Math.min(this.tier, 2)];
    this.g.ui.say(who, text, 4.2, undefined, true);
    if (this.tier >= 1) { const p = this.hintTarget(st); if (p) { this.beacon.position.set(p.x, 3, p.z); this.beaconT = 8; } }
    this.tier = Math.min(this.tier + 1, 2); this.stepIdle = 0; this.stepErr = 0;
    this.lastHint = { step: st, tier: this.tier };
  }
  lastHint: { step: Step; tier: number } | null = null;
  /** 有进展：提示回到第一级 */
  private progress() { this.tier = 0; this.stepIdle = 0; this.stepErr = 0; }
  private updateHints(dt: number) {
    const st = this.currentStep();
    if (st !== this.step) { this.step = st; this.progress(); }
    if (this.panelEl || st === 'done' || st === 'window') return;
    this.stepIdle += dt;
    // 同一处试错 2 次，或 40 秒没有进展：自动给下一级
    if (this.stepErr >= 2 || this.stepIdle >= 40) this.hint();
  }

  // ======================= C10 实验笔记 =======================
  openNotes(page = 0) {
    const s = this.s, F = s.float, L = s.lever;
    const tabs = `<p><button data-a="p0" ${page === 0 ? 'class="on"' : ''}>第 1 页 · 浮力</button> <button data-a="p1" ${page === 1 ? 'class="on"' : ''}>第 2 页 · 杠杆</button></p>`;
    const box = (title: string, body: string) => `<div style="border:1.5px dashed #b49a6a;border-radius:10px;padding:8px 12px;margin:8px 0"><b>${title}</b><div style="margin-top:4px">${body}</div></div>`;
    let body = '';
    if (page === 0) {
      if (!F.done) body = '<p>还没做这个实验。在码头边的试水槽按 E。</p>';
      else body = box('我猜', F.guess && F.guess.length ? `能浮的是：${F.guess.join('、')}` : '我猜都会沉')
        + box('我看到', this.svgFloat()) + box('我的结论', '一样大的东西，越轻浮得越高，能驮的也越多。泡透的木头太重，不能做木筏。');
    } else {
      if (!L.done) body = '<p>还没做这个实验。到石龟浅滩西边的练习石按 E。</p>';
      else body = box('我猜', `垫石放在${['槽 1（靠近圆石）', '槽 2（中间）', '槽 3（靠近手）'][L.guess ?? 0]}最省力`)
        + box('我看到', this.svgLever(L.tried)) + box('我的结论', '支点离石头越近，越省力。');
    }
    this.panel('📒 实验笔记', tabs + body + '<p><button data-a="close">合上笔记</button></p>', { p0: () => this.openNotes(0), p1: () => this.openNotes(1), close: () => this.closePanel() });
  }
  private svgFloat() {
    const item = (x: number, y: number, c: string, label: string, w = false) => `<rect x="${x}" y="${y}" width="56" height="18" rx="3" fill="${c}"/>${w ? `<circle cx="${x + 28}" cy="${y - 7}" r="7" fill="#8b8b86"/>` : ''}<text x="${x + 28}" y="118" font-size="11" text-anchor="middle" fill="#3a3a2a">${label}</text>`;
    const tub = (ox: number, title: string, rows: string) => `<g transform="translate(${ox},0)"><text x="100" y="14" font-size="12" text-anchor="middle" fill="#3a3a2a">${title}</text><rect x="4" y="22" width="192" height="80" rx="6" fill="none" stroke="#7a5a32" stroke-width="2"/><rect x="6" y="50" width="188" height="50" fill="#9cc6cf" opacity=".7"/>${rows}</g>`;
    return `<svg viewBox="0 0 420 130" width="100%" style="max-width:520px">${tub(0, '放下水', item(14, 38, '#c9a774', '干浮木') + item(72, 46, '#6e5a42', '泡水木') + item(130, 80, '#8f8f8a', '石板'))}${tub(214, '加上配重', item(14, 44, '#c9a774', '干浮木', true) + item(72, 78, '#6e5a42', '泡水木', true) + item(130, 80, '#8f8f8a', '石板'))}</svg>`;
  }
  private svgLever(tried: number[]) {
    const res = [['一个人', '#6aa86a', 1], ['两个人', '#d6a84a', 0.55], ['压不动', '#c0634a', 0.12]] as const;
    const rows = [0, 1, 2].map((i) => { const [t, c, f] = res[i], y = 16 + i * 30, seen = tried.includes(i);
      return `<text x="4" y="${y + 12}" font-size="12" fill="#3a3a2a">槽 ${i + 1}</text><rect x="44" y="${y}" width="200" height="16" rx="4" fill="#eee4c8"/>${seen ? `<rect x="44" y="${y}" width="${200 * f}" height="16" rx="4" fill="${c}"/><text x="252" y="${y + 12}" font-size="12" fill="#3a3a2a">${t}就撬${i === 2 ? '' : '起来了'}</text>` : '<text x="252" y="' + (y + 12) + '" font-size="12" fill="#9a8a6a">没试</text>'}`; }).join('');
    return `<svg viewBox="0 0 400 110" width="100%" style="max-width:520px">${rows}</svg><div style="font-size:12px;color:#6a5a3a">横条越长，越省力（槽 1 靠近圆石，槽 3 靠近手）</div>`;
  }

  // ======================= 面板 =======================
  panel(title: string, html: string, acts: Record<string, (el: HTMLElement) => void>) {
    let el = this.panelEl;
    if (!el) {
      el = document.createElement('div'); el.id = 'ch2panel';
      el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;width:min(560px,92vw);max-height:86vh;overflow:auto;padding:18px 22px;border-radius:18px;background:rgba(246,239,220,.98);color:#24382b;font:16px/1.6 "PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.35);border:2px solid rgba(122,90,50,.7)';
      const st = document.createElement('style'); st.id = 'ch2panelcss';
      st.textContent = '#ch2panel button{padding:8px 14px;border-radius:10px;border:2px solid #7a5a32;background:#fffaf0;color:#24382b;font:600 15px sans-serif;cursor:pointer}#ch2panel button:hover{background:#f0e2bf}#ch2panel button:disabled{opacity:.45;cursor:default}#ch2panel button.on{background:#2f5a3e;color:#fff}#ch2panel .seen{background:#e8f0dc;border-radius:8px;padding:6px 10px}#ch2panel h3{margin:0 0 6px;font-size:19px}';
      if (!document.getElementById('ch2panelcss')) document.head.appendChild(st);
      el.addEventListener('mousedown', (e) => e.stopPropagation());
      document.body.appendChild(el); this.panelEl = el;
      (window as any).__qhdPanel = true; this.g.input.releaseLock?.();
    }
    el.innerHTML = `<h3>${title}</h3>${html}`;
    el.onclick = (e) => { const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b || b.disabled) return; e.stopPropagation(); const f = acts[b.dataset.a || '']; if (f) f(el!); };
  }
  closePanel() { this.panelEl?.remove(); this.panelEl = null; (window as any).__qhdPanel = false; }
  get panelOpen() { return !!this.panelEl; }

  // ======================= 左上目标 / 左下按键 =======================
  private objective() {
    const s = this.s, c = s.carry, st = this.currentStep();
    const n = this.tracks.clues.filter((x) => x.found).length;
    const tick = (b: boolean) => (b ? '✓' : '○');
    let t = '';
    switch (st) {
      case 'tracks': t = `跟着地上的痕迹找佑佑和北北：换派派（按 3），按 Q 用放大镜看（线索 ${n}/3）`; break;
      case 'post_brace': case 'post_lever': case 'sense': case 'shout':
        t = `分队救援（第 ${s.segs + 1}/3 段）：${tick(this.posted.brace)} 汤团顶撑杆 ${tick(this.posted.lever)} 佑佑守拉杆 ${tick(this.sensed[s.segs])} 北北摸稳石 → ${this.team === 'west' ? '涵涵' : '佑佑'}按 F 喊口令（G 换队）`; break;
      case 'window': t = `水退了！带北北走过第 ${(this.window?.k ?? 0) + 1} 段石头`; break;
      case 'reunite': t = '石头路通了：北北和佑佑走到西岸和大家汇合'; break;
      case 'gather': case 'boathouse': case 'float': case 'craft':
        t = `做木筏：${s.float.done ? `浮木 ${c.dry}/4` : `木头 ${c.dry + c.soaked}`} · 藤绳 ${tick(c.rope)} · 船桨 ${tick(c.oar)}${s.float.done ? '' : ' · 先在试水槽试试哪种木头能浮'} → 码头木盒按 E`; break;
      case 'board': t = '木筏做好了：五个人到码头边，按 E 上筏'; break;
      case 'steer': case 'rocks': case 'paddle': t = `漂流（第 ${(this.raft?.sec ?? 0) + 1}/3 段）：佑佑掌舵 A / D，听口令按 F 划桨`; break;
      case 'lever': t = '石龟浅滩：先到西边练习石按 E，试试船桨怎么撬最省力'; break;
      case 'fulcrum': t = '把垫石放在石龟旁：汤团到南边按 E 选支点'; break;
      case 'see_stone': t = `了解石龟：${tick(this.turtle.heard)} 北北西边按 Q 听心跳 ${tick(this.turtle.seen)} 派派东边按 Q 看夹石`; break;
      case 'heartbeat': t = '帮石龟：汤团到南边按 E，北北数「咚、咚」，第三下按 E 压'; break;
      case 'exit': t = '石龟让路了：从北边出口出去'; break;
      default: t = '第二章完成！';
    }
    if (t !== this.lastObj) { this.g.ui.objective(t); this.lastObj = t; }
  }
  private lastObj = '';
  private updateKeys() {
    const g = this.g, s = this.s, k: [string, string][] = [];
    if (this.raft) { k.push(['A D', '掌舵'], ['F', '划桨（听口令）']); }
    else {
      k.push(['W A S D', '走（Shift 跑，空格跳）']);
      const ids = g.squad.map((_, i) => i + 1).join(' ');
      k.push([ids, '换人']);
      if (s.stage === 'spotted') k.push(['G', this.team === 'west' ? '换到对岸小队' : '换回西岸小队']);
      if (g.active === 'paipai') k.push(['Q', g.observing ? '收起放大镜' : '细节之眼']);
      if (g.active === 'beibei' && s.stage !== 'tracks') k.push(['Q', '触感']);
      if (s.stage !== 'tracks') k.push(['E', '互动'], ['F', '喊口令']);
    }
    k.push(['H', '提示'], ['N', '笔记']);
    g.ui.keys(k);
  }

  // ======================= 释放 =======================
  dispose() {
    this.disposed = true;
    this.restoreLook();
    { this.g.ui.bag([]); const el = document.getElementById('bag'); if (el) el.style.bottom = '20px'; }
    { const seen = new Set<unknown>(); for (const o of this.artObjs) { o.removeFromParent(); o.traverse((c) => { const m = c as THREE.Mesh; if (!m.isMesh) return; if ((m as any).isInstancedMesh) (m as unknown as THREE.InstancedMesh).dispose(); if (!seen.has(m.geometry)) { seen.add(m.geometry); m.geometry.dispose(); }
      for (const mt of ([] as THREE.Material[]).concat(m.material)) { if (seen.has(mt)) continue; seen.add(mt); for (const v of Object.values(mt)) if ((v as THREE.Texture)?.isTexture && !seen.has(v)) { seen.add(v); (v as THREE.Texture).dispose(); } mt.dispose(); } }); } this.artObjs = []; this.art = null; for (const t of this.artTex) t.dispose(); this.artTex = []; for (const [m, o] of this.artGround) m.material = o; this.artGround = []; for (const mx of this.artMixers) mx.stopAllAction(); this.artMixers = []; }
    // 文件缓存（THREE.Cache 留着原始 GLB 字节）：第二章专用的模型离开时一起清掉，下次进章节从浏览器缓存重新读
    for (const k of Object.keys((THREE.Cache as any).files)) if (/ch2_art|youyou|beibei/.test(k)) THREE.Cache.remove(k);
    const g = this.g;
    this.closePanel(); this.hud.remove(); g.ui.hold(null, 0); g.ui.countEnd();
    for (const c of this.cols) g.ph.remove(c); this.cols.length = 0;
    this.tracks.dispose(); this.kit.dispose();
    for (const a of this.extras) { a.dispose(g.ph); delete (g.actors as any)[a.def.id]; } this.extras = [];
    for (const x of this.geos) x.dispose(); for (const m of this.mats) m.dispose();
  }
}

export { CH2_SPAWN };

/** C12 岸线：把不跟风动的网格按材质合并（每段 100–190 个网格 → 几个），不改外观。风动节点（WIND_ 下面）不动 */
function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh || (m as any).isSkinnedMesh || !m.visible || Array.isArray(m.material)) return;
    for (let p: THREE.Object3D | null = m; p && p !== root; p = p.parent) if (/^WIND_|^ANIM_/.test(p.name) || !p.visible) return;
    const g = m.geometry, key = (m.material as THREE.Material).uuid + '|' + Object.keys(g.attributes).sort().map((k) => k + g.attributes[k].itemSize).join(',') + '|' + (g.index ? 'i' : 'n');
    let e = groups.get(key); if (!e) groups.set(key, (e = { mat: m.material as THREE.Material, geos: [], meshes: [] }));
    const c = g.clone(); for (const k of Object.keys(c.morphAttributes)) delete c.morphAttributes[k];
    // 压缩后的顶点是归一化整数（KHR_mesh_quantization），直接乘矩阵会被截到 ±1 → 先转成浮点
    for (const [k, at] of Object.entries(c.attributes) as [string, THREE.BufferAttribute][]) if (at.normalized || !(at.array instanceof Float32Array) || (at as any).isInterleavedBufferAttribute) {
      const n = at.count, sz = at.itemSize, f = new Float32Array(n * sz); for (let i = 0; i < n; i++) for (let j = 0; j < sz; j++) f[i * sz + j] = at.getComponent(i, j); c.setAttribute(k, new THREE.BufferAttribute(f, sz));
    }
    c.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); e.geos.push(c); e.meshes.push(m);
  });
  for (const e of groups.values()) {
    if (e.geos.length < 2) { for (const g of e.geos) g.dispose(); continue; }
    const merged = mergeGeometries(e.geos, false); for (const g of e.geos) g.dispose(); if (!merged) continue;
    const mm = new THREE.Mesh(merged, e.mat); mm.castShadow = true; mm.receiveShadow = true; mm.name = 'merged_static'; root.add(mm);
    for (const m of e.meshes) m.removeFromParent();
  }
}
