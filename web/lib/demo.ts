// A simulated race in the same shape as live data, used when OpenF1 is unreachable and for tests.
import { shapeOf } from "./bundle-shape";
import type {
  DriverInfo, IntervalRec, LapRec, LocationWindow, PitRec, PosRec, RaceBundle, RaceControlRec, ResultRec,
  StintRec,
} from "./types";

export const DEMO_KEY = 0;

// number, code, name, team, colour, pace offset (s/lap)
const GRID: [number, string, string, string, string, number][] = [
  [12, "ANT", "Kimi Antonelli", "Mercedes", "#00D7B6", 0.0],
  [63, "RUS", "George Russell", "Mercedes", "#00D7B6", 0.1],
  [16, "LEC", "Charles Leclerc", "Ferrari", "#ED1131", 0.14],
  [44, "HAM", "Lewis Hamilton", "Ferrari", "#ED1131", 0.16],
  [1, "NOR", "Lando Norris", "McLaren", "#F47600", 0.17],
  [81, "PIA", "Oscar Piastri", "McLaren", "#F47600", 0.22],
  [3, "VER", "Max Verstappen", "Red Bull Racing", "#4781D7", 0.2],
  [6, "HAD", "Isack Hadjar", "Red Bull Racing", "#4781D7", 0.48],
  [55, "SAI", "Carlos Sainz", "Williams", "#1868DB", 0.52],
  [23, "ALB", "Alexander Albon", "Williams", "#1868DB", 0.58],
  [14, "ALO", "Fernando Alonso", "Aston Martin", "#229971", 0.56],
  [18, "STR", "Lance Stroll", "Aston Martin", "#229971", 0.76],
  [10, "GAS", "Pierre Gasly", "Alpine", "#00A1E8", 0.6],
  [43, "COL", "Franco Colapinto", "Alpine", "#00A1E8", 0.8],
  [30, "LAW", "Liam Lawson", "Racing Bulls", "#6C98FF", 0.62],
  [41, "LIN", "Arvid Lindblad", "Racing Bulls", "#6C98FF", 0.78],
  [87, "BEA", "Oliver Bearman", "Haas F1 Team", "#9C9FA2", 0.63],
  [31, "OCO", "Esteban Ocon", "Haas F1 Team", "#9C9FA2", 0.7],
  [27, "HUL", "Nico Hulkenberg", "Audi", "#F50537", 0.72],
  [5, "BOR", "Gabriel Bortoleto", "Audi", "#F50537", 0.7],
  [11, "PER", "Sergio Perez", "Cadillac", "#909090", 0.95],
  [77, "BOT", "Valtteri Bottas", "Cadillac", "#909090", 1.0],
];

const COMPOUND = { SOFT: [-0.6, 0.085], MEDIUM: [0, 0.05], HARD: [0.45, 0.03] } as const;
type Compound = keyof typeof COMPOUND;
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const TOTAL_LAPS = 52;
const BASE_LAP = 96;
const PIT_LANE = 22;

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

/** A closed circuit-like curve, sampled finely, with cumulative arc length. */
function circuit() {
  const pts: [number, number][] = [];
  for (let i = 0; i < 900; i++) {
    const a = (i / 900) * 2 * Math.PI;
    const r = 3000 * (1 + 0.28 * Math.sin(2 * a + 0.4) + 0.16 * Math.sin(3 * a + 1.2) + 0.07 * Math.sin(5 * a + 2));
    pts.push([Math.round(r * Math.cos(a) * 1.45), Math.round(r * Math.sin(a))]);
  }
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) {
    const p = pts[i % pts.length], q = pts[i - 1];
    cum.push(cum[i - 1] + Math.hypot(p[0] - q[0], p[1] - q[1]));
  }
  return { pts, cum, length: cum[cum.length - 1] };
}
const TRACK = circuit();

function pointAt(frac: number): [number, number] {
  const target = (((frac % 1) + 1) % 1) * TRACK.length;
  let lo = 0, hi = TRACK.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TRACK.cum[m] <= target) lo = m; else hi = m; }
  const f = (target - TRACK.cum[lo]) / (TRACK.cum[hi] - TRACK.cum[lo] || 1);
  const p = TRACK.pts[lo % TRACK.pts.length], q = TRACK.pts[hi % TRACK.pts.length];
  return [p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])];
}

interface SimCar { d: number; lapStarts: number[]; durs: number[]; retiredAfter: number | null }

let cache: { bundle: RaceBundle; cars: SimCar[] } | null = null;

