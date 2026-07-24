# Rendu réaliste des places/voies + corrections diverses — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le tracé des places façon marquage au sol réel (traits de séparation, pas de rectangles), des flèches de voie discrètes et blanches, un zoom carte plus poussé, un garde-fou sur les PMR sans point d'accès, et un panneau latéral repositionné sous la carte.

**Architecture:** Une nouvelle fonction géométrique pure (`stallDividerLines`) calcule les traits de séparation à partir de l'adjacency réelle des coins de places (aucune dépendance à l'ordre/l'id des places), réutilisée par l'aperçu carte et l'export DXF — même principe de partage que `aisleDirectionArrows` (V1.1 Task 1).

**Tech Stack:** React, react-leaflet, dxf-writer, Vitest.

---

## Note de référence

Spec complète : `docs/superpowers/specs/2026-07-23-rendu-realiste-et-corrections-design.md`

## Structure des fichiers

```
src/
  geometry/
    stallMarkings.ts          — nouveau : traits de séparation entre places (pur, testé)
    stallMarkings.test.ts     — nouveau
    aisleRendering.ts          — modifié : ratio de largeur de flèche 0.5 → 0.2
    aisleRendering.test.ts     — modifié : valeurs attendues mises à jour
  export/
    dxfExporter.ts             — modifié : PLACES en traits, VOIES/VOIES_SEPARATEUR en blanc
    dxfExporter.test.ts        — modifié
  components/
    PlanOverlay.tsx            — modifié : places en traits + PMR pleines, flèches blanches
    MapView.tsx                 — modifié : zoom max augmenté
  App.tsx                       — modifié : garde-fou PMR sans point d'accès
  App.css                       — modifié : panneau latéral sous la carte
```

---

### Task 1: Traits de séparation entre places

**Files:**
- Create: `src/geometry/stallMarkings.ts`
- Test: `src/geometry/stallMarkings.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/geometry/stallMarkings.test.ts
import { describe, it, expect } from 'vitest';
import { stallDividerLines } from './stallMarkings';
import { Stall } from './types';

function makeStall(id: string, xStart: number, xEnd: number, yStart: number, yEnd: number): Stall {
  return {
    id,
    corners: [
      { x: xStart, y: yStart },
      { x: xEnd, y: yStart },
      { x: xEnd, y: yEnd },
      { x: xStart, y: yEnd },
    ],
    isPmr: false,
  };
}

describe('stallDividerLines', () => {
  it('returns N+1 divider lines for N adjacent stalls in a row, without duplicating the shared edge', () => {
    const stalls = [makeStall('s1', 0, 2.5, 0, 5), makeStall('s2', 2.5, 5, 0, 5)];
    const lines = stallDividerLines(stalls);
    expect(lines).toHaveLength(3);
    const xs = lines.map(([a]) => a.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 2.5, 5]);
  });

  it('returns N+1 divider lines for three adjacent stalls', () => {
    const stalls = [
      makeStall('s1', 0, 2.5, 0, 5),
      makeStall('s2', 2.5, 5, 0, 5),
      makeStall('s3', 5, 7.5, 0, 5),
    ];
    const lines = stallDividerLines(stalls);
    expect(lines).toHaveLength(4);
  });

  it('returns 2 divider lines (both sides) for a single isolated stall', () => {
    const stalls = [makeStall('s1', 0, 2.5, 0, 5)];
    const lines = stallDividerLines(stalls);
    expect(lines).toHaveLength(2);
  });

  it('does not treat stalls in different rows as adjacent', () => {
    const stalls = [makeStall('s1', 0, 2.5, 0, 5), makeStall('s2', 0, 2.5, 10, 15)];
    const lines = stallDividerLines(stalls);
    expect(lines).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/geometry/stallMarkings.test.ts`
Expected: FAIL — `Cannot find module './stallMarkings'`

- [ ] **Step 3: Implémenter `stallDividerLines`**

