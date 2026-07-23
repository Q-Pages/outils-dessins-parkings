// src/geometry/containment.test.ts
import { describe, it, expect } from 'vitest';
import { stallFitsUsableArea } from './containment';
import { Ring } from './types';

const boundary: Ring = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 20 },
  { x: 0, y: 20 },
];

describe('stallFitsUsableArea', () => {
  it('accepts a stall fully inside the boundary with no exclusions', () => {
    const stall: Ring = [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 3 },
      { x: 1, y: 3 },
    ];
    expect(stallFitsUsableArea(stall, boundary, [])).toBe(true);
  });

  it('rejects a stall that crosses the boundary edge', () => {
    const stall: Ring = [
      { x: 28, y: 1 },
      { x: 32, y: 1 },
      { x: 32, y: 3 },
      { x: 28, y: 3 },
    ];
    expect(stallFitsUsableArea(stall, boundary, [])).toBe(false);
  });

  it('rejects a stall that overlaps an exclusion zone', () => {
    const exclusion: Ring = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ];
    const stall: Ring = [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 3 },
      { x: 1, y: 3 },
    ];
    expect(stallFitsUsableArea(stall, boundary, [exclusion])).toBe(false);
  });
});
