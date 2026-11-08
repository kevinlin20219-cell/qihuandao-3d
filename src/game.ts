import { alignBridgeGrip, bridgeRailPoint } from './codex/bridge_grip_ik';
import { setVineProgress } from './scene_manifest';
import * as THREE from 'three';
import { Physics } from './physics';
import { Actor } from './actor';
import { CHARS, CHAPTER1_SQUAD, CharId } from './data/characters';
import { ITEMS, takePickup, type ItemId } from './level/chapter1';
import { buildChapter1, Level, Pad, setWindSway } from './level/chapter1';
import { UI } from './ui';
import type { Input } from './input';

// 第一章样段的阶段
export enum Stage { Crossroads = 0, OpenVines = 1, Boulder = 2, Inspect = 3, ThreePoints = 4, Bridge = 5, Deer = 6, Done = 7 }

const OBJECTIVES: Record<Stage, string> = {
  [Stage.Crossroads]: '四处走走，找一条通往吊桥的路',
  [Stage.OpenVines]: '脚印通进了藤蔓里：拨开藤蔓',
  [Stage.Boulder]: '一块巨石挡住了上坡路：推开它',
  [Stage.Inspect]: '巨石下压着一块刻着齿轮的石板：看懂它',
  [Stage.ThreePoints]: '三处机关都派人守好，再喊口令（F），听到「一」一起动手',
  [Stage.Bridge]: '过吊桥。起风的时候停下，抓紧绳子',
  [Stage.Deer]: '苔鹿在疼：一人站上苔花让它低头，派派陪着它，趁它低头取下鹿角上的断木（E）',
  [Stage.Done]: '苔鹿让开了路',
};

const HINTS: Record<Stage, [CharId, string][]> = {
  [Stage.Crossroads]: [
    ['paipai', '那边的藤蔓下面……地上好像有什么？'],
    ['hanhan', '派派，用你的放大镜看看北边的藤蔓（按 3 换成派派，再按 Q）。'],
    ['paipai', '走到北边藤蔓前，按 Q 举起放大镜，脚印就会亮起来。'],
  ],
  [Stage.OpenVines]: [
    ['paipai', '脚印一直通到藤蔓后面……'],
    ['hanhan', '走到藤蔓前面，按 E 把它拨开。'],
    ['hanhan', '站到藤蔓正前方，按 E。'],
  ],
  [Stage.Boulder]: [
    ['tangtuan', '这块石头……我好像推得动。'],
    ['hanhan', '只有汤团推得动重东西，按 1 换成汤团。'],
    ['tangtuan', '用汤团贴着巨石，按住 E 再往前走（W）。'],
  ],
  [Stage.Inspect]: [
    ['tangtuan', '石板上的齿轮纹……我想看看它连着什么。'],
    ['paipai', '汤团，你最懂机关了。'],
    ['tangtuan', '用汤团站到石板旁边，按 Q 看透机关。'],
  ],
  [Stage.ThreePoints]: [
    ['hanhan', '三个地方要同时有人……一个人分不开身，我来安排。'],
    ['hanhan', '按 2 换成涵涵，走到一个机关旁边按 Q，就能派一位伙伴过来守着。'],
    ['hanhan', '涵涵走到绞盘旁按 Q 派汤团，走到配重石旁按 Q 派派派，自己站到绳扣上；按 F 喊口令，喊到「一」的时候按 E。'],
  ],
  [Stage.Bridge]: [
    ['paipai', '风来之前，我会先感觉到……'],
    ['hanhan', '画面边上亮起橙光就是要起风了，松开按键停下来。'],
    ['hanhan', '橙光出现时不要按移动键，等风过去再走。'],
  ],
  [Stage.Deer]: [
    ['paipai', '它不是生气……鹿角上卡着断木，它很疼。'],
    ['hanhan', '它太高了够不着。苔花能让它低头——派一个人站上苔花，派派站到它身边安抚它（F 派人）。'],
    ['hanhan', '站到苔花旁按 F 派人守苔花，到粉色圈旁按 F 派派派；苔鹿低头的几秒里，走到它面前按 E 取下断木。'],
  ],
  [Stage.Done]: [['hanhan', '我们过来了！'], ['hanhan', '我们过来了！'], ['hanhan', '我们过来了！']],
};

/** 正面镜头往角色自己右侧偏的角度（弧度）：派派的美乐蒂挂在书包右下角（0054 / 0085） */
const FRONT_BIAS: Partial<Record<CharId, number>> = { paipai: 25 * Math.PI / 180 };

interface Save { stage: Stage; cp: string; leaves: CharId[]; time: number; falls: number; gate?: boolean; bag?: ItemId[]; got?: ItemId[]; rope?: boolean; }

const ROPE_OBJECTIVE = '绳扣的钩子断了：找到铁钩和结实的藤条，到桥头木盒做一个钩绳，装到绳扣上';
const ROPE_HINTS: [CharId, string][] = [
  ['tangtuan', '绳扣上的钩子断了……得自己做一个新的。'],
  ['paipai', '西边悬崖那里，好像有个铁钩子……藤蔓那边掉了一截藤条。'],
  ['hanhan', '西边观景台的木桩上有铁钩，北边藤蔓原来的地方有藤条。两样都拿到，到桥头木盒按 E 做钩绳，再到绳扣旁按 E 装上。'],
];

const GATE_OBJECTIVE = '石门上有两块踏石：派一个伙伴踩另一块（F），再喊口令一起踩下去';
const GATE_HINTS: [CharId, string][] = [
  ['tangtuan', '咦，我踩下去门只开了一条缝……一松脚又关上了。'],
  ['hanhan', '两块踏石要同时有人。站到一块上按 F，叫一个人去踩另一块。'],
  ['hanhan', '站上左边或右边的踏石按 F 派人；两块都有人后再按 F 喊口令，喊到「一」时按 E。'],
];
/** 推石动作契约（Codex 0055）：汤团根到球心的水平距离、推动速度 */
const PUSH_ROOT_TO_CENTER = 1.676;
const PUSH_SPEED = 1.1;
const SAVE_KEY = 'qhd3d_ch1_slice_v1';

export class Game {
  pickHide: { g: THREE.Object3D; t: number } | null = null;
  pickSlide: { from: THREE.Vector3; to: THREE.Vector3; t: number; yaw: number } | null = null;
  ph: Physics;
  scene: THREE.Scene;
  ui: UI;
  input: Input;
  level: Level;
  actors: Record<string, Actor> = {};
  squad: CharId[] = CHAPTER1_SQUAD.slice();
  active: CharId = 'tangtuan';
  stage: Stage = Stage.Crossroads;
  leaves: CharId[] = [];
  cp = 'start';
  time = 0;
  falls = 0;
  observing = false;
  pushing = false;
  /** 背包（全队共用，最多 6 格） */
  bag: ItemId[] = [];
  /** 汤团贴着巨石按住 E（撑住）；pushing = 同时往前推 */
  bracing = false;
  hintLevel = 0;
  idleT = 0;
  stageT = 0;
  // 风
  wind = { phase: 'calm' as 'calm' | 'warn' | 'gust', t: 4, strength: 0 };
  respawning = 0;
  cinematic: { t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; look: THREE.Vector3; onDone?: () => void; onTick?: (u: number) => void } | null = null;
  private crumbs: THREE.Vector3[] = [];
  /** 口令倒数：t 从 0 开始，第 0/1/2 秒依次喊「三、二、一」，「一」前后 shoutWin 秒内按 E 算对 */
  shout: { t: number; beat: number; target: 'bridge' | 'gate' } | null = null;
  get gateOpen() { return this.level.gate.opening; }
  shoutWin = 0.6; // 宽松；以后做成设置（宽松 / 标准 / 挑战）
  shoutFails = 0;
  private xrayT = 0;
  private boulderRoll = -1;
  private vineOpen = -1;
  onDone?: () => void;
  // 测试与调试用
  stats = { maxFrameMs: 0 };

  constructor(ph: Physics, scene: THREE.Scene, ui: UI, input: Input) {
    this.ph = ph; this.scene = scene; this.ui = ui; this.input = input;
    this.level = buildChapter1(scene, ph);
    this.ui.bag([]);
    const s = this.level.checkpoints.start.pos;
    this.squad.forEach((id, i) => {
      this.actors[id] = new Actor(CHARS[id], ph, scene, s.clone().add(new THREE.Vector3((i - 1) * 1.2, 0, i === 1 ? 0 : 0.8)));
    });
  }

  get leader() { return this.actors[this.active]; }
  followers() { return this.squad.filter((id) => id !== this.active).map((id) => this.actors[id]); }

