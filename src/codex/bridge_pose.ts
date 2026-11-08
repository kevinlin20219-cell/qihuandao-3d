// @ts-nocheck
// Codex 0179 原样复制（source/bridge_pose.mjs），不改逻辑
// Pure world-space adapter. Keep 28 original boards; game gates/save/collision stay owned by Claude.
const PI=Math.PI,SPAN=22.4,AF=4*Math.atan(.7/SPAN),LEN=SPAN/(2*Math.sin(AF/2)/AF);
export const ease=r=>{r=Math.max(0,Math.min(1,r));return r<.5?2*r*r:1-(-2*r+2)**2/2};
function arc(s,a){const R=LEN/a,b=a*(s-.5);return[R*(Math.cos(a/2)-Math.cos(b)),R*(Math.sin(b)+Math.sin(a/2)),b]}
export function boardPose(i,r,t=0,wind=0){r=Math.max(0,Math.min(1,r));const e=ease(r),u=(i+.5)/28,s=1-u,a=PI*(1-e)+AF*e,[dy,dz,b]=arc(s,a),[fy,fz]=arc(s,AF);return{position:[wind*6*Math.sin(PI*u),1.2+.24*ease(r/.6)+.35*ease(r/.6)*(1-ease((r-.9)/.1))+dy+e*(-.35*Math.sin(PI*u)-fy),-71.6-.6*e+dz+e*(SPAN*s-fz)],pitch:-(1-e)*b,roll:Math.sin(t*1.3+u*3)*.015*r+wind*Math.sin(PI*u)}}
export function anchorPoints(side,r,t=0,wind=0,bank="near"){const far=bank==="far",edge=far?.35:-.35,p=boardPose(far?27:0,r,t,wind),c=Math.cos(p.pitch),s=Math.sin(p.pitch),cz=Math.cos(p.roll),sz=Math.sin(p.roll),x=side*1.05*cz,y=side*1.05*sz,end=[p.position[0]+x,p.position[1]+c*y-s*edge,p.position[2]+s*y+c*edge],start=[side*1.3,2.4,far?-72.4:-49.6];return Array.from({length:33},(_,i)=>{const u=i/32;return[start[0]*(1-u)+end[0]*u,start[1]*(1-u)+end[1]*u-.08*(1-ease(r))*Math.sin(PI*u),start[2]*(1-u)+end[2]*u]})}
const norm=a=>{const d=Math.hypot(...a)||1;return a.map(x=>x/d)},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Call after updateMatrixWorld; pass the mesh.matrixWorld inverse elements, NOT just 1/scale.
// Attributes: geometry.getAttribute('position'/'normal'/'_haul_param'). Clone geometry only once.
const tubeCache=new WeakMap();
export function updateHaulAttributes(position,normal,param,inv,side,r,t=0,wind=0,bank="near"){
 let cache=tubeCache.get(position);if(!cache){cache={P:new Float64Array(99),X:new Float64Array(99),Y:new Float64Array(99)};tubeCache.set(position,cache);}const{P,X,Y}=cache,far=bank==='far',edge=far?.35:-.35,B=boardPose(far?27:0,r,t,wind),c=Math.cos(B.pitch),s=Math.sin(B.pitch),cz=Math.cos(B.roll),sz=Math.sin(B.roll),ex=B.position[0]+side*1.05*cz,ey=B.position[1]+c*side*1.05*sz-s*edge,ez=B.position[2]+s*side*1.05*sz+c*edge,ax=side*1.3,ay=2.4,az=far?-72.4:-49.6;
 for(let i=0;i<33;i++){const u=i/32,k=i*3;P[k]=ax*(1-u)+ex*u;P[k+1]=ay*(1-u)+ey*u-.08*(1-ease(r))*Math.sin(PI*u);P[k+2]=az*(1-u)+ez*u;}
 for(let i=0;i<33;i++){const k=i*3,a=Math.max(0,i-1)*3,b=Math.min(32,i+1)*3;let dx=P[b]-P[a],dy=P[b+1]-P[a+1],dz=P[b+2]-P[a+2],len=Math.hypot(dx,dy,dz)||1;dx/=len;dy/=len;dz/=len;let xx=dy,xy=-dx,xz=0;if(Math.hypot(xx,xy)<.01){xx=-dz;xy=0;xz=dx;}len=Math.hypot(xx,xy,xz)||1;xx/=len;xy/=len;xz/=len;if(i&&xx*X[k-3]+xy*X[k-2]+xz*X[k-1]<0){xx=-xx;xy=-xy;xz=-xz;}X[k]=xx;X[k+1]=xy;X[k+2]=xz;Y[k]=dy*xz-dz*xy;Y[k+1]=dz*xx-dx*xz;Y[k+2]=dx*xy-dy*xx;}
 for(let k=0;k<position.count;k++){const j=Math.round(param.getX(k)*32)*3,a=param.getY(k),b=param.getZ(k),nx=X[j]*a+Y[j]*b,ny=X[j+1]*a+Y[j+1]*b,nz=X[j+2]*a+Y[j+2]*b,x=P[j]+nx*.028,y=P[j+1]+ny*.028,z=P[j+2]+nz*.028;position.setXYZ(k,inv[0]*x+inv[4]*y+inv[8]*z+inv[12],inv[1]*x+inv[5]*y+inv[9]*z+inv[13],inv[2]*x+inv[6]*y+inv[10]*z+inv[14]);let qx=inv[0]*nx+inv[4]*ny+inv[8]*nz,qy=inv[1]*nx+inv[5]*ny+inv[9]*nz,qz=inv[2]*nx+inv[6]*ny+inv[10]*nz;const l=Math.hypot(qx,qy,qz)||1;normal.setXYZ(k,qx/l,qy/l,qz/l);}
 position.needsUpdate=true;normal.needsUpdate=true;
}
// Prepare once after loading haul GLB. Attribute buffers are cloned once; the updater reuses typed scratch arrays.
export function prepareHaulUpdater(THREE,root){const records=[];root.traverse(m=>{if(!m.isMesh||!m.geometry.getAttribute('_haul_param'))return;m.geometry=m.geometry.clone();records.push({mesh:m,inv:new THREE.Matrix4(),side:m.userData.haul_side,bank:m.userData.haul_bank||'near'});});if(records.length!==4)throw new Error('Expected4 bridge anchor meshes');return(r,t,w)=>{root.updateMatrixWorld(true);for(const a of records){a.inv.copy(a.mesh.matrixWorld).invert();const g=a.mesh.geometry;updateHaulAttributes(g.getAttribute('position'),g.getAttribute('normal'),g.getAttribute('_haul_param'),a.inv.elements,a.side,r,t,w,a.bank);g.computeBoundingBox();g.computeBoundingSphere();}};}

export const haulPoints=(side,r,t=0,wind=0)=>anchorPoints(side,r,t,wind,"near");
