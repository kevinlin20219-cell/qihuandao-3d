// Dynamic contact occlusion supplements the directional shadow at the four hoof
// markers. It changes rendered light only; neutral base-colour textures stay intact.
export function contactWeight(gap) {
  if (!Number.isFinite(gap) || gap < -0.06 || gap >= 0.20) return 0;
  const u = Math.max(0, Math.min(1, (gap - 0.02) / 0.18));
  return 1 - u * u * (3 - 2 * u);
}
export function installDeerContactShade(THREE, scene) {
  const root = scene.getObjectByName('env_ch1_moss_deer_v002_0');
  if (!root) return null;
  if (root.userData.deerContactShade) return root.userData.deerContactShade;
  const anchors = ['FL', 'FR', 'HL', 'HR'].map(n => root.getObjectByName('MK_hoof_' + n));
  const ground = [];
  scene.traverse(o => { if (o.isMesh && o.name === 'FORK_surface_earth_glade') ground.push(o); });
  if (anchors.some(a => !a) || !ground.length) return null;
  const contacts = { value: anchors.map(() => new THREE.Vector4(0, 0, 0, 0)) };
  const clones = new Map(), snapshots = ground.map(mesh => [mesh, mesh.material]);
  const patch = original => {
    if (clones.has(original)) return clones.get(original);
    const material = original.clone(), prior = original.onBeforeCompile, key = original.customProgramCacheKey.bind(original);
    if (original._farDone) material._farDone = true;
    material.onBeforeCompile = function (shader, renderer) {
      prior.call(this, shader, renderer);
      shader.uniforms.uDeerContacts = contacts;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDeerContactWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvDeerContactWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDeerContactWorld;\nuniform vec4 uDeerContacts[4];')
        .replace('#include <opaque_fragment>', 'float hoofOcclusion = 0.0;\nfor (int i = 0; i < 4; i++) {\n  vec2 d = (vDeerContactWorld.xz - uDeerContacts[i].xz) / vec2(0.24, 0.32);\n  float radial = exp(-2.7 * dot(d, d));\n  float onGround = 1.0 - smoothstep(0.015, 0.065, abs(vDeerContactWorld.y - uDeerContacts[i].y));\n  hoofOcclusion = max(hoofOcclusion, radial * onGround * uDeerContacts[i].w * 0.48);\n}\noutgoingLight *= 1.0 - hoofOcclusion;\n#include <opaque_fragment>');
    };
    material.customProgramCacheKey = () => key() + '_deerContact_v1';
    material.needsUpdate = true; clones.set(original, material); return material;
  };
  for (const mesh of ground) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(patch) : patch(mesh.material);
  const ray = new THREE.Raycaster(), p = new THREE.Vector3(), origin = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  const stats = { active: 0, enabled: true, updates: 0, groundMeshes: ground.length, materials: clones.size, anchors: 4 };
  let acc = 0, disposed = false;
  const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const handle = {
    stats,
    setEnabled(value) { stats.enabled = !!value; handle.update(); },
    update(dt = undefined) {
      if (disposed) return;
      if (!stats.enabled) { stats.active = 0; for (const v of contacts.value) v.w = 0; return; }
      if (dt !== undefined) { acc += dt; if (acc < 0.05) return; acc = 0; }
      stats.active = 0; stats.updates++;
      root.updateWorldMatrix(true, true);
      for (let i = 0; i < 4; i++) {
        const v = contacts.value[i]; v.w = 0;
        if (!shown(root)) continue;
        anchors[i].getWorldPosition(p); origin.copy(p); origin.y += 0.45;
        ray.set(origin, down); ray.near = 0; ray.far = 1.2;
        const hit = ray.intersectObjects(ground, false).find(h => shown(h.object));
        if (!hit) continue;
        const weight = contactWeight(p.y - hit.point.y);
        v.set(p.x, hit.point.y, p.z, weight); if (weight > 0) stats.active++;
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const [mesh, material] of snapshots) mesh.material = material;
      for (const material of clones.values()) material.dispose();
      for (const v of contacts.value) v.w = 0;
      stats.active = 0; delete root.userData.deerContactShade;
    },
  };
  root.userData.deerContactShade = handle; handle.update(); return handle;
}
