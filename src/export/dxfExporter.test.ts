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

function findLayerOfPolylineContaining(dxf: string, snippet: string): string | undefined {
  // .slice(1) : le premier fragment (avant la toute première entité LWPOLYLINE)
  // contient l'en-tête DXF et les tables/blocs générés par dxf-writer (dont le bloc
  // *Model_Space, dont le point de base est toujours 0,0,0) — l'inclure risquerait
  // de faire correspondre un snippet à ce contenu générique plutôt qu'à une vraie
  // entité de place. On continue aussi la boucle si un bloc contient le snippet mais
  // n'a pas de tag de calque exploitable, plutôt que de retourner undefined immédiatement.
  const entityBlocks = dxf.split('0\nLWPOLYLINE').slice(1);
  for (const block of entityBlocks) {
    if (block.includes(snippet)) {
      const match = block.match(/\n8\n([A-Z_]+)\n/);
      if (match) {
        return match[1];
      }
    }
  }
  return undefined;
}

describe('exportConfigToDxf', () => {
  it('produces a DXF string with the expected layers', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    expect(dxf).toContain('CONTOUR');
    expect(dxf).toContain('PLACES');
    expect(dxf).toContain('PLACES_PMR');
    expect(dxf).toContain('VOIES');
  });

  it('draws one arrow polyline (not a plain centerline) for a single-loaded aisle', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    const polylineCount = (dxf.match(/LWPOLYLINE/g) || []).length;
    // 1 contour + 2 stalls + 1 arrow = 4 LWPOLYLINE entities (no plain centerline for single-loaded)
    expect(polylineCount).toBe(4);
  });

  it('draws two arrows plus a dashed centerline divider for a double-loaded aisle', () => {
    const dxf = exportConfigToDxf(doubleLoadedConfig, boundary, exclusions);
    const polylineCount = (dxf.match(/LWPOLYLINE/g) || []).length;
    // 1 contour + 2 stalls + 2 arrows + 1 centerline divider = 6 LWPOLYLINE entities
    expect(polylineCount).toBe(6);
    expect(dxf).toContain('VOIES_SEPARATEUR');
  });

  it('places the standard stall on PLACES and the PMR stall on PLACES_PMR', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    // On cible un coin propre à chaque place plutôt que (0,0), qui coïncide avec le
    // point de base (0,0,0) du bloc *Model_Space généré par dxf-writer avant toute
    // entité — voir la note dans findLayerOfPolylineContaining ci-dessus.
    // s1 (standard) a le coin (0,5), non partagé avec s2 ; s2 (PMR) a le coin (5,0),
    // non partagé avec s1.
    expect(findLayerOfPolylineContaining(dxf, '10\n0\n20\n5')).toBe('PLACES');
    expect(findLayerOfPolylineContaining(dxf, '10\n5\n20\n0')).toBe('PLACES_PMR');
  });
});
