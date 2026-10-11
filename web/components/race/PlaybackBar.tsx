"use client";
import type { ReplayIndex } from "@/lib/replay";

export const SPEEDS = [1, 4, 16, 64];

interface Props {
  idx: ReplayIndex;
  t: number;
  setT: (t: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  speed: number;
  setSpeed: (s: number) => void;
  live: boolean;
  canGoLive: boolean;
  goLive: () => void;
  lap: number;
}

export default function PlaybackBar({ idx, t, setT, playing, setPlaying, speed, setSpeed, live, canGoLive, goLive, lap }: Props) {
  const b = idx.bundle;
  const start = b.raceStart, end = Math.max(b.raceEnd, start + 1);
  const leader = idx.lapsBy.get(b.results[0]?.d ?? b.drivers[0]?.number) ?? [];
  const jump = (l: number) => {
    const rec = leader.find((x) => x.lap === l);
    if (rec) setT(rec.start + 500);
  };
  const elapsed = Math.max(0, (t - start) / 1000);
  const clock = `${Math.floor(elapsed / 3600)}:${String(Math.floor(elapsed / 60) % 60).padStart(2, "0")}:${String(Math.floor(elapsed) % 60).padStart(2, "0")}`;

  return (
    <div className="card flex flex-wrap items-center gap-3 px-3 py-2.5">
      <button onClick={() => setPlaying(!playing)} disabled={live}
        className="grid h-9 w-9 place-items-center rounded-full bg-f1 text-white shadow hover:bg-f1-dark disabled:opacity-40"
        aria-label={playing ? "Pause" : "Play"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="flex rounded-md bg-paper p-0.5 text-xs font-bold">
        {SPEEDS.map((s) => (
          <button key={s} onClick={() => setSpeed(s)} disabled={live}
            className={`rounded px-2 py-1 ${speed === s && !live ? "bg-carbon text-white" : "text-muted"}`}>{s}×</button>
        ))}
      </div>
      <div className="flex min-w-48 flex-1 items-center gap-2">
        <span className="tabular w-16 text-xs font-bold text-muted">{clock}</span>
        <input type="range" min={start} max={end} step={1000} value={Math.min(Math.max(t, start), end)}
          onChange={(e) => setT(Number(e.target.value))} disabled={live} className="h-1.5 flex-1 accent-[#e10600]"
          aria-label="Race time" />
      </div>
      <label className="flex items-center gap-1 text-xs font-bold uppercase text-muted">
        Lap
        <select value={Math.max(1, lap)} onChange={(e) => jump(Number(e.target.value))} disabled={live}
          className="rounded-md border border-line bg-white px-1.5 py-1 text-ink">
          {leader.map((l) => <option key={l.lap} value={l.lap}>{l.lap}</option>)}
        </select>
      </label>
      {canGoLive && (
        <button onClick={goLive}
          className={`chip ${live ? "bg-f1 text-white" : "bg-paper text-f1 ring-1 ring-f1"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "live-dot bg-white" : "bg-f1"}`} /> Live
        </button>
      )}
    </div>
  );
}
