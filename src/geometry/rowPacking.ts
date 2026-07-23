// src/geometry/rowPacking.ts
import { Point } from './projection';
import { AisleBand, Ring, SolverParams, Stall } from './types';
import { stallFitsUsableArea } from './containment';

function rotatePoint(p: Point, angleRad: number): Point {
  return {
    x: p.x * Math.cos(angleRad) - p.y * Math.sin(angleRad),
    y: p.x * Math.sin(angleRad) + p.y * Math.cos(angleRad),
  };
}

function boundingBox(ring: Ring) {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export interface RowPackingResult {
  stalls: Stall[];
  aisles: AisleBand[];
}

export function packRows(
  boundary: Ring,
  exclusions: Ring[],
  params: SolverParams,
  rowDirectionDeg: number,
  loadType: 'single' | 'double'
): RowPackingResult {
  const angleRad = (rowDirectionDeg * Math.PI) / 180;
  const rotBack = -angleRad;

  const rotatedBoundary = boundary.map((p) => rotatePoint(p, rotBack));
  const rotatedExclusions = exclusions.map((ring) => ring.map((p) => rotatePoint(p, rotBack)));
  const bbox = boundingBox(rotatedBoundary);

  const stallAngleRad = (params.angleDeg * Math.PI) / 180;
  const stallWidthAlongRow = params.standardStallWidth / Math.sin(stallAngleRad);
  const stallDepth =
    params.standardStallLength * Math.sin(stallAngleRad) + params.standardStallWidth * Math.cos(stallAngleRad);

  const aisleWidth = loadType === 'double' ? params.aisleWidthDoubleLoaded : params.aisleWidthSingleLoaded;
  const moduleDepth = loadType === 'double' ? stallDepth * 2 + aisleWidth : stallDepth + aisleWidth;

  const stalls: Stall[] = [];
  const aisles: AisleBand[] = [];
  let y = bbox.minY;
  let rowIndex = 0;

  while (y + moduleDepth <= bbox.maxY + 1e-9) {
    const rowYPositions = loadType === 'double' ? [y, y + stallDepth + aisleWidth] : [y];

    for (const rowY of rowYPositions) {
      let x = bbox.minX;
      while (x + stallWidthAlongRow <= bbox.maxX + 1e-9) {
        const localCorners: Point[] = [
          { x, y: rowY },
          { x: x + stallWidthAlongRow, y: rowY },
          { x: x + stallWidthAlongRow, y: rowY + stallDepth },
          { x, y: rowY + stallDepth },
        ];
        if (stallFitsUsableArea(localCorners, rotatedBoundary, rotatedExclusions)) {
          stalls.push({
            id: `r${rowIndex}-${stalls.length}`,
            corners: localCorners.map((p) => rotatePoint(p, angleRad)),
            isPmr: false,
          });
        }
        x += stallWidthAlongRow;
      }
    }

    const aisleCenterY = y + stallDepth + aisleWidth / 2;
    aisles.push({
      centerline: [
        rotatePoint({ x: bbox.minX, y: aisleCenterY }, angleRad),
        rotatePoint({ x: bbox.maxX, y: aisleCenterY }, angleRad),
      ],
      width: aisleWidth,
    });

    y += moduleDepth;
    rowIndex++;
  }

  return { stalls, aisles };
}
