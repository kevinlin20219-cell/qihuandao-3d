// C4 分队救援的河道道具（灰盒）：三段稳石（每段 4 块）、西岸闸门撑杆、东岸放水拉杆、北北摸石的波纹、退水时的水位。
// 依据 Codex《第二章落地设计 v002》第 2–3 步与 0387 四块稳石接口：每块站面 1.2×1.2 m、中心距 1 m（相邻重叠 0.2 m）、
// 顶高 0.05/0.09/0.13/0.17，z=-8 一线，12 块中心 x=5.5…-5.5（东 → 中 → 西三段）；撑杆 (-7,0,-16)、拉杆 (7,0,-16)、北北辨石 (9,0,-8)。
// 只管「看得见的东西和碰撞」，规则（谁就位、口令、6 秒窗口）在 game.ts。全部挂在第二章 root 下，dispose() 释放自己建的几何体、材质、碰撞。
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics';

export const STONE_Z = -8;
export const STONE_TOPS = [0.05, 0.09, 0.13, 0.17];
/** 三段，每段 4 块的中心 x（东段先做） */
export const SEGMENTS: number[][] = [[5.5, 4.5, 3.5, 2.5], [1.5, 0.5, -0.5, -1.5], [-2.5, -3.5, -4.5, -5.5]];
/** 每段的起点和终点 x（北北要从起点走到终点；终点过了最后一块石头中心就算到） */
export const SEG_END_X = [2.5, -1.5, -5.5];
export const BRACE = new THREE.Vector3(-7, 0, -16);
export const LEVER = new THREE.Vector3(7, 0, -16);
export const SENSE_EAST = new THREE.Vector3(7.2, 0, -8);
const SUNK_TOP = -0.75; // 沉在水下时石头顶面的高度（水面 -0.35，看得见一点影子）

export interface Ch2RescueKit {
  /** 第 k 段升起的程度 0（沉）…1（露出）；>=0.95 时才有碰撞 */
  setRaise(k: number, r: number): void;
  raise(k: number): number;
  /** 这一段已经被止回扣锁住（永远露出、有碰撞） */
  locked: boolean[];
  lock(k: number): void;
  /** 北北摸过第 k 段：水下这一段的石头冒出波纹（只是提示） */
  setSensed(k: number, on: boolean): void;
  /** 水位：0 = 平时，1 = 退水（水面降 0.4 m） */
  setDrain(d: number): void;
  /** 撑杆 / 拉杆是否有人守着（光圈颜色） */
  setPosted(which: 'brace' | 'lever', on: boolean): void;
  /** 第 k 段终点（局部），北北走到这里算过了这一段 */
  segEnd(k: number): THREE.Vector3;
  update(dt: number, t: number): void;
  dispose(): void;
}

