// src/export/dxfExporter.ts
import Drawing from 'dxf-writer';
import { Point } from '../geometry/projection';
import { ParkingConfig } from '../geometry/types';

function ringToPolylinePoints(ring: Point[]): [number, number][] {
  return ring.map((p) => [p.x, p.y] as [number, number]);
}

export function exportConfigToDxf(config: ParkingConfig, boundary: Point[], exclusions: Point[][]): string {
  const d = new Drawing();

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
  d.setActiveLayer('VOIES');
  for (const aisle of config.aisles) {
    d.drawPolyline(ringToPolylinePoints(aisle.centerline), false);
  }

  return d.toDxfString();
}
