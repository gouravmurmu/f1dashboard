// Pit stop prediction: the chance that a driver pits at the end of a lap.
// Gradient-boosted trees on lap features, scored with grouped cross-validation (each fold holds out whole
// drivers, so the model never sees the car it is scored on) and compared with a tyre-age-only baseline.
import { lapRows, type LapRow } from "./laps";
import type { RaceBundle } from "../types";

export const FEATURES = ["Tyre age", "Compound", "Stint", "Race progress", "Laps remaining", "Pace drop-off",
  "Safety car", "Position"] as const;
const COMPOUND_CODE: Record<string, number> = { SOFT: 0, MEDIUM: 1, HARD: 2, INTERMEDIATE: 3, WET: 4 };
export const MAX_STINT: Record<string, number> = { SOFT: 24, MEDIUM: 34, HARD: 46, INTERMEDIATE: 30, WET: 30 };

export interface PitRow extends LapRow { x: number[]; y: number; prob: number }

export function pitFeatures(bundle: RaceBundle): PitRow[] {
  const total = bundle.totalLaps;
  const rows = lapRows(bundle).filter((r) => r.lap < total);
  const out: PitRow[] = [];
  let prevKey = "", prior: number[] = [], drop = 0;
  for (const r of rows) {
    const key = `${r.d}:${r.stint}`;
    if (key !== prevKey) { prior = []; drop = 0; prevKey = key; }
    // Only laps already completed in this stint, so a slow in-lap can't leak into its own prediction.
    if (prior.length) {
      const best = Math.min(...prior);
      const recent = prior.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, prior.length);
      drop = Math.max(0, recent - best);
    }
    out.push({ ...r, y: r.pitIn ? 1 : 0, prob: 0,
      x: [r.life, COMPOUND_CODE[r.compound] ?? 1, r.stint, r.lap / total, total - r.lap, drop, r.neutral ? 1 : 0, r.position] });
    if (r.dur != null && !r.pitIn && !r.pitOut && !r.neutral) prior.push(r.dur);
  }
  return out;
}

// ---------- gradient-boosted trees (log loss, histogram splits) ----------
interface Tree { feat: Int8Array; thr: Float64Array; left: Int16Array; right: Int16Array; value: Float64Array }
export interface GBM { trees: Tree[]; bias: number; lr: number }

const OPTS = { trees: 150, depth: 3, lr: 0.08, minLeaf: 15, lambda: 1, bins: 24 };

function thresholds(X: number[][], f: number): number[] {
  const vals = [...new Set(X.map((x) => x[f]))].sort((a, b) => a - b);
  if (vals.length <= OPTS.bins) return vals.slice(0, -1).map((v, i) => (v + vals[i + 1]) / 2);
  return Array.from({ length: OPTS.bins - 1 }, (_, k) => vals[Math.floor(((k + 1) * vals.length) / OPTS.bins)]);
}

