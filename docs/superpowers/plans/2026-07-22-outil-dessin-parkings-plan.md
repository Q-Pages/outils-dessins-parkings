# Outil de dessin et d'optimisation de parkings — Plan d'implémentation V1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire une application web statique (React/Vite) permettant de tracer un terrain sur fond satellite, générer automatiquement le plan de stationnement optimisé (balayage de configurations), et exporter le résultat en DXF calqué.

**Architecture:** Un moteur géométrique pur (`src/geometry/`) indépendant de l'UI, testé unitairement en isolation ; une couche état (`src/store/`) qui pilote le moteur depuis les données tracées sur la carte ; des composants UI (`src/components/`) pour la carte, les paramètres et les résultats ; un module d'export (`src/export/`).

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Zustand (état global léger), React-Leaflet + Leaflet.draw (carte/tracé), Turf.js (géométrie), dxf-writer (export DXF).

---

## Note de déviation par rapport à la spec (à valider avec l'utilisateur)

La spec liste Clipper2-WASM et straight-skeleton comme briques géométriques. Ce plan utilise **uniquement Turf.js** pour toute la géométrie du moteur V1 (`booleanContains`, `booleanIntersects`, `difference`) :
- Turf est synchrone (pas d'initialisation WASM asynchrone à gérer), ce qui simplifie fortement les tests unitaires et le code.
- Turf est suffisant pour des polygones de site (contours simples, quelques zones d'exclusion) — la robustesse numérique supérieure de Clipper2 devient utile sur des géométries CAO complexes, pas sur ce cas d'usage.
- Clipper2-WASM et straight-skeleton restent des options d'amélioration future si des cas réels révèlent des limites de précision de Turf (à documenter dans le backlog V2, section finale de ce plan).

---

## Structure des fichiers

```
Outils dessins parkings/
  package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html
  src/
    main.tsx, App.tsx, App.css
    geometry/
      projection.ts          — conversion lat/lng <-> mètres locaux
      types.ts                — types partagés (Stall, AisleBand, ParkingConfig, SolverParams)
      containment.ts          — tests d'inclusion/chevauchement de polygones (Turf)
      rowPacking.ts            — génération d'une configuration (une orientation/angle/type de voie)
      pmrAssignment.ts        — marquage des places PMR
      accessConnectivity.ts   — raccordement des voies aux points d'accès
      solver.ts                — balayage multi-configurations + classement
    store/
      projectStore.ts         — état global (Zustand)
      projectFile.ts          — export/import JSON du projet
    export/
      dxfExporter.ts           — génération du fichier DXF calqué
    components/
      MapView.tsx              — carte Leaflet, recherche, outils de tracé
      ParamsPanel.tsx          — formulaire de paramètres
      ResultsPanel.tsx         — affichage des résultats et alternatives
  docs/superpowers/specs/2026-07-22-outil-dessin-parkings-design.md   (existant)
  docs/superpowers/plans/2026-07-22-outil-dessin-parkings-plan.md     (ce fichier)
  .github/workflows/deploy.yml
```

---

### Task 1: Scaffold du projet (Vite + React + TS + Vitest)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`

- [ ] **Step 1: Scaffolder le projet Vite**

Run: `npm create vite@latest . -- --template react-ts`
Expected: fichiers `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx` créés (le dossier `docs/` existant n'est pas touché).

- [ ] **Step 2: Installer les dépendances du projet**

Run: `npm install leaflet react-leaflet leaflet-draw @types/leaflet @types/leaflet-draw @turf/turf zustand dxf-writer`

Run: `npm install -D vitest`

- [ ] **Step 3: Ajouter le script de test dans `package.json`**

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest run"
}
```

- [ ] **Step 4: Vérifier que le projet démarre**

Run: `npm run dev -- --port 5173 &` puis vérifier que `http://localhost:5173` répond (arrêter le process ensuite).
Expected: page Vite/React par défaut visible.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/ .gitignore
git commit -m "chore: scaffold Vite/React/TS project"
```

---

### Task 2: Projection lat/lng vers mètres locaux

**Files:**
- Create: `src/geometry/projection.ts`
- Test: `src/geometry/projection.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/geometry/projection.test.ts
import { describe, it, expect } from 'vitest';
import { makeProjection } from './projection';

describe('makeProjection', () => {
  it('projects the origin to (0,0)', () => {
    const proj = makeProjection({ lat: 43.6, lng: 3.88 });
    const p = proj.toLocal({ lat: 43.6, lng: 3.88 });
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it('round-trips toLocal/toLatLng', () => {
    const proj = makeProjection({ lat: 43.6, lng: 3.88 });
    const original = { lat: 43.601234, lng: 3.881234 };
    const local = proj.toLocal(original);
    const back = proj.toLatLng(local);
    expect(back.lat).toBeCloseTo(original.lat, 8);
    expect(back.lng).toBeCloseTo(original.lng, 8);
  });

  it('approximates real-world distance for 1 degree of latitude (~111.32km)', () => {
    const proj = makeProjection({ lat: 43.6, lng: 3.88 });
    const p = proj.toLocal({ lat: 44.6, lng: 3.88 });
    expect(p.y).toBeCloseTo(111320, -3);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/geometry/projection.test.ts`
Expected: FAIL — `Cannot find module './projection'`

- [ ] **Step 3: Implémenter la projection**

```typescript
// src/geometry/projection.ts
export interface LatLng {
  lat: number;
  lng: number;
}

export interface Point {
  x: number;
  y: number;
}

const EARTH_RADIUS_M = 6378137;
const METERS_PER_DEG_LAT = (Math.PI / 180) * EARTH_RADIUS_M;

export function makeProjection(originLatLng: LatLng) {
  const originLatRad = (originLatLng.lat * Math.PI) / 180;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(originLatRad);

  return {
    toLocal(p: LatLng): Point {
      return {
        x: (p.lng - originLatLng.lng) * metersPerDegLng,
        y: (p.lat - originLatLng.lat) * METERS_PER_DEG_LAT,
      };
    },
    toLatLng(p: Point): LatLng {
      return {
        lat: originLatLng.lat + p.y / METERS_PER_DEG_LAT,
        lng: originLatLng.lng + p.x / metersPerDegLng,
      };
    },
  };
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/geometry/projection.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/projection.ts src/geometry/projection.test.ts
git commit -m "feat: add lat/lng to local meters projection"
```

---

### Task 3: Types partagés du moteur géométrique

**Files:**
- Create: `src/geometry/types.ts`

- [ ] **Step 1: Créer le fichier de types (pas de test — types purs, vérifiés par les tests des tasks suivantes)**

```typescript
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
```

- [ ] **Step 2: Vérifier que le projet compile toujours**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 3: Commit**

```bash
git add src/geometry/types.ts
git commit -m "feat: add shared geometry types and default solver params"
```

---

### Task 4: Tests d'inclusion et de chevauchement de polygones

**Files:**
- Create: `src/geometry/containment.ts`
- Test: `src/geometry/containment.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/geometry/containment.test.ts
import { describe, it, expect } from 'vitest';
import { stallFitsUsableArea } from './containment';
import { Ring } from './types';

const boundary: Ring = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 20 },
  { x: 0, y: 20 },
];

describe('stallFitsUsableArea', () => {
  it('accepts a stall fully inside the boundary with no exclusions', () => {
    const stall: Ring = [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 3 },
      { x: 1, y: 3 },
    ];
    expect(stallFitsUsableArea(stall, boundary, [])).toBe(true);
  });

  it('rejects a stall that crosses the boundary edge', () => {
    const stall: Ring = [
      { x: 28, y: 1 },
      { x: 32, y: 1 },
      { x: 32, y: 3 },
      { x: 28, y: 3 },
    ];
    expect(stallFitsUsableArea(stall, boundary, [])).toBe(false);
  });

  it('rejects a stall that overlaps an exclusion zone', () => {
    const exclusion: Ring = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ];
    const stall: Ring = [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 3 },
      { x: 1, y: 3 },
    ];
    expect(stallFitsUsableArea(stall, boundary, [exclusion])).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/geometry/containment.test.ts`
Expected: FAIL — `Cannot find module './containment'`

- [ ] **Step 3: Implémenter la fonction d'inclusion**

```typescript
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
```

**Correction post-revue de code (Task 9) :** `stallFitsUsableArea` reconstruit un polygone Turf pour tout le contour et chaque exclusion à chaque appel. C'était toléré tant que c'était un coût interne, mais Task 9 en fait le chemin d'exécution direct du bouton "Générer le plan" côté UI (12 appels à `packRows`, chacun appelant potentiellement `stallFitsUsableArea` des centaines de fois). Ajouter au fichier `containment.ts`, en plus du code ci-dessus (ne rien supprimer, `stallFitsUsableArea` reste tel quel pour ne pas casser les tests de Task 4) :

```typescript
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
```

Puis dans `src/geometry/rowPacking.ts`, remplacer l'import et l'appel :

```typescript
import { prepareUsableArea, stallFitsPreparedArea } from './containment';
```

Construire `const prepared = prepareUsableArea(rotatedBoundary, rotatedExclusions);` une seule fois, juste après le calcul de `bbox` (avant la boucle `while (y + moduleDepth <= ...)`), puis remplacer l'appel `stallFitsUsableArea(localCorners, rotatedBoundary, rotatedExclusions)` par `stallFitsPreparedArea(localCorners, prepared)`. Résultat : le contour et les exclusions ne sont plus reconstruits qu'une fois par appel à `packRows` (donc 12 fois par génération), au lieu d'une fois par place candidate testée (potentiellement des milliers de fois).

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/geometry/containment.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/containment.ts src/geometry/containment.test.ts
git commit -m "feat: add polygon containment/overlap checks via Turf"
```

---

### Task 5: Génération d'une configuration par balayage de rangées (row packing)

**Files:**
- Create: `src/geometry/rowPacking.ts`
- Test: `src/geometry/rowPacking.test.ts`

- [ ] **Step 1: Écrire le test qui échoue (rectangle simple, 90°, voie simple, sans exclusions)**

```typescript
// src/geometry/rowPacking.test.ts
import { describe, it, expect } from 'vitest';
import { packRows } from './rowPacking';
import { DEFAULT_SOLVER_PARAMS, Ring } from './types';

const rectangle: Ring = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 20 },
  { x: 0, y: 20 },
];

describe('packRows', () => {
  it('packs a single-loaded 90° row of stalls in a 30x20m rectangle', () => {
    const result = packRows(rectangle, [], DEFAULT_SOLVER_PARAMS, 0, 'single');
    // stallWidthAlongRow = 2.5 / sin(90°) = 2.5 -> floor(30 / 2.5) = 12 stalls
    // moduleDepth = stallDepth(5) + aisle(5) = 10 -> floor(20 / 10) = 2 rows fit (y=0 and y=10)
    expect(result.stalls).toHaveLength(24);
    expect(result.aisles).toHaveLength(2);
  });

  it('packs a double-loaded 90° module in a 30x20m rectangle', () => {
    const result = packRows(rectangle, [], DEFAULT_SOLVER_PARAMS, 0, 'double');
    // moduleDepth = 2*5 + 6 = 16 -> only 1 module fits (16 <= 20), giving 2 rows of 12 stalls
    expect(result.stalls).toHaveLength(24);
    expect(result.aisles).toHaveLength(1);
  });

  it('excludes stalls overlapping an exclusion zone', () => {
    const exclusion: Ring = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ];
    const result = packRows(rectangle, [exclusion], DEFAULT_SOLVER_PARAMS, 0, 'single');
    // The exclusion covers x:[0,5]. Turf's booleanIntersects (used by stallFitsUsableArea)
    // treats edge-touching as intersecting, so the stalls at x=0-2.5, x=2.5-5, AND the
    // edge-touching stall at x=5-7.5 are all excluded (24 - 3 = 21). This conservative
    // behavior (no stall placed flush against an exclusion zone edge) is intentional.
    expect(result.stalls).toHaveLength(21);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/geometry/rowPacking.test.ts`
Expected: FAIL — `Cannot find module './rowPacking'`

- [ ] **Step 3: Implémenter `packRows`**

```typescript
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
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/geometry/rowPacking.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/rowPacking.ts src/geometry/rowPacking.test.ts
git commit -m "feat: implement row-packing generator for a single configuration"
```

---

### Task 6: Support des angles 45°/60°

**Files:**
- Modify: `src/geometry/rowPacking.test.ts`

- [ ] **Step 1: Ajouter un test pour l'angle 60° (le code de Task 5 est déjà générique en `params.angleDeg`, ce test valide la formule trigonométrique)**

```typescript
// à ajouter dans src/geometry/rowPacking.test.ts
import { DEFAULT_SOLVER_PARAMS } from './types'; // déjà importé plus haut, ne pas dupliquer l'import

it('packs stalls at a 60° angle with correct footprint', () => {
  const params = { ...DEFAULT_SOLVER_PARAMS, angleDeg: 60 as const };
  const result = packRows(rectangle, [], params, 0, 'single');
  const stallAngleRad = (60 * Math.PI) / 180;
  const expectedWidthAlongRow = 2.5 / Math.sin(stallAngleRad); // ≈ 2.887
  const expectedDepth = 5 * Math.sin(stallAngleRad) + 2.5 * Math.cos(stallAngleRad); // ≈ 5.58
  const expectedStallsPerRow = Math.floor(30 / expectedWidthAlongRow);
  const expectedModuleDepth = expectedDepth + params.aisleWidthSingleLoaded;
  const expectedRows = Math.floor(20 / expectedModuleDepth);
  expect(result.stalls).toHaveLength(expectedStallsPerRow * expectedRows);
});
```

- [ ] **Step 2: Lancer le test pour vérifier le succès (aucun changement de code attendu)**

Run: `npx vitest run src/geometry/rowPacking.test.ts`
Expected: PASS (4 tests) — si échec, vérifier que la formule attendue dans le test correspond exactement à celle implémentée dans `rowPacking.ts`

- [ ] **Step 3: Commit**

```bash
git add src/geometry/rowPacking.test.ts
git commit -m "test: validate 60° angled stall geometry"
```

---

### Task 7: Attribution des places PMR

**Files:**
- Create: `src/geometry/pmrAssignment.ts`
- Test: `src/geometry/pmrAssignment.test.ts`

Décision documentée : en V1, une place PMR conserve le même gabarit géométrique que la place standard qu'elle remplace (elle est simplement retaguée `isPmr = true` et exportée sur son propre calque DXF). Redimensionner réellement la place PMR nécessiterait de relancer le row-packing avec une largeur mixte, ce qui est hors périmètre V1 (noté dans le backlog V2 en fin de plan).

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/geometry/pmrAssignment.test.ts
import { describe, it, expect } from 'vitest';
import { assignPmrStalls } from './pmrAssignment';
import { Stall } from './types';
import { Point } from './projection';

function makeStall(id: string, center: Point): Stall {
  return {
    id,
    corners: [
      { x: center.x - 1, y: center.y - 1 },
      { x: center.x + 1, y: center.y - 1 },
      { x: center.x + 1, y: center.y + 1 },
      { x: center.x - 1, y: center.y + 1 },
    ],
    isPmr: false,
  };
}

describe('assignPmrStalls', () => {
  it('marks the N stalls closest to an access point as PMR', () => {
    const stalls = [
      makeStall('far', { x: 100, y: 100 }),
      makeStall('near', { x: 1, y: 1 }),
      makeStall('mid', { x: 20, y: 20 }),
    ];
    const accessPoints: Point[] = [{ x: 0, y: 0 }];

    const result = assignPmrStalls(stalls, accessPoints, 1);

    const pmrIds = result.filter((s) => s.isPmr).map((s) => s.id);
    expect(pmrIds).toEqual(['near']);
  });

  it('does not exceed the number of available stalls', () => {
    const stalls = [makeStall('only', { x: 0, y: 0 })];
    const result = assignPmrStalls(stalls, [{ x: 0, y: 0 }], 5);
    expect(result.filter((s) => s.isPmr)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/geometry/pmrAssignment.test.ts`
Expected: FAIL — `Cannot find module './pmrAssignment'`

- [ ] **Step 3: Implémenter `assignPmrStalls`**

```typescript
// src/geometry/pmrAssignment.ts
import { Point } from './projection';
import { Stall } from './types';

function stallCenter(stall: Stall): Point {
  const sum = stall.corners.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / stall.corners.length, y: sum.y / stall.corners.length };
}

function distanceToNearestAccessPoint(point: Point, accessPoints: Point[]): number {
  return Math.min(...accessPoints.map((a) => Math.hypot(a.x - point.x, a.y - point.y)));
}

export function assignPmrStalls(stalls: Stall[], accessPoints: Point[], requiredCount: number): Stall[] {
  if (accessPoints.length === 0 || requiredCount <= 0) {
    return stalls;
  }

  const sorted = [...stalls].sort(
    (a, b) => distanceToNearestAccessPoint(stallCenter(a), accessPoints) - distanceToNearestAccessPoint(stallCenter(b), accessPoints)
  );

  const pmrIds = new Set(sorted.slice(0, requiredCount).map((s) => s.id));

  return stalls.map((s) => (pmrIds.has(s.id) ? { ...s, isPmr: true } : s));
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/geometry/pmrAssignment.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/pmrAssignment.ts src/geometry/pmrAssignment.test.ts
git commit -m "feat: assign PMR stalls closest to access points"
```

---

### Task 8: Raccordement des voies aux points d'accès

**Files:**
- Create: `src/geometry/accessConnectivity.ts`
- Test: `src/geometry/accessConnectivity.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/geometry/accessConnectivity.test.ts
import { describe, it, expect } from 'vitest';
import { connectAislesToAccessPoints } from './accessConnectivity';
import { AisleBand } from './types';

describe('connectAislesToAccessPoints', () => {
  it('extends the nearest aisle endpoint to reach the access point', () => {
    const aisles: AisleBand[] = [
      { centerline: [{ x: 0, y: 5 }, { x: 30, y: 5 }], width: 5 },
    ];
    const accessPoints = [{ x: -3, y: 5 }];

    const result = connectAislesToAccessPoints(aisles, accessPoints);

    expect(result[0].centerline[0]).toEqual({ x: -3, y: 5 });
    expect(result[0].centerline[1]).toEqual({ x: 30, y: 5 });
  });

  it('leaves aisles unchanged when there are no access points', () => {
    const aisles: AisleBand[] = [{ centerline: [{ x: 0, y: 5 }, { x: 30, y: 5 }], width: 5 }];
    const result = connectAislesToAccessPoints(aisles, []);
    expect(result).toEqual(aisles);
  });

  it('connects every access point even when multiple aisles compete for the same nearest one', () => {
    const aisles: AisleBand[] = [
      { centerline: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 5 },
      { centerline: [{ x: 0, y: 2 }, { x: 100, y: 2 }], width: 5 },
    ];
    // access0 is equidistant (distance 1) from both aisles' start points, so a
    // per-aisle algorithm would have BOTH aisles snap to access0, leaving access1
    // unconnected. The per-access-point algorithm must still connect access1.
    const accessPoints = [
      { x: 0, y: 1 },
      { x: 50, y: 50 },
    ];

    const result = connectAislesToAccessPoints(aisles, accessPoints);

    expect(result[0].centerline[0]).toEqual({ x: 0, y: 1 });
    expect(result[0].centerline[1]).toEqual({ x: 100, y: 0 });
    expect(result[1].centerline[0]).toEqual({ x: 50, y: 50 });
    expect(result[1].centerline[1]).toEqual({ x: 100, y: 2 });
  });

  it('does not let a later access point steal an endpoint already claimed by an earlier one', () => {
    const aisles: AisleBand[] = [{ centerline: [{ x: 0, y: 0 }, { x: 1, y: 0 }], width: 5 }];
    const accessPoints = [
      { x: 0, y: 5 },
      { x: 0, y: 5.001 },
    ];

    const result = connectAislesToAccessPoints(aisles, accessPoints);

    const endpoints = result[0].centerline;
    expect(endpoints).toContainEqual({ x: 0, y: 5 });
    expect(endpoints).toContainEqual({ x: 0, y: 5.001 });
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/geometry/accessConnectivity.test.ts`
Expected: FAIL — `Cannot find module './accessConnectivity'`

- [ ] **Step 3: Implémenter `connectAislesToAccessPoints`**

Décision documentée (révisée après revue de code) : une première version itérait par voie (chaque voie choisit son point d'accès le plus proche), ce qui pouvait laisser des points d'accès orphelins si plusieurs voies convergeaient vers le même point d'accès le plus proche. La version ci-dessous itère par point d'accès à la place, garantissant que chaque point d'accès soit raccordé à l'extrémité de voie la plus proche disponible. Limite V1 restante et acceptée : si un point d'accès n'est pas aligné avec l'axe de la voie qu'il rejoint, le segment obtenu n'est plus parfaitement rectiligne (le déplacement de l'extrémité crée un coude) — acceptable pour l'export DXF en V1 (tracé comme simple polyligne), à revoir si une vraie géométrie de raccordement est nécessaire plus tard (backlog V2).

```typescript
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
```

Limite V1 acceptée et documentée : s'il y a plus de points d'accès que d'extrémités de voie disponibles (`accessPoints.length > 2 * aisles.length`), les points d'accès excédentaires ne sont raccordés à rien — il n'existe physiquement plus d'extrémité libre à leur attribuer. Ce n'est pas un bug mais une limite structurelle du réseau de voies généré.

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/geometry/accessConnectivity.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/accessConnectivity.ts src/geometry/accessConnectivity.test.ts
git commit -m "feat: extend nearest aisle to reach each access point"
```

---

### Task 9: Balayage multi-configurations et classement

**Files:**
- Create: `src/geometry/solver.ts`
- Test: `src/geometry/solver.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/geometry/solver.test.ts
import { describe, it, expect } from 'vitest';
import { solveParkingConfigurations } from './solver';
import { DEFAULT_SOLVER_PARAMS, Ring } from './types';

const rectangle: Ring = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 20 },
  { x: 0, y: 20 },
];

describe('solveParkingConfigurations', () => {
  it('returns configurations sorted by total stall count descending', () => {
    const configs = solveParkingConfigurations({
      boundary: rectangle,
      exclusions: [],
      accessPoints: [{ x: 0, y: 5 }],
      baseParams: DEFAULT_SOLVER_PARAMS,
    });

    expect(configs.length).toBeGreaterThan(0);
    for (let i = 1; i < configs.length; i++) {
      expect(configs[i - 1].totalCount).toBeGreaterThanOrEqual(configs[i].totalCount);
    }
  });

  it('applies the PMR ratio to the best configuration', () => {
    const configs = solveParkingConfigurations({
      boundary: rectangle,
      exclusions: [],
      accessPoints: [{ x: 0, y: 5 }],
      baseParams: DEFAULT_SOLVER_PARAMS,
    });

    const best = configs[0];
    const expectedPmr = DEFAULT_SOLVER_PARAMS.pmrRatio(best.standardCount + best.pmrCount);
    expect(best.pmrCount).toBe(expectedPmr);
    expect(best.totalCount).toBe(best.standardCount + best.pmrCount);
  });

  it('returns an empty array when the boundary is too small to fit any stall', () => {
    const tinyBoundary: Ring = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const configs = solveParkingConfigurations({
      boundary: tinyBoundary,
      exclusions: [],
      accessPoints: [],
      baseParams: DEFAULT_SOLVER_PARAMS,
    });
    expect(configs).toEqual([]);
  });

  it('returns an empty array when an exclusion zone covers the entire boundary', () => {
    const fullExclusion: Ring = [...rectangle];
    const configs = solveParkingConfigurations({
      boundary: rectangle,
      exclusions: [fullExclusion],
      accessPoints: [],
      baseParams: DEFAULT_SOLVER_PARAMS,
    });
    expect(configs).toEqual([]);
  });

  it('records plausible angleDeg/loadType/rowDirectionDeg fields on every returned config', () => {
    const configs = solveParkingConfigurations({
      boundary: rectangle,
      exclusions: [],
      accessPoints: [{ x: 0, y: 5 }],
      baseParams: DEFAULT_SOLVER_PARAMS,
    });
    for (const config of configs) {
      expect([90, 60, 45]).toContain(config.angleDeg);
      expect(['single', 'double']).toContain(config.loadType);
      expect(typeof config.rowDirectionDeg).toBe('number');
    }
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/geometry/solver.test.ts`
Expected: FAIL — `Cannot find module './solver'`

- [ ] **Step 3: Implémenter `solveParkingConfigurations`**

```typescript
// src/geometry/solver.ts
import { Point } from './projection';
import { assignPmrStalls } from './pmrAssignment';
import { connectAislesToAccessPoints } from './accessConnectivity';
import { packRows } from './rowPacking';
import { ParkingConfig, Ring, SolverParams } from './types';

export interface SolveInput {
  boundary: Ring;
  exclusions: Ring[];
  accessPoints: Point[];
  baseParams: SolverParams;
}

function boundaryRowDirections(boundary: Ring): number[] {
  let longestEdgeAngleDeg = 0;
  let longestLength = 0;

  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > longestLength) {
      longestLength = length;
      longestEdgeAngleDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
  }

  return [longestEdgeAngleDeg, longestEdgeAngleDeg + 90];
}

export function solveParkingConfigurations(input: SolveInput): ParkingConfig[] {
  const { boundary, exclusions, accessPoints, baseParams } = input;
  const rowDirections = boundaryRowDirections(boundary);
  const angles: Array<90 | 60 | 45> = [90, 60, 45];
  const loadTypes: Array<'single' | 'double'> = ['single', 'double'];

  const configs: ParkingConfig[] = [];

  for (const rowDirectionDeg of rowDirections) {
    for (const angleDeg of angles) {
      for (const loadType of loadTypes) {
        const params = { ...baseParams, angleDeg };
        const { stalls, aisles } = packRows(boundary, exclusions, params, rowDirectionDeg, loadType);

        if (stalls.length === 0) {
          continue;
        }

        const requiredPmr = baseParams.pmrRatio(stalls.length);
        const withPmr = assignPmrStalls(stalls, accessPoints, requiredPmr);
        const connectedAisles = connectAislesToAccessPoints(aisles, accessPoints);

        const pmrCount = withPmr.filter((s) => s.isPmr).length;
        const standardCount = withPmr.length - pmrCount;

        configs.push({
          angleDeg,
          loadType,
          rowDirectionDeg,
          stalls: withPmr,
          aisles: connectedAisles,
          standardCount,
          pmrCount,
          totalCount: withPmr.length,
        });
      }
    }
  }

  return configs.sort((a, b) => b.totalCount - a.totalCount);
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/geometry/solver.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/solver.ts src/geometry/solver.test.ts
git commit -m "feat: sweep multiple parking configurations and rank by stall count"
```

---

### Task 10: Export/import JSON du projet

**Files:**
- Create: `src/store/projectFile.ts`
- Test: `src/store/projectFile.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/store/projectFile.test.ts
import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject, ProjectData } from './projectFile';
import { DEFAULT_SOLVER_PARAMS } from '../geometry/types';

const sampleProject: ProjectData = {
  boundary: [{ lat: 43.6, lng: 3.88 }, { lat: 43.601, lng: 3.88 }, { lat: 43.601, lng: 3.882 }],
  exclusions: [],
  accessPoints: [{ lat: 43.6, lng: 3.881 }],
  params: DEFAULT_SOLVER_PARAMS,
};

describe('projectFile', () => {
  it('round-trips a project through JSON serialization', () => {
    const json = serializeProject(sampleProject);
    const parsed = deserializeProject(json);
    expect(parsed.boundary).toEqual(sampleProject.boundary);
    expect(parsed.accessPoints).toEqual(sampleProject.accessPoints);
    expect(parsed.params.standardStallWidth).toBe(DEFAULT_SOLVER_PARAMS.standardStallWidth);
  });

  it('throws a clear error on invalid JSON', () => {
    expect(() => deserializeProject('not json')).toThrow();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/store/projectFile.test.ts`
Expected: FAIL — `Cannot find module './projectFile'`

- [ ] **Step 3: Implémenter `serializeProject`/`deserializeProject`**

Note : `pmrRatio` est une fonction, non sérialisable en JSON. On sérialise les paramètres numériques et on ré-attache la fonction par défaut au chargement (V1 ne permet pas encore de personnaliser la formule du ratio PMR, seulement les dimensions/angles/voies — cohérent avec la spec qui ne demande la personnalisation que des dimensions).

```typescript
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
```

**Correction post-revue de code (2e passe) :** la validation ne vérifiait que `standardStallWidth`, laissant passer un fichier avec les 6 autres champs numériques de `params` (ou `angleDeg`) manquants/invalides — exactement la même catégorie de bug que la correction visait à éliminer, juste déplacée sur un champ frère. La version ci-dessus vérifie tous les champs numériques requis et la valeur autorisée de `angleDeg`.

Ajouter ce test supplémentaire dans `src/store/projectFile.test.ts` :

```typescript
  it('throws a clear error when a required params field is missing', () => {
    const { angleDeg: _angleDeg, ...paramsWithoutAngle } = DEFAULT_SOLVER_PARAMS;
    expect(() =>
      deserializeProject(JSON.stringify({ boundary: [], exclusions: [], accessPoints: [], params: paramsWithoutAngle }))
    ).toThrow();
  });
```

**Correction post-revue de code (1re passe) :** la toute première version ne validait rien après `JSON.parse` — un fichier JSON syntaxiquement valide mais de forme incorrecte (`"{}"`, `params` manquant, `boundary` qui n'est pas un tableau...) passait le cast TypeScript `as SerializedProject` sans erreur et produisait un `ProjectData` cassé, qui aurait planté plus tard, loin du point d'import, dans un endroit difficile à diagnostiquer (rendu carte, solveur...). La version ci-dessus valide la forme minimale et lève une erreur claire et immédiate si le fichier est invalide.

Ajouter ces deux tests supplémentaires dans `src/store/projectFile.test.ts` (après le test existant `'throws a clear error on invalid JSON'`) :

```typescript
  it('throws a clear error when the JSON is well-formed but has the wrong shape (empty object)', () => {
    expect(() => deserializeProject('{}')).toThrow();
  });

  it('throws a clear error when boundary is not an array', () => {
    expect(() => deserializeProject(JSON.stringify({ boundary: 'not an array', exclusions: [], accessPoints: [], params: DEFAULT_SOLVER_PARAMS }))).toThrow();
  });
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/store/projectFile.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/store/projectFile.ts src/store/projectFile.test.ts
git commit -m "feat: add JSON export/import for project data"
```

---

### Task 11: État global du projet (Zustand)

**Files:**
- Create: `src/store/projectStore.ts`

- [ ] **Step 1: Implémenter le store (pas de test dédié — état UI simple, couvert par le test manuel de Task 15)**

```typescript
// src/store/projectStore.ts
import { create } from 'zustand';
import { LatLng } from '../geometry/projection';
import { DEFAULT_SOLVER_PARAMS, ParkingConfig, SolverParams } from '../geometry/types';

interface ProjectState {
  boundary: LatLng[];
  exclusions: LatLng[][];
  accessPoints: LatLng[];
  params: SolverParams;
  configs: ParkingConfig[];
  selectedConfigIndex: number;

  setBoundary: (boundary: LatLng[]) => void;
  addExclusion: (exclusion: LatLng[]) => void;
  addAccessPoint: (point: LatLng) => void;
  setParams: (params: Partial<SolverParams>) => void;
  setConfigs: (configs: ParkingConfig[]) => void;
  selectConfig: (index: number) => void;
  loadProject: (data: { boundary: LatLng[]; exclusions: LatLng[][]; accessPoints: LatLng[]; params: SolverParams }) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  boundary: [],
  exclusions: [],
  accessPoints: [],
  params: DEFAULT_SOLVER_PARAMS,
  configs: [],
  selectedConfigIndex: 0,

  setBoundary: (boundary) => set({ boundary }),
  addExclusion: (exclusion) => set((state) => ({ exclusions: [...state.exclusions, exclusion] })),
  addAccessPoint: (point) => set((state) => ({ accessPoints: [...state.accessPoints, point] })),
  setParams: (params) => set((state) => ({ params: { ...state.params, ...params } })),
  setConfigs: (configs) => set({ configs, selectedConfigIndex: 0 }),
  selectConfig: (index) => set({ selectedConfigIndex: index }),
  loadProject: (data) => set({ ...data, configs: [], selectedConfigIndex: 0 }),
}));
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 3: Commit**

```bash
git add src/store/projectStore.ts
git commit -m "feat: add Zustand project store"
```

---

### Task 12: Export DXF calqué

**Files:**
- Create: `src/export/dxfExporter.ts`
- Test: `src/export/dxfExporter.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/export/dxfExporter.test.ts
import { describe, it, expect } from 'vitest';
import { exportConfigToDxf } from './dxfExporter';
import { ParkingConfig } from '../geometry/types';

const sampleConfig: ParkingConfig = {
  angleDeg: 90,
  loadType: 'single',
  rowDirectionDeg: 0,
  stalls: [
    {
      id: 's1',
      corners: [{ x: 0, y: 0 }, { x: 2.5, y: 0 }, { x: 2.5, y: 5 }, { x: 0, y: 5 }],
      isPmr: false,
    },
    {
      id: 's2',
      corners: [{ x: 2.5, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 2.5, y: 5 }],
      isPmr: true,
    },
  ],
  aisles: [{ centerline: [{ x: 0, y: 5 }, { x: 30, y: 5 }], width: 5 }],
  standardCount: 1,
  pmrCount: 1,
  totalCount: 2,
};

const boundary = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }];
const exclusions: { x: number; y: number }[][] = [];

describe('exportConfigToDxf', () => {
  it('produces a DXF string with the expected layers', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    expect(dxf).toContain('CONTOUR');
    expect(dxf).toContain('PLACES');
    expect(dxf).toContain('PLACES_PMR');
    expect(dxf).toContain('VOIES');
  });

  it('includes one polyline entity per stall and per aisle', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    const polylineCount = (dxf.match(/LWPOLYLINE/g) || []).length;
    // 1 contour + 2 stalls + 1 aisle = 4 LWPOLYLINE entities
    expect(polylineCount).toBe(4);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/export/dxfExporter.test.ts`
Expected: FAIL — `Cannot find module './dxfExporter'`

- [ ] **Step 3: Implémenter `exportConfigToDxf`**

```typescript
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
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/export/dxfExporter.test.ts`
Expected: PASS (2 tests) — si `dxf-writer` n'expose pas exactement cette API (`addLayer`, `setActiveLayer`, `drawPolyline`, `Drawing.ACI`, `toDxfString`), consulter `node_modules/dxf-writer/README.md` et adapter les noms de méthodes en conséquence ; la structure des calques (CONTOUR, EXCLUSIONS, PLACES, PLACES_PMR, VOIES) doit être conservée telle quelle.

**Correction post-revue de code :** le fichier DXF généré ne déclare aucune unité (`INSUNITS` reste "Unitless" par défaut dans `dxf-writer`), alors que les coordonnées de l'app sont en mètres — un fichier sans unité déclarée peut être mal interprété/mis à l'échelle une fois réouvert dans AutoCAD. Inspecter `node_modules/dxf-writer` (README et/ou code source) pour trouver la méthode permettant de déclarer les unités en mètres (ex. `d.setUnits(...)`, potentiellement avec une constante `Drawing.UNITS.Meters` ou équivalent — le nom exact dépend de l'API réelle de la librairie, à vérifier plutôt qu'à deviner), et l'appeler juste après `new Drawing()`. Ajouter un test qui vérifie que le DXF produit contient bien la déclaration d'unité attendue (chercher la valeur `$INSUNITS` correspondant aux mètres dans la sortie, ou toute autre preuve textuelle appropriée selon ce que la librairie génère réellement).

Ajouter aussi ces deux tests manquants à `src/export/dxfExporter.test.ts` :
1. Un test avec une zone d'exclusion non vide, vérifiant que son tracé apparaît bien dans le DXF sur le calque `EXCLUSIONS` (actuellement seul le cas `exclusions: []` est testé).
2. Un test vérifiant que la place standard (`s1`, `isPmr: false`) est bien dessinée sur le calque `PLACES` et la place PMR (`s2`, `isPmr: true`) bien sur `PLACES_PMR` — pas seulement que les deux noms de calque apparaissent quelque part dans le fichier (ce que le test actuel prouve), mais que chaque entité est bien rattachée au bon calque. Inspecter la sortie réelle de `d.toDxfString()` pour connaître le format exact du code de groupe DXF 8 (nom du calque d'une entité) et écrire une assertion fiable sur cette base plutôt que de deviner le format.

- [ ] **Step 5: Commit**

```bash
git add src/export/dxfExporter.ts src/export/dxfExporter.test.ts
git commit -m "feat: export parking configuration to layered DXF"
```

---

### Task 13: Composant carte (MapView)

**Files:**
- Create: `src/components/MapView.tsx`
- Modify: `src/store/projectStore.ts`

**Révision post-Task 11 :** la revue de code de Task 11 a signalé que le store n'avait que des actions d'ajout (`addExclusion`/`addAccessPoint`), sans suppression — un vrai problème puisque Leaflet.Draw expose un outil d'édition/suppression (`edit: { featureGroup: drawnItems }`) qui, sans setters adaptés, laisserait le contenu de la carte diverger silencieusement de l'état de l'app. Solution retenue : remplacer les actions d'ajout par des setters complets (`setExclusions`/`setAccessPoints`), et reconstruire l'état entier à partir des calques Leaflet présents sur la carte après chaque événement CREATED/EDITED/DELETED — plus robuste qu'un suivi d'index individuel qui deviendrait invalide après une suppression.

- [ ] **Step 1 : modifier `src/store/projectStore.ts`**

Dans l'interface `ProjectState`, remplacer :
```typescript
addExclusion: (exclusion: LatLng[]) => void;
addAccessPoint: (point: LatLng) => void;
```
par :
```typescript
setExclusions: (exclusions: LatLng[][]) => void;
setAccessPoints: (points: LatLng[]) => void;
```

Dans l'objet passé à `create<ProjectState>((set) => ({...}))`, remplacer :
```typescript
addExclusion: (exclusion) => set((state) => ({ exclusions: [...state.exclusions, exclusion] })),
addAccessPoint: (point) => set((state) => ({ accessPoints: [...state.accessPoints, point] })),
```
par :
```typescript
setExclusions: (exclusions) => set({ exclusions }),
setAccessPoints: (points) => set({ accessPoints: points }),
```

Le reste du fichier (état `boundary`/`params`/`configs`/`selectedConfigIndex`, `setBoundary`, `setParams`, `setConfigs`, `selectConfig`, `loadProject`) reste inchangé.

- [ ] **Step 2: Implémenter le composant carte**

```typescript
// src/components/MapView.tsx
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { useProjectStore } from '../store/projectStore';

const COORDS_REGEX = /^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/;

async function searchAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const coordsMatch = query.match(COORDS_REGEX);
  if (coordsMatch) {
    return { lat: parseFloat(coordsMatch[1]), lng: parseFloat(coordsMatch[3]) };
  }

  const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`);
  if (!response.ok) {
    throw new Error(`Adresse : requête échouée (${response.status})`);
  }
  const data = await response.json();
  const feature = data.features?.[0];
  if (!feature) {
    return null;
  }
  const [lng, lat] = feature.geometry.coordinates;
  return { lat, lng };
}

function SearchBar() {
  const map = useMap();
  const [query, setQuery] = useState('');

  const handleSearch = async () => {
    try {
      const result = await searchAddress(query);
      if (result) {
        map.setView([result.lat, result.lng], 19);
      } else {
        alert("Adresse ou coordonnées introuvables.");
      }
    } catch {
      alert("Erreur lors de la recherche — vérifie ta connexion et réessaie.");
    }
  };

  return (
    <div className="search-bar">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Adresse ou coordonnées (lat, lng)"
        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
      />
      <button onClick={handleSearch}>Rechercher</button>
    </div>
  );
}

function DrawingLayer() {
  const map = useMap();
  const setBoundary = useProjectStore((s) => s.setBoundary);
  const setExclusions = useProjectStore((s) => s.setExclusions);
  const setAccessPoints = useProjectStore((s) => s.setAccessPoints);

  useEffect(() => {
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new (L as any).Control.Draw({
      draw: {
        polygon: true,
        marker: true,
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
      },
      edit: { featureGroup: drawnItems },
    });
    map.addControl(drawControl);

    // Après toute création/édition/suppression, on reconstruit l'état complet à partir
    // des calques actuellement présents sur la carte (source de vérité), plutôt que de
    // suivre des index individuels qui deviendraient invalides après une suppression.
    function syncStoreFromLayers() {
      const polygonRings: L.LatLng[][] = [];
      const accessPoints: L.LatLng[] = [];

      drawnItems.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          accessPoints.push(layer.getLatLng());
        } else if (layer instanceof L.Polygon) {
          polygonRings.push((layer.getLatLngs()[0] as L.LatLng[]).slice());
        }
      });

      // TypeScript ne peut pas suivre la réassignation d'un `let` externe depuis
      // l'intérieur de la closure `eachLayer` (narrowing en `never` à la lecture),
      // donc on collecte d'abord tous les polygones dans un tableau puis on
      // destructure : premier polygone = contour, le reste = exclusions.
      const [boundary, ...exclusionRings] = polygonRings;

      setBoundary((boundary ?? []).map((p) => ({ lat: p.lat, lng: p.lng })));
      setExclusions(exclusionRings.map((ring) => ring.map((p) => ({ lat: p.lat, lng: p.lng }))));
      setAccessPoints(accessPoints.map((p) => ({ lat: p.lat, lng: p.lng })));
    }

    function handleCreated(event: any) {
      drawnItems.addLayer(event.layer);
      syncStoreFromLayers();
    }

    map.on((L as any).Draw.Event.CREATED, handleCreated);
    map.on((L as any).Draw.Event.EDITED, syncStoreFromLayers);
    map.on((L as any).Draw.Event.DELETED, syncStoreFromLayers);

    return () => {
      map.off((L as any).Draw.Event.CREATED, handleCreated);
      map.off((L as any).Draw.Event.EDITED, syncStoreFromLayers);
      map.off((L as any).Draw.Event.DELETED, syncStoreFromLayers);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, setBoundary, setExclusions, setAccessPoints]);

  return null;
}

export function MapView() {
  return (
    <MapContainer center={[46.6, 2.5]} zoom={6} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri"
      />
      <SearchBar />
      <DrawingLayer />
    </MapContainer>
  );
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit` puis `npm run build` (le build `tsc -b` fait référence, plus strict)
Expected: aucune erreur (si `leaflet-draw` ne fournit pas de types complets, ajouter un fichier `src/types/leaflet-draw.d.ts` avec `declare module 'leaflet-draw';`)

- [ ] **Step 4: Test manuel**

Run: `npm run dev`
1. Ouvrir l'app dans le navigateur, taper une adresse française dans la barre de recherche → vérifier que la carte se centre dessus.
2. Coller `43.618397290396885, 3.889741475881279` dans la barre de recherche → vérifier que la carte se centre sur ce point.
3. Utiliser l'outil polygone pour tracer un contour → vérifier qu'il apparaît sur la carte.
4. Tracer un deuxième polygone → vérifier qu'il est traité comme zone d'exclusion (pas comme nouveau contour).
5. Poser un marqueur → vérifier qu'il est enregistré comme point d'accès.
6. Utiliser l'outil d'édition Leaflet.Draw pour supprimer une zone d'exclusion ou un point d'accès → vérifier que l'état de l'app (visible dans Task 15 via le panneau résultats/état) reflète bien la suppression.

- [ ] **Step 5: Commit**

```bash
git add src/components/MapView.tsx src/store/projectStore.ts
git add src/types/leaflet-draw.d.ts 2>/dev/null || true
git commit -m "feat: add map view with address/coordinate search and drawing tools"
```

---

### Task 14: Panneaux de paramètres et de résultats

**Files:**
- Create: `src/components/ParamsPanel.tsx`
- Create: `src/components/ResultsPanel.tsx`

- [ ] **Step 1: Implémenter `ParamsPanel`**

```typescript
// src/components/ParamsPanel.tsx
import { useProjectStore } from '../store/projectStore';

export function ParamsPanel() {
  const params = useProjectStore((s) => s.params);
  const setParams = useProjectStore((s) => s.setParams);

  return (
    <div className="params-panel">
      <h3>Paramètres</h3>
      <label>
        Largeur place standard (m)
        <input
          type="number"
          step="0.1"
          value={params.standardStallWidth}
          onChange={(e) => setParams({ standardStallWidth: parseFloat(e.target.value) })}
        />
      </label>
      <label>
        Longueur place standard (m)
        <input
          type="number"
          step="0.1"
          value={params.standardStallLength}
          onChange={(e) => setParams({ standardStallLength: parseFloat(e.target.value) })}
        />
      </label>
      <label>
        Largeur place PMR (m)
        <input
          type="number"
          step="0.1"
          value={params.pmrStallWidth}
          onChange={(e) => setParams({ pmrStallWidth: parseFloat(e.target.value) })}
        />
      </label>
      <label>
        Largeur voie simple sens (m)
        <input
          type="number"
          step="0.1"
          value={params.aisleWidthSingleLoaded}
          onChange={(e) => setParams({ aisleWidthSingleLoaded: parseFloat(e.target.value) })}
        />
      </label>
      <label>
        Largeur voie double sens (m)
        <input
          type="number"
          step="0.1"
          value={params.aisleWidthDoubleLoaded}
          onChange={(e) => setParams({ aisleWidthDoubleLoaded: parseFloat(e.target.value) })}
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Implémenter `ResultsPanel`**

```typescript
// src/components/ResultsPanel.tsx
import { useProjectStore } from '../store/projectStore';

export function ResultsPanel() {
  const configs = useProjectStore((s) => s.configs);
  const selectedConfigIndex = useProjectStore((s) => s.selectedConfigIndex);
  const selectConfig = useProjectStore((s) => s.selectConfig);

  if (configs.length === 0) {
    return <div className="results-panel">Aucune configuration générée pour l'instant.</div>;
  }

  const selected = configs[selectedConfigIndex];

  return (
    <div className="results-panel">
      <h3>Résultats</h3>
      <p>
        {selected.totalCount} places ({selected.standardCount} standard + {selected.pmrCount} PMR) —{' '}
        {selected.angleDeg}° — voie {selected.loadType === 'double' ? 'double sens' : 'simple sens'}
      </p>
      <h4>Alternatives</h4>
      <ul>
        {configs.map((config, index) => (
          <li key={`${config.angleDeg}-${config.loadType}-${config.rowDirectionDeg}`}>
            <button onClick={() => selectConfig(index)} disabled={index === selectedConfigIndex}>
              {config.totalCount} places — {config.angleDeg}° — voie{' '}
              {config.loadType === 'double' ? 'double sens' : 'simple sens'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 4: Commit**

```bash
git add src/components/ParamsPanel.tsx src/components/ResultsPanel.tsx
git commit -m "feat: add params and results panels"
```

---

### Task 15: Assemblage de l'application (App.tsx)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Écrire `App.tsx` qui relie carte, paramètres, génération et export**

```typescript
// src/App.tsx
import { useMemo } from 'react';
import { polygon as turfPolygon, point as turfPoint } from '@turf/helpers';
import kinks from '@turf/kinks';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { MapView } from './components/MapView';
import { ParamsPanel } from './components/ParamsPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { useProjectStore } from './store/projectStore';
import { makeProjection } from './geometry/projection';
import { solveParkingConfigurations } from './geometry/solver';
import { exportConfigToDxf } from './export/dxfExporter';
import { deserializeProject, serializeProject } from './store/projectFile';
import './App.css';

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const boundary = useProjectStore((s) => s.boundary);
  const exclusions = useProjectStore((s) => s.exclusions);
  const accessPoints = useProjectStore((s) => s.accessPoints);
  const params = useProjectStore((s) => s.params);
  const configs = useProjectStore((s) => s.configs);
  const selectedConfigIndex = useProjectStore((s) => s.selectedConfigIndex);
  const setConfigs = useProjectStore((s) => s.setConfigs);
  const loadProject = useProjectStore((s) => s.loadProject);

  const projection = useMemo(() => {
    if (boundary.length === 0) return null;
    return makeProjection(boundary[0]);
  }, [boundary]);

  const handleGenerate = () => {
    if (!projection || boundary.length < 3) {
      alert('Trace un contour de terrain avant de générer un plan.');
      return;
    }

    const ring = [...boundary, boundary[0]].map((p) => [p.lng, p.lat]);
    const kinksResult = kinks(turfPolygon([ring]));
    if (kinksResult.features.length > 0) {
      alert('Le contour tracé se croise lui-même — corrige le tracé avant de générer un plan.');
      return;
    }

    const boundaryPolygon = turfPolygon([ring]);
    const outsideAccessPoints = accessPoints.filter(
      (p) => !booleanPointInPolygon(turfPoint([p.lng, p.lat]), boundaryPolygon)
    );
    if (outsideAccessPoints.length > 0) {
      alert(`${outsideAccessPoints.length} point(s) d'accès sont en dehors du contour tracé — déplace-les sur le contour avant de générer un plan.`);
      return;
    }

    const localBoundary = boundary.map((p) => projection.toLocal(p));
    const localExclusions = exclusions.map((ring) => ring.map((p) => projection.toLocal(p)));
    const localAccessPoints = accessPoints.map((p) => projection.toLocal(p));

    const results = solveParkingConfigurations({
      boundary: localBoundary,
      exclusions: localExclusions,
      accessPoints: localAccessPoints,
      baseParams: params,
    });

    if (results.length === 0) {
      alert("Aucune configuration valide n'a pu être générée sur ce terrain.");
      return;
    }

    setConfigs(results);
  };

  const handleExportDxf = () => {
    if (!projection || configs.length === 0) return;
    const localBoundary = boundary.map((p) => projection.toLocal(p));
    const localExclusions = exclusions.map((ring) => ring.map((p) => projection.toLocal(p)));
    const dxf = exportConfigToDxf(configs[selectedConfigIndex], localBoundary, localExclusions);
    downloadFile('plan-parking.dxf', dxf, 'application/dxf');
  };

  const handleExportProject = () => {
    const json = serializeProject({ boundary, exclusions, accessPoints, params });
    downloadFile('projet-parking.json', json, 'application/json');
  };

  const handleImportProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = deserializeProject(reader.result as string);
      loadProject(data);
    };
    reader.readAsText(file);
  };

  return (
    <div className="app-layout">
      <div className="map-container">
        <MapView />
      </div>
      <div className="side-panel">
        <ParamsPanel />
        <div className="actions">
          <button onClick={handleGenerate}>Générer le plan</button>
          <button onClick={handleExportDxf} disabled={configs.length === 0}>
            Exporter en DXF
          </button>
          <button onClick={handleExportProject}>Sauvegarder le projet</button>
          <label className="import-button">
            Charger un projet
            <input
              type="file"
              accept="application/json"
              onChange={(e) => e.target.files && handleImportProject(e.target.files[0])}
            />
          </label>
        </div>
        <ResultsPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ajouter le layout CSS minimal**

```css
/* src/App.css */
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
}

.map-container {
  flex: 1;
}

.side-panel {
  width: 320px;
  padding: 1rem;
  overflow-y: auto;
  border-left: 1px solid #ccc;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 1rem 0;
}

.import-button {
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.import-button input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
```

- [ ] **Step 3: Test manuel de bout en bout**

Run: `npm run dev`
1. Rechercher une adresse réelle d'un parking Phenix Solar (ou coller des coordonnées).
2. Tracer le contour du terrain.
3. Tracer une zone d'exclusion et poser un point d'accès.
4. Ajuster un paramètre (ex. largeur de voie) dans le panneau.
5. Cliquer "Générer le plan" → vérifier qu'une configuration s'affiche avec un nombre de places cohérent, et que les alternatives sont sélectionnables.
6. Cliquer "Exporter en DXF" → ouvrir le fichier téléchargé dans AutoCAD (ou un visualiseur DXF) et vérifier les calques CONTOUR/PLACES/PLACES_PMR/VOIES.
7. Cliquer "Sauvegarder le projet" → vérifier le téléchargement du JSON, puis "Charger un projet" avec ce même fichier → vérifier que le contour et les paramètres sont restaurés.
8. Tracer volontairement un contour en croix (auto-intersectant) et cliquer "Générer le plan" → vérifier le message d'erreur bloquant plutôt qu'un plan vide.
9. Poser un point d'accès en dehors du contour et cliquer "Générer le plan" → vérifier le message d'erreur demandant de le repositionner.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/App.css
git commit -m "feat: wire up map, params, generation and export into the app"
```

---

### Task 16: Déploiement gratuit (GitHub Pages)

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `vite.config.ts`

- [ ] **Step 1: Configurer le `base` Vite pour GitHub Pages**

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/outil-dessin-parkings/', // à adapter au nom du dépôt GitHub une fois créé
});
```

- [ ] **Step 2: Ajouter le workflow de déploiement**

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Vérifier le build en local**

Run: `npm run build`
Expected: dossier `dist/` généré sans erreur

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml vite.config.ts
git commit -m "chore: add GitHub Pages deployment workflow"
```

- [ ] **Step 5: Note pour l'utilisateur (action manuelle hors plan)**

Une fois prêt à partager l'outil : créer un dépôt GitHub (public ou privé selon la politique Phenix Solar), pousser ce dépôt local dessus, puis activer GitHub Pages dans les paramètres du dépôt (Source = GitHub Actions). Aucune action de push n'est effectuée automatiquement par ce plan — confirmation explicite requise avant de publier quoi que ce soit en ligne.

---

## Backlog V2 (hors périmètre de ce plan)

- Remplacer Turf.js par Clipper2-WASM / straight-skeleton si des cas réels montrent des limites de précision géométrique.
- Redimensionnement réel des places PMR (au lieu du simple retag de gabarit standard).
- Solveur d'optimisation avancé (recherche combinatoire, algorithme génétique) en complément du balayage de configurations.
- Calcul de puissance PV installable et estimation de production à partir du plan généré.
