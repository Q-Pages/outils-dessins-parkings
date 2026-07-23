// src/geometry/solver.test.ts
import { describe, it, expect } from 'vitest';
import { solveParkingConfigurations } from './solver';
import { DEFAULT_SOLVER_PARAMS, Ring } from './types';

const rectangle: Ring = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 20 },
  { x: 0, y: 20 },
];

describe('solveParkingConfigurations', () => {
  it('returns configurations sorted by total stall count descending', () => {
    const configs = solveParkingConfigurations({
      boundary: rectangle,
      exclusions: [],
      accessPoints: [{ x: 0, y: 5 }],
      baseParams: DEFAULT_SOLVER_PARAMS,
    });

    expect(configs.length).toBeGreaterThan(0);
    for (let i = 1; i < configs.length; i++) {
      expect(configs[i - 1].totalCount).toBeGreaterThanOrEqual(configs[i].totalCount);
    }
  });

  it('applies the PMR ratio to the best configuration', () => {
    const configs = solveParkingConfigurations({
      boundary: rectangle,
      exclusions: [],
      accessPoints: [{ x: 0, y: 5 }],
      baseParams: DEFAULT_SOLVER_PARAMS,
    });

    const best = configs[0];
    const expectedPmr = DEFAULT_SOLVER_PARAMS.pmrRatio(best.standardCount + best.pmrCount);
    expect(best.pmrCount).toBe(expectedPmr);
    expect(best.totalCount).toBe(best.standardCount + best.pmrCount);
  });
});
