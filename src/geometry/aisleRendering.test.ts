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
    // arrowWidth = width * 0.2 = 1, arrowLength = arrowWidth * 2 = 2
    // mid = (15, 0), direction = (1, 0)
    // tip = mid + direction * (arrowLength / 2) = (16, 0)
    expect(arrows[0][0].x).toBeCloseTo(16, 6);
    expect(arrows[0][0].y).toBeCloseTo(0, 6);
    // baseLeft = mid - direction * (arrowLength / 2) + perp * (arrowWidth / 2) = (14, 0.5)
    expect(arrows[0][1].x).toBeCloseTo(14, 6);
    expect(arrows[0][1].y).toBeCloseTo(0.5, 6);
    // baseRight = (14, -0.5)
    expect(arrows[0][2].x).toBeCloseTo(14, 6);
    expect(arrows[0][2].y).toBeCloseTo(-0.5, 6);
  });

  it('returns two opposite-facing arrows for a double-loaded aisle', () => {
    const arrows = aisleDirectionArrows(singleAisle, 'double');
    expect(arrows).toHaveLength(2);
    // posA = start + direction * (length / 3) = (10, 0), pointing +x
    // arrowWidth = 1, arrowLength = 2, so tip = (10 + 1, 0) = (11, 0)
    expect(arrows[0][0].x).toBeCloseTo(11, 6);
    // posB = start + direction * (length * 2 / 3) = (20, 0), pointing -x
    // tip = (20 - 1, 0) = (19, 0)
    expect(arrows[1][0].x).toBeCloseTo(19, 6);
    expect(arrows[0][0].x).toBeGreaterThan(arrows[0][1].x);
    expect(arrows[1][0].x).toBeLessThan(arrows[1][1].x);
  });

  it('scales arrow size with the aisle width', () => {
    const wideAisle: AisleBand = { centerline: [{ x: 0, y: 0 }, { x: 30, y: 0 }], width: 10 };
    const arrows = aisleDirectionArrows(wideAisle, 'single');
    // arrowWidth = 10 * 0.2 = 2, so baseLeft/baseRight are 2 apart in y (1 each side)
    expect(arrows[0][1].y).toBeCloseTo(1, 6);
    expect(arrows[0][2].y).toBeCloseTo(-1, 6);
  });

  it('returns no arrows for a zero-length aisle instead of producing NaN', () => {
    const degenerateAisle: AisleBand = { centerline: [{ x: 5, y: 5 }, { x: 5, y: 5 }], width: 5 };
    expect(aisleDirectionArrows(degenerateAisle, 'single')).toEqual([]);
    expect(aisleDirectionArrows(degenerateAisle, 'double')).toEqual([]);
  });

  it('clamps arrow length for a short, wide aisle so it does not exceed the aisle', () => {
    const shortAisle: AisleBand = { centerline: [{ x: 0, y: 0 }, { x: 2, y: 0 }], width: 6 };
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
    // direction = (1/sqrt(2), 1/sqrt(2)), mid = (5, 5)
    // arrowWidth = 4 * 0.2 = 0.8, arrowLength = min(1.6, length * 0.8) — length = 10*sqrt(2) ≈ 14.14,
    // so arrowLength = 1.6 (unclamped), halfLen = 0.8
    const invSqrt2 = 1 / Math.sqrt(2);
    const expectedTipX = 5 + invSqrt2 * 0.8;
    const expectedTipY = 5 + invSqrt2 * 0.8;
    expect(arrows[0][0].x).toBeCloseTo(expectedTipX, 6);
    expect(arrows[0][0].y).toBeCloseTo(expectedTipY, 6);
  });
});
