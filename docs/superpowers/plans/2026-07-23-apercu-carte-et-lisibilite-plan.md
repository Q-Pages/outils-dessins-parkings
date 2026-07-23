# Aperçu carte du plan généré + lisibilité DXF — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher le plan de parking généré (places, PMR, flèches de sens des voies) directement sur la carte satellite avant export, appliquer la même logique de flèches/pointillés au DXF exporté, ajouter une légende et des libellés français aux outils de dessin.

**Architecture:** Un module géométrique pur (`src/geometry/aisleRendering.ts`) calcule les flèches de sens à partir d'une `AisleBand` existante ; ce module est consommé à la fois par un nouveau composant d'aperçu carte (`PlanOverlay`, rendu dans `MapView`) et par l'export DXF (`dxfExporter.ts`), garantissant que l'aperçu et l'export montrent la même chose.

**Tech Stack:** React, react-leaflet (Polygon/Polyline), dxf-writer (linetype DASHED déjà enregistré par défaut), Vitest.

---

## Note de référence

Spec complète : `docs/superpowers/specs/2026-07-23-apercu-carte-et-lisibilite-design.md`

## Structure des fichiers

```
src/
  geometry/
    aisleRendering.ts        — nouveau : calcul des flèches de sens (pur, testé)
    aisleRendering.test.ts   — nouveau
  export/
    dxfExporter.ts           — modifié : calque VOIES redessiné (flèches + séparateur pointillé)
    dxfExporter.test.ts      — modifié : tests mis à jour pour la nouvelle géométrie de voie
  components/
    Legend.tsx                — nouveau : légende couleurs dans le panneau latéral
    PlanOverlay.tsx            — nouveau : dessine le plan généré sur la carte
    MapView.tsx                — modifié : accepte config/projection en props, rend PlanOverlay, libellés FR sur la barre d'outils Leaflet.Draw
  App.tsx                      — modifié : passe la config sélectionnée + la projection à MapView, affiche Legend
  App.css                      — modifié : styles de la légende
```

---

### Task 1: Calcul des flèches de sens de circulation

**Files:**
- Create: `src/geometry/aisleRendering.ts`
- Test: `src/geometry/aisleRendering.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

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
    // arrowWidth = width * 0.5 = 2.5, arrowLength = arrowWidth * 2 = 5
    // mid = (15, 0), direction = (1, 0)
    // tip = mid + direction * (arrowLength / 2) = (17.5, 0)
    expect(arrows[0][0].x).toBeCloseTo(17.5, 6);
    expect(arrows[0][0].y).toBeCloseTo(0, 6);
    // baseLeft = mid - direction * (arrowLength / 2) + perp * (arrowWidth / 2) = (12.5, 1.25)
    expect(arrows[0][1].x).toBeCloseTo(12.5, 6);
    expect(arrows[0][1].y).toBeCloseTo(1.25, 6);
    // baseRight = (12.5, -1.25)
    expect(arrows[0][2].x).toBeCloseTo(12.5, 6);
    expect(arrows[0][2].y).toBeCloseTo(-1.25, 6);
  });

  it('returns two opposite-facing arrows for a double-loaded aisle', () => {
    const arrows = aisleDirectionArrows(singleAisle, 'double');
    expect(arrows).toHaveLength(2);
    // posA = start + direction * (length / 3) = (10, 0), pointing +x
    // arrowLength = 5, so tip = (10 + 2.5, 0) = (12.5, 0)
    expect(arrows[0][0].x).toBeCloseTo(12.5, 6);
    // posB = start + direction * (length * 2 / 3) = (20, 0), pointing -x
    // tip = (20 - 2.5, 0) = (17.5, 0)
    expect(arrows[1][0].x).toBeCloseTo(17.5, 6);
    // the two arrows point in opposite directions: arrow A's tip is further along
    // +x than its own base points, arrow B's tip is further along -x than its base
    expect(arrows[0][0].x).toBeGreaterThan(arrows[0][1].x);
    expect(arrows[1][0].x).toBeLessThan(arrows[1][1].x);
  });

  it('scales arrow size with the aisle width', () => {
    const wideAisle: AisleBand = { centerline: [{ x: 0, y: 0 }, { x: 30, y: 0 }], width: 10 };
    const arrows = aisleDirectionArrows(wideAisle, 'single');
    // arrowWidth = 10 * 0.5 = 5, so baseLeft/baseRight are 5 apart in y (2.5 each side)
    expect(arrows[0][1].y).toBeCloseTo(2.5, 6);
    expect(arrows[0][2].y).toBeCloseTo(-2.5, 6);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/geometry/aisleRendering.test.ts`
