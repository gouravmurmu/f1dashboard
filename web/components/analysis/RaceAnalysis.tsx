"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { RaceBundle } from "@/lib/types";
import { flagEmoji, fmtDate } from "@/lib/format";
import { fitTyreModel, pitLoss } from "@/lib/models/tyre";
import Telemetry from "./Telemetry";
import { PaceForecast, PitStops, Strategy, Tyres } from "./Models";

const TABS = ["Telemetry", "Tyre wear", "Pit stops", "Pace forecast", "Strategy"] as const;
type Tab = (typeof TABS)[number];

export default function RaceAnalysis({ sessionKey }: { sessionKey: number }) {
  const [bundle, setBundle] = useState<RaceBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Telemetry");
  useEffect(() => {
    fetch(`/api/race/${sessionKey}`).then((r) => r.json()).then(setBundle).catch((e) => setError((e as Error).message));
  }, [sessionKey]);
  const tyre = useMemo(() => (bundle ? fitTyreModel(bundle) : null), [bundle]);
  const loss = useMemo(() => (bundle ? pitLoss(bundle) : 21.5), [bundle]);

  if (error) return <div className="card p-6">Could not load this race ({error}).</div>;
  if (!bundle || !tyre) return <div className="card grid h-72 place-items-center text-sm text-muted">Loading race data…</div>;
  const s = bundle.session;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">{s.year} · {s.name} · {fmtDate(s.start, { day: "numeric", month: "long", year: "numeric" })}</div>
          <h1 className="text-3xl font-black uppercase leading-tight md:text-4xl">{flagEmoji(s.countryCode)} {s.meetingName}</h1>
          <div className="text-sm text-muted">Telemetry and prediction models</div>
        </div>
        <RaceTabs sessionKey={sessionKey} active="analysis" />
      </header>
      {bundle.note && <div className="rounded-xl border border-medium bg-medium/15 px-4 py-2 text-sm">{bundle.note}</div>}
      {bundle.live && <div className="rounded-xl border border-line bg-white px-4 py-2 text-sm text-muted">This race is still running, so the models use the laps completed so far.</div>}
      <div className="flex flex-wrap gap-1">
        {TABS.map((x) => (
          <button key={x} onClick={() => setTab(x)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide ${tab === x ? "bg-f1 text-white" : "bg-white text-muted ring-1 ring-line hover:text-ink"}`}>{x}</button>
        ))}
      </div>
      {tab === "Telemetry" && <Telemetry bundle={bundle} />}
      {tab === "Tyre wear" && <Tyres bundle={bundle} tyre={tyre} loss={loss} />}
      {tab === "Pit stops" && <PitStops bundle={bundle} />}
      {tab === "Pace forecast" && <PaceForecast bundle={bundle} tyre={tyre} />}
      {tab === "Strategy" && <Strategy bundle={bundle} tyre={tyre} loss={loss} />}
    </div>
  );
}

export function RaceTabs({ sessionKey, active }: { sessionKey: number; active: "live" | "analysis" }) {
  const cls = (on: boolean) => `rounded-md px-3 py-1.5 ${on ? "bg-carbon text-white" : "text-muted hover:text-ink"}`;
  return (
    <nav className="flex rounded-lg bg-white p-1 text-xs font-bold uppercase tracking-wide ring-1 ring-line">
      <Link href={`/race/${sessionKey}`} className={cls(active === "live")}>Race centre</Link>
      <Link href={`/race/${sessionKey}/analysis`} className={cls(active === "analysis")}>Telemetry &amp; models</Link>
    </nav>
  );
}
