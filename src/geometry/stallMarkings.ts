// src/geometry/stallMarkings.ts
import { Point } from './projection';
import { Stall } from './types';

function cornersMatch(a: Point, b: Point, epsilon = 1e-6): boolean {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
}

export function stallDividerLines(stalls: Stall[]): [Point, Point][] {
  const lines: [Point, Point][] = [];

  for (const stall of stalls) {
    const [frontLeft, frontRight, backRight, backLeft] = stall.corners;
    lines.push([frontLeft, backLeft]);

    const hasRightNeighbor = stalls.some(
      (other) =>
        other !== stall &&
        cornersMatch(other.corners[0], frontRight) &&
        cornersMatch(other.corners[3], backRight)
    );
    if (!hasRightNeighbor) {
      lines.push([frontRight, backRight]);
    }
  }

  return lines;
}
