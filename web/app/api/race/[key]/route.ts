import { NextResponse } from "next/server";
import { buildBundle } from "@/lib/bundle";
import { DEMO_KEY, demoBundle } from "@/lib/demo";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = Number((await params).key);
  if (key === DEMO_KEY || !Number.isFinite(key) || process.env.F1_FIXTURES === "1") {
    return NextResponse.json(demoBundle(), { headers: { "Cache-Control": "public, s-maxage=86400" } });
  }
  try {
    const bundle = await buildBundle(key);
    const cache = bundle.live ? "public, s-maxage=5, stale-while-revalidate=10"
      : "public, s-maxage=86400, stale-while-revalidate=604800";
    return NextResponse.json(bundle, { headers: { "Cache-Control": cache } });
  } catch (err) {
    const fallback = { ...demoBundle(), note: `Live data for this session could not be loaded (${(err as Error).message}). ` +
      "Showing a simulated race instead." };
    return NextResponse.json(fallback, { headers: { "Cache-Control": "public, s-maxage=60" } });
  }
}
