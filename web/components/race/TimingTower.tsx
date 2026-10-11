"use client";
import { COMPOUND_COLORS } from "@/lib/format";
import { fmtGap, fmtLap, type RaceState, type ReplayIndex } from "@/lib/replay";
import type { SimResult } from "@/lib/sim";

interface Props {
  idx: ReplayIndex;
  state: RaceState;
  sim: Map<number, SimResult>;
  selected: number | null;
  onSelect: (d: number | null) => void;
  mode: "gap" | "int";
  setMode: (m: "gap" | "int") => void;
}

const pct = (x: number | undefined) => (x == null ? "" : x >= 0.995 ? "100%" : x < 0.005 ? "–" : `${Math.round(x * 100)}%`);

export default function TimingTower({ idx, state, sim, selected, onSelect, mode, setMode }: Props) {
  const maxWin = Math.max(0.01, ...[...sim.values()].map((s) => s.win));
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-sm font-black uppercase tracking-wide">Timing</h2>
        <div className="flex rounded-md bg-paper p-0.5 text-[11px] font-bold uppercase">
          {(["gap", "int"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded px-2 py-0.5 ${mode === m ? "bg-white shadow-sm" : "text-muted"}`}>
              {m === "gap" ? "Leader" : "Interval"}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full text-[13px]">
        <thead className="text-[10px] font-bold uppercase tracking-wider text-muted">
          <tr className="border-b border-line">
            <th className="w-7 py-1.5">P</th>
            <th className="py-1.5 text-left">Driver</th>
            <th className="py-1.5 text-right">{mode === "gap" ? "Gap" : "Int"}</th>
            <th className="py-1.5" title="Tyre and age">Tyre</th>
            <th className="hidden py-1.5 text-right sm:table-cell">Last</th>
            <th className="py-1.5 text-right" title="Win probability from the Monte Carlo simulation">Win</th>
            <th className="py-1.5 pr-3 text-right" title="Projected finishing position">Proj</th>
          </tr>
        </thead>
        <tbody>
          {state.cars.map((c) => {
            const s = sim.get(c.driver.number);
            const grid = idx.gridPos.get(c.driver.number);
            const delta = grid != null && !c.out ? grid - c.position : 0;
            const sel = selected === c.driver.number;
            const gap = c.out ? "OUT" : c.inPit ? "PIT" : c.position === 1 ? (c.finished ? "Winner" : "Leader")
              : fmtGap(mode === "gap" ? c.gap : c.interval);
            return (
              <tr key={c.driver.number} onClick={() => onSelect(sel ? null : c.driver.number)}
                className={`cursor-pointer border-b border-line/70 last:border-0 ${sel ? "bg-f1/8" : "hover:bg-paper"} ${c.out ? "opacity-45" : ""}`}>
                <td className="tabular py-1 text-center font-black">{c.out ? "–" : c.position}</td>
                <td className="py-1">
                  <div className="flex items-center gap-1.5">
                    <span className="h-4 w-1 rounded-full" style={{ background: c.driver.color }} />
                    <span className="font-black">{c.driver.code}</span>
                    {delta !== 0 && (
                      <span className={`text-[10px] font-bold ${delta > 0 ? "text-inter" : "text-f1"}`}>
                        {delta > 0 ? "▲" : "▼"}{Math.abs(delta)}
                      </span>
                    )}
                  </div>
                </td>
                <td className={`tabular py-1 text-right ${c.inPit ? "font-bold text-f1" : ""}`}>{gap}</td>
                <td className="py-1">
                  <div className="flex items-center justify-center gap-1">
                    <span className="grid h-4 w-4 place-items-center rounded-full border-[3px] text-[8px] font-black"
                      style={{ borderColor: COMPOUND_COLORS[c.compound] ?? COMPOUND_COLORS.UNKNOWN }}>
                      {c.compound[0] === "U" ? "?" : c.compound[0]}
                    </span>
                    <span className="tabular text-[11px] text-muted">{c.tyreAge}</span>
                  </div>
                </td>
                <td className="tabular hidden py-1 text-right text-muted sm:table-cell">{fmtLap(c.lastLap)}</td>
                <td className="py-1 text-right">
                  <div className="relative ml-auto h-4 w-12">
                    <div className="absolute inset-y-0 right-0 rounded-sm bg-f1/15" style={{ width: `${((s?.win ?? 0) / maxWin) * 100}%` }} />
                    <span className="tabular relative text-[12px] font-bold">{pct(s?.win)}</span>
                  </div>
                </td>
                <td className="tabular py-1 pr-3 text-right font-bold text-muted">{s ? `P${s.projected}` : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
