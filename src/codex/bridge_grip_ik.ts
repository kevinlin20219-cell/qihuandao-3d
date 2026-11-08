// Matches prop_ch1_rope_bridge_v004 upper rail and chapter1's vertex sway.
export function bridgeRailPoint(side, z, sway = 0) {
  const u = Math.max(0, Math.min(1, (-49.6 - z) / 22.8));
  const windU = Math.max(0, Math.min(1, (-49.8 - z) / 22.4));
  return [side * 1.15 + sway * 6 * Math.sin(Math.PI * windU), 2.4 - .35 * Math.sin(Math.PI * u), z];
}
const armCache = new WeakMap();
export function solveArmContact(T, arm, fore, hand, target, weight = 1) {
  if (weight <= 0) return;
  let s = armCache.get(arm);
  if (!s) { s = { A: new T.Vector3(), B: new T.Vector3(), C: new T.Vector3(), D: new T.Vector3(), axis: new T.Vector3(), pole: new T.Vector3(), elbow: new T.Vector3(), from: new T.Vector3(), to: new T.Vector3(), delta: new T.Quaternion(), world: new T.Quaternion(), parent: new T.Quaternion(), handQ: new T.Quaternion() }; armCache.set(arm, s); }
  arm.updateWorldMatrix(true, true); arm.getWorldPosition(s.A); fore.getWorldPosition(s.B); hand.getWorldPosition(s.C); hand.getWorldQuaternion(s.handQ);
  const l1 = s.A.distanceTo(s.B), l2 = s.B.distanceTo(s.C);
  if (l1 < 1e-6 || l2 < 1e-6) return;
  s.D.copy(s.C).lerp(target, Math.max(0, Math.min(1, weight))); s.axis.copy(s.D).sub(s.A);
  let d = s.axis.length(); if (d < 1e-6) return; s.axis.divideScalar(d);
  d = Math.max(Math.abs(l1 - l2) + .0001, Math.min(l1 + l2 - .0001, d)); s.D.copy(s.A).addScaledVector(s.axis, d);
  s.pole.copy(s.B).sub(s.A); s.pole.addScaledVector(s.axis, -s.pole.dot(s.axis));
  if (s.pole.lengthSq() < 1e-8) { s.pole.set(0, 0, 1); if (Math.abs(s.pole.dot(s.axis)) > .95) s.pole.set(1, 0, 0); s.pole.addScaledVector(s.axis, -s.pole.dot(s.axis)); }
  s.pole.normalize(); const along = (l1*l1 + d*d - l2*l2) / (2*d), high = Math.sqrt(Math.max(0, l1*l1 - along*along));
  s.elbow.copy(s.A).addScaledVector(s.axis, along).addScaledVector(s.pole, high);
  const rotate = (bone, from, to) => { s.from.copy(from).normalize(); s.to.copy(to).normalize(); s.delta.setFromUnitVectors(s.from, s.to); bone.getWorldQuaternion(s.world); s.world.premultiply(s.delta); if (bone.parent) bone.parent.getWorldQuaternion(s.parent).invert(); else s.parent.identity(); bone.quaternion.copy(s.parent.multiply(s.world)); bone.updateWorldMatrix(true, true); };
  s.from.copy(s.B).sub(s.A); s.to.copy(s.elbow).sub(s.A); rotate(arm, s.from, s.to);
  fore.getWorldPosition(s.B); hand.getWorldPosition(s.C); s.from.copy(s.C).sub(s.B); s.to.copy(s.D).sub(s.B); rotate(fore, s.from, s.to);
  if (hand.parent) hand.parent.getWorldQuaternion(s.parent).invert(); else s.parent.identity(); hand.quaternion.copy(s.parent.multiply(s.handQ)); hand.updateWorldMatrix(true, true);
}
// Bone-local rail-centre sockets sampled from the original v001 loop at t=0.
// They retain the source hand/skin grip fit instead of targeting a wrist joint.
const SOCKETS = {
  "tangtuan": {
    "left": [
      -0.025633898377852682,
      0.09666717650105094,
      -0.06358477930877038
    ],
    "right": [
      -0.07330947848375202,
      0.09739144121851417,
      0.020943696069953395
    ]
  },
  "hanhan": {
    "left": [
      0.01124129621275019,
      0.10458074090997793,
      -0.06011790385907434
    ],
    "right": [
      -0.02002451896463936,
      0.09682892783571795,
      0.05762355482560877
    ]
  },
  "paipai": {
    "left": [
      0.01207374124874611,
      0.08110370076247415,
      -0.06033381341321077
    ],
    "right": [
      0.05080186905687489,
      0.05547663410822211,
      -0.014719506930538417
    ]
  }
};
const actors = new WeakMap();
export function alignBridgeGrip(T, actor, G, bridge) {
  const I = actor.inter;
  if (!actor.model || !I?.cur?.startsWith('bridge_grip_') || I.state === 'off' || !G) { if (actor.root.userData.bridgeGripIK) actor.root.userData.bridgeGripIK.enabled = false; return; }
  const handName = I.cur.endsWith('left') ? 'left' : 'right', name = handName === 'left' ? 'Left' : 'Right';
  let cache = actors.get(actor);
  if (!cache || cache.model !== actor.model) { cache = { model: actor.model, hands: {} }; actors.set(actor, cache); }
  let s = cache.hands[handName];
  if (!s) {
    const socket = SOCKETS[actor.def.id]?.[handName], arm = actor.model.getObjectByName(name+'Arm'), fore = actor.model.getObjectByName(name+'ForeArm'), hand = actor.model.getObjectByName(name+'Hand');
    if (!socket || !arm || !fore || !hand) return;
    s = { arm, fore, hand, socket: new T.Vector3().fromArray(socket), centre: new T.Vector3(), target: new T.Vector3(), wrist: new T.Vector3(), stats: { enabled: false, hand: handName, before: 0, after: 0, weight: 0 } }; cache.hands[handName] = s;
  }
  const S = I.sets[I.cur], smooth = u => { u = Math.max(0, Math.min(1, u)); return u*u*(3-2*u); };
  const w = I.f * (I.state === 'enter' ? smooth((S.enter.time / S.enter.getClip().duration - .25) / .65) : I.state === 'exit' ? 1-smooth(S.exit.time / S.exit.getClip().duration / .5) : 1);
  actor.root.updateWorldMatrix(true, true); s.centre.copy(s.socket); s.hand.localToWorld(s.centre);
  s.target.fromArray(bridgeRailPoint(G.side, s.centre.z, Number.isFinite(bridge.sway) ? bridge.sway : 0));
  s.stats.enabled = w > .001; s.stats.weight = w; s.stats.before = s.centre.distanceTo(s.target);
  s.hand.getWorldPosition(s.wrist); s.wrist.add(s.target).sub(s.centre); solveArmContact(T, s.arm, s.fore, s.hand, s.wrist, w);
  s.centre.copy(s.socket); s.hand.localToWorld(s.centre); s.stats.after = s.centre.distanceTo(s.target); actor.root.userData.bridgeGripIK = s.stats;
}
