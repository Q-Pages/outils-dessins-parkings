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

const REQUIRED_NUMERIC_PARAM_KEYS: Array<keyof SerializableParams> = [
  'standardStallWidth',
  'standardStallLength',
  'pmrStallWidth',
  'pmrStallLength',
  'aisleWidthSingleLoaded',
  'aisleWidthDoubleLoaded',
];

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
  // Note V1 : le contenu des tableaux (ex. chaque point a bien lat/lng) n'est pas
  // validé en détail — acceptable pour un outil interne mono-utilisateur ; à revoir
  // si l'outil est un jour partagé plus largement avec des fichiers moins fiables.
  if (!parsed.params) {
    throw new Error('Fichier de projet invalide : "params" est manquant.');
  }
  for (const key of REQUIRED_NUMERIC_PARAM_KEYS) {
    if (typeof parsed.params[key] !== 'number') {
      throw new Error(`Fichier de projet invalide : "params.${key}" est manquant ou n'est pas un nombre.`);
    }
  }
  if (parsed.params.angleDeg !== 90 && parsed.params.angleDeg !== 60 && parsed.params.angleDeg !== 45) {
    throw new Error('Fichier de projet invalide : "params.angleDeg" doit être 90, 60 ou 45.');
  }

  return {
    boundary: parsed.boundary,
    exclusions: parsed.exclusions,
    accessPoints: parsed.accessPoints,
    params: { ...parsed.params, pmrRatio: DEFAULT_SOLVER_PARAMS.pmrRatio },
  };
}
