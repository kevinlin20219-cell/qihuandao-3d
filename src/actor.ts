import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Physics, GROUP_CHAR, QUERY_CHAR } from './physics';
import type { CharDef } from './data/characters';

const skinBase = new THREE.MeshStandardMaterial({ color: 0xf2d2b4, roughness: 0.7 });
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1b1410 });

/** 一个可控的角色：灰盒外观 + Rapier 运动学角色控制器。 */
export class Actor {
  def: CharDef;
  root = new THREE.Group();
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  ctrl: RAPIER.KinematicCharacterController;
  vel = new THREE.Vector3();
  yaw = 0;
  grounded = false;
  radius: number;
  half: number;
  // 行为
  holding = false;          // 被号令守住机关
  lockYaw = false;          // 推石时朝向固定，不跟着微调的移动方向转
  goal: THREE.Vector3 | null = null;  // 被号令走向的位置
  pose: 'idle' | 'walk' | 'run' | 'push' | 'observe' | 'brace' | 'cheer' | 'hold' = 'idle';
  private parts: { torso: THREE.Mesh; head: THREE.Group; legL: THREE.Mesh; legR: THREE.Mesh; armL: THREE.Mesh; armR: THREE.Mesh; prop?: THREE.Object3D };
  private phase = 0;
  private torsoY = 0;
  label: THREE.Sprite;

  constructor(def: CharDef, ph: Physics, scene: THREE.Scene, pos: THREE.Vector3) {
    this.def = def;
    const h = def.height;
    this.radius = Math.max(0.18, Math.min(0.26, def.weight / 180));
    this.half = h / 2 - this.radius;
    // 物理：胶囊中心在 h/2
    this.body = ph.world.createRigidBody(ph.R.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y + h / 2, pos.z));
    this.collider = ph.world.createCollider(ph.R.ColliderDesc.capsule(this.half, this.radius).setCollisionGroups(GROUP_CHAR), this.body);
    this.ctrl = ph.world.createCharacterController(0.02);
    this.ctrl.enableAutostep(0.32, 0.15, true);
    this.ctrl.enableSnapToGround(0.35);
    this.ctrl.setMaxSlopeClimbAngle((48 * Math.PI) / 180);
    this.ctrl.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.ctrl.setApplyImpulsesToDynamicBodies(false);