Expected: FAIL — `Cannot find module './aisleRendering'`

- [ ] **Step 3: Implémenter `aisleDirectionArrows`**

```typescript
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
  const direction = normalize({ x: end.x - start.x, y: end.y - start.y });
  const arrowWidth = aisle.width * 0.5;
  const arrowLength = arrowWidth * 2;

  if (loadType === 'single') {
    const mid: Point = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return [makeArrow(mid, direction, arrowLength, arrowWidth)];
  }

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
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/geometry/aisleRendering.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/aisleRendering.ts src/geometry/aisleRendering.test.ts
git commit -m "feat: compute aisle direction arrows for single/double-loaded aisles"
```

## Context (pour ce task)

Ce module est pur et testé indépendamment, comme tout le reste de `src/geometry/`. Il sera consommé par deux endroits différents (Task 3 : aperçu carte, Task 6 : export DXF) — voir la spec section 2 pour le raisonnement. `AisleBand` et `Ring` sont déjà définis dans `src/geometry/types.ts` (Task 3 du plan V1). `Point` vient de `src/geometry/projection.ts`.

---

### Task 2: Légende

**Files:**
- Create: `src/components/Legend.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Implémenter `Legend`**

```typescript
// src/components/Legend.tsx
interface LegendItem {
  color: string;
  label: string;
}

const LEGEND_ITEMS: LegendItem[] = [
  { color: '#3388ff', label: 'Contour du terrain et zones d\'exclusion' },
  { color: '#ffffff', label: 'Place standard' },
  { color: '#1d5fd6', label: 'Place PMR' },
  { color: '#ffcc00', label: 'Voie de circulation (flèche = sens)' },
  { color: '#2a9df4', label: 'Point d\'accès' },
];

