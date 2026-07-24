# Corrections places/voies/accès/PMR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the stall-divider-line bug, replace the access-point marker with a 2-point access line, add an explicit-label drawing toolbar, fix the double-loaded aisle arrow placement, and add a PMR wheelchair pictogram — on both the map preview and the DXF export.

**Architecture:** Pure geometry functions in `src/geometry/` stay framework-agnostic and unit-tested; `PlanOverlay.tsx` and `dxfExporter.ts` are the two consumers that render the same geometry to Leaflet and to DXF respectively. The access-point data model moves from `LatLng[]` (markers) to `[LatLng, LatLng][]` (lines) in the Zustand store and the project file format; `App.tsx` is the single place that reduces each line to a midpoint before calling the solver, so none of the solver/geometry function signatures change.

**Tech Stack:** React + TypeScript, react-leaflet + Leaflet.Draw, Zustand, dxf-writer, Vitest.

---

### Task 1: Fix stall divider lines to separate back-to-back rows

**Files:**
- Modify: `src/geometry/stallMarkings.ts`
- Test: `src/geometry/stallMarkings.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/geometry/stallMarkings.test.ts` (after the existing `describe` block's last test, still inside `describe('stallDividerLines', ...)`):

```typescript
  it('draws a separator between two rows placed back-to-back with no aisle between them', () => {
    const rowA = makeStall('rowA-s1', 0, 2.5, 0, 5); // front at y=0, back at y=5
    const rowB = makeStall('rowB-s1', 0, 2.5, 5, 10); // front at y=5 (touches rowA's back), back at y=10
    const lines = stallDividerLines([rowA, rowB]);

    // left+right of rowA (2) + left+right of rowB (2, dedup with rowA's left/right since
    // same x-range but different y so NOT deduped) + the shared back/front edge at y=5 (1) = 5
    expect(lines).toHaveLength(5);
    const sharedEdge = lines.find(([a, b]) => a.y === 5 && b.y === 5);
    expect(sharedEdge).toBeDefined();
  });

  it('does not draw a back edge when a stall has no back neighbor (open to an aisle)', () => {
    const stalls = [makeStall('s1', 0, 2.5, 0, 5)];
    const lines = stallDividerLines(stalls);
    const backEdge = lines.find(([a, b]) => a.y === 5 && b.y === 5);
    expect(backEdge).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- stallMarkings`
Expected: FAIL — `draws a separator between two rows placed back-to-back...` fails because `lines` has length 4, not 5 (no back-edge logic exists yet).

- [ ] **Step 3: Rewrite `stallDividerLines` with edge-key deduplication**

Replace the full contents of `src/geometry/stallMarkings.ts`:

```typescript
// src/geometry/stallMarkings.ts
import { Point } from './projection';
import { Stall } from './types';

function cornersMatch(a: Point, b: Point, epsilon = 1e-6): boolean {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
}

function edgeKey(a: Point, b: Point): string {
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const pa = `${round(a.x)},${round(a.y)}`;
  const pb = `${round(b.x)},${round(b.y)}`;
  return pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
}

export function stallDividerLines(stalls: Stall[]): [Point, Point][] {
  const lines: [Point, Point][] = [];
  const seen = new Set<string>();

  function addEdge(a: Point, b: Point) {
    const key = edgeKey(a, b);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    lines.push([a, b]);
  }

  for (const stall of stalls) {
    const [frontLeft, frontRight, backRight, backLeft] = stall.corners;

    // Gauche et droite sont toujours candidates : le dédoublonnage par clé de segment
    // absorbe le fait que le côté droit d'une place est la même arête géométrique que
    // le côté gauche de sa voisine (pas besoin de logique conditionnelle par voisinage).
    addEdge(frontLeft, backLeft);
    addEdge(frontRight, backRight);

    // L'arête arrière n'est dessinée que si une autre place a son avant qui coïncide
    // exactement avec elle (deux rangées collées dos-à-dos, sans allée entre elles).
    // Sinon elle reste ouverte : elle donne sur une allée ou sur le bord du terrain.
    const hasBackNeighbor = stalls.some(
      (other) =>
        other !== stall &&
        cornersMatch(other.corners[0], backLeft) &&
        cornersMatch(other.corners[1], backRight)
    );
    if (hasBackNeighbor) {
      addEdge(backLeft, backRight);
    }
  }

  return lines;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- stallMarkings`
Expected: PASS (all tests, including the two new ones and the four pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/geometry/stallMarkings.ts src/geometry/stallMarkings.test.ts
git commit -m "fix: draw separator between back-to-back parking rows"
```

---

### Task 2: Fix double-loaded aisle arrows to sit mid-lane instead of on the separator line

**Files:**
- Modify: `src/geometry/aisleRendering.ts`
- Test: `src/geometry/aisleRendering.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the existing `it('returns two opposite-facing arrows for a double-loaded aisle', ...)` test in `src/geometry/aisleRendering.test.ts` with:

```typescript
  it('returns two opposite-facing arrows for a double-loaded aisle, offset off the centerline into each lane', () => {
    const arrows = aisleDirectionArrows(singleAisle, 'double');
    expect(arrows).toHaveLength(2);
    // arrowWidth = width * 0.2 = 1, arrowLength = min(arrowWidth * 2, length * 0.8) = 2
    // mid = (15, 0), perp = (0, 1), laneOffset = width / 4 = 1.25
    // lane A center = mid + perp * laneOffset = (15, 1.25), pointing +x
    // tip = (15 + 1, 1.25) = (16, 1.25)
    expect(arrows[0][0].x).toBeCloseTo(16, 6);
    expect(arrows[0][0].y).toBeCloseTo(1.25, 6);
    // lane B center = mid - perp * laneOffset = (15, -1.25), pointing -x
    // tip = (15 - 1, -1.25) = (14, -1.25)
    expect(arrows[1][0].x).toBeCloseTo(14, 6);
    expect(arrows[1][0].y).toBeCloseTo(-1.25, 6);
    // neither arrow has any point exactly on the centerline (y = 0)
    for (const arrow of [...arrows[0], ...arrows[1]]) {
      expect(Math.abs(arrow.y)).toBeGreaterThan(0.1);
    }
  });
```

Update the following existing test in the same file to match the new arrow length formula (double-loaded now shares the single-loaded 0.8 length cap and offsets perpendicularly instead of shrinking to fit 2/3 of the length):

```typescript
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
```

(This test's assertions don't change, but it now exercises the new perpendicular-offset code path — kept here for clarity that it must still pass.)

- [ ] **Step 2: Run tests to verify the new/changed test fails**

Run: `npm test -- aisleRendering`
Expected: FAIL on `returns two opposite-facing arrows for a double-loaded aisle, offset off the centerline into each lane` — current code puts both arrows at y=0 (on the centerline) at x=10 and x=20, not offset.

- [ ] **Step 3: Rewrite the double-loaded branch of `aisleDirectionArrows`**

In `src/geometry/aisleRendering.ts`, replace the double-loaded block (everything from the `// Les deux flèches...` comment to the final `return` statement) with:

```typescript
  // Une flèche par voie (par sens), décalée perpendiculairement à la centerline de
  // ±aisle.width/4 (milieu de chaque demi-largeur), toutes deux au milieu de la longueur
  // du segment — pas sur la ligne séparatrice, et pas répétées le long de la voie.
  const arrowLength = Math.min(arrowWidth * 2, length * 0.8);
  const mid: Point = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const perp: Point = { x: -direction.y, y: direction.x };
  const laneOffset = aisle.width / 4;
  const laneACenter: Point = { x: mid.x + perp.x * laneOffset, y: mid.y + perp.y * laneOffset };
  const laneBCenter: Point = { x: mid.x - perp.x * laneOffset, y: mid.y - perp.y * laneOffset };
  const reverseDirection: Point = { x: -direction.x, y: -direction.y };

  return [
    makeArrow(laneACenter, direction, arrowLength, arrowWidth),
    makeArrow(laneBCenter, reverseDirection, arrowLength, arrowWidth),
  ];
}
```

The single-loaded branch above it is unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- aisleRendering`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/geometry/aisleRendering.ts src/geometry/aisleRendering.test.ts
git commit -m "fix: offset double-loaded aisle arrows into each lane, off the separator line"
```

---

### Task 3: PMR pictogram geometry

**Files:**
- Create: `src/geometry/pmrPictogram.ts`
- Test: `src/geometry/pmrPictogram.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/geometry/pmrPictogram.test.ts`:

```typescript
// src/geometry/pmrPictogram.test.ts
import { describe, it, expect } from 'vitest';
import { pmrPictogram } from './pmrPictogram';
import { Stall } from './types';

const axisAlignedStall: Stall = {
  id: 's1',
  corners: [{ x: 0, y: 0 }, { x: 3.3, y: 0 }, { x: 3.3, y: 5 }, { x: 0, y: 5 }],
  isPmr: true,
};

describe('pmrPictogram', () => {
  it('centers the head and wheel circles horizontally on the stall for an axis-aligned stall', () => {
    const pict = pmrPictogram(axisAlignedStall);
    // width=3.3, depth=5, size = min(3.3, 5) * 0.6 = 1.98
    // center = (1.65, 2.5), alongRow = (1, 0), intoStall = (0, 1)
    expect(pict.headCircle.center.x).toBeCloseTo(1.65, 6);
    expect(pict.wheelCircle.center.x).toBeCloseTo(1.65, 6);
    // headCenter = center + intoStall * (size * 0.28) = (1.65, 2.5 + 0.5544) = (1.65, 3.0544)
    expect(pict.headCircle.center.y).toBeCloseTo(3.0544, 4);
    // wheelCenter = center + intoStall * (-size * 0.12) = (1.65, 2.5 - 0.2376) = (1.65, 2.2624)
    expect(pict.wheelCircle.center.y).toBeCloseTo(2.2624, 4);
    expect(pict.wheelCircle.radius).toBeCloseTo(1.98 * 0.22, 6);
    expect(pict.headCircle.radius).toBeCloseTo(1.98 * 0.12, 6);
  });

  it('produces a bent 3-point body line', () => {
    const pict = pmrPictogram(axisAlignedStall);
    expect(pict.bodyPolyline).toHaveLength(3);
    // p1 = center + intoStall * (size * 0.16) = (1.65, 2.5 + 0.3168) = (1.65, 2.8168)
    expect(pict.bodyPolyline[0].x).toBeCloseTo(1.65, 6);
    expect(pict.bodyPolyline[0].y).toBeCloseTo(2.8168, 4);
    // p2 = center + intoStall * (-size * 0.02) = (1.65, 2.5 - 0.0396) = (1.65, 2.4604)
    expect(pict.bodyPolyline[1].y).toBeCloseTo(2.4604, 4);
    // p3 = center + intoStall * (-size * 0.05) + alongRow * (size * 0.18)
    //    = (1.65 + 0.3564, 2.5 - 0.099) = (2.0064, 2.401)
    expect(pict.bodyPolyline[2].x).toBeCloseTo(2.0064, 4);
    expect(pict.bodyPolyline[2].y).toBeCloseTo(2.401, 4);
  });

  it('keeps every primitive within the stall footprint regardless of rotation', () => {
    const rotatedStall: Stall = {
      id: 's2',
      // a 90°-rotated square footprint of the same size, offset away from the origin
      corners: [{ x: 10, y: 10 }, { x: 10, y: 13.3 }, { x: 5, y: 13.3 }, { x: 5, y: 10 }],
      isPmr: true,
    };
    const pict = pmrPictogram(rotatedStall);
    const minX = 5, maxX = 10, minY = 10, maxY = 13.3;
    for (const p of [pict.headCircle.center, pict.wheelCircle.center, ...pict.bodyPolyline]) {
      expect(p.x).toBeGreaterThanOrEqual(minX);
      expect(p.x).toBeLessThanOrEqual(maxX);
      expect(p.y).toBeGreaterThanOrEqual(minY);
      expect(p.y).toBeLessThanOrEqual(maxY);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pmrPictogram`
Expected: FAIL with "Cannot find module './pmrPictogram'".

- [ ] **Step 3: Implement `pmrPictogram`**

Create `src/geometry/pmrPictogram.ts`:

```typescript
// src/geometry/pmrPictogram.ts
import { Point } from './projection';
import { Stall } from './types';

export interface PmrPictogram {
  headCircle: { center: Point; radius: number };
  wheelCircle: { center: Point; radius: number };
  bodyPolyline: [Point, Point, Point];
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  return { x: v.x / len, y: v.y / len };
}

// Pictogramme fauteuil roulant simplifié : un cercle (tête), un cercle (roue arrière) et
// une ligne coudée à 3 points (dossier -> assise -> repose-pied), construits dans le repère
// local de la place (alongRow / intoStall) pour rester correctement orientés quel que soit
// l'angle de la place (45°/60°/90°, et la rotation globale de la rangée).
export function pmrPictogram(stall: Stall): PmrPictogram {
  const [frontLeft, frontRight, , backLeft] = stall.corners;
  const alongRow = normalize(subtract(frontRight, frontLeft));
  const intoStall = normalize(subtract(backLeft, frontLeft));
  const width = distance(frontLeft, frontRight);
  const depth = distance(frontLeft, backLeft);
  const size = Math.min(width, depth) * 0.6;

  const center: Point = {
    x: stall.corners.reduce((sum, p) => sum + p.x, 0) / stall.corners.length,
    y: stall.corners.reduce((sum, p) => sum + p.y, 0) / stall.corners.length,
  };

  const at = (alongT: number, intoT: number): Point => ({
    x: center.x + alongRow.x * alongT + intoStall.x * intoT,
    y: center.y + alongRow.y * alongT + intoStall.y * intoT,
  });

  return {
    headCircle: { center: at(0, size * 0.28), radius: size * 0.12 },
    wheelCircle: { center: at(0, -size * 0.12), radius: size * 0.22 },
    bodyPolyline: [at(0, size * 0.16), at(0, -size * 0.02), at(size * 0.18, -size * 0.05)],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pmrPictogram`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/geometry/pmrPictogram.ts src/geometry/pmrPictogram.test.ts
git commit -m "feat: add PMR wheelchair pictogram geometry"
```

---

### Task 4: Render the PMR pictogram on the map and in the DXF export

**Files:**
- Modify: `src/components/PlanOverlay.tsx`
- Modify: `src/export/dxfExporter.ts`
- Test: `src/export/dxfExporter.test.ts`

- [ ] **Step 1: Write the failing DXF test**

Add to `src/export/dxfExporter.test.ts`, inside the `describe('exportConfigToDxf', ...)` block:

```typescript
  it('draws the PMR pictogram (2 circles + 1 bent body line) on PLACES_PMR for each PMR stall', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions);
    // 2 CIRCLE entities (head + wheel) for the one PMR stall
    const circleCount = (dxf.match(/0\nCIRCLE/g) || []).length;
    expect(circleCount).toBe(2);
    const blocks = polylineBlocks(dxf);
    const pmrBodyLine = blocks.find((b) => b.layer === 'PLACES_PMR' && b.vertexCount === 3);
    expect(pmrBodyLine).toBeDefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dxfExporter`
Expected: FAIL — `circleCount` is 0 (no CIRCLE entities exist yet), and no 3-vertex PLACES_PMR block exists.

- [ ] **Step 3: Wire the pictogram into `dxfExporter.ts`**

In `src/export/dxfExporter.ts`, add the import and extend the `PLACES_PMR` block:

```typescript
import { pmrPictogram } from '../geometry/pmrPictogram';
```

Replace:

```typescript
  d.setActiveLayer('PLACES_PMR');
  for (const stall of config.stalls) {
    if (stall.isPmr) {
      d.drawPolyline(ringToPolylinePoints(stall.corners), true);
    }
  }
```

with:

```typescript
  d.setActiveLayer('PLACES_PMR');
  for (const stall of config.stalls) {
    if (stall.isPmr) {
      d.drawPolyline(ringToPolylinePoints(stall.corners), true);
      const pict = pmrPictogram(stall);
      d.drawCircle(pict.headCircle.center.x, pict.headCircle.center.y, pict.headCircle.radius);
      d.drawCircle(pict.wheelCircle.center.x, pict.wheelCircle.center.y, pict.wheelCircle.radius);
      d.drawPolyline(ringToPolylinePoints(pict.bodyPolyline), false);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- dxfExporter`
Expected: PASS (all tests, including the pre-existing ones — the PMR block still emits its closed 4-vertex rectangle first, so the earlier "1 PMR shape, 4 vertices" test still finds exactly one 4-vertex `PLACES_PMR` block).

- [ ] **Step 5: Render the pictogram on the map**

In `src/components/PlanOverlay.tsx`, add the import:

```typescript
import { pmrPictogram } from '../geometry/pmrPictogram';
```

Replace the `pmrStalls.map(...)` block with:

```typescript
      {pmrStalls.map((stall) => {
        const pict = pmrPictogram(stall);
        return (
          <Fragment key={stall.id}>
            <Polygon
              positions={toLatLngPositions(stall.corners)}
              pathOptions={{ color: '#1d5fd6', weight: 1, fillColor: '#1d5fd6', fillOpacity: 0.7 }}
            />
            <Circle
              center={projection.toLatLng(pict.headCircle.center)}
              radius={pict.headCircle.radius}
              pathOptions={{ color: '#ffffff', weight: 1, fillColor: '#ffffff', fillOpacity: 1 }}
            />
            <Circle
              center={projection.toLatLng(pict.wheelCircle.center)}
              radius={pict.wheelCircle.radius}
              pathOptions={{ color: '#ffffff', weight: 1.5, fill: false }}
            />
            <Polyline positions={toLatLngPositions(pict.bodyPolyline)} pathOptions={{ color: '#ffffff', weight: 1.5 }} />
          </Fragment>
        );
      })}
```

Add `Circle` to the `react-leaflet` import at the top of the file:

```typescript
import { Circle, Fragment, Polygon, Polyline } from 'react-leaflet';
```

(Note: `Fragment` comes from `react`, not `react-leaflet` — keep the existing `import { Fragment, useMemo } from 'react';` line and only add `Circle` to the `react-leaflet` import line, i.e. `import { Circle, Polygon, Polyline } from 'react-leaflet';`.)

- [ ] **Step 6: Manual verification**

Run `npm run dev`, trace a small boundary with an access line (see Task 7 for how access is drawn — if Task 7 isn't done yet, temporarily skip manual verification and rely on the automated tests; revisit after Task 7/8), generate a plan, and confirm PMR stalls show a white pictogram over the blue fill.

- [ ] **Step 7: Commit**

```bash
git add src/components/PlanOverlay.tsx src/export/dxfExporter.ts src/export/dxfExporter.test.ts
git commit -m "feat: render PMR pictogram on map and in DXF export"
```

---

### Task 5: Access lines — store and project-file data model

**Files:**
- Modify: `src/store/projectStore.ts`
- Modify: `src/store/projectFile.ts`
- Test: `src/store/projectFile.test.ts`

- [ ] **Step 1: Write the failing test**

Replace `src/store/projectFile.test.ts` in full:

```typescript
// src/store/projectFile.test.ts
import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject, ProjectData } from './projectFile';
import { DEFAULT_SOLVER_PARAMS } from '../geometry/types';

const sampleProject: ProjectData = {
  boundary: [{ lat: 43.6, lng: 3.88 }, { lat: 43.601, lng: 3.88 }, { lat: 43.601, lng: 3.882 }],
  exclusions: [],
  accessLines: [[{ lat: 43.6, lng: 3.881 }, { lat: 43.6001, lng: 3.881 }]],
  params: DEFAULT_SOLVER_PARAMS,
};

describe('projectFile', () => {
  it('round-trips a project through JSON serialization', () => {
    const json = serializeProject(sampleProject);
    const parsed = deserializeProject(json);
    expect(parsed.boundary).toEqual(sampleProject.boundary);
    expect(parsed.accessLines).toEqual(sampleProject.accessLines);
    expect(parsed.params.standardStallWidth).toBe(DEFAULT_SOLVER_PARAMS.standardStallWidth);
  });

  it('throws a clear error on invalid JSON', () => {
    expect(() => deserializeProject('not json')).toThrow();
  });

  it('throws a clear error when the JSON is well-formed but has the wrong shape (empty object)', () => {
    expect(() => deserializeProject('{}')).toThrow();
  });

  it('throws a clear error when boundary is not an array', () => {
    expect(() =>
      deserializeProject(
        JSON.stringify({ boundary: 'not an array', exclusions: [], accessLines: [], params: DEFAULT_SOLVER_PARAMS })
      )
    ).toThrow();
  });

  it('throws a clear error when a required params field is missing', () => {
    const { angleDeg: _angleDeg, ...paramsWithoutAngle } = DEFAULT_SOLVER_PARAMS;
    expect(() =>
      deserializeProject(JSON.stringify({ boundary: [], exclusions: [], accessLines: [], params: paramsWithoutAngle }))
    ).toThrow();
  });

  it('throws a clear error when accessLines is missing (old accessPoints-format project files)', () => {
    expect(() =>
      deserializeProject(
        JSON.stringify({
          boundary: [],
          exclusions: [],
          accessPoints: [{ lat: 43.6, lng: 3.881 }],
          params: DEFAULT_SOLVER_PARAMS,
        })
      )
    ).toThrow(/accessLines/);
  });

  it('throws a clear error when an accessLines entry is not a pair of points', () => {
    expect(() =>
      deserializeProject(
        JSON.stringify({
          boundary: [],
          exclusions: [],
          accessLines: [[{ lat: 43.6, lng: 3.881 }]],
          params: DEFAULT_SOLVER_PARAMS,
        })
      )
    ).toThrow(/accessLines/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- projectFile`
Expected: FAIL — `ProjectData` still has `accessPoints`, not `accessLines`, so this won't even type-check/build correctly until Step 3.

- [ ] **Step 3: Update `projectFile.ts`**

Replace `src/store/projectFile.ts` in full:

```typescript
// src/store/projectFile.ts
import { LatLng } from '../geometry/projection';
import { DEFAULT_SOLVER_PARAMS, SolverParams } from '../geometry/types';

export interface ProjectData {
  boundary: LatLng[];
  exclusions: LatLng[][];
  accessLines: [LatLng, LatLng][];
  params: SolverParams;
}

type SerializableParams = Omit<SolverParams, 'pmrRatio'>;

interface SerializedProject {
  boundary: LatLng[];
  exclusions: LatLng[][];
  accessLines: [LatLng, LatLng][];
  params: SerializableParams;
}

export function serializeProject(project: ProjectData): string {
  const { pmrRatio: _pmrRatio, ...serializableParams } = project.params;
  const serialized: SerializedProject = {
    boundary: project.boundary,
    exclusions: project.exclusions,
    accessLines: project.accessLines,
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
  if (!Array.isArray(parsed.accessLines)) {
    throw new Error(
      'Fichier de projet invalide : "accessLines" est manquant ou n\'est pas un tableau (ancien format de fichier avec "accessPoints" ? retrace les accès après import).'
    );
  }
  for (const line of parsed.accessLines) {
    if (!Array.isArray(line) || line.length !== 2) {
      throw new Error('Fichier de projet invalide : chaque entrée de "accessLines" doit être une paire de 2 points.');
    }
  }
  // Note V1 : le contenu détaillé des points (lat/lng bien numériques) n'est pas validé —
  // acceptable pour un outil interne mono-utilisateur ; à revoir si l'outil est un jour
  // partagé plus largement avec des fichiers moins fiables.
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
    accessLines: parsed.accessLines,
    params: { ...parsed.params, pmrRatio: DEFAULT_SOLVER_PARAMS.pmrRatio },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- projectFile`
Expected: PASS (all tests).

- [ ] **Step 5: Update `projectStore.ts`**

Replace `src/store/projectStore.ts` in full:

```typescript
// src/store/projectStore.ts
import { create } from 'zustand';
import { LatLng } from '../geometry/projection';
import { DEFAULT_SOLVER_PARAMS, ParkingConfig, SolverParams } from '../geometry/types';

interface ProjectState {
  boundary: LatLng[];
  exclusions: LatLng[][];
  accessLines: [LatLng, LatLng][];
  params: SolverParams;
  configs: ParkingConfig[];
  selectedConfigIndex: number;

  setBoundary: (boundary: LatLng[]) => void;
  setExclusions: (exclusions: LatLng[][]) => void;
  setAccessLines: (lines: [LatLng, LatLng][]) => void;
  setParams: (params: Partial<SolverParams>) => void;
  setConfigs: (configs: ParkingConfig[]) => void;
  selectConfig: (index: number) => void;
  loadProject: (data: { boundary: LatLng[]; exclusions: LatLng[][]; accessLines: [LatLng, LatLng][]; params: SolverParams }) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  boundary: [],
  exclusions: [],
  accessLines: [],
  params: DEFAULT_SOLVER_PARAMS,
  configs: [],
  selectedConfigIndex: 0,

  setBoundary: (boundary) => set({ boundary, configs: [], selectedConfigIndex: 0 }),
  setExclusions: (exclusions) => set({ exclusions, configs: [], selectedConfigIndex: 0 }),
  setAccessLines: (lines) => set({ accessLines: lines, configs: [], selectedConfigIndex: 0 }),
  setParams: (params) => set((state) => ({ params: { ...state.params, ...params } })),
  setConfigs: (configs) => set({ configs, selectedConfigIndex: 0 }),
  selectConfig: (index) => set({ selectedConfigIndex: index }),
  loadProject: (data) => set({ ...data, configs: [], selectedConfigIndex: 0 }),
}));
```

- [ ] **Step 6: Commit**

```bash
git add src/store/projectStore.ts src/store/projectFile.ts src/store/projectFile.test.ts
git commit -m "feat: model access points as 2-point lines in store and project file"
```

---

### Task 6: Wire access lines into App.tsx (validation, midpoint reduction, solver call)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update `App.tsx`**

This task has no automated test (consistent with the rest of `App.tsx`, which is verified manually per the spec) — it wires already-tested pieces together. Replace `src/App.tsx` in full:

```typescript
// src/App.tsx
import { useMemo } from 'react';
import { polygon as turfPolygon, point as turfPoint } from '@turf/helpers';
import kinks from '@turf/kinks';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { MapView } from './components/MapView';
import { ParamsPanel } from './components/ParamsPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { Legend } from './components/Legend';
import { useProjectStore } from './store/projectStore';
import { makeProjection, LatLng } from './geometry/projection';
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
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function lineMidpoint(line: [LatLng, LatLng]): LatLng {
  return { lat: (line[0].lat + line[1].lat) / 2, lng: (line[0].lng + line[1].lng) / 2 };
}

export default function App() {
  const boundary = useProjectStore((s) => s.boundary);
  const exclusions = useProjectStore((s) => s.exclusions);
  const accessLines = useProjectStore((s) => s.accessLines);
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

    const invalidParamEntry = Object.entries(params).find(
      ([key, value]) => key !== 'pmrRatio' && key !== 'angleDeg' && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    );
    if (invalidParamEntry) {
      alert(`Le paramètre "${invalidParamEntry[0]}" doit être un nombre positif — vérifie les valeurs saisies.`);
      return;
    }

    if (accessLines.length === 0) {
      alert("Trace au moins une ligne d'accès avant de générer un plan — nécessaire pour placer les places PMR et raccorder les voies.");
      return;
    }

    const ring = [...boundary, boundary[0]].map((p) => [p.lng, p.lat]);
    const kinksResult = kinks(turfPolygon([ring]));
    if (kinksResult.features.length > 0) {
      alert('Le contour tracé se croise lui-même — corrige le tracé avant de générer un plan.');
      return;
    }

    const boundaryPolygon = turfPolygon([ring]);
    const accessLinePoints = accessLines.flatMap((line) => line);
    const outsideAccessPoints = accessLinePoints.filter(
      (p) => !booleanPointInPolygon(turfPoint([p.lng, p.lat]), boundaryPolygon)
    );
    if (outsideAccessPoints.length > 0) {
      alert(`${outsideAccessPoints.length} extrémité(s) de ligne d'accès sont en dehors du contour tracé — déplace-les sur le contour avant de générer un plan.`);
      return;
    }

    const exclusionPolygons = exclusions.map((exclusionRing) =>
      turfPolygon([[...exclusionRing, exclusionRing[0]].map((p) => [p.lng, p.lat])])
    );
    const accessPointsInExclusion = accessLinePoints.filter((p) =>
      exclusionPolygons.some((exclusionPolygon) => booleanPointInPolygon(turfPoint([p.lng, p.lat]), exclusionPolygon))
    );
    if (accessPointsInExclusion.length > 0) {
      alert(`${accessPointsInExclusion.length} extrémité(s) de ligne d'accès sont à l'intérieur d'une zone d'exclusion — déplace-les avant de générer un plan.`);
      return;
    }

    const localBoundary = boundary.map((p) => projection.toLocal(p));
    const localExclusions = exclusions.map((ring) => ring.map((p) => projection.toLocal(p)));
    const localAccessPoints = accessLines.map((line) => projection.toLocal(lineMidpoint(line)));

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
    const localAccessLines: [ReturnType<typeof projection.toLocal>, ReturnType<typeof projection.toLocal>][] =
      accessLines.map((line) => [projection.toLocal(line[0]), projection.toLocal(line[1])]);
    const dxf = exportConfigToDxf(configs[selectedConfigIndex], localBoundary, localExclusions, localAccessLines);
    downloadFile('plan-parking.dxf', dxf, 'application/dxf');
  };

  const handleExportProject = () => {
    const json = serializeProject({ boundary, exclusions, accessLines, params });
    downloadFile('projet-parking.json', json, 'application/json');
  };

  const handleImportProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = deserializeProject(reader.result as string);
        loadProject(data);
      } catch (error) {
        alert(`Impossible de charger ce fichier de projet : ${error instanceof Error ? error.message : 'erreur inconnue'}.`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app-layout">
      <div className="map-container">
        <MapView planConfig={configs[selectedConfigIndex]} projection={projection} />
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
        <Legend />
      </div>
    </div>
  );
}
```

Note: `handleExportDxf` now passes a fourth argument to `exportConfigToDxf` — this is implemented in Task 8. Until Task 8 lands, this file will not type-check; that's expected and resolved by the end of Task 8. If executing tasks in strict one-at-a-time order with a build/typecheck gate between every task, do Task 8 immediately after this one (Task 7 — the toolbar — can also come before or after, it doesn't affect this file).

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: reduce access lines to midpoints for solver, validate both endpoints"
```

---

### Task 7: Custom labeled drawing toolbar with tagged layers (contour / exclusion / access line)

**Files:**
- Modify: `src/components/MapView.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Replace `DrawingLayer` and toolbar in `MapView.tsx`**

This is a UI-wiring task with no automated test, consistent with the rest of `MapView.tsx` (verified manually per the spec). Replace `src/components/MapView.tsx` in full:

```typescript
// src/components/MapView.tsx
import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { useProjectStore } from '../store/projectStore';
import { PlanOverlay, PlanProjection } from './PlanOverlay';
import { ParkingConfig } from '../geometry/types';

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

type CustomLayerType = 'boundary' | 'exclusion' | 'access';

interface TaggedLayer extends L.Layer {
  customType?: CustomLayerType;
}

function DrawingToolbar() {
  const map = useMap();
  const setBoundary = useProjectStore((s) => s.setBoundary);
  const setExclusions = useProjectStore((s) => s.setExclusions);
  const setAccessLines = useProjectStore((s) => s.setAccessLines);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);

  useEffect(() => {
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    function syncStoreFromLayers() {
      const boundaryRings: L.LatLng[][] = [];
      const exclusionRings: L.LatLng[][] = [];
      const accessLines: [L.LatLng, L.LatLng][] = [];

      drawnItems.eachLayer((layer: TaggedLayer) => {
        if (layer.customType === 'access' && layer instanceof L.Polyline) {
          const points = layer.getLatLngs() as L.LatLng[];
          if (points.length === 2) {
            accessLines.push([points[0], points[1]]);
          }
        } else if (layer.customType === 'boundary' && layer instanceof L.Polygon) {
          boundaryRings.push((layer.getLatLngs()[0] as L.LatLng[]).slice());
        } else if (layer.customType === 'exclusion' && layer instanceof L.Polygon) {
          exclusionRings.push((layer.getLatLngs()[0] as L.LatLng[]).slice());
        }
      });

      setBoundary(boundaryRings[0] ? boundaryRings[0].map((p) => ({ lat: p.lat, lng: p.lng })) : []);
      setExclusions(exclusionRings.map((ring) => ring.map((p) => ({ lat: p.lat, lng: p.lng }))));
      setAccessLines(accessLines.map(([a, b]) => [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }]));
    }

    return () => {
      map.removeLayer(drawnItems);
    };
  }, [map, setBoundary, setExclusions, setAccessLines]);

  function startDrawing(type: CustomLayerType) {
    const drawnItems = drawnItemsRef.current;
    if (!drawnItems) return;

    if (type === 'boundary') {
      drawnItems.eachLayer((layer: TaggedLayer) => {
        if (layer.customType === 'boundary') {
          drawnItems.removeLayer(layer);
        }
      });
    }

    const handler =
      type === 'access'
        ? new (L as any).Draw.Polyline(map, { maxPoints: 2, shapeOptions: { color: '#2a9df4' } })
        : new (L as any).Draw.Polygon(map, { shapeOptions: { color: type === 'boundary' ? '#3388ff' : '#ff5555' } });

    function onCreated(event: any) {
      const layer: TaggedLayer = event.layer;
      layer.customType = type;
      drawnItems.addLayer(layer);
      syncStoreFromLayersRef.current();
      map.off((L as any).Draw.Event.CREATED, onCreated);
    }

    map.on((L as any).Draw.Event.CREATED, onCreated);
    handler.enable();
  }

  // syncStoreFromLayers est redéfinie à chaque rendu (elle capture les setters actuels) —
  // startDrawing y accède via une ref pour toujours appeler la version la plus récente,
  // sans avoir à la recréer dans sa propre closure à chaque fois.
  const syncStoreFromLayersRef = useRef<() => void>(() => {});
  useEffect(() => {
    syncStoreFromLayersRef.current = () => {
      const drawnItems = drawnItemsRef.current;
      if (!drawnItems) return;
      const boundaryRings: L.LatLng[][] = [];
      const exclusionRings: L.LatLng[][] = [];
      const accessLines: [L.LatLng, L.LatLng][] = [];
      drawnItems.eachLayer((layer: TaggedLayer) => {
        if (layer.customType === 'access' && layer instanceof L.Polyline) {
          const points = layer.getLatLngs() as L.LatLng[];
          if (points.length === 2) accessLines.push([points[0], points[1]]);
        } else if (layer.customType === 'boundary' && layer instanceof L.Polygon) {
          boundaryRings.push((layer.getLatLngs()[0] as L.LatLng[]).slice());
        } else if (layer.customType === 'exclusion' && layer instanceof L.Polygon) {
          exclusionRings.push((layer.getLatLngs()[0] as L.LatLng[]).slice());
        }
      });
      setBoundary(boundaryRings[0] ? boundaryRings[0].map((p) => ({ lat: p.lat, lng: p.lng })) : []);
      setExclusions(exclusionRings.map((ring) => ring.map((p) => ({ lat: p.lat, lng: p.lng }))));
      setAccessLines(accessLines.map(([a, b]) => [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }]));
    };
  });

  function startEditing() {
    const drawnItems = drawnItemsRef.current;
    if (!drawnItems) return;
    const editHandler = new (L as any).EditToolbar.Edit(map, { featureGroup: drawnItems });
    editHandler.enable();
    map.once((L as any).Draw.Event.EDITED, () => syncStoreFromLayersRef.current());
  }

  function startDeleting() {
    const drawnItems = drawnItemsRef.current;
    if (!drawnItems) return;
    const deleteHandler = new (L as any).EditToolbar.Delete(map, { featureGroup: drawnItems });
    deleteHandler.enable();
    map.once((L as any).Draw.Event.DELETED, () => syncStoreFromLayersRef.current());
  }

  return (
    <div className="drawing-toolbar">
      <button onClick={() => startDrawing('boundary')}>Tracer le contour</button>
      <button onClick={() => startDrawing('exclusion')}>Zone d'exclusion</button>
      <button onClick={() => startDrawing('access')}>Point d'accès</button>
      <button onClick={startEditing}>Modifier</button>
      <button onClick={startDeleting}>Supprimer</button>
    </div>
  );
}

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
        maxZoom={22}
        maxNativeZoom={19}
      />
      <SearchBar />
      <DrawingToolbar />
      {planConfig && projection && <PlanOverlay config={planConfig} projection={projection} />}
    </MapContainer>
  );
}
```

- [ ] **Step 2: Hide the default Leaflet.Draw toolbar and style the custom one**

Add to `src/App.css`:

```css
.leaflet-draw-toolbar,
.leaflet-draw-section {
  display: none !important;
}

.drawing-toolbar {
  position: absolute;
  top: 10px;
  left: 340px;
  z-index: 1000;
  display: flex;
  gap: 0.4rem;
  background: white;
  padding: 0.5rem;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.drawing-toolbar button {
  white-space: nowrap;
}
```

- [ ] **Step 3: Manual verification**

Run `npm run dev` (see Task 9 for the `npm run build` typecheck gate — this task alone won't fully type-check until Task 8 updates `exportConfigToDxf`'s signature, but `npm run dev`'s dev-server transpilation will still let you click through the UI). Confirm:
- The default Leaflet.Draw icon toolbar is gone.
- "Tracer le contour" draws a polygon that becomes the boundary; drawing a second one replaces the first.
- "Zone d'exclusion" draws polygons that accumulate as exclusions.
- "Point d'accès" draws a 2-point line and stops after the second click (no need to press "Terminer").
- "Modifier" / "Supprimer" still work on any tagged layer.

- [ ] **Step 4: Commit**

```bash
git add src/components/MapView.tsx src/App.css
git commit -m "feat: replace icon toolbar with labeled buttons, draw access as a 2-point line"
```

---

### Task 8: Render access lines on the map and in the DXF export

**Files:**
- Modify: `src/components/PlanOverlay.tsx`
- Modify: `src/export/dxfExporter.ts`
- Test: `src/export/dxfExporter.test.ts`

- [ ] **Step 1: Write the failing DXF test**

Add to `src/export/dxfExporter.test.ts`, inside `describe('exportConfigToDxf', ...)`:

```typescript
  it('draws each access line as a 2-vertex polyline on a dedicated ACCES layer', () => {
    const accessLines: [{ x: number; y: number }, { x: number; y: number }][] = [
      [{ x: -2, y: 5 }, { x: 0, y: 5 }],
    ];
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions, accessLines);
    expect(dxf).toContain('ACCES');
    const blocks = polylineBlocks(dxf);
    const accesBlocks = blocks.filter((b) => b.layer === 'ACCES');
    expect(accesBlocks).toHaveLength(1);
    expect(accesBlocks[0].vertexCount).toBe(2);
  });

  it('draws no ACCES entities when no access lines are passed', () => {
    const dxf = exportConfigToDxf(sampleConfig, boundary, exclusions, []);
    const blocks = polylineBlocks(dxf);
    expect(blocks.filter((b) => b.layer === 'ACCES')).toHaveLength(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- dxfExporter`
Expected: FAIL — `exportConfigToDxf` doesn't accept a 4th argument yet (TypeScript error / undefined behavior), and no `ACCES` layer exists.

- [ ] **Step 3: Update `exportConfigToDxf` signature and add the ACCES layer**

In `src/export/dxfExporter.ts`, change the function signature:

```typescript
export function exportConfigToDxf(
  config: ParkingConfig,
  boundary: Point[],
  exclusions: Point[][],
  accessLines: [Point, Point][] = []
): string {
```

Add, right after the `EXCLUSIONS` layer block (before the `PLACES` layer block):

```typescript
  d.addLayer('ACCES', Drawing.ACI.GREEN, 'CONTINUOUS');
  d.setActiveLayer('ACCES');
  for (const [a, b] of accessLines) {
    d.drawPolyline(ringToPolylinePoints([a, b]), false);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- dxfExporter`
Expected: PASS (all tests, old and new — note the pre-existing "produces a DXF string with the expected layers" test and the layer-count-based tests still pass since they check specific layers/counts, not the total absence of other layers, but re-run to confirm no regression from the new ACCES layer insertion order).

- [ ] **Step 5: Update `App.tsx`'s call site**

This was already written in Task 6, Step 1 (`exportConfigToDxf(configs[selectedConfigIndex], localBoundary, localExclusions, localAccessLines)`) — no change needed here, just confirms this task unblocks that file's typecheck.

- [ ] **Step 6: Render access lines on the map**

In `src/components/PlanOverlay.tsx`, add an `accessLines` prop and render them. Update the props interface and component signature:

```typescript
interface PlanOverlayProps {
  config: ParkingConfig;
  projection: PlanProjection;
  accessLines: [Point, Point][];
}

export function PlanOverlay({ config, projection, accessLines }: PlanOverlayProps) {
```

Add, as the first children inside the returned `<>...</>` fragment (before `dividerLines.map`):

```typescript
      {accessLines.map(([a, b], index) => (
        <Polyline
          key={`access-${index}`}
          positions={toLatLngPositions([a, b])}
          pathOptions={{ color: '#2a9df4', weight: 4 }}
        />
      ))}
```

- [ ] **Step 7: Pass `accessLines` from `MapView.tsx`**

In `src/components/MapView.tsx`, update `MapViewProps` and the `PlanOverlay` usage:

```typescript
interface MapViewProps {
  planConfig?: ParkingConfig;
  projection?: PlanProjection | null;
  accessLines?: [import('../geometry/projection').Point, import('../geometry/projection').Point][];
}

export function MapView({ planConfig, projection, accessLines = [] }: MapViewProps) {
  return (
    <MapContainer center={[46.6, 2.5]} zoom={6} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri"
        maxZoom={22}
        maxNativeZoom={19}
      />
      <SearchBar />
      <DrawingToolbar />
      {planConfig && projection && <PlanOverlay config={planConfig} projection={projection} accessLines={accessLines} />}
    </MapContainer>
  );
}
```

- [ ] **Step 8: Pass `accessLines` from `App.tsx`**

In `src/App.tsx`, compute the local access lines once (reusing the same computation as `handleExportDxf`) and pass to `MapView`. Add this near the top of the component body, after the `projection` `useMemo`:

```typescript
  const localAccessLinesForMap = useMemo(() => {
    if (!projection) return [];
    return accessLines.map((line) => [projection.toLocal(line[0]), projection.toLocal(line[1])] as [ReturnType<typeof projection.toLocal>, ReturnType<typeof projection.toLocal>]);
  }, [accessLines, projection]);
```

Update the `MapView` usage:

```typescript
        <MapView planConfig={configs[selectedConfigIndex]} projection={projection} accessLines={localAccessLinesForMap} />
```

- [ ] **Step 9: Manual verification**

Run `npm run dev`. Trace a contour and a point d'accès (line), confirm the blue access line renders on the map immediately after tracing (not just after generating a plan), generate a plan, export DXF, and open the DXF to confirm the `ACCES` layer with the line is present.

- [ ] **Step 10: Commit**

```bash
git add src/components/PlanOverlay.tsx src/components/MapView.tsx src/App.tsx src/export/dxfExporter.ts src/export/dxfExporter.test.ts
git commit -m "feat: render access lines on map and export them to a dedicated DXF layer"
```

---

### Task 9: Update the legend and full build verification

**Files:**
- Modify: `src/components/Legend.tsx`

- [ ] **Step 1: Update the legend label**

In `src/components/Legend.tsx`, update the access-point entry and add one for the PMR pictogram:

```typescript
const LEGEND_ITEMS: LegendItem[] = [
  { color: '#3388ff', label: 'Contour du terrain et zones d\'exclusion' },
  { color: '#ffffff', label: 'Place standard' },
  { color: '#1d5fd6', label: 'Place PMR (pictogramme fauteuil roulant)' },
  { color: '#ffcc00', label: 'Voie de circulation (flèche = sens)' },
  { color: '#2a9df4', label: 'Ligne d\'accès' },
];
```

- [ ] **Step 2: Full test suite and build**

Run: `npm test`
Expected: PASS — every test file in the project.

Run: `npm run build`
Expected: success, no TypeScript errors (this is the full production build gate that caught the `verbatimModuleSyntax` regression in a previous round — always run this, not just `tsc --noEmit`, before considering the plan done).

- [ ] **Step 3: Commit**

```bash
git add src/components/Legend.tsx
git commit -m "docs: update legend for access lines and PMR pictogram"
```

---

### Task 10: Manual end-to-end verification and push

**Files:** none (verification only)

- [ ] **Step 1: Manual walkthrough**

Run `npm run dev`, and on the running app:
1. Search an address, zoom in.
2. Use "Tracer le contour" to draw a small parking-lot boundary.
3. Use "Zone d'exclusion" to draw one exclusion inside it.
4. Use "Point d'accès" to draw one 2-point access line touching the boundary edge.
5. Click "Générer le plan" — confirm a plan renders with: stall divider lines separating every row (including any back-to-back rows), a PMR stall with a white wheelchair pictogram, and double-loaded aisles (if any configuration has them) showing one arrow per lane offset from the dashed centerline.
6. Click "Exporter en DXF", open the file in a DXF viewer or text editor, confirm the `ACCES` layer and PMR pictogram circles are present alongside the existing layers.
7. Click "Sauvegarder le projet", then "Charger un projet" with the same file — confirm the access line reloads correctly.

- [ ] **Step 2: Push**

```bash
git push
```

## 5. Hors périmètre (backlog)

- Réseau de voies de circulation interconnectées garantissant l'accessibilité de toutes les places sans rouler sur du stationnement, et sans dépasser le contour tracé (chantier séparé à cadrer, brainstorming dédié à venir).