```typescript
// src/geometry/stallMarkings.ts
import { Point } from './projection';
import { Stall } from './types';

function cornersMatch(a: Point, b: Point, epsilon = 1e-6): boolean {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
}

export function stallDividerLines(stalls: Stall[]): [Point, Point][] {
  const lines: [Point, Point][] = [];

  for (const stall of stalls) {
    const [frontLeft, frontRight, backRight, backLeft] = stall.corners;
    lines.push([frontLeft, backLeft]);

    const hasRightNeighbor = stalls.some(
      (other) =>
        other !== stall &&
        cornersMatch(other.corners[0], frontRight) &&
        cornersMatch(other.corners[3], backRight)
    );
    if (!hasRightNeighbor) {
      lines.push([frontRight, backRight]);
    }
  }

  return lines;
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/geometry/stallMarkings.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/stallMarkings.ts src/geometry/stallMarkings.test.ts
git commit -m "feat: compute stall divider lines from corner adjacency instead of closed rectangles"
```

## Context (pour ce task)

Ce module est pur et testé indépendamment, comme `aisleRendering.ts` (V1.1 Task 1). Il détermine, à partir de la géométrie réelle des places (`Stall.corners`, déjà en mètres locaux), quels traits de séparation tracer — sans dépendre de l'ordre du tableau ni de l'`id` des places (qui n'encode pas de façon fiable la position dans la rangée, voir plan V1 Task 5). Deux places sont considérées adjacentes si le côté droit de l'une correspond exactement (à `epsilon` près) au côté gauche de l'autre — ce qui est garanti par construction dans `packRows` (les places d'une même rangée sont placées bord à bord). Il sera consommé par `PlanOverlay.tsx` (Task 4) et `dxfExporter.ts` (Task 3), appelé sur **toutes** les places (standard + PMR) — les places PMR gardent en plus leur propre remplissage plein dessiné par-dessus (pas de changement pour elles ici).

Déjà disponible : `src/geometry/projection.ts` (`Point`), `src/geometry/types.ts` (`Stall`).

L'utilisateur a donné un consentement explicite permanent pour committer directement sur la branche `master` de ce projet.

---

### Task 2: Flèches de voie plus discrètes

**Files:**
- Modify: `src/geometry/aisleRendering.ts`
- Modify: `src/geometry/aisleRendering.test.ts`

- [ ] **Step 1: Remplacer le contenu de `aisleRendering.test.ts`**

