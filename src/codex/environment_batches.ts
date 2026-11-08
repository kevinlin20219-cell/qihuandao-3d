// @ts-nocheck
// Lossless submission changes only. Originals are retained for a reversible QA toggle.
const installs = new WeakMap(), windBounds = new WeakMap();
export function setWindBounds(T, geometry, pad) {
  let base = windBounds.get(geometry);
  if (!base) {
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    base = { sphere: geometry.boundingSphere.clone(), box: geometry.boundingBox.clone(), pad: 0 }; windBounds.set(geometry, base);
  }
  base.pad = Math.max(base.pad, Math.max(0, pad));
  geometry.boundingSphere.copy(base.sphere); geometry.boundingSphere.radius += base.pad;
  geometry.boundingBox.copy(base.box).expandByScalar(base.pad);
}
export function batchStaticEnvironment(T, scene, farLayers, cellSize = 12) {
  if (installs.has(scene)) return installs.get(scene);
  scene.updateWorldMatrix(true, true);
  const invScene = scene.matrixWorld.clone().invert(), buckets = new Map(), sources = [], groups = [], addedFar = [];
  const stats = { sourceDraws: 0, targetDraws: 0, instances: 0, sources: 0, cells: 0, skipped: 0 };
  const staticName = /tree|bark|trunk|rootflare|junction|crown|leaf|foliage|grass|fern|bush|moss_leafy|moss_cushion/i;
  const excludeName = /COL_|MK_|ANIM_|FLOW_|surface_|earth|ground|water|kit_|stuck|turtle|deer|flag|bridge|plank|winch|counterweight|ropeclip/i;
  const roots = scene.children.filter(o => o.userData.zone && !o.userData.environmentBatch);
  const visible = (o, root) => { for (let p=o; p; p=p.parent) { if (!p.visible || p.isLOD || /^ANIM_/.test(p.name)) return false; if(p===root)break; } return true; };
  const orthogonal = M => { const e=M.elements;let x=new T.Vector3(e[0],e[1],e[2]),y=new T.Vector3(e[4],e[5],e[6]),z=new T.Vector3(e[8],e[9],e[10]);let scale=x.length()*y.length()*z.length();return M.determinant()>0 && scale>0 && Math.max(Math.abs(x.dot(y))/(x.length()*y.length()),Math.abs(x.dot(z))/(x.length()*z.length()),Math.abs(y.dot(z))/(y.length()*z.length()))<1e-5; };
  for (const root of roots) {
    const far = farLayers.find(f=>f.obj===root), policy = far ? `far:${far.hideBelow}` : 'near';
    const meshes=[];root.traverse(m=>{if(m.isMesh)meshes.push(m)});
    for (const mesh of meshes) {
      if(mesh.isSkinnedMesh || Array.isArray(mesh.material) || mesh.morphTargetInfluences || !visible(mesh,root) || !staticName.test(mesh.name) || excludeName.test(mesh.name) || Object.values(mesh.geometry.attributes).some(a=>a.isInstancedBufferAttribute)) { stats.skipped++; continue; }
      if(mesh.onBeforeRender!==T.Object3D.prototype.onBeforeRender || mesh.onBeforeShadow!==T.Object3D.prototype.onBeforeShadow) { stats.skipped++;continue; }
      const geo=mesh.geometry;if(geo.drawRange.start!==0 || geo.drawRange.count < (geo.index?.count||geo.attributes.position.count)){stats.skipped++;continue}if(!geo.boundingSphere)geo.computeBoundingSphere();
      const matrices=[],count=mesh.isInstancedMesh?mesh.count:1;let valid=true;
      for(let i=0;i<count;i++){
        let M=invScene.clone().multiply(mesh.matrixWorld);
        if(mesh.isInstancedMesh){let local=new T.Matrix4();mesh.getMatrixAt(i,local);M.multiply(local)}
        if(!orthogonal(M)){valid=false;break}matrices.push(M);
      }
      if(!valid){stats.skipped++;continue}
      const entries=[];
      for(let i=0;i<count;i++){
        const M=matrices[i],centre=geo.boundingSphere.center.clone().applyMatrix4(M),cell=`${Math.floor(centre.x/cellSize)},${Math.floor(centre.z/cellSize)}`;
        const key=[policy,'global',geo.uuid,mesh.material.uuid,mesh.castShadow,mesh.receiveShadow,mesh.customDepthMaterial?.uuid,mesh.customDistanceMaterial?.uuid,mesh.renderOrder,mesh.layers.mask,!!mesh.instanceColor].join('|');
        entries.push({key,M,color:mesh.instanceColor?new T.Color().fromBufferAttribute(mesh.instanceColor,i):null});
      }
      const source={mesh,parent:mesh.parent,root,far,entries};sources.push(source);for(const entry of entries)entry.source=source;
      for(const entry of entries){let bucket=buckets.get(entry.key);if(!bucket){bucket={mesh,far,policy,cell:entry.key.split('|')[1],entries:[]};buckets.set(entry.key,bucket)}bucket.entries.push(entry)}
    }
  }
  const batches=[];const accepted=new Set();
  // A single ordinary mesh would only add an instance buffer; leave it alone.
  for(const bucket of buckets.values())if(bucket.entries.length>1||bucket.mesh.isInstancedMesh)for(const entry of bucket.entries)accepted.add(entry.source);
  // Split IMs as a whole, retaining all of their cells, including one-instance edge cells.
  const groupMap=new Map();
  for(const bucket of buckets.values()){
    const entries=bucket.entries.filter(e=>accepted.has(e.source));
    if(!entries.length)continue;
    let gkey=bucket.policy+'|'+bucket.cell,grp=groupMap.get(gkey);
    if(!grp){grp=new T.Group();grp.name='env_render_batch_'+groups.length+'_0';grp.userData.environmentBatch=true;grp.userData.zone=false;scene.add(grp);groups.push(grp);groupMap.set(gkey,grp);if(bucket.far){const f={obj:grp,hideBelow:bucket.far.hideBelow};farLayers.push(f);addedFar.push(f)}}
    const sample=bucket.mesh,im=new T.InstancedMesh(sample.geometry,sample.material,entries.length);
    im.name=sample.name;im.castShadow=sample.castShadow;im.receiveShadow=sample.receiveShadow;im.customDepthMaterial=sample.customDepthMaterial;im.customDistanceMaterial=sample.customDistanceMaterial;im.renderOrder=sample.renderOrder;im.layers.mask=sample.layers.mask;
    entries.forEach((e,i)=>{im.setMatrixAt(i,e.M);if(e.color)im.setColorAt(i,e.color)});im.instanceMatrix.needsUpdate=true;im.computeBoundingBox();im.computeBoundingSphere();im.frustumCulled=false;grp.add(im);batches.push({im,far:bucket.far,entries:entries.map(e=>({...e,sphere:sample.geometry.boundingSphere.clone().applyMatrix4(e.M).applyMatrix4(scene.matrixWorld)})),selected:[]});stats.targetDraws++;
  }
  for(const source of accepted){source.mesh.removeFromParent();stats.sourceDraws++;stats.instances+=source.entries.length}
  stats.sources=accepted.size;stats.cells=groups.length;
  const viewFrustum=new T.Frustum(),shadowFrustum=new T.Frustum(),VP=new T.Matrix4();let lastTick=-Infinity;
  stats.activeInstances=stats.instances;stats.activeDraws=stats.targetDraws;
  let disposed=false;const handle={stats,groups,update(camera,focusZ,sun,force=false){
    if(disposed)return;const now=typeof performance!=='undefined'?performance.now():Date.now();if(!force&&now-lastTick<100)return;lastTick=now;
    camera.updateMatrixWorld();VP.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);viewFrustum.setFromProjectionMatrix(VP);
    let shadow=false;if(sun?.castShadow){sun.updateWorldMatrix(true,false);sun.target.updateWorldMatrix(true,false);sun.shadow.updateMatrices(sun);const sc=sun.shadow.camera;VP.multiplyMatrices(sc.projectionMatrix,sc.matrixWorldInverse);shadowFrustum.setFromProjectionMatrix(VP);shadow=true}
    let active=0,draws=0;
    for(const b of batches){const chosen=[];for(let i=0;i<b.entries.length;i++){let e=b.entries[i],s=e.sphere;if(b.far&&focusZ<b.far.hideBelow)continue;if(!b.far&&(s.center.z+s.radius<=focusZ-55||s.center.z-s.radius>=focusZ+30))continue;if(viewFrustum.intersectsSphere(s)||(shadow&&b.im.castShadow&&shadowFrustum.intersectsSphere(s)))chosen.push(i)}
      const changed=chosen.length!==b.selected.length||chosen.some((v,i)=>v!==b.selected[i]);if(changed){chosen.forEach((id,i)=>{b.im.setMatrixAt(i,b.entries[id].M);if(b.entries[id].color)b.im.setColorAt(i,b.entries[id].color)});b.im.count=chosen.length;b.im.instanceMatrix.needsUpdate=true;if(b.im.instanceColor)b.im.instanceColor.needsUpdate=true;b.selected=chosen}active+=chosen.length;if(chosen.length)draws++;
    }stats.activeInstances=active;stats.activeDraws=draws;
  },dispose(){if(disposed)return;disposed=true;for(const source of accepted)source.parent.add(source.mesh);for(const grp of groups){grp.removeFromParent();for(const m of grp.children)m.dispose?.()}for(const f of addedFar){const i=farLayers.indexOf(f);if(i>=0)farLayers.splice(i,1)}installs.delete(scene)}};
  installs.set(scene,handle);return handle;
}