    // 外观：按身高比例。孩子头身比约 1:5.5（幼儿 1:4.5）
    const skin = skinBase.clone();
    const headR = h * (def.height < 1.15 ? 0.11 : 0.095);
    const legH = h * 0.42, torsoH = h - legH - headR * 2;
    const w = this.radius * (0.9 + def.weight / 120);
    const cloth = new THREE.MeshStandardMaterial({ color: def.body, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.body).multiplyScalar(0.55), roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(w, Math.max(0.05, torsoH - w * 2), 4, 10), cloth);
    torso.position.y = legH + torsoH / 2; torso.castShadow = true;
    const legGeo = new THREE.CapsuleGeometry(w * 0.38, legH - w * 0.7, 3, 8); legGeo.translate(0, -legH / 2, 0);
    const legL = new THREE.Mesh(legGeo, pants), legR = new THREE.Mesh(legGeo, pants);
    legL.position.set(-w * 0.45, legH, 0); legR.position.set(w * 0.45, legH, 0);
    const armGeo = new THREE.CapsuleGeometry(w * 0.26, torsoH * 0.75, 3, 8); armGeo.translate(0, -torsoH * 0.4, 0);
    const armL = new THREE.Mesh(armGeo, cloth), armR = new THREE.Mesh(armGeo, cloth);
    armL.position.set(-w * 1.15, legH + torsoH * 0.88, 0); armR.position.set(w * 1.15, legH + torsoH * 0.88, 0);
    const head = new THREE.Group(); head.position.y = legH + torsoH + headR * 0.95;
    const face = new THREE.Mesh(new THREE.SphereGeometry(headR, 18, 14), skin); face.castShadow = true;
    if (def.id === 'tangtuan' || def.id === 'youyou' || def.id === 'jiashuo') face.scale.set(1.08, 1.0, 1.05); // 圆脸
    if (def.id === 'hanhan') face.scale.set(0.94, 1.1, 0.98);                                                 // 长脸
    if (def.id === 'paipai' || def.id === 'beibei') face.scale.set(0.95, 1.04, 0.98);                         // 瓜子脸
    const hair = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.06, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: def.hair, roughness: 0.9 }));
    hair.rotation.x = -0.25; hair.position.z = -headR * 0.08; hair.castShadow = true;
    if (def.id === 'jiaxun') { hair.scale.set(1.08, 0.95, 1.08); hair.rotation.x = 0; }                         // 西瓜头
    if (def.id === 'hanhan' || def.id === 'paipai' || def.id === 'beibei' || def.id === 'youyou') {
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(headR * 0.28, headR * 1.1, 3, 8), hair.material);
      tail.position.set(0, -headR * 0.35, -headR * 0.95); tail.rotation.x = 0.35; head.add(tail);
    }
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.11, 8, 6), eyeMat);
      e.position.set(s * headR * 0.36, headR * 0.05, headR * 0.92); head.add(e);
    }
    head.add(face, hair);
    this.root.add(torso, legL, legR, armL, armR, head);
    this.parts = { torso, head, legL, legR, armL, armR };
    this.torsoY = torso.position.y;
    // 道具：派派的放大镜
    if (def.id === 'paipai') {
      const g = new THREE.Group();
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), new THREE.MeshStandardMaterial({ color: 0xc23a3a }));
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0x5e3b22 }));
      handle.position.y = -0.11; g.add(rim, handle); g.position.set(0, -torsoH * 0.78, 0.06); armR.add(g); this.parts.prop = g;
    }
    // 名牌
    this.label = makeLabel(def.name);
    this.label.position.y = h + 0.32;
    this.root.add(this.label);
    this.root.position.copy(pos);
    scene.add(this.root);
  }

  get pos(): THREE.Vector3 { const t = this.body.translation(); return new THREE.Vector3(t.x, t.y - this.def.height / 2, t.z); }

  teleport(p: THREE.Vector3, yaw?: number) {
    this.body.setTranslation({ x: p.x, y: p.y + this.def.height / 2, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + this.def.height / 2, z: p.z });
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.root.position.copy(p);
  }

  /** wish：水平期望速度（m/s）。jump：本帧是否起跳。 */
  move(dt: number, wish: THREE.Vector3, jump: boolean, gravity = 22) {
    const accel = this.grounded ? 14 : 5;
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, accel * dt);
    if (this.grounded && jump) this.vel.y = Math.sqrt(2 * gravity * this.def.jump);
    this.vel.y -= gravity * dt;
    if (this.grounded && this.vel.y < -1) this.vel.y = -1;
    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.ctrl.computeColliderMovement(this.collider, desired, undefined, QUERY_CHAR);
    const m = this.ctrl.computedMovement();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    this.grounded = this.ctrl.computedGrounded();
    if (this.grounded && this.vel.y < 0) this.vel.y = -1;
    const hs = Math.hypot(wish.x, wish.z);
    if (hs > 0.1 && !this.lockYaw) {
      const target = Math.atan2(wish.x, wish.z);
      let d = target - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, 12 * dt);
    }
  }

  /** 同步外观并播放程序化动作（灰盒阶段代替动画片段）。 */
  sync(dt: number, t: number) {
    const p = this.pos;
    this.root.position.lerp(p, Math.min(1, 30 * dt));
    this.root.rotation.y = this.yaw;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.anim) { this.syncAnim(dt, speed); return; }
    const P = this.parts;
    let stride = 0, lean = 0, armFwd = 0;
    if (this.pose === 'push') { lean = 0.35; armFwd = -1.3; stride = Math.min(1, speed) * 0.4; }
    else if (this.pose === 'brace') { lean = 0.15; armFwd = -0.6; }
    else if (this.pose === 'observe') { armFwd = -1.1; }
    else if (this.pose === 'hold') { armFwd = -0.9; lean = 0.2; }
    else stride = Math.min(1, speed / this.def.walk) * (speed > this.def.walk * 1.2 ? 0.75 : 0.5);
    this.phase += dt * (3 + speed * 2.2);
    const s = Math.sin(this.phase) * stride;
    P.legL.rotation.x = s; P.legR.rotation.x = -s;
    P.armL.rotation.x = armFwd !== 0 ? armFwd : -s * 0.9;
    P.armR.rotation.x = armFwd !== 0 ? armFwd : s * 0.9;
    if (this.pose === 'observe') { P.armL.rotation.x = -0.3; P.armR.rotation.x = -1.5; }
    if (this.cheerT > 0) this.cheerT -= dt;
    if (this.pose === 'cheer' || this.cheerT > 0) { P.armL.rotation.set(Math.PI, 0, -0.3); P.armR.rotation.set(Math.PI, 0, 0.3); }
    else { P.armL.rotation.z = 0; P.armR.rotation.z = 0; P.armL.rotation.y = 0; P.armR.rotation.y = 0; }
    P.torso.rotation.x = lean; P.head.rotation.x = lean * 0.5;
    const bob = Math.abs(Math.cos(this.phase)) * 0.03 * stride + (this.pose === 'idle' ? Math.sin(t * 2 + this.def.height * 9) * 0.006 : 0);
    P.torso.position.y = this.torsoY + bob;
  }

  /** 按水平速度在 idle / walk / run 之间交叉淡化；播放速度跟着移动速度走，减少滑步 */
  private syncAnim(dt: number, speed: number) {
    const A = this.anim!;
    const runAt = (A.refWalk + A.refRun) / 2 * (this.def.walk / A.refWalk); // 按本人速度换算阈值
    const want: 'idle' | 'walk' | 'run' = !this.grounded && speed < 0.2 ? A.cur : speed < 0.25 ? 'idle' : speed < runAt ? 'walk' : 'run';
    const k = Math.min(1, dt / 0.2); // 约 0.2 秒淡入淡出
    const O = this.obs;
    if (O) this.updateObserve(dt, speed);
    let o = O ? O.o : 0;
    // 一次性全身动作：0.2 秒淡入，结束前 0.2 秒淡出；走动起来就取消（不让定点动作跟着人滑）
    const S = this.oneShot;
    let f = 0;
    if (S) {
      const dur = S.a.getClip().duration;
      if (speed > 0.6) S.cancelled = true;
      const tgt = !S.cancelled && S.a.time < dur - 0.2 ? 1 : 0;
      S.f += (tgt - S.f) * k;
      if (tgt === 0 && S.f < 0.01) { S.a.stop(); S.a.setEffectiveWeight(0); this.oneShot = null; }
      else { S.a.setEffectiveWeight(S.f); f = S.f; }
      if (O && f > 0) { O.o = 0; O.target = 0; O.state = 'off'; O.skill.setEffectiveWeight(0); O.hold.setEffectiveWeight(0); O.skillP?.setEffectiveWeight(0); O.holdP?.setEffectiveWeight(0); if (O.prop) O.prop.visible = false; o = 0; }
    }
    // 涵涵指令层
    const C = this.cmd;
    let c = 0;
    if (C) {
      const dur = C.a.getClip().duration;
      const tgt = C.on && C.a.time < dur - 0.2 ? 1 : 0;
      C.c += (tgt - C.c) * k;
      if (C.on && tgt === 0 && C.c < 0.01) { C.on = false; C.a.stop(); }
      if (!C.on && C.c < 0.01) C.c = 0;
      c = C.c * (1 - f);
      C.a.setEffectiveWeight(c);
    }
    // 推石层（全身替换）：pose = 'push' 时淡入；站着撑住 push_idle，推着走 push_walk（参考速度 1.1 m/s）
    const PU = this.push;
    let pw = 0;
    if (PU) {
      PU.p += ((this.pose === 'push' ? 1 : 0) - PU.p) * k;
      if (PU.p < 0.002) PU.p = 0;
      PU.w += ((this.pushMoving ? 1 : 0) - PU.w) * k;
      PU.idle.setEffectiveWeight(PU.p * (1 - PU.w) * (1 - f));
      PU.walk.setEffectiveWeight(PU.p * PU.w * (1 - f));
      PU.walk.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 1.1, 0.5, 1.5));
      pw = PU.p;
    }
    // 共用交互层（全身）：走动起来就退出；进入播完接循环，退出播完淡掉
    const I = this.inter;
    let fi = 0;
    if (I) {
      const wantI = speed > 0.6 ? null : this.interWant;
      if (wantI && (I.cur !== wantI || I.state === 'off' || I.state === 'exit') && !(I.cur === wantI && I.state === 'exit' && I.once)) this.startInter(wantI);
      if (I.cur) {
        const S = I.sets[I.cur];
        if (I.state === 'enter' && !S.enter.isRunning()) { if (I.once || !wantI) { I.state = 'exit'; S.exit.reset().play(); } else { I.state = 'loop'; S.loop.reset().play(); } }
        else if (I.state === 'loop' && wantI !== I.cur) { I.state = 'exit'; S.exit.reset().play(); }
        else if (I.state === 'exit' && !S.exit.isRunning()) { I.state = 'off'; if (I.once) { I.once = false; if (this.interWant === I.cur) this.interWant = null; } }
        const tgt = I.state === 'off' ? 0 : 1, kk = Math.min(1, dt / 0.15);
        I.f += (tgt - I.f) * kk; if (I.f < 0.005 && I.state === 'off') { I.f = 0; for (const a of Object.values(S)) { a.stop(); a.setEffectiveWeight(0); } I.cur = null; }
        // 段之间的衔接：进入 / 循环 / 退出只有一个满权重（片段首尾帧对齐，硬切即可）
        S.enter.setEffectiveWeight(I.state === 'enter' ? I.f : 0); S.loop.setEffectiveWeight(I.state === 'loop' ? I.f : 0); S.exit.setEffectiveWeight(I.state === 'exit' || I.state === 'off' ? I.f : 0);
        fi = I.f * (1 - f);
      }
    }
    if (PU && fi > 0) { PU.idle.setEffectiveWeight(PU.idle.getEffectiveWeight() * (1 - fi)); PU.walk.setEffectiveWeight(PU.walk.getEffectiveWeight() * (1 - fi)); }
    if (C && fi > 0) C.a.setEffectiveWeight(c * (1 - fi));
    pw = Math.min(1, pw + fi * (1 - pw)); // 下面站走跑整体让位
    for (const n of ['idle', 'walk', 'run'] as const) {
      const w = this.baseW[n] + ((n === want ? 1 : 0) - this.baseW[n]) * k;
      this.baseW[n] = w;
      A.actions[n].setEffectiveWeight(w * Math.max(0, 1 - o - c) * (1 - pw) * (1 - f));
      if (C) { const m = C.masked[n]; m.setEffectiveWeight(w * c * (1 - pw)); m.time = A.actions[n].time; m.setEffectiveTimeScale(A.actions[n].getEffectiveTimeScale()); }
      if (O) { const m = O.masked[n]; m.setEffectiveWeight(w * o * (1 - pw) * (1 - f)); m.time = A.actions[n].time; m.setEffectiveTimeScale(A.actions[n].getEffectiveTimeScale()); }
    }
    A.cur = want;
    // 跑步：用户 2026-10-27 定为全速时 1.5 倍播放（跑速不变）；没跑满时按比例放慢
    const ws = THREE.MathUtils.clamp(speed / A.refWalk, 0.5, 1.6), rs = THREE.MathUtils.clamp(RUN_PLAYBACK * speed / this.def.run, 0.6, RUN_PLAYBACK);
    A.actions.walk.setEffectiveTimeScale(ws);
    A.actions.run.setEffectiveTimeScale(rs);
    if (O) for (const n of ['walk', 'run'] as const) O.masked[n].setEffectiveTimeScale(A.actions[n].getEffectiveTimeScale());
    A.mixer.update(dt);
    if (this.flag) this.applyFlag(dt, Math.min(1, Math.max(f, c, fi, pw, o)));
  }
  private baseW = { idle: 1, walk: 0, run: 0 };

  // ---- v58 涵涵队长旗（Codex 0193 旗 + 0199 动作库 v002；用户 11-02：平时插在书包上，派活 / 喊口令时才拿到右手，正手握）
  // off = 插在背包上，只叠加 back_idle 的 20 个手指通道（其他动作层优先）；
  // draw → enter → loop → exit → stow = 喊口令举旗（loop 0.8 倍速，其余 1 倍速）；command = 派活时取旗指向再插回（1.5 秒）。
  // 换手事件按动画本地时间越过阈值触发一次：draw 0.2 / stow 0.3 / command 0.2 与 1.3；手上缩放 0.72 ↔ 1.0 按 quintic smoothstep。
  flag: { bones: THREE.Object3D[]; finger: boolean[]; clips: Record<string, { ip: (THREE.Interpolant | null)[]; dur: number }>;
    state: 'off' | 'draw' | 'enter' | 'loop' | 'exit' | 'stow' | 'command'; t: number; r: number; idleT: number; cancel: boolean;
    endPose: string | null; prop: THREE.Object3D; hand: THREE.Object3D; back: THREE.Object3D; inHand: boolean } | null = null;
  /** 举旗循环的播放倍率：循环里三次挥动在 0.4 / 1.2 / 2.0 秒，0.8 倍后正好每秒一次，对上「三、二、一」 */
  static FLAG_LOOP_TS = 0.8;
  /** 从开始取旗到第一下挥动（喊「三」）：draw 0.5 + enter 0.5 + 0.4/0.8 = 1.5 秒 */
  static FLAG_LEAD = 0.5 + 0.5 + 0.4 / 0.8;
  attachFlag(prop: THREE.Object3D, lib: THREE.AnimationClip[]): boolean {
    const hand = this.model?.getObjectByName('RightHand'), spine = this.model?.getObjectByName('Spine2');
    const get = (n: string) => lib.find((c) => c.name === n);
    const names = ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', ...['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].flatMap((f) => [1, 2, 3, 4].map((i) => `RightHand${f}${i}`))];
    const bones = names.map((n) => this.model?.getObjectByName(n));
    const need = ['flag_back_idle', 'flag_draw', 'flag_raise_enter', 'flag_raise_loop', 'flag_raise_exit', 'flag_stow', 'flag_command'];
    if (!hand || !spine || bones.some((b) => !b) || need.some((n) => !get(n))) return false;
    const mk = (n: string) => { const c = get(n)!; return { dur: c.duration, ip: names.map((b) => { const tr = c.tracks.find((t) => t.name === b + '.quaternion'); return tr ? (tr as any).createInterpolant() as THREE.Interpolant : null; }) }; };
    for (const n of ['flag_socket_R', 'flag_socket_back']) this.model!.getObjectByName(n)?.removeFromParent();
    // 手上挂点 prop_R（合同 socket_local），旗场景再转 πY（prop_scene_local）
    const sock = new THREE.Object3D(); sock.name = 'flag_socket_R';
    sock.position.set(-0.011525551788508892, 0.08127482235431671, 0.028273459523916245);
    sock.quaternion.set(-0.4329448938369751, -0.5610690116882324, -0.5784590244293213, 0.40391260385513306);
    hand.add(sock);
    // 背包挂点（合同 flag_socket_back，父级 Spine2，已含 0.72 缩放和朝向；旗在它下面用单位变换）
    const back = new THREE.Object3D(); back.name = 'flag_socket_back';
    back.position.set(-0.3642311692237854, -0.04223053529858589, 0.10660739243030548);
    back.quaternion.set(0.13462375104427338, 0.7395113706588745, -0.03369166702032089, 0.658683717250824);
    back.scale.setScalar(0.72);
    spine.add(back);
    prop.name = 'prop_hanhan_flag';
    const clips: Record<string, { ip: (THREE.Interpolant | null)[]; dur: number }> = {};
    for (const n of need) clips[n] = mk(n);
    this.flag = { bones: bones as THREE.Object3D[], finger: names.map((n) => /\d$/.test(n)), clips, state: 'off', t: 0, r: 0, idleT: 0, cancel: false, endPose: null, prop, hand: sock, back, inHand: true };
    this.flagTo(false, 0.72);
    return true;
  }
  private flagTo(inHand: boolean, s = 1) {
    const F = this.flag!, P = F.prop;
    if (F.inHand !== inHand) { (inHand ? F.hand : F.back).add(P); F.inHand = inHand; }
    if (inHand) { P.position.set(0, 0, 0); P.quaternion.set(0, 1, 0, 0); P.scale.setScalar(s); }
    else { P.position.set(0, 0, 0); P.quaternion.identity(); P.scale.setScalar(1); }
  }
  private static smooth5(x: number) { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (6 * x - 15) + 10); }
  /** 按动画本地时间摆旗：在手上还是在背包、手上缩放多少（越过阈值即换，不依赖恰好采到某帧） */
  private flagPlace(clip: string, t: number) {
    const sm = Actor.smooth5, draw = (u: number) => u < 0.2 ? null : 0.72 + 0.28 * sm((u - 0.2) / 0.3), stow = (u: number) => u >= 0.3 ? null : 1 - 0.28 * sm(u / 0.3);
    const s = clip === 'flag_draw' ? draw(t) : clip === 'flag_stow' ? stow(t) : clip === 'flag_command' ? (t < 1 ? draw(Math.min(t, 0.5)) : stow(t - 1)) : clip === 'flag_back_idle' ? null : 1;
    this.flagTo(s !== null, s ?? 0.72);
  }
  private flagStart(state: 'draw' | 'command') { const F = this.flag!; F.state = state; F.t = 0; F.cancel = false; F.endPose = null; }
  /** 开始举旗（取旗 → 举起 → 循环挥动）。返回 false = 现在不能举（正在派活 / 收旗） */
  raiseFlag() { const F = this.flag; if (!F) return false; if (F.state === 'draw' || F.state === 'enter' || F.state === 'loop') { F.cancel = false; return true; } if (F.state !== 'off') return false; this.flagStart('draw'); return true; }
  /** 喊完 / 取消：举旗中 → 放下再插回书包；还没举起时等举起后马上放下 */
  lowerFlag() { const F = this.flag; if (!F) return; if (F.state === 'loop') { F.state = 'exit'; F.t = 0; } else if (F.state === 'draw' || F.state === 'enter') F.cancel = true; }
  /** 派活：取旗指向再插回（flag_command） */
  commandFlag() { const F = this.flag; if (!F || F.state !== 'off') return false; this.flagStart('command'); return true; }
  get flagUp() { return !!this.flag && this.flag.state !== 'off'; }
  private applyFlag(dt: number, other: number) {
    const F = this.flag!, C = F.clips, n = F.bones.length;
    const q = new THREE.Quaternion();
    F.t += dt; F.idleT += dt;
    const D = (c: string) => C[c].dur;
    // 状态机（只在动画本地时间越过段尾时切换）
    if (F.state === 'draw' && F.t >= D('flag_draw')) { F.t -= D('flag_draw'); F.state = 'enter'; }
    if (F.state === 'enter' && F.t >= D('flag_raise_enter')) { F.t -= D('flag_raise_enter'); F.state = F.cancel ? 'exit' : 'loop'; }
    if (F.state === 'exit' && F.t >= D('flag_raise_exit')) { F.t -= D('flag_raise_exit'); F.state = 'stow'; }
    if (F.state === 'stow' && F.t >= D('flag_stow')) { F.state = 'off'; F.endPose = 'flag_stow'; F.t = 0; }
    if (F.state === 'command' && F.t >= D('flag_command')) { F.state = 'off'; F.endPose = 'flag_command'; F.t = 0; }
    const clip = F.state === 'off' ? null : F.state === 'draw' ? 'flag_draw' : F.state === 'stow' ? 'flag_stow' : F.state === 'command' ? 'flag_command' : 'flag_raise_' + F.state;
    const lt = F.state === 'loop' ? (F.t * Actor.FLAG_LOOP_TS) % D('flag_raise_loop') : clip ? Math.min(F.t, D(clip) - 1e-4) : 0;
    this.flagPlace(clip ?? 'flag_back_idle', lt);
    // 权重：动作中 0.15 秒淡入整条手臂；结束后 0.2 秒从末帧淡回正常动作
    F.r = clip ? Math.min(1, F.r + dt / 0.15) : Math.max(0, F.r - dt / 0.2);
    const backW = 1 - other; // 背包状态手指放松层，其他交互的手指优先
    for (let i = 0; i < n; i++) {
      const b = F.bones[i];
      const src = clip ?? (F.r > 0 && F.endPose ? F.endPose : null);
      if (src) {
        const s = C[src], ip = s.ip[i];
        if (ip) { const v = ip.evaluate(clip ? lt : s.dur - 1e-4); q.set(v[0], v[1], v[2], v[3]); b.quaternion.slerp(q, F.r); }
      }
      if (!clip && F.finger[i] && backW > 0.01) {
        const s = C.flag_back_idle, ip = s.ip[i];
        if (ip) { const v = ip.evaluate(F.idleT % s.dur); q.set(v[0], v[1], v[2], v[3]); b.quaternion.slerp(q, backW * (1 - F.r)); }
      }
    }
  }
  /** 一次性全身动作（cheer / inspect_mechanism / skill_push_wave）：f = 层权重 */
  oneShot: { a: THREE.AnimationAction; name: string; f: number; cancelled: boolean } | null = null;
  /** 0137 共用交互（全身替换层）：xxx_enter → xxx_loop → xxx_exit。want = 想要的交互名（null = 退出） */
  inter: { sets: Record<string, { enter: THREE.AnimationAction; loop: THREE.AnimationAction; exit: THREE.AnimationAction }>; cur: string | null; state: 'off' | 'enter' | 'loop' | 'exit'; f: number; once: boolean } | null = null;
  interWant: string | null = null;
  /** 一次完整交互（进入后马上退出，例如蹲下拿绳 / 捡东西） */
  interactOnce(name: string): boolean {
    const I = this.inter; if (!I || !I.sets[name]) return false;
    this.interWant = name; this.startInter(name); I.once = true; return true;
  }
  private startInter(name: string) {
    const I = this.inter!; const S = I.sets[name];
    if (I.cur && I.cur !== name) for (const a of Object.values(I.sets[I.cur])) { a.stop(); a.setEffectiveWeight(0); }
    I.cur = name; I.state = 'enter'; I.once = false;
    S.enter.reset().play(); S.loop.stop(); S.exit.stop();
  }
  private shots: Record<string, THREE.AnimationAction> = {};
  /** 涵涵指令（右臂 + 上身 27 条轨道的替换层）：c = 层权重 */
  cmd: { a: THREE.AnimationAction; masked: Record<'idle' | 'walk' | 'run', THREE.AnimationAction>; c: number; on: boolean } | null = null;
  /** 灰盒（没有模型时）的欢呼计时 */
  private cheerT = 0;
  /** 推石层：p = 层权重，w = 推着走的比例 */
  push: { p: number; w: number; idle: THREE.AnimationAction; walk: THREE.AnimationAction } | null = null;

  /** 观察层状态机：站着时完整演出（抬手 → 细看 → 循环），走动时直接淡入循环；收起时站着放下、走着淡出 */
  private updateObserve(dt: number, speed: number) {
    const O = this.obs!, want = this.pose === 'observe', still = speed < 0.25;
    const F = O.state === 'hold' && O.sW === 0 && want && O.o < 0.95 ? 0.25 : 0.15, step = Math.min(1, dt / F); // 直接进循环时 0.25 秒淡入
    if (O.state === 'off' && want) {
      if (still) { O.state = 'raise'; O.skill.reset(); O.skill.play(); O.skill.time = 0; O.skillP?.reset().play(); O.sW = 1; }
      else { O.state = 'hold'; O.hold.time = 0; O.sW = 0; }
      O.target = 1;
    } else if (O.state === 'raise') {
      if (!want) { O.target = 0; if (O.o < 0.01) O.state = 'off'; }
      else if (O.skill.time >= 2.25) { O.sW = Math.max(0, O.sW - step); if (O.sW <= 0) O.state = 'hold'; }
    } else if (O.state === 'hold' && !want) {
      if (still) { O.state = 'lower'; O.skill.reset(); O.skill.play(); O.skill.time = 2.4; O.skillP?.reset().play(); O.sW = 0; }
      else O.target = 0;
    } else if (O.state === 'hold' && want) { O.target = 1; O.sW = Math.max(0, O.sW - step); }
    else if (O.state === 'lower') {
      if (want) { O.state = 'hold'; }
      O.sW = Math.min(1, O.sW + step);
      if (O.skill.time >= O.skill.getClip().duration - 0.01) O.target = 0;
    }
    if (O.state === 'hold' && !want && O.o < 0.01) O.state = 'off';
    if (O.state === 'lower' && O.target === 0 && O.o < 0.01) O.state = 'off';
    O.o += (O.target - O.o) * step;
    if (O.state === 'off') { O.o = 0; O.target = 0; }
    O.skill.setEffectiveWeight(O.o * O.sW);
    O.hold.setEffectiveWeight(O.o * (1 - O.sW));
    // 姿态层跟右臂层同时间、同权重
    if (O.skillP) { O.skillP.setEffectiveWeight(O.o * O.sW); O.skillP.time = O.skill.time; if (!O.skillP.isRunning() && O.skill.isRunning()) O.skillP.play(); }
    if (O.holdP) { O.holdP.setEffectiveWeight(O.o * (1 - O.sW)); O.holdP.time = O.hold.time; }
    // 放大镜：手指握紧后（0.3 s）出现，放下时 2.9 s 前收起；走动淡入时过半才出现
    if (O.prop) {
      const t = O.skill.time;
      // 握紧后才出现（0.4 s），松手前先收起（2.8 s）；直接进循环时权重到 0.95 才出现；打断时立刻收起
      O.prop.visible = (O.state === 'raise' && want && t >= 0.4 && O.o > 0.5) || (O.state === 'hold' && want && O.o >= 0.95) || (O.state === 'lower' && t < 2.8);
    }
  }

  /** 播放一次性全身动作；同名动作正在播就不重复叠加。没有模型时，欢呼用灰盒的举手姿势代替 */
  playOnce(name: string): boolean {
    if (!this.anim) { if (name === 'cheer') { this.cheerT = 2.8; return true; } return false; }
    const a = this.shots[name];
    if (!a) return false;
    if (this.oneShot && this.oneShot.name === name && !this.oneShot.cancelled) return true;
    if (this.oneShot && this.oneShot.a !== a) { this.oneShot.a.stop(); this.oneShot.a.setEffectiveWeight(0); }
    a.reset(); a.play(); a.setEffectiveWeight(0);
    this.oneShot = { a, name, f: 0, cancelled: false };
    return true;
  }
  /** 涵涵指令：右手指向前方（播放前请先把朝向转向目标） */
  playCommand(): boolean {
    if (!this.cmd) return false;
    this.cmd.a.reset(); this.cmd.a.play(); this.cmd.on = true;
    this.commandFlag(); // 派活时从书包取旗指向，再插回（0199 flag_command）
    return true;
  }
  /** 转身面向一个点（太近时方向不可靠，保持原朝向） */
  faceTo(p: THREE.Vector3) {
    const d = p.clone().sub(this.pos); d.y = 0;
    if (d.length() > 0.5) this.yaw = Math.atan2(d.x, d.z);
  }

  /** 把道具挂到模型的 prop_R 挂点上（Codex 0043 约定：整份道具 scene 作子级，局部位置 (0,-0.042,0)） */
  attachProp(prop: THREE.Object3D): boolean {
    const sock = this.model?.getObjectByName('prop_R');
    if (!sock || !this.obs) return false;
    prop.position.set(0, -0.042, 0); prop.rotation.set(0, 0, 0); prop.scale.set(1, 1, 1);
    prop.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } }); // 镜片不往脸上投影
    prop.visible = false; prop.name = 'prop_magnifier';
    sock.add(prop); this.obs.prop = prop;
    return true;
  }

  private fade = 1;
  private occT = 0;
  /** v58 用户 11-02：挡在镜头前时不再变半透明人影，直接让开视线（隐藏）；连续挡住 0.12 秒才藏，不挡后等计时退回 0 才出，避免闪烁 */
  setFade(target: number, dt: number) {
    // v61：挡镜头的同伴直接藏起来，但要有滞后——连续挡住 0.3 s 才藏，离开后约 1 s 才重新出现，避免一闪一闪
    const block = target < 0.5;
    this.occT = block ? Math.min(1, this.occT + dt) : Math.max(0, this.occT - dt * 0.8);
    const hide = this.root.visible ? this.occT > 0.3 : this.occT > 0;
    if (this.root.visible === !hide) return;
    this.root.visible = !hide;
    void this.fade;
  }


  /** 推石时把根对象直接放到接触位置（水平），并把速度设成给定值（用于选动作和播放速度） */
  snapXZ(x: number, z: number, vx: number, vz: number) {
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x, y: t.y, z });
    this.vel.x = vx; this.vel.z = vz;
  }
  /** 推石层里「推着走」由游戏决定（球在动才算），不按速度猜 */
  pushMoving = false;

  /** 骨骼动画（模型带 idle / walk / run 时启用）。refWalk / refRun：片段对应的移动速度（m/s） */
  anim: { mixer: THREE.AnimationMixer; actions: Record<'idle' | 'walk' | 'run', THREE.AnimationAction>; cur: 'idle' | 'walk' | 'run'; refWalk: number; refRun: number; src: string } | null = null;
  clips: THREE.AnimationClip[] = [];
  /** 观察技能层（派派）：右臂替换层 + 放大镜。o = 观察层权重 */
  obs: { o: number; target: number; state: 'off' | 'raise' | 'hold' | 'lower'; skill: THREE.AnimationAction; hold: THREE.AnimationAction; skillP: THREE.AnimationAction | null; holdP: THREE.AnimationAction | null; masked: Record<'idle' | 'walk' | 'run', THREE.AnimationAction>; sW: number; prop: THREE.Object3D | null } | null = null;
  model: THREE.Object3D | null = null;

  /** 用交付的模型替换灰盒外观（碰撞胶囊不变）。clips 有 idle/walk/run 时用骨骼动画。 */
  useModel(model: THREE.Object3D, clips: THREE.AnimationClip[] = []) {
    for (const k of ['torso', 'head', 'legL', 'legR', 'armL', 'armR'] as const) this.parts[k].visible = false;
    // 角色只投影不受影：避免头发把条纹阴影投到脸上（用户 2026-10-26 指出）
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).receiveShadow = false; (o as THREE.Mesh).castShadow = true; } });
    model.name = 'model_' + this.def.id;
    model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; });
    this.root.add(model);
    this.model = model; this.clips = clips;
    this.modelAttached = true;
    this.setClips(clips, this.def.walk, this.def.run, this.def.id);
  }

  /** 给已装模型挂上动作片段（可以借用同一套骨架的其他人物的片段：src 记录来源） */
  /** 额外动作库（0267 吊桥抓绳等）：先记下，之后每次 setClips 都并进去 */
  private extraClips: THREE.AnimationClip[] = [];
  private lastClipArgs: [THREE.AnimationClip[], number, number, string] | null = null;
  addClips(clips: THREE.AnimationClip[]): boolean {
    const have = new Set(this.extraClips.map((c) => c.name));
    this.extraClips.push(...clips.filter((c) => !have.has(c.name)));
    return this.lastClipArgs ? this.setClips(...this.lastClipArgs) : false;
  }
  setClips(clips: THREE.AnimationClip[], refWalk: number, refRun: number, src: string): boolean {
    if (!this.model) return false;
    this.lastClipArgs = [clips, refWalk, refRun, src];
    if (this.extraClips.length) { const own = new Set(this.extraClips.map((c) => c.name)); clips = [...clips.filter((c) => !own.has(c.name)), ...this.extraClips]; }
    const get = (n: string) => clips.find((c) => c.name === n);
    const idle = get('idle'), walk = get('walk'), run = get('run');
    if (!idle || !walk || !run) return false;
    if (this.anim) this.anim.mixer.stopAllAction();
    // 用片段本身量出「着地脚向后移动的速度」作为参考速度：播放速度 = 移动速度 / 参考速度，脚就不滑
    const iw = impliedSpeed(this.model, walk), ir = impliedSpeed(this.model, run);
    if (iw > 0.3) refWalk = iw;
    if (ir > 0.5) refRun = ir;
    const mixer = new THREE.AnimationMixer(this.model);
    const actions = { idle: mixer.clipAction(idle), walk: mixer.clipAction(walk), run: mixer.clipAction(run) };
    for (const a of Object.values(actions)) { a.enabled = true; a.setLoop(THREE.LoopRepeat, Infinity); a.play(); a.setEffectiveWeight(0); }
    actions.idle.setEffectiveWeight(1);
    actions.idle.time = Math.random() * idle.duration; // 几个人的 idle 不要完全同步
    this.anim = { mixer, actions, cur: 'idle', refWalk, refRun, src };
    this.shots = {}; this.oneShot = null;
    for (const n of ['cheer', 'inspect_mechanism', 'skill_push_wave']) {
      const c = get(n); if (!c) continue;
      const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(0);
      this.shots[n] = a;
    }
    const sc = get('skill_command');
    this.cmd = null;
    if (sc) {
      const nodes = new Set(sc.tracks.map((t) => t.name.split('.')[0]));
      const mask = (c: THREE.AnimationClip) => new THREE.AnimationClip(c.name + '_noCmd', c.duration, c.tracks.filter((t) => !nodes.has(t.name.split('.')[0])));
      const masked = { idle: mixer.clipAction(mask(idle)), walk: mixer.clipAction(mask(walk)), run: mixer.clipAction(mask(run)) };
      for (const a of Object.values(masked)) { a.setLoop(THREE.LoopRepeat, Infinity); a.play(); a.setEffectiveWeight(0); }
      const a = mixer.clipAction(sc); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(0);
      this.cmd = { a, masked, c: 0, on: false };
    }
    const pi = get('push_idle'), pk = get('push_walk');
    this.push = null;
    if (pi && pk) {
      const a = mixer.clipAction(pi), b = mixer.clipAction(pk);
      for (const x of [a, b]) { x.setLoop(THREE.LoopRepeat, Infinity); x.play(); x.setEffectiveWeight(0); }
      this.push = { p: 0, w: 0, idle: a, walk: b };
    }
    this.inter = null;
    const sets: Record<string, { enter: THREE.AnimationAction; loop: THREE.AnimationAction; exit: THREE.AnimationAction }> = {};
    for (const n of ['crouch_grab_rope', 'brace_door', 'pedal_wait', 'push_stone', 'pry', 'pump', 'row', 'bridge_grip_left', 'bridge_grip_right']) {
      const e = get(n + '_enter') ?? get(n + '_in'), l = get(n + '_loop'), x = get(n + '_exit') ?? get(n + '_out'); if (!e || !l || !x) continue;
      const enter = mixer.clipAction(e), loop = mixer.clipAction(l), exit = mixer.clipAction(x);
      for (const a of [enter, exit]) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      loop.setLoop(THREE.LoopRepeat, Infinity);
      for (const a of [enter, loop, exit]) a.setEffectiveWeight(0);
      sets[n] = { enter, loop, exit };
    }
    if (Object.keys(sets).length) this.inter = { sets, cur: null, state: 'off', f: 0, once: false };
    const csr = get('call_signal_raise'); if (csr) { const a = mixer.clipAction(csr); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(0); this.shots.call_signal_raise = a; }
    // 观察技能：skill_observe（一次完整演出）+ observe_hold（循环）。只动右臂 24 条轨道，属于「替换层」：
    // 观察时基础站走跑换成去掉这些轨道的副本，右臂完全交给观察层，其余部位照常混合
    const so = get('skill_observe'), oh = get('observe_hold');
    // v002 起多了姿态层（脊柱 / 脖子 / 头，低头看近处），和右臂层成对播放
    const sp = get('skill_observe_posture'), hp = get('observe_hold_posture');
    this.obs = null;
    if (so && oh) {
      const nodes = new Set([so, oh, sp, hp].filter(Boolean).flatMap((c) => c!.tracks.map((t) => t.name.split('.')[0])));
      const mask = (c: THREE.AnimationClip) => new THREE.AnimationClip(c.name + '_noRArm', c.duration, c.tracks.filter((t) => !nodes.has(t.name.split('.')[0])));
      const masked = { idle: mixer.clipAction(mask(idle)), walk: mixer.clipAction(mask(walk)), run: mixer.clipAction(mask(run)) };
      for (const a of Object.values(masked)) { a.setLoop(THREE.LoopRepeat, Infinity); a.play(); a.setEffectiveWeight(0); }
      const skill = mixer.clipAction(so); skill.setLoop(THREE.LoopOnce, 1); skill.clampWhenFinished = true;
      const hold = mixer.clipAction(oh); hold.setLoop(THREE.LoopRepeat, Infinity);
      const skillP = sp ? mixer.clipAction(sp) : null, holdP = hp ? mixer.clipAction(hp) : null;
      if (skillP) { skillP.setLoop(THREE.LoopOnce, 1); skillP.clampWhenFinished = true; }
      if (holdP) holdP.setLoop(THREE.LoopRepeat, Infinity);
      for (const a of [skill, hold, skillP, holdP]) if (a) { a.play(); a.setEffectiveWeight(0); }
      this.obs = { o: 0, target: 0, state: 'off', skill, hold, skillP, holdP, masked, sW: 0, prop: null };
    }
    return true;
  }
  modelAttached = false;

  setActiveLook(active: boolean) {
    (this.label.material as THREE.SpriteMaterial).opacity = active ? 1 : 0.75;
  }
}

