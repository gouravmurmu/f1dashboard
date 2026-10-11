import { ms, openf1 } from "./openf1";
import type { SessionInfo } from "./types";

interface RawSession {
  session_key: number;
  meeting_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  circuit_short_name: string;
  location: string;
  country_name: string;
  country_code: string;
  year: number;
  is_cancelled?: boolean;
}

interface RawMeeting {
  meeting_key: number;
  meeting_name: string;
}

export function toSessionInfo(s: RawSession, meetingName?: string): SessionInfo {
  return {
    key: s.session_key,
    meetingKey: s.meeting_key,
    name: s.session_name,
    meetingName: meetingName ?? `${s.country_name} Grand Prix`,
    circuit: s.circuit_short_name,
    location: s.location,
    country: s.country_name,
    countryCode: s.country_code,
    start: ms(s.date_start),
    end: ms(s.date_end),
    year: s.year,
    cancelled: Boolean(s.is_cancelled),
  };
}

/** Races and sprints of a season, oldest first. */
export async function seasonSessions(year: number): Promise<SessionInfo[]> {
  const [sessions, meetings] = await Promise.all([
    openf1<RawSession>("sessions", { year, session_type: "Race" }, 1800),
    openf1<RawMeeting>("meetings", { year }, 1800),
  ]);
  const names = new Map(meetings.map((m) => [m.meeting_key, m.meeting_name]));
  return sessions
    .map((s) => toSessionInfo(s, names.get(s.meeting_key)))
    .sort((a, b) => a.start - b.start);
}

export async function sessionByKey(key: number): Promise<SessionInfo> {
  const [s] = await openf1<RawSession>("sessions", { session_key: key }, 3600);
  if (!s) throw new Error(`No session ${key}`);
  const [m] = await openf1<RawMeeting>("meetings", { meeting_key: s.meeting_key }, 86400);
  return toSessionInfo(s, m?.meeting_name);
}

export type SessionStatus = "done" | "live" | "upcoming" | "cancelled";

export function sessionStatus(s: SessionInfo, now = Date.now()): SessionStatus {
  if (s.cancelled) return "cancelled";
  if (now < s.start - 15 * 60_000) return "upcoming";
  if (now <= s.end + 30 * 60_000) return "live";
  return "done";
}
