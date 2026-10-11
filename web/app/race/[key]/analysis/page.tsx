import type { Metadata } from "next";
import RaceAnalysis from "@/components/analysis/RaceAnalysis";

export const metadata: Metadata = { title: "Telemetry and models" };

export default async function AnalysisPage({ params }: { params: Promise<{ key: string }> }) {
  const key = Number((await params).key);
  return <RaceAnalysis sessionKey={Number.isFinite(key) ? key : 0} />;
}
