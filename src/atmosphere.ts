// v49 大气层次（0124：环境对照二维目标，游戏侧要做的部分）
// 1) 空气透视：远处的雾从暖白慢慢偏蓝（二维图远山是淡蓝的），近处不变。
// 2) 峡谷水雾：世界高度低于 y≈-1 的东西，越深、越远越被一层浅蓝白的水雾盖住，峡谷才有“往下很深”的感觉。
// 3) 瀑布底部的水雾片：软圆形贴图，跟着风时间慢慢呼吸。
// 全部改在 three 的雾代码块里：所有吃雾的材质一起生效，不加绘制次数。必须在第一次渲染前调用。
import * as THREE from 'three';

export const ATMO = {
  far: new THREE.Color(0xaac4d6),   // 远处偏蓝
  mist: new THREE.Color(0xdde8e6),  // 峡谷水雾
  mistTop: -2.0, mistDepth: 13.0,   // 从 y=-2 往下 13 m 雾到最浓
  mistMax: 0.45,
};

export function installAtmosphere() {
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  if (C.fog_vertex.includes('vFogWY')) return;
  const v3 = (c: THREE.Color) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
  C.fog_pars_vertex = `#ifdef USE_FOG\n  varying float vFogDepth;\n  varying float vFogWY;\n#endif\n`;
  // 世界高度 = 相机位置 + 视空间位移转回世界（视矩阵的旋转部分正交，转置即逆）；精灵等没有 transformed 的着色器也能用
  C.fog_vertex = `#ifdef USE_FOG\n  vFogDepth = - mvPosition.z;\n  vFogWY = cameraPosition.y + (transpose(mat3(viewMatrix)) * mvPosition.xyz).y;\n#endif\n`;
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogWY;');
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    vec3 fogC = fogColor;
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    vec3 fogC = mix( fogColor, ${v3(ATMO.far)}, smoothstep( fogNear, fogFar * 1.25, vFogDepth ) );
    float mistH = clamp( ( ${ATMO.mistTop.toFixed(2)} - vFogWY ) / ${ATMO.mistDepth.toFixed(2)}, 0.0, 1.0 );
    float mistF = mistH * mistH * (3.0 - 2.0 * mistH) * smoothstep( 8.0, 40.0, vFogDepth ) * ${ATMO.mistMax.toFixed(2)};
    gl_FragColor.rgb = mix( gl_FragColor.rgb, ${v3(ATMO.mist)}, mistF );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
#endif
`;
}

let mistTex: THREE.Texture | null = null;
function softDisc() {
  if (mistTex) return mistTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  mistTex = new THREE.CanvasTexture(c); mistTex.colorSpace = THREE.SRGBColorSpace; return mistTex;
}

/** 瀑布（FLOW_ 瀑布网格）底部摆一圈水雾片；t = 风时间（暂停即停） */
export function addFallMist(fall: THREE.Mesh, t: { value: number }) {
  const box = new THREE.Box3().setFromObject(fall); if (box.isEmpty()) return null;
  const g = new THREE.Group(); g.name = 'fall_mist';
  const w = Math.max(1.5, box.max.x - box.min.x, box.max.z - box.min.z), cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const mat = new THREE.SpriteMaterial({ map: softDisc(), color: 0xf2f6f4, transparent: true, opacity: 0.5, depthWrite: false, fog: true });
  const n = 6, rnd = (i: number) => ((Math.sin(i * 57.3 + cx) * 43758.5) % 1 + 1) % 1;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(mat.clone()), sc = w * (0.55 + rnd(i) * 0.5);
    s.position.set(cx + (rnd(i + 1) - 0.5) * w * 0.9, box.min.y + 0.4 + rnd(i + 2) * 1.2, cz + (rnd(i + 3) - 0.5) * w * 0.6);
    s.scale.set(sc, sc * 0.6, 1); s.userData.ph = rnd(i + 4) * 6.28; s.userData.base = s.position.y; s.renderOrder = 4;
    s.onBeforeRender = () => { const k = t.value * 0.5 + s.userData.ph; (s.material as THREE.SpriteMaterial).opacity = 0.32 + Math.sin(k) * 0.12; s.position.y = s.userData.base + Math.sin(k * 0.7) * 0.25; };
    g.add(s);
  }
  return g;
}

/** v49：路边植被加密——复用入口已有的蕨 / 花实例网格（同几何同材质，风照样动），按区域各建一个 InstancedMesh，
 * 用物理射线贴地，避开中间主路和玩法圈。每区一个网格，视锥剔除按区生效。返回新增的实例数和三角数。 */
export function densifyPlants(scene: THREE.Scene, ray: (from: THREE.Vector3, dir: THREE.Vector3, max: number) => number | null, avoid: THREE.Vector3[], triBudget = 120000, skip: (x: number, z: number) => boolean = () => false, drop: string[] = []) {
  const sets: { parts: { mesh: THREE.InstancedMesh; tris: number; loc: THREE.Matrix4 }[] }[] = [];
  for (const name of ['env_style_fern_0', 'env_style_flowers_0']) {
    const g = scene.getObjectByName(name); if (!g) continue;
    const ims: THREE.InstancedMesh[] = []; g.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) ims.push(o as THREE.InstancedMesh); });
    if (!ims.length) continue;
    // 第 0 株（所有子网格的第 0 个实例）的包围盒：底面中心挪到原点，得到“一株”的局部变换
    const box = new THREE.Box3(), mtx = new THREE.Matrix4();
    for (const im of ims) { im.getMatrixAt(0, mtx); im.geometry.computeBoundingBox(); box.union(im.geometry.boundingBox!.clone().applyMatrix4(mtx)); }
    const c = box.getCenter(new THREE.Vector3()), shift = new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z);
    sets.push({ parts: ims.map((im) => { const k = new THREE.Matrix4(); im.getMatrixAt(0, k); const geo = im.geometry; return { mesh: im, tris: (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3, loc: shift.clone().multiply(k) }; }) });
  }
  const srcs = sets.flatMap((st) => st.parts);
  if (!srcs.length) return { added: 0, tris: 0 };
  // 区域：x 半宽范围、z 范围、每平米密度（主路 |x| < inner 不放）
  const regions = [
    { name: 'gatepath', z: [8.6, -1], inner: 2.0, outer: 10, n: 160 }, // v54：门后到岔路口，替掉收起的灰盒草花
    { name: 'slope', z: [-16, -33], inner: 2.3, outer: 8, n: 200 },
    { name: 'bridgehead', z: [-33, -48], inner: 2.0, outer: 9, n: 170 },
    { name: 'glade', z: [-78, -95], inner: 3.0, outer: 9, n: 130 },
  ];
  const perTri = srcs.reduce((a, s) => a + s.tris, 0); // 一株（所有子网格）三角数
  const scaleN = Math.min(1, triBudget / Math.max(1, perTri * regions.reduce((a, r) => a + r.n, 0)));
  const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const down = new THREE.Vector3(0, -1, 0), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), from = new THREE.Vector3();
  let added = 0, tris = 0;
  for (const r of regions) {
    if (drop.includes(r.name)) continue; // v60：新环境已经铺好的区域（0213）不再加种；密度系数仍按全部区域算，入口段不变
    const pts: THREE.Matrix4[] = [], want = Math.round(r.n * scaleN);
    for (let k = 0; k < want * 4 && pts.length < want; k++) {
      const side = rnd() < 0.5 ? -1 : 1, x = side * (r.inner + rnd() * (r.outer - r.inner)), z = r.z[0] + (r.z[1] - r.z[0]) * rnd();
      if (skip(x, z)) continue; // 0179：新模型自己已铺植物的地方不再加种
      from.set(x, 30, z); const t = ray(from, down, 60); if (t === null) continue;
      const y = 30 - t; if (y < -3) continue; // 掉进峡谷的不要
      const p = new THREE.Vector3(x, y, z); if (avoid.some((a) => a.distanceToSquared(p) < 2.2 * 2.2)) continue;
      const s = 0.8 + rnd() * 0.5; pts.push(m.compose(p, q.setFromAxisAngle(up, rnd() * Math.PI * 2), new THREE.Vector3(s, s * (0.9 + rnd() * 0.25), s)).clone());
    }
    if (!pts.length) continue;
    // 蕨和花按 3:1 分；每种植物的几个子网格一起摆，保持相对位置
    const grp = new THREE.Group(); grp.name = `dense_${r.name}`;
    for (const [si, set] of sets.entries()) {
      const mine = pts.filter((_, i) => (sets.length === 1 ? true : si === 0 ? i % 4 !== 3 : i % 4 === 3)); if (!mine.length) continue;
      for (const sm of set.parts) {
        const im = new THREE.InstancedMesh(sm.mesh.geometry, sm.mesh.material, mine.length);
        mine.forEach((mm, i) => im.setMatrixAt(i, mm.clone().multiply(sm.loc)));
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = true; im.name = sm.mesh.name;
        grp.add(im); tris += mine.length * sm.tris;
      }
      added += mine.length;
    }
    scene.add(grp);
  }
  return { added, tris: Math.round(tris) };
}
