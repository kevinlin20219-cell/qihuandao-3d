// C3 追踪水痕：三处线索 + 连起来的一串淡脚印（灰盒）。
// 依据 Codex《第二章落地设计 v002》主线第 1 步：三人从营火追踪水痕，派派 Q 看断枝 / 脚印，固定线索点 (-12,0,15) (-9,0,4) (-10,0,-8)；发现伙伴后进入分队。
// 平时线索和脚印都很淡（地上隐约有痕迹，给孩子方向）；派派举起放大镜时亮起来，看过的线索留一点亮。
// 所有网格挂在第二章的 root 下，跟着 shell.dispose() 一起释放（几何体、材质在这里自己释放）。
import * as THREE from 'three';

export type ClueId = 'twig' | 'prints' | 'water';
export interface Clue {
  id: ClueId; local: THREE.Vector3; radius: number;
  /** 派派看到时说的话（字幕；配音等 X8） */
  line: string;
  group: THREE.Group; mats: THREE.MeshBasicMaterial[]; found: boolean;
}
export interface Ch2Tracks {
  clues: Clue[];
  /** 每帧：observing = 派派举着放大镜 */
  update(dt: number, t: number, observing: boolean): void;
  dispose(): void;
}

export const CLUES: { id: ClueId; x: number; z: number; line: string }[] = [
  { id: 'twig', x: -12, z: 15, line: '这根树枝是新折断的……有人从这里跑过去了。' },
  { id: 'prints', x: -9, z: 4, line: '两种脚印，一大一小——是佑佑和北北！' },
  { id: 'water', x: -10, z: -8, line: '这些水痕一直通到对岸。' },
];

