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
});
