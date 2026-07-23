// src/geometry/accessConnectivity.test.ts
import { describe, it, expect } from 'vitest';
import { connectAislesToAccessPoints } from './accessConnectivity';
import { AisleBand } from './types';

describe('connectAislesToAccessPoints', () => {
  it('extends the nearest aisle endpoint to reach the access point', () => {
    const aisles: AisleBand[] = [
      { centerline: [{ x: 0, y: 5 }, { x: 30, y: 5 }], width: 5 },
    ];
    const accessPoints = [{ x: -3, y: 5 }];

    const result = connectAislesToAccessPoints(aisles, accessPoints);

    expect(result[0].centerline[0]).toEqual({ x: -3, y: 5 });
    expect(result[0].centerline[1]).toEqual({ x: 30, y: 5 });
  });

  it('leaves aisles unchanged when there are no access points', () => {
    const aisles: AisleBand[] = [{ centerline: [{ x: 0, y: 5 }, { x: 30, y: 5 }], width: 5 }];
    const result = connectAislesToAccessPoints(aisles, []);
    expect(result).toEqual(aisles);
  });

  it('connects every access point even when multiple aisles compete for the same nearest one', () => {
    const aisles: AisleBand[] = [
      { centerline: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 5 },
      { centerline: [{ x: 0, y: 2 }, { x: 100, y: 2 }], width: 5 },
    ];
    // access0 is equidistant (distance 1) from both aisles' start points, so a
    // per-aisle algorithm would have BOTH aisles snap to access0, leaving access1
    // unconnected. The per-access-point algorithm must still connect access1.
    const accessPoints = [
      { x: 0, y: 1 },
      { x: 50, y: 50 },
    ];

    const result = connectAislesToAccessPoints(aisles, accessPoints);

    expect(result[0].centerline[0]).toEqual({ x: 0, y: 1 });
    expect(result[0].centerline[1]).toEqual({ x: 100, y: 0 });
    expect(result[1].centerline[0]).toEqual({ x: 50, y: 50 });
    expect(result[1].centerline[1]).toEqual({ x: 100, y: 2 });
  });
});
