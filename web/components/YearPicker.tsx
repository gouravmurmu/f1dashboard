"use client";
import { usePathname, useRouter } from "next/navigation";

export default function YearPicker({ year, from, to }: { year: number; from: number; to: number }) {
  const router = useRouter();
  const path = usePathname();
  const years = Array.from({ length: to - from + 1 }, (_, i) => to - i);
  return (
    <select value={year} onChange={(e) => router.push(`${path}?year=${e.target.value}`)} aria-label="Season"
      className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-bold">
      {years.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );
}
