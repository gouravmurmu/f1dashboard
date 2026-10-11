import { NextResponse } from "next/server";
import { DEMO_KEY, demoLocations } from "@/lib/demo";
import { fetchLocations } from "@/lib/locations";

const MAX_WINDOW = 180_000;

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = Number((await params).key);
  const url = new URL(req.url);
  const from = Number(url.searchParams.get("from"));
  const to = Math.min(Number(url.searchParams.get("to")), from + MAX_WINDOW);
  const live = url.searchParams.get("live") === "1";
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return NextResponse.json({ error: "from and to (epoch ms) are required" }, { status: 400 });
  }
  if (key === DEMO_KEY || url.searchParams.get("demo") === "1" || process.env.F1_FIXTURES === "1") {
    return NextResponse.json(demoLocations(from, to), { headers: { "Cache-Control": "public, s-maxage=86400" } });
  }
  try {
    const win = await fetchLocations(key, from, to, live);
    const cache = live ? "public, s-maxage=3" : "public, s-maxage=604800, immutable";
    return NextResponse.json(win, { headers: { "Cache-Control": cache } });
  } catch (err) {
    return NextResponse.json({ from, to, cars: {}, error: (err as Error).message }, { status: 502 });
  }
}
