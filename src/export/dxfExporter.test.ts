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

// Returns the DXF group-code-8 layer name of the LWPOLYLINE entity whose point
// data contains `pointSequenceSnippet` (a substring of consecutive "10\nX\n20\nY"
// tokens unique to that entity's vertices), or undefined if none match.
// Verified against real dxf-writer output: each entity block looks like
// "0\nLWPOLYLINE\n5\n..\n330\n..\n100\nAcDbEntity\n100\nAcDbPolyline\n8\n<LAYER>\n6\nByLayer\n...".
function findLayerOfPolylineContaining(dxf: string, pointSequenceSnippet: string): string | undefined {
  const entityChunks = dxf.split('0\nLWPOLYLINE\n').slice(1);
  const chunk = entityChunks.find((c) => c.includes(pointSequenceSnippet));
  if (!chunk) return undefined;
  const match = chunk.match(/\n8\n([^\n]+)\n/);
  return match ? match[1] : undefined;
}

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

  it('declares drawing units in meters via the $INSUNITS header variable', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    // dxf-writer's Drawing.UNITS.Meters === 6; setUnits('Meters') emits this
    // as header group "9\n$INSUNITS\n70\n6" (verified against real output).
    expect(dxf).toContain('$INSUNITS');
    expect(dxf).toMatch(/\$INSUNITS\r?\n70\r?\n6\r?\n/);
  });

  it('draws a non-empty exclusion polygon as a polyline on the EXCLUSIONS layer', () => {
    const exclusionRing = [
      { x: 10, y: 8 },
      { x: 12, y: 8 },
      { x: 12, y: 10 },
      { x: 10, y: 10 },
    ];
    const dxf = exportConfigToDxf(sampleConfig, boundary, [exclusionRing]);
    const polylineCount = (dxf.match(/LWPOLYLINE/g) || []).length;
    // 1 contour + 1 exclusion + 2 stalls + 1 aisle = 5 LWPOLYLINE entities
    expect(polylineCount).toBe(5);
    const layer = findLayerOfPolylineContaining(dxf, '10\n10\n20\n8\n10\n12\n20\n8');
    expect(layer).toBe('EXCLUSIONS');
  });

  it('draws the standard stall on PLACES and the PMR stall on PLACES_PMR, not the other layer', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    // s1 corners (0,0)->(2.5,0) is a sequence unique to the standard stall.
    const standardLayer = findLayerOfPolylineContaining(dxf, '10\n0\n20\n0\n10\n2.5\n20\n0');
    // s2 corners (2.5,0)->(5,0) is a sequence unique to the PMR stall.
    const pmrLayer = findLayerOfPolylineContaining(dxf, '10\n2.5\n20\n0\n10\n5\n20\n0');
    expect(standardLayer).toBe('PLACES');
    expect(pmrLayer).toBe('PLACES_PMR');
  });
});
