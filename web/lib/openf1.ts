// Server-side OpenF1 client (https://openf1.org). Historical data is free and needs no key.

const BASE = "https://api.openf1.org/v1";

type Filter = string | number | boolean | undefined | Record<string, string>;
export type Query = { [k: string]: Filter; _gte?: Record<string, string>; _lt?: Record<string, string> };

function buildUrl(endpoint: string, q: Query): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (k.startsWith("_") || v === undefined || typeof v === "object") continue;
    parts.push(`${k}=${encodeURIComponent(String(v))}`);
  }
  for (const [k, v] of Object.entries(q._gte ?? {})) parts.push(`${k}>=${encodeURIComponent(v)}`);
  for (const [k, v] of Object.entries(q._lt ?? {})) parts.push(`${k}<${encodeURIComponent(v)}`);
  return `${BASE}/${endpoint}?${parts.join("&")}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function openf1<T = Record<string, unknown>>(
  endpoint: string,
  q: Query = {},
  revalidate = 3600,
): Promise<T[]> {
  const url = buildUrl(endpoint, q);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) {
      await sleep(800 * (attempt + 1));
      continue;
    }
    if (res.status === 404) return []; // OpenF1 answers 404 when a filter matches nothing
    if (!res.ok) throw new Error(`OpenF1 ${endpoint}: HTTP ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body)) throw new Error(`OpenF1 ${endpoint}: ${JSON.stringify(body).slice(0, 120)}`);
    return body as T[];
  }
  throw new Error(`OpenF1 ${endpoint}: rate limited`);
}

/** Runs requests a few at a time to stay under the free tier's per-second limit. */
export async function throttled<T>(tasks: (() => Promise<T>)[], perBatch = 3, gapMs = 1100): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < tasks.length; i += perBatch) {
    if (i > 0) await sleep(gapMs);
    out.push(...(await Promise.all(tasks.slice(i, i + perBatch).map((t) => t()))));
  }
  return out;
}

export const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);