  // ---------- 存档 ----------
  hasSave(): boolean { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
  noSave = false;
  save() {
    if (this.noSave) return; // ?jump 测试时不覆盖孩子的存档
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ stage: this.stage, cp: this.cp, leaves: this.leaves, time: this.time, falls: this.falls, gate: this.gateOpen, bag: this.bag, got: this.level.pickups.filter((pk) => pk.taken).map((pk) => pk.id), rope: this.level.ropeclipFix.fixed } as Save)); } catch { /* 无痕窗口等情况下不保存 */ }
  }
  clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } }
  load(): boolean {
    let s: Save | null = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { s = null; }
    if (!s) return false;
    this.leaves = s.leaves || []; this.time = s.time || 0; this.falls = s.falls || 0;
    if (s.gate || s.stage > Stage.Crossroads) this.openGate(true);
    this.bag = (s.bag || []).slice();
    for (const pk of this.level.pickups) if ((s.got || []).includes(pk.id)) takePickup(pk);
    if (s.rope) this.fixRopeclip(true);
    this.ui.bag(this.bag.map((i) => ITEMS[i]));
    this.applyStage(s.stage, true);
    this.cp = s.cp in this.level.checkpoints ? s.cp : 'start';
    this.respawnAll();
    return true;
  }

  /** 进入某个阶段（读档时 silent = true，直接把场景摆到该阶段的样子）。 */
  applyStage(st: Stage, silent = false) {
    const L = this.level;
    if (st >= Stage.OpenVines) L.vine.footprints.forEach((f) => ((f.material as THREE.MeshBasicMaterial).opacity = 0.55));
    if (st >= Stage.Boulder && silent) this.removeVines(true);
    if (st >= Stage.Inspect && silent && !L.boulder.gone) { this.ph.world.removeRigidBody(L.boulder.body); L.boulder.mesh.visible = false; L.boulder.gone = true; L.winch.mesh.visible = true; }
    if (st >= Stage.Bridge && silent) { L.bridge.raised = 1; this.makeBridgeColliders(); this.openBridgeGates(); L.bridge.ropes.visible = true; }
    this.stage = st; this.stageT = 0; this.hintLevel = 0;
    this.ui.objective(OBJECTIVES[st]);
    if (!silent) this.save();
  }

  // ---------- 主循环 ----------
  update(dt: number, t: number, camYaw: number, camFwd: THREE.Vector3) {
    this.time += dt; this.stageT += dt;
    if (this.stage >= Stage.Inspect) this.level.roam?.releaseBoulder(this.ph); // 巨石推走以后，坡两侧可以走
    const inp = this.input;
    const L = this.level;
    const lead = this.leader;
    if (this.pickHide && (this.pickHide.t -= dt) <= 0) { this.pickHide.g.visible = false; this.pickHide = null; }
    if (this.pickSlide) { // 捡铁钩：0.25 秒挪到站位，到位后蹲拿
      const S = this.pickSlide; S.t += dt; const k = Math.min(1, S.t / 0.25);
      this.leader.teleport(S.from.clone().lerp(S.to, k), S.yaw);
      if (k >= 1) { this.pickSlide = null; this.leader.interactOnce('crouch_grab_rope'); }
    }
    const locked = !!this.cinematic || this.respawning > 0 || !!this.pickSlide;

    // 切换角色
    for (let i = 0; i < this.squad.length; i++) if (inp.pressed('Digit' + (i + 1))) this.switchTo(this.squad[i]);
    if (inp.pressed('Tab')) this.quickSwitch();
    if (inp.pressed('KeyH')) this.hint();
    if (inp.pressed('Enter')) this.ui.skipLine();
    if (inp.pressed('KeyF')) { if (!this.startShout()) this.ui.skipLine(); }

    // 移动输入（相对镜头）
    const f = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const wish = new THREE.Vector3();
    if (!locked) {
      if (inp.down('KeyW') || inp.down('ArrowUp')) wish.add(f);
      if (inp.down('KeyS') || inp.down('ArrowDown')) wish.sub(f);
      if (inp.down('KeyD') || inp.down('ArrowRight')) wish.add(r);
      if (inp.down('KeyA') || inp.down('ArrowLeft')) wish.sub(r);
    }
    const moving = wish.lengthSq() > 0;
    if (moving) wish.normalize();
    let speed = inp.down('ShiftLeft') || inp.down('ShiftRight') ? lead.def.run : lead.def.walk;
    if (this.observing) speed *= 0.5;

    // 推巨石
    this.pushing = false; this.bracing = false;
    if (this.stage === Stage.Boulder && !L.boulder.gone && this.boulderRoll < 0) this.updateBoulderPush(dt, wish, moving);
    if (this.bracing) {
      // 贴住巨石：按动作的接触契约把汤团放在球心后方 1.676 m、正对巨石；推动时跟着球走，不推时只撑住不动
      const B = L.boulder, P0 = lead.pos;
      const target = new THREE.Vector3(B.mesh.position.x, P0.y, B.mesh.position.z + PUSH_ROOT_TO_CENTER);
      const corr = target.sub(P0).multiplyScalar(6); corr.y = 0;
      if (corr.length() > 1.5) corr.setLength(1.5);
      wish.set(0, 0, this.pushing ? -PUSH_SPEED : 0).add(corr); speed = 1;
      lead.yaw = Math.PI;
    }
    lead.lockYaw = this.bracing;

    // 风中吊桥
    const onBridge = (p: THREE.Vector3) => p.z < L.bridge.startZ + 0.3 && p.z > L.bridge.endZ - 0.3 && Math.abs(p.x) < 1.4;
    this.updateWind(dt, onBridge(lead.pos) || this.followers().some((a) => onBridge(a.pos)));
    const gust = this.wind.phase === 'gust';
    if (gust && onBridge(lead.pos) && moving && !locked) { this.stumble(); }

    lead.pose = this.bracing ? 'push' : this.observing ? 'observe' : gust && onBridge(lead.pos) ? 'brace' : 'idle';
    lead.interWant = null; // 0137 的 brace_door 是双手撑门板，桥上顶风前面没有门，仍用原来的程序化顶风姿势
    if (this.gripRail(lead, gust && onBridge(lead.pos) && !moving && !locked, dt)) lead.pose = 'idle';
    lead.move(dt, wish.multiplyScalar(locked || (gust && onBridge(lead.pos)) ? 0 : speed), !locked && inp.pressed('Space'));
    // 推石：接近到 20 cm 以内后直接贴到契约位置，跟着球走，不靠物理慢慢追（否则手掌会插进石头或悬空）
    lead.pushMoving = this.pushing;
    if (this.bracing) {
      const B = L.boulder, tz = B.mesh.position.z + PUSH_ROOT_TO_CENTER, tx = B.mesh.position.x;
      if (Math.hypot(lead.pos.x - tx, lead.pos.z - tz) < 0.2) lead.snapXZ(tx, tz, 0, this.pushing ? -PUSH_SPEED : 0);
    }

    // 跟随
    this.updateFollowers(dt, gust, onBridge);

    // 本领与互动
    if (!locked) {
      if (inp.pressed('KeyQ')) this.useSkill(camFwd);
      if (inp.pressed('KeyE')) this.interact();
    }
    if (this.observing && (moving && lead.def.id !== 'paipai')) this.observing = false;

    // 各阶段逻辑
    this.updateStage(dt, t);

    // 掉落
    for (const a of Object.values(this.actors)) {
      if (a.pos.y < -5 && this.respawning <= 0) { this.falls++; this.respawnSoon(a === lead ? 'hanhan' : null, '小心！先回到安全的地方。'); break; }
    }
    if (this.respawning > 0) { this.respawning -= dt; if (this.respawning <= 0.35 && this.respawning + dt > 0.35) this.respawnAll(); if (this.respawning <= 0) this.ui.fade(false); }

    // 检查点
    const z = lead.pos.z;
    const cpOrder: [string, (p: THREE.Vector3) => boolean][] = [
      ['north', (p) => p.z < -13 && this.stage >= Stage.Boulder],
      ['slope', (p) => p.z < -26 && p.y > 1],
      ['bridgehead', (p) => p.z < -39.5 && p.y > 1],
      ['bridge2', (p) => p.z < -58 && onBridge(p)],
      ['bridge3', (p) => p.z < -65 && onBridge(p)],
      ['far', (p) => p.z < -73.5 && p.y > 1],
    ];
    for (const [id, test] of cpOrder) {
      if (test(lead.pos) && this.cpIndex(id) > this.cpIndex(this.cp)) { this.cp = id; this.save(); }
    }
    if (this.stage === Stage.Bridge && z < -51 && this.cpIndex(this.cp) < this.cpIndex('bridge1')) this.cp = 'bridge1';

    // 闲置提示：30 秒没有进展，跟随的伙伴给第 1 级提示
    this.idleT += dt;
    if (moving) this.idleT = Math.min(this.idleT, 25);
    // 用户（11-08）：以前不管人在哪都说本阶段的第一句（过了石门没走到藤蔓也说藤蔓、过了藤蔓往回走又说巨石）。
    // 现在只在走到本阶段要做事的地方附近才自动提示；不在附近就不说（按 H 仍可随时要提示）
    if (this.idleT > 30 && this.stage < Stage.Done && !this.ui.busy()) {
      this.idleT = 0;
      const tg = this.hintTarget();
      if (tg && Math.hypot(lead.pos.x - tg.x, lead.pos.z - tg.z) < tg.r) {
        const tiers = !this.gateOpen && this.stage === Stage.Crossroads ? GATE_HINTS : this.stage === Stage.ThreePoints && !this.level.ropeclipFix.fixed ? ROPE_HINTS : HINTS[this.stage];
        const [who, text] = tiers[0]; this.ui.say(who, text);
      }
    }

    // 同步外观
    for (const a of Object.values(this.actors)) { a.sync(dt, t); a.setActiveLook(a === lead); }
    L.update(dt, t);
    for (const a of Object.values(this.actors)) alignBridgeGrip(THREE, a, this.grips.get(a), L.bridge);
    if (this.xrayT > 0) { this.xrayT -= dt; const o = Math.max(0, Math.min(1, this.xrayT)); L.winch.beams.forEach((b) => ((b.material as THREE.MeshBasicMaterial).opacity = 0.7 * o)); if (this.xrayT <= 0) this.ui.xray(null); }
    this.updateKeys(onBridge(lead.pos));
  }

  cpIndex(id: string) { return ['start', 'north', 'slope', 'bridgehead', 'bridge1', 'bridge2', 'bridge3', 'far'].indexOf(id); }

  switchTo(id: CharId) {
    if (id === this.active || this.bracing) return;
    this.observing = false; this.ui.observe(false); this.ui.crosshair(false);
    const prev = this.leader;
    if (this.stage === Stage.ThreePoints) {
      const pad = this.level.pads.find((pd) => pd.pos.distanceTo(prev.pos) < 0.85 && (!pd.need || pd.need === prev.def.id));
      if (pad) { prev.goal = pad.pos.clone(); prev.holding = true; this.ui.say(prev.def.id, `我守在${pad.name}这儿。`, 1.8, undefined, true); }
    }
    const a = this.actors[id]; a.goal = null; a.holding = false;
    this.active = id;
    this.crumbs = [];
    this.ui.party(this.squad, id);
  }

  /** Tab：换成当前情况最需要的伙伴 */
  quickSwitch() {
    const want: Partial<Record<Stage, CharId>> = { [Stage.Crossroads]: 'paipai', [Stage.Boulder]: 'tangtuan', [Stage.Inspect]: 'tangtuan', [Stage.ThreePoints]: 'hanhan' };
    const w = want[this.stage];
    if (w && w !== this.active) { this.switchTo(w); this.ui.say(w, '我来！', 1.6, undefined, true); }
    else { const i = this.squad.indexOf(this.active); this.switchTo(this.squad[(i + 1) % this.squad.length]); }
  }

  /** 本阶段要做事的地方（自动提示只在这附近说）：x、z 和半径 */
  hintTarget(): { x: number; z: number; r: number } | null {
    const L = this.level;
    switch (this.stage) {
      case Stage.Crossroads: return this.gateOpen ? { x: 0, z: -15, r: 12 } : { x: 0, z: 15, r: 12 }; // 门没开：石门；开了：北边藤蔓
      case Stage.OpenVines: return { x: 0, z: -15, r: 10 };
      case Stage.Boulder: { const p = L.boulder.mesh.position; return { x: p.x, z: p.z, r: 10 }; }
      case Stage.Inspect: return { x: L.winch.pos.x, z: L.winch.pos.z, r: 10 };
      case Stage.ThreePoints: return this.level.ropeclipFix.fixed ? { x: 0, z: -44, r: 12 } : { x: -4, z: -36, r: 30 }; // 钩绳要四处找材料，范围大
      case Stage.Bridge: return { x: 0, z: -52, r: 14 };
      case Stage.Deer: return { x: 0, z: -84, r: 14 };
      default: return null;
    }
  }

  hint() {
    const tiers = !this.gateOpen && this.stage === Stage.Crossroads ? GATE_HINTS : this.stage === Stage.ThreePoints && !this.level.ropeclipFix.fixed ? ROPE_HINTS : HINTS[this.stage];
    const [who, text] = tiers[Math.min(this.hintLevel, tiers.length - 1)];
    this.ui.say(who, text, 4.5, undefined, true);
    this.hintLevel = Math.min(this.hintLevel + 1, tiers.length - 1);
    this.idleT = 0;
  }

  // ---------- 本领 ----------
  useSkill(camFwd: THREE.Vector3) {
    const L = this.level, lead = this.leader, p = lead.pos;
    switch (this.active) {
      case 'paipai': {
        this.observing = !this.observing;
        this.ui.observe(this.observing);
        if (this.observing && this.stage === Stage.Crossroads && p.distanceTo(new THREE.Vector3(0, 0, -11)) < 7.5) {
          this.ui.say('paipai', '地上有脚印……一直通进藤蔓里。后面有路！', 3.5, undefined, true);
          this.applyStage(Stage.OpenVines);
        } else if (this.observing && this.stage === Stage.Crossroads) {
          this.ui.say('paipai', '这边没什么……再到别处看看。', 2.4, 'pp_nothing_' + Math.round(p.x / 8) + Math.round(p.z / 8));
        }
        break;
      }
      case 'tangtuan': {
        if (this.stage === Stage.Inspect && p.distanceTo(L.winch.pos) < 3) this.inspectWinch();
        else if (this.stage >= Stage.Inspect && p.distanceTo(L.winch.pos) < 3) this.inspectWinch(true);
        else {
          // 蓄力推掌（只做表现，不加新的推力规则）
          lead.playOnce('skill_push_wave');
          this.ui.say('tangtuan', ['嘿！', '没什么能推的……', '这里用不上推力。'][Math.floor(Math.random() * 3)], 1.4, undefined, true);
        }
        break;
      }
      case 'hanhan': this.command(camFwd); break;
    }
  }

  /** F：所有机关都有人时开始倒数 */
  startShout(): boolean {
    if (this.shout || this.cinematic) return false;
    const G = this.level.gate, lp = this.leader.pos;
    // v55（用户 2026-11-01）：派伙伴、喊口令这类大家合力的事，只能由涵涵发起
    const wantsTeam = (!G.opening && lp.z > 13.5) || this.stage === Stage.Deer || this.stage === Stage.ThreePoints;
    if (wantsTeam && this.active !== 'hanhan') { this.ui.say(this.active, '大家一起做的事，得涵涵来安排——按 2 换成涵涵。', 2.6, 'team_need_hanhan', true); return true; }
    if (!G.opening && lp.z > 13.5) {
      if (G.pads.every((pd) => pd.occupant)) { this.shout = { t: this.flagLead(), beat: 0, target: 'gate' }; return true; }
      this.postToGate(); return true;
    }
    if (this.stage === Stage.Deer) { this.postToDeer(); return true; }
    if (this.stage !== Stage.ThreePoints) return false;
    if (this.level.pads.filter((p) => p.occupant).length < 3) { this.ui.say('hanhan', '还有机关没人守，先派好人再喊。', 2.4, undefined, true); return true; }
    this.shout = { t: this.flagLead(), beat: 0, target: 'bridge' };
    return true;
  }
  /** 找物品做工具：捡材料 / 在工作台组合 / 把工具装到障碍上。有事做就返回 true */
  itemInteract(): boolean {
    const L = this.level, p = this.leader.pos;
    const near = L.pickups.find((pk) => pk.visible && !pk.taken && Math.hypot(pk.pos.x - p.x, pk.pos.z - p.z) < 1.6 && Math.abs(pk.pos.y - p.y) < 1.2);
    if (near) {
      if (this.bag.length >= 6) { this.ui.say(this.active, '背包满了。', 1.6, undefined, true); return true; }
      takePickup(near); this.bag.push(near.id); this.ui.bag(this.bag.map((i) => ITEMS[i]));
      if (near.id === 'iron_hook') { near.item.visible = true; this.pickHide = { g: near.item, t: 0.25 + 0.75 }; } // 手碰到再收起
      if (near.id === 'iron_hook') { // 0137 蹲拿：双手在身前 0.36 m、离地约 0.67 m，正好是木桩上铁钩的高度。先小步挪到这个距离再蹲
        const d = new THREE.Vector3(p.x - near.pos.x, 0, p.z - near.pos.z); if (d.lengthSq() < 1e-4) d.set(0, 0, 1);
        const to = near.pos.clone().add(d.normalize().multiplyScalar(0.45)); to.y = p.y; // 0.45 m：手落在桩顶铁钩上，身体不插进木桩
        this.pickSlide = { from: new THREE.Vector3(p.x, to.y, p.z), to, t: 0, yaw: Math.atan2(near.pos.x - to.x, near.pos.z - to.z) };
      } // 藤条卷放在地上，蹲拿的手够不到地面，不播
      this.ui.toast(`拿到了：${ITEMS[near.id].name}`, 2.5);
      const lines: Record<string, string> = { iron_hook: '一个旧铁钩！说不定用得上。', vine_rope: '这截藤条好结实。' };
      this.ui.say(this.active, lines[near.id] || '捡到了。', 2, undefined, true);
      this.save(); return true;
    }
    if (p.distanceTo(L.workbench.pos) < 1.8) {
      if (this.bag.includes('hook_rope')) { this.ui.say(this.active, '钩绳已经做好了，去绳扣那里装上吧。', 2.2, undefined, true); return true; }
      const has = (i: ItemId) => this.bag.includes(i);
      if (has('iron_hook') && has('vine_rope')) {
        this.bag = this.bag.filter((i) => i !== 'iron_hook' && i !== 'vine_rope'); this.bag.push('hook_rope'); this.ui.bag(this.bag.map((i) => ITEMS[i]));
        this.ui.toast('做好了：钩绳（铁钩 + 结实的藤条）', 3);
        this.ui.say(this.active, this.active === 'tangtuan' ? '绑紧、打个死结——钩绳做好了！' : '做好了！钩绳！', 2.4, undefined, true);
        this.leader.playOnce('inspect_mechanism');
        this.save(); return true;
      }
      if (this.stage >= Stage.ThreePoints && !L.ropeclipFix.fixed) {
        const miss = [!has('iron_hook') && '铁钩', !has('vine_rope') && '结实的藤条'].filter(Boolean).join('和');
        this.ui.say(this.active, `做钩绳还差${miss}。`, 2.4, undefined, true); return true;
      }
      return false;
    }
    const clip = L.pads.find((pd) => pd.id === 'ropeclip')!;
    if (!L.ropeclipFix.fixed && this.stage >= Stage.ThreePoints && p.distanceTo(clip.pos) < 2.0) {
      if (this.bag.includes('hook_rope')) {
        this.bag = this.bag.filter((i) => i !== 'hook_rope'); this.ui.bag(this.bag.map((i) => ITEMS[i]));
        this.fixRopeclip(false); return true;
      }
      this.ui.say(this.active, '绳扣的钩子断了，得先做一个钩绳。', 2.4, undefined, true); return true;
    }
    return false;
  }
  fixRopeclip(instant: boolean) {
    const F = this.level.ropeclipFix;
    F.fixed = true;
    F.broken.visible = false; F.fixedVis.visible = true;
    if (!instant) {
      this.ui.toast('绳扣修好了', 2.5);
      this.ui.say(this.active, '装上了！绳扣能用了。', 2.2, undefined, true);
      this.ui.objective(OBJECTIVES[this.stage]);
      this.save();
    }
  }

  /** 过桥后遇到苔鹿 */
  meetDeer() {
    this.applyStage(Stage.Deer);
    this.save();
    this.ui.say('paipai', '那头鹿……它挡着路，一直在跺脚。', 3, undefined, true);
    this.ui.say('tangtuan', '让我把它推开——', 2);
    this.ui.say('paipai', '等等！它不是生气……它鹿角上卡着断木，它很疼。', 3.4);
    this.ui.say('hanhan', '它太高了够不着。地上那两丛苔花，它好像很想闻。', 3.2);
  }
  /** 苔鹿阶段按 F：在苔花旁派人守苔花；在粉色圈旁派派派 */
  postToDeer() {
    const L = this.level, D = L.deerState, lp = this.leader.pos;
    const pads = [...L.lures, D.calmPad];
    let best: Pad | null = null, bd = 3.2;
    for (const pd of pads) { const d = pd.pos.distanceTo(lp); if (d < bd) { bd = d; best = pd; } }
    if (!best) { this.ui.say(this.active, '走到苔花或者苔鹿身边的粉色圈旁，再派人。', 2.4, undefined, true); return; }
    const fol = this.followers();
    const here = fol.find((a) => a.goal && a.goal.distanceTo(best!.pos) < 0.1);
    if (here) { here.goal = null; here.holding = false; this.ui.say(this.active, `${here.def.name}，先回来。`, 1.6, undefined, true); return; }
    const pick = best.need ? fol.find((a) => a.def.id === best!.need && !a.goal) : (fol.find((a) => !a.goal && a.def.id !== 'paipai') || fol.find((a) => !a.goal));
    if (!pick) { this.ui.say(this.active, best.need ? '派派得过来才行……（派派是领队时，自己站上粉色圈）' : '没有空着的人了。', 2.4, undefined, true); return; }
    pick.goal = best.pos.clone(); pick.holding = false;
    this.leader.faceTo(best.pos); if (this.active === 'hanhan') this.leader.playCommand(); else this.leader.playOnce('call_signal_raise'); // 0137：其他人派人时举手打信号
    this.ui.say(this.active, best.id === 'calm' ? '派派，去它身边，轻轻的。' : `${pick.def.name}，站到苔花上！`, 2, undefined, true);
    this.ui.say(pick.def.id, pick.def.id === 'paipai' ? '嗯……不怕，不怕。' : '好！', 1.6);
  }
  /** 苔鹿：苔花有人 → 低头（最多 4 秒，之后苔花合上 2.5 秒）；派派在身边 → 不乱甩头 */
  updateDeer(dt: number, t: number) {
    const L = this.level, D = L.deerState, P = L.deerParts;
    if (D.freed && L.deerVis) { // 0171：抬头 → 平静 → 让路（动作自带位移和转向，不再平移鹿组）
      this.deerModel(dt, false, true);
      if (L.deerFx) { const u = L.deerFx.userData; u.a = Math.min(1, (u.a ?? 0) + dt * 0.5); (L.deerFx.material as THREE.SpriteMaterial).opacity = 0.75 * u.a * (0.85 + Math.sin(t * 2.4) * 0.15); }
      if (L.deerVis.phase === 'done' && this.stage === Stage.Deer) this.finish();
      return;
    }
    if (D.freed) {
      D.leave = Math.min(1, D.leave + dt / 2.5);
      D.group.position.x = 3.6 * D.leave; D.group.rotation.y = -0.9 * D.leave;
      P.head.rotation.x = 0.35 * (1 - D.leave); P.head.rotation.y = 0;
      (P.moss.material as THREE.MeshStandardMaterial).emissive.setHex(0x8fdc5a);
      (P.aura.material as THREE.MeshBasicMaterial).opacity = 0;
      if (D.leave >= 1 && this.stage === Stage.Deer) this.finish();
      return;
    }
    const lured = L.lures.find((pd) => { pd.occupant = null; for (const a of Object.values(this.actors)) if (a.pos.distanceTo(pd.pos) < 0.85) pd.occupant = a.def.id; return !!pd.occupant; });
    const cp = D.calmPad; cp.occupant = null;
    const pp = this.actors.paipai;
    if (pp && pp.pos.distanceTo(cp.pos) < 0.9) cp.occupant = 'paipai';
    const calm = !!cp.occupant || (pp && pp === this.leader && pp.pos.distanceTo(new THREE.Vector3(0.3, 1.5, -83)) < 2.4);
    if (D.cool > 0) D.cool -= dt;
    let want = 0;
    if (lured && D.cool <= 0) {
      if (D.lureT <= 0) D.lureT = 4.0;
      D.lureT -= dt; want = 1; D.side = lured.pos.x > 0 ? 1 : -1;
      if (D.lureT <= 0) { D.cool = 2.5; want = 0; this.ui.say(lured.occupant!, '苔花合上了……等它再张开。', 2, 'lure_close'); }
    } else if (!lured) D.lureT = 0;
    D.low += (want - D.low) * Math.min(1, dt * 3);
    if (L.deerVis) { this.deerModel(dt, want > 0, calm); D.low = L.deerVis.phase === 'hold' ? 1 : L.deerVis.phase === 'enter' ? Math.min(1, L.deerVis.enterT / 1.8) : 0; }
    P.head.rotation.x = D.low * 1.5;
    P.head.rotation.y = D.low * D.side * 0.35;
    // 不安：没人安抚时甩头、身上泛红光
    const restless = calm ? 0 : 1;
    P.head.rotation.z = Math.sin(t * 7) * 0.12 * restless;
    (P.aura.material as THREE.MeshBasicMaterial).opacity = restless * (0.12 + Math.sin(t * 5) * 0.08);
    this.ui.hold(want > 0 && D.lureT > 0 ? `苔鹿低着头 · 还有 ${D.lureT.toFixed(1)} 秒` : null, want > 0 ? D.lureT / 4 : 0);
    if (lured && !calm) this.ui.say('paipai', '它还是很紧张……我去它身边陪着它。', 2.6, 'deer_need_calm');
  }
  /** 0171：苔鹿模型动作状态机。want = 苔花有人（要低头），calm = 派派在身边；freed 后走 抬头→平静→让路 */
  deerModel(dt: number, want: boolean, calm: boolean) {
    const V = this.level.deerVis!; V.mixer.update(dt); V.t += dt;
    const play = (n: string, fade = 0.35) => {
      if (V.cur === n) return; const a = V.acts[n]; if (!a) return;
      const prev = V.cur ? V.acts[V.cur] : null; a.reset().setEffectiveWeight(1).play(); a.timeScale = 1;
      if (prev) prev.crossFadeTo(a, fade, false); V.cur = n; V.t = 0;
    };
    const freed = this.level.deerState.freed;
    if (freed) {
      if (V.phase !== 'fexit' && V.phase !== 'calm' && V.phase !== 'leave' && V.phase !== 'done') { V.phase = 'fexit'; play('bow_exit', 0.3); }
      else if (V.phase === 'fexit' && V.t >= 1.8) { V.phase = 'calm'; play('calm_idle'); }
      else if (V.phase === 'calm') { if (V.t >= 1.0) { V.phase = 'leave'; play('leave_rootmotion', 0.4); } }
      else if (V.phase === 'leave') { this.level.deerState.leave = Math.min(1, V.t / 8.8); if (V.t >= 8.8) V.phase = 'done'; }
      return;
    }
    if (V.phase === 'idle' || V.phase === 'exit') {
      const be = V.acts.bow_enter;
      if (want && V.cur === 'bow_enter') { V.phase = 'enter'; be.timeScale = 1; be.paused = false; V.enterT = be.time; } // 倒放中又被叫低头：原地接着往下
      else if (want) { V.phase = 'enter'; V.enterT = 0; play('bow_enter', 0.3); }
      else if (V.phase === 'exit') { if (V.cur === 'bow_enter' ? be.time <= 0.01 : V.t >= 1.8) V.phase = 'idle'; }
      else play(calm ? 'idle_breathe' : 'hurt_idle', 0.5);
    } else if (V.phase === 'enter') {
      V.enterT += dt;
      if (!want) { V.phase = 'exit'; V.acts.bow_enter.timeScale = -1; } // 半低头中断：从当前姿势倒放回去，不硬切完整 bow_exit
      else if (V.enterT >= 1.8) { V.phase = 'hold'; play(calm ? 'bow_hold' : 'bow_restless', 0.3); }
    } else if (V.phase === 'hold') {
      if (!want) { V.phase = 'exit'; play('bow_exit', 0.3); }
      else play(calm ? 'bow_hold' : 'bow_restless', 0.5);
    }
  }
  /** E：苔鹿低着头、派派在身边时，取下鹿角上的断木 */
  tryFreeDeer(): boolean {
    const L = this.level, D = L.deerState, p = this.leader.pos;
    const front = new THREE.Vector3(0.3, 1.5, -83.2);
    if (Math.hypot(p.x - front.x, p.z - front.z) > 2.0) return false;
    if (D.low < 0.8) { this.ui.say(this.active, '太高了，够不着……得让它低下头。', 2.2, undefined, true); return true; }
    const calm = !!D.calmPad.occupant || this.active === 'paipai';
    if (!calm) { this.ui.say(this.active, '它一直甩头，靠不近……派派能让它安静下来。', 2.4, undefined, true); return true; }
    D.freed = true; this.ui.hold(null, 0);
    const P = L.deerParts;
    P.plank.parent?.remove(P.plank);
    if (L.deerVis) { if (L.deerVis.wood) L.deerVis.wood.visible = false; } // 先藏木，再抬头（动作在 deerModel 里接 bow_exit）
    if (P.collider) { this.ph.remove(P.collider); P.collider = null; }
    for (const a of this.followers()) { a.goal = null; a.holding = false; }
    this.ui.say(this.active, '取下来了！', 1.6, undefined, true);
    this.ui.say('paipai', '它不疼了……你看，鹿角上的苔花亮了。', 3);
    this.awardLeaf('paipai', '看出了苔鹿在疼');
    return true;
  }

  /** 石门前按 F：派最近的空闲伙伴去踩没人踩的那块踏石 */
  postToGate() {
    const G = this.level.gate, lp = this.leader.pos;
    const empty = G.pads.filter((pd) => !pd.occupant && !this.followers().some((a) => a.goal && a.goal.distanceTo(pd.pos) < 0.1));
    if (!empty.length) { this.ui.say(this.active, '两块踏石都有人去了，等他们站好。', 2, undefined, true); return; }
    // 优先派到领队没站着的那块
    empty.sort((a, b) => b.pos.distanceTo(lp) - a.pos.distanceTo(lp));
    const pad = empty.find((pd) => pd.pos.distanceTo(lp) > 0.9) || empty[0];
    const fol = this.followers().filter((a) => !a.goal).sort((a, b) => a.pos.distanceTo(pad.pos) - b.pos.distanceTo(pad.pos));
    const pick = fol[0];
    if (!pick) { this.ui.say(this.active, '大家都在忙。', 1.6, undefined, true); return; }
    pick.goal = pad.pos.clone(); pick.holding = false;
    this.leader.faceTo(pad.pos); if (this.active === 'hanhan') this.leader.playCommand(); else this.leader.playOnce('call_signal_raise');
    this.ui.say(this.active, `${pick.def.name}，你踩${pad.name}！`, 2, undefined, true);
    this.ui.say(pick.def.id, pick.def.id === 'paipai' ? '好、好的……' : pick.def.id === 'hanhan' ? '交给我。' : '好嘞！', 1.4);
  }
  /** 打开石门（读档时 instant） */
  openGate(instant = false) {
    const G = this.level.gate;
    if (G.opening) return;
    G.opening = true; G.crack = 0;
    if (instant) G.open = 1;
    if (G.collider) { this.ph.remove(G.collider); G.collider = null; }
    for (const a of this.followers()) if (a.goal && G.pads.some((pd) => a.goal!.distanceTo(pd.pos) < 0.1)) { a.goal = null; a.holding = false; }
    if (!instant) {
      this.ui.say('hanhan', '一起——！', 1.6, undefined, true);
      this.ui.say('tangtuan', '门开了！上面刻着字……', 2.2);
      this.ui.say('paipai', '「一个人打不开的门，是留给朋友的。」', 3.4);
      this.ui.say('tangtuan', '这是什么谜语？……先进去看看。', 2.6);
      this.ui.objective(OBJECTIVES[this.stage]);
      this.save();
    }
  }
  /** 石门：踏石占用、只一个人踩时开一条缝 */
  updateGate(dt: number) {
    const G = this.level.gate;
    if (G.opening) return;
    for (const pd of G.pads) { pd.occupant = null; for (const a of Object.values(this.actors)) if (a.pos.distanceTo(pd.pos) < 0.85) pd.occupant = a.def.id; }
    const n = G.pads.filter((pd) => pd.occupant).length;
    G.crack += ((n === 1 ? 0.07 : 0) - G.crack) * Math.min(1, dt * 4);
    if (!this.gateObjSet) { this.ui.objective(GATE_OBJECTIVE); this.gateObjSet = true; }
    if (n === 1 && G.pads.some((pd) => pd.occupant === this.active)) this.ui.say(this.active, '门开了一条缝……一个人不够。', 2.6, 'gate_crack');
    if (n === 2 && !this.shout) this.ui.say('hanhan', '两块都踩住了！喊口令（F），喊到「一」一起踩下去！', 3.2, 'gate_ready');
    if (this.leader.pos.distanceTo(G.plaque) < 3.2) this.ui.say('tangtuan', '门上刻着字，看不清……得先把门打开。', 2.6, 'gate_plaque');
  }
  private gateObjSet = false;
  /** 口令倒数（石门和吊桥共用） */
  /** v56：涵涵举旗后才开始数「三、二、一」（旗举到位、第一下挥动正好喊「三」）；没有旗时照旧马上数 */
  flagLead(): number { const h = this.actors.hanhan; this.shoutFlag = !!h && this.active === 'hanhan' && h.raiseFlag(); return this.shoutFlag ? -Actor.FLAG_LEAD : 0; }
  private shoutFlag = false;
  updateShout(dt: number) {
    if (this.shoutFlag && !this.shout) { this.shoutFlag = false; this.actors.hanhan?.lowerFlag(); }
    if (!this.shout) return;
    const S = this.shout; S.t += dt;
    const pads = S.target === 'gate' ? this.level.gate.pads : this.level.pads;
    if (pads.some((pd) => !pd.occupant)) { this.shout = null; this.ui.say('hanhan', '有人离开了，重新站好再喊。', 2.4, undefined, true); return; }
    const words = ['三——', '二——', '一！'];
    while (S.beat < 3 && S.t >= S.beat) { this.ui.count(words[S.beat]); S.beat++; }
    if (S.t > 2 + this.shoutWin) this.shoutMiss('late');
  }
  shoutMiss(kind: 'early' | 'late') {
    this.shout = null; this.shoutFails++;
    const line = kind === 'early' ? '早了一点！等我喊到「一」再动手。' : '慢了一点！听到「一」马上按。';
    this.ui.say(this.shoutFails >= 2 ? 'hanhan' : 'tangtuan', this.shoutFails >= 2 ? line + '不急，再来一次。' : line, 2.6, undefined, true);
  }

  interact() {
    const L = this.level, lead = this.leader, p = lead.pos;
    // 口令倒数中：E 是「动手」
    if (this.shout) {
      const dtOne = this.shout.t - 2;
      if (dtOne < -this.shoutWin) this.shoutMiss('early');
      else { const tg = this.shout.target; this.shout = null; this.shoutFails = 0; if (tg === 'gate') this.openGate(); else this.raiseBridge(); }
      return;
    }
    if (this.itemInteract()) return;
    if (this.stage === Stage.Deer && this.tryFreeDeer()) return;
    // 藤蔓
    if (this.stage <= Stage.OpenVines && p.distanceTo(L.vine.pos) < 3) {
      if (this.stage === Stage.OpenVines) { this.ui.say(this.active, '拨开了！真的有路！', 2.5, undefined, true); this.removeVines(false); this.applyStage(Stage.Boulder); }
      else this.ui.say(this.active, '藤蔓好密……派派眼睛最尖，让她看看？', 3, 'vine_ask');
      return;
    }
    // 巨石：非汤团
    if (this.stage === Stage.Boulder && !L.boulder.gone && p.distanceTo(L.boulder.mesh.position) < L.boulder.radius + 1.2 && this.active !== 'tangtuan') {
      this.ui.say(this.active, this.active === 'paipai' ? '推、推不动……' : '太重了，推不动。汤团，你来试试？', 2.4, undefined, true);
      return;
    }
    // 机关石板
    if (p.distanceTo(L.winch.pos) < 2.5 && L.winch.mesh.visible && this.active !== 'tangtuan') {
      this.ui.say(this.active, '上面刻着齿轮……汤团肯定看得懂。', 2.6, undefined, true);
      return;
    }
    // 机关点
    for (const pad of L.pads) if (p.distanceTo(pad.pos) < 1.4) {
      if (pad.need && pad.need !== this.active) this.ui.say(this.active, '绞盘好重，转不动。要汤团来。', 2.4, undefined, true);
      else this.ui.say(this.active, `我守着${pad.name}！`, 1.6, undefined, true);
      return;
    }
  }

  removeVines(instant: boolean) {
    const L = this.level;
    L.vine.opened = true;
    // 有 Codex 的藤帘模型时：打开过程中保留阻挡，开完才撤碰撞、露出藤条；藤帘打开后保留可见（0155）
    if (L.vine.curtain && !instant) { this.vineOpen = 0; return; }
    this.finishVines();
    if (instant) { if (L.vine.curtain) setVineProgress(L, 1); else L.vine.group.visible = false; } else this.vineOpen = 0;
  }
  finishVines() {
    const L = this.level;
    if (L.vine.collider) { this.ph.remove(L.vine.collider); L.vine.collider = null; }
    const vr = L.pickups.find((pk) => pk.id === 'vine_rope'); if (vr && !vr.taken) { vr.visible = true; vr.group.visible = true; }
  }

  updateBoulderPush(dt: number, wish: THREE.Vector3, moving: boolean) {
    const L = this.level, B = L.boulder, lead = this.leader, p = lead.pos;
    const toB = B.mesh.position.clone().sub(p); toB.y = 0;
    const dist = toB.length() - B.radius;
    const facingNorth = wish.z < -0.5;
    // 横向偏差太大（在球侧面）不算贴住
    const lateral = Math.abs(p.x - B.mesh.position.x);
    if (this.active === 'tangtuan' && dist < 0.75 && lateral < 0.8 && p.z > B.mesh.position.z && this.input.down('KeyE')) {
      this.bracing = true;
      // 先贴到接触距离再开始推，避免手还没碰到石头石头就动了
      const engaged = Math.abs(p.z - (B.mesh.position.z + PUSH_ROOT_TO_CENTER)) < 0.12 && lateral < 0.15;
      if (!(moving && facingNorth && engaged)) { if (!engaged) this.ui.say('tangtuan', '贴紧……', 1.0, 'push_align'); return; }
      this.pushing = true;
      B.progress = Math.min(1, B.progress + (PUSH_SPEED * dt) / B.start.distanceTo(B.end));
      const np = B.start.clone().lerp(B.end, B.progress);
      B.mesh.rotation.x -= (PUSH_SPEED * dt) / B.radius;
      B.mesh.position.copy(np);
      B.body.setNextKinematicTranslation({ x: np.x, y: np.y, z: np.z });
      this.ui.say('tangtuan', '嘿——哟！', 1.5, 'push_start');
      // 推出收窄处（约 3.8 米）后，巨石顺着下坡自己滚走
      if (B.progress >= 0.45) { this.boulderRoll = 0; this.pushing = false; this.bracing = false; this.ui.say('tangtuan', '它自己滚起来了！', 1.8, undefined, true); }
    } else if (this.active === 'tangtuan' && dist < 1.0 && p.z > B.mesh.position.z) {
      this.ui.say('tangtuan', '贴着它，按住 E 往前推。', 2.2, 'push_how');
    }
  }

  inspectWinch(again = false) {
    this.leader.faceTo(this.level.winch.pos);
    this.leader.playOnce('inspect_mechanism'); // 独立的一次性动作，阶段马上推进也不会打断它
    this.ui.xray(`<h3>汤团的机关透视 · 吊桥绞盘</h3>
      石板下面有三根连杆，各连着一个机关：
      <ol><li>左边的<b>绞盘</b>：卷起吊桥的主绳，很重，要汤团来转</li><li>右边的<b>配重石</b>：压住另一头，桥才不会滑回去</li><li>桥头的<b>绳扣</b>：把升起来的桥扣牢</li></ol>
      三个地方要<b>同时</b>有人守着，桥才会升起来。<div class="close">几秒后自动关闭</div>`);
    this.xrayT = 7;
    if (!again) {
      this.ui.say('tangtuan', '我懂了！三个地方要同时有人。可我们只有三个人……得好好分工。', 4, undefined, true);
      this.ui.say('hanhan', '交给我安排。', 2.2);
      this.applyStage(Stage.ThreePoints);
      if (!this.level.ropeclipFix.fixed) {
        this.ui.say('tangtuan', '等等……桥头绳扣上的钩子断了！得先做一个新的。', 3.4);
        if (!this.bag.includes('iron_hook') && !this.bag.includes('hook_rope')) this.ui.say('paipai', '西边悬崖那里……好像有个铁钩子在闪。', 3);
        this.ui.objective(ROPE_OBJECTIVE);
      }
    }
  }

  /** 涵涵的号令：走到一个机关点旁边按 Q，派一位伙伴来守着。不需要对准。 */
  command(_camFwd: THREE.Vector3) {
    const L = this.level, p = this.leader.pos;
    if (this.stage !== Stage.ThreePoints) { this.ui.say('hanhan', '现在还不需要分工。', 1.8, undefined, true); return; }
    let best: Pad | null = null, bestD = 4.0;
    for (const pad of L.pads) { const d = pad.pos.distanceTo(p); if (d < bestD) { bestD = d; best = pad; } }
    if (!best) { this.ui.say('hanhan', '我得走到要守的机关旁边，再派人过来。', 2.6, undefined, true); return; }
    if (best.id === 'ropeclip' && !L.ropeclipFix.fixed) { this.ui.say('hanhan', '绳扣的钩子断了，派人守也没用，先把它修好。', 2.6, undefined, true); return; }
    const fol = this.followers();
    // 这里已经有伙伴守着：再按一次就叫他回来
    const here = fol.find((a) => a.goal && a.goal.distanceTo(best!.pos) < 0.1);
    if (here) { here.goal = null; here.holding = false; this.ui.say('hanhan', `${here.def.name}，先回来吧。`, 1.8, undefined, true); return; }
    let pick: Actor | undefined;
    if (best.need) pick = fol.find((a) => a.def.id === best!.need);
    else pick = fol.find((a) => !a.goal && a.def.id !== 'tangtuan') || fol.find((a) => !a.goal && !(a.def.id === 'tangtuan' && !L.pads[0].occupant));
    if (!pick) {
      if (best.need && !fol.some((a) => a.def.id === best!.need)) this.ui.say('hanhan', '绞盘得汤团来转。', 2, undefined, true);
      else this.ui.say('hanhan', '大家都有任务了，剩下这个我自己守。', 2.4, undefined, true);
      return;
    }
    pick.goal = best.pos.clone(); pick.holding = false;
    // 派遣成功才播指令动作：先转向机关再指
    this.leader.faceTo(best.pos); this.leader.playCommand();
    this.ui.say('hanhan', `${pick.def.name}，来守${best.name}！`, 2, undefined, true);
    this.ui.say(pick.def.id, pick.def.id === 'tangtuan' ? '交给我！' : '好、好的！', 1.5);
  }

  // ---------- 跟随 ----------
  /** 0267：起风时在桥上停下的人走到近侧扶绳内侧 0.38 米、面朝桥的方向，用靠绳那只手抓住（in → loop），风停播 out。
   *  v004实际扶绳中心 x=±1.15，内侧站位 x=±0.77，均随风横摆；渲染前按原握持中心做小幅双骨骼修正。 */
  private grips = new Map<Actor, { on: boolean; side: number; yaw: number; t: number; x0: number; hand: 'left' | 'right' }>();
  gripRail(a: Actor, want: boolean, dt: number): boolean {
    if (!a.inter?.sets.bridge_grip_left || !a.inter.sets.bridge_grip_right) return false;
    let G = this.grips.get(a);
    if (!want) { if (G) G.on = false; return false; }
    if (!G || !G.on) {
      const side = a.pos.x >= 0 ? 1 : -1, yaw = Math.cos(a.yaw) >= 0 ? 0 : Math.PI;
      // 本地 +X（左手边）在世界里是 (cos yaw, 0, -sin yaw)，和扶绳方向同号就用左手
      G = { on: true, side, yaw, t: 0, x0: a.pos.x, hand: side * Math.cos(yaw) > 0 ? 'left' : 'right' };
      this.grips.set(a, G);
      if (a.flagUp) a.lowerFlag(); // 涵涵：抓绳前先收旗
    }
    G.t += dt;
    const u = Math.min(1, G.t / 0.35), e = u * u * (3 - 2 * u), p = a.pos;
    const rail = bridgeRailPoint(G.side, p.z, Number.isFinite(this.level.bridge.sway) ? this.level.bridge.sway : 0);
    p.x = G.x0 + (rail[0] - G.side * 0.38 - G.x0) * e;
    const falling = a.vel.y; a.teleport(p, G.yaw); a.vel.y = falling; // follow the rope without cancelling vertical gravity

    a.interWant = G.hand === 'left' ? 'bridge_grip_left' : 'bridge_grip_right';
    (window as any).__qhdGrip = { ...((window as any).__qhdGrip || {}), [a.def.id]: { hand: G.hand, side: G.side, state: a.inter.state, cur: a.inter.cur, x: +a.pos.x.toFixed(3) } };
    return true;
  }

  updateFollowers(dt: number, gust: boolean, onBridge: (p: THREE.Vector3) => boolean) {
    const lead = this.leader, lp = lead.pos;
    const last = this.crumbs[this.crumbs.length - 1];
    if (!last || last.distanceTo(lp) > 0.35) { this.crumbs.push(lp.clone()); if (this.crumbs.length > 80) this.crumbs.shift(); }
    this.followers().forEach((a, i) => {
      const ap = a.pos;
      let target: THREE.Vector3 | null = null, stopDist = 0.5;
      if (a.goal) { target = a.goal; stopDist = 0.25; }
      else {
        // 沿面包屑，取离领队约 1.6 × (i+1) 米的点
        let acc = 0; target = lp;
        for (let k = this.crumbs.length - 1; k > 0; k--) { acc += this.crumbs[k].distanceTo(this.crumbs[k - 1]); target = this.crumbs[k - 1]; if (acc > 1.6 * (i + 1)) break; }
        stopDist = 0.45;
        if (ap.distanceTo(lp) < 1.2 + i * 0.8) target = null;
      }
      const wish = new THREE.Vector3();
      if (target) {
        const d = target.clone().sub(ap); d.y = 0;
        const dist = d.length();
        if (dist > stopDist) { d.normalize(); wish.copy(d).multiplyScalar(dist > 4 ? a.def.run : a.def.walk); }
        else if (a.goal) { a.holding = true; }
      }
      // 掉队太远：瞬移到身后
      if (!a.goal && ap.distanceTo(lp) > 16 && !onBridge(lp)) { const back = this.crumbs[Math.max(0, this.crumbs.length - 6 - i * 3)] || lp; a.teleport(back.clone().add(new THREE.Vector3(0, 0.05, 0))); }
      if (gust && onBridge(ap)) wish.set(0, 0, 0);
      a.pose = a.holding ? 'hold' : gust && onBridge(ap) ? 'brace' : 'idle';
      // 0137：守在踏石 / 苔花上 = 踩踏板等待（左脚踩下的位置在脚尖前 18 cm，仍在踏石内）；陪苔鹿的派派不做
      a.interWant = a.holding && !(a.goal && a.goal.distanceTo(this.level.deerState.calmPad.pos) < 0.1) ? 'pedal_wait' : null;
      if (this.gripRail(a, gust && onBridge(ap), dt)) a.pose = 'idle';
      a.move(dt, wish, false);
    });
  }

  // ---------- 风 ----------
  updateWind(dt: number, anyoneOnBridge: boolean) {
    const W = this.wind;
    if (this.stage !== Stage.Bridge || !anyoneOnBridge) { W.phase = 'calm'; W.t = Math.max(W.t, 2.5); W.strength *= 0.9; this.ui.warn(false); setWindSway(W.strength * 0.05); return; }
    W.t -= dt;
    if (W.phase === 'calm' && W.t <= 0) { W.phase = 'warn'; W.t = 1.4; this.ui.warn(true); this.ui.say('paipai', '风……风要来了！', 1.6, 'wind_first'); }
    else if (W.phase === 'warn' && W.t <= 0) { W.phase = 'gust'; W.t = 2.0; }
    else if (W.phase === 'gust' && W.t <= 0) { W.phase = 'calm'; W.t = 3.5 + Math.random() * 1.5; this.ui.warn(false); }
    const target = W.phase === 'gust' ? 1 : W.phase === 'warn' ? 0.25 : 0.05;
    W.strength += (target - W.strength) * Math.min(1, dt * 3);
    setWindSway(Math.sin(performance.now() / 260) * W.strength * 0.05);
  }

  stumble() {
    if (this.respawning > 0) return;
    this.falls++;
    this.respawnSoon('hanhan', '起风的时候先停下，抓紧绳子！');
  }

  respawnSoon(who: CharId | null, line: string) {
    this.respawning = 0.9; this.ui.fade(true);
    if (who) this.ui.say(who, line, 2.6, undefined, true);
  }

  respawnAll() {
    const c = this.level.checkpoints[this.cp];
    const fwd = new THREE.Vector3(0, 0, 1);
    this.squad.forEach((id, i) => {
      const a = this.actors[id];
      if (a.holding && this.stage === Stage.ThreePoints) return;
      const off = id === this.active ? new THREE.Vector3() : fwd.clone().multiplyScalar(1.1 + i * 0.6).add(new THREE.Vector3((i - 1) * 0.5, 0, 0));
      a.teleport(c.pos.clone().add(off), c.yaw);
    });
    this.crumbs = [];
    this.wind.phase = 'calm'; this.wind.t = 3; this.ui.warn(false);
  }

  // ---------- 阶段 ----------
  updateStage(dt: number, t: number) {
    const L = this.level, lp = this.leader.pos;
    this.updateGate(dt);
    this.updateShout(dt);
    // 死路
    if (this.stage === Stage.Crossroads) for (const d of L.deadEnds) if (lp.distanceTo(d.pos) < d.radius) this.ui.say(d.who, d.line, 3, 'dead_' + d.who);
    if (this.stage === Stage.Crossroads && lp.distanceTo(L.vine.pos) < 3.5 && this.active !== 'paipai') this.ui.say('tangtuan', '藤蔓后面……会不会有东西？派派眼睛最尖。', 3, 'vine_near');
    // 观察时脚印发光
    const glow = this.observing ? 0.95 : this.stage >= Stage.OpenVines ? 0.45 : 0;
    L.vine.footprints.forEach((fp, i) => { const m = fp.material as THREE.MeshBasicMaterial; m.opacity += (glow - m.opacity) * Math.min(1, dt * 6); m.color.set(this.observing ? 0xffd27a : 0x3b2a1a); fp.position.y = 0.025 + Math.sin(t * 3 + i) * 0.002; });
    // 藤蔓拨开动画
    if (this.vineOpen >= 0) {
      this.vineOpen += dt;
      if (L.vine.curtain) { setVineProgress(L, this.vineOpen / 1.6); if (this.vineOpen >= 1.6) { setVineProgress(L, 1); this.finishVines(); this.vineOpen = -1; } }
      else {
        L.vine.group.children.forEach((c, i) => { c.position.x += (c.position.x >= 0 ? 1 : -1) * dt * 2.2; c.scale.y = Math.max(0.05, c.scale.y - dt * 0.6); });
        if (this.vineOpen > 1.6) { L.vine.group.visible = false; this.vineOpen = -1; }
      }
    }
    // 巨石滚下峡谷
    if (this.boulderRoll >= 0) {
      const B = L.boulder;
      this.boulderRoll += dt;
      const p = B.mesh.position;
      if (p.z > -51) { p.z -= dt * (3 + this.boulderRoll * 3); B.mesh.rotation.x -= dt * 4; }
      else { p.y -= dt * (6 + this.boulderRoll * 6); p.z -= dt * 2; }
      B.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
      if (this.boulderRoll > 0.3 && this.boulderRoll - dt <= 0.3) { this.ui.say('paipai', '它……滚下去了！', 1.8, undefined, true); this.ui.say('tangtuan', '咦，巨石下面压着一块石板。', 2.6); }
      if (p.y < -14) {
        if (!B.gone) this.ph.world.removeRigidBody(B.body); B.mesh.visible = false; B.gone = true; this.boulderRoll = -1;
        L.winch.mesh.visible = true;
        this.awardLeaf('tangtuan', '推开了挡路的巨石');
        this.applyStage(Stage.Inspect);
      }
    }
    // 三点同时
    if (this.stage === Stage.ThreePoints) {
      for (const pad of L.pads) {
        pad.occupant = null;
        for (const a of Object.values(this.actors)) {
          if (a.pos.distanceTo(pad.pos) < 0.85 && (!pad.need || pad.need === a.def.id) && (pad.id !== 'ropeclip' || L.ropeclipFix.fixed)) pad.occupant = a.def.id;
        }
        if (!pad.occupant && pad.need) for (const a of Object.values(this.actors)) if (a.pos.distanceTo(pad.pos) < 0.85 && a === this.leader) this.ui.say(a.def.id, '绞盘好重，转不动。要汤团来。', 2.4, 'winch_heavy_' + a.def.id);
      }
      const n = L.pads.filter((p) => p.occupant).length;
      if (n === 3 && !this.shout) this.ui.say('hanhan', '都站好了！我喊「三、二、一」，喊到「一」一起动手！（F）', 3.5, 'shout_ready');

    }
    this.updateMechVisuals(dt);
    // 到达对岸
    if (this.stage === Stage.Bridge && lp.z < L.endZ && lp.y > 1) this.meetDeer();
    if (this.stage === Stage.Deer) this.updateDeer(dt, t);
    else if (this.level.deerVis && this.stage < Stage.Deer) this.deerModel(dt, false, false); // 走近之前就在呼吸 / 疼得甩头
  }

  /** 0147 古旧机关的活动部分：三人守住时绞盘慢慢转、摇把来回摇；升桥过程中配重升起、绳子变短，最后绳扣扣上 */
  private winchAngle = 0;
  updateMechVisuals(dt: number) {
    const V = this.level.mechVis; if (!V.drum && !V.weight && !V.latch) return;
    const raising = this.stage === Stage.Bridge && this.cinematic ? Math.min(1, this.cinematic.t / this.cinematic.dur) : null;
    const k = this.stage > Stage.Bridge || (this.stage === Stage.Bridge && !this.cinematic) ? 1 : raising ?? 0; // 0 = 未动，1 = 桥已升好
    const winchHeld = this.stage === Stage.ThreePoints && this.level.pads.some((p) => p.id === 'winch' && p.occupant);
    if (raising !== null) this.winchAngle -= dt * 2.4; else if (winchHeld) this.winchAngle -= dt * 0.35; // 单向累计
    if (V.drum) V.drum.rotation.x = this.winchAngle;
    if (V.handle) V.handle.rotation.x = raising !== null || winchHeld ? Math.sin(performance.now() / 300) * 0.5 : 0; // 棘轮摇把来回
    const lift = 0.65 * k;
    if (V.weight) V.weight.position.y = 0.35 + lift;
    if (V.weightRope) V.weightRope.scale.y = (1.03 - lift) / 1.03;
    if (V.weightLever) V.weightLever.rotation.z = -0.5 * Math.min(1, k * 4); // 先松配重
    if (V.latch) V.latch.rotation.z = 0.9 * THREE.MathUtils.smoothstep(k, 0.8, 1);
  }

  raiseBridge() {
    const L = this.level;
    this.applyStage(Stage.Bridge);
    L.pads.forEach((p) => (p.occupant = null));
    this.ui.say('hanhan', '一起——！', 2.0, undefined, true);
    this.ui.say('tangtuan', '桥升起来了！', 2);
    const start = new THREE.Vector3(-6.5, 5.5, -41);
    this.cinematic = {
      t: 0, dur: 6.0,
      from: start, to: new THREE.Vector3(-4.5, 6.5, -46), look: new THREE.Vector3(0, 0.5, -62),
      // 用户（11-06）：桥升起来要有画面——镜头里桥板从对岸崖壁一块块提起、展开、落座（以前只在镜头结束时一下子铺平）
      onTick: (u) => { const v = THREE.MathUtils.clamp((u - 0.12) / 0.8, 0, 1); L.bridge.raised = v * v * (3 - 2 * v); L.bridge.ropes.visible = v > 0.85; },
      onDone: () => {
        L.bridge.raised = 1; L.bridge.ropes.visible = true; this.makeBridgeColliders(); this.openBridgeGates();
        for (const a of this.followers()) { a.goal = null; a.holding = false; }
        this.awardLeaf('hanhan', '安排大家同时守住三个机关');
        this.ui.say('paipai', '桥会晃……我、我跟着你们走。', 3);
      },
    };
  }

  openBridgeGates() { for (const g of this.level.bridgeGates) this.ph.remove(g); this.level.bridgeGates = []; }

  makeBridgeColliders() {
    const L = this.level, b = L.bridge;
    if (b.colliders.length) return;
    const len = b.startZ - b.endZ, cz = (b.startZ + b.endZ) / 2;
    // 桥面：跟着桥板下垂（中间低 0.35 m）的三角带，脚踩在板面上；两端各伸 0.3 m 接岸
    const N = 24, v: number[] = [], idx: number[] = [];
    for (let k = 0; k <= N; k++) { const z = b.startZ + 0.3 - (len + 0.6) * k / N, u = Math.min(1, Math.max(0, (b.startZ - z) / len)), y = 1.5 - Math.sin(u * Math.PI) * 0.35;
      v.push(-1.05, y, z, 1.05, y, z); if (k) { const a = 2 * k - 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    b.colliders.push(this.ph.trimesh(new Float32Array(v), new Uint32Array(idx)));
    for (const s of [-1, 1]) b.colliders.push(this.ph.box({ x: s * 1.2, y: 2.2, z: cz }, { x: 0.1, y: 1.4, z: len }));
  }

  awardLeaf(who: CharId, why: string) {
    if (this.leaves.includes(who)) return;
    this.leaves.push(who);
    this.ui.leaves(this.leaves);
    this.ui.toast(`${CHARS[who].name}亮起了一片光之叶 · ${why}`, 4);
    if (who === this.active && this.observing) { this.observing = false; this.ui.observe(false); } // 派派观察中获叶：先收起，欢呼完不再自动举镜
    this.actors[who].playOnce('cheer'); // 一次性欢呼，作用在得叶子的人身上，不会被跟随的 pose 覆盖
    this.cheerShot(who);
    this.save();
  }

  /** 得叶子时的欢呼特写：镜头转到正面，往该角色的「挂件侧」偏一点（派派：书包右侧的美乐蒂，偏 25°）。已有演出时不打断。 */
  cheerShot(who: CharId) {
    if (this.cinematic) return;
    const a = this.actors[who], y = a.yaw;
    const fwd = new THREE.Vector3(Math.sin(y), 0, Math.cos(y)), right = new THREE.Vector3(-Math.cos(y), 0, Math.sin(y));
    const bias = FRONT_BIAS[who] ?? 0;
    const dir = fwd.multiplyScalar(Math.cos(bias)).addScaledVector(right, Math.sin(bias));
    const look = a.pos.clone().add(new THREE.Vector3(0, a.def.height * 0.62, 0));
    // 挡在镜头前的伙伴先挪到角色身后两侧
    for (const f of this.followers()) if (f !== a && f.pos.distanceTo(look.clone().addScaledVector(dir, 1.0)) < 1.4) f.teleport(a.pos.clone().addScaledVector(dir, -1.2).addScaledVector(right, f.def.id === 'tangtuan' ? 1.0 : -1.0), f.yaw);
    this.cinematic = { t: 0, dur: 2.4, from: look.clone().addScaledVector(dir, 2.1).add(new THREE.Vector3(0, 0.3, 0)), to: look.clone().addScaledVector(dir, 1.55).add(new THREE.Vector3(0, 0.12, 0)), look };
  }

  finish() {
    this.applyStage(Stage.Done);
    this.ui.say('hanhan', '它让开路了！', 2, undefined, true);
    this.ui.say('tangtuan', '你看它回头……好像在等我们跟上。', 3);
    const lp = this.leader.pos.clone();
    this.cinematic = { t: 0, dur: 5.5, from: lp.clone().add(new THREE.Vector3(2.5, 2.2, 4)), to: lp.clone().add(new THREE.Vector3(-1.5, 2.0, -3)), look: new THREE.Vector3(0, 3, -86), onDone: () => this.onDone?.() };
    this.clearSave();
  }

  updateKeys(onBridge: boolean) {
    const k: [string, string][] = [];
    const p = this.leader.pos, L = this.level;
    const G = L.gate;
    const nearPk = L.pickups.find((pk) => pk.visible && !pk.taken && Math.hypot(pk.pos.x - p.x, pk.pos.z - p.z) < 1.6 && Math.abs(pk.pos.y - p.y) < 1.2);
    if (nearPk) k.push(['E', `捡起${ITEMS[nearPk.id].name}`]);
    else if (p.distanceTo(L.workbench.pos) < 1.8 && this.bag.includes('iron_hook') && this.bag.includes('vine_rope')) k.push(['E', '做钩绳']);
    else if (!L.ropeclipFix.fixed && this.stage >= Stage.ThreePoints && this.bag.includes('hook_rope') && p.distanceTo(L.pads[2].pos) < 2.0) k.push(['E', '装上钩绳']);
    else if (this.stage === Stage.Deer && !L.deerState.freed && Math.hypot(p.x - 0.3, p.z + 83.2) < 2.0) k.push(['E', L.deerState.low > 0.8 ? '取下断木' : '取下断木（要它先低头）']);
    else if (this.stage === Stage.Deer && [...L.lures, L.deerState.calmPad].some((pd) => pd.pos.distanceTo(p) < 3.2)) k.push(this.active === 'hanhan' ? ['F', '派伙伴过来'] : ['2', '换涵涵来派人']);
    else if (!G.opening && p.z > 13.5) {
      if (this.shout) k.push(['E', '听到「一」时踩下去']);
      else if (this.active !== 'hanhan') k.push(['2', '换涵涵来安排']);
      else if (G.pads.every((pd) => pd.occupant)) k.push(['F', '喊口令：三、二、一']);
      else k.push(['F', '派伙伴去踩另一块踏石']);
    } else if (this.stage === Stage.Boulder && this.active === 'tangtuan' && !L.boulder.gone && p.distanceTo(L.boulder.mesh.position) < L.boulder.radius + 1.3) k.push(['E + W', '推巨石']);
    else if (this.stage === Stage.OpenVines && p.distanceTo(L.vine.pos) < 3) k.push(['E', '拨开藤蔓']);
    else if (this.active === 'paipai') k.push(['Q', this.observing ? '收起放大镜' : '细节之眼']);
    else if (this.stage === Stage.ThreePoints && this.shout) k.push(['E', '听到「一」时动手']);
    else if (this.stage === Stage.ThreePoints && L.pads.every((pd) => pd.occupant)) k.push(this.active === 'hanhan' ? ['F', '喊口令：三、二、一'] : ['2', '换涵涵来喊口令']);
    else if (this.active === 'hanhan' && this.stage === Stage.ThreePoints) k.push(['Q', '号令：派伙伴来守身边的机关']);
    else if (this.active === 'tangtuan' && L.winch.mesh.visible && p.distanceTo(L.winch.pos) < 3) k.push(['Q', '机关透视']);
    if (onBridge && this.wind.phase !== 'calm') k.push(['松开 WASD', '停下，抓紧绳子']);
    k.push(['1 2 3', '换人'], ['H', '提示']);
    this.ui.keys(k);
  }
}
