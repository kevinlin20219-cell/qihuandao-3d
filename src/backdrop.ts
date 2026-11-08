// 远景层（宣传片 5s / 8s / 74s）：天边的浮岛 + 瀑布、脚下的云海、太阳光晕。
// 一整圈画在画布上的远景环 + 一层云海环，跟着镜头走（像天空盒），不参与雾和阴影，几乎不占性能。
import * as THREE from 'three';

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

/** 画一圈远景：暖色薄雾里的浮岛剪影（顶上是树、底下是倒锥形的岩石）、垂下来的瀑布 */
function paintIslands(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const r = rng(11);
  const island = (x: number, y: number, s: number, far: number) => {
    // far：0 近 → 1 远，越远越淡、越偏天空色
    const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const haze = [246, 222, 182];
    const rock = mix([138, 112, 78], haze, 0.2 + far * 0.5), rockDark = mix([96, 74, 48], haze, 0.2 + far * 0.5);
    const tree = mix([104, 124, 52], haze, 0.15 + far * 0.5), treeHi = mix([182, 176, 84], haze, 0.15 + far * 0.45);
    const css = (v: number[]) => `rgb(${v[0]},${v[1]},${v[2]})`;
    // 倒锥形的岛底（岩石）
    g.fillStyle = css(rockDark);
    g.beginPath(); g.moveTo(x - s, y);
    for (let i = 0; i <= 10; i++) { const t = i / 10; g.lineTo(x - s + 2 * s * t, y + Math.sin(t * Math.PI) * s * (0.9 + r() * 0.5) * (0.6 + 0.4 * Math.abs(Math.sin(t * 7)))); }
    g.closePath(); g.fill();
    g.fillStyle = css(rock); g.beginPath(); g.ellipse(x - s * 0.1, y + s * 0.12, s * 0.95, s * 0.22, 0, 0, Math.PI * 2); g.fill();
    // 岛顶的树冠：一团团圆
    for (let i = 0; i < 14; i++) {
      const tx = x - s * 0.9 + r() * s * 1.8, ty = y - r() * s * 0.25, tr = s * (0.12 + r() * 0.16);
      g.fillStyle = css(tree); g.beginPath(); g.arc(tx, ty, tr, 0, Math.PI * 2); g.fill();
      g.fillStyle = css(treeHi); g.beginPath(); g.arc(tx - tr * 0.3, ty - tr * 0.35, tr * 0.55, 0, Math.PI * 2); g.fill();
    }
    // 瀑布：从岛边垂下的一条白色渐隐
    if (r() > 0.35) {
      const wx = x + (r() - 0.5) * s * 1.2, ww = s * (0.05 + r() * 0.05), wl = s * (1.6 + r() * 1.4);
      const gr = g.createLinearGradient(0, y, 0, y + wl); gr.addColorStop(0, `rgba(255,252,240,${0.9 - far * 0.4})`); gr.addColorStop(1, 'rgba(255,252,240,0)');
      g.fillStyle = gr; g.fillRect(wx, y + s * 0.05, ww, wl);
    }
  };
  // 三层：远 → 近
  for (const [n, far, smin, smax, ymin, ymax] of [[10, 0.75, 26, 44, 0.18, 0.26], [7, 0.45, 40, 66, 0.24, 0.32], [4, 0.2, 60, 90, 0.30, 0.38]] as const) {
    for (let i = 0; i < n; i++) island(((i + r() * 0.7) / n) * w, h * (ymin + r() * (ymax - ymin)), smin + r() * (smax - smin), far);
  }
  return c;
}

/** 云海：下沿是白云，越往上越透明 */
function paintClouds(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; const r = rng(5);
  for (let i = 0; i < 260; i++) {
    const x = r() * w, y = h * (0.35 + r() * 0.65), s = 18 + r() * 46;
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    const warm = r() > 0.5 ? '255,244,224' : '255,233,200';
    gr.addColorStop(0, `rgba(${warm},0.55)`); gr.addColorStop(1, `rgba(${warm},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
  }
  const fade = g.createLinearGradient(0, 0, 0, h); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.45, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, w, h);
  return c;
}

export interface Backdrop { group: THREE.Group; update(camera: THREE.Camera): void }

export function createBackdrop(sunDir: THREE.Vector3): Backdrop {
  const group = new THREE.Group(); group.name = 'backdrop';
  const tex = (cv: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  const ringMat = (map: THREE.Texture, opacity = 1) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.BackSide });
  // 远景浮岛环：半径 420，高 260，环的中线略低于地平线
  const islands = new THREE.Mesh(new THREE.CylinderGeometry(420, 420, 260, 64, 1, true), ringMat(tex(paintIslands(4096, 512))));
  islands.position.y = -30; islands.renderOrder = -10; group.add(islands);
  // 云海环：低一点、更宽
  const cl = tex(paintClouds(2048, 256)); cl.repeat.set(2, 1);
  const clouds = new THREE.Mesh(new THREE.CylinderGeometry(380, 380, 90, 64, 1, true), ringMat(cl, 0.95));
  clouds.position.y = -62; clouds.renderOrder = -9; group.add(clouds);
  // 脚下的云海平面（从峡谷边往外看得到）
  const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshBasicMaterial({ color: 0xf6e7cc, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -95; sea.renderOrder = -11; group.add(sea);
  // 太阳光晕
  const sc = document.createElement('canvas'); sc.width = sc.height = 256; const sg = sc.getContext('2d')!;
  const rg = sg.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, 'rgba(255,250,232,1)'); rg.addColorStop(0.12, 'rgba(255,236,190,0.95)'); rg.addColorStop(0.35, 'rgba(255,214,150,0.35)'); rg.addColorStop(1, 'rgba(255,200,130,0)');
  sg.fillStyle = rg; sg.fillRect(0, 0, 256, 256);
  const sunTex = new THREE.CanvasTexture(sc); sunTex.colorSpace = THREE.SRGBColorSpace;
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sun.scale.setScalar(110); (sun.material as THREE.SpriteMaterial).opacity = 0.55; // 逆光方向时不要白成一片 sun.position.copy(sunDir).normalize().multiplyScalar(380); sun.renderOrder = -8; group.add(sun);
  return {
    group,
    update(camera) { group.position.set(camera.position.x, 0, camera.position.z); },
  };
}
