import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// KTX2（Basis）贴图和 meshopt 压缩网格的解码器；transcoder 文件在 public/basis/
let ktx2: KTX2Loader | null = null;
export function initLoaders(renderer: THREE.WebGLRenderer) {
  if (ktx2) return;
  ktx2 = new KTX2Loader().setTranscoderPath(new URL('basis/', document.baseURI).href).detectSupport(renderer);
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