export function buildTracks(root: THREE.Group): Ch2Tracks {
  const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [];
  const basic = (c: number, o: number) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false }); mats.push(m); return m; };
  const g = (x: THREE.BufferGeometry) => { geos.push(x); return x; };
  const footGeo = g(new THREE.CircleGeometry(0.09, 10)); footGeo.rotateX(-Math.PI / 2); footGeo.scale(0.75, 1, 1.5);
  const footSmall = g(new THREE.CircleGeometry(0.075, 10)); footSmall.rotateX(-Math.PI / 2); footSmall.scale(0.75, 1, 1.5);

  // 连起来的淡脚印：营火 → 断枝 → 脚印 → 水痕 → 河边（两种大小交替：佑佑大一点，北北小一点）
  const path = [new THREE.Vector2(-13.5, 23), new THREE.Vector2(-12, 15), new THREE.Vector2(-9, 4), new THREE.Vector2(-10, -8), new THREE.Vector2(-6.8, -8)];
  const trailMats: THREE.MeshBasicMaterial[] = [];
  const trail = new THREE.Group(); trail.name = 'ch2_trail'; root.add(trail);
  for (let s = 0; s < path.length - 1; s++) {
    const a = path[s], b = path[s + 1], d = b.clone().sub(a), len = d.length(), n = Math.max(2, Math.floor(len / 0.9));
    const yaw = Math.atan2(d.x, d.y), side = new THREE.Vector2(d.y, -d.x).normalize();
    for (let i = 0; i < n; i++) {
      const p = a.clone().addScaledVector(d, (i + 0.5) / n), k = i % 2 ? 1 : -1;
      for (const [geo, off] of [[footGeo, 0.16], [footSmall, -0.22]] as const) {
        const m = basic(0x3b2a1a, 0.16); trailMats.push(m);
        const fp = new THREE.Mesh(geo, m); fp.position.set(p.x + side.x * off * k, 0.012, p.y + side.y * off * k); fp.rotation.y = yaw; fp.renderOrder = 2; trail.add(fp);
      }
    }
  }

  // 三处线索
  const clues: Clue[] = CLUES.map((c) => {
    const grp = new THREE.Group(); grp.name = 'ch2_clue_' + c.id; grp.position.set(c.x, 0, c.z); root.add(grp);
    const cm: THREE.MeshBasicMaterial[] = [];
    const ring = new THREE.Mesh(g(new THREE.RingGeometry(0.9, 1.05, 32)), basic(0xffd27a, 0)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015; grp.add(ring); cm.push(ring.material as THREE.MeshBasicMaterial);
    if (c.id === 'twig') { // 折断的树枝：一根躺在地上，断口朝北
      const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 }); mats.push(wood);
      const a = new THREE.Mesh(g(new THREE.CylinderGeometry(0.035, 0.045, 1.1, 6)), wood); a.rotation.set(Math.PI / 2, 0, 0.5); a.position.set(0.1, 0.05, 0); a.castShadow = true; grp.add(a);
      const b = new THREE.Mesh(g(new THREE.CylinderGeometry(0.02, 0.03, 0.45, 5)), wood); b.rotation.set(Math.PI / 2.4, 0.9, 0); b.position.set(-0.25, 0.07, -0.35); grp.add(b);
      const snap = new THREE.Mesh(g(new THREE.SphereGeometry(0.06, 6, 4)), basic(0xe8d3a0, 0.15)); snap.position.set(0.35, 0.06, -0.48); grp.add(snap); cm.push(snap.material as THREE.MeshBasicMaterial);
    } else if (c.id === 'prints') { // 一大一小两串清楚的脚印，朝北（上游）
      for (let i = 0; i < 4; i++) for (const [geo, x] of [[footGeo, 0.2], [footSmall, -0.25]] as const) {
        const m = basic(0x3b2a1a, 0.3); cm.push(m); const fp = new THREE.Mesh(geo, m); fp.position.set(x + (i % 2 ? 0.1 : -0.1), 0.014, 0.6 - i * 0.45); fp.rotation.y = Math.PI; fp.renderOrder = 2; grp.add(fp);
      }
    } else { // 水痕：一道湿印从岸上拖到河边
      const m = basic(0x2f4a52, 0.28); cm.push(m);
      const streak = new THREE.Mesh(g(new THREE.PlaneGeometry(3.4, 0.55)), m); streak.rotation.x = -Math.PI / 2; streak.position.set(1.6, 0.013, 0); streak.renderOrder = 2; grp.add(streak);
      for (let i = 0; i < 5; i++) { const dm = basic(0x2f4a52, 0.28); cm.push(dm); const drop = new THREE.Mesh(g(new THREE.CircleGeometry(0.12 + (i % 3) * 0.04, 8)), dm); drop.rotation.x = -Math.PI / 2; drop.position.set(-0.4 - i * 0.35, 0.013, (i % 2 ? 0.25 : -0.2)); grp.add(drop); }
    }
    return { id: c.id, local: new THREE.Vector3(c.x, 0, c.z), radius: 2.6, line: c.line, group: grp, mats: cm, found: false };
  });

  let glow = 0;
  return {
    clues,
    update(dt, t, observing) {
      glow += ((observing ? 1 : 0) - glow) * Math.min(1, dt * 6);
      for (const m of trailMats) { m.opacity = 0.16 + glow * 0.6; m.color.setHex(observing ? 0xffd27a : 0x3b2a1a); }
      for (const c of clues) c.mats.forEach((m, i) => {
        const base = i === 0 ? 0 : (c.id === 'twig' ? 0.15 : 0.3);
        const pulse = 0.75 + Math.sin(t * 3 + i) * 0.25;
        if (i === 0) m.opacity = c.found ? 0.25 + glow * 0.35 : glow * 0.8 * pulse; // 光圈：看过的留一点亮
        else { m.opacity = base + glow * 0.6; m.color.setHex(observing ? 0xffd27a : c.id === 'water' ? 0x2f4a52 : c.id === 'twig' ? 0xe8d3a0 : 0x3b2a1a); }
      });
    },
    dispose() { for (const x of geos) x.dispose(); for (const m of mats) m.dispose(); },
  };
}
