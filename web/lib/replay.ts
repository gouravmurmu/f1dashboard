// Race state at any moment of a session, computed from a RaceBundle.
import type { DriverInfo, IntervalRec, LapRec, PosRec, RaceBundle, RaceControlRec, StintRec } from "./types";

export type TrackStatus = "GREEN" | "SC" | "VSC" | "RED" | "CHEQUERED";

export interface CarState {
  driver: DriverInfo;
  position: number;
  lap: number; // lap currently being driven (or last lap if finished)
  lapsDone: number;
  lastLap: number | null;
  bestLap: number | null;
  gap: number | string | null;
  interval: number | string | null;
  compound: string;
  tyreAge: number;
  stops: number;
  inPit: boolean;
  out: boolean; // retired
  finished: boolean;
  raceTime: number | null; // seconds from lights out at the end of the last completed lap
}

export interface RaceState {
  t: number;
  lap: number;
  status: TrackStatus;
  cars: CarState[];
  messages: RaceControlRec[];
}

function lastAtOrBefore<T extends { t: number }>(rows: T[], t: number): number {
  let lo = 0, hi = rows.length - 1, ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (rows[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1;
  }
  return ans;
}

export class ReplayIndex {
  readonly lapsBy = new Map<number, LapRec[]>();
  readonly posBy = new Map<number, PosRec[]>();
  readonly intBy = new Map<number, IntervalRec[]>();
  readonly stintsBy = new Map<number, StintRec[]>();
  readonly gridPos = new Map<number, number>();
  readonly dnf = new Set<number>();
  readonly medianLap: number;

  constructor(readonly bundle: RaceBundle) {
    for (const l of bundle.laps) push(this.lapsBy, l.d, l);
    for (const p of bundle.positions) push(this.posBy, p.d, p);
    for (const i of bundle.intervals) push(this.intBy, i.d, i);
    for (const s of bundle.stints) push(this.stintsBy, s.d, s);
    for (const arr of this.lapsBy.values()) arr.sort((a, b) => a.lap - b.lap);
    for (const arr of this.posBy.values()) arr.sort((a, b) => a.t - b.t);
    for (const arr of this.intBy.values()) arr.sort((a, b) => a.t - b.t);
    for (const g of bundle.grid) this.gridPos.set(g.d, g.pos);
    for (const r of bundle.results) if (r.status !== "Finished") this.dnf.add(r.d);
    const durs = bundle.laps.map((l) => l.dur).filter((d): d is number => d != null).sort((a, b) => a - b);
    this.medianLap = durs[Math.floor(durs.length / 2)] ?? 95;
  }

  lapEnd(l: LapRec): number {
    return l.start + (l.dur ?? this.medianLap) * 1000;
  }

  stateAt(t: number): RaceState {
    const b = this.bundle;
    const cars: CarState[] = [];
    let leaderLap = 0;
    for (const driver of b.drivers) {
      const laps = this.lapsBy.get(driver.number) ?? [];
      let done = 0;
      while (done < laps.length && this.lapEnd(laps[done]) <= t) done++;
      const last = done > 0 ? laps[done - 1] : null;
      const best = laps.slice(0, done).reduce<number | null>((m, l) => (l.dur != null && l.lap > 1 &&
        (m == null || l.dur < m) ? l.dur : m), null);
      const finishedAll = done === laps.length && laps.length > 0;
      const out = this.dnf.has(driver.number) && finishedAll && t > this.lapEnd(laps[laps.length - 1]) + 30_000;
      const lap = Math.min(done + 1, Math.max(laps.length, 1));
      const stint = (this.stintsBy.get(driver.number) ?? []).find((s) => lap >= s.lapStart && lap <= s.lapEnd);
      const pIdx = lastAtOrBefore(this.posBy.get(driver.number) ?? [], t);
      const iIdx = lastAtOrBefore(this.intBy.get(driver.number) ?? [], t);
      const iv = iIdx >= 0 ? this.intBy.get(driver.number)![iIdx] : null;
      const stops = b.pits.filter((p) => p.d === driver.number && p.t <= t).length;
      const inPit = b.pits.some((p) => p.d === driver.number && t >= p.t - 5_000 && t <= p.t + (p.lane ?? 22) * 1000);
      leaderLap = Math.max(leaderLap, lap);
      cars.push({
        driver,
        position: pIdx >= 0 ? this.posBy.get(driver.number)![pIdx].pos : this.gridPos.get(driver.number) ?? 99,
        lap, lapsDone: done, lastLap: last?.dur ?? null, bestLap: best,
        gap: iv?.gap ?? null, interval: iv?.int ?? null,
        compound: stint?.compound ?? "UNKNOWN",
        tyreAge: stint ? stint.ageAtStart + lap - stint.lapStart : lap - 1,
        stops, inPit, out,
        finished: finishedAll && !this.dnf.has(driver.number) && done >= b.totalLaps,
        raceTime: last ? (this.lapEnd(last) - b.raceStart) / 1000 : null,
      });
    }
    // Retired cars drop to the back; keep the rest in timing order.
    cars.sort((a, c) => Number(a.out) - Number(c.out) || a.position - c.position);
    cars.forEach((c, i) => { if (!c.out) c.position = i + 1; });

    const mIdx = lastAtOrBefore(b.raceControl, t);
    const messages = b.raceControl.slice(Math.max(0, mIdx - 5), mIdx + 1).reverse();
    return { t, lap: Math.min(leaderLap, b.totalLaps), status: trackStatus(b.raceControl, t), cars, messages };
  }
}

export function trackStatus(rc: RaceControlRec[], t: number): TrackStatus {
  let status: TrackStatus = "GREEN";
  for (const m of rc) {
    if (m.t > t) break;
    const msg = m.message.toUpperCase();
    const flag = (m.flag ?? "").toUpperCase();
    if (msg.includes("VIRTUAL SAFETY CAR DEPLOYED")) status = "VSC";
    else if (msg.includes("VIRTUAL SAFETY CAR ENDING")) status = "GREEN";
    else if (msg.includes("SAFETY CAR DEPLOYED")) status = "SC";
    else if (msg.includes("SAFETY CAR IN THIS LAP")) status = "GREEN";
    else if (flag === "RED") status = "RED";
    else if (flag === "CHEQUERED") status = "CHEQUERED";
    else if (flag === "GREEN" && status === "RED") status = "GREEN";
  }
  return status;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v); else m.set(k, [v]);
}

export function fmtGap(g: number | string | null | undefined): string {
  if (g == null) return "";
  if (typeof g === "number") return g === 0 ? "" : `+${g.toFixed(3)}`;
  return g;
}

export function fmtLap(s: number | null | undefined): string {
  if (s == null || !isFinite(s)) return "";
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(3).padStart(6, "0")}`;
}
