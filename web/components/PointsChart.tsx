"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Props { series: Record<string, number | string>[]; leaders: string[]; colors: Record<string, string> }

export default function PointsChart({ series, leaders, colors }: Props) {
  if (series.length < 2) return <p className="py-10 text-center text-sm text-muted">Not enough rounds yet.</p>;
  return (
    <div className="h-80">
      <ResponsiveContainer>
        <LineChart data={series} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
          <CartesianGrid stroke="#ececf1" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#9a9aa5" interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} stroke="#9a9aa5" width={40} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} itemSorter={(i) => -Number(i.value)} />
          {leaders.map((k, i) => (
            <Line key={k} dataKey={k} stroke={colors[k]} strokeWidth={i < 3 ? 2.8 : 1.6}
              strokeDasharray={leaders.slice(0, i).some((p) => colors[p] === colors[k]) ? "5 3" : undefined}
              dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
