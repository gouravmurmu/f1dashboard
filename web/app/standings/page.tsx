import type { Metadata } from "next";
import PointsChart from "@/components/PointsChart";
import { DriverTable, TeamTable } from "@/components/Standings";
import YearPicker from "@/components/YearPicker";
import { progression } from "@/lib/jolpica";
import { getConstructorStandings, getDriverStandings, getSeasonResults, safe } from "@/lib/data";
import { yearParam } from "@/lib/params";
import { teamColor } from "@/lib/teams";

export const metadata: Metadata = { title: "Standings" };
export const revalidate = 1800;

export default async function Standings({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const year = yearParam((await searchParams).year, 1950);
  const [[drivers, dErr], [teams], [results]] = await Promise.all([
    safe(getDriverStandings(year)), safe(getConstructorStandings(year)), safe(getSeasonResults(year)),
  ]);
  const byDriver = results ? progression(results, "name") : null;
  const byTeam = results ? progression(results, "team") : null;
  const driverColor = Object.fromEntries((results ?? []).map((r) => [r.name, teamColor(r.team)]));
  const teamColors = Object.fromEntries((results ?? []).map((r) => [r.team, teamColor(r.team)]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">World Championship</div>
          <h1 className="text-4xl font-black uppercase">{year} standings</h1>
          {drivers && <p className="text-sm text-muted">After round {drivers.round}</p>}
        </div>
        <YearPicker year={year} from={1950} to={new Date().getUTCFullYear()} />
      </div>
      {dErr && <div className="card p-4 text-sm">Standings could not be loaded right now ({dErr}).</div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="section-title mb-3">Drivers</h2>
          {drivers?.rows.length ? <DriverTable rows={drivers.rows} /> : <p className="text-sm text-muted">No standings.</p>}
        </section>
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="section-title mb-1">Title fight</h2>
            <p className="mb-3 text-xs text-muted">Cumulative points after each Grand Prix for the top eight drivers.</p>
            {byDriver && <PointsChart series={byDriver.series} leaders={byDriver.leaders} colors={driverColor} />}
          </section>
          <section className="card p-5">
            <h2 className="section-title mb-3">Constructors</h2>
            {teams?.length ? <TeamTable rows={teams} /> : <p className="text-sm text-muted">No constructors&apos; championship this season.</p>}
          </section>
          {byTeam && teams?.length ? (
            <section className="card p-5">
              <h2 className="section-title mb-3">Constructors&apos; points</h2>
              <PointsChart series={byTeam.series} leaders={byTeam.leaders} colors={teamColors} />
            </section>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted">Points charts count Grand Prix results only; sprint points appear in the tables.</p>
    </div>
  );
}
