// @ts-nocheck
// Codex 0179 原样复制（source/interaction_markers.mjs），不改逻辑
// Anchors only. Claude owns glow, reading interaction, phase visibility and budget.
export function installInteractionMarkers(THREE,deerRoot,noteRoot){
 const fork=deerRoot.getObjectByName('MK_antler_fork');if(!fork?.parent)throw new Error('Missing v002 MK_antler_fork');
 let antler=fork.parent.children.find(o=>o.name==='FX_deer_antler_moss');if(!antler){antler=new THREE.Object3D();antler.name='FX_deer_antler_moss';fork.updateMatrix();antler.matrix.copy(fork.matrix);antler.matrixAutoUpdate=false;fork.parent.add(antler);}
 const root=noteRoot.getObjectByName('PROP_leaf_note_stone');if(!root)throw new Error('Missing PROP_leaf_note_stone');let note=root.children.find(o=>o.name==='FX_leaf_note_readable');if(!note){note=new THREE.Object3D();note.name='FX_leaf_note_readable';note.position.set(...[0.015, 0.46, 0.33632452985519673]);root.add(note);}return{antler,note};
}
