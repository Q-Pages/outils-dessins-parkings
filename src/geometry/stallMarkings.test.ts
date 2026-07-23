// src/geometry/stallMarkings.test.ts
import { describe, it, expect } from 'vitest';
import { stallDividerLines } from './stallMarkings';
import { Stall } from './types';

function makeStall(id: string, xStart: number, xEnd: number, yStart: number, yEnd: number): Stall {
  return {
    id,
    corners: [
      { x: xStart, y: yStart },
      { x: xEnd, y: yStart },
      { x: xEnd, y: yEnd },
      { x: xStart, y: yEnd },
    ],
    isPmr: false,
  };
}

describe('stallDividerLines', () => {
  it('returns N+1 divider lines for N adjacent stalls in a row, without duplicating the shared edge', () => {
    const stalls = [makeStall('s1', 0, 2.5, 0, 5), makeStall('s2', 2.5, 5, 0, 5)];
    const lines = stallDividerLines(stalls);
    expect(lines).toHaveLength(3);
    const xs = lines.map(([a]) => a.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 2.5, 5]);
  });

  it('returns N+1 divider lines for three adjacent stalls', () => {
    const stalls = [
      makeStall('s1', 0, 2.5, 0, 5),
      makeStall('s2', 2.5, 5, 0, 5),
      makeStall('s3', 5, 7.5, 0, 5),
    ];
    const lines = stallDividerLines(stalls);
    expect(lines).toHaveLength(4);
  });

  it('returns 2 divider lines (both sides) for a single isolated stall', () => {
    const stalls = [makeStall('s1', 0, 2.5, 0, 5)];
    const lines = stallDividerLines(stalls);
    expect(lines).toHaveLength(2);
  });

  it('does not treat stalls in different rows as adjacent', () => {
    const stalls = [makeStall('s1', 0, 2.5, 0, 5), makeStall('s2', 0, 2.5, 10, 15)];
    const lines = stallDividerLines(stalls);
    expect(lines).toHaveLength(4);
  });
});
