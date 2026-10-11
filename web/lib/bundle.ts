// Builds a RaceBundle from OpenF1, the single payload the race page needs.
import { ms, openf1, throttled } from "./openf1";
import { sessionByKey, sessionStatus } from "./sessions";
import { simplify } from "./geometry";
import { shapeOf } from "./bundle-shape";
import type {
  DriverInfo, IntervalRec, LapRec, PitRec, PosRec, RaceBundle, RaceControlRec, ResultRec, StintRec,
  TrackShape, WeatherRec,
} from "./types";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function buildBundle(key: number): Promise<RaceBundle> {
  const session = await sessionByKey(key);
  const live = sessionStatus(session) === "live";
  const ttl = live ? 5 : 3600;
  const q = { session_key: key };
  const [drivers, laps, stints, pits, positions, rc, results, grid, weather, intervals] = await throttled<Row[]>([
    () => openf1("drivers", q, ttl),
    () => openf1("laps", q, ttl),
    () => openf1("stints", q, ttl),
    () => openf1("pit", q, ttl),
    () => openf1("position", q, ttl),
    () => openf1("race_control", q, ttl),
    () => openf1("session_result", q, ttl),
    () => openf1("starting_grid", q, ttl),
    () => openf1("weather", q, ttl),
    () => openf1("intervals", q, ttl),
  ]);
  if (!laps.length) throw new Error("OpenF1 has no laps for this session yet");

  const driverList: DriverInfo[] = uniqueBy(drivers, "driver_number").map((d) => ({
    number: d.driver_number,
    code: d.name_acronym ?? String(d.driver_number),
    name: titleName(d.full_name ?? d.broadcast_name ?? d.name_acronym),
    team: d.team_name ?? "",
    color: `#${String(d.team_colour ?? "888888").replace("#", "")}`,
    headshot: d.headshot_url ?? undefined,
  }));

  const lapRecs: LapRec[] = laps
    .filter((l) => l.date_start)
    .map((l) => ({ d: l.driver_number, lap: l.lap_number, start: ms(l.date_start), dur: l.lap_duration ?? null,
      pitOut: Boolean(l.is_pit_out_lap) }))
    .sort((a, b) => a.d - b.d || a.lap - b.lap);
  // Fill missing lap durations (often lap 1) from the next lap's start.
  for (let i = 0; i < lapRecs.length - 1; i++) {
    const a = lapRecs[i], b = lapRecs[i + 1];
    if (a.dur == null && a.d === b.d && b.lap === a.lap + 1) a.dur = (b.start - a.start) / 1000;
  }

  const stintRecs: StintRec[] = stints.map((s) => ({
    d: s.driver_number, stint: s.stint_number, lapStart: s.lap_start ?? 1, lapEnd: s.lap_end ?? 999,
    compound: String(s.compound ?? "UNKNOWN").toUpperCase(), ageAtStart: s.tyre_age_at_start ?? 0,
  }));
  const pitRecs: PitRec[] = pits.map((p) => ({
    d: p.driver_number, lap: p.lap_number, t: ms(p.date), lane: p.lane_duration ?? p.pit_duration ?? null,
  }));
  const posRecs: PosRec[] = positions.map((p) => ({ d: p.driver_number, t: ms(p.date), pos: p.position }))
    .sort((a, b) => a.t - b.t);
  const rcRecs: RaceControlRec[] = rc.map((r) => ({
    t: ms(r.date), category: r.category ?? "", flag: r.flag ?? null, message: r.message ?? "",
    lap: r.lap_number ?? null,
  })).sort((a, b) => a.t - b.t);
  const resultRecs: ResultRec[] = results.map((r) => ({
    pos: r.position ?? null, d: r.driver_number, laps: r.number_of_laps ?? 0, points: r.points ?? 0,
    status: r.dsq ? "DSQ" : r.dns ? "DNS" : r.dnf ? "DNF" : "Finished", gap: r.gap_to_leader ?? null,
  }));
  resultRecs.sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));

  const lastWeather = weather.at(-1);
  const wx: WeatherRec | null = lastWeather ? {
    air: lastWeather.air_temperature, track: lastWeather.track_temperature, humidity: lastWeather.humidity,
    rain: weather.some((w) => Number(w.rainfall) > 0), wind: lastWeather.wind_speed,
  } : null;

  const raceStart = Math.min(...lapRecs.filter((l) => l.lap === 1).map((l) => l.start));
  const raceEnd = Math.max(...lapRecs.map((l) => l.start + (l.dur ?? 0) * 1000));
  const totalLaps = Math.max(...resultRecs.map((r) => r.laps), ...lapRecs.map((l) => l.lap));

  return {
    session,
    drivers: driverList,
    laps: lapRecs,
    stints: stintRecs,
    pits: pitRecs,
    positions: posRecs,
    intervals: downsampleIntervals(intervals, 10_000),
    raceControl: rcRecs,
    results: resultRecs,
    grid: grid.map((g) => ({ d: g.driver_number, pos: g.position })),
    weather: wx,
    track: await trackShape(key, lapRecs, resultRecs),
    totalLaps,
    raceStart,
    raceEnd: live ? Date.now() : raceEnd,
    simulated: false,
    live,
  };
}

/** Circuit outline traced from one clean lap of a front-running car. */
async function trackShape(key: number, laps: LapRec[], results: ResultRec[]): Promise<TrackShape | null> {
  const durations = laps.map((l) => l.dur).filter((d): d is number => d != null).sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)];
  const order = [...results.map((r) => r.d), ...new Set(laps.map((l) => l.d))];
  for (const d of order.slice(0, 4)) {
    const lap = laps.find((l) => l.d === d && l.lap > 3 && l.dur != null && l.dur < median * 1.05 && !l.pitOut);
    if (!lap) continue;
    const rows = await openf1<Row>("location", {
      session_key: key, driver_number: d,
      _gte: { date: new Date(lap.start).toISOString() },
      _lt: { date: new Date(lap.start + (lap.dur as number) * 1000 + 1500).toISOString() },
    }, 86400);
    const pts = rows.filter((r) => r.x !== 0 || r.y !== 0).map((r) => [r.x, r.y] as [number, number]);
    if (pts.length > 50) return shapeOf(simplify(pts, 6));
  }
  return null;
}


function downsampleIntervals(rows: Row[], everyMs: number): IntervalRec[] {
  const last = new Map<number, number>();
  const out: IntervalRec[] = [];
  for (const r of [...rows].sort((a, b) => ms(a.date) - ms(b.date))) {
    const t = ms(r.date);
    if (t - (last.get(r.driver_number) ?? -Infinity) < everyMs) continue;
    last.set(r.driver_number, t);
    out.push({ d: r.driver_number, t, gap: r.gap_to_leader ?? null, int: r.interval ?? null });
  }
  return out;
}

function uniqueBy<T extends Row>(rows: T[], key: string): T[] {
  const seen = new Map<unknown, T>();
  for (const r of rows) seen.set(r[key], r);
  return [...seen.values()];
}

function titleName(s: string): string {
  return String(s ?? "").toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());
}
