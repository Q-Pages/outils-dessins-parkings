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

export interface PreparedUsableArea {
  boundaryPoly: ReturnType<typeof toTurfPolygon>;
  exclusionPolys: ReturnType<typeof toTurfPolygon>[];
}

export function prepareUsableArea(boundary: Ring, exclusions: Ring[]): PreparedUsableArea {
  return {
    boundaryPoly: toTurfPolygon(boundary),
    exclusionPolys: exclusions.map(toTurfPolygon),
  };
}

export function stallFitsPreparedArea(stallRing: Ring, prepared: PreparedUsableArea): boolean {
  const stallPoly = toTurfPolygon(stallRing);

  if (!booleanContains(prepared.boundaryPoly, stallPoly)) {
    return false;
  }

  for (const exclusionPoly of prepared.exclusionPolys) {
    if (booleanIntersects(stallPoly, exclusionPoly)) {
      return false;
    }
  }

  return true;
}