```typescript
// src/geometry/aisleRendering.test.ts
import { describe, it, expect } from 'vitest';
import { aisleDirectionArrows } from './aisleRendering';
import { AisleBand } from './types';

const singleAisle: AisleBand = {
  centerline: [{ x: 0, y: 0 }, { x: 30, y: 0 }],
  width: 5,
};

describe('aisleDirectionArrows', () => {
  it('returns one arrow for a single-loaded aisle, centered on the midpoint', () => {
    const arrows = aisleDirectionArrows(singleAisle, 'single');
    expect(arrows).toHaveLength(1);
    expect(arrows[0]).toHaveLength(3);
    // arrowWidth = width * 0.2 = 1, arrowLength = arrowWidth * 2 = 2
    // mid = (15, 0), direction = (1, 0)
    // tip = mid + direction * (arrowLength / 2) = (16, 0)
    expect(arrows[0][0].x).toBeCloseTo(16, 6);
    expect(arrows[0][0].y).toBeCloseTo(0, 6);
    // baseLeft = mid - direction * (arrowLength / 2) + perp * (arrowWidth / 2) = (14, 0.5)
    expect(arrows[0][1].x).toBeCloseTo(14, 6);
    expect(arrows[0][1].y).toBeCloseTo(0.5, 6);
    // baseRight = (14, -0.5)
    expect(arrows[0][2].x).toBeCloseTo(14, 6);
    expect(arrows[0][2].y).toBeCloseTo(-0.5, 6);
  });

  it('returns two opposite-facing arrows for a double-loaded aisle', () => {
    const arrows = aisleDirectionArrows(singleAisle, 'double');
    expect(arrows).toHaveLength(2);
    // posA = start + direction * (length / 3) = (10, 0), pointing +x
    // arrowWidth = 1, arrowLength = 2, so tip = (10 + 1, 0) = (11, 0)
    expect(arrows[0][0].x).toBeCloseTo(11, 6);
    // posB = start + direction * (length * 2 / 3) = (20, 0), pointing -x
    // tip = (20 - 1, 0) = (19, 0)
    expect(arrows[1][0].x).toBeCloseTo(19, 6);
    expect(arrows[0][0].x).toBeGreaterThan(arrows[0][1].x);
    expect(arrows[1][0].x).toBeLessThan(arrows[1][1].x);
  });

  it('scales arrow size with the aisle width', () => {
    const wideAisle: AisleBand = { centerline: [{ x: 0, y: 0 }, { x: 30, y: 0 }], width: 10 };
    const arrows = aisleDirectionArrows(wideAisle, 'single');
    // arrowWidth = 10 * 0.2 = 2, so baseLeft/baseRight are 2 apart in y (1 each side)
    expect(arrows[0][1].y).toBeCloseTo(1, 6);
    expect(arrows[0][2].y).toBeCloseTo(-1, 6);
  });

  it('returns no arrows for a zero-length aisle instead of producing NaN', () => {
    const degenerateAisle: AisleBand = { centerline: [{ x: 5, y: 5 }, { x: 5, y: 5 }], width: 5 };
    expect(aisleDirectionArrows(degenerateAisle, 'single')).toEqual([]);
    expect(aisleDirectionArrows(degenerateAisle, 'double')).toEqual([]);
  });

  it('clamps arrow length for a short, wide aisle so it does not exceed the aisle', () => {
    const shortAisle: AisleBand = { centerline: [{ x: 0, y: 0 }, { x: 2, y: 0 }], width: 6 };
    const arrows = aisleDirectionArrows(shortAisle, 'single');
    expect(arrows[0][0].x).toBeLessThanOrEqual(2);
    expect(arrows[0][0].x).toBeGreaterThanOrEqual(0);
  });

  it('clamps arrow length for a short, wide double-loaded aisle so both arrows stay within the aisle', () => {
    const shortAisle: AisleBand = { centerline: [{ x: 0, y: 0 }, { x: 2, y: 0 }], width: 6 };
    const arrows = aisleDirectionArrows(shortAisle, 'double');
    for (const arrow of arrows) {
      for (const point of arrow) {
        expect(point.x).toBeGreaterThanOrEqual(-1e-9);
        expect(point.x).toBeLessThanOrEqual(2 + 1e-9);
      }
    }
  });

  it('produces a correctly oriented arrow for a diagonal aisle', () => {
    const diagonalAisle: AisleBand = { centerline: [{ x: 0, y: 0 }, { x: 10, y: 10 }], width: 4 };
    const arrows = aisleDirectionArrows(diagonalAisle, 'single');
    // direction = (1/sqrt(2), 1/sqrt(2)), mid = (5, 5)
    // arrowWidth = 4 * 0.2 = 0.8, arrowLength = min(1.6, length * 0.8) — length = 10*sqrt(2) ≈ 14.14,
    // so arrowLength = 1.6 (unclamped), halfLen = 0.8
    const invSqrt2 = 1 / Math.sqrt(2);
    const expectedTipX = 5 + invSqrt2 * 0.8;
    const expectedTipY = 5 + invSqrt2 * 0.8;
    expect(arrows[0][0].x).toBeCloseTo(expectedTipX, 6);
    expect(arrows[0][0].y).toBeCloseTo(expectedTipY, 6);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/geometry/aisleRendering.test.ts`
