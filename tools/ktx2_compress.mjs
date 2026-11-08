// 贴图压缩成 KTX2（Basis UASTC + Zstd）：显存约降到 1/4，画质基本看不出差别。
// 用法：node tools/ktx2_compress.mjs <输入.glb> <输出.glb> [--etc1s] [--meshopt]   （--etc1s：颜色贴图用 ETC1S，文件更小、细节略损，适合场景大贴图）
// 人物默认全部 UASTC（脸和眼睛要清楚）；法线贴图始终 UASTC。
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { meshopt, dedup, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
const [inp, out, ...flags] = process.argv.slice(2);
if (!inp || !out) { console.error('用法：node tools/ktx2_compress.mjs <输入.glb> <输出.glb> [--etc1s]'); process.exit(2); }
const etc1s = flags.includes('--etc1s'), doMeshopt = flags.includes('--meshopt');
const imageDecoder = async (buf) => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8Array(data), width: info.width, height: info.height }; };
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
await doc.transform(dedup(), prune({ keepLeaves: true })); // keepLeaves：MK_ 挂点是空节点，不能被剪掉（0179 鹿角挂点）。0107：先清掉没用的旧贴图 / 重复数据，再压缩
// --lin1k：法线 / 粗糙金属贴图缩到 1024（这两类在小屏上看不出 2K 和 1K 的差别，体积占大头）
if (flags.includes('--lin1k')) {
  const lin = new Set();
  for (const m of doc.getRoot().listMaterials()) for (const t of [m.getNormalTexture(), m.getMetallicRoughnessTexture(), m.getOcclusionTexture()]) if (t) lin.add(t);
  for (const t of lin) { const [w, h] = t.getSize() || [0, 0]; if (Math.max(w, h) > 1024) t.setImage(new Uint8Array(await sharp(t.getImage()).resize(1024, 1024, { fit: 'inside' }).png().toBuffer())).setMimeType('image/png'); }
}
const before = doc.getRoot().listTextures().map((t) => ({ name: t.getName() || t.getURI(), mime: t.getMimeType(), bytes: t.getImage()?.byteLength, size: t.getSize() }));
const t0 = Date.now();
const q = { log: false, enableDebug: false, generateMipmap: true, needSupercompression: true, imageDecoder };
// 法线：UASTC + 法线模式，线性数据
await doc.transform(ktx2({ ...q, slots: /^normalTexture$/, isUASTC: true, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }));
// 粗糙 / 金属 / AO：线性数据（标成 sRGB 会让皮肤发亮发油）
await doc.transform(ktx2({ ...q, slots: /^(metallicRoughnessTexture|occlusionTexture)$/, isUASTC: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }));
// 颜色 / 自发光：sRGB
await doc.transform(ktx2({ ...q, slots: /^(baseColorTexture|emissiveTexture)$/, isUASTC: !etc1s, qualityLevel: 230, isPerceptual: true, isSetKTX2SRGBTransferFunc: true }));
// 其他少见的槽（清漆、光泽等）按线性处理
await doc.transform(ktx2({ ...q, isUASTC: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }));
// --meshopt：网格压缩（场景用；人物有骨骼动画，先不压）
if (doMeshopt) await doc.transform(dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
const after = doc.getRoot().listTextures().map((t) => ({ mime: t.getMimeType(), bytes: t.getImage()?.byteLength }));
const gpu = (list) => list.reduce((s, t) => s + (t.size ? t.size[0] * t.size[1] * 4 * 4 / 3 : 0), 0);
console.log(JSON.stringify({ input: inp, output: out, seconds: Math.round((Date.now() - t0) / 1000), textures: before.length,
  fileMB: [+(fs.statSync(inp).size / 1048576).toFixed(2), +(fs.statSync(out).size / 1048576).toFixed(2)],
  gpuTextureMB_est: [+(gpu(before) / 1048576).toFixed(1), +(gpu(before) / 4 / 1048576).toFixed(1)],
  mimes: [...new Set(after.map((a) => a.mime))] }, null, 1));
