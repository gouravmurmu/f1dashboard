// One row per completed lap with everything the models need: tyre, stint, pit flags, track status, position.
import { trackStatus } from "../replay";
import type { RaceBundle } from "../types";

export interface LapRow {
  d: number;
  code: string;
  lap: number;
  dur: number | null;
  compound: string;
  life: number; // tyre age on this lap, 1 = first lap on the set
  stint: number;
  pitIn: boolean;
  pitOut: boolean;
  neutral: boolean; // safety car, VSC or red flag at any point of the lap
  position: number;
}

export function lapRows(b: RaceBundle): LapRow[] {
  const code = new Map(b.drivers.map((d) => [d.number, d.code]));
  const pitLaps = new Set(b.pits.map((p) => `${p.d}:${p.lap}`));
  const posBy = new Map<number, { t: number; pos: number }[]>();
  for (const p of b.positions) (posBy.get(p.d) ?? posBy.set(p.d, []).get(p.d)!).push(p);
  for (const arr of posBy.values()) arr.sort((x, y) => x.t - y.t);
  const posAt = (d: number, t: number) => {
    const arr = posBy.get(d) ?? [];
    let ans = 20;
    for (const p of arr) { if (p.t > t) break; ans = p.pos; }
    return ans;
  };
  const rows: LapRow[] = [];
  for (const l of b.laps) {
    const stint = b.stints.find((s) => s.d === l.d && l.lap >= s.lapStart && l.lap <= s.lapEnd);
    const end = l.start + (l.dur ?? 90) * 1000;
    const neutral = [l.start, (l.start + end) / 2, end].some((t) => trackStatus(b.raceControl, t) !== "GREEN" &&
      trackStatus(b.raceControl, t) !== "CHEQUERED");
    rows.push({
      d: l.d, code: code.get(l.d) ?? String(l.d), lap: l.lap, dur: l.dur,
      compound: stint?.compound ?? "UNKNOWN",
      life: stint ? stint.ageAtStart + l.lap - stint.lapStart + 1 : l.lap,
      stint: stint?.stint ?? 1,
      pitIn: pitLaps.has(`${l.d}:${l.lap}`), pitOut: l.pitOut, neutral, position: posAt(l.d, end),
    });
  }
  return rows.sort((x, y) => x.d - y.d || x.lap - y.lap);
}

/** Seeded uniform random numbers (mulberry32). */
export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
