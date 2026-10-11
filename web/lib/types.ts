// Compact, client-friendly race data. All times are epoch milliseconds.

export interface SessionInfo {
  key: number;
  meetingKey: number;
  name: string; // "Race" or "Sprint"
  meetingName: string;
  circuit: string;
  location: string;
  country: string;
  countryCode: string;
  start: number;
  end: number;
  year: number;
  cancelled: boolean;
}

export interface DriverInfo {
  number: number;
  code: string;
  name: string;
  team: string;
  color: string; // "#RRGGBB"
  headshot?: string;
}

export interface LapRec {
  d: number; // driver number
  lap: number;
  start: number;
  dur: number | null; // seconds
  pitOut: boolean;
}

export interface StintRec {
  d: number;
  stint: number;
  lapStart: number;
  lapEnd: number;
  compound: string;
  ageAtStart: number;
}

export interface PitRec {
  d: number;
  lap: number;
  t: number;
  lane: number | null; // seconds in the pit lane
}

export interface PosRec {
  d: number;
  t: number;
  pos: number;
}

export interface IntervalRec {
  d: number;
  t: number;
  gap: number | string | null; // to leader
  int: number | string | null; // to car ahead
}

export interface RaceControlRec {
  t: number;
  category: string;
  flag: string | null;
  message: string;
  lap: number | null;
}

export interface ResultRec {
  pos: number | null;
  d: number;
  laps: number;
  points: number;
  status: "Finished" | "DNF" | "DNS" | "DSQ";
  gap: number | string | null;
}

export interface WeatherRec {
  air: number;
  track: number;
  humidity: number;
  rain: boolean;
  wind: number;
}

export interface TrackShape {
  points: [number, number][];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface RaceBundle {
  session: SessionInfo;
  drivers: DriverInfo[];
  laps: LapRec[];
  stints: StintRec[];
  pits: PitRec[];
  positions: PosRec[];
  intervals: IntervalRec[];
  raceControl: RaceControlRec[];
  results: ResultRec[];
  grid: { d: number; pos: number }[];
  weather: WeatherRec | null;
  track: TrackShape | null;
  totalLaps: number;
  raceStart: number; // lights out (first lap start)
  raceEnd: number;
  simulated: boolean;
  live: boolean;
  note?: string;
}

/** Car positions for a time window: per driver a flat [t, x, y, t, x, y, ...] array. */
export interface LocationWindow {
  from: number;
  to: number;
  cars: Record<number, number[]>;
}
