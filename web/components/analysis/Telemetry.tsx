"use client";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TelemetryLap } from "@/lib/telemetry";
import type { RaceBundle } from "@/lib/types";
import { fmtLap } from "@/lib/replay";
import { DriverSelect, Kpi } from "./ui";

const T = 0, DIST = 1, SPEED = 2, THROTTLE = 3, BRAKE = 4, GEAR = 5, X = 6, Y = 7;

function useTelemetry(bundle: RaceBundle, d: number) {
  const [data, setData] = useState<TelemetryLap | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    setData(null); setError(null);
    fetch(`/api/race/${bundle.session.key}/telemetry?d=${d}${bundle.simulated ? "&demo=1" : ""}`)
      .then((r) => r.json())
      .then((j) => { if (stop) return; if (j.error) setError(j.error); else setData(j); })
      .catch((e) => !stop && setError((e as Error).message));
    return () => { stop = true; };
  }, [bundle.session.key, bundle.simulated, d]);
  return { data, error };
}

/** Value of column `col` at distance `x`, linearly interpolated. */
function at(s: number[][], x: number, col: number): number {
  let lo = 0, hi = s.length - 1;
  if (x <= s[0][DIST]) return s[0][col];
  if (x >= s[hi][DIST]) return s[hi][col];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m][DIST] <= x) lo = m; else hi = m; }
  const f = (x - s[lo][DIST]) / (s[hi][DIST] - s[lo][DIST] || 1);
  return s[lo][col] + f * (s[hi][col] - s[lo][col]);
}

