// Car telemetry for one lap: speed, throttle, brake, gear and position, aligned by distance.
import { demoBundle, demoCircuit, demoPace } from "./demo";
import { ms, openf1, throttled } from "./openf1";

/** Columns of each sample: seconds into the lap, distance (m), speed (km/h), throttle %, brake (0/1), gear, x, y. */
export interface TelemetryLap { d: number; lap: number; lapTime: number; simulated: boolean; samples: number[][] }

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function fetchTelemetry(key: number, d: number, lap?: number): Promise<TelemetryLap> {
  const laps = await openf1<Row>("laps", { session_key: key, driver_number: d }, 86400);
  const valid = laps.filter((l) => l.lap_duration && l.date_start && !l.is_pit_out_lap && l.lap_number > 1);
  const pick = lap != null ? laps.find((l) => l.lap_number === lap)
    : valid.sort((a, b) => a.lap_duration - b.lap_duration)[0];
  if (!pick?.date_start || !pick.lap_duration) throw new Error("No timed lap found for this driver");
  const from = ms(pick.date_start), to = from + pick.lap_duration * 1000;
  const range = { _gte: { date: new Date(from - 1000).toISOString() }, _lt: { date: new Date(to + 1000).toISOString() } };
  const [car, loc] = await throttled<Row[]>([
    () => openf1("car_data", { session_key: key, driver_number: d, ...range }, 86400),
    () => openf1("location", { session_key: key, driver_number: d, ...range }, 86400),
  ], 2);
  if (!car.length) throw new Error("OpenF1 has no car data for this lap");
  const locs = loc.map((r) => [ms(r.date), r.x, r.y] as const).filter((r) => r[1] || r[2]).sort((a, b) => a[0] - b[0]);
  const xyAt = (t: number): [number, number] => {
    if (!locs.length) return [0, 0];
    let lo = 0, hi = locs.length - 1;
    if (t <= locs[0][0]) return [locs[0][1], locs[0][2]];
    if (t >= locs[hi][0]) return [locs[hi][1], locs[hi][2]];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (locs[m][0] <= t) lo = m; else hi = m; }
    const f = (t - locs[lo][0]) / (locs[hi][0] - locs[lo][0] || 1);
    return [locs[lo][1] + f * (locs[hi][1] - locs[lo][1]), locs[lo][2] + f * (locs[hi][2] - locs[lo][2])];
  };
  const rows: Row[] = car.map((r) => ({ ...r, t: ms(r.date) })).filter((r) => r.t >= from && r.t <= to).sort((a, b) => a.t - b.t);
  let dist = 0, prevT = from, prevV = rows[0]?.speed ?? 0;
  const samples = rows.map((r) => {
    dist += (((prevV + r.speed) / 2) / 3.6) * ((r.t - prevT) / 1000); // integrate speed, as FastF1 does
    prevT = r.t; prevV = r.speed;
    const [x, y] = xyAt(r.t);
    return [round((r.t - from) / 1000, 3), round(dist, 1), r.speed, Math.min(100, r.throttle), r.brake > 0 ? 1 : 0,
      r.n_gear, Math.round(x), Math.round(y)];
  });
  return { d, lap: pick.lap_number, lapTime: pick.lap_duration, simulated: false, samples };
}

/** Physically plausible telemetry on the simulated circuit: corner speeds from curvature, then accel/brake limits. */
export function demoTelemetry(d: number): TelemetryLap {
  const b = demoBundle();
  const own = b.laps.filter((l) => l.d === d && l.lap > 1 && !l.pitOut && l.dur != null &&
    !b.pits.some((p) => p.d === d && p.lap === l.lap) && l.dur < 105);
  const best = own.sort((x, y) => (x.dur as number) - (y.dur as number))[0];
  const { pts, cum, length } = demoCircuit();
  const n = pts.length, scale = 5800 / length; // metres per track unit
  // Each car gets its own balance of cornering grip and straight-line speed, so traces differ, not just scale.
  const h1 = ((d * 2654435761) >>> 0) / 4294967296 - 0.5, h2 = ((d * 40503 + 7) % 997) / 997 - 0.5;
  const grip = 1 - demoPace(d) * 0.02 + h1 * 0.03;
  const vmax = 92 * (1 - demoPace(d) * 0.004 + h2 * 0.02); // m/s
  const v = new Array(n).fill(vmax);
  for (let i = 0; i < n; i++) { // corner speed from the radius through three neighbouring points
    const a = pts[(i - 9 + n) % n], p = pts[i], c = pts[(i + 9) % n];
    const ab = Math.hypot(p[0] - a[0], p[1] - a[1]), bc = Math.hypot(c[0] - p[0], c[1] - p[1]), ac = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const area = Math.abs((p[0] - a[0]) * (c[1] - a[1]) - (p[1] - a[1]) * (c[0] - a[0])) / 2;
    const radius = area > 1e-6 ? ((ab * bc * ac) / (4 * area)) * scale : 1e6;
    v[i] = Math.min(vmax, Math.sqrt(16 * grip * radius));
  }
  const seg = (i: number) => (cum[i + 1] - cum[i]) * scale;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) { // acceleration limit, weaker at high speed
      const j = (i + 1) % n, acc = 13 * (1 - v[i] / 100);
      v[j] = Math.min(v[j], Math.sqrt(v[i] ** 2 + 2 * Math.max(acc, 0.5) * seg(i)));
    }
    for (let i = n - 1; i >= 0; i--) { // braking limit
      const j = (i + 1) % n;
      v[i] = Math.min(v[i], Math.sqrt(v[j] ** 2 + 2 * 42 * seg(i)));
    }
  }
  let t = 0;
  const times = [0];
  for (let i = 0; i < n; i++) { t += seg(i) / ((v[i] + v[(i + 1) % n]) / 2); times.push(t); }
  const k = best?.dur ? t / (best.dur as number) : 1; // match the lap time to the simulated race
  const samples: number[][] = [];
  for (let i = 0; i < n; i += 2) {
    const nextV = v[(i + 6) % n], speed = v[i] * k * 3.6;
    const braking = nextV < v[i] - 1.2;
    const flat = !braking && (nextV > v[i] + 0.3 || v[i] >= vmax - 0.5);
    const gear = Math.max(1, Math.min(8, Math.ceil(speed / 42)));
    samples.push([round(times[i] / k, 3), round(cum[i] * scale, 1), Math.round(speed), braking ? 0 : flat ? 100 : 35,
      braking ? 1 : 0, gear, pts[i][0], pts[i][1]]);
  }
  return { d, lap: best?.lap ?? 2, lapTime: best?.dur ?? t, simulated: true, samples };
}

const round = (x: number, p: number) => Math.round(x * 10 ** p) / 10 ** p;