export function buildRescueKit(root: THREE.Group, ph: Physics, world: (x: number, y: number, z: number) => THREE.Vector3, water: THREE.Mesh): Ch2RescueKit {
  const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [];
  const std = (c: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, ...extra }); mats.push(m); return m; };
  const basic = (c: number, o: number) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false }); mats.push(m); return m; };
  const stoneGeo = new THREE.BoxGeometry(1.2, 1.0, 1.2); geos.push(stoneGeo);
  const stoneM = std(0x8d8676), lockedM = std(0x9a8f74);
  const ringGeo = new THREE.RingGeometry(0.42, 0.55, 24); ringGeo.rotateX(-Math.PI / 2); geos.push(ringGeo);

  const stones: { mesh: THREE.Mesh; top: number; x: number; col: RAPIER.Collider | null; ring: THREE.Mesh }[][] = SEGMENTS.map((seg) => seg.map((x, i) => {
    const top = STONE_TOPS[i];
    const mesh = new THREE.Mesh(stoneGeo, stoneM); mesh.name = 'ch2_steady_stone'; mesh.position.set(x, SUNK_TOP - 0.5, STONE_Z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    const rm = basic(0xbfe8ff, 0); const ring = new THREE.Mesh(ringGeo, rm); ring.position.set(x, -0.33, STONE_Z); ring.renderOrder = 3; root.add(ring);
    return { mesh, top, x, col: null, ring };
  }));
  const raiseV = [0, 0, 0], sensed = [false, false, false], locked = [false, false, false];

  // 西岸撑杆：一根斜撑顶在闸门侧板上；东岸拉杆：立杆 + 把手。脚下一个光圈表示站位
  const mk = (pos: THREE.Vector3, isLever: boolean) => {
    const g = new THREE.Group(); g.position.copy(pos); root.add(g);
    const wood = std(0x7a5a3a);
    if (isLever) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), std(0x6b6a60)); geos.push(base.geometry); base.position.set(-0.6, 0.15, 0); g.add(base);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.4, 8), wood); geos.push(pole.geometry); pole.position.set(-0.6, 0.95, 0); pole.rotation.z = 0.35; g.add(pole);
    } else {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 1.4), std(0x6b5a44)); geos.push(plate.geometry); plate.position.set(0.9, 0.5, 0); g.add(plate);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.5, 8), wood); geos.push(beam.geometry); beam.position.set(0.35, 0.7, 0); beam.rotation.z = Math.PI / 2 - 0.5; g.add(beam);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 28), basic(0xffd27a, 0.5)); geos.push(ring.geometry); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    return { g, ring };
  };
  const brace = mk(BRACE, false), lever = mk(LEVER, true);
  const posted = { brace: false, lever: false };
  const waterY0 = water.position.y;

  const colAt = (s: { x: number; top: number }) => ph.box(world(s.x, s.top - 0.5, STONE_Z), { x: 1.2, y: 1.0, z: 1.2 });
  const apply = (k: number) => {
    const r = locked[k] ? 1 : raiseV[k];
    for (const s of stones[k]) {
      s.mesh.position.y = SUNK_TOP - 0.5 + (s.top - SUNK_TOP) * r;
      const want = r >= 0.95;
      if (want && !s.col) s.col = colAt(s);
      else if (!want && s.col) { ph.remove(s.col); s.col = null; }
    }
  };
  let tt = 0;
  return {
    locked,
    setRaise(k, r) { raiseV[k] = Math.max(0, Math.min(1, r)); apply(k); },
    raise(k) { return locked[k] ? 1 : raiseV[k]; },
    lock(k) { locked[k] = true; sensed[k] = false; for (const s of stones[k]) s.mesh.material = lockedM; apply(k); },
    setSensed(k, on) { sensed[k] = on; },
    setDrain(d) { water.position.y = waterY0 - 0.4 * Math.max(0, Math.min(1, d)); },
    setPosted(which, on) { posted[which] = on; },
    segEnd(k) { return new THREE.Vector3(SEG_END_X[k], 0, STONE_Z); },
    update(dt) {
      tt += dt;
      stones.forEach((seg, k) => seg.forEach((s, i) => {
        const m = s.ring.material as THREE.MeshBasicMaterial;
        const target = sensed[k] && !locked[k] && raiseV[k] < 0.5 ? 0.45 + Math.sin(tt * 4 - i * 0.9) * 0.3 : 0;
        m.opacity += (target - m.opacity) * Math.min(1, dt * 5);
        const sc = 1 + ((tt * 0.8 + i * 0.25) % 1) * 0.6; s.ring.scale.set(sc, 1, sc);
      }));
      for (const [o, on] of [[brace, posted.brace], [lever, posted.lever]] as const) {
        const m = o.ring.material as THREE.MeshBasicMaterial; m.color.setHex(on ? 0x8fe39a : 0xffd27a); m.opacity = on ? 0.65 : 0.35 + Math.sin(tt * 3) * 0.15;
      }
    },
    dispose() {
      for (const seg of stones) for (const s of seg) if (s.col) { ph.remove(s.col); s.col = null; }
      water.position.y = waterY0;
      for (const g of geos) g.dispose(); for (const m of mats) m.dispose();
    },
  };
}
