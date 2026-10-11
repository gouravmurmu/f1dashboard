import type { Metadata } from "next";
import YearPicker from "@/components/YearPicker";
import { getSeasonResults, safe } from "@/lib/data";
import { yearParam } from "@/lib/params";
import { teamColor } from "@/lib/teams";
import type { RaceResult } from "@/lib/jolpica";

export const metadata: Metadata = { title: "History" };
export const revalidate = 86400;

function tally(rows: RaceResult[], key: (r: RaceResult) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function History({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const now = new Date().getUTCFullYear();
  const year = yearParam((await searchParams).year, 1950);
  const [results, err] = await safe(getSeasonResults(year));
  const all = results ?? [];
  const winners = all.filter((r) => r.position === 1);
  const podiums = all.filter((r) => r.position <= 3);
  const teamOf = new Map(all.map((r) => [r.name, r.team]));
  const winsBy = tally(winners, (r) => r.name);
  const teamWins = tally(winners, (r) => r.team);
  const podBy = tally(podiums, (r) => r.name).slice(0, 10);
  const poleToWin = winners.filter((r) => r.grid === 1).length;
  const fromBack = [...winners].sort((a, b) => b.grid - a.grid)[0];
  const gains = all.filter((r) => r.grid > 0 && r.position).map((r) => ({ ...r, gain: r.grid - r.position }))
    .sort((a, b) => b.gain - a.gain).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Every season since 1950</div>
          <h1 className="text-4xl font-black uppercase">{year} season</h1>
        </div>
        <YearPicker year={year} from={1950} to={now} />
      </div>
      {err && <div className="card p-4 text-sm">Results could not be loaded right now ({err}).</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Races" value={String(new Set(all.map((r) => r.round)).size)} />
        <Stat label="Different winners" value={String(winsBy.length)} />
        <Stat label="Won from pole" value={winners.length ? `${Math.round((poleToWin / winners.length) * 100)}%` : "–"} />
        <Stat label="Win from furthest back" value={fromBack ? `P${fromBack.grid}` : "–"} sub={fromBack ? `${fromBack.name}, ${fromBack.race.replace(" Grand Prix", "")}` : ""} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="section-title mb-3">Wins by driver</h2>
          <Bars rows={winsBy} color={(k) => teamColor(teamOf.get(k) ?? "")} />
        </section>
        <section className="card p-5">
          <h2 className="section-title mb-3">Wins by team</h2>
          <Bars rows={teamWins} color={teamColor} />
        </section>
        <section className="card p-5">
          <h2 className="section-title mb-3">Most podiums</h2>
          <Bars rows={podBy} color={(k) => teamColor(teamOf.get(k) ?? "")} />
        </section>
      </div>
      <section className="card overflow-x-auto p-5">
        <h2 className="section-title mb-3">Race by race</h2>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-[10px] font-bold uppercase tracking-wider text-muted">
            <tr className="border-b border-line text-left"><th className="py-1.5">Rd</th><th>Grand Prix</th><th>Date</th><th>Winner</th><th>Team</th><th className="text-right">Grid</th><th className="pl-6">Podium</th></tr>
          </thead>
          <tbody>
            {winners.map((w) => {
              const pod = all.filter((r) => r.round === w.round && r.position <= 3).sort((a, b) => a.position - b.position);
              return (
                <tr key={w.round} className="border-b border-line/70 last:border-0">
                  <td className="tabular py-1.5 font-black text-muted">{w.round}</td>
                  <td className="font-bold">{w.race}</td>
                  <td className="tabular text-muted">{w.date}</td>
                  <td><span className="mr-2 inline-block h-3 w-1 rounded-full align-middle" style={{ background: teamColor(w.team) }} />{w.name}</td>
                  <td className="text-muted">{w.team}</td>
                  <td className="tabular text-right">{w.grid || "pit"}</td>
                  <td className="pl-6 text-xs text-muted">{pod.slice(1).map((p) => p.code || p.name).join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {gains.length > 0 && (
        <section className="card p-5">
          <h2 className="section-title mb-3">Biggest climbs</h2>
          <div className="grid gap-3 sm:grid-cols-5">
            {gains.map((g) => (
              <div key={`${g.round}-${g.name}`} className="rounded-xl bg-paper p-3">
                <div className="tabular text-2xl font-black text-inter">+{g.gain}</div>
                <div className="font-bold leading-tight">{g.name}</div>
                <div className="text-xs text-muted">P{g.grid} → P{g.position}, {g.race.replace(" Grand Prix", "")}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="kicker">{label}</div>
      <div className="tabular text-3xl font-black">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Bars({ rows, color }: { rows: [string, number][]; color: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <p className="text-sm text-muted">No results yet.</p>;
  return (
    <div className="space-y-1.5">
      {rows.slice(0, 10).map(([k, v]) => (
        <div key={k} className="text-sm">
          <div className="flex justify-between"><span className="font-bold">{k}</span><span className="tabular font-black">{v}</span></div>
          <div className="h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full" style={{ width: `${(v / max) * 100}%`, background: color(k) }} /></div>
        </div>
      ))}
    </div>
  );
}
