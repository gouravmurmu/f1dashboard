// Server-side OpenF1 client (https://openf1.org). Historical data is free and needs no key.
// While a session is live (30 minutes before it starts until 30 minutes after it ends) OpenF1
// answers 401 unless the request carries a sponsor account token. Set OPENF1_USERNAME and
// OPENF1_PASSWORD to use one.

const BASE = "https://api.openf1.org/v1";
const TOKEN_URL = "https://api.openf1.org/token";

/** OpenF1 refused the request because a live session is running and no account is configured. */
export class OpenF1LockedError extends Error {
  constructor(endpoint: string) {
    super(`OpenF1 ${endpoint}: HTTP 401`);
    this.name = "OpenF1LockedError";
  }
}

let token: { value: string; expires: number } | null = null;

export const hasOpenF1Account = () => Boolean(process.env.OPENF1_USERNAME && process.env.OPENF1_PASSWORD);

async function authHeader(): Promise<Record<string, string>> {
  if (!hasOpenF1Account()) return {};
  if (!token || Date.now() > token.expires) {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: process.env.OPENF1_USERNAME!, password: process.env.OPENF1_PASSWORD! }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`OpenF1 sign-in failed: HTTP ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: string | number };
    token = { value: body.access_token, expires: Date.now() + (Number(body.expires_in) - 300) * 1000 };
  }
  return { Authorization: `Bearer ${token.value}` };
}

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
      headers: { Accept: "application/json", ...(await authHeader()) },
      next: { revalidate },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) {
      await sleep(800 * (attempt + 1));
      continue;
    }
    if (res.status === 404) return []; // OpenF1 answers 404 when a filter matches nothing
    if (res.status === 401 && !hasOpenF1Account()) throw new OpenF1LockedError(endpoint);
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
