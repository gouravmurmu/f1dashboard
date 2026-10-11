export const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#e8002d", MEDIUM: "#ffd12e", HARD: "#f0f0ec", INTERMEDIATE: "#43b02a", WET: "#0067ad", UNKNOWN: "#c7c7cf",
};

export function fmtDate(ms: number, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Date(ms).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

export function flagEmoji(countryCode: string): string {
  const map: Record<string, string> = {
    AUS: "AU", CHN: "CN", JPN: "JP", BRN: "BH", KSA: "SA", USA: "US", CAN: "CA", MON: "MC", ESP: "ES", AUT: "AT",
    GBR: "GB", BEL: "BE", HUN: "HU", NED: "NL", ITA: "IT", AZE: "AZ", SGP: "SG", MEX: "MX", BRA: "BR", QAT: "QA",
    UAE: "AE", MAL: "MY", MYS: "MY",
  };
  const cc = map[countryCode] ?? "";
  return cc ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "🏁";
}
