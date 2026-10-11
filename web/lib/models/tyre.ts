// Fuel-corrected tyre degradation model, fitted on one race.
//   lap time = base + driver pace + fuel effect x lap + compound offset + wear x age + wear2 x age^2
// One ridge regression on clean green-flag laps separates driver pace from tyre wear and fuel burn.
import { lapRows, median, rng, type LapRow } from "./laps";
import type { RaceBundle } from "../types";

export type CompoundParams = [offset: number, linear: number, quadratic: number];
export const DEFAULT_COMPOUNDS: Record<string, CompoundParams> = {
  SOFT: [-0.65, 0.085, 0.0016], MEDIUM: [0, 0.05, 0.0009], HARD: [0.45, 0.03, 0.0004],
  INTERMEDIATE: [6, 0.06, 0], WET: [10, 0.05, 0],
};
export const DRY = ["SOFT", "MEDIUM", "HARD"] as const;

export interface TyreModel {
  base: number;
  fuel: number; // s per lap (negative: cars get faster as fuel burns)
  sigma: number;
  pace: Record<number, number>; // driver number -> s/lap relative to the reference driver
  compounds: Record<string, CompoundParams>;
  mae: number | null;
  r2: number | null;
  holdout: number;
  nLaps: number;
  fitted: boolean;
}

export function cleanLaps(rows: LapRow[]): LapRow[] {
  const ok = rows.filter((r) => r.lap > 1 && !r.pitIn && !r.pitOut && !r.neutral && r.dur != null &&
    r.compound in DEFAULT_COMPOUNDS);
  const med = new Map<number, number>();
  for (const d of new Set(ok.map((r) => r.d))) med.set(d, median(ok.filter((r) => r.d === d).map((r) => r.dur!)));
  return ok.filter((r) => r.dur! < med.get(r.d)! * 1.05);
}

/** Solves (XᵀX + αI)β = Xᵀy without shrinking the intercept. */
export function ridge(X: number[][], y: number[], alpha = 1e-3): number[] {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
  for (let r = 0; r < X.length; r++) {
    const x = X[r];
    for (let i = 0; i < p; i++) {
      if (x[i] === 0) continue;
      for (let j = i; j < p; j++) A[i][j] += x[i] * x[j];
      A[i][p] += x[i] * y[r];
    }
  }
  for (let i = 0; i < p; i++) { for (let j = 0; j < i; j++) A[i][j] = A[j][i]; if (i > 0) A[i][i] += alpha; }
  for (let c = 0; c < p; c++) { // Gaussian elimination with partial pivoting
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const div = A[c][c] || 1e-12;
    for (let r = 0; r < p; r++) {
      if (r === c) continue;
      const f = A[r][c] / div;
      if (f) for (let k = c; k <= p; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, i) => row[p] / (row[i] || 1e-12));
}

export function fitTyreModel(bundle: RaceBundle, holdout = 0.2, seed = 0): TyreModel {
  const df = cleanLaps(lapRows(bundle));
  const model: TyreModel = { base: 90, fuel: -0.055, sigma: 0.35, pace: {}, compounds: { ...DEFAULT_COMPOUNDS },
    mae: null, r2: null, holdout: 0, nLaps: df.length, fitted: false };
  if (df.length < 50) {
    if (df.length) model.base = median(df.map((r) => r.dur!));
    return model;
  }
  const drivers = [...new Set(df.map((r) => r.d))].sort((a, b) => a - b);
  const comps = Object.keys(DEFAULT_COMPOUNDS).filter((c) => df.some((r) => r.compound === c));
  const ref = comps.includes("MEDIUM") ? "MEDIUM" : comps[0];
  const design = (r: LapRow) => {
    const row = [1, r.lap, ...drivers.slice(1).map((d) => (r.d === d ? 1 : 0))];
    for (const c of comps) {
      const ind = r.compound === c ? 1 : 0;
      if (c !== ref) row.push(ind);
      row.push(ind * r.life, ind * r.life * r.life);
    }
    return row;
  };
  const X = df.map(design), y = df.map((r) => r.dur!);
  const rand = rng(seed + 11);
  const test = df.map(() => rand() < holdout);
  const coefTrain = ridge(X.filter((_, i) => !test[i]), y.filter((_, i) => !test[i]));
  const resid = X.map((x, i) => (test[i] ? y[i] - dot(x, coefTrain) : NaN)).filter((v) => !Number.isNaN(v));
  const yTest = y.filter((_, i) => test[i]);
  if (resid.length > 2) {
    model.mae = resid.reduce((s, v) => s + Math.abs(v), 0) / resid.length;
    model.r2 = 1 - variance(resid) / variance(yTest);
  }
  model.holdout = resid.length;
  const coef = ridge(X, y); // refit on every lap for use in the app
  model.sigma = Math.sqrt(variance(X.map((x, i) => y[i] - dot(x, coef))));
  model.base = coef[0];
  model.fuel = coef[1];
  let i = 2;
  model.pace = { [drivers[0]]: 0 };
  for (const d of drivers.slice(1)) model.pace[d] = coef[i++];
  for (const c of comps) {
    const off = c !== ref ? coef[i++] : 0;
    const lin = coef[i++], quad = coef[i++];
    model.compounds[c] = [off, Math.max(lin, 0), quad];
  }
  if (ref !== "MEDIUM") { // express unseen compounds relative to the fitted reference
    const shift = DEFAULT_COMPOUNDS[ref][0];
    for (const c of Object.keys(DEFAULT_COMPOUNDS)) if (!comps.includes(c)) {
      const [o, l, q] = DEFAULT_COMPOUNDS[c];
      model.compounds[c] = [o - shift, l, q];
    }
  }
  model.fitted = true;
  return model;
}

export function tyreCost(m: TyreModel, compound: string, life: number): number {
  const [off, lin, quad] = m.compounds[compound] ?? m.compounds.MEDIUM;
  return off + lin * life + quad * life * life;
}

export function predictLap(m: TyreModel, d: number, compound: string, life: number, lap: number): number {
  const paces = Object.values(m.pace);
  const pace = m.pace[d] ?? (paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : 0);
  return m.base + pace + m.fuel * lap + tyreCost(m, compound, life);
}

/** Seconds lost against a fresh set of the same compound, by tyre age. */
export function degradation(m: TyreModel, compound: string, life: number): number {
  const [, lin, quad] = m.compounds[compound] ?? m.compounds.MEDIUM;
  return lin * (life - 1) + quad * (life * life - 1);
}

/** Median time lost to a green-flag stop: in-lap + out-lap minus two normal laps. */
export function pitLoss(bundle: RaceBundle, fallback = 21.5): number {
  const rows = lapRows(bundle);
  const clean = cleanLaps(rows);
  const med = new Map<number, number>();
  for (const d of new Set(clean.map((r) => r.d))) med.set(d, median(clean.filter((r) => r.d === d).map((r) => r.dur!)));
  const losses: number[] = [];
  for (const r of rows) {
    if (!r.pitIn || r.dur == null || r.neutral || !med.has(r.d)) continue;
    const out = rows.find((x) => x.d === r.d && x.lap === r.lap + 1);
    if (!out || out.dur == null || out.neutral) continue;
    const loss = r.dur + out.dur - 2 * med.get(r.d)!;
    if (loss > 10 && loss < 45) losses.push(loss);
  }
  return losses.length ? median(losses) : fallback;
}

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
function variance(xs: number[]) {
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  return xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length;
}