export function fitGBM(X: number[][], y: number[]): GBM {
  const n = X.length, nf = X[0].length;
  const thr = Array.from({ length: nf }, (_, f) => thresholds(X, f));
  const bin = X.map((x) => x.map((v, f) => { let b = 0; while (b < thr[f].length && v > thr[f][b]) b++; return b; }));
  const rate = Math.min(0.99, Math.max(0.01, y.reduce((a, b) => a + b, 0) / n));
  const bias = Math.log(rate / (1 - rate));
  const F = new Float64Array(n).fill(bias);
  const trees: Tree[] = [];
  const g = new Float64Array(n), h = new Float64Array(n);
  for (let t = 0; t < OPTS.trees; t++) {
    for (let i = 0; i < n; i++) { const p = 1 / (1 + Math.exp(-F[i])); g[i] = p - y[i]; h[i] = Math.max(p * (1 - p), 1e-6); }
    const tree: Tree = { feat: new Int8Array(15).fill(-1), thr: new Float64Array(15), left: new Int16Array(15),
      right: new Int16Array(15), value: new Float64Array(15) };
    let next = 1;
    const grow = (node: number, idx: number[], depth: number) => {
      let G = 0, H = 0;
      for (const i of idx) { G += g[i]; H += h[i]; }
      tree.value[node] = -G / (H + OPTS.lambda);
      if (depth >= OPTS.depth || idx.length < 2 * OPTS.minLeaf) return;
      let bestGain = 1e-6, bestF = -1, bestB = -1;
      const parent = (G * G) / (H + OPTS.lambda);
      for (let f = 0; f < nf; f++) {
        const nb = thr[f].length + 1;
        const hg = new Float64Array(nb), hh = new Float64Array(nb), hc = new Int32Array(nb);
        for (const i of idx) { const b = bin[i][f]; hg[b] += g[i]; hh[b] += h[i]; hc[b]++; }
        let gl = 0, hl = 0, cl = 0;
        for (let b = 0; b < nb - 1; b++) {
          gl += hg[b]; hl += hh[b]; cl += hc[b];
          const cr = idx.length - cl;
          if (cl < OPTS.minLeaf || cr < OPTS.minLeaf) continue;
          const gain = (gl * gl) / (hl + OPTS.lambda) + ((G - gl) ** 2) / (H - hl + OPTS.lambda) - parent;
          if (gain > bestGain) { bestGain = gain; bestF = f; bestB = b; }
        }
      }
      if (bestF < 0) return;
      const l = next++, r = next++;
      tree.feat[node] = bestF; tree.thr[node] = thr[bestF][bestB]; tree.left[node] = l; tree.right[node] = r;
      grow(l, idx.filter((i) => bin[i][bestF] <= bestB), depth + 1);
      grow(r, idx.filter((i) => bin[i][bestF] > bestB), depth + 1);
    };
    grow(0, Array.from({ length: n }, (_, i) => i), 0);
    trees.push(tree);
    for (let i = 0; i < n; i++) F[i] += OPTS.lr * leaf(tree, X[i]);
  }
  return { trees, bias, lr: OPTS.lr };
}

function leaf(t: Tree, x: number[]): number {
  let node = 0;
  while (t.feat[node] >= 0) node = x[t.feat[node]] <= t.thr[node] ? t.left[node] : t.right[node];
  return t.value[node];
}

export function predictGBM(m: GBM, x: number[]): number {
  let f = m.bias;
  for (const t of m.trees) f += m.lr * leaf(t, x);
  return 1 / (1 + Math.exp(-f));
}

// ---------- baseline and metrics ----------
function fitLogistic1D(x: number[], y: number[]): (v: number) => number {
  const mu = x.reduce((a, b) => a + b, 0) / x.length;
  const sd = Math.sqrt(x.reduce((a, b) => a + (b - mu) ** 2, 0) / x.length) || 1;
  let a = 0, b = 0;
  for (let it = 0; it < 400; it++) {
    let ga = 0, gb = 0;
    for (let i = 0; i < x.length; i++) {
      const z = (x[i] - mu) / sd, p = 1 / (1 + Math.exp(-(a + b * z)));
      ga += p - y[i]; gb += (p - y[i]) * z;
    }
    a -= (0.5 * ga) / x.length; b -= (0.5 * gb) / x.length;
  }
  return (v) => 1 / (1 + Math.exp(-(a + (b * (v - mu)) / sd)));
}

export function rocAuc(y: number[], p: number[]): number {
  const idx = p.map((v, i) => [v, y[i]] as const).sort((a, b) => a[0] - b[0]);
  let rank = 0, sumPos = 0, nPos = 0;
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j < idx.length && idx[j][0] === idx[i][0]) j++;
    const avg = (i + j + 1) / 2;
    for (let k = i; k < j; k++) if (idx[k][1]) { sumPos += avg; nPos++; }
    rank = j; i = j;
  }
  const nNeg = rank - nPos;
  return nPos && nNeg ? (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg) : NaN;
}

