import { NextResponse } from "next/server";
import { DEMO_KEY } from "@/lib/demo";
import { demoTelemetry, fetchTelemetry } from "@/lib/telemetry";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = Number((await params).key);
  const url = new URL(req.url);
  const d = Number(url.searchParams.get("d"));
  const lapParam = url.searchParams.get("lap");
  if (!Number.isFinite(d)) return NextResponse.json({ error: "d (driver number) is required" }, { status: 400 });
  if (key === DEMO_KEY || url.searchParams.get("demo") === "1" || process.env.F1_FIXTURES === "1") {
    return NextResponse.json(demoTelemetry(d), { headers: { "Cache-Control": "public, s-maxage=86400" } });
  }
  try {
    const lap = await fetchTelemetry(key, d, lapParam ? Number(lapParam) : undefined);
    return NextResponse.json(lap, { headers: { "Cache-Control": "public, s-maxage=604800, immutable" } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
