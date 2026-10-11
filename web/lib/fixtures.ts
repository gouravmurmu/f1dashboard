// Offline stand-ins shaped like the live APIs, so pages can be developed and tested without network.
// The 2026 calendar mirrors OpenF1's session list; standings are synthetic.
import type { DriverStanding, RaceResult, TeamStanding } from "./jolpica";
import type { SessionInfo } from "./types";

const CAL: [number, string, string, string, string, string, boolean?][] = [
  [11234, "2026-03-08T04:00:00Z", "Australian Grand Prix", "Melbourne", "Australia", "AUS"],
  [11245, "2026-03-15T07:00:00Z", "Chinese Grand Prix", "Shanghai", "China", "CHN"],
  [11253, "2026-03-29T05:00:00Z", "Japanese Grand Prix", "Suzuka", "Japan", "JPN"],
  [11261, "2026-04-12T15:00:00Z", "Bahrain Grand Prix", "Sakhir", "Bahrain", "BRN", true],
  [11269, "2026-04-19T17:00:00Z", "Saudi Arabian Grand Prix", "Jeddah", "Saudi Arabia", "KSA", true],
  [11280, "2026-05-03T17:00:00Z", "Miami Grand Prix", "Miami", "United States", "USA"],
  [11291, "2026-05-24T20:00:00Z", "Canadian Grand Prix", "Montreal", "Canada", "CAN"],
  [11299, "2026-06-07T13:00:00Z", "Monaco Grand Prix", "Monte Carlo", "Monaco", "MON"],
  [11307, "2026-06-14T13:00:00Z", "Barcelona Grand Prix", "Catalunya", "Spain", "ESP"],
  [11315, "2026-06-28T13:00:00Z", "Austrian Grand Prix", "Spielberg", "Austria", "AUT"],
  [11326, "2026-07-05T14:00:00Z", "British Grand Prix", "Silverstone", "United Kingdom", "GBR"],
  [11334, "2026-07-19T13:00:00Z", "Belgian Grand Prix", "Spa-Francorchamps", "Belgium", "BEL"],
  [11342, "2026-07-26T13:00:00Z", "Hungarian Grand Prix", "Hungaroring", "Hungary", "HUN"],
  [11353, "2026-08-23T13:00:00Z", "Dutch Grand Prix", "Zandvoort", "Netherlands", "NED"],
  [11361, "2026-09-06T13:00:00Z", "Italian Grand Prix", "Monza", "Italy", "ITA"],
  [11369, "2026-09-13T13:00:00Z", "Spanish Grand Prix", "Madring", "Spain", "ESP"],
  [11377, "2026-09-26T11:00:00Z", "Azerbaijan Grand Prix", "Baku", "Azerbaijan", "AZE"],
  [11731, "2026-10-04T07:00:00Z", "Bahrain Grand Prix", "Kuala Lumpur", "Bahrain", "BRN"],
  [11388, "2026-10-11T12:00:00Z", "Singapore Grand Prix", "Singapore", "Singapore", "SGP"],
  [11396, "2026-10-25T20:00:00Z", "United States Grand Prix", "Austin", "United States", "USA"],
  [11404, "2026-11-01T20:00:00Z", "Mexico City Grand Prix", "Mexico City", "Mexico", "MEX"],
  [11412, "2026-11-08T17:00:00Z", "São Paulo Grand Prix", "Interlagos", "Brazil", "BRA"],
  [11420, "2026-11-22T04:00:00Z", "Las Vegas Grand Prix", "Las Vegas", "United States", "USA"],
  [11428, "2026-11-29T16:00:00Z", "Qatar Grand Prix", "Lusail", "Qatar", "QAT"],
  [11436, "2026-12-06T13:00:00Z", "Abu Dhabi Grand Prix", "Yas Marina Circuit", "United Arab Emirates", "UAE"],
];

export function sessions(year: number): SessionInfo[] {
  return CAL.map(([key, start, meetingName, circuit, country, cc, cancelled]) => ({
    key, meetingKey: key, name: "Race", meetingName, circuit, location: circuit, country, countryCode: cc,
    start: Date.parse(start), end: Date.parse(start) + 2 * 3600_000, year, cancelled: Boolean(cancelled),
  }));
}

const DRIVERS: [string, string, string, number, number][] = [
  ["ANT", "Kimi Antonelli", "Mercedes", 320, 8], ["RUS", "George Russell", "Mercedes", 236, 3],
  ["HAM", "Lewis Hamilton", "Ferrari", 214, 1], ["LEC", "Charles Leclerc", "Ferrari", 191, 1],
  ["NOR", "Lando Norris", "McLaren", 188, 2], ["VER", "Max Verstappen", "Red Bull Racing", 170, 1],
  ["PIA", "Oscar Piastri", "McLaren", 152, 0], ["HAD", "Isack Hadjar", "Red Bull Racing", 61, 0],
  ["SAI", "Carlos Sainz", "Williams", 48, 0], ["ALB", "Alexander Albon", "Williams", 40, 0],
  ["BEA", "Oliver Bearman", "Haas F1 Team", 33, 0], ["LAW", "Liam Lawson", "Racing Bulls", 30, 0],
  ["GAS", "Pierre Gasly", "Alpine", 26, 0], ["ALO", "Fernando Alonso", "Aston Martin", 22, 0],
  ["BOR", "Gabriel Bortoleto", "Audi", 17, 0], ["HUL", "Nico Hulkenberg", "Audi", 15, 0],
  ["OCO", "Esteban Ocon", "Haas F1 Team", 12, 0], ["LIN", "Arvid Lindblad", "Racing Bulls", 9, 0],
  ["STR", "Lance Stroll", "Aston Martin", 6, 0], ["COL", "Franco Colapinto", "Alpine", 3, 0],
  ["PER", "Sergio Perez", "Cadillac", 1, 0], ["BOT", "Valtteri Bottas", "Cadillac", 0, 0],
];

export function driverStandings(): { round: number; rows: DriverStanding[] } {
  return { round: 16, rows: DRIVERS.map(([code, name, team, points, wins], i) => ({
    position: i + 1, points, wins, code, name, team, nationality: "" })) };
}

export function constructorStandings(): TeamStanding[] {
  const teams = new Map<string, [number, number]>();
  for (const [, , team, pts, wins] of DRIVERS) {
    const t = teams.get(team) ?? [0, 0];
    teams.set(team, [t[0] + pts, t[1] + wins]);
  }
  return [...teams.entries()].sort((a, b) => b[1][0] - a[1][0])
    .map(([team, [points, wins]], i) => ({ position: i + 1, points, wins, team, nationality: "" }));
}

export function seasonResults(): RaceResult[] {
  const done = sessions(2026).filter((s) => !s.cancelled && s.end < Date.parse("2026-10-05"));
  const out: RaceResult[] = [];
  done.forEach((s, ri) => {
    const order = [...DRIVERS].sort((a, b) => b[3] * (1 + Math.sin(ri * 7 + a[3])) * 0.4 + b[3] -
      (a[3] * (1 + Math.sin(ri * 7 + b[3])) * 0.4 + a[3]));
    order.forEach(([code, name, team], i) => out.push({ round: ri + 1, race: s.meetingName,
      date: new Date(s.start).toISOString().slice(0, 10), circuit: s.circuit, country: s.country, position: i + 1,
      code, name, team, grid: Math.min(22, Math.max(1, i + 1 + ((ri * 7 + i * 3) % 5) - 2)), points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1][i] ?? 0,
      status: "Finished" }));
  });
  return out;
}