/** 跑步动作在全速时的播放倍率 */
export const RUN_PLAYBACK = 1.5;

/** 片段隐含的移动速度（m/s）：采样一个周期，取较低那只脚贴地时在角色前后方向的速度中位数 */
export function impliedSpeed(model: THREE.Object3D, clip: THREE.AnimationClip): number {
  const L = model.getObjectByName('LeftFoot'), R = model.getObjectByName('RightFoot');
  if (!L || !R) return 0;
  const saved = model.matrixWorld.clone();
  const mixer = new THREE.AnimationMixer(model); mixer.clipAction(clip).play();
  const N = 120, dt = clip.duration / N, inv = new THREE.Matrix4();
  const pts: { l: THREE.Vector3; r: THREE.Vector3 }[] = [];
  for (let i = 0; i <= N; i++) {
    mixer.setTime(i * dt); model.updateMatrixWorld(true); inv.copy(model.matrixWorld).invert();
    pts.push({ l: L.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv), r: R.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv) });
  }
  mixer.stopAllAction(); mixer.uncacheRoot(model); model.updateMatrixWorld(true); void saved;
  const minY = Math.min(...pts.flatMap((p) => [p.l.y, p.r.y]));
  const sp: number[] = [];
  for (let i = 0; i < N; i++) {
    const k = pts[i].l.y < pts[i].r.y ? 'l' : 'r';
    if (pts[i][k].y - minY > 0.025) continue;
    sp.push(-(pts[i + 1][k].z - pts[i][k].z) / dt);
  }
  sp.sort((a, b) => a - b);
  return sp.length ? sp[Math.floor(sp.length / 2)] : 0;
}

function makeLabel(text: string): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = 256; c.height = 80;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(246,239,220,0.92)';
  roundRect(g, 48, 14, 160, 52, 26); g.fill();
  g.fillStyle = '#24382b'; g.font = '600 34px -apple-system,"PingFang SC","Noto Sans SC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 41);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.5, 0.16, 1); s.renderOrder = 10;
  return s;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
