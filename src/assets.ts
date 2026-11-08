import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// KTX2（Basis）贴图和 meshopt 压缩网格的解码器；transcoder 文件在 public/basis/
let ktx2: KTX2Loader | null = null;
/** 0316：Windows 实测石头、树干、部分地面纯黑。原因：17 张 ETC1S 贴图尺寸不是 4 的倍数（627×627、498×332…）且带 mip，
 *  桌面显卡转成 BC1/BC3/BC7 后 WebGL 拒绝上传，贴图不完整，采样全黑；云端 SwiftShader 走别的格式所以看不出来。
 *  这类贴图改由第二个解码器解成未压缩 RGBA（多占一点显存），其余照旧压缩。?ktx4=0 关闭 */
class SafeKTX2Loader extends KTX2Loader {
  raw: KTX2Loader | null = null; rawCount = 0;
  async _createTexture(buffer: ArrayBuffer, config: Record<string, unknown> = {}): Promise<THREE.CompressedTexture> {
    try {
      const v = new DataView(buffer);
      const w = v.getUint32(20, true), h = v.getUint32(24, true), levels = v.getUint32(40, true);
      if (this.raw && levels > 1 && (w % 4 || h % 4)) { this.rawCount++; return (this.raw as any)._createTexture(buffer, config); }
    } catch { /* 头读不出来就按原逻辑 */ }
    return (KTX2Loader.prototype as any)._createTexture.call(this, buffer, config);
  }
}
export function initLoaders(renderer: THREE.WebGLRenderer) {
  if (ktx2) return;
  const path = new URL('basis/', document.baseURI).href;
  const k = new SafeKTX2Loader().setTranscoderPath(path).detectSupport(renderer) as SafeKTX2Loader;
  if (new URLSearchParams(location.search).get('ktx4') !== '0') {
    const raw = new KTX2Loader().setTranscoderPath(path).detectSupport(renderer);
    const wc = (raw as any).workerConfig as Record<string, boolean>;
    for (const key of Object.keys(wc)) if (/Supported$/.test(key)) wc[key] = false; // 只剩未压缩 RGBA32
    k.raw = raw;
  }
  ktx2 = k; (window as any).__qhdKtx = k;
}

export interface LoadedModel {
  scene: THREE.Group;
  ms: number;
  triangles: number;
  meshes: number;
  materials: number;
  textures: number;
  bbox: THREE.Box3;
  animations: THREE.AnimationClip[];
}

/** 加载 Codex 交付的 GLB。只读，不修改原文件。 */
THREE.Cache.enabled = true; // 0111：共享贴图文件（shared/tex_*.wasm）多个模型引用时只下载一次
export async function loadGLB(url: string): Promise<LoadedModel> {
  const t0 = performance.now();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (ktx2) loader.setKTX2Loader(ktx2);
  const gltf = await loader.loadAsync(url);
  const scene = gltf.scene;
  let triangles = 0, meshes = 0;
  const mats = new Set<THREE.Material>(), texs = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    m.castShadow = true; m.receiveShadow = true;
    const g = m.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      mats.add(mat);
      for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture) texs.add(v as THREE.Texture);
    }
  });
  scene.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(scene);
  return { scene, ms: Math.round(performance.now() - t0), triangles: Math.round(triangles), meshes, materials: mats.size, textures: texs.size, bbox, animations: gltf.animations };
}
