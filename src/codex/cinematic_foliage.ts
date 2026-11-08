// Close legacy broad leaves can read as black floating boards in the bridge cinematic.
// Fade only their colour-pass alpha near the cinematic camera; keep shadows, wind,
// placements unchanged. Ordinary follow views clear only the body sight corridor.
// Shared bark materials are isolated; shadow/depth materials are not modified.
export function createCinematicFoliageFade(root) {
  const enabled = { value: 0 }, follow = { value: 0 }, targetDepth = { value: 0 }, clones = new WeakMap(), seen = new WeakSet();
  const stats = { meshes: 0, materials: 0 };
  function refresh() {
    root.traverse(mesh => {
      if (!mesh.isMesh || mesh.isSkinnedMesh || seen.has(mesh) || !/foliage|leaf|fern|grass|bush|broadleaf|crown_sprays|crown_lobes|soft_layered_crown/i.test(mesh.name) || /COL_|MK_|bark|trunk|root|stem/i.test(mesh.name)) return;
      seen.add(mesh);
      const patch = original => {
        if (!original || (!original.map && !original.vertexColors && !/^CH1_botanical_shared_intrinsic/.test(original.name))) return original;
        let material = clones.get(original);
        if (material) return material;
        material = original.clone();
        if (original._farDone) material._farDone = true;
        const previous = original.onBeforeCompile, key = original.customProgramCacheKey.bind(original);
        material.onBeforeCompile = function (shader, renderer) {
          previous.call(this, shader, renderer);
          shader.uniforms.uCinematicLeafFade = enabled;
          shader.uniforms.uFollowLeafFade = follow;
          shader.uniforms.uFollowTargetDepth = targetDepth;
          shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCinematicLeafDepth;\nvarying vec3 vFoliageViewPosition;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvCinematicLeafDepth = -mvPosition.z;\nvFoliageViewPosition = mvPosition.xyz;');
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCinematicLeafDepth;\nvarying vec3 vFoliageViewPosition;\nuniform float uCinematicLeafFade;\nuniform float uFollowLeafFade;\nuniform float uFollowTargetDepth;')
            .replace('#include <alphatest_fragment>', 'if (uFollowLeafFade > 0.5 && vCinematicLeafDepth > 0.02 && vCinematicLeafDepth < uFollowTargetDepth - 0.25) {\n  vec2 projected = vFoliageViewPosition.xy * (uFollowTargetDepth / vCinematicLeafDepth);\n  float bodyY = clamp(projected.y, -1.2, 0.18);\n  float edge = length(vec2(projected.x, projected.y - bodyY));\n  float cut = 1.0 - smoothstep(0.36, 0.72, edge);\n  float dither = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);\n  if (cut > dither) discard;\n}\ndiffuseColor.a *= mix(1.0, smoothstep(2.0, 4.0, vCinematicLeafDepth), uCinematicLeafFade);\n#include <alphatest_fragment>');
        };
        material.customProgramCacheKey = () => key() + '_cinematicLeaf_v2_follow';
        material.needsUpdate = true;
        clones.set(original, material); clones.set(material, material); stats.materials++;
        return material;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(patch) : patch(mesh.material);
      stats.meshes++;
    });
  }
  return { refresh, update(active, depth = 0, following = false) { enabled.value = active ? 1 : 0; follow.value = following ? 1 : 0; targetDepth.value = Number.isFinite(depth) ? Math.max(0, depth) : 0; }, stats };
}
