// GLB 导入检查：按 docs/资产需求与导入规范_v0.2.md 检查 Codex 交付的模型。
// 用法：node tools/check_glb.mjs <文件.glb> [--char <角色id>] [--out <报告.json>]
// 角色 id：tangtuan hanhan paipai youyou beibei oudi jiaxun jiashuo
import { NodeIO } from '@gltf-transform/core';
import fs from 'node:fs';
import path from 'node:path';

const HEIGHTS = { tangtuan: 1.50, hanhan: 1.50, paipai: 1.32, youyou: 1.22, beibei: 1.26, oudi: 1.20, jiaxun: 1.35, jiashuo: 1.08 };
const REQUIRED_BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const COMMON_CLIPS_P0 = ['idle', 'walk', 'run', 'jump_start', 'jump_air', 'jump_land', 'interact', 'push_idle', 'push_walk', 'climb_up', 'fall', 'get_up', 'talk', 'cheer', 'sit_campfire', 'scared', 'wave', 'boost_give', 'boost_get', 'rope_pull'];
const FIRST_BATCH = ['idle', 'walk', 'run', 'push_idle', 'push_walk', 'skill_observe'];
const LIMITS = { charTris: 40000, bones: 70, materials: 4, texMax: 2048 };

const args = process.argv.slice(2);
const file = args[0];
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const charId = opt('--char');
const outPath = opt('--out');
if (!file) { console.error('用法：node tools/check_glb.mjs <文件.glb> [--char id] [--out 报告.json]'); process.exit(2); }

const io = new NodeIO();
const doc = await io.read(file);
const root = doc.getRoot();
const issues = [], notes = [];
const fail = (m) => issues.push(m), note = (m) => notes.push(m);

// ---- 包围盒（用顶点位置 × 节点世界矩阵） ----
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
let tris = 0;
function mul(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]; }
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const wm = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'); if (!pos) continue;
    const idx = prim.getIndices();
    tris += (idx ? idx.getCount() : pos.getCount()) / 3;
    const v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); const w = mul(wm, v); for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); } }
  }
}
const size = max.map((x, i) => +(x - min[i]).toFixed(3));
const height = size[1];

// ---- 节点、骨骼、动画、材质、贴图 ----
const nodeNames = root.listNodes().map((n) => n.getName());
const skins = root.listSkins();
const joints = skins.length ? skins[0].listJoints().map((j) => j.getName()) : [];
const clips = root.listAnimations().map((a) => a.getName());
const mats = root.listMaterials();
const texs = root.listTextures().map((t) => ({ name: t.getName() || t.getURI(), size: t.getSize(), mime: t.getMimeType() }));
const scales = root.listNodes().filter((n) => !n.getParentNode?.() || true).map((n) => ({ name: n.getName(), s: n.getScale() })).filter((x) => x.s.some((v) => Math.abs(v - 1) > 1e-3));

