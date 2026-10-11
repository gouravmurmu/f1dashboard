export function yearParam(raw: string | string[] | undefined, min: number): number {
  const now = new Date().getUTCFullYear();
  const y = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(y) && y >= min && y <= now ? y : now;
}
