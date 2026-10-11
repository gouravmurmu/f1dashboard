import Link from "next/link";
import Countdown from "@/components/Countdown";
import { DriverTable, TeamTable } from "@/components/Standings";
import { getConstructorStandings, getDriverStandings, getSessions, safe } from "@/lib/data";
import { flagEmoji, fmtDate } from "@/lib/format";
import { sessionStatus } from "@/lib/sessions";
import { DEMO_KEY } from "@/lib/demo";

export const revalidate = 300;

export default async function Home() {
  const year = new Date().getUTCFullYear();
  const [[sessions, sErr], [drivers], [teams]] = await Promise.all([
    safe(getSessions(year)), safe(getDriverStandings(year)), safe(getConstructorStandings(year)),
  ]);
  const races = (sessions ?? []).filter((s) => s.name === "Race");
  const now = Date.now();
  const live = (sessions ?? []).find((s) => sessionStatus(s, now) === "live");
  const next = races.find((s) => !s.cancelled && s.start > now);
  const last = [...races].reverse().find((s) => sessionStatus(s, now) === "done");
  const leader = drivers?.rows[0];

  return (
    <div className="space-y-6">
      <section className="speed-stripes relative overflow-hidden rounded-3xl bg-carbon p-6 text-white md:p-8">
        <div className="absolute inset-y-0 right-0 w-2 bg-f1" />
        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
          <div>
            <div className="kicker !text-white/60">{year} FIA Formula One World Championship</div>
            {live ? (
              <>
                <h1 className="mt-2 text-4xl font-black uppercase leading-none md:text-5xl">
                  <span className="live-dot mr-2 inline-block h-3 w-3 rounded-full bg-f1 align-middle" />
                  {live.meetingName} is live
                </h1>
                <Link href={`/race/${live.key}`} className="mt-5 inline-block rounded-lg bg-f1 px-5 py-2.5 font-black uppercase tracking-wide hover:bg-f1-dark">
                  Open live tracker →
                </Link>
              </>
            ) : next ? (
              <>
                <h1 className="mt-2 text-4xl font-black uppercase leading-none md:text-5xl">
                  {flagEmoji(next.countryCode)} {next.meetingName}
                </h1>
                <p className="mt-2 text-white/70">
                  {next.name} · {next.circuit} · {fmtDate(next.start, { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} UTC
                </p>
                <div className="mt-5"><Countdown to={next.start} /></div>
              </>
            ) : (
              <h1 className="mt-2 text-4xl font-black uppercase md:text-5xl">Season complete</h1>
            )}
          </div>
          <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="kicker !text-white/60">Championship leader</div>
            {leader ? (
              <div className="mt-1 flex items-end justify-between">
                <div>
                  <div className="text-2xl font-black">{leader.name}</div>
                  <div className="text-sm text-white/60">{leader.team} · {leader.wins} wins</div>
                </div>
                <div className="text-right">
                  <div className="tabular text-4xl font-black text-f1">{leader.points}</div>
                  <div className="text-xs text-white/60">
                    +{leader.points - (drivers?.rows[1]?.points ?? 0)} over {drivers?.rows[1]?.name.split(" ").at(-1)}
                  </div>
                </div>
              </div>
            ) : <div className="mt-1 text-white/60">Standings unavailable</div>}
            {last && (
              <Link href={`/race/${last.key}`} className="mt-4 flex items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/15">
                <span>Replay last race: {last.meetingName}</span><span>▶</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {sErr && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-f1/30 p-4 text-sm">
          <span>Live timing data could not be reached ({sErr}).</span>
          <Link href={`/race/${DEMO_KEY}`} className="font-bold text-f1">Try the simulated race →</Link>
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="section-title">Drivers</h2>
            <Link href="/standings" className="text-sm font-bold text-f1">Full standings →</Link>
          </div>
          {drivers ? <DriverTable rows={drivers.rows} limit={10} /> : <p className="text-sm text-muted">Unavailable right now.</p>}
        </div>
        <div className="card p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="section-title">Constructors</h2>
            <span className="kicker">After round {drivers?.round ?? "–"}</span>
          </div>
          {teams ? <TeamTable rows={teams} /> : <p className="text-sm text-muted">Unavailable right now.</p>}
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="section-title">{year} calendar</h2>
          <Link href="/races" className="text-sm font-bold text-f1">All races →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {races.map((s, i) => {
            const st = sessionStatus(s, now);
            const body = (
              <div className={`h-full rounded-xl border p-3 transition ${st === "done" ? "border-line bg-white hover:border-f1" :
                st === "live" ? "border-f1 bg-f1 text-white" : st === "cancelled" ? "border-dashed border-line bg-paper opacity-60" : "border-line bg-paper"}`}>
                <div className="flex items-center justify-between text-[11px] font-bold uppercase text-current/60">
                  <span className={st === "live" ? "" : "text-muted"}>R{i + 1}</span>
                  <span className={st === "live" ? "" : "text-muted"}>{fmtDate(s.start)}</span>
                </div>
                <div className="mt-1 text-lg">{flagEmoji(s.countryCode)}</div>
                <div className="font-bold leading-tight">{s.meetingName.replace(" Grand Prix", "")}</div>
                <div className={`text-xs ${st === "live" ? "" : "text-muted"}`}>
                  {st === "done" ? "Replay ▶" : st === "live" ? "LIVE NOW" : st === "cancelled" ? "Cancelled" : s.circuit}
                </div>
              </div>
            );
            return st === "done" || st === "live" ? <Link key={s.key} href={`/race/${s.key}`}>{body}</Link> : <div key={s.key}>{body}</div>;
          })}
        </div>
      </section>
    </div>
  );
}
