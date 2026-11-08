// 把 B 模型里 A 没有的动作片段，按骨骼名复制到 A（同一套骨架）。用法：node tools/merge_clips.mjs <A.glb> <B.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [a, b, out] = process.argv.slice(2);
const A = await io.read(a), B = await io.read(b);
const ra = A.getRoot(), buf = ra.listBuffers()[0];
const have = new Set(ra.listAnimations().map((x) => x.getName()));
const byName = new Map(ra.listNodes().map((n) => [n.getName(), n]));
let added = 0, missing = new Set();
for (const anim of B.getRoot().listAnimations()) {
  if (have.has(anim.getName())) continue;
  const na = A.createAnimation(anim.getName());
  for (const ch of anim.listChannels()) {
    const tn = ch.getTargetNode(); const dst = tn && byName.get(tn.getName()); if (!dst) { missing.add(tn?.getName()); continue; }
    const s = ch.getSampler();
    const inp = A.createAccessor().setType(s.getInput().getType()).setArray(s.getInput().getArray().slice()).setBuffer(buf);
    const outp = A.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(buf).setNormalized(s.getOutput().getNormalized());
    const ns = A.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation(s.getInterpolation());
    na.addSampler(ns).addChannel(A.createAnimationChannel().setTargetNode(dst).setTargetPath(ch.getTargetPath()).setSampler(ns));
  }
  added++;
}
await io.write(out, A);
console.log(JSON.stringify({ added, total: ra.listAnimations().length, missing: [...missing] }));
