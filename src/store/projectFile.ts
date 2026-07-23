// src/store/projectFile.ts
import { LatLng } from '../geometry/projection';
import { DEFAULT_SOLVER_PARAMS, SolverParams } from '../geometry/types';

export interface ProjectData {
  boundary: LatLng[];
  exclusions: LatLng[][];
  accessPoints: LatLng[];
  params: SolverParams;
}

type SerializableParams = Omit<SolverParams, 'pmrRatio'>;

interface SerializedProject {
  boundary: LatLng[];
  exclusions: LatLng[][];
  accessPoints: LatLng[];
  params: SerializableParams;
}

export function serializeProject(project: ProjectData): string {
  const { pmrRatio: _pmrRatio, ...serializableParams } = project.params;
  const serialized: SerializedProject = {
    boundary: project.boundary,
    exclusions: project.exclusions,
    accessPoints: project.accessPoints,
    params: serializableParams,
  };
  return JSON.stringify(serialized, null, 2);
}

export function deserializeProject(json: string): ProjectData {
  const parsed = JSON.parse(json) as Partial<SerializedProject>;

  if (!Array.isArray(parsed.boundary)) {
    throw new Error('Fichier de projet invalide : "boundary" est manquant ou n\'est pas un tableau.');
  }
  if (!Array.isArray(parsed.exclusions)) {
    throw new Error('Fichier de projet invalide : "exclusions" est manquant ou n\'est pas un tableau.');
  }
  if (!Array.isArray(parsed.accessPoints)) {
    throw new Error('Fichier de projet invalide : "accessPoints" est manquant ou n\'est pas un tableau.');
  }
  if (!parsed.params || typeof parsed.params.standardStallWidth !== 'number') {
    throw new Error('Fichier de projet invalide : "params" est manquant ou incomplet.');
  }

  return {
    boundary: parsed.boundary,
    exclusions: parsed.exclusions,
    accessPoints: parsed.accessPoints,
    params: { ...parsed.params, pmrRatio: DEFAULT_SOLVER_PARAMS.pmrRatio },
  };
}
