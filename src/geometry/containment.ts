// src/geometry/containment.ts
import { polygon as turfPolygon } from '@turf/helpers';
import booleanContains from '@turf/boolean-contains';
import booleanIntersects from '@turf/boolean-intersects';
import { Ring } from './types';

function toTurfPolygon(ring: Ring) {
  const coords = ring.map((p) => [p.x, p.y]);
  coords.push(coords[0]);
  return turfPolygon([coords]);
}

export function stallFitsUsableArea(stallRing: Ring, boundary: Ring, exclusions: Ring[]): boolean {
  const stallPoly = toTurfPolygon(stallRing);
  const boundaryPoly = toTurfPolygon(boundary);

  if (!booleanContains(boundaryPoly, stallPoly)) {
    return false;
  }

  for (const exclusion of exclusions) {
    const exclusionPoly = toTurfPolygon(exclusion);
    if (booleanIntersects(stallPoly, exclusionPoly)) {
      return false;
    }
  }

  return true;
}
