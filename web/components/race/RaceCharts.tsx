"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COMPOUND_COLORS } from "@/lib/format";
import { fmtLap, type RaceState, type ReplayIndex } from "@/lib/replay";
import type { SimResult } from "@/lib/sim";

const TABS = ["Positions", "Gaps", "Lap times", "Strategy", "Prediction", "Results"] as const;
type Tab = (typeof TABS)[number];

interface Props { idx: ReplayIndex; state: RaceState; sim: SimResult[]; selected: number | null }

export default function RaceCharts({ idx, state, sim, selected }: Props) {
  const [tab, setTab] = useState<Tab>("Positions");
  const lap = state.lap;
  const b = idx.bundle;
  const t = state.t;
  const finished = state.status === "CHEQUERED" || t >= b.raceEnd;
  const focus = useMemo(() => {
    const top = state.cars.filter((c) => !c.out).slice(0, 5).map((c) => c.driver.number);
    return selected != null && !top.includes(selected) ? [...top.slice(0, 4), selected] : top;
  }, [state.cars, selected]);

  // Everything below only uses data up to the moment being shown; recomputed once per lap.
  const data = useMemo(() => {
    const posRows: Record<string, number>[] = [];
    const gapRows: Record<string, number>[] = [];
    const lapRows: Record<string, number>[] = [];
    const leaderLaps = Math.max(0, state.cars.reduce((m, c) => Math.max(m, c.lapsDone), 0));
    for (let l = 1; l <= leaderLaps; l++) {
      const pr: Record<string, number> = { lap: l }, gr: Record<string, number> = { lap: l }, lr: Record<string, number> = { lap: l };
      for (const d of b.drivers) {
        const rec = idx.lapsBy.get(d.number)?.find((x) => x.lap === l);
        if (!rec || idx.lapEnd(rec) > t) continue;
        const end = idx.lapEnd(rec);
        const pos = lastBefore(idx.posBy.get(d.number), end);
        if (pos) pr[d.code] = pos.pos;
        const iv = lastBefore(idx.intBy.get(d.number), end);
        if (iv && typeof iv.gap === "number") gr[d.code] = iv.gap;
        if (rec.dur != null && rec.dur < idx.medianLap * 1.12 && l > 1) lr[d.code] = rec.dur;
      }
      posRows.push(pr); gapRows.push(gr); lapRows.push(lr);
    }
    return { posRows, gapRows, lapRows };
  }, [idx, b.drivers, lap, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const drivers = b.drivers;
  const color = (d: number) => drivers.find((x) => x.number === d)?.color ?? "#999";
  const code = (d: number) => drivers.find((x) => x.number === d)?.code ?? String(d);

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((x) => (
          <button key={x} onClick={() => setTab(x)}
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${tab === x ? "bg-f1 text-white" : "bg-paper text-muted hover:text-ink"}`}>
            {x}
          </button>
        ))}
      </div>
      {tab === "Positions" && (
        <Chart rows={data.posRows} keys={drivers.map((d) => d.code)} colorOf={(k) => drivers.find((d) => d.code === k)!.color}
          highlight={focus.map(code)} reversed domain={[1, drivers.length]} yLabel="Position" />
      )}
      {tab === "Gaps" && (
        <Chart rows={data.gapRows} keys={focus.map(code)} colorOf={(k) => drivers.find((d) => d.code === k)!.color}
          highlight={focus.map(code)} yLabel="Gap to leader (s)" fmt={(v) => `+${v.toFixed(1)}s`} />
      )}
      {tab === "Lap times" && (
        <Chart rows={data.lapRows} keys={focus.map(code)} colorOf={(k) => drivers.find((d) => d.code === k)!.color}
          highlight={focus.map(code)} yLabel="Lap time" fmt={(v) => fmtLap(v)} domain={["dataMin - 0.5", "dataMax + 0.5"]} />
      )}
      {tab === "Strategy" && <Strategy idx={idx} state={state} />}
      {tab === "Prediction" && <Prediction sim={sim} color={color} code={code} finished={finished} />}
      {tab === "Results" && (finished ? <Results idx={idx} /> :
        <p className="py-10 text-center text-sm text-muted">Final classification appears when the chequered flag falls. See Prediction for the projected finish.</p>)}
    </div>
  );
}

function lastBefore<T extends { t: number }>(rows: T[] | undefined, t: number): T | null {
  if (!rows?.length) return null;
  let lo = 0, hi = rows.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans >= 0 ? rows[ans] : null;
}

interface ChartProps {
  rows: Record<string, number>[]; keys: string[]; colorOf: (k: string) => string; highlight: string[];
  reversed?: boolean; domain?: [number | string, number | string]; yLabel: string; fmt?: (v: number) => string;
}

function Chart({ rows, keys, colorOf, highlight, reversed, domain, yLabel, fmt }: ChartProps) {
  if (rows.length < 2) return <p className="py-10 text-center text-sm text-muted">Charts fill in as laps are completed.</p>;
  return (
    <div>
    <div className="mb-2 flex flex-wrap gap-3 text-xs font-bold">
      {highlight.map((k) => <span key={k} className="flex items-center gap-1"><span className="h-1 w-4 rounded-full" style={{ background: colorOf(k) }} />{k}</span>)}
      <span className="font-normal text-muted">Select a driver on the map or timing table to add them.</span>
    </div>
    <div className="h-80">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
          <CartesianGrid stroke="#ececf1" vertical={false} />
          <XAxis dataKey="lap" tick={{ fontSize: 11 }} stroke="#9a9aa5" />
          <YAxis reversed={reversed} domain={domain ?? ["auto", "auto"]} tick={{ fontSize: 11 }} stroke="#9a9aa5"
            width={52} allowDecimals={false} tickFormatter={fmt} label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: "#6b6b7b" }}
            interval="preserveStartEnd" />
          <Tooltip formatter={(v) => (fmt ? fmt(Number(v)) : String(v))} labelFormatter={(l) => `Lap ${l}`}
            itemSorter={(i) => (reversed ? Number(i.value) : -Number(i.value))} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
          {keys.map((k) => {
            const on = highlight.includes(k);
            return <Line key={k} dataKey={k} stroke={colorOf(k)} strokeWidth={on ? 2.5 : 1} strokeOpacity={on ? 1 : 0.25}
              dot={false} isAnimationActive={false} connectNulls />;
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
    </div>
  );
}

function Strategy({ idx, state }: { idx: ReplayIndex; state: RaceState }) {
  const total = idx.bundle.totalLaps;
  return (
    <div className="space-y-1">
      {state.cars.map((c) => {
        const stints = (idx.stintsBy.get(c.driver.number) ?? []).filter((s) => s.lapStart <= c.lap);
        return (
          <div key={c.driver.number} className="flex items-center gap-2 text-xs">
            <span className="w-9 font-black">{c.driver.code}</span>
            <div className="relative h-4 flex-1 rounded bg-paper">
              {stints.map((s) => {
                const endLap = Math.min(s.lapEnd, c.lap);
                return (
                  <div key={s.stint} title={`${s.compound} laps ${s.lapStart}–${endLap}`}
                    className="absolute inset-y-0 rounded border border-white text-[9px] font-black leading-[14px] text-carbon/70"
                    style={{ left: `${((s.lapStart - 1) / total) * 100}%`, width: `${((endLap - s.lapStart + 1) / total) * 100}%`,
                      background: COMPOUND_COLORS[s.compound] ?? COMPOUND_COLORS.UNKNOWN }}>
                    <span className="pl-1">{s.compound[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex gap-3 pt-2 text-[11px] text-muted">
        {["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].map((k) => (
          <span key={k} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-line" style={{ background: COMPOUND_COLORS[k] }} />{k.toLowerCase()}</span>
        ))}
      </div>
    </div>
  );
}

function Prediction({ sim, color, code, finished }: { sim: SimResult[]; color: (d: number) => string; code: (d: number) => string; finished: boolean }) {
  const rows = [...sim].sort((a, b) => a.expected - b.expected);
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted">The simulation starts after the first lap.</p>;
  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        {finished ? "Race finished." : "400 simulated finishes from this moment, using each driver's recent pace, tyre wear, pit stops, safety cars and retirements."}
      </p>
      <div className="mb-1 hidden gap-x-6 md:grid md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-2 text-[10px] font-bold uppercase tracking-wider text-muted">
            <span className="w-7" /><span className="w-9" /><span className="flex-1">Win</span><span className="flex-1">Podium</span><span className="flex-1">Points</span><span className="w-10 text-right">Win</span>
          </div>
        ))}
      </div>
      <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.d} className="flex items-center gap-2 text-xs">
            <span className="tabular w-7 font-black text-muted">P{r.projected}</span>
            <span className="w-9 font-black">{code(r.d)}</span>
            {(["win", "podium", "points"] as const).map((k) => (
              <div key={k} className="flex-1" title={`${k}: ${(r[k] * 100).toFixed(0)}%`}>
                <div className="h-3 rounded-sm bg-paper">
                  <div className="h-3 rounded-sm" style={{ width: `${r[k] * 100}%`, background: color(r.d), opacity: k === "win" ? 1 : k === "podium" ? 0.7 : 0.4 }} />
                </div>
              </div>
            ))}
            <span className="tabular w-10 text-right font-bold">{Math.round(r.win * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Results({ idx }: { idx: ReplayIndex }) {
  const b = idx.bundle;
  const drv = new Map(b.drivers.map((d) => [d.number, d]));
  return (
    <table className="w-full text-sm">
      <thead className="text-[10px] font-bold uppercase tracking-wider text-muted">
        <tr className="border-b border-line"><th className="py-1">Pos</th><th className="text-left">Driver</th><th className="hidden text-left sm:table-cell">Team</th><th className="text-right">Grid</th><th className="text-right">Laps</th><th className="text-right">Gap</th><th className="pr-2 text-right">Pts</th></tr>
      </thead>
      <tbody>
        {b.results.map((r) => {
          const d = drv.get(r.d);
          return (
            <tr key={r.d} className="border-b border-line/70 last:border-0">
              <td className="tabular py-1.5 text-center font-black">{r.pos ?? r.status}</td>
              <td><span className="mr-2 inline-block h-3 w-1 rounded-full align-middle" style={{ background: d?.color }} /><b>{d?.name ?? r.d}</b></td>
              <td className="hidden text-muted sm:table-cell">{d?.team}</td>
              <td className="tabular text-right text-muted">{idx.gridPos.get(r.d) ?? ""}</td>
              <td className="tabular text-right">{r.laps}</td>
              <td className="tabular text-right">{r.status !== "Finished" ? r.status : typeof r.gap === "number" ? (r.gap ? `+${r.gap.toFixed(3)}` : "") : r.gap ?? ""}</td>
              <td className="tabular pr-2 text-right font-black">{r.points || ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