export default function Telemetry({ bundle }: { bundle: RaceBundle }) {
  const order = bundle.results.length ? bundle.results.map((r) => r.d) : bundle.drivers.map((d) => d.number);
  const [da, setDa] = useState(order[0]);
  const [db, setDb] = useState(order[1] ?? order[0]);
  const A = useTelemetry(bundle, da), B = useTelemetry(bundle, db);
  const drv = (d: number) => bundle.drivers.find((x) => x.number === d)!;
  const ca = drv(da)?.color ?? "#e10600";
  const cb0 = drv(db)?.color ?? "#15151e";
  const cb = cb0.toLowerCase() === ca.toLowerCase() ? "#15151e" : cb0;

  const merged = useMemo(() => {
    const a = A.data?.samples, b = B.data?.samples;
    if (!a?.length || !b?.length) return null;
    const len = Math.min(a.at(-1)![DIST], b.at(-1)![DIST]);
    const rows = Array.from({ length: 400 }, (_, i) => {
      const x = (len * i) / 399;
      return { dist: Math.round(x), sa: at(a, x, SPEED), sb: at(b, x, SPEED), ta: at(a, x, THROTTLE), tb: at(b, x, THROTTLE),
        ba: at(a, x, BRAKE) > 0.5 ? 1 : 0, bb: at(b, x, BRAKE) > 0.5 ? 1 : 0, ga: Math.round(at(a, x, GEAR)), gb: Math.round(at(b, x, GEAR)),
        delta: at(b, x, T) - at(a, x, T) };
    });
    return { rows, len };
  }, [A.data, B.data]);

  const stats = (t: TelemetryLap | null) => {
    if (!t?.samples.length) return null;
    const s = t.samples;
    return { top: Math.max(...s.map((r) => r[SPEED])), flat: (s.filter((r) => r[THROTTLE] >= 98).length / s.length) * 100,
      brake: (s.filter((r) => r[BRAKE]).length / s.length) * 100, avg: s.reduce((x, r) => x + r[SPEED], 0) / s.length };
  };
  const sa = stats(A.data), sb = stats(B.data);
  const nameA = drv(da)?.code, nameB = drv(db)?.code;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <DriverSelect label="Driver A" bundle={bundle} value={da} onChange={setDa} />
        <DriverSelect label="Driver B" bundle={bundle} value={db} onChange={setDb} />
        <p className="text-xs text-muted">Each driver&apos;s fastest lap.{bundle.simulated && " Simulated telemetry on the demo circuit."}</p>
      </div>
      {(A.error || B.error) && <div className="card p-4 text-sm">Telemetry could not be loaded ({A.error ?? B.error}).</div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`${nameA} fastest lap`} value={A.data ? fmtLap(A.data.lapTime) : "…"} sub={A.data ? `Lap ${A.data.lap}` : ""} color={ca} />
        <Kpi label={`${nameB} fastest lap`} value={B.data ? fmtLap(B.data.lapTime) : "…"}
          sub={A.data && B.data ? `${B.data.lapTime - A.data.lapTime >= 0 ? "+" : ""}${(B.data.lapTime - A.data.lapTime).toFixed(3)}s vs ${nameA}` : ""} color={cb} />
        <Kpi label="Top speed" value={sa && sb ? `${Math.round(sa.top)} / ${Math.round(sb.top)}` : "…"} sub={`km/h, ${nameA} / ${nameB}`} />
        <Kpi label="Full throttle" value={sa && sb ? `${sa.flat.toFixed(0)}% / ${sb.flat.toFixed(0)}%` : "…"}
          sub={sa && sb ? `Braking ${sa.brake.toFixed(0)}% / ${sb.brake.toFixed(0)}% of the lap` : ""} />
      </div>
      {!merged ? <div className="card grid h-72 place-items-center text-sm text-muted">{A.error || B.error ? "No telemetry" : "Loading car telemetry…"}</div> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
          <div className="card space-y-1 p-4">
            <Legend items={[[nameA!, ca], [nameB!, cb]]} />
            <Trace rows={merged.rows} title="Speed (km/h)" a="sa" b="sb" ca={ca} cb={cb} height={210} />
            <Trace rows={merged.rows} title="Throttle (%)" a="ta" b="tb" ca={ca} cb={cb} height={110} />
            <Trace rows={merged.rows} title="Brake" a="ba" b="bb" ca={ca} cb={cb} height={70} step />
            <Trace rows={merged.rows} title="Gear" a="ga" b="gb" ca={ca} cb={cb} height={100} step />
            <div>
              <div className="kicker mb-1">Gap: {nameB} vs {nameA} (s, above zero = {nameB} behind)</div>
              <div className="h-32">
                <ResponsiveContainer>
                  <AreaChart data={merged.rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#ececf1" vertical={false} />
                    <XAxis dataKey="dist" type="number" domain={[0, merged.len]} tick={{ fontSize: 10 }} stroke="#9a9aa5" unit="m" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#9a9aa5" width={44} tickFormatter={(v) => Number(v).toFixed(2)} />
                    <Tooltip formatter={(v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(3)}s`} labelFormatter={(l) => `${l} m`} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                    <Area dataKey="delta" stroke="#e10600" fill="#e10600" fillOpacity={0.15} isAnimationActive={false} name="Gap" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <Dominance a={A.data!.samples} b={B.data!.samples} ca={ca} cb={cb} na={nameA!} nb={nameB!} />
            <div className="card p-4 text-sm">
              <h3 className="section-title mb-2 !text-base">Lap profile</h3>
              <table className="w-full">
                <thead className="text-[10px] font-bold uppercase tracking-wider text-muted"><tr><th className="text-left" /><th className="text-right">{nameA}</th><th className="text-right">{nameB}</th></tr></thead>
                <tbody className="tabular">
                  {[["Average speed (km/h)", sa!.avg, sb!.avg, 0], ["Top speed (km/h)", sa!.top, sb!.top, 0], ["Full throttle (% of lap)", sa!.flat, sb!.flat, 0],
                    ["Braking (% of lap)", sa!.brake, sb!.brake, 0]].map(([l, x, y, p]) => (
                    <tr key={l as string} className="border-t border-line"><td className="py-1.5">{l}</td>
                      <td className="text-right font-bold">{(x as number).toFixed(p as number)}</td><td className="text-right font-bold">{(y as number).toFixed(p as number)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return <div className="flex gap-4 text-xs font-bold">{items.map(([n, c]) => <span key={n} className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-full" style={{ background: c }} />{n}</span>)}</div>;
}

function Trace({ rows, title, a, b, ca, cb, height, step }: {
  rows: Record<string, number>[]; title: string; a: string; b: string; ca: string; cb: string; height: number; step?: boolean;
}) {
  return (
    <div>
      <div className="kicker">{title}</div>
      <div style={{ height }}>
        <ResponsiveContainer>
          <LineChart data={rows} syncId="tel" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#ececf1" vertical={false} />
            <XAxis dataKey="dist" type="number" domain={["dataMin", "dataMax"]} hide />
            <YAxis tick={{ fontSize: 10 }} stroke="#9a9aa5" width={44} domain={step ? [0, "dataMax"] : ["auto", "auto"]} allowDecimals={false} />
            <Tooltip labelFormatter={(l) => `${l} m`} formatter={(v) => Math.round(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
            <Line dataKey={a} stroke={ca} dot={false} strokeWidth={1.8} isAnimationActive={false} type={step ? "stepAfter" : "monotone"} name={a} />
            <Line dataKey={b} stroke={cb} dot={false} strokeWidth={1.8} isAnimationActive={false} type={step ? "stepAfter" : "monotone"} name={b} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** The circuit split into mini-sectors, each coloured by the driver with the higher average speed there. */
function Dominance({ a, b, ca, cb, na, nb }: { a: number[][]; b: number[][]; ca: string; cb: string; na: string; nb: string }) {
  const SECTORS = 25;
  const geo = useMemo(() => {
    const pts = a.filter((r) => r[X] || r[Y]);
    if (pts.length < 10) return null;
    const xs = pts.map((r) => r[X]), ys = pts.map((r) => r[Y]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = Math.max(maxX - minX, maxY - minY) * 0.06;
    const len = Math.min(a.at(-1)![DIST], b.at(-1)![DIST]);
    let winsA = 0;
    const segs = Array.from({ length: SECTORS }, (_, k) => {
      const lo = (len * k) / SECTORS, hi = (len * (k + 1)) / SECTORS;
      const mean = (s: number[][]) => { const r = s.filter((x) => x[DIST] >= lo && x[DIST] <= hi); return r.reduce((t, x) => t + x[SPEED], 0) / (r.length || 1); };
      const fasterA = mean(a) >= mean(b);
      if (fasterA) winsA++;
      const path = pts.filter((r) => r[DIST] >= lo - 5 && r[DIST] <= hi + 5)
        .map((r, i) => `${i ? "L" : "M"}${(r[X] - minX + pad).toFixed(0)} ${(maxY - r[Y] + pad).toFixed(0)}`).join("");
      return { path, color: fasterA ? ca : cb };
    });
    return { segs, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad, unit: Math.max(maxX - minX, maxY - minY) / 100, winsA };
  }, [a, b, ca, cb]);
  if (!geo) return null;
  return (
    <div className="card p-4">
      <h3 className="section-title !text-base">Track dominance</h3>
      <p className="mb-2 text-xs text-muted">Faster driver in each of {SECTORS} mini-sectors: {na} {geo.winsA}, {nb} {SECTORS - geo.winsA}.</p>
      <svg viewBox={`0 0 ${geo.w.toFixed(0)} ${geo.h.toFixed(0)}`} className="h-auto w-full">
        {geo.segs.map((s, i) => <path key={i} d={s.path} fill="none" stroke={s.color} strokeWidth={geo.unit * 2.4} strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>
      <Legend items={[[na, ca], [nb, cb]]} />
    </div>
  );
}
