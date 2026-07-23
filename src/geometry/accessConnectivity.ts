// src/geometry/accessConnectivity.ts
import { Point } from './projection';
import { AisleBand } from './types';

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function connectAislesToAccessPoints(aisles: AisleBand[], accessPoints: Point[]): AisleBand[] {
  if (accessPoints.length === 0) {
    return aisles;
  }

  return aisles.map((aisle) => {
    let bestAccessPoint: Point | null = null;
    let bestDistance = Infinity;
    let bestEndIndex: 0 | 1 = 0;

    for (const access of accessPoints) {
      for (const endIndex of [0, 1] as const) {
        const d = distance(aisle.centerline[endIndex], access);
        if (d < bestDistance) {
          bestDistance = d;
          bestAccessPoint = access;
          bestEndIndex = endIndex;
        }
      }
    }

    if (!bestAccessPoint) {
      return aisle;
    }

    const newCenterline: [Point, Point] = [...aisle.centerline] as [Point, Point];
    newCenterline[bestEndIndex] = bestAccessPoint;
    return { ...aisle, centerline: newCenterline };
  });
}
