// src/export/dxfExporter.ts
import Drawing from 'dxf-writer';
import { Point } from '../geometry/projection';
import { ParkingConfig } from '../geometry/types';
import { aisleDirectionArrows } from '../geometry/aisleRendering';

function ringToPolylinePoints(ring: Point[]): [number, number][] {
  return ring.map((p) => [p.x, p.y] as [number, number]);
}

export function exportConfigToDxf(config: ParkingConfig, boundary: Point[], exclusions: Point[][]): string {
  const d = new Drawing();
  d.setUnits('Meters');

  d.addLayer('CONTOUR', Drawing.ACI.WHITE, 'CONTINUOUS');
  d.setActiveLayer('CONTOUR');
  d.drawPolyline(ringToPolylinePoints(boundary), true);

  d.addLayer('EXCLUSIONS', Drawing.ACI.RED, 'CONTINUOUS');
  d.setActiveLayer('EXCLUSIONS');
  for (const exclusion of exclusions) {
    d.drawPolyline(ringToPolylinePoints(exclusion), true);
  }

  d.addLayer('PLACES', Drawing.ACI.CYAN, 'CONTINUOUS');
  d.addLayer('PLACES_PMR', Drawing.ACI.BLUE, 'CONTINUOUS');
  for (const stall of config.stalls) {
    d.setActiveLayer(stall.isPmr ? 'PLACES_PMR' : 'PLACES');
    d.drawPolyline(ringToPolylinePoints(stall.corners), true);
  }

  d.addLayer('VOIES', Drawing.ACI.YELLOW, 'CONTINUOUS');
  d.addLayer('VOIES_SEPARATEUR', Drawing.ACI.YELLOW, 'DASHED');
  for (const aisle of config.aisles) {
    if (config.loadType === 'double') {
      d.setActiveLayer('VOIES_SEPARATEUR');
      d.drawPolyline(ringToPolylinePoints(aisle.centerline), false);
    }
    d.setActiveLayer('VOIES');
    for (const arrow of aisleDirectionArrows(aisle, config.loadType)) {
      d.drawPolyline(ringToPolylinePoints(arrow), true);
    }
  }

  return d.toDxfString();
}
