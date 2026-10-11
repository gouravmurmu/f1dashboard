// Server-side data access with an offline fixture mode (F1_FIXTURES=1) for local development without network.
import { unstable_cache } from "next/cache";
import * as jolpica from "./jolpica";
import { OpenF1LockedError } from "./openf1";
import { seasonSessions } from "./sessions";
import type { SessionInfo } from "./types";
import * as fx from "./fixtures";

const offline = () => process.env.F1_FIXTURES === "1";

// If a refresh fails (OpenF1 is closed to free users during a live session), Next keeps serving the last good list.
const cachedSessions = unstable_cache(seasonSessions, ["season-sessions"], { revalidate: 1800 });

export async function getSessions(year: number): Promise<SessionInfo[]> {
  return offline() ? fx.sessions(year) : cachedSessions(year);
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
    if (e instanceof OpenF1LockedError || /HTTP 401/.test((e as Error).message))
      return [null, "OpenF1 only serves paid sponsor accounts while a session is running; it reopens 30 minutes after the session ends"];
    return [null, (e as Error).message];
  }
}
