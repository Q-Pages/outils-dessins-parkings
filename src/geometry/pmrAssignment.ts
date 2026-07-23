import { Point } from './projection';
import { Stall } from './types';

function stallCenter(stall: Stall): Point {
  const sum = stall.corners.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / stall.corners.length, y: sum.y / stall.corners.length };
}

function distanceToNearestAccessPoint(point: Point, accessPoints: Point[]): number {
  return Math.min(...accessPoints.map((a) => Math.hypot(a.x - point.x, a.y - point.y)));
}

export function assignPmrStalls(stalls: Stall[], accessPoints: Point[], requiredCount: number): Stall[] {
  if (accessPoints.length === 0 || requiredCount <= 0) {
    return stalls;
  }

  const sorted = [...stalls].sort(
    (a, b) => distanceToNearestAccessPoint(stallCenter(a), accessPoints) - distanceToNearestAccessPoint(stallCenter(b), accessPoints)
  );

  const pmrIds = new Set(sorted.slice(0, requiredCount).map((s) => s.id));

  return stalls.map((s) => (pmrIds.has(s.id) ? { ...s, isPmr: true } : s));
}
