/** Drops points closer than `minDist` to the previous kept point. */
export function simplify(points: [number, number][], minDist: number): [number, number][] {
  if (!points.length) return points;
  const out: [number, number][] = [points[0]];
  for (const p of points.slice(1)) {
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= minDist) out.push(p);
  }
  return out;
}

/** Linear interpolation of a car's (x, y) at time t from a flat [t, x, y, ...] array. */
export function positionAt(flat: number[] | undefined, t: number): [number, number] | null {
  if (!flat || flat.length < 3) return null;
  const n = flat.length / 3;
  if (t <= flat[0]) return [flat[1], flat[2]];
  if (t >= flat[(n - 1) * 3]) return [flat[(n - 1) * 3 + 1], flat[(n - 1) * 3 + 2]];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (flat[mid * 3] <= t) lo = mid; else hi = mid;
  }
  const t0 = flat[lo * 3], t1 = flat[hi * 3];
  const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  return [flat[lo * 3 + 1] + f * (flat[hi * 3 + 1] - flat[lo * 3 + 1]),
    flat[lo * 3 + 2] + f * (flat[hi * 3 + 2] - flat[lo * 3 + 2])];
}
