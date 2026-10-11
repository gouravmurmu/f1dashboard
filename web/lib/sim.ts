// Monte Carlo race simulator: plays out the rest of the race many times from any moment.
import type { RaceState, ReplayIndex } from "./replay";

export interface SimResult {
  d: number;
  win: number;
  podium: number;
  points: number; // probability of a points finish (top 10)
  expected: number; // mean finishing position
  projected: number; // rank of the expected position
}

const DEG: Record<string, number> = { SOFT: 0.085, MEDIUM: 0.05, HARD: 0.03, INTERMEDIATE: 0.04, WET: 0.03 };
const LIFE: Record<string, number> = { SOFT: 22, MEDIUM: 32, HARD: 44, INTERMEDIATE: 35, WET: 40 };
const DRY = new Set(["SOFT", "MEDIUM", "HARD"]);

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CarModel {
  d: number;
  time: number;
  lapsDone: number;
  base: number;
  compound: string;
  age: number;
  used: Set<string>;
}

/** Each running car's pace and tyre state at this moment. */
export function carModels(idx: ReplayIndex, state: RaceState): CarModel[] {
  const fieldMedian = idx.medianLap;
  return state.cars.filter((c) => !c.out && c.raceTime != null).map((c) => {
    const laps = (idx.lapsBy.get(c.driver.number) ?? []).slice(0, c.lapsDone);
    const stints = idx.stintsBy.get(c.driver.number) ?? [];
    const clean = laps.filter((l) => l.lap > 1 && l.dur != null && !l.pitOut && l.dur < fieldMedian * 1.08 &&
      !idx.bundle.pits.some((p) => p.d === l.d && p.lap === l.lap)).slice(-8);
    const adj = clean.map((l) => {
      const s = stints.find((x) => l.lap >= x.lapStart && l.lap <= x.lapEnd);
      const age = s ? s.ageAtStart + l.lap - s.lapStart : 0;
      return (l.dur as number) - (DEG[s?.compound ?? "MEDIUM"] ?? 0.05) * age;
    }).sort((a, b) => a - b);
    const base = adj.length >= 3 ? adj[Math.floor(adj.length / 2)] : fieldMedian + 0.8;
    const used = new Set(stints.filter((s) => s.lapStart <= c.lap).map((s) => s.compound));
    return { d: c.driver.number, time: c.raceTime as number, lapsDone: c.lapsDone, base, compound: c.compound,
      age: c.tyreAge, used };
  });
}

export function simulate(idx: ReplayIndex, state: RaceState, runs = 400, seed = 7): SimResult[] {
  const cars = carModels(idx, state);
  if (!cars.length) return [];
  const total = idx.bundle.totalLaps;
  const lanes = idx.bundle.pits.map((p) => p.lane).filter((x): x is number => x != null && x > 10 && x < 40)
    .sort((a, b) => a - b);
  const pitLoss = lanes.length ? lanes[Math.floor(lanes.length / 2)] : 22;
  const finished = state.cars.some((c) => c.finished);
  const r = rng(seed + state.lap);
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const n = cars.length;
  const wins = new Float64Array(n), pods = new Float64Array(n), pts = new Float64Array(n), sumPos = new Float64Array(n);
  const leaderDone = Math.max(...cars.map((c) => c.lapsDone));

  for (let run = 0; run < (finished ? 1 : runs); run++) {
    const time = cars.map((c) => c.time + (leaderDone - c.lapsDone) * 0); // times are per car's own laps
    const done = cars.map((c) => c.lapsDone);
    const age = cars.map((c) => c.age);
    const comp = cars.map((c) => c.compound);
    const used = cars.map((c) => new Set(c.used));
    const form = cars.map(() => gauss() * 0.15);
    const alive = cars.map(() => true);
    const stopAt = cars.map((c, i) => {
      const life = (LIFE[comp[i]] ?? 30) * (0.85 + 0.3 * r());
      return c.lapsDone + Math.max(1, Math.round(life - c.age));
    });
    for (let lap = leaderDone + 1; lap <= total && !finished; lap++) {
      const sc = r() < 0.018;
      for (let i = 0; i < n; i++) {
        if (!alive[i] || done[i] >= total) continue;
        if (r() < 0.0012) { alive[i] = false; continue; }
        const remaining = total - done[i];
        const mustSecond = DRY.has(comp[i]) && used[i].size < 2 && remaining <= 1 + Math.floor(r() * 3);
        const cheapStop = sc && age[i] > (LIFE[comp[i]] ?? 30) * 0.45 && remaining > 8;
        if ((done[i] + 1 >= stopAt[i] && remaining > 3) || mustSecond || cheapStop) {
          time[i] += cheapStop ? pitLoss * 0.55 : pitLoss;
          comp[i] = remaining > 24 ? "HARD" : remaining > 12 ? "MEDIUM" : "SOFT";
          if (used[i].size < 2 && used[i].has(comp[i])) comp[i] = comp[i] === "HARD" ? "MEDIUM" : "HARD";
          used[i].add(comp[i]);
          age[i] = 0;
          stopAt[i] = done[i] + Math.round((LIFE[comp[i]] ?? 30) * (0.85 + 0.3 * r()));
        }
        time[i] += cars[i].base + form[i] + (DEG[comp[i]] ?? 0.05) * age[i] + gauss() * 0.4;
        age[i] += 1;
        done[i] += 1;
      }
      if (sc) { // safety car bunches the field behind the leader
        const order = [...time.keys()].filter((i) => alive[i]).sort((a, b) => done[b] - done[a] || time[a] - time[b]);
        const lead = time[order[0]];
        order.forEach((i, k) => { if (done[i] === done[order[0]]) time[i] = Math.max(lead + k * 0.9, Math.min(time[i], lead + k * 0.9)); });
      }
    }
    const order = [...time.keys()].sort((a, b) =>
      Number(alive[b]) - Number(alive[a]) || done[b] - done[a] || time[a] - time[b]);
    order.forEach((i, k) => {
      if (k === 0) wins[i] += 1;
      if (k < 3) pods[i] += 1;
      if (k < 10) pts[i] += 1;
      sumPos[i] += k + 1;
    });
  }
  const runsDone = finished ? 1 : runs;
  const res = cars.map((c, i) => ({ d: c.d, win: wins[i] / runsDone, podium: pods[i] / runsDone,
    points: pts[i] / runsDone, expected: sumPos[i] / runsDone, projected: 0 }));
  [...res].sort((a, b) => a.expected - b.expected).forEach((x, k) => { x.projected = k + 1; });
  return res;
}
