import type { Metadata } from "next";
import Link from "next/link";
import YearPicker from "@/components/YearPicker";
import { getSessions, safe } from "@/lib/data";
import { DEMO_KEY } from "@/lib/demo";
import { flagEmoji, fmtDate } from "@/lib/format";
import { yearParam } from "@/lib/params";
import { sessionStatus } from "@/lib/sessions";

export const metadata: Metadata = { title: "Races" };
export const revalidate = 300;

const BADGE = {
  done: "bg-carbon text-white", live: "bg-f1 text-white", upcoming: "bg-paper text-muted ring-1 ring-line",
  cancelled: "bg-paper text-muted line-through",
} as const;

export default async function Races({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const year = yearParam((await searchParams).year, 2023);
  const [sessions, err] = await safe(getSessions(year));
  const now = Date.now();
  const list = sessions ?? [];
  const meetings = [...new Set(list.map((s) => s.meetingKey))].map((m) => list.filter((s) => s.meetingKey === m));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Live tracker and replays</div>
          <h1 className="text-4xl font-black uppercase">{year} races</h1>
          <p className="text-sm text-muted">Pick a race to watch it on the track map with live positions, timing and win predictions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/race/${DEMO_KEY}`} className="chip bg-medium/30 py-1.5 text-carbon">Simulated race</Link>
          <YearPicker year={year} from={2023} to={new Date().getUTCFullYear()} />
        </div>
      </div>
      {err && <div className="card p-4 text-sm">The race calendar could not be loaded ({err}). The <Link className="font-bold text-f1" href={`/race/${DEMO_KEY}`}>simulated race</Link> still works.</div>}
      <div className="card divide-y divide-line">
        {meetings.map((group, i) => {
          const first = group[0];
          return (
            <div key={first.meetingKey} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <span className="tabular w-8 text-sm font-black text-muted">R{i + 1}</span>
              <span className="text-2xl">{flagEmoji(first.countryCode)}</span>
              <div className="min-w-48 flex-1">
                <div className="font-black">{first.meetingName}</div>
                <div className="text-xs text-muted">{first.circuit} · {fmtDate(first.start, { day: "numeric", month: "long" })}</div>
              </div>
              <div className="flex gap-2">
                {group.map((s) => {
                  const st = sessionStatus(s, now);
                  const label = `${s.name}${st === "live" ? " · live" : st === "done" ? " ▶" : st === "cancelled" ? " · cancelled" : ""}`;
                  return st === "done" || st === "live"
                    ? <Link key={s.key} href={`/race/${s.key}`} className={`chip py-1 ${BADGE[st]} hover:opacity-85`}>{label}</Link>
                    : <span key={s.key} className={`chip py-1 ${BADGE[st]}`}>{label}</span>;
                })}
              </div>
            </div>
          );
        })}
        {!list.length && !err && <p className="p-6 text-sm text-muted">No races found for {year}.</p>}
      </div>
      <p className="text-xs text-muted">Live timing data covers 2023 onwards. Older seasons are in <Link href="/history" className="font-bold text-f1">History</Link>.</p>
    </div>
  );
}
