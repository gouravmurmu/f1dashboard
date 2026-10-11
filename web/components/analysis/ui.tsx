"use client";
import type { RaceBundle } from "@/lib/types";

export function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card p-4" style={color ? { borderTop: `3px solid ${color}` } : undefined}>
      <div className="kicker">{label}</div>
      <div className="tabular text-2xl font-black">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function DriverSelect({ label, bundle, value, onChange }: { label: string; bundle: RaceBundle; value: number; onChange: (d: number) => void }) {
  const order = bundle.results.length ? bundle.results.map((r) => r.d) : bundle.drivers.map((d) => d.number);
  return (
    <label className="text-xs font-bold uppercase tracking-wide text-muted">
      {label}
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 block rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-bold normal-case tracking-normal text-ink">
        {order.map((d) => { const x = bundle.drivers.find((k) => k.number === d); return x ? <option key={d} value={d}>{x.code} · {x.name}</option> : null; })}
      </select>
    </label>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label className="block min-w-44 flex-1 text-xs font-bold uppercase tracking-wide text-muted">
      <span className="flex justify-between"><span>{label}</span><span className="tabular text-ink">{fmt ? fmt(value) : value}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[#e10600]" />
    </label>
  );
}
