// src/geometry/rowPacking.test.ts
import { describe, it, expect } from 'vitest';
import { packRows } from './rowPacking';
import { DEFAULT_SOLVER_PARAMS, Ring } from './types';

const rectangle: Ring = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 20 },
  { x: 0, y: 20 },
];

describe('packRows', () => {
  it('packs a single-loaded 90° row of stalls in a 30x20m rectangle', () => {
    const result = packRows(rectangle, [], DEFAULT_SOLVER_PARAMS, 0, 'single');
    // stallWidthAlongRow = 2.5 / sin(90°) = 2.5 -> floor(30 / 2.5) = 12 stalls
    // moduleDepth = stallDepth(5) + aisle(5) = 10 -> floor(20 / 10) = 2 rows fit (y=0 and y=10)
    expect(result.stalls).toHaveLength(24);
    expect(result.aisles).toHaveLength(2);
  });

  it('packs a double-loaded 90° module in a 30x20m rectangle', () => {
    const result = packRows(rectangle, [], DEFAULT_SOLVER_PARAMS, 0, 'double');
    // moduleDepth = 2*5 + 6 = 16 -> only 1 module fits (16 <= 20), giving 2 rows of 12 stalls
    expect(result.stalls).toHaveLength(24);
    expect(result.aisles).toHaveLength(1);
  });

  it('excludes stalls overlapping an exclusion zone', () => {
    const exclusion: Ring = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ];
    const result = packRows(rectangle, [exclusion], DEFAULT_SOLVER_PARAMS, 0, 'single');
    // The exclusion covers x:[0,5]. Turf's booleanIntersects (used by stallFitsUsableArea)
    // treats edge-touching as intersecting, so the stalls at x=0-2.5, x=2.5-5, AND the
    // edge-touching stall at x=5-7.5 are all excluded (24 - 3 = 21). This conservative
    // behavior (no stall placed flush against an exclusion zone edge) is intentional.
    expect(result.stalls).toHaveLength(21);
  });

  it('packs stalls at a 60° angle with correct footprint', () => {
    const params = { ...DEFAULT_SOLVER_PARAMS, angleDeg: 60 as const };
    const result = packRows(rectangle, [], params, 0, 'single');
    const stallAngleRad = (60 * Math.PI) / 180;
    const expectedWidthAlongRow = 2.5 / Math.sin(stallAngleRad); // ≈ 2.887
    const expectedDepth = 5 * Math.sin(stallAngleRad) + 2.5 * Math.cos(stallAngleRad); // ≈ 5.58
    const expectedStallsPerRow = Math.floor(30 / expectedWidthAlongRow);
    const expectedModuleDepth = expectedDepth + params.aisleWidthSingleLoaded;
    const expectedRows = Math.floor(20 / expectedModuleDepth);
    expect(result.stalls).toHaveLength(expectedStallsPerRow * expectedRows);
  });
});
