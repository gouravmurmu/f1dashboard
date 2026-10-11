"use client";
// Keeps car positions for the moment being shown: 2-minute windows when replaying, a rolling buffer when live.
import { useEffect, useRef, useState } from "react";
import type { LocationWindow, RaceBundle } from "@/lib/types";

const WIN = 120_000;
const LIVE_KEEP = 90_000;

export function useLocations(bundle: RaceBundle | null, t: number, live: boolean) {
  const windows = useRef(new Map<number, LocationWindow | "loading">());
  const liveBuf = useRef<Record<number, number[]>>({});
  const [version, setVersion] = useState(0);
  const [latest, setLatest] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = bundle?.session.key;
  const demo = bundle?.simulated ? "&demo=1" : "";

  useEffect(() => {
    windows.current = new Map();
    liveBuf.current = {};
    setLatest(null);
  }, [key, demo]);

  // Replay: load the window holding t and the next one.
  const slot = Math.floor(t / WIN) * WIN;
  useEffect(() => {
    if (key == null || live) return;
    for (const s of [slot, slot + WIN]) {
      if (windows.current.has(s)) continue;
      windows.current.set(s, "loading");
      fetch(`/api/race/${key}/locations?from=${s}&to=${s + WIN}${demo}`)
        .then((r) => r.json())
        .then((w: LocationWindow & { error?: string }) => {
          if (w.error) throw new Error(w.error);
          windows.current.set(s, w);
          setError(null);
          setVersion((v) => v + 1);
        })
        .catch((e: Error) => {
          setError(e.message);
          setTimeout(() => windows.current.delete(s), 8000);
        });
    }
  }, [key, slot, live, demo]);

  // Live: poll the last 30 seconds every 4 seconds and append to a rolling buffer.
  useEffect(() => {
    if (key == null || !live) return;
    let stop = false;
    const tick = async () => {
      const now = Date.now();
      try {
        const r = await fetch(`/api/race/${key}/locations?from=${now - 30_000}&to=${now}&live=1${demo}`);
        const w: LocationWindow & { error?: string } = await r.json();
        if (w.error) throw new Error(w.error);
        let newest = 0;
        for (const [d, arr] of Object.entries(w.cars)) {
          const prev = liveBuf.current[Number(d)] ?? [];
          const lastT = prev.length ? prev[prev.length - 3] : -Infinity;
          const merged = prev.slice();
          for (let i = 0; i < arr.length; i += 3) if (arr[i] > lastT) merged.push(arr[i], arr[i + 1], arr[i + 2]);
          let cut = 0;
          while (cut < merged.length && merged[cut] < now - LIVE_KEEP) cut += 3;
          liveBuf.current[Number(d)] = merged.slice(cut);
          if (merged.length) newest = Math.max(newest, merged[merged.length - 3]);
        }
        if (!stop) { setLatest(newest || null); setError(null); setVersion((v) => v + 1); }
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(id); };
  }, [key, live, demo]);

  /** Location samples for every car around time t. */
  function carsAt(at: number): Record<number, number[]> {
    if (live) return liveBuf.current;
    const w = windows.current.get(Math.floor(at / WIN) * WIN);
    return w && w !== "loading" ? w.cars : {};
  }

  return { carsAt, version, latest, error };
}
