import { describe, it, expect } from 'vitest';
import { assignPmrStalls } from './pmrAssignment';
import { Stall } from './types';
import { Point } from './projection';

function makeStall(id: string, center: Point): Stall {
  return {
    id,
    corners: [
      { x: center.x - 1, y: center.y - 1 },
      { x: center.x + 1, y: center.y - 1 },
      { x: center.x + 1, y: center.y + 1 },
      { x: center.x - 1, y: center.y + 1 },
    ],
    isPmr: false,
  };
}

describe('assignPmrStalls', () => {
  it('marks the N stalls closest to an access point as PMR', () => {
    const stalls = [
      makeStall('far', { x: 100, y: 100 }),
      makeStall('near', { x: 1, y: 1 }),
      makeStall('mid', { x: 20, y: 20 }),
    ];
    const accessPoints: Point[] = [{ x: 0, y: 0 }];

    const result = assignPmrStalls(stalls, accessPoints, 1);

    const pmrIds = result.filter((s) => s.isPmr).map((s) => s.id);
    expect(pmrIds).toEqual(['near']);
  });

  it('does not exceed the number of available stalls', () => {
    const stalls = [makeStall('only', { x: 0, y: 0 })];
    const result = assignPmrStalls(stalls, [{ x: 0, y: 0 }], 5);
    expect(result.filter((s) => s.isPmr)).toHaveLength(1);
  });
});
