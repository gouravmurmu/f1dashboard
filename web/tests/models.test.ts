import { describe, expect, it } from "vitest";
import { demoBundle } from "@/lib/demo";
import { fitPitModel, rocAuc, averagePrecision } from "@/lib/models/pit";
import { optimise } from "@/lib/models/strategy";
import { fitTyreModel, pitLoss, predictLap } from "@/lib/models/tyre";
import { demoTelemetry } from "@/lib/telemetry";

const bundle = demoBundle();
const tyre = fitTyreModel(bundle);

describe("tyre model", () => {
  it("recovers the simulated fuel effect and medium wear", () => {
    expect(tyre.fitted).toBe(true);
    expect(tyre.fuel).toBeCloseTo(-0.06, 1); // the demo race burns 0.06 s/lap of fuel
    expect(tyre.compounds.MEDIUM[1]).toBeGreaterThan(0.03);
    expect(tyre.compounds.MEDIUM[1]).toBeLessThan(0.07);
    expect(tyre.r2!).toBeGreaterThan(0.6);
  });

  it("ranks the quicker car ahead", () => {
    expect(predictLap(tyre, 12, "MEDIUM", 5, 20)).toBeLessThan(predictLap(tyre, 77, "MEDIUM", 5, 20));
  });

  it("measures a pit loss close to the simulated lane time", () => {
    expect(pitLoss(bundle)).toBeGreaterThan(18);
    expect(pitLoss(bundle)).toBeLessThan(26);
  });
});

describe("pit stop model", () => {
  const pm = fitPitModel(bundle);
  it("beats the tyre-age baseline out of fold", () => {
    expect(pm.trained).toBe(true);
    expect(pm.auc).toBeGreaterThan(0.85);
    expect(pm.ap).toBeGreaterThan(pm.baseAp);
    expect(pm.rows.every((r) => r.prob >= 0 && r.prob <= 1)).toBe(true);
  });

  it("scores ranking metrics correctly", () => {
    expect(rocAuc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])).toBe(1);
    expect(rocAuc([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5])).toBe(0.5);
    expect(averagePrecision([1, 0, 1], [0.9, 0.8, 0.7])).toBeCloseTo((1 + 2 / 3) / 2, 6);
  });
});

describe("strategy optimiser", () => {
  it("returns valid plans, fastest first", () => {
    const plans = optimise(tyre, bundle.totalLaps, 22);
    expect(plans.length).toBeGreaterThan(3);
    for (const p of plans) {
      expect(p.stints.reduce((s, [, n]) => s + n, 0)).toBe(bundle.totalLaps);
      expect(new Set(p.stints.map(([c]) => c)).size).toBeGreaterThanOrEqual(2);
    }
    expect(plans.map((p) => p.time)).toEqual([...plans.map((p) => p.time)].sort((a, b) => a - b));
  });

  it("prefers fewer stops when stops get expensive", () => {
    const cheap = optimise(tyre, bundle.totalLaps, 12)[0], dear = optimise(tyre, bundle.totalLaps, 34)[0];
    expect(dear.stops).toBeLessThanOrEqual(cheap.stops);
  });
});

describe("telemetry", () => {
  it("builds a full lap matching the driver's fastest lap", () => {
    const t = demoTelemetry(12);
    const last = t.samples.at(-1)!;
    expect(last[0]).toBeCloseTo(t.lapTime, 0);
    expect(last[1]).toBeGreaterThan(5500);
    expect(Math.max(...t.samples.map((s) => s[2]))).toBeGreaterThan(250);
    expect(t.samples.some((s) => s[4] === 1)).toBe(true);
  });
});
