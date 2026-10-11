// Team colours for pages that only have a team name (results history). Live pages use OpenF1's colours.
const COLORS: [RegExp, string][] = [
  [/mercedes/i, "#00D7B6"], [/ferrari/i, "#ED1131"], [/mclaren/i, "#F47600"], [/red bull/i, "#4781D7"],
  [/aston/i, "#229971"], [/alpine/i, "#00A1E8"], [/williams/i, "#1868DB"], [/racing bulls|rb f1|alphatauri|toro/i, "#6C98FF"],
  [/haas/i, "#9C9FA2"], [/audi|sauber|alfa/i, "#F50537"], [/cadillac/i, "#909090"], [/renault/i, "#FFF500"],
  [/lotus/i, "#d4af37"], [/brabham/i, "#2a6ebb"], [/tyrrell/i, "#1b3b8a"], [/benetton/i, "#00a650"],
  [/jordan/i, "#f5c400"], [/force india|racing point/i, "#f596c8"],
];

export function teamColor(team: string): string {
  return COLORS.find(([re]) => re.test(team))?.[1] ?? "#9a9aa5";
}
