import { ms, openf1 } from "./openf1";
import type { LocationWindow } from "./types";

/** All cars' track positions between `from` and `to`, thinned to one sample per `stepMs`. */
export async function fetchLocations(key: number, from: number, to: number, live: boolean, stepMs = 400):
  Promise<LocationWindow> {
  const rows = await openf1<{ driver_number: number; date: string; x: number; y: number }>("location", {
    session_key: key,
    _gte: { date: new Date(from).toISOString() },
    _lt: { date: new Date(to).toISOString() },
  }, live ? 3 : 86400);
  const cars: Record<number, number[]> = {};
  const lastT: Record<number, number> = {};
  for (const r of rows.sort((a, b) => ms(a.date) - ms(b.date))) {
    if (r.x === 0 && r.y === 0) continue;
    const t = ms(r.date);
    if (t - (lastT[r.driver_number] ?? -Infinity) < stepMs) continue;
    lastT[r.driver_number] = t;
    (cars[r.driver_number] ??= []).push(t, r.x, r.y);
  }
  return { from, to, cars };
}
