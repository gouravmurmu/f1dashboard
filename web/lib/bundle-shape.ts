import type { TrackShape } from "./types";

export function shapeOf(points: [number, number][]): TrackShape {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return { points, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
