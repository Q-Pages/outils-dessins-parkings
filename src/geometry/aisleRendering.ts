// src/geometry/aisleRendering.ts
import { Point } from './projection';
import { AisleBand, Ring } from './types';

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  return { x: v.x / len, y: v.y / len };
}

function makeArrow(center: Point, direction: Point, arrowLength: number, arrowWidth: number): Ring {
  const perp: Point = { x: -direction.y, y: direction.x };
  const halfLen = arrowLength / 2;
  const halfWidth = arrowWidth / 2;

  const tip: Point = {
    x: center.x + direction.x * halfLen,
    y: center.y + direction.y * halfLen,
  };
  const baseLeft: Point = {
    x: center.x - direction.x * halfLen + perp.x * halfWidth,
    y: center.y - direction.y * halfLen + perp.y * halfWidth,
  };
  const baseRight: Point = {
    x: center.x - direction.x * halfLen - perp.x * halfWidth,
    y: center.y - direction.y * halfLen - perp.y * halfWidth,
  };

  return [tip, baseLeft, baseRight];
}

export function aisleDirectionArrows(aisle: AisleBand, loadType: 'single' | 'double'): Ring[] {
  const [start, end] = aisle.centerline;
  const length = distance(start, end);

  // Une voie de longueur nulle n'a pas de sens de circulation à représenter —
  // éviter la division par zéro dans normalize() plutôt que propager des NaN.
  if (length === 0) {
    return [];
  }

  const direction = normalize({ x: end.x - start.x, y: end.y - start.y });
  const arrowWidth = aisle.width * 0.2;

  if (loadType === 'single') {
    // L'unique flèche est centrée sur le milieu de la voie : la plafonner à 80% de
    // la longueur garantit qu'elle reste entièrement dans les bornes [0, length].
    const arrowLength = Math.min(arrowWidth * 2, length * 0.8);
    const mid: Point = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return [makeArrow(mid, direction, arrowLength, arrowWidth)];
  }

  // Les deux flèches sont centrées au tiers et aux deux tiers de la voie (pas au
  // milieu) : chaque centre ne dispose que de length/3 de marge vers l'extrémité
  // la plus proche dans le sens où sa base s'étend. Plafonner à 2/3 de la longueur
  // (donc une demi-longueur de flèche <= length/3) garantit que chaque flèche
  // reste dans les bornes [0, length], contrairement à un plafond de 80% partagé
  // avec le cas simple sens qui laisserait déborder la base de chaque flèche.
  const arrowLength = Math.min(arrowWidth * 2, (length * 2) / 3);
  const posA: Point = {
    x: start.x + direction.x * (length / 3),
    y: start.y + direction.y * (length / 3),
  };
  const posB: Point = {
    x: start.x + direction.x * ((length * 2) / 3),
    y: start.y + direction.y * ((length * 2) / 3),
  };
  const reverseDirection: Point = { x: -direction.x, y: -direction.y };

  return [
    makeArrow(posA, direction, arrowLength, arrowWidth),
    makeArrow(posB, reverseDirection, arrowLength, arrowWidth),
  ];
}
