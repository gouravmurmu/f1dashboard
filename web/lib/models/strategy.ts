// Race strategy optimiser: evaluates every one- and two-stop plan with the fitted tyre model.
import { DRY, tyreCost, type TyreModel } from "./tyre";
import { MAX_STINT } from "./pit";

export interface Plan { name: string; stops: number; stints: [string, number][]; time: number; delta: number; pitLaps: number[] }

function stintTime(m: TyreModel, compound: string, startLap: number, length: number): number {
  let t = 0;
  for (let k = 0; k < length; k++) t += tyreCost(m, compound, k + 1) + m.fuel * (startLap + k);
  return t;
}

export function optimise(m: TyreModel, totalLaps: number, pitLoss: number, minStint = 8, top = 8): Plan[] {
  const best = new Map<string, Plan>();
  const consider = (stints: [string, number][]) => {
    if (stints.some(([c, n]) => n > MAX_STINT[c] || n < minStint)) return;
    let lap = 1, time = (stints.length - 1) * pitLoss;
    for (const [c, n] of stints) { time += stintTime(m, c, lap, n); lap += n; }
    const name = stints.map(([c]) => c[0]).join("-");
    const prev = best.get(name);
    if (!prev || time < prev.time) {
      const pitLaps = stints.slice(0, -1).map((_, i) => stints.slice(0, i + 1).reduce((s, x) => s + x[1], 0));
      best.set(name, { name, stops: stints.length - 1, stints, time, delta: 0, pitLaps });
    }
  };
  for (const c1 of DRY) for (const c2 of DRY) {
    if (c1 === c2) continue;
    for (let s1 = minStint; s1 <= totalLaps - minStint; s1++) consider([[c1, s1], [c2, totalLaps - s1]]);
  }
  for (const c1 of DRY) for (const c2 of DRY) for (const c3 of DRY) {
    if (new Set([c1, c2, c3]).size < 2) continue;
    for (let s1 = minStint; s1 <= totalLaps - 2 * minStint; s1++)
      for (let s2 = minStint; s2 <= totalLaps - s1 - minStint; s2++) consider([[c1, s1], [c2, s2], [c3, totalLaps - s1 - s2]]);
  }
  const plans = [...best.values()].sort((a, b) => a.time - b.time).slice(0, top);
  plans.forEach((p) => { p.delta = p.time - plans[0].time; });
  return plans;
}