Expected: FAIL sur les tests 1, 2, 3 et 7 (valeurs calculées avec l'ancien ratio 0.5) — les tests 4, 5, 6 doivent déjà passer (comportement de bornage inchangé).

- [ ] **Step 3: Modifier `aisleRendering.ts`**

Dans `src/geometry/aisleRendering.ts`, remplacer les deux occurrences de `aisle.width * 0.5` par `aisle.width * 0.2` (une dans la branche `single`, une dans la branche `double` — chercher `const arrowWidth = aisle.width * 0.5;` dans chaque branche). Aucun autre changement dans le fichier.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/geometry/aisleRendering.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/aisleRendering.ts src/geometry/aisleRendering.test.ts
git commit -m "feat: reduce arrow size ratio from 0.5 to 0.2 for a more discreet, road-marking-like look"
```

## Context (pour ce task)

`aisleDirectionArrows` existe depuis V1.1 Task 1 (déjà bien testé et corrigé à travers deux itérations de revue — voir l'historique git). Seul le ratio de largeur change ; la formule de bornage (`Math.min(arrowWidth * 2, ...)`) reste identique et continue de fonctionner car elle est déjà exprimée en fonction de `arrowWidth`, pas d'une constante en dur.

---

### Task 3: Lisibilité de l'export DXF — places en traits, voies en blanc

**Files:**
- Modify: `src/export/dxfExporter.ts`
- Modify: `src/export/dxfExporter.test.ts`

- [ ] **Step 1: Remplacer le contenu de `dxfExporter.test.ts`**

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

const doubleLoadedConfig: ParkingConfig = {
  ...sampleConfig,
  loadType: 'double',
};

const boundary = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }];
const exclusions: { x: number; y: number }[][] = [];

interface PolylineBlock {
  layer: string | undefined;
  vertexCount: number | undefined;
  raw: string;
}

function polylineBlocks(dxf: string): PolylineBlock[] {
  // .slice(1) : le premier fragment (avant la toute première entité LWPOLYLINE)
  // contient l'en-tête DXF et les tables/blocs générés par dxf-writer (dont le bloc
  // *Model_Space, dont le point de base est toujours 0,0,0) — l'inclure risquerait
  // de faire correspondre un snippet à ce contenu générique plutôt qu'à une vraie entité.
  return dxf
    .split('0\nLWPOLYLINE')
    .slice(1)
    .map((block) => {
      const layerMatch = block.match(/\n8\n([A-Z_]+)\n/);
      const vertexMatch = block.match(/\n90\n(\d+)\n/);
      return {
        layer: layerMatch?.[1],
        vertexCount: vertexMatch ? parseInt(vertexMatch[1], 10) : undefined,
        raw: block,
      };
    });
}

describe('exportConfigToDxf', () => {
  it('produces a DXF string with the expected layers', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    expect(dxf).toContain('CONTOUR');
    expect(dxf).toContain('PLACES');
    expect(dxf).toContain('PLACES_PMR');
    expect(dxf).toContain('VOIES');
  });

  it('draws divider lines (2-vertex, open) for stalls on PLACES, and a closed 4-vertex rectangle for the PMR stall on PLACES_PMR', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    const blocks = polylineBlocks(dxf);

    // 2 adjacent stalls (s1, s2) -> 3 divider lines, each a 2-vertex open polyline on PLACES
    const placesDividers = blocks.filter((b) => b.layer === 'PLACES');
    expect(placesDividers).toHaveLength(3);
    for (const divider of placesDividers) {
      expect(divider.vertexCount).toBe(2);
    }

    // the PMR stall's closed rectangle lives on PLACES_PMR as a single 4-vertex polyline
    const pmrShapes = blocks.filter((b) => b.layer === 'PLACES_PMR');
    expect(pmrShapes).toHaveLength(1);
    expect(pmrShapes[0].vertexCount).toBe(4);
  });

  it('draws one arrow polyline (not a plain centerline) for a single-loaded aisle, on a white VOIES layer', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    const blocks = polylineBlocks(dxf);
    // 1 contour + 3 place dividers + 1 PMR rectangle + 1 arrow = 6 LWPOLYLINE entities
    expect(blocks).toHaveLength(6);
    const voiesShapes = blocks.filter((b) => b.layer === 'VOIES');
    expect(voiesShapes).toHaveLength(1);
    expect(voiesShapes[0].vertexCount).toBe(3); // the arrow triangle
  });

  it('draws two arrows plus a dashed centerline divider for a double-loaded aisle', () => {
    const dxf = exportConfigToDxf(doubleLoadedConfig, boundary, exclusions);
    const blocks = polylineBlocks(dxf);
    // 1 contour + 3 place dividers + 1 PMR rectangle + 2 arrows + 1 centerline divider = 8
    expect(blocks).toHaveLength(8);
    const voiesSeparateurShapes = blocks.filter((b) => b.layer === 'VOIES_SEPARATEUR');
    expect(voiesSeparateurShapes).toHaveLength(1);
    expect(voiesSeparateurShapes[0].vertexCount).toBe(2); // the centerline, open 2-vertex polyline
  });

  it('uses white (color 7) for the VOIES and VOIES_SEPARATEUR layers', () => {
    const dxf = exportConfigToDxf(doubleLoadedConfig, boundary, exclusions);
    // LAYER table entries: group code 2 = name, group code 62 = ACI color number (7 = white)
    expect(dxf).toMatch(/2\nVOIES\n[\s\S]{0,80}?62\n7\n/);
    expect(dxf).toMatch(/2\nVOIES_SEPARATEUR\n[\s\S]{0,80}?62\n7\n/);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/export/dxfExporter.test.ts`
Expected: FAIL sur la plupart des tests (le code actuel dessine encore des rectangles fermés pour toutes les places et un calque VOIES jaune).

- [ ] **Step 3: Modifier `exportConfigToDxf`**

Dans `src/export/dxfExporter.ts`, ajouter l'import de `stallDividerLines` :

```typescript
import { stallDividerLines } from '../geometry/stallMarkings';
```

Remplacer le bloc des calques PLACES/PLACES_PMR (actuellement une boucle sur `config.stalls` qui dessine un rectangle fermé par place, sur PLACES ou PLACES_PMR selon `isPmr`) par :

```typescript
  d.addLayer('PLACES', Drawing.ACI.CYAN, 'CONTINUOUS');
  d.addLayer('PLACES_PMR', Drawing.ACI.BLUE, 'CONTINUOUS');

  d.setActiveLayer('PLACES');
  for (const [a, b] of stallDividerLines(config.stalls)) {
    d.drawPolyline(ringToPolylinePoints([a, b]), false);
  }

  d.setActiveLayer('PLACES_PMR');
  for (const stall of config.stalls) {
    if (stall.isPmr) {
      d.drawPolyline(ringToPolylinePoints(stall.corners), true);
    }
  }
```

Remplacer les deux appels `d.addLayer('VOIES', Drawing.ACI.YELLOW, 'CONTINUOUS')` et `d.addLayer('VOIES_SEPARATEUR', Drawing.ACI.YELLOW, 'DASHED')` par la même chose en `Drawing.ACI.WHITE` :

```typescript
  d.addLayer('VOIES', Drawing.ACI.WHITE, 'CONTINUOUS');
  d.addLayer('VOIES_SEPARATEUR', Drawing.ACI.WHITE, 'DASHED');
```

Le reste de la fonction (calques CONTOUR, EXCLUSIONS, la boucle des flèches sur VOIES) ne change pas.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/export/dxfExporter.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Lancer la suite complète et vérifier le build**

Run: `npx vitest run`
Expected: PASS (tous les fichiers)

Run: `npm run build`
Expected: aucune erreur

- [ ] **Step 6: Commit**

```bash
git add src/export/dxfExporter.ts src/export/dxfExporter.test.ts
git commit -m "feat: draw stall divider lines instead of closed rectangles, white VOIES layers, in DXF export"
```

## Context (pour ce task)

S'appuie sur `stallDividerLines` (Task 1). `dxfExporter.ts` existe depuis le plan V1 (Task 12) et a déjà été modifié une fois pour les flèches de voie (V1.1 Task 6, avec un historique de correction de bug sur le helper de test `findLayerOfPolylineContaining` — le nouveau test ci-dessus reprend la version corrigée de ce helper, avec `.slice(1)` pour ignorer le contenu générique avant la première entité DXF). Le calque `PLACES_PMR` garde un rectangle fermé (pas de traits) car c'est ce qui porte le remplissage/la distinction visuelle des places PMR.

---

### Task 4: Aperçu carte — places en traits, PMR pleines, flèches blanches

**Files:**
- Modify: `src/components/PlanOverlay.tsx`

- [ ] **Step 1: Remplacer le contenu de `PlanOverlay.tsx`**

```typescript
// src/components/PlanOverlay.tsx
import { Fragment, useMemo } from 'react';
import { Polygon, Polyline } from 'react-leaflet';
import { LatLng, Point } from '../geometry/projection';
import { ParkingConfig } from '../geometry/types';
import { aisleDirectionArrows } from '../geometry/aisleRendering';
import { stallDividerLines } from '../geometry/stallMarkings';

export interface PlanProjection {
  toLatLng(p: Point): LatLng;
}

interface PlanOverlayProps {
  config: ParkingConfig;
  projection: PlanProjection;
}

export function PlanOverlay({ config, projection }: PlanOverlayProps) {
  const toLatLngPositions = (points: Point[]): [number, number][] =>
    points.map((p) => {
      const ll = projection.toLatLng(p);
      return [ll.lat, ll.lng];
    });

  // stallDividerLines est O(n²) (comparaison de chaque place avec toutes les autres) —
  // mémoïsé pour ne pas le recalculer à chaque rendu (pan/zoom de la carte), seulement
  // quand la liste de places change réellement.
  const dividerLines = useMemo(() => stallDividerLines(config.stalls), [config.stalls]);
  const pmrStalls = config.stalls.filter((stall) => stall.isPmr);

  return (
    <>
      {dividerLines.map(([a, b], index) => (
        <Polyline key={index} positions={toLatLngPositions([a, b])} pathOptions={{ color: '#ffffff', weight: 1 }} />
      ))}
      {pmrStalls.map((stall) => (
        <Polygon
          key={stall.id}
          positions={toLatLngPositions(stall.corners)}
          pathOptions={{ color: '#1d5fd6', weight: 1, fillColor: '#1d5fd6', fillOpacity: 0.7 }}
        />
      ))}
      {config.aisles.map((aisle, aisleIndex) => (
        <Fragment key={aisleIndex}>
          {config.loadType === 'double' && (
            <Polyline
              positions={toLatLngPositions(aisle.centerline)}
              pathOptions={{ color: '#ffffff', weight: 2, dashArray: '6 6' }}
            />
          )}
          {aisleDirectionArrows(aisle, config.loadType).map((arrow, arrowIndex) => (
            <Polygon
              key={arrowIndex}
              positions={toLatLngPositions(arrow)}
              pathOptions={{ color: '#ffffff', fillColor: '#ffffff', fillOpacity: 0.9 }}
            />
          ))}
        </Fragment>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit` puis `npm run build`
Expected: aucune erreur

- [ ] **Step 3: Test manuel**

Run: `npm run dev`
1. Tracer un contour, poser un point d'accès, générer un plan.
2. Vérifier que les places standard s'affichent en traits fins blancs (pas de rectangle plein), que les places PMR restent en remplissage bleu plein, et que les flèches de voie sont blanches et nettement plus petites qu'avant.

- [ ] **Step 4: Commit**

```bash
git add src/components/PlanOverlay.tsx
git commit -m "feat: render stall divider lines and white arrows in the map overlay, matching the DXF export"
```

## Context (pour ce task)

S'appuie sur `stallDividerLines` (Task 1, déjà committé) et la nouvelle taille de flèche (Task 2, déjà committée). Miroir exact des changements de Task 3 côté DXF, pour garantir que l'aperçu carte et l'export montrent la même chose (objectif de conception déjà établi en V1.1).

---

### Task 5: Zoom maximal de la carte

**Files:**
- Modify: `src/components/MapView.tsx`

- [ ] **Step 1: Ajouter les props de zoom au `TileLayer`**

Dans `src/components/MapView.tsx`, dans la fonction `MapView`, modifier le `<TileLayer>` existant :

```typescript
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri"
        maxZoom={22}
        maxNativeZoom={19}
      />
```

Ne rien changer d'autre dans le fichier.

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit` puis `npm run build`
Expected: aucune erreur

- [ ] **Step 3: Test manuel**

Run: `npm run dev`
1. Rechercher une adresse, zoomer au maximum (molette ou bouton +) → vérifier qu'on peut zoomer nettement plus qu'avant pour tracer précisément, même si l'image devient floue au-delà du niveau natif du fournisseur (comportement normal).

- [ ] **Step 4: Commit**

```bash
git add src/components/MapView.tsx
git commit -m "feat: increase max map zoom for precise tracing"
```

## Context (pour ce task)

`maxNativeZoom` indique à Leaflet de continuer à agrandir (interpoler) la dernière tuile disponible au niveau natif du fournisseur (~19 pour Esri World Imagery dans la plupart des zones) plutôt que d'essayer de charger des tuiles qui n'existent pas au-delà (ce qui produirait des cases vides). `maxZoom` fixe la limite haute réelle de zoom autorisée sur la carte.

---

### Task 6: Garde-fou — point d'accès requis avant de générer

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Ajouter la validation dans `handleGenerate`**

Dans `src/App.tsx`, dans `handleGenerate`, ajouter cette vérification juste après le bloc de validation des paramètres invalides (`invalidParamEntry`) et avant le calcul de `ring`/la vérification d'auto-intersection :

```typescript
    if (accessPoints.length === 0) {
      alert("Pose au moins un point d'accès avant de générer un plan — nécessaire pour placer les places PMR et raccorder les voies.");
      return;
    }
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit` puis `npm run build`
Expected: aucune erreur

- [ ] **Step 3: Lancer la suite de tests complète**

Run: `npx vitest run`
Expected: PASS (aucune régression — ce changement ne touche aucun module testé unitairement)

- [ ] **Step 4: Test manuel**

Run: `npm run dev`
1. Tracer un contour sans poser de point d'accès, cliquer "Générer le plan" → vérifier le message d'erreur bloquant.
2. Poser un point d'accès, générer → vérifier que le nombre de PMR dans les résultats n'est plus systématiquement 0.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "fix: require at least one access point before generating a plan, preventing silent 0-PMR results"
```

## Context (pour ce task)

Corrige le bug identifié pendant la session : `assignPmrStalls` (`src/geometry/pmrAssignment.ts`, plan V1 Task 7) retourne les places inchangées sans lever d'erreur si `accessPoints` est vide, ce qui produisait un plan à 0 place PMR sans aucun avertissement à l'utilisateur. `accessPoints` est déjà une variable disponible dans `App.tsx` (sélecteur du store, utilisé par les validations existantes juste après ce nouveau bloc).

---

### Task 7: Panneau latéral sous la carte

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Modifier la mise en page**

**Correction post-implémentation :** la première version de `.side-panel` (`width: 100%` + `padding: 1rem`, sans `box-sizing: border-box`) débordait de la page — le `padding` s'ajoutait à la largeur `100%` au lieu d'être inclus dedans (comportement par défaut `box-sizing: content-box`), recréant un débordement horizontal similaire au bug `#root`/`index.css` déjà corrigé plus tôt dans ce projet. `box-sizing: border-box` est ajouté ci-dessous pour l'éviter.

Remplacer entièrement les règles `.app-layout`, `.map-container` et `.side-panel` dans `src/App.css` par :

```css
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

.map-container {
  flex: 1;
  position: relative;
  min-height: 0;
}

.side-panel {
  box-sizing: border-box;
  width: 100%;
  height: 280px;
  padding: 1rem;
  overflow-y: auto;
  border-left: none;
  border-top: 1px solid #ccc;
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-content: flex-start;
}

.params-panel,
.results-panel {
  min-width: 220px;
}
```

Le reste du fichier (`.actions`, `.import-button`, `.import-button input`, `.legend`, `.legend h4`, `.legend ul`, `.legend li`, `.legend-swatch`) ne change pas.

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit` puis `npm run build`
Expected: aucune erreur

- [ ] **Step 3: Test manuel**

Run: `npm run dev`
1. Vérifier que la carte occupe toute la largeur en haut, et que le panneau (paramètres, boutons, résultats, légende) s'affiche en bandeau horizontal sous la carte, sans débordement de page.
2. Vérifier que tous les champs de paramètres, boutons et la légende restent utilisables (pas de superposition, défilement vertical du bandeau si le contenu est trop haut pour les 280px).

- [ ] **Step 4: Commit**

```bash
git add src/App.css
git commit -m "feat: move side panel below the map instead of beside it"
```

## Context (pour ce task)

`ParamsPanel.tsx`, `ResultsPanel.tsx` et `Legend.tsx` ne changent pas de structure interne (leurs éléments `<label>` sont déjà en affichage `inline` par défaut du navigateur, donc ils s'enchaînent et reviennent à la ligne naturellement dans un conteneur plus large que haut, sans CSS supplémentaire). Seul le conteneur `.side-panel` et l'orientation de `.app-layout` changent. `min-height: 0` sur `.map-container` est nécessaire pour qu'un enfant flex avec `flex: 1` dans un `flex-direction: column` se redimensionne correctement plutôt que de forcer le conteneur parent à grandir au-delà de la hauteur disponible (comportement par défaut de Flexbox avec `min-height: auto`).

---

## Backlog (hors périmètre de ce plan)

- Réseau de voies de circulation interconnectées garantissant l'accessibilité de toutes les places (chantier séparé à cadrer).
