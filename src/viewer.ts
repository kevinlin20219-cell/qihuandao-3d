// 模型检查页：用与游戏相同的灯光、色调映射渲染交付模型，旁边放八人身高参照。
// 用法：viewer.html?glb=<地址>&char=tangtuan
import * as THREE from 'three';
import { loadGLB, initLoaders } from "./assets";
import { CHARS, CharId } from './data/characters';

const params = new URLSearchParams(location.search);
const url = params.get('glb')!;
const charId = (params.get('char') || 'tangtuan') as CharId;
const selfShadow = params.get('selfshadow') !== '0';
const fill = params.get('fill') === '1';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
initLoaders(renderer);
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9d3bd);
scene.add(new THREE.HemisphereLight(0xdcecff, 0x5d6b3a, 1.1));
const sun = new THREE.DirectionalLight(0xffe2b0, 2.6);
sun.position.set(4, 7, 5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
scene.add(sun);
if (fill) { const f = new THREE.DirectionalLight(0xfff1dc, 0.9); f.position.set(0, 1.5, 6); scene.add(f); const rim = new THREE.DirectionalLight(0xcfe3ff, 0.6); rim.position.set(-3, 3, -4); scene.add(rim); }
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x6f9a4a, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
// 刻度：每 10 cm 一道，标出规范身高
const want = CHARS[charId].height;
const ruler = new THREE.Group(); ruler.position.set(-0.75, 0, 0); scene.add(ruler);
for (let i = 0; i <= 18; i++) {
  const w = i % 5 === 0 ? 0.12 : 0.06;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.006, 0.006), new THREE.MeshBasicMaterial({ color: 0x24382b }));
  m.position.y = i * 0.1; ruler.add(m);
}
const pole = new THREE.Mesh(new THREE.BoxGeometry(0.01, 1.8, 0.01), new THREE.MeshBasicMaterial({ color: 0x24382b })); pole.position.y = 0.9; ruler.add(pole);
const wantLine = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.008, 0.008), new THREE.MeshBasicMaterial({ color: 0xd9573f }));
wantLine.position.set(0, want, 0); scene.add(wantLine);
// +Z 箭头（模型正面应该朝这个方向）
const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.01, 0.3), 0.5, 0x2f5a3e, 0.12, 0.08); scene.add(arrow);
// 八人身高参照（灰盒胶囊，放在右侧）
const order: CharId[] = ['tangtuan', 'hanhan', 'jiaxun', 'paipai', 'beibei', 'youyou', 'oudi', 'jiashuo'];
order.forEach((id, i) => {
  const d = CHARS[id];
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, d.height - 0.22, 4, 10), new THREE.MeshStandardMaterial({ color: d.body, roughness: 0.8 }));
  cap.position.set(0.85 + i * 0.3, d.height / 2, -0.4); cap.castShadow = true; scene.add(cap);
});
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 50);
const views: Record<string, { pos: [number, number, number]; look: [number, number, number] }> = {
  front: { pos: [0, 0.85, 4.6], look: [0, 0.75, 0] },
  back: { pos: [0, 0.85, -4.6], look: [0, 0.75, 0] },
  side: { pos: [4.6, 0.85, 0], look: [0, 0.75, 0] },
  threequarter: { pos: [2.6, 1.3, 3.4], look: [0, 0.75, 0] },
  face: { pos: [0, 1.32, 1.15], look: [0, 1.28, 0] },
  lineup: { pos: [1.0, 0.95, 5.6], look: [1.0, 0.7, 0] },
};
function setView(name: string) {
  const v = views[name]; camera.position.set(...v.pos); camera.lookAt(new THREE.Vector3(...v.look));
  document.getElementById('tag')!.textContent = { front: '正面（+Z 方向看）', back: '背面', side: '侧面（+X 方向看）', threequarter: '3/4 视角', face: '面部近景', lineup: '与八人身高参照并排' }[name] || name;
  renderer.render(scene, camera);
}
function setCam(pos: [number, number, number], look: [number, number, number], tag = '自定义机位') {
  camera.position.set(...pos); camera.lookAt(new THREE.Vector3(...look));
  document.getElementById('tag')!.textContent = tag; renderer.render(scene, camera);
}
(window as any).__view = { setView, setCam, ready: false };
loadGLB(url).then((m) => {
  if (!selfShadow) m.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = false; });
  scene.add(m.scene);
  const s = m.bbox.getSize(new THREE.Vector3());
  document.getElementById('info')!.textContent =
    `${CHARS[charId].name} · ${url.split('/').pop()}\n加载 ${m.ms} ms · ${m.triangles} 三角面 · ${m.meshes} 网格 · ${m.materials} 材质 · ${m.textures} 贴图\n包围盒 宽 ${s.x.toFixed(3)} × 高 ${s.y.toFixed(3)} × 深 ${s.z.toFixed(3)} m，最低点 y=${m.bbox.min.y.toFixed(3)}\n红线 = 规范身高 ${want} m；绿箭头 = +Z（正面应朝向）`;
  (window as any).__view.ready = true; (window as any).__view.stats = { ms: m.ms, triangles: m.triangles, size: s.toArray(), min: m.bbox.min.toArray() };
  setView('front');
}).catch((e) => { document.getElementById('info')!.textContent = '加载失败：' + e.message; });
