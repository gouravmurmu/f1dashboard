import type { DriverStanding, TeamStanding } from "@/lib/jolpica";
import { teamColor } from "@/lib/teams";

export function DriverTable({ rows, limit }: { rows: DriverStanding[]; limit?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.points));
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.slice(0, limit ?? rows.length).map((r) => (
          <tr key={r.code + r.name} className="border-b border-line last:border-0">
            <td className="tabular w-8 py-2 text-center font-black text-muted">{r.position}</td>
            <td className="py-2">
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full" style={{ background: teamColor(r.team) }} />
                <div>
                  <div className="font-bold leading-tight">{r.name}</div>
                  <div className="text-xs text-muted">{r.team}</div>
                </div>
              </div>
            </td>
            <td className="hidden w-40 py-2 sm:table-cell">
              <div className="h-1.5 rounded-full bg-line">
                <div className="h-1.5 rounded-full" style={{ width: `${(r.points / max) * 100}%`, background: teamColor(r.team) }} />
              </div>
            </td>
            <td className="tabular w-12 py-2 text-right text-xs text-muted">{r.wins ? `${r.wins}W` : ""}</td>
            <td className="tabular w-16 py-2 text-right font-black">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TeamTable({ rows, limit }: { rows: TeamStanding[]; limit?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.points));
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.slice(0, limit ?? rows.length).map((r) => (
          <tr key={r.team} className="border-b border-line last:border-0">
            <td className="tabular w-8 py-2 text-center font-black text-muted">{r.position}</td>
            <td className="py-2 font-bold">
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full" style={{ background: teamColor(r.team) }} />{r.team}
              </div>
            </td>
            <td className="hidden w-40 py-2 sm:table-cell">
              <div className="h-1.5 rounded-full bg-line">
                <div className="h-1.5 rounded-full" style={{ width: `${(r.points / max) * 100}%`, background: teamColor(r.team) }} />
              </div>
            </td>
            <td className="tabular w-16 py-2 text-right font-black">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
