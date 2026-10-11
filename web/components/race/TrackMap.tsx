"use client";
import { useMemo } from "react";
import { positionAt } from "@/lib/geometry";
import type { RaceState, TrackStatus } from "@/lib/replay";
import type { TrackShape } from "@/lib/types";

const STATUS: Record<TrackStatus, { label: string; cls: string } | null> = {
  GREEN: null,
  SC: { label: "Safety car", cls: "bg-medium text-carbon" },
  VSC: { label: "Virtual safety car", cls: "bg-medium text-carbon" },
  RED: { label: "Red flag", cls: "bg-f1 text-white" },
  CHEQUERED: { label: "Chequered flag", cls: "bg-carbon text-white" },
};

interface Props {
  track: TrackShape | null;
  state: RaceState;
  t: number;
  cars: Record<number, number[]>;
  selected: number | null;
  onSelect: (d: number | null) => void;
  totalLaps: number;
}

export default function TrackMap({ track, state, t, cars, selected, onSelect, totalLaps }: Props) {
  const geo = useMemo(() => {
    if (!track) return null;
    const w = track.maxX - track.minX, h = track.maxY - track.minY;
    const rotate = h > w * 1.15;
    const W = rotate ? h : w, H = rotate ? w : h;
    const pad = Math.max(W, H) * 0.06;
    const map = (x: number, y: number): [number, number] => rotate
      ? [y - track.minY + pad, x - track.minX + pad]
      : [x - track.minX + pad, track.maxY - y + pad];
    const path = track.points.map(([x, y], i) => `${i ? "L" : "M"}${map(x, y).map((v) => v.toFixed(0)).join(" ")}`).join("") + "Z";
    const start = track.points.length ? map(...track.points[0]) : null;
    return { map, path, start, vw: W + 2 * pad, vh: H + 2 * pad, unit: Math.max(W, H) / 100 };
  }, [track]);

  const byNumber = new Map(state.cars.map((c) => [c.driver.number, c]));
  const status = STATUS[state.status];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-carbon lg:sticky lg:top-20">
      <div className="pointer-events-none absolute left-4 top-3 z-10 text-white">
        <div className="kicker !text-white/50">Lap</div>
        <div className="tabular text-3xl font-black leading-none">
          {Math.max(state.lap, 1)}<span className="text-lg text-white/40">/{totalLaps}</span>
        </div>
      </div>
      {status && (
        <div className={`absolute right-3 top-3 z-10 rounded-md px-3 py-1 text-xs font-black uppercase tracking-wider ${status.cls}`}>
          {status.label}
        </div>
      )}
      {geo ? (
        <svg viewBox={`0 0 ${geo.vw.toFixed(0)} ${geo.vh.toFixed(0)}`} className="block h-auto max-h-[62vh] w-full"
          onClick={() => onSelect(null)} role="img" aria-label="Track map with live car positions">
          <path d={geo.path} fill="none" stroke="#2c2c3a" strokeWidth={geo.unit * 4.2} strokeLinejoin="round" />
          <path d={geo.path} fill="none" stroke="#e9e9ef" strokeWidth={geo.unit * 1.3} strokeLinejoin="round" />
          {geo.start && (
            <rect x={geo.start[0] - geo.unit * 0.6} y={geo.start[1] - geo.unit * 2.2} width={geo.unit * 1.2}
              height={geo.unit * 4.4} fill="#e10600" />
          )}
          {[...state.cars].reverse().map((c) => {
            const p = positionAt(cars[c.driver.number], t);
            if (!p || c.out) return null;
            const [x, y] = geo.map(p[0], p[1]);
            const sel = selected === c.driver.number;
            const dim = selected != null && !sel;
            const r = geo.unit * (sel ? 2.1 : 1.55);
            return (
              <g key={c.driver.number} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} opacity={dim ? 0.45 : 1}
                className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onSelect(c.driver.number); }}>
                <circle r={r} fill={c.driver.color} stroke={sel ? "#fff" : "#15151e"} strokeWidth={geo.unit * (sel ? 0.5 : 0.3)} />
                <title>{`P${c.position} ${c.driver.name}`}</title>
                {(sel || (selected == null && c.position <= 5)) && (
                  <text y={-r - geo.unit * 0.8} textAnchor="middle" fontSize={geo.unit * (sel ? 3.2 : 2.4)} fontWeight={900}
                    fill="#fff" stroke="#15151e" strokeWidth={geo.unit * 0.5} paintOrder="stroke">
                    {c.driver.code}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      ) : (
        <div className="grid h-80 place-items-center text-sm text-white/60">Track outline not available for this session.</div>
      )}
      <MessageTicker messages={state.messages} />
      {Object.keys(cars).length === 0 && geo && (
        <div className="absolute inset-x-0 bottom-12 text-center text-xs text-white/60">Loading car positions…</div>
      )}
      {selected != null && byNumber.get(selected) && <span className="sr-only">Selected {byNumber.get(selected)!.driver.name}</span>}
    </div>
  );
}

function MessageTicker({ messages }: { messages: RaceState["messages"] }) {
  const m = messages[0];
  if (!m) return null;
  return (
    <div className="flex items-center gap-2 border-t border-white/10 bg-black/30 px-4 py-2 text-xs text-white/80">
      <span className="chip bg-white/10 text-white">Race control</span>
      {m.lap != null && <span className="tabular text-white/50">L{m.lap}</span>}
      <span className="truncate">{m.message}</span>
    </div>
  );
}
