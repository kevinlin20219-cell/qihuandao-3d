// v54 小生命 / 小动态（0140 第三部分）：蝴蝶、光里的浮尘花粉、飘落的叶子、苔藤门附近的萤火。
// 全部围着领队的一小块空间循环使用，每类只占 1 次绘制；时间用游戏的风时间（暂停即停）。?life=0 关掉。
import * as THREE from 'three';

const rnd = (() => { let s = 98765; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

function discTex(inner: string, outer: string) {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, inner); gr.addColorStop(0.5, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function wingTex() { // 一片翅膀：圆润的手绘色块（颜色由实例色决定），边缘深一点
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(30, 22, 26, 18, -0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(26, 46, 18, 14, 0.4, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-atop'; g.strokeStyle = 'rgba(60,40,20,0.55)'; g.lineWidth = 5;
  g.beginPath(); g.ellipse(30, 22, 26, 18, -0.3, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(26, 46, 18, 14, 0.4, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(34, 20, 4, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function leafTex() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(16, 2); g.quadraticCurveTo(30, 16, 16, 30); g.quadraticCurveTo(2, 16, 16, 2); g.fill();
  g.strokeStyle = 'rgba(80,50,20,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(16, 4); g.lineTo(16, 29); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** v56（Codex 0191）：四种立体蝴蝶，各 500 面、带 Open / Closed 两个形态键。每种一个 InstancedMesh（3 只），每只自己的开合相位。
 * urls 给了就先加载，全部成功后才把平面翅膀收掉（不同时画两套）。 */
export function createLife(scene: THREE.Scene, time: { value: number }, butterflyUrls: string[] = []) {
  const root = new THREE.Group(); root.name = 'life'; scene.add(root);
  const center = new THREE.Vector3();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();

  // ---- 蝴蝶：12 只，每只两片翅膀（一个 InstancedMesh，24 个实例）
  const NB = 12;
  const wings = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16).translate(0.08, 0, 0), new THREE.MeshBasicMaterial({ map: wingTex(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, fog: true }), NB * 2);
  wings.frustumCulled = false; wings.name = 'life_butterflies';
  const palette = [0xffe36b, 0xffffff, 0x9fd3ff, 0xffa8c8, 0xffb347, 0xc8a8ff];
  const bf = Array.from({ length: NB }, (_, i) => ({ home: new THREE.Vector3(), ph: rnd() * 10, sp: 0.6 + rnd() * 0.5, r: 1.2 + rnd() * 2.2, h: 0.5 + rnd() * 1.2 }));
  bf.forEach((b, i) => { const col = new THREE.Color(palette[i % palette.length]); wings.setColorAt(i * 2, col); wings.setColorAt(i * 2 + 1, col); });
  root.add(wings);
  // 立体蝴蝶：加载成功后替换平面翅膀
  type BF3 = { im: THREE.InstancedMesh; local: THREE.Matrix4; dummy: THREE.Mesh; iOpen: number; iClosed: number; ids: number[] };
  let bf3: BF3[] | null = null;
  if (butterflyUrls.length) import('./assets').then(({ loadGLB }) => Promise.all(butterflyUrls.map((u) => loadGLB(u)))).then((ms) => {
    const per = Math.ceil(NB / ms.length), out: BF3[] = [];
    ms.forEach((m, k) => {
      let mesh: THREE.Mesh | null = null; m.scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
      if (!mesh) throw new Error('蝴蝶模型没有网格');
      const me = mesh as THREE.Mesh; me.updateWorldMatrix(true, false);
      const dict = me.morphTargetDictionary || {}, ids = Array.from({ length: per }, (_, j) => k + j * ms.length).filter((i) => i < NB);
      const im = new THREE.InstancedMesh(me.geometry, me.material, ids.length);
      im.frustumCulled = false; im.castShadow = false; im.name = 'life_butterflies3d_' + k;
      const dummy = new THREE.Mesh(me.geometry, me.material); dummy.morphTargetInfluences = [0, 0];
      out.push({ im, local: me.matrixWorld.clone(), dummy, iOpen: dict.Open ?? 0, iClosed: dict.Closed ?? 1, ids });
      root.add(im);
    });
    bf3 = out; wings.visible = false; root.remove(wings);
    (window as any).__qhd = { ...((window as any).__qhd || {}), butterflies: { kinds: out.length, count: out.reduce((a, b) => a + b.ids.length, 0), tris: ms.reduce((a, m) => a + m.triangles, 0) } };
  }).catch((e) => console.error('立体蝴蝶加载失败，继续用平面翅膀', e));

  // ---- 浮尘 / 花粉：260 个光点，围着领队 10 m 内慢慢飘
  const ND = 260, dPos = new Float32Array(ND * 3), dSeed = new Float32Array(ND);
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ map: discTex('rgba(255,244,200,1)', 'rgba(255,220,140,0.35)'), size: 0.07, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  dust.frustumCulled = false; dust.name = 'life_dust';
  const dBase = Array.from({ length: ND }, () => new THREE.Vector3((rnd() - 0.5) * 20, rnd() * 6, (rnd() - 0.5) * 20));
  for (let i = 0; i < ND; i++) dSeed[i] = rnd() * 100;
  root.add(dust);

  // ---- 飘落的叶子：40 片，从树冠高度慢慢旋着落下，落地后回到上面
  const NL = 40;
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshLambertMaterial({ map: leafTex(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }), NL);
  leaves.frustumCulled = false; leaves.name = 'life_leaves';
  const leafCols = [0xc9a33a, 0x9bb34a, 0xd88a3a, 0xb7c35a, 0xe0b850];
  const lf = Array.from({ length: NL }, (_, i) => ({ x: (rnd() - 0.5) * 18, z: (rnd() - 0.5) * 18, y0: 4 + rnd() * 5, ph: rnd() * 30, fall: 0.35 + rnd() * 0.3 }));
  lf.forEach((_, i) => leaves.setColorAt(i, new THREE.Color(leafCols[i % leafCols.length])));
  root.add(leaves);

  // ---- 萤火：苔藤门一带（z −6 … −24）才出现，60 个
  const NF = 60, fPos = new Float32Array(NF * 3);
  const fGeo = new THREE.BufferGeometry(); fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  const ff = new THREE.Points(fGeo, new THREE.PointsMaterial({ map: discTex('rgba(235,255,170,1)', 'rgba(170,240,90,0.4)'), size: 0.16, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  ff.frustumCulled = false; ff.name = 'life_fireflies';
  const fBase = Array.from({ length: NF }, () => new THREE.Vector3((rnd() - 0.5) * 9, 0.3 + rnd() * 2.2, -6 - rnd() * 18));
  root.add(ff);

  const wrap = (v: number, c: number, half: number) => c + ((((v - c) % (half * 2)) + half * 3) % (half * 2)) - half;

  return {
    root,
    update(leader: THREE.Vector3) {
      const t = time.value;
      center.lerp(leader, center.lengthSq() === 0 ? 1 : 0.05);
      // 蝴蝶：在“家”附近绕 8 字飞，翅膀扇动；家跟着领队慢慢挪（离太远就换个家）
      bf.forEach((b, i) => {
        if (b.home.lengthSq() === 0 || b.home.distanceTo(center) > 14) b.home.set(center.x + (rnd() - 0.5) * 16, center.y, center.z + (rnd() - 0.5) * 16);
        const k = t * b.sp + b.ph;
        p.set(b.home.x + Math.sin(k) * b.r, b.home.y + b.h + Math.sin(k * 2.3) * 0.25, b.home.z + Math.sin(k * 2) * b.r * 0.5);
        const yaw = Math.atan2(Math.cos(k) * b.r, Math.cos(k * 2) * b.r) , flap = Math.sin(t * 18 + b.ph) * 1.1;
        if (bf3) {
          // 0191 合同：扇翅 s = sin(2π·4·t + 相位)，Open = max(0,s)，Closed = max(0,−s)；偶尔滑翔（半开小颤）
          const set = bf3.find((x) => x.ids.includes(i))!, j = set.ids.indexOf(i);
          const glide = Math.sin(t * 0.37 + b.ph * 3.1) > 0.55, sw = Math.sin(2 * Math.PI * 4 * t + b.ph * 6.28);
          set.dummy.morphTargetInfluences![set.iOpen] = glide ? 0.35 + 0.03 * Math.sin(4 * t + b.ph) : Math.max(0, sw);
          set.dummy.morphTargetInfluences![set.iClosed] = glide ? 0 : Math.max(0, -sw);
          set.im.setMorphAt(j, set.dummy);
          e.set(Math.cos(k * 2.3) * 0.15, yaw, -Math.cos(k) * 0.25, 'YXZ'); q.setFromEuler(e);
          m4.compose(p, q, s.set(1, 1, 1)).multiply(set.local); set.im.setMatrixAt(j, m4);
          if (i === NB - 1 || j === set.ids.length - 1) { set.im.instanceMatrix.needsUpdate = true; if (set.im.morphTexture) set.im.morphTexture.needsUpdate = true; }
          return;
        }
        for (const side of [0, 1]) {
          e.set(0, yaw + (side ? Math.PI : 0), side ? -flap : flap, 'YXZ'); q.setFromEuler(e);
          s.set(1, 1, 1); m4.compose(p, q, s); wings.setMatrixAt(i * 2 + side, m4);
        }
      });
      wings.instanceMatrix.needsUpdate = true;
      // 浮尘：基准位置围着领队取模循环，加一点慢漂
      for (let i = 0; i < ND; i++) {
        const b = dBase[i], k = t * 0.15 + dSeed[i];
        dPos[i * 3] = wrap(b.x + Math.sin(k) * 0.6, center.x, 10); dPos[i * 3 + 1] = center.y + 0.3 + ((b.y + t * 0.05 + Math.sin(k * 1.7) * 0.3) % 6); dPos[i * 3 + 2] = wrap(b.z + Math.cos(k * 0.8) * 0.6, center.z, 10);
      }
      dGeo.attributes.position.needsUpdate = true;
      // 落叶
      lf.forEach((l, i) => {
        const cyc = l.y0 / l.fall, u = ((t + l.ph) % cyc) / cyc, k = t * 1.6 + l.ph;
        p.set(wrap(l.x + Math.sin(k) * 0.5, center.x, 9), center.y + l.y0 * (1 - u), wrap(l.z + Math.cos(k * 0.7) * 0.5, center.z, 9));
        e.set(Math.sin(k) * 1.2, k * 0.8, Math.cos(k * 1.3) * 0.9); q.setFromEuler(e); s.setScalar(u > 0.97 ? 0 : 1);
        m4.compose(p, q, s); leaves.setMatrixAt(i, m4);
      });
      leaves.instanceMatrix.needsUpdate = true;
      // 萤火：领队在苔藤门附近才渐显
      const near = 1 - THREE.MathUtils.smoothstep(Math.abs(leader.z + 15), 9, 16);
      (ff.material as THREE.PointsMaterial).opacity = 0.85 * near; ff.visible = near > 0.01;
      if (ff.visible) for (let i = 0; i < NF; i++) {
        const b = fBase[i], k = t * 0.6 + i * 1.7;
        fPos[i * 3] = b.x + Math.sin(k) * 0.5; fPos[i * 3 + 1] = b.y + Math.sin(k * 1.3) * 0.3; fPos[i * 3 + 2] = b.z + Math.cos(k * 0.9) * 0.5;
      }
      if (ff.visible) fGeo.attributes.position.needsUpdate = true;
    },
  };
}
