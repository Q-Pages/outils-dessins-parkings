// src/geometry/accessConnectivity.ts
import { Point } from './projection';
import { AisleBand } from './types';

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function connectAislesToAccessPoints(aisles: AisleBand[], accessPoints: Point[]): AisleBand[] {
  if (accessPoints.length === 0) {
    return aisles;
  }

  // Connecte chaque point d'accès à l'extrémité de voie la plus proche sur tout le
  // réseau (plutôt que chaque voie à son point d'accès le plus proche), pour garantir
  // qu'aucun point d'accès ne reste orphelin même si plusieurs voies préféreraient le
  // même point d'accès.
  const updated: AisleBand[] = aisles.map((aisle) => ({
    ...aisle,
    centerline: [...aisle.centerline] as [Point, Point],
  }));

  // Suit les extrémités déjà attribuées pour qu'un point d'accès ultérieur ne puisse
  // pas "voler" l'extrémité d'un point d'accès précédent (ex. deux points d'accès très
  // proches l'un de l'autre visant la même extrémité de voie la plus proche).
  const claimed = new Set<string>();

  for (const access of accessPoints) {
    let bestAisleIndex = -1;
    let bestEndIndex: 0 | 1 = 0;
    let bestDistance = Infinity;

    updated.forEach((aisle, aisleIndex) => {
      for (const endIndex of [0, 1] as const) {
        if (claimed.has(`${aisleIndex}-${endIndex}`)) {
          continue;
        }
        const d = distance(aisle.centerline[endIndex], access);
        if (d < bestDistance) {
          bestDistance = d;
          bestAisleIndex = aisleIndex;
          bestEndIndex = endIndex;
        }
      }
    });

    if (bestAisleIndex !== -1) {
      updated[bestAisleIndex].centerline[bestEndIndex] = access;
      claimed.add(`${bestAisleIndex}-${bestEndIndex}`);
    }
  }

  return updated;
}