function simulate() {
  if (cache) return cache;
  const r = rng(2026);
  const raceStart = Date.UTC(2026, 9, 4, 13, 3, 0);
  const sc = { from: 18 + Math.floor(r() * 10), len: 4 };
  const cars: SimCar[] = [];
  const stints: StintRec[] = [], pits: PitRec[] = [], laps: LapRec[] = [];
  GRID.forEach(([d, , , , , pace], gi) => {
    const twoStop = r() < 0.35;
    const plan: [Compound, number][] = twoStop
      ? [["SOFT", 0], ["MEDIUM", 14 + Math.floor(r() * 4)], ["HARD", 32 + Math.floor(r() * 5)]]
      : r() < 0.6 ? [["MEDIUM", 0], ["HARD", 20 + Math.floor(r() * 8)]] : [["HARD", 0], ["MEDIUM", 28 + Math.floor(r() * 6)]];
    const retiredAfter = r() < 0.06 ? 10 + Math.floor(r() * 35) : null;
    let t = raceStart + gi * 220; // staggered grid
    const lapStarts: number[] = [], durs: number[] = [];
    let stint = 0, age = 0;
    for (let lap = 1; lap <= TOTAL_LAPS; lap++) {
      if (retiredAfter && lap > retiredAfter) break;
      const next = plan[stint + 1];
      const pitIn = next && lap === next[1];
      const [cOff, deg] = COMPOUND[plan[stint][0]];
      let dur = BASE_LAP + pace + cOff + deg * age + 0.0008 * age * age - 0.06 * lap + gauss(r) * 0.35;
      if (lap === 1) dur += 6;
      if (lap >= sc.from && lap < sc.from + sc.len) dur = BASE_LAP * 1.38 + gi * 0.05;
      if (pitIn) dur += PIT_LANE / 2;
      if (lap > 1 && plan[stint][1] === lap - 1 && stint > 0) dur += PIT_LANE / 2;
      lapStarts.push(t); durs.push(dur);
      laps.push({ d, lap, start: t, dur: Math.round(dur * 1000) / 1000, pitOut: stint > 0 && plan[stint][1] === lap - 1 });
      if (pitIn) {
        pits.push({ d, lap, t: t + dur * 1000 - 12_000, lane: PIT_LANE + gauss(r) * 0.6 });
        stints.push({ d, stint: stint + 1, lapStart: plan[stint][1] + 1, lapEnd: lap, compound: plan[stint][0], ageAtStart: 0 });
        stint += 1; age = 0;
      } else age += 1;
      t += dur * 1000;
    }
    const lastLap = lapStarts.length;
    stints.push({ d, stint: stint + 1, lapStart: plan[stint][1] + 1, lapEnd: lastLap, compound: plan[stint][0], ageAtStart: 0 });
    cars.push({ d, lapStarts, durs, retiredAfter });
  });

  // Safety car compresses the field: queue cars behind the leader at the restart.
  const restartLap = sc.from + sc.len - 1;
  const order = cars.filter((c) => c.durs.length >= restartLap)
    .sort((a, b) => endOf(a, restartLap - 1) - endOf(b, restartLap - 1));
  const leaderEnd = endOf(order[0], restartLap - 1);
  order.forEach((c, i) => {
    const target = leaderEnd + i * 900;
    const maxPull = (c.durs[restartLap - 2] - 70) * 1000; // never make the SC lap shorter than 70 s
    const shift = Math.max(target - endOf(c, restartLap - 1), -maxPull);
    for (let k = restartLap - 1; k < c.lapStarts.length; k++) c.lapStarts[k] += shift;
    c.durs[restartLap - 2] += shift / 1000;
  });
  laps.length = 0;
  for (const c of cars) c.lapStarts.forEach((s, i) => laps.push({ d: c.d, lap: i + 1, start: s,
    dur: Math.round(c.durs[i] * 1000) / 1000, pitOut: false }));
  for (const p of pits) {
    const lap = laps.find((l) => l.d === p.d && l.lap === p.lap + 1);
    if (lap) lap.pitOut = true;
    const own = laps.find((l) => l.d === p.d && l.lap === p.lap);
    if (own) p.t = own.start + (own.dur as number) * 1000 - 12_000;
  }

  // Positions and gaps at every lap end.
  const positions: PosRec[] = [], intervals: IntervalRec[] = [];
  const prevPos = new Map<number, number>();
  for (let lap = 1; lap <= TOTAL_LAPS; lap++) {
    const running = cars.filter((c) => c.durs.length >= lap).sort((a, b) => endOf(a, lap) - endOf(b, lap));
    const lead = endOf(running[0], lap);
    running.forEach((c, i) => {
      const t = endOf(c, lap);
      if (prevPos.get(c.d) !== i + 1) positions.push({ d: c.d, t, pos: i + 1 });
      prevPos.set(c.d, i + 1);
      intervals.push({ d: c.d, t, gap: i === 0 ? 0 : round3((t - lead) / 1000),
        int: i === 0 ? 0 : round3((t - endOf(running[i - 1], lap)) / 1000) });
    });
  }
  // Starting order.
  GRID.forEach(([d], i) => positions.unshift({ d, t: raceStart - 60_000, pos: i + 1 }));
  positions.sort((a, b) => a.t - b.t);

  const finishers = cars.filter((c) => !c.retiredAfter).sort((a, b) => endOf(a, TOTAL_LAPS) - endOf(b, TOTAL_LAPS));
  const dnfs = cars.filter((c) => c.retiredAfter).sort((a, b) => b.durs.length - a.durs.length);
  const winT = endOf(finishers[0], TOTAL_LAPS);
  const results: ResultRec[] = [
    ...finishers.map((c, i) => ({ pos: i + 1, d: c.d, laps: TOTAL_LAPS, points: POINTS[i] ?? 0,
      status: "Finished" as const, gap: i === 0 ? 0 : round3((endOf(c, TOTAL_LAPS) - winT) / 1000) })),
    ...dnfs.map((c, i) => ({ pos: finishers.length + i + 1, d: c.d, laps: c.durs.length, points: 0,
      status: "DNF" as const, gap: null })),
  ];
  const scStart = endOf(order[0], sc.from - 1);
  const raceControl: RaceControlRec[] = [
    { t: raceStart - 120_000, category: "Flag", flag: "GREEN", message: "GREEN LIGHT - PIT EXIT OPEN", lap: 1 },
    { t: scStart, category: "SafetyCar", flag: null, message: "SAFETY CAR DEPLOYED", lap: sc.from },
    { t: leaderEnd - 60_000, category: "SafetyCar", flag: null, message: "SAFETY CAR IN THIS LAP", lap: restartLap },
    ...dnfs.map((c) => ({ t: endOf(c, c.durs.length), category: "Other", flag: null,
      message: `CAR ${c.d} (${code(c.d)}) STOPPED ON TRACK`, lap: c.durs.length })),
    { t: winT, category: "Flag", flag: "CHEQUERED", message: "CHEQUERED FLAG", lap: TOTAL_LAPS },
  ].sort((a, b) => a.t - b.t);

  const drivers: DriverInfo[] = GRID.map(([number, c, name, team, color]) => ({ number, code: c, name, team, color }));
  const bundle: RaceBundle = {
    session: { key: DEMO_KEY, meetingKey: 0, name: "Race", meetingName: "Demo Grand Prix", circuit: "Demo Circuit",
      location: "Simulated", country: "Simulation", countryCode: "SIM", start: raceStart - 180_000,
      end: winT + 600_000, year: 2026, cancelled: false },
    drivers, laps, stints, pits, positions, intervals, raceControl, results,
    grid: GRID.map(([d], i) => ({ d, pos: i + 1 })),
    weather: { air: 27, track: 39, humidity: 58, rain: false, wind: 1.8 },
    track: shapeOf(TRACK.pts.filter((_, i) => i % 3 === 0)),
    totalLaps: TOTAL_LAPS, raceStart, raceEnd: winT + 120_000, simulated: true, live: false,
    note: "This is a simulated race on a made-up circuit, so every feature works without live timing data.",
  };
  cache = { bundle, cars };
  return cache;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const code = (d: number) => GRID.find((g) => g[0] === d)?.[1] ?? String(d);
function endOf(c: SimCar, lap: number): number {
  const i = Math.min(lap, c.durs.length) - 1;
  return c.lapStarts[i] + c.durs[i] * 1000;
}

export function demoBundle(): RaceBundle {
  return simulate().bundle;
}

export function demoLocations(from: number, to: number, stepMs = 400): LocationWindow {
  const { cars, bundle } = simulate();
  const out: Record<number, number[]> = {};
  for (const c of cars) {
    const arr: number[] = [];
    const gridOffset = (GRID.findIndex((g) => g[0] === c.d) * 8) / TRACK.length;
    for (let t = from; t < to; t += stepMs) {
      let frac: number;
      if (t < bundle.raceStart) frac = -gridOffset;
      else {
        let i = c.lapStarts.findIndex((s, k) => t >= s && t < s + c.durs[k] * 1000);
        if (i < 0) {
          if (t >= c.lapStarts[c.lapStarts.length - 1]) {
            if (c.retiredAfter) continue; // retired cars leave the track
            i = c.lapStarts.length - 1;
            frac = c.lapStarts.length + Math.min((t - endOf(c, c.lapStarts.length)) / 120_000, 0.5);
            const [x, y] = pointAt(frac);
            arr.push(t, Math.round(x), Math.round(y));
            continue;
          }
          i = 0;
        }
        const f = (t - c.lapStarts[i]) / (c.durs[i] * 1000);
        frac = i + f - gridOffset * (1 - Math.min(1, i));
      }
      const [x, y] = pointAt(frac);
      arr.push(t, Math.round(x), Math.round(y));
    }
    out[c.d] = arr;
  }
  return { from, to, cars: out };
}
