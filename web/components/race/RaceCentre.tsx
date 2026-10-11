"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ReplayIndex, type RaceState } from "@/lib/replay";
import { simulate, type SimResult } from "@/lib/sim";
import type { RaceBundle } from "@/lib/types";
import { flagEmoji, fmtDate } from "@/lib/format";
import { DEMO_KEY } from "@/lib/demo";
import { useLocations } from "./useLocations";
import TrackMap from "./TrackMap";
import TimingTower from "./TimingTower";
import PlaybackBar from "./PlaybackBar";
import RaceCharts from "./RaceCharts";
import { RaceTabs } from "@/components/analysis/RaceAnalysis";

const LIVE_LAG = 8_000;

export default function RaceCentre({ sessionKey }: { sessionKey: number }) {
  const [bundle, setBundle] = useState<RaceBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [gapMode, setGapMode] = useState<"gap" | "int">("gap");

  const load = useCallback(async () => {
    const r = await fetch(`/api/race/${sessionKey}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as RaceBundle;
  }, [sessionKey]);

  useEffect(() => {
    let cancelled = false;
    load().then((b) => {
      if (cancelled) return;
      setBundle(b);
      setLive(b.live);
      setT(b.live ? Date.now() - LIVE_LAG : b.raceStart);
      setPlaying(!b.live);
    }).catch((e) => !cancelled && setLoadError((e as Error).message));
    return () => { cancelled = true; };
  }, [load]);

  // OpenF1 is closed to free users while a session runs: check again every minute and switch once it opens.
  useEffect(() => {
    if (!bundle?.locked) return;
    const id = setInterval(() => load().then((b) => {
      if (b.locked) return;
      setBundle(b);
      setLive(b.live);
      setT(b.live ? Date.now() - LIVE_LAG : b.raceStart);
      setPlaying(!b.live);
    }).catch(() => undefined), 60_000);
    return () => clearInterval(id);
  }, [bundle?.locked, load]);

  // While a session is live, refresh timing data every 15 seconds.
  useEffect(() => {
    if (!bundle?.live) return;
    const id = setInterval(() => load().then(setBundle).catch(() => undefined), 15_000);
    return () => clearInterval(id);
  }, [bundle?.live, load]);

  const idx = useMemo(() => (bundle ? new ReplayIndex(bundle) : null), [bundle]);
  const locs = useLocations(bundle, t, live);

  // Animation clock.
  const lagRef = useRef(LIVE_LAG);
  useEffect(() => {
    if (locs.latest) lagRef.current = Math.max(LIVE_LAG, Date.now() - locs.latest + 2500);
  }, [locs.latest]);
  useEffect(() => {
    if (!idx || (!playing && !live)) return;
    let raf = 0, prev = performance.now();
    const step = (now: number) => {
      const dt = now - prev;
      prev = now;
      if (live) setT(Date.now() - lagRef.current);
      else setT((x) => {
        const nx = x + dt * speed;
        if (nx >= idx.bundle.raceEnd + 60_000) { setPlaying(false); return idx.bundle.raceEnd + 60_000; }
        return nx;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [idx, playing, live, speed]);

  // Timing state four times a second, simulation once per lap.
  const tick = Math.floor(t / 250);
  const state: RaceState | null = useMemo(() => (idx ? idx.stateAt(t) : null), [idx, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  // Re-run when the leader starts a lap, a car retires, or a pitting car has finished its in- and out-laps.
  const settledStops = state ? state.cars.reduce((n, c) =>
    n + idx!.bundle.pits.filter((p) => p.d === c.driver.number && p.lap + 1 <= c.lapsDone).length, 0) : 0;
  const simKey = state ? `${state.lap}-${settledStops}-${state.cars.filter((c) => c.out).length}` : "";
  const sim: SimResult[] = useMemo(() => (idx && state && state.lap >= 2 ? simulate(idx, state) : []), [idx, simKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const simMap = useMemo(() => new Map(sim.map((s) => [s.d, s])), [sim]);

  if (loadError) return <div className="card p-6">Could not load this race ({loadError}). <Link className="font-bold text-f1" href={`/race/${DEMO_KEY}`}>Open the simulated race</Link></div>;
  if (!bundle || !idx || !state) return <Skeleton />;

  const s = bundle.session;
  const cars = locs.carsAt(t);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">{s.year} · {s.name} · {fmtDate(s.start, { day: "numeric", month: "long", year: "numeric" })}</div>
          <h1 className="text-3xl font-black uppercase leading-tight md:text-4xl">{flagEmoji(s.countryCode)} {s.meetingName}</h1>
          <div className="text-sm text-muted">{s.circuit}{bundle.weather && ` · Air ${bundle.weather.air.toFixed(0)}°C · Track ${bundle.weather.track.toFixed(0)}°C${bundle.weather.rain ? " · Rain" : ""}`}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RaceTabs sessionKey={sessionKey} active="live" />
          {bundle.simulated && <span className="chip bg-medium/30 text-carbon">Simulated race</span>}
          {live ? <span className="chip bg-f1 text-white"><span className="live-dot h-2 w-2 rounded-full bg-white" />Live</span>
            : <span className="chip bg-carbon text-white">Replay</span>}
        </div>
      </header>
      {bundle.note && <div className="rounded-xl border border-medium bg-medium/15 px-4 py-2 text-sm">{bundle.note}</div>}
      {live && locs.error && <div className="rounded-xl border border-line bg-white px-4 py-2 text-sm text-muted">Live car positions are not available yet ({locs.error}). Timing keeps updating.</div>}

      <PlaybackBar idx={idx} t={t} setT={(x) => { setT(x); }} playing={playing} setPlaying={setPlaying} speed={speed}
        setSpeed={setSpeed} live={live} canGoLive={bundle.live} lap={state.lap}
        goLive={() => { if (live) { setLive(false); setPlaying(false); } else { setLive(true); } }} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        <TrackMap track={bundle.track} state={state} t={t} cars={cars} selected={selected} onSelect={setSelected} totalLaps={bundle.totalLaps} />
        <TimingTower idx={idx} state={state} sim={simMap} selected={selected} onSelect={setSelected} mode={gapMode} setMode={setGapMode} />
      </div>
      <RaceCharts idx={idx} state={state} sim={sim} selected={selected} />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-16 w-2/3 animate-pulse rounded-xl bg-line" />
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="grid h-[420px] place-items-center rounded-2xl bg-carbon text-sm text-white/60">Loading race data…</div>
        <div className="h-[420px] animate-pulse rounded-2xl bg-line" />
      </div>
    </div>
  );
}
