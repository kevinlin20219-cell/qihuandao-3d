// Only used while idle near the two chapter-one interaction stations.
// Prefer the requested view; a previous clear side is retained to avoid alternating.
export function chooseInteractionCameraOffset(clearance, desired, previous = 0) {
  if (desired < 2.4) return 0;
  const primary = clearance(0);
  if (primary >= Math.min(2.4, desired - 0.5)) return 0;
  if (Math.abs(previous) > 0.1 && clearance(previous) >= Math.max(2.4, primary + 0.6)) return previous;
  let best = 0, score = primary;
  for (const offset of Array.from({ length: 30 }, (_, i) => (Math.floor(i / 2) + 1) * 0.14 * (i % 2 ? -1 : 1))) {
    const distance = clearance(offset), value = distance - Math.abs(offset) * 0.35;
    if (distance >= primary + 0.6 && value > score) { best = offset; score = value; }
  }
  return best;
}