export function averagePrecision(y: number[], p: number[]): number {
  const idx = p.map((v, i) => [v, y[i]] as const).sort((a, b) => b[0] - a[0]);
  const nPos = y.reduce((a, b) => a + b, 0);
  let tp = 0, ap = 0;
  idx.forEach(([, yi], k) => { if (yi) { tp++; ap += tp / (k + 1); } });
  return nPos ? ap / nPos : NaN;
}

export interface PitModel {
  rows: PitRow[]; // with out-of-fold probabilities
  trained: boolean;
  auc: number; ap: number; baseAuc: number; baseAp: number; rate: number;
  importance: { feature: string; value: number }[];
  model: GBM | null;
  stops: number;
}

/** Hazard that rises as the tyre nears its usable life; used when a race has too few stops to learn from. */
export function heuristicPitProbability(r: PitRow): number {
  const x = r.life / (MAX_STINT[r.compound] ?? 32);
  if (r.x[4] < 4) return 0;
  return Math.min(0.95, (1 / (1 + Math.exp(-(x - 0.85) * 10))) * 0.35 + (r.neutral && x > 0.4 ? 0.15 : 0));
}

export function fitPitModel(bundle: RaceBundle, folds = 5): PitModel {
  const rows = pitFeatures(bundle);
  const y = rows.map((r) => r.y);
  const stops = y.reduce((a, b) => a + b, 0);
  const drivers = [...new Set(rows.map((r) => r.d))];
  const empty = { auc: NaN, ap: NaN, baseAuc: NaN, baseAp: NaN, rate: stops / Math.max(1, rows.length), importance: [], model: null, stops };
  if (stops < 8 || drivers.length < 5) {
    rows.forEach((r) => { r.prob = heuristicPitProbability(r); });
    return { rows, trained: false, ...empty };
  }
  const fold = new Map(drivers.map((d, i) => [d, i % folds]));
  const oof = new Array(rows.length).fill(0), base = new Array(rows.length).fill(0);
  for (let k = 0; k < folds; k++) {
    const tr = rows.map((_, i) => i).filter((i) => fold.get(rows[i].d) !== k);
    const te = rows.map((_, i) => i).filter((i) => fold.get(rows[i].d) === k);
    if (!tr.some((i) => y[i])) continue;
    const m = fitGBM(tr.map((i) => rows[i].x), tr.map((i) => y[i]));
    const b = fitLogistic1D(tr.map((i) => rows[i].life), tr.map((i) => y[i]));
    for (const i of te) { oof[i] = predictGBM(m, rows[i].x); base[i] = b(rows[i].life); }
  }
  rows.forEach((r, i) => { r.prob = oof[i]; });
  const model = fitGBM(rows.map((r) => r.x), y);
  // Permutation importance: how much average precision drops when one feature is shuffled.
  const X = rows.map((r) => r.x);
  const full = averagePrecision(y, X.map((x) => predictGBM(model, x)));
  const importance = FEATURES.map((feature, f) => {
    let drop = 0;
    for (let rep = 0; rep < 3; rep++) {
      const col = X.map((x) => x[f]);
      for (let i = col.length - 1; i > 0; i--) { const j = (i * 7919 + rep * 104729) % (i + 1); [col[i], col[j]] = [col[j], col[i]]; }
      drop += full - averagePrecision(y, X.map((x, i) => predictGBM(model, x.map((v, k) => (k === f ? col[i] : v)))));
    }
    return { feature, value: drop / 3 };
  }).sort((a, b) => b.value - a.value);
  return { rows, trained: true, auc: rocAuc(y, oof), ap: averagePrecision(y, oof), baseAuc: rocAuc(y, base),
    baseAp: averagePrecision(y, base), rate: stops / rows.length, importance, model, stops };
}
