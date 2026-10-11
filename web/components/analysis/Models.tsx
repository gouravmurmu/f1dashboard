"use client";
import { useEffect, useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { COMPOUND_COLORS } from "@/lib/format";
import { fmtLap } from "@/lib/replay";
import { lapRows } from "@/lib/models/laps";
import { fitPitModel, type PitModel } from "@/lib/models/pit";
import { optimise } from "@/lib/models/strategy";
import { DRY, degradation, predictLap, type TyreModel } from "@/lib/models/tyre";
import type { RaceBundle } from "@/lib/types";
import { DriverSelect, Kpi, Slider } from "./ui";

const fmt3 = (v: number | null) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(3));

// ---------- Tyre degradation ----------
export function Tyres({ bundle, tyre, loss }: { bundle: RaceBundle; tyre: TyreModel; loss: number }) {
  const maxLife = useMemo(() => {
    const ages: Record<string, number> = {};
    for (const s of bundle.stints) ages[s.compound] = Math.max(ages[s.compound] ?? 0, s.ageAtStart + s.lapEnd - s.lapStart + 1);
    return ages;
  }, [bundle.stints]);
  const used = DRY.filter((c) => (maxLife[c] ?? 0) > 0);
  const curves = Array.from({ length: 40 }, (_, i) => {
    const life = i + 1, row: Record<string, number> = { life };
    for (const c of used) if (life <= Math.min(40, (maxLife[c] ?? 0) + 5)) row[c] = degradation(tyre, c, life);
    return row;
  });
  const pace = Object.entries(tyre.pace).map(([d, v]) => ({ d: Number(d), v }));
  const fastest = Math.min(...pace.map((p) => p.v));
  const paceRows = pace.map((p) => ({ ...p, gap: p.v - fastest, drv: bundle.drivers.find((x) => x.number === p.d) }))
    .filter((p) => p.drv).sort((a, b) => a.gap - b.gap);
  const maxGap = Math.max(0.01, ...paceRows.map((p) => p.gap));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Fuel effect" value={`${(-tyre.fuel).toFixed(3)} s/lap`} sub="faster each lap as fuel burns" />
        <Kpi label="Pit stop loss" value={`${loss.toFixed(1)} s`} sub="measured from green-flag stops" />
        <Kpi label="Holdout error" value={tyre.mae != null ? `${tyre.mae.toFixed(3)} s` : "–"} sub="mean absolute, per lap" />
        <Kpi label="Holdout R²" value={tyre.r2 != null ? tyre.r2.toFixed(2) : "–"} sub={`${tyre.holdout} laps never seen in fitting`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <div className="card p-4">
          <h3 className="section-title !text-base">Time lost to tyre wear</h3>
          <p className="mb-2 text-xs text-muted">Seconds per lap slower than a fresh set of the same compound, by tyre age. Lines stop just past the longest stint raced.</p>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={curves} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
                <CartesianGrid stroke="#ececf1" vertical={false} />
                <XAxis dataKey="life" tick={{ fontSize: 11 }} stroke="#9a9aa5" label={{ value: "Tyre age (laps)", position: "insideBottom", offset: -2, fontSize: 11 }} height={36} />
                <YAxis tick={{ fontSize: 11 }} stroke="#9a9aa5" width={44} tickFormatter={(v) => `${Number(v).toFixed(1)}s`} />
                <Tooltip formatter={(v) => `+${Number(v).toFixed(2)}s`} labelFormatter={(l) => `Lap ${l} on the set`} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                {used.map((c) => <Line key={c} dataKey={c} stroke={c === "HARD" ? "#9a9aa5" : COMPOUND_COLORS[c]} strokeWidth={2.5} dot={false} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead className="text-[10px] font-bold uppercase tracking-wider text-muted"><tr className="text-right"><th className="text-left">Compound</th><th>Pace vs medium</th><th>Wear at lap 10</th><th>Lost after 20 laps</th></tr></thead>
            <tbody className="tabular">
              {DRY.map((c) => { const [o, l, q] = tyre.compounds[c]; return (
                <tr key={c} className="border-t border-line text-right"><td className="py-1.5 text-left font-bold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full border border-line align-middle" style={{ background: COMPOUND_COLORS[c] }} />{c.toLowerCase()}{!used.includes(c) && <span className="ml-1 text-xs font-normal text-muted">(not raced, default)</span>}</td>
                  <td>{o >= 0 ? "+" : ""}{o.toFixed(2)}s</td><td>{(l + 20 * q).toFixed(3)} s/lap</td><td>{degradation(tyre, c, 20).toFixed(2)}s</td></tr>); })}
            </tbody>
          </table>
        </div>
        <div className="card p-4">
          <h3 className="section-title !text-base">Raw driver pace</h3>
          <p className="mb-2 text-xs text-muted">Seconds per lap behind the fastest driver, with tyres and fuel taken out.</p>
          <div className="space-y-1">
            {paceRows.map((p) => (
              <div key={p.d} className="flex items-center gap-2 text-xs">
                <span className="w-9 font-black">{p.drv!.code}</span>
                <div className="h-3 flex-1 rounded-sm bg-paper"><div className="h-3 rounded-sm" style={{ width: `${Math.max(2, (p.gap / maxGap) * 100)}%`, background: p.drv!.color }} /></div>
                <span className="tabular w-14 text-right font-bold">{p.gap === 0 ? "fastest" : `+${p.gap.toFixed(3)}`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">One regression on {tyre.nLaps} clean green-flag laps (no pit laps, safety cars or outliers) separates driver pace, fuel burn and compound wear. It is scored on 20% of laps held out from fitting.</p>
    </div>
  );
}

// ---------- Pit stop model ----------
export function PitStops({ bundle }: { bundle: RaceBundle }) {
  const [pm, setPm] = useState<PitModel | null>(null);
  useEffect(() => { const id = setTimeout(() => setPm(fitPitModel(bundle)), 30); return () => clearTimeout(id); }, [bundle]);
  const [lap, setLap] = useState(Math.floor(bundle.totalLaps / 2));
  if (!pm) return <div className="card grid h-72 place-items-center text-sm text-muted">Training the pit stop model…</div>;
  const order = bundle.results.length ? bundle.results.map((r) => r.d) : bundle.drivers.map((d) => d.number);
  const byDriver = new Map<number, Map<number, { p: number; y: number }>>();
  for (const r of pm.rows) (byDriver.get(r.d) ?? byDriver.set(r.d, new Map()).get(r.d)!).set(r.lap, { p: r.prob, y: r.y });
  const laps = bundle.totalLaps - 1;
  const now = pm.rows.filter((r) => r.lap === lap).sort((a, b) => b.prob - a.prob).slice(0, 8);
  const maxImp = Math.max(1e-6, ...pm.importance.map((i) => i.value));
  return (
    <div className="space-y-4">
      {pm.trained ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="ROC AUC" value={pm.auc.toFixed(3)} sub={`${(pm.auc - pm.baseAuc >= 0 ? "+" : "")}${(pm.auc - pm.baseAuc).toFixed(3)} vs tyre-age baseline`} />
          <Kpi label="Precision-recall AUC" value={pm.ap.toFixed(3)} sub={`${(pm.ap - pm.baseAp >= 0 ? "+" : "")}${(pm.ap - pm.baseAp).toFixed(3)} vs baseline`} />
          <Kpi label="Base pit rate" value={`${(pm.rate * 100).toFixed(1)}%`} sub={`${pm.stops} stops in ${pm.rows.length.toLocaleString()} laps`} />
          <Kpi label="Lift over random" value={`${(pm.ap / pm.rate).toFixed(1)}×`} sub="precision-recall AUC ÷ pit rate" />
        </div>
      ) : <div className="card p-4 text-sm">Too few stops in this race to train the model, so a tyre-age heuristic is shown instead.</div>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="card overflow-x-auto p-4">
          <h3 className="section-title !text-base">Pit probability, lap by lap</h3>
          <p className="mb-2 text-xs text-muted">Darker red = more likely to pit at the end of that lap. Black dots are the real stops. {pm.trained && "Each driver's row comes from a model that never saw that driver."}</p>
          <div className="min-w-[560px] space-y-px">
            {order.map((d) => { const drv = bundle.drivers.find((x) => x.number === d); const row = byDriver.get(d); if (!drv || !row) return null; return (
              <div key={d} className="flex items-center gap-1.5">
                <span className="w-8 text-[10px] font-black">{drv.code}</span>
                <div className="grid flex-1 gap-px" style={{ gridTemplateColumns: `repeat(${laps}, minmax(0, 1fr))` }}>
                  {Array.from({ length: laps }, (_, i) => { const c = row.get(i + 1); return (
                    <div key={i} title={c ? `Lap ${i + 1}: ${(c.p * 100).toFixed(0)}%${c.y ? " (pitted)" : ""}` : ""}
                      className="relative grid h-3 place-items-center" style={{ background: c ? `rgba(225,6,0,${Math.min(1, c.p * 1.6)})` : "#f7f7f9" }}>
                      {c?.y ? <span className="h-1.5 w-1.5 rounded-full bg-carbon" /> : null}
                    </div>); })}
                </div>
              </div>); })}
            <div className="flex justify-between pl-10 text-[10px] text-muted"><span>Lap 1</span><span>Lap {laps}</span></div>
          </div>
        </div>
        <div className="space-y-4">
          {pm.trained && (
            <div className="card p-4">
              <h3 className="section-title !text-base">What drives a stop</h3>
              <p className="mb-2 text-xs text-muted">How much accuracy drops when each input is shuffled.</p>
              <div className="space-y-1.5">
                {pm.importance.map((i) => (
                  <div key={i.feature} className="text-xs">
                    <div className="flex justify-between font-bold"><span>{i.feature}</span></div>
                    <div className="h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-f1" style={{ width: `${Math.max(0, (i.value / maxImp) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="card p-4">
            <h3 className="section-title !text-base">Who pits next?</h3>
            <Slider label="Lap" value={lap} min={1} max={laps} onChange={setLap} />
            <table className="mt-2 w-full text-sm">
              <tbody>
                {now.map((r) => (
                  <tr key={r.d} className="border-t border-line">
                    <td className="py-1 font-black">{r.code}</td>
                    <td className="text-xs text-muted">{r.compound.toLowerCase()}, {r.life} laps old</td>
                    <td className="w-24"><div className="h-2 rounded-full bg-line"><div className="h-2 rounded-full bg-f1" style={{ width: `${r.prob * 100}%` }} /></div></td>
                    <td className="tabular w-12 text-right font-bold">{(r.prob * 100).toFixed(0)}%{r.y ? " ✓" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-muted">✓ = actually pitted that lap.</p>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">Gradient-boosted decision trees on tyre age, compound, stint, race progress, laps remaining, pace drop-off, safety car and position. Scores are out-of-fold: each fold holds out whole drivers. The baseline is a logistic regression on tyre age alone.</p>
    </div>
  );
}

// ---------- Pace forecast ----------
export function PaceForecast({ bundle, tyre }: { bundle: RaceBundle; tyre: TyreModel }) {
  const order = bundle.results.length ? bundle.results.map((r) => r.d) : bundle.drivers.map((d) => d.number);
  const [d, setD] = useState(order[0]);
  const rows = useMemo(() => lapRows(bundle).filter((r) => r.d === d), [bundle, d]);
  const maxLap = Math.max(3, ...rows.map((r) => r.lap));
  const [from, setFrom] = useState(Math.max(2, Math.floor(bundle.totalLaps / 3)));
  const [horizon, setHorizon] = useState(10);
  const fromLap = Math.min(from, maxLap - 1);
  const cur = rows.find((r) => r.lap === fromLap);
  const med = rows.map((r) => r.dur ?? 0).filter(Boolean).sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 95;
  const band = 1.645 * tyre.sigma;
  const end = Math.min(bundle.totalLaps, fromLap + horizon);
  const data = rows.filter((r) => r.lap > 1 && r.lap <= end).map((r) => {
    const clean = r.dur != null && r.dur < med * 1.08 && !r.pitIn && !r.pitOut;
    const row: Record<string, number | [number, number] | null> = { lap: r.lap, actual: clean ? r.dur : null };
    if (cur && r.lap > fromLap) {
      const p = predictLap(tyre, d, cur.compound, cur.life + (r.lap - fromLap), r.lap);
      row.pred = p; row.band = [p - band, p + band];
    }
    return row;
  });
  const errs = data.filter((r) => r.pred != null && r.actual != null).map((r) => Math.abs((r.actual as number) - (r.pred as number)));
  const color = bundle.drivers.find((x) => x.number === d)?.color ?? "#e10600";
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-4 p-4">
        <DriverSelect label="Driver" bundle={bundle} value={d} onChange={setD} />
        <Slider label="Forecast from lap" value={fromLap} min={2} max={maxLap - 1} onChange={setFrom} />
        <Slider label="Laps ahead" value={horizon} min={3} max={20} onChange={setHorizon} />
      </div>
      <div className="card p-4">
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
              <CartesianGrid stroke="#ececf1" vertical={false} />
              <XAxis dataKey="lap" tick={{ fontSize: 11 }} stroke="#9a9aa5" />
              <YAxis domain={["dataMin - 0.5", "dataMax + 0.5"]} tick={{ fontSize: 11 }} stroke="#9a9aa5" width={56} tickFormatter={(v) => fmtLap(Number(v))} />
              <Tooltip labelFormatter={(l) => `Lap ${l}`} contentStyle={{ fontSize: 12, borderRadius: 10 }}
                formatter={(v, n) => [Array.isArray(v) ? `${fmtLap(v[0])} – ${fmtLap(v[1])}` : fmtLap(Number(v)), n === "band" ? "90% band" : n === "pred" ? "Forecast" : "Actual"]} />
              <Area dataKey="band" stroke="none" fill={color} fillOpacity={0.15} isAnimationActive={false} />
              <Line dataKey="pred" stroke={color} strokeDasharray="6 4" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Scatter dataKey="actual" fill="#15151e" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-sm">
          {cur ? <>Forecast on <b>{cur.compound.toLowerCase()}</b> tyres aged {cur.life} {cur.life === 1 ? "lap" : "laps"} at lap {fromLap}. </> : null}
          {errs.length ? <>Mean error against what actually happened: <b>{(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(2)}s</b> per lap (pit and safety car laps left out).</> : "No later laps to check the forecast against yet."}
        </p>
        <p className="mt-1 text-xs text-muted">Dots: actual lap times. Dashed line: the tyre model&apos;s forecast if the driver stays out on the same set. Shaded: 90% band.</p>
      </div>
    </div>
  );
}

// ---------- Strategy optimiser ----------
export function Strategy({ bundle, tyre, loss }: { bundle: RaceBundle; tyre: TyreModel; loss: number }) {
  const [pl, setPl] = useState(Math.round(loss * 2) / 2);
  const [minStint, setMinStint] = useState(8);
  const plans = useMemo(() => optimise(tyre, bundle.totalLaps, pl, minStint), [tyre, bundle.totalLaps, pl, minStint]);
  const actual = useMemo(() => {
    const stops = new Map<number, number>();
    for (const d of bundle.drivers) stops.set(d.number, bundle.pits.filter((p) => p.d === d.number).length);
    const counts = new Map<number, number>();
    for (const v of stops.values()) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [bundle]);
  const best = plans[0];
  const total = bundle.totalLaps;
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-4 p-4">
        <Slider label="Pit stop loss" value={pl} min={15} max={35} step={0.5} onChange={setPl} fmt={(v) => `${v.toFixed(1)}s`} />
        <Slider label="Shortest stint" value={minStint} min={4} max={15} onChange={setMinStint} fmt={(v) => `${v} laps`} />
      </div>
      {!best ? <div className="card p-4 text-sm">No valid strategies for these settings.</div> : (
        <div className="card p-4">
          <p className="mb-3 text-sm">Fastest plan: <span className="chip bg-f1 text-white">{best.name}</span> stopping on lap <b>{best.pitLaps.join(" and ")}</b>. Uses the compound wear fitted on this race and a {pl.toFixed(1)}s stop.</p>
          <div className="space-y-2">
            {plans.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3 text-xs">
                <span className="w-14 font-black">{p.name}</span>
                <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-paper">
                  {(() => { let start = 0; return p.stints.map(([c, n], i) => { const left = (start / total) * 100; start += n; return (
                    <div key={i} className="absolute inset-y-0 grid place-items-center border-r-2 border-white text-[10px] font-black text-carbon/80"
                      style={{ left: `${left}%`, width: `${(n / total) * 100}%`, background: COMPOUND_COLORS[c] }}>{n}</div>); }); })()}
                </div>
                <span className="tabular w-16 text-right font-bold">{i === 0 ? "fastest" : `+${p.delta.toFixed(1)}s`}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm">What teams actually did: {actual.map(([k, v]) => <span key={k} className="mr-3"><b>{v}</b> × {k}-stop</span>)}</p>
        </div>
      )}
      <p className="text-xs text-muted">Every one- and two-stop plan using at least two dry compounds, with stint lengths capped at each compound&apos;s usable life. Bar numbers are stint lengths in laps.</p>
    </div>
  );
}
