// src/geometry/aisleRendering.ts
import { Point } from './projection';
import { AisleBand, Ring } from './types';

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  return { x: v.x / len, y: v.y / len };
}

function makeArrow(center: Point, direction: Point, arrowLength: number, arrowWidth: number): Ring {
  const perp: Point = { x: -direction.y, y: direction.x };
  const halfLen = arrowLength / 2;
  const halfWidth = arrowWidth / 2;

  const tip: Point = {
    x: center.x + direction.x * halfLen,
    y: center.y + direction.y * halfLen,
  };
  const baseLeft: Point = {
    x: center.x - direction.x * halfLen + perp.x * halfWidth,
    y: center.y - direction.y * halfLen + perp.y * halfWidth,
  };
  const baseRight: Point = {
    x: center.x - direction.x * halfLen - perp.x * halfWidth,
    y: center.y - direction.y * halfLen - perp.y * halfWidth,
  };

  return [tip, baseLeft, baseRight];
}

export function aisleDirectionArrows(aisle: AisleBand, loadType: 'single' | 'double'): Ring[] {
  const [start, end] = aisle.centerline;
  const length = distance(start, end);
  const direction = normalize({ x: end.x - start.x, y: end.y - start.y });
  const arrowWidth = aisle.width * 0.5;
  const arrowLength = arrowWidth * 2;

  if (loadType === 'single') {
    const mid: Point = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return [makeArrow(mid, direction, arrowLength, arrowWidth)];
  }

  const posA: Point = {
    x: start.x + direction.x * (length / 3),
    y: start.y + direction.y * (length / 3),
  };
  const posB: Point = {
    x: start.x + direction.x * ((length * 2) / 3),
    y: start.y + direction.y * ((length * 2) / 3),
  };
  const reverseDirection: Point = { x: -direction.x, y: -direction.y };

  return [
    makeArrow(posA, direction, arrowLength, arrowWidth),
    makeArrow(posB, reverseDirection, arrowLength, arrowWidth),
  ];
}
