// src/geometry/types.ts
import { Point } from './projection';

export type Ring = Point[]; // polygone fermé implicite : premier point non répété

export interface SolverParams {
  standardStallWidth: number;   // mètres, perpendiculaire à la rangée
  standardStallLength: number;  // mètres, profondeur de place à 90°
  pmrStallWidth: number;
  pmrStallLength: number;
  aisleWidthSingleLoaded: number;
  aisleWidthDoubleLoaded: number;
  angleDeg: 90 | 60 | 45;
  pmrRatio: (totalStalls: number) => number; // nombre de places PMR requises
}

export const DEFAULT_SOLVER_PARAMS: SolverParams = {
  standardStallWidth: 2.5,
  standardStallLength: 5,
  pmrStallWidth: 3.3,
  pmrStallLength: 5,
  aisleWidthSingleLoaded: 5,
  aisleWidthDoubleLoaded: 6,
  angleDeg: 90,
  pmrRatio: (totalStalls: number) => Math.max(1, Math.ceil(totalStalls * 0.02)),
};

export interface Stall {
  id: string;
  corners: Point[]; // 4 sommets en mètres locaux, sens direct
  isPmr: boolean;
}

export interface AisleBand {
  centerline: [Point, Point];
  width: number;
}

export interface ParkingConfig {
  angleDeg: number;
  loadType: 'single' | 'double';
  rowDirectionDeg: number;
  stalls: Stall[];
  aisles: AisleBand[];
  standardCount: number;
  pmrCount: number;
  totalCount: number;
}
