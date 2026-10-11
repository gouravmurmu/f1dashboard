// Server-side data access with an offline fixture mode (F1_FIXTURES=1) for local development without network.
import * as jolpica from "./jolpica";
import { seasonSessions } from "./sessions";
import type { SessionInfo } from "./types";
import * as fx from "./fixtures";

const offline = () => process.env.F1_FIXTURES === "1";

export async function getSessions(year: number): Promise<SessionInfo[]> {
  return offline() ? fx.sessions(year) : seasonSessions(year);
}
export async function getDriverStandings(year: number) {
  return offline() ? fx.driverStandings() : jolpica.driverStandings(year);
}
export async function getConstructorStandings(year: number) {
  return offline() ? fx.constructorStandings() : jolpica.constructorStandings(year);
}
export async function getSeasonResults(year: number) {
  return offline() ? fx.seasonResults() : jolpica.seasonResults(year);
}
export async function getRaceWinners(year: number) {
  return offline() ? fx.seasonResults().filter((r) => r.position === 1) : jolpica.raceWinners(year);
}

/** Runs a loader and returns [value, error message] so a page can render whatever loaded. */
export async function safe<T>(p: Promise<T>): Promise<[T | null, string | null]> {
  try {
    return [await p, null];
  } catch (e) {
    return [null, (e as Error).message];
  }
}
