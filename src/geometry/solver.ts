// src/geometry/solver.ts
import { Point } from './projection';
import { assignPmrStalls } from './pmrAssignment';
import { connectAislesToAccessPoints } from './accessConnectivity';
import { packRows } from './rowPacking';
import { ParkingConfig, Ring, SolverParams } from './types';

export interface SolveInput {
  boundary: Ring;
  exclusions: Ring[];
  accessPoints: Point[];
  baseParams: SolverParams;
}

function boundaryRowDirections(boundary: Ring): number[] {
  let longestEdgeAngleDeg = 0;
  let longestLength = 0;

  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > longestLength) {
      longestLength = length;
      longestEdgeAngleDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
  }

  return [longestEdgeAngleDeg, longestEdgeAngleDeg + 90];
}

export function solveParkingConfigurations(input: SolveInput): ParkingConfig[] {
  const { boundary, exclusions, accessPoints, baseParams } = input;
  const rowDirections = boundaryRowDirections(boundary);
  const angles: Array<90 | 60 | 45> = [90, 60, 45];
  const loadTypes: Array<'single' | 'double'> = ['single', 'double'];

  const configs: ParkingConfig[] = [];

  for (const rowDirectionDeg of rowDirections) {
    for (const angleDeg of angles) {
      for (const loadType of loadTypes) {
        const params = { ...baseParams, angleDeg };
        const { stalls, aisles } = packRows(boundary, exclusions, params, rowDirectionDeg, loadType);

        if (stalls.length === 0) {
          continue;
        }

        const requiredPmr = baseParams.pmrRatio(stalls.length);
        const withPmr = assignPmrStalls(stalls, accessPoints, requiredPmr);
        const connectedAisles = connectAislesToAccessPoints(aisles, accessPoints);

        const pmrCount = withPmr.filter((s) => s.isPmr).length;
        const standardCount = withPmr.length - pmrCount;

        configs.push({
          angleDeg,
          loadType,
          rowDirectionDeg,
          stalls: withPmr,
          aisles: connectedAisles,
          standardCount,
          pmrCount,
          totalCount: withPmr.length,
        });
      }
    }
  }

  return configs.sort((a, b) => b.totalCount - a.totalCount);
}
