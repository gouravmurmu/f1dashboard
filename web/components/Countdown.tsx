"use client";
import { useEffect, useState } from "react";

export default function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now == null) return <div className="h-14" />;
  const diff = Math.max(0, to - now);
  const parts = [
    [Math.floor(diff / 86_400_000), "days"],
    [Math.floor(diff / 3_600_000) % 24, "hrs"],
    [Math.floor(diff / 60_000) % 60, "min"],
    [Math.floor(diff / 1000) % 60, "sec"],
  ] as const;
  return (
    <div className="flex gap-2">
      {parts.map(([v, l]) => (
        <div key={l} className="min-w-14 rounded-lg bg-white/10 px-2 py-1 text-center">
          <div className="tabular text-2xl font-black">{String(v).padStart(2, "0")}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">{l}</div>
        </div>
      ))}
    </div>
  );
}
