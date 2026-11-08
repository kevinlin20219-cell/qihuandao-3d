// @ts-nocheck
// Native multi-draw keeps independent camera and shadow culling.
const installs=new WeakMap();
export function batchMultiDrawEnvironment(T, scene, farLayers, cellSize = 12) {
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
        const key=[policy,'global',Object.entries(geo.attributes).map(([k,a])=>k+':'+a.itemSize+':'+a.array.constructor.name+':'+a.normalized).sort().join(',')+':'+!!geo.index,mesh.material.uuid,mesh.castShadow,mesh.receiveShadow,mesh.customDepthMaterial?.uuid,mesh.customDistanceMaterial?.uuid,mesh.renderOrder,mesh.layers.mask,!!mesh.instanceColor].join('|');
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
    const sample=bucket.mesh,geos=new Map();for(const e of entries)geos.set(e.source.mesh.geometry.uuid,e.source.mesh.geometry);
    const verts=[...geos.values()].reduce((n,g)=>n+g.attributes.position.count,0),inds=[...geos.values()].reduce((n,g)=>n+(g.index?.count||0),0);
    const im=new T.BatchedMesh(entries.length,verts,inds||null,sample.material),geoIds=new Map();
    for(const [id,g] of geos)geoIds.set(id,im.addGeometry(g));
    im.name=sample.name;im.castShadow=sample.castShadow;im.receiveShadow=sample.receiveShadow;im.customDepthMaterial=sample.customDepthMaterial;im.customDistanceMaterial=sample.customDistanceMaterial;im.renderOrder=sample.renderOrder;im.layers.mask=sample.layers.mask;
    entries.forEach(e=>{e.id=im.addInstance(geoIds.get(e.source.mesh.geometry.uuid));im.setMatrixAt(e.id,e.M);if(e.color)im.setColorAt(e.id,e.color)});
    im.frustumCulled=false;im.perObjectFrustumCulled=true;grp.add(im);
    batches.push(im);im.userData.visibilityEntries=entries.map(e=>({...e,sphere:e.source.mesh.geometry.boundingSphere.clone().applyMatrix4(e.M).applyMatrix4(scene.matrixWorld)}));im.userData.farPolicy=bucket.far;stats.targetDraws++;
  }
  for(const source of accepted){source.mesh.removeFromParent();stats.sourceDraws++;stats.instances+=source.entries.length}
  const liveGeometry=new Set();scene.traverse(o=>{if(o.isMesh&&!o.isBatchedMesh)liveGeometry.add(o.geometry)});const retiredGeometry=new Set();for(const s of accepted)if(!liveGeometry.has(s.mesh.geometry))retiredGeometry.add(s.mesh.geometry);for(const g of retiredGeometry)g.dispose();stats.retiredGPUgeometries=retiredGeometry.size;
  stats.sources=accepted.size;stats.cells=groups.length;
  let disposed=false,lastTick=-Infinity;stats.mode='native-multi-draw';
  const handle={stats,groups,batches,update(camera,focusZ,sun,force=false){
    if(disposed)return;const now=typeof performance!=='undefined'?performance.now():Date.now();if(!force&&now-lastTick<100)return;lastTick=now;
    let active=0;for(const im of batches)for(const e of im.userData.visibilityEntries){const s=e.sphere,f=im.userData.farPolicy;const v=f?focusZ>=f.hideBelow:!(s.center.z+s.radius<=focusZ-55||s.center.z-s.radius>=focusZ+30);im.setVisibleAt(e.id,v);if(v)active++}stats.activeInstances=active;
  },dispose(){if(disposed)return;disposed=true;for(const source of accepted)source.parent.add(source.mesh);for(const im of batches)im.dispose();for(const grp of groups)grp.removeFromParent();for(const f of addedFar){const i=farLayers.indexOf(f);if(i>=0)farLayers.splice(i,1)}installs.delete(scene)}};
  installs.set(scene,handle);return handle;
}