// ---- 判定 ----
if (charId) {
  const want = HEIGHTS[charId];
  if (!want) fail(`未知角色 id：${charId}`);
  else {
    const diff = height - want;
    if (Math.abs(diff) > 0.03) fail(`身高 ${height.toFixed(3)} m，规范 ${want} m，差 ${(diff * 100).toFixed(1)} cm（允许 ±3 cm，含头发）`);
    else note(`身高 ${height.toFixed(3)} m（规范 ${want} m）`);
  }
  if (Math.abs(min[1]) > 0.02) fail(`原点不在脚底：最低点 y = ${min[1].toFixed(3)} m（应为 0，误差 ±2 cm）`);
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
  if (Math.abs(cx) > 0.05 || Math.abs(cz) > 0.08) fail(`原点不在两脚之间：包围盒中心偏移 x=${cx.toFixed(3)} z=${cz.toFixed(3)} m`);
  if (tris > LIMITS.charTris) fail(`三角面 ${Math.round(tris)}，超过 ${LIMITS.charTris}`);
  if (!skins.length) fail('没有骨骼（skin）');
  else {
    if (joints.length > LIMITS.bones) fail(`骨骼数 ${joints.length}，超过 ${LIMITS.bones}`);
    const miss = REQUIRED_BONES.filter((b) => !joints.includes(b));
    if (miss.length) fail(`缺少规定骨骼名：${miss.join(', ')}`);
  }
  if (mats.length > LIMITS.materials) fail(`材质 ${mats.length} 个，超过 ${LIMITS.materials}`);
  const missFirst = FIRST_BATCH.filter((c) => !clips.includes(c));
  if (missFirst.length) note(`第一批动作尚缺：${missFirst.join(', ')}`);
  const unknown = clips.filter((c) => !COMMON_CLIPS_P0.includes(c) && !/^skill_|^inspect_|^comfort$|^sense_|^climb_vine$|^perform$|^play_piano$|^dance_|^prank_|^crawl$|^fix_small$|^hold_hand$/.test(c));
  if (unknown.length) fail(`动作片段名不在规范里：${unknown.join(', ')}`);
  // 朝向：脸部朝 +Z。用 Head 骨骼和 LeftArm/RightArm 粗判（左手应在 +X 侧，正面朝 +Z 时）
  const findNode = (n) => root.listNodes().find((x) => x.getName() === n);
  const la = findNode('LeftArm'), ra = findNode('RightArm');
  if (la && ra) {
    const lx = la.getWorldTranslation()[0], rx = ra.getWorldTranslation()[0];
    if (!(lx > rx)) fail(`朝向可能不对：角色左手在 x=${lx.toFixed(2)}，右手在 x=${rx.toFixed(2)}；正面朝 +Z 时左手应在 +X 侧`);
    else note('朝向：左手在 +X 侧，符合正面朝 +Z');
  }
  // 原地动作：Hips 平移在 X/Z 方向不应变化
  for (const anim of root.listAnimations()) {
    for (const ch of anim.listChannels()) {
      if (ch.getTargetPath() !== 'translation' || ch.getTargetNode()?.getName() !== 'Hips') continue;
      const out = ch.getSampler().getOutput(); const v = [0, 0, 0]; let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (let i = 0; i < out.getCount(); i++) { out.getElement(i, v); mnx = Math.min(mnx, v[0]); mxx = Math.max(mxx, v[0]); mnz = Math.min(mnz, v[2]); mxz = Math.max(mxz, v[2]); }
      const drift = Math.max(mxx - mnx, mxz - mnz);
      if (drift > 0.05) fail(`动作「${anim.getName()}」的 Hips 在水平方向移动了 ${drift.toFixed(2)} 个单位，规范要求原地动作`);
    }
  }
}
for (const t of texs) {
  if (!t.size) continue;
  const [w, h] = t.size;
  const pow2 = (x) => (x & (x - 1)) === 0;
  if (!pow2(w) || !pow2(h)) fail(`贴图 ${t.name} 尺寸 ${w}×${h} 不是 2 的幂`);
  if (Math.max(w, h) > LIMITS.texMax) fail(`贴图 ${t.name} 尺寸 ${w}×${h}，超过 ${LIMITS.texMax}`);
}
if (scales.length) note(`有 ${scales.length} 个节点缩放不为 1（规范要求导出前应用缩放）：${scales.slice(0, 5).map((x) => x.name).join(', ')}`);
const prefixed = nodeNames.filter((n) => /^(COL_|MK_|PUSH_|CRAWL_|HOLE_|FRAGILE_|CLIMB_|ANIM_)/.test(n));

const report = {
  file: path.basename(file), checked_at: new Date().toISOString(), char: charId,
  bbox_m: { min: min.map((x) => +x.toFixed(3)), max: max.map((x) => +x.toFixed(3)), size },
  triangles: Math.round(tris), bones: joints.length, joints, clips, materials: mats.map((m) => m.getName()), textures: texs,
  gameplay_nodes: prefixed, issues, notes, pass: issues.length === 0,
};
const json = JSON.stringify(report, null, 1);
if (outPath) fs.writeFileSync(outPath, json);
console.log(`${report.pass ? '通过' : '未通过'}：${report.file}  高 ${height.toFixed(3)} m，${report.triangles} 面，${report.bones} 骨骼，${clips.length} 个动作`);
for (const m of issues) console.log('  ✗ ' + m);
for (const m of notes) console.log('  · ' + m);
process.exit(report.pass ? 0 : 1);
