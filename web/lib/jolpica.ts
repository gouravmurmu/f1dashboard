// Results and standings since 1950 from Jolpica, the maintained successor of the Ergast API.
const BASE = "https://api.jolpi.ca/ergast/f1";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function get(path: string, revalidate = 3600): Promise<Row> {
  const res = await fetch(`${BASE}/${path}`, { next: { revalidate }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Jolpica ${path}: HTTP ${res.status}`);
  return (await res.json()).MRData;
}

export interface DriverStanding {
  position: number; points: number; wins: number; code: string; name: string; team: string; nationality: string;
}
export interface TeamStanding { position: number; points: number; wins: number; team: string; nationality: string }
export interface RaceResult {
  round: number; race: string; date: string; circuit: string; country: string;
  position: number; code: string; name: string; team: string; grid: number; points: number; status: string;
}

const fullName = (d: Row) => `${d.givenName} ${d.familyName}`;

export async function driverStandings(year: number): Promise<{ round: number; rows: DriverStanding[] }> {
  const data = await get(`${year}/driverstandings.json?limit=100`);
  const list = data.StandingsTable.StandingsLists[0];
  if (!list) return { round: 0, rows: [] };
  return {
    round: Number(list.round),
    rows: list.DriverStandings.map((s: Row) => ({
      position: Number(s.position ?? s.positionText), points: Number(s.points), wins: Number(s.wins),
      code: s.Driver.code ?? s.Driver.familyName.slice(0, 3).toUpperCase(), name: fullName(s.Driver),
      team: s.Constructors?.at(-1)?.name ?? "", nationality: s.Driver.nationality,
    })),
  };
}

export async function constructorStandings(year: number): Promise<TeamStanding[]> {
  if (year < 1958) return [];
  const data = await get(`${year}/constructorstandings.json?limit=100`);
  const list = data.StandingsTable.StandingsLists[0];
  return (list?.ConstructorStandings ?? []).map((s: Row) => ({
    position: Number(s.position ?? s.positionText), points: Number(s.points), wins: Number(s.wins),
    team: s.Constructor.name, nationality: s.Constructor.nationality,
  }));
}

/** Every classified result of a season (paginated: Jolpica returns at most 100 rows per call). */
export async function seasonResults(year: number): Promise<RaceResult[]> {
  const out: RaceResult[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const data = await get(`${year}/results.json?limit=100&offset=${offset}`, 3600);
    for (const race of data.RaceTable.Races as Row[]) {
      for (const r of race.Results as Row[]) {
        out.push({
          round: Number(race.round), race: race.raceName, date: race.date, circuit: race.Circuit.circuitName,
          country: race.Circuit.Location.country, position: Number(r.position), code: r.Driver.code ??
            r.Driver.familyName.slice(0, 3).toUpperCase(), name: fullName(r.Driver), team: r.Constructor.name,
          grid: Number(r.grid), points: Number(r.points), status: r.status,
        });
      }
    }
    if (offset + 100 >= Number(data.total)) break;
  }
  return out;
}

export async function raceWinners(year: number): Promise<RaceResult[]> {
  const data = await get(`${year}/results/1.json?limit=100`, 3600);
  return (data.RaceTable.Races as Row[]).map((race) => {
    const r = race.Results[0];
    return { round: Number(race.round), race: race.raceName, date: race.date, circuit: race.Circuit.circuitName,
      country: race.Circuit.Location.country, position: 1, code: r.Driver.code ?? "", name: fullName(r.Driver),
      team: r.Constructor.name, grid: Number(r.grid), points: Number(r.points), status: r.status };
  });
}

/** Cumulative points after each round for the top drivers or teams. */
export function progression(results: RaceResult[], by: "name" | "team", top = 8) {
  const rounds = [...new Set(results.map((r) => r.round))].sort((a, b) => a - b);
  const totals = new Map<string, number>();
  const series: Record<string, number | string>[] = [];
  for (const round of rounds) {
    for (const r of results.filter((x) => x.round === round)) totals.set(r[by], (totals.get(r[by]) ?? 0) + r.points);
    const raceName = results.find((x) => x.round === round)?.race ?? `R${round}`;
    series.push({ round, label: raceName.replace(" Grand Prix", ""), ...Object.fromEntries(totals) });
  }
  const leaders = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k]) => k);
  return { series, leaders };
}