export function Legend() {
  return (
    <div className="legend">
      <h4>Légende</h4>
      <ul>
        {LEGEND_ITEMS.map((item) => (
          <li key={item.label}>
            <span className="legend-swatch" style={{ backgroundColor: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Ajouter le style de la légende**

```css
/* à ajouter à src/App.css, après le bloc .import-button input existant */
.legend {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #ccc;
}

.legend h4 {
  margin: 0 0 0.5rem;
}

.legend ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.legend li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.legend-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid #999;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit` puis `npm run build`
Expected: aucune erreur

- [ ] **Step 4: Commit**

```bash
git add src/components/Legend.tsx src/App.css
git commit -m "feat: add color legend for map elements"
```

## Context (pour ce task)

Composant purement présentationnel, pas de test automatisé (cohérent avec `ParamsPanel`/`ResultsPanel`, Task 14 du plan V1, qui n'en ont pas non plus). Les couleurs listées correspondent à ce que Task 3 et Task 5 vont effectivement dessiner sur la carte (blanc pour les places standard, bleu plein pour PMR, jaune pour les flèches de voie) et au style par défaut de Leaflet.Draw pour le contour/les exclusions (`#3388ff`, non modifié dans ce plan — distinguer visuellement contour et exclusion reste un point non traité, noté dans la spec comme limitation acceptée).

---

### Task 3: Aperçu du plan généré sur la carte

**Files:**
- Create: `src/components/PlanOverlay.tsx`

- [ ] **Step 1: Implémenter `PlanOverlay`**

```typescript
// src/components/PlanOverlay.tsx
import { Fragment } from 'react';
import { Polygon, Polyline } from 'react-leaflet';
import { LatLng, Point } from '../geometry/projection';
import { ParkingConfig } from '../geometry/types';
import { aisleDirectionArrows } from '../geometry/aisleRendering';

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

  return (
    <>
      {config.stalls.map((stall) => (
        <Polygon
          key={stall.id}
          positions={toLatLngPositions(stall.corners)}
          pathOptions={
            stall.isPmr
              ? { color: '#1d5fd6', weight: 1, fillColor: '#1d5fd6', fillOpacity: 0.7 }
              : { color: '#ffffff', weight: 1, fillOpacity: 0 }
          }
        />
      ))}
      {config.aisles.map((aisle, aisleIndex) => (
        <Fragment key={aisleIndex}>
          {config.loadType === 'double' && (
            <Polyline
              positions={toLatLngPositions(aisle.centerline)}
              pathOptions={{ color: '#ffcc00', weight: 2, dashArray: '6 6' }}
            />
          )}
          {aisleDirectionArrows(aisle, config.loadType).map((arrow, arrowIndex) => (
            <Polygon
              key={arrowIndex}
              positions={toLatLngPositions(arrow)}
              pathOptions={{ color: '#ffcc00', fillColor: '#ffcc00', fillOpacity: 0.9 }}
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

- [ ] **Step 3: Commit**

```bash
git add src/components/PlanOverlay.tsx
git commit -m "feat: add PlanOverlay component to render the generated plan on the map"
```

## Context (pour ce task)

`PlanOverlay` n'est pas encore branché à `MapView`/`App.tsx` à cette étape (fait en Task 4) — ce task se concentre sur le composant seul. Il doit être rendu comme enfant de `MapContainer` (react-leaflet) pour fonctionner, ce qui sera fait en Task 4. Pas de test automatisé (composant React/Leaflet, cohérent avec `MapView.tsx` qui n'en a pas non plus — Task 13 du plan V1). Les couleurs PMR/flèches reprennent celles de la légende (Task 2).

---

### Task 4: Brancher l'aperçu et la légende dans l'application

**Files:**
- Modify: `src/components/MapView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Ajouter les props à `MapView`**

Dans `src/components/MapView.tsx`, ajouter l'import de `PlanOverlay` et de `PlanProjection`, et modifier la signature du composant exporté `MapView` :

```typescript
// à ajouter aux imports existants de MapView.tsx
import { PlanOverlay, PlanProjection } from './PlanOverlay';
import { ParkingConfig } from '../geometry/types';
```

```typescript
// remplacer la fonction MapView existante (qui ne prenait aucune prop) par :
interface MapViewProps {
  planConfig?: ParkingConfig;
  projection?: PlanProjection | null;
}

export function MapView({ planConfig, projection }: MapViewProps) {
  return (
    <MapContainer center={[46.6, 2.5]} zoom={6} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri"
      />
      <SearchBar />
      <DrawingLayer />
      {planConfig && projection && <PlanOverlay config={planConfig} projection={projection} />}
    </MapContainer>
  );
}
```

Ne pas toucher au reste du fichier (`SearchBar`, `DrawingLayer`, `searchAddress`, `COORDS_REGEX`).

- [ ] **Step 2: Passer les props depuis `App.tsx` et afficher la légende**

Dans `src/App.tsx`, ajouter l'import de `Legend` :

```typescript
import { Legend } from './components/Legend';
```

Remplacer `<MapView />` par :

```typescript
<MapView planConfig={configs[selectedConfigIndex]} projection={projection} />
```

Ajouter `<Legend />` juste après `<ResultsPanel />` dans le JSX (fin du `.side-panel`) :

```typescript
        <ResultsPanel />
        <Legend />
```

`configs`, `selectedConfigIndex` et `projection` sont déjà des variables existantes dans `App.tsx` (Task 15 du plan V1) — aucune nouvelle donnée à récupérer du store.

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit` puis `npm run build`
Expected: aucune erreur

- [ ] **Step 4: Test manuel**

Run: `npm run dev`
1. Tracer un contour, générer un plan.
2. Vérifier que les places (contours blancs) et les flèches de voie (jaunes) apparaissent directement sur la carte satellite, sans avoir besoin d'exporter en DXF.
3. Sélectionner une configuration alternative dans le panneau résultats → vérifier que l'aperçu sur la carte se met à jour pour refléter la nouvelle configuration.
4. Vérifier que la légende s'affiche dans le panneau latéral, sous les résultats.

- [ ] **Step 5: Commit**

```bash
git add src/components/MapView.tsx src/App.tsx
git commit -m "feat: wire PlanOverlay and Legend into the app"
```

## Context (pour ce task)

`configs[selectedConfigIndex]` peut être `undefined` si `configs` est vide (aucun plan généré) — `MapView`/`PlanOverlay` gèrent déjà ce cas via le `planConfig &&` dans le JSX de Task 1. `projection` peut être `null` (aucun contour tracé) — même garde. Pas de nouvel état à ajouter au store Zustand.

---

### Task 5: Libellés français sur la barre d'outils Leaflet.Draw

**Files:**
- Modify: `src/components/MapView.tsx`

- [ ] **Step 1: Vérifier la structure réelle de `L.drawLocal`**

Avant d'écrire le code, inspecter `node_modules/leaflet-draw/dist/leaflet.draw-src.js` (chercher `L.drawLocal =`) pour confirmer les clés exactes de l'objet de traduction (`draw.toolbar.buttons.polygon`, `draw.toolbar.buttons.marker`, `draw.toolbar.finish`, `draw.toolbar.undo`, `draw.toolbar.actions`, etc.) — la structure ci-dessous est celle de la version standard de leaflet-draw, mais confirmer avant d'appliquer pour éviter d'assigner des clés qui n'existent pas silencieusement (auquel cas les boutons garderaient leurs libellés anglais par défaut sans erreur visible).

- [ ] **Step 2: Ajouter la configuration des libellés**

Dans `src/components/MapView.tsx`, juste après les imports (avant `const COORDS_REGEX = ...`), ajouter :

```typescript
L.drawLocal.draw.toolbar.buttons.polygon = "Tracer le contour ou une zone d'exclusion";
L.drawLocal.draw.toolbar.buttons.marker = "Poser un point d'accès";
L.drawLocal.draw.toolbar.finish.title = 'Terminer le tracé';
L.drawLocal.draw.toolbar.finish.text = 'Terminer';
L.drawLocal.draw.toolbar.undo.title = 'Supprimer le dernier point';
L.drawLocal.draw.toolbar.undo.text = 'Supprimer le dernier point';
L.drawLocal.draw.toolbar.actions.title = 'Annuler le tracé';
L.drawLocal.draw.toolbar.actions.text = 'Annuler';
L.drawLocal.edit.toolbar.buttons.edit = 'Modifier un tracé';
L.drawLocal.edit.toolbar.buttons.remove = 'Supprimer un tracé';
```

Si l'inspection du Step 1 révèle une structure différente (noms de clés différents), adapter les chemins d'accès en conséquence tout en gardant les mêmes libellés français et la même liste de boutons couverts (outil polygone, outil marqueur, terminer, annuler/supprimer dernier point, éditer, supprimer).

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit` puis `npm run build`
Expected: aucune erreur

- [ ] **Step 4: Test manuel**

Run: `npm run dev`
1. Survoler les icônes de la barre d'outils de dessin (en haut à gauche de la carte) → vérifier que les info-bulles affichent les libellés français définis ci-dessus, pas les libellés anglais par défaut de Leaflet.Draw ("Draw a polygon", etc.).

- [ ] **Step 5: Commit**

```bash
git add src/components/MapView.tsx
git commit -m "feat: translate Leaflet.Draw toolbar labels to French"
```

## Context (pour ce task)

Ceci répond directement au retour utilisateur "je ne savais pas que cet outil existait" concernant le bouton de pose de point d'accès — un problème de découvrabilité, pas un bug fonctionnel (l'outil fonctionnait déjà). `L.drawLocal` est un objet de configuration global mutable exposé par la librairie `leaflet-draw` (déjà installée, Task 1 du plan V1) ; le modifier avant le premier rendu de `MapContainer` suffit à changer les libellés affichés par tous les contrôles Leaflet.Draw de l'application.

---

### Task 6: Lisibilité du calque VOIES dans l'export DXF

**Files:**
- Modify: `src/export/dxfExporter.ts`
- Modify: `src/export/dxfExporter.test.ts`

**Vérification effectuée en amont de ce plan** : `dxf-writer` enregistre automatiquement un linetype `DASHED` (`[5.0, -5.0]`) dans le constructeur de `Drawing` (`Drawing.LINE_TYPES`, voir `node_modules/dxf-writer/src/Drawing.js`) — pas besoin de l'ajouter manuellement, juste de le référencer par son nom lors de `addLayer`.

- [ ] **Step 1: Écrire les tests qui échouent**

Remplacer entièrement le contenu de `src/export/dxfExporter.test.ts` par :

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

function findLayerOfPolylineContaining(dxf: string, snippet: string): string | undefined {
  const entityBlocks = dxf.split('0\nLWPOLYLINE');
  for (const block of entityBlocks) {
    if (block.includes(snippet)) {
      const match = block.match(/\n8\n([A-Z_]+)\n/);
      return match?.[1];
    }
  }
  return undefined;
}

describe('exportConfigToDxf', () => {
  it('produces a DXF string with the expected layers', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    expect(dxf).toContain('CONTOUR');
    expect(dxf).toContain('PLACES');
    expect(dxf).toContain('PLACES_PMR');
    expect(dxf).toContain('VOIES');
  });

  it('draws one arrow polyline (not a plain centerline) for a single-loaded aisle', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    const polylineCount = (dxf.match(/LWPOLYLINE/g) || []).length;
    // 1 contour + 2 stalls + 1 arrow = 4 LWPOLYLINE entities (no plain centerline for single-loaded)
    expect(polylineCount).toBe(4);
  });

  it('draws two arrows plus a dashed centerline divider for a double-loaded aisle', () => {
    const dxf = exportConfigToDxf(doubleLoadedConfig, boundary, exclusions);
    const polylineCount = (dxf.match(/LWPOLYLINE/g) || []).length;
    // 1 contour + 2 stalls + 2 arrows + 1 centerline divider = 6 LWPOLYLINE entities
    expect(polylineCount).toBe(6);
    expect(dxf).toContain('VOIES_SEPARATEUR');
  });

  it('places the standard stall on PLACES and the PMR stall on PLACES_PMR', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    expect(findLayerOfPolylineContaining(dxf, '10\n0\n20\n0')).toBe('PLACES');
    expect(findLayerOfPolylineContaining(dxf, '10\n2.5\n20\n0')).toBe('PLACES_PMR');
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/export/dxfExporter.test.ts`
Expected: FAIL sur les tests 2 et 3 (le calque VOIES dessine encore un trait simple, pas de flèches ni de calque VOIES_SEPARATEUR) — le test 1 et 4 peuvent déjà passer selon l'implémentation actuelle, ce n'est pas grave, l'important est que Step 4 fasse passer les 4.

- [ ] **Step 3: Modifier `exportConfigToDxf`**

Dans `src/export/dxfExporter.ts`, ajouter l'import de `aisleDirectionArrows` :

```typescript
import { aisleDirectionArrows } from '../geometry/aisleRendering';
```

Remplacer le bloc du calque VOIES (actuellement `d.addLayer('VOIES', ...); d.setActiveLayer('VOIES'); for (const aisle of config.aisles) { d.drawPolyline(ringToPolylinePoints(aisle.centerline), false); }`) par :

```typescript
  d.addLayer('VOIES', Drawing.ACI.YELLOW, 'CONTINUOUS');
  d.addLayer('VOIES_SEPARATEUR', Drawing.ACI.YELLOW, 'DASHED');
  for (const aisle of config.aisles) {
    if (config.loadType === 'double') {
      d.setActiveLayer('VOIES_SEPARATEUR');
      d.drawPolyline(ringToPolylinePoints(aisle.centerline), false);
    }
    d.setActiveLayer('VOIES');
    for (const arrow of aisleDirectionArrows(aisle, config.loadType)) {
      d.drawPolyline(ringToPolylinePoints(arrow), true);
    }
  }
```

Le reste de la fonction (calques CONTOUR, EXCLUSIONS, PLACES, PLACES_PMR) ne change pas.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/export/dxfExporter.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Lancer la suite complète**

Run: `npx vitest run`
Expected: PASS (tous les fichiers, y compris `aisleRendering.test.ts` de Task 1)

- [ ] **Step 6: Vérifier le build**

Run: `npm run build`
Expected: aucune erreur

- [ ] **Step 7: Commit**

```bash
git add src/export/dxfExporter.ts src/export/dxfExporter.test.ts
git commit -m "feat: draw direction arrows and dashed divider on the VOIES DXF layer instead of a plain centerline"
```

## Context (pour ce task)

Ce task s'appuie sur `aisleDirectionArrows` (Task 1). `Drawing.ACI` et la structure générale de `dxfExporter.ts` sont déjà en place (Task 12 du plan V1) — seul le bloc VOIES change. La vérification de l'API `dxf-writer` pour le linetype DASHED a déjà été faite lors de la rédaction de ce plan (voir note en tête de task) : `addLayer(name, colorNumber, lineTypeName)` accepte directement `'DASHED'` sans configuration supplémentaire.

---

## Backlog (hors périmètre de ce plan)

- Distinction visuelle entre le contour du terrain et les zones d'exclusion (actuellement même style Leaflet.Draw par défaut) — notée dans la spec comme limitation acceptée.
- Refonte globale de l'interface (esthétique, disposition) — reportée par l'utilisateur à une itération séparée.
