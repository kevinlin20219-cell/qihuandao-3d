// @ts-nocheck
// Codex 0179 原样复制（source/v49_art_compat.mjs），不改逻辑
// Reference integration helpers; no game source is modified by this delivery.
export const DENSE_SKIP_BOXES=[[-6.6,-3.0,-20.5,-10],[3.0,6.6,-20.5,-10],[-9,-4.0,-42.5,-37.9],[4.0,9,-42.5,-37.9],[-9,-8,-48.4,-42.5],[8,9,-48.4,-42.5],[-5.5,-2.8,-37,-20],[2.8,5.5,-37,-20],[-8.5,-6.3,-48,-45.6],[6.3,8.5,-48,-45.6],[-6.6,-4.4,-50,-48.1],[4.4,6.6,-50,-48.1],[-9.1,-7.1,-43.5,-41.5],[7.1,9.1,-43.5,-41.5]];
export const shouldSkipDensePlant=(x,z)=>DENSE_SKIP_BOXES.some(([a,b,c,d])=>x>=a&&x<=b&&z>=c&&z<=d);
export const shouldAutoMist=(fall,atmoEnabled=true)=>atmoEnabled&&!fall.userData?.no_auto_mist;
// Apply after replacement loaded. Preserve original Rapier bodies and existing glade physics.
export const LEGACY_CLIFF_BOXES=[[[0,-5.5,-44],[16,14,12]],[[0,-5.5,-82],[20,14,20]],[[-14,-5,-61],[8,12,22]],[[14,-5,-61],[8,12,22]]];
export function hideLegacyCliffs(gray){let n=0;for(const obj of gray.children){if(!obj.isMesh||obj.geometry.type!=='BoxGeometry')continue;const p=obj.geometry.parameters;for(const[c,s]of LEGACY_CLIFF_BOXES){if(Math.hypot(obj.position.x-c[0],obj.position.y-c[1],obj.position.z-c[2])<.001&&Math.abs(p.width-s[0])+Math.abs(p.height-s[1])+Math.abs(p.depth-s[2])<.001){obj.visible=false;n++;break;}}}return n;}
