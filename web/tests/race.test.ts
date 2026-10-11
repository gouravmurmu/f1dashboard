import { describe, expect, it } from "vitest";
import { demoBundle, demoLocations } from "@/lib/demo";
import { positionAt } from "@/lib/geometry";
import { ReplayIndex, trackStatus } from "@/lib/replay";
import { simulate } from "@/lib/sim";

const bundle = demoBundle();
const idx = new ReplayIndex(bundle);

describe("demo race", () => {
  it("has the 2026 grid and a full race", () => {
    expect(bundle.drivers).toHaveLength(22);
    expect(bundle.drivers.map((d) => d.team)).toContain("Cadillac");
    expect(bundle.results[0].pos).toBe(1);
    expect(bundle.raceEnd).toBeGreaterThan(bundle.raceStart);
    expect(bundle.track?.points.length).toBeGreaterThan(50);
  });

  it("gives every running car a position on track", () => {
    const t = bundle.raceStart + 600_000;
    const w = demoLocations(t - 1000, t + 1000);
    const placed = bundle.drivers.filter((d) => positionAt(w.cars[d.number], t));
    expect(placed.length).toBeGreaterThanOrEqual(20);
  });
});

describe("replay", () => {
  it("orders the field consistently and advances laps", () => {
    const early = idx.stateAt(bundle.raceStart + 200_000);
    const late = idx.stateAt(bundle.raceStart + 3_000_000);
    expect(late.lap).toBeGreaterThan(early.lap);
    const positions = late.cars.filter((c) => !c.out).map((c) => c.position);
    expect(positions).toEqual(positions.map((_, i) => i + 1));
  });

  it("ends with the classified winner in P1", () => {
    const end = idx.stateAt(bundle.raceEnd + 60_000);
    expect(end.cars[0].driver.number).toBe(bundle.results[0].d);
    expect(end.status).toBe("CHEQUERED");
  });

  it("reads safety car periods from race control", () => {
    const sc = bundle.raceControl.find((m) => m.message.toUpperCase().includes("SAFETY CAR DEPLOYED"));
    expect(sc).toBeDefined();
    expect(trackStatus(bundle.raceControl, sc!.t + 1000)).toMatch(/SC|VSC/);
  });
});

describe("simulator", () => {
  it("produces probabilities that add up", () => {
    const state = idx.stateAt(bundle.raceStart + 1_800_000);
    const res = simulate(idx, state, 300);
    const sum = (k: "win" | "podium" | "points") => res.reduce((s, r) => s + r[k], 0);
    expect(sum("win")).toBeCloseTo(1, 5);
    expect(sum("podium")).toBeCloseTo(3, 5);
    expect(new Set(res.map((r) => r.projected)).size).toBe(res.length);
  });

  it("leaves only the front-runners able to win late in the race", () => {
    const state = idx.stateAt(bundle.raceEnd - 240_000);
    const res = simulate(idx, state, 300);
    const front = new Set(state.cars.slice(0, 3).map((c) => c.driver.number));
    expect(res.filter((r) => front.has(r.d)).reduce((s, r) => s + r.win, 0)).toBeGreaterThan(0.95);
  });

  it("is deterministic for a given seed", () => {
    const state = idx.stateAt(bundle.raceStart + 1_200_000);
    expect(simulate(idx, state, 100, 3)).toEqual(simulate(idx, state, 100, 3));
  });
});
