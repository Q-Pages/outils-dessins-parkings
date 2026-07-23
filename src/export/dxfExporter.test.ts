// src/export/dxfExporter.test.ts
import { describe, it, expect } from 'vitest';
import { exportConfigToDxf } from './dxfExporter';
import { ParkingConfig } from '../geometry/types';

const sampleConfig: ParkingConfig = {
  angleDeg: 90,
  loadType: 'single',
  rowDirectionDeg: 0,
  stalls: [
    {
      id: 's1',
      corners: [{ x: 0, y: 0 }, { x: 2.5, y: 0 }, { x: 2.5, y: 5 }, { x: 0, y: 5 }],
      isPmr: false,
    },
    {
      id: 's2',
      corners: [{ x: 2.5, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 2.5, y: 5 }],
      isPmr: true,
    },
  ],
  aisles: [{ centerline: [{ x: 0, y: 5 }, { x: 30, y: 5 }], width: 5 }],
  standardCount: 1,
  pmrCount: 1,
  totalCount: 2,
};

const boundary = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }];
const exclusions: { x: number; y: number }[][] = [];

describe('exportConfigToDxf', () => {
  it('produces a DXF string with the expected layers', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    expect(dxf).toContain('CONTOUR');
    expect(dxf).toContain('PLACES');
    expect(dxf).toContain('PLACES_PMR');
    expect(dxf).toContain('VOIES');
  });

  it('includes one polyline entity per stall and per aisle', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    const polylineCount = (dxf.match(/LWPOLYLINE/g) || []).length;
    // 1 contour + 2 stalls + 1 aisle = 4 LWPOLYLINE entities
    expect(polylineCount).toBe(4);
  });
});
