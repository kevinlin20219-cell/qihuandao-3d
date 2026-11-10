// C1（第二章任务单 v0.1）：第二章空壳。只有灰盒地块、河面和出生点，不含玩法。
// 区域和坐标来自 Codex《第二章落地设计 v002》的 scene_layout_draft.json（章节局部坐标，米，Y 向上，-Z 为上游）。
// 整章放在世界坐标 X = CH2_ORIGIN.x 处：离第一章很远（远于镜头远裁剪 600 m），第一章的触发、碰撞、雾和分区都碰不到这里。
// 卸载时把自己建的碰撞体、网格、几何体和材质全部释放；第一章不动（暂时常驻，真正的第一章卸载留到以后）。
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics';

export const CH2_ORIGIN = new THREE.Vector3(3000, 0, 0);

/** 区域包络（局部 XZ：x0, x1, z0, z1），与 scene_layout_draft.json 一致；walk_exclude 在 C2 再扣 */
export const CH2_REGIONS: { id: string; xz: [number, number, number, number]; color: number }[] = [
  { id: 'A_entry', xz: [-22, -6, 18, 30], color: 0x9c8a62 },
  { id: 'B_west_bank', xz: [-22, -6, -20, 18], color: 0x8f8a5c },
  { id: 'C_east_bank', xz: [6, 22, -20, 14], color: 0x86905e },
  { id: 'D_upstream_w', xz: [-24, -6, -40, -20], color: 0x7d8058 },
  { id: 'D_upstream_e', xz: [6, 24, -40, -20], color: 0x7d8058 },
  { id: 'G_turtle', xz: [28, 50, 46, 68], color: 0x8a8670 },
];
export const CH2_WATER_Y = -0.35;
/** 出生点：A 南侧入口营火（局部 -14,0,25），面朝上游 */
export const CH2_SPAWN = { pos: new THREE.Vector3(-14, 0.05, 25), yaw: Math.PI };

export interface Ch2Shell {
  root: THREE.Group;
  /** 局部坐标 → 世界坐标 */
  world(x: number, y: number, z: number): THREE.Vector3;
  spawn: { pos: THREE.Vector3; yaw: number };
  stats: { regions: number; colliders: number; meshes: number };
  update(dt: number, t: number): void;
  dispose(): void;
}

export function buildChapter2Shell(scene: THREE.Scene, ph: Physics): Ch2Shell {
  const root = new THREE.Group(); root.name = 'chapter2_shell'; root.position.copy(CH2_ORIGIN); scene.add(root);
  const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [], cols: RAPIER.Collider[] = [];
  const world = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).add(CH2_ORIGIN);
  const mat = (c: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, ...extra }); mats.push(m); return m; };
  let meshes = 0;
  const slab = (name: string, x0: number, x1: number, z0: number, z1: number, m: THREE.Material, th = 1) => {
    const g = new THREE.BoxGeometry(x1 - x0, th, z1 - z0); geos.push(g);
    const mesh = new THREE.Mesh(g, m); mesh.name = 'ch2_' + name; mesh.position.set((x0 + x1) / 2, -th / 2, (z0 + z1) / 2); mesh.receiveShadow = true; root.add(mesh); meshes++;
    cols.push(ph.box(world((x0 + x1) / 2, -th / 2, (z0 + z1) / 2), { x: x1 - x0, y: th, z: z1 - z0 }));
  };
  for (const r of CH2_REGIONS) slab(r.id, ...r.xz, mat(r.color));

  // 河面（只看不走，没有碰撞；掉下去会从出生点重来）
  const wg = new THREE.PlaneGeometry(120, 140); geos.push(wg);
  const water = new THREE.Mesh(wg, mat(0x5f8f97, { roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.85 }));
  water.name = 'ch2_water'; water.rotation.x = -Math.PI / 2; water.position.set(14, CH2_WATER_Y, 14); root.add(water); meshes++;
  // 河底（水下 3 m）：没有碰撞，只为看起来不是悬空
  const bg = new THREE.PlaneGeometry(120, 140); geos.push(bg);
  const bed = new THREE.Mesh(bg, mat(0x3f4d3e)); bed.name = 'ch2_riverbed'; bed.rotation.x = -Math.PI / 2; bed.position.set(14, CH2_WATER_Y - 3, 14); root.add(bed); meshes++;

  // 营火标记（灰盒）：出生点旁一个发光的圆台，方便确认已进入第二章
  const fg = new THREE.CylinderGeometry(0.6, 0.75, 0.3, 12); geos.push(fg);
  const fire = new THREE.Mesh(fg, mat(0xd98a3a, { emissive: 0xd9761f, emissiveIntensity: 0.8 })); fire.name = 'ch2_campfire_marker';
  fire.position.set(-12.5, 0.15, 26.5); root.add(fire); meshes++;

  let t0 = 0;
  return {
    root, world,
    spawn: { pos: world(CH2_SPAWN.pos.x, CH2_SPAWN.pos.y, CH2_SPAWN.pos.z), yaw: CH2_SPAWN.yaw },
    stats: { regions: CH2_REGIONS.length, colliders: cols.length, meshes },
    update(dt) { t0 += dt; (fire.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.75 + Math.sin(t0 * 7) * 0.12 + Math.sin(t0 * 13) * 0.06; }, // 不加点光源：灯数一变全场着色器要重编（11-09 卡顿的原因）
    dispose() {
      for (const c of cols) ph.remove(c);
      cols.length = 0;
      scene.remove(root);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      geos.length = 0; mats.length = 0;
    },
  };
}
