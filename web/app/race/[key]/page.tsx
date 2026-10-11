import type { Metadata } from "next";
import RaceCentre from "@/components/race/RaceCentre";

export const metadata: Metadata = { title: "Race centre" };

export default async function RacePage({ params }: { params: Promise<{ key: string }> }) {
  const key = Number((await params).key);
  return <RaceCentre sessionKey={Number.isFinite(key) ? key : 0} />;
}
