// src/geometry/aisleRendering.test.ts
import { describe, it, expect } from 'vitest';
import { aisleDirectionArrows } from './aisleRendering';
import { AisleBand } from './types';

const singleAisle: AisleBand = {
  centerline: [{ x: 0, y: 0 }, { x: 30, y: 0 }],
  width: 5,
};

describe('aisleDirectionArrows', () => {
  it('returns one arrow for a single-loaded aisle, centered on the midpoint', () => {
    const arrows = aisleDirectionArrows(singleAisle, 'single');
    expect(arrows).toHaveLength(1);
    expect(arrows[0]).toHaveLength(3);
    // arrowWidth = width * 0.5 = 2.5, arrowLength = arrowWidth * 2 = 5
    // mid = (15, 0), direction = (1, 0)
    // tip = mid + direction * (arrowLength / 2) = (17.5, 0)
    expect(arrows[0][0].x).toBeCloseTo(17.5, 6);
    expect(arrows[0][0].y).toBeCloseTo(0, 6);
    // baseLeft = mid - direction * (arrowLength / 2) + perp * (arrowWidth / 2) = (12.5, 1.25)
    expect(arrows[0][1].x).toBeCloseTo(12.5, 6);
    expect(arrows[0][1].y).toBeCloseTo(1.25, 6);
    // baseRight = (12.5, -1.25)
    expect(arrows[0][2].x).toBeCloseTo(12.5, 6);
    expect(arrows[0][2].y).toBeCloseTo(-1.25, 6);
  });

  it('returns two opposite-facing arrows for a double-loaded aisle', () => {
    const arrows = aisleDirectionArrows(singleAisle, 'double');
    expect(arrows).toHaveLength(2);
    // posA = start + direction * (length / 3) = (10, 0), pointing +x
    // arrowLength = 5, so tip = (10 + 2.5, 0) = (12.5, 0)
    expect(arrows[0][0].x).toBeCloseTo(12.5, 6);
    // posB = start + direction * (length * 2 / 3) = (20, 0), pointing -x
    // tip = (20 - 2.5, 0) = (17.5, 0)
    expect(arrows[1][0].x).toBeCloseTo(17.5, 6);
    // the two arrows point in opposite directions: arrow A's tip is further along
    // +x than its own base points, arrow B's tip is further along -x than its base
    expect(arrows[0][0].x).toBeGreaterThan(arrows[0][1].x);
    expect(arrows[1][0].x).toBeLessThan(arrows[1][1].x);
  });

  it('scales arrow size with the aisle width', () => {
    const wideAisle: AisleBand = { centerline: [{ x: 0, y: 0 }, { x: 30, y: 0 }], width: 10 };
    const arrows = aisleDirectionArrows(wideAisle, 'single');
    // arrowWidth = 10 * 0.5 = 5, so baseLeft/baseRight are 5 apart in y (2.5 each side)
    expect(arrows[0][1].y).toBeCloseTo(2.5, 6);
    expect(arrows[0][2].y).toBeCloseTo(-2.5, 6);
  });

  it('returns no arrows for a zero-length aisle instead of producing NaN', () => {
    const degenerateAisle: AisleBand = { centerline: [{ x: 5, y: 5 }, { x: 5, y: 5 }], width: 5 };
    expect(aisleDirectionArrows(degenerateAisle, 'single')).toEqual([]);
    expect(aisleDirectionArrows(degenerateAisle, 'double')).toEqual([]);
  });

  it('clamps arrow length so it does not exceed the aisle for a short, wide aisle', () => {
    const shortAisle: AisleBand = { centerline: [{ x: 0, y: 0 }, { x: 2, y: 0 }], width: 6 };
    // Without clamping, arrowLength would be 6 (arrowWidth=width*0.5=3, arrowLength=arrowWidth*2=6) on a 2m-long aisle.
    // Clamped: arrowLength = min(6, 2 * 0.8) = 1.6, so the tip is at most 0.8m from
    // the midpoint (1, 0) in either direction — well within the aisle's own extent.
    const arrows = aisleDirectionArrows(shortAisle, 'single');
    expect(arrows[0][0].x).toBeLessThanOrEqual(2);
    expect(arrows[0][0].x).toBeGreaterThanOrEqual(0);
  });

  it('clamps arrow length for a short, wide double-loaded aisle so both arrows stay within the aisle', () => {
    const shortAisle: AisleBand = { centerline: [{ x: 0, y: 0 }, { x: 2, y: 0 }], width: 6 };
    const arrows = aisleDirectionArrows(shortAisle, 'double');
    for (const arrow of arrows) {
      for (const point of arrow) {
        expect(point.x).toBeGreaterThanOrEqual(-1e-9);
        expect(point.x).toBeLessThanOrEqual(2 + 1e-9);
      }
    }
  });

  it('produces a correctly oriented arrow for a diagonal aisle', () => {
    const diagonalAisle: AisleBand = { centerline: [{ x: 0, y: 0 }, { x: 10, y: 10 }], width: 4 };
    const arrows = aisleDirectionArrows(diagonalAisle, 'single');
    // direction = (1/sqrt(2), 1/sqrt(2)), mid = (5, 5), arrowWidth = 2, arrowLength = min(4, 8) = 4
    const invSqrt2 = 1 / Math.sqrt(2);
    const expectedTipX = 5 + invSqrt2 * 2;
    const expectedTipY = 5 + invSqrt2 * 2;
    expect(arrows[0][0].x).toBeCloseTo(expectedTipX, 6);
    expect(arrows[0][0].y).toBeCloseTo(expectedTipY, 6);
  });
});
