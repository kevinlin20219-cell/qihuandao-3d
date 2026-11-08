// 批次内贴图去重：每个 GLB 改存成 <名>.json（glTF 文本）+ <名>.bin.wasm（网格数据），贴图拆成共享文件 shared/tex_<md5>.wasm。
// 同一张图集在多个模型里只下载一次（.wasm 后缀只为发布页能上传，内容仍是 KTX2 / 二进制）。清单里的 glb 路径一并改成 .json。
// 用法：node tools/share_textures.mjs <incoming/批次目录>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const dir = process.argv[2]; fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
const manP = path.join(dir, 'scene_manifest.json'), man = JSON.parse(fs.readFileSync(manP, 'utf8'));
let before = 0; const seen = new Map();
const glbs = [...new Set(man.items.flatMap((it) => [it.glb, it.lod?.glb]).filter((g) => g && g.endsWith('.glb')))];
const renamed = {};
for (const g of glbs) {
  const p = path.join(dir, g); before += fs.statSync(p).size;
  const doc = await io.read(p), base = g.replace(/\.glb$/, '');
  for (const t of doc.getRoot().listTextures()) {
    const im = t.getImage(); if (!im) continue;
    const h = crypto.createHash('md5').update(im).digest('hex').slice(0, 12), name = `shared/tex_${h}.wasm`;
    if (!seen.has(h)) { fs.writeFileSync(path.join(dir, name), im); seen.set(h, im.byteLength); }
    t.setURI(name);
  }
  doc.getRoot().listBuffers().forEach((b, i) => b.setURI(`${base}${i ? '_' + i : ''}.bin.wasm`));
  const { json, resources } = await io.writeJSON(doc);
  for (const [uri, data] of Object.entries(resources)) if (!uri.startsWith('shared/')) fs.writeFileSync(path.join(dir, uri), data);
  // 贴图后缀是 .wasm，写出的 mimeType 会被猜成 image/wasm、KTX2 标记也丢了：改回 image/ktx2 + KHR_texture_basisu
  for (const im of json.images || []) if (im.uri?.startsWith('shared/')) im.mimeType = 'image/ktx2';
  for (const t of json.textures || []) if ('source' in t) { t.extensions = { ...(t.extensions || {}), KHR_texture_basisu: { source: t.source } }; delete t.source; }
  fs.writeFileSync(path.join(dir, base + '.json'), JSON.stringify(json)); fs.unlinkSync(p); renamed[g] = base + '.json';
}
for (const it of man.items) { if (renamed[it.glb]) it.glb = renamed[it.glb]; if (it.lod && renamed[it.lod.glb]) it.lod.glb = renamed[it.lod.glb]; }
fs.writeFileSync(manP, JSON.stringify(man, null, 1));
const after = fs.readdirSync(dir, { recursive: true }).filter((f) => /\.(json|wasm)$/.test(f) && f !== 'scene_manifest.json').reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
console.log(JSON.stringify({ models: glbs.length, sharedTextures: seen.size, beforeMB: +(before / 1048576).toFixed(2), afterMB: +(after / 1048576).toFixed(2) }));
