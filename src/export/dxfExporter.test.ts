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

const doubleLoadedConfig: ParkingConfig = {
  ...sampleConfig,
  loadType: 'double',
};

const boundary = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }];
const exclusions: { x: number; y: number }[][] = [];

interface PolylineBlock {
  layer: string | undefined;
  vertexCount: number | undefined;
  raw: string;
}

function polylineBlocks(dxf: string): PolylineBlock[] {
  // .slice(1) : le premier fragment (avant la toute première entité LWPOLYLINE)
  // contient l'en-tête DXF et les tables/blocs générés par dxf-writer (dont le bloc
  // *Model_Space, dont le point de base est toujours 0,0,0) — l'inclure risquerait
  // de faire correspondre un snippet à ce contenu générique plutôt qu'à une vraie entité.
  return dxf
    .split('0\nLWPOLYLINE')
    .slice(1)
    .map((block) => {
      const layerMatch = block.match(/\n8\n([A-Z_]+)\n/);
      const vertexMatch = block.match(/\n90\n(\d+)\n/);
      return {
        layer: layerMatch?.[1],
        vertexCount: vertexMatch ? parseInt(vertexMatch[1], 10) : undefined,
        raw: block,
      };
    });
}

describe('exportConfigToDxf', () => {
  it('produces a DXF string with the expected layers', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    expect(dxf).toContain('CONTOUR');
    expect(dxf).toContain('PLACES');
    expect(dxf).toContain('PLACES_PMR');
    expect(dxf).toContain('VOIES');
  });

  it('draws divider lines (2-vertex, open) for stalls on PLACES, and a closed 4-vertex rectangle for the PMR stall on PLACES_PMR', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    const blocks = polylineBlocks(dxf);

    // 2 adjacent stalls (s1, s2) -> 3 divider lines, each a 2-vertex open polyline on PLACES
    const placesDividers = blocks.filter((b) => b.layer === 'PLACES');
    expect(placesDividers).toHaveLength(3);
    for (const divider of placesDividers) {
      expect(divider.vertexCount).toBe(2);
    }

    // the PMR stall's closed rectangle lives on PLACES_PMR as a single 4-vertex polyline
    const pmrShapes = blocks.filter((b) => b.layer === 'PLACES_PMR');
    expect(pmrShapes).toHaveLength(1);
    expect(pmrShapes[0].vertexCount).toBe(4);
  });

  it('draws one arrow polyline (not a plain centerline) for a single-loaded aisle, on a white VOIES layer', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    const blocks = polylineBlocks(dxf);
    // 1 contour + 3 place dividers + 1 PMR rectangle + 1 arrow = 6 LWPOLYLINE entities
    expect(blocks).toHaveLength(6);
    const voiesShapes = blocks.filter((b) => b.layer === 'VOIES');
    expect(voiesShapes).toHaveLength(1);
    expect(voiesShapes[0].vertexCount).toBe(3); // the arrow triangle
  });

  it('draws two arrows plus a dashed centerline divider for a double-loaded aisle', () => {
    const dxf = exportConfigToDxf(doubleLoadedConfig, boundary, exclusions);
    const blocks = polylineBlocks(dxf);
    // 1 contour + 3 place dividers + 1 PMR rectangle + 2 arrows + 1 centerline divider = 8
    expect(blocks).toHaveLength(8);
    const voiesSeparateurShapes = blocks.filter((b) => b.layer === 'VOIES_SEPARATEUR');
    expect(voiesSeparateurShapes).toHaveLength(1);
    expect(voiesSeparateurShapes[0].vertexCount).toBe(2); // the centerline, open 2-vertex polyline
  });

  it('uses white (color 7) for the VOIES and VOIES_SEPARATEUR layers', () => {
    const dxf = exportConfigToDxf(doubleLoadedConfig, boundary, exclusions);
    // LAYER table entries: group code 2 = name, group code 62 = ACI color number (7 = white)
    expect(dxf).toMatch(/2\nVOIES\n[\s\S]{0,80}?62\n7\n/);
    expect(dxf).toMatch(/2\nVOIES_SEPARATEUR\n[\s\S]{0,80}?62\n7\n/);
  });
});
