# Aperçu carte du plan généré + lisibilité DXF — Design

Date : 2026-07-23
Statut : Approuvé par l'utilisateur, prêt pour planification d'implémentation

## 1. Contexte et objectif

Retour utilisateur après premier usage réel de l'outil (V1 déployée) :
1. Le plan généré (places, PMR, voies) n'est visible qu'après export DXF — aucun aperçu sur la carte avant d'exporter.
2. Le DXF exporté est peu lisible : on ne distingue pas facilement une voie de circulation d'une place, et le sens de circulation n'est pas indiqué.
3. Les voies de circulation entre les rangées de places ne sont pas perçues comme telles (le calque `VOIES` du DXF ne trace qu'un simple trait fin centré, sans largeur ni indication visuelle).
4. L'outil de pose de point d'accès (marqueur Leaflet.Draw) n'est pas découvert par l'utilisateur — pas un bug, un problème de découvrabilité (icônes brutes, sans libellé).
5. L'interface générale est jugée à retravailler — explicitement mis de côté par l'utilisateur pour une itération ultérieure ("dans un second temps"), **hors périmètre de cette spec**.

Cette spec couvre les points 1 à 4. Le point 5 (refonte visuelle globale de l'interface) est noté comme backlog, à traiter séparément.

## 2. Approche retenue

Ajout d'un module géométrique pur (`src/geometry/aisleRendering.ts`) calculant les flèches de sens de circulation à partir d'une `AisleBand` (déjà générée par le solveur : ligne centrale + largeur), réutilisé par **deux consommateurs** :
- Le nouvel aperçu carte (`PlanOverlay`, superposé sur `MapView` via react-leaflet).
- L'export DXF (`dxfExporter.ts`, calque `VOIES` corrigé).

Ça évite de dupliquer la logique de calcul des flèches à deux endroits, et garde la cohérence : ce qui est affiché sur la carte avant export correspond exactement à ce qui sera dans le DXF.

**Style retenu** (validé avec l'utilisateur, référence visuelle façon TestFit) :
- Les voies de circulation ne sont **pas** dessinées comme une bande avec un contour ou un remplissage — elles restent l'espace vide naturel entre les rangées de places. Seules des flèches de sens sont dessinées par-dessus cet espace.
- Voie à sens unique : une flèche. Voie à double sens : deux flèches opposées + une ligne centrale en pointillé (séparateur de voie).
- Places standard : contour blanc fin, sans remplissage (comme un marquage au sol réel).
- Places PMR : remplissage bleu plein, pour ressortir visuellement (convention accessibilité).
- Pas de forme spéciale pour les places (rectangle simple conservé, décision explicite de l'utilisateur après comparaison de plusieurs styles) et pas de liseré de bordure délimitant la zone de circulation.

## 3. Composants

### 3.1 `src/geometry/aisleRendering.ts` (nouveau, pur, testé unitairement)

- `aisleDirectionArrows(aisle: AisleBand, loadType: 'single' | 'double'): Ring[]`
  - Retourne un tableau de rings (chacun un petit triangle-flèche, en mètres locaux, dans le même repère que le reste du moteur géométrique).
  - Voie simple sens : 1 flèche, centrée sur le milieu de la ligne centrale, pointant de `centerline[0]` vers `centerline[1]`.
  - Voie double sens : 2 flèches, décalées de part et d'autre du milieu, pointant en sens opposés.
  - Taille de la flèche proportionnelle à `aisle.width` (assez grande pour être visible, assez petite pour ne pas déborder sur les places adjacentes — largeur de flèche plafonnée à `aisle.width * 0.5`, longueur à 2x la largeur de flèche).
- Pas de fonction de bande/rectangle : le design ne nécessite pas de contour de voie, seulement les flèches. Le séparateur pointillé (voie double sens) réutilise directement `aisle.centerline` avec un style pointillé côté rendu (pas de calcul géométrique dédié).

### 3.2 `src/components/PlanOverlay.tsx` (nouveau)

- Reçoit la `ParkingConfig` sélectionnée (depuis le store) et la `projection` (déjà calculée dans `App.tsx`).
- Convertit chaque forme (coins de place, flèches, ligne centrale de voie) de mètres locaux vers lat/lng via `projection.toLatLng`.
- Rendu via react-leaflet :
  - `<Polygon>` par place, `color="white"`, `fillOpacity={0}`, `weight={1}` pour les standards ; `fillColor="blue"`, `fillOpacity={0.7}` pour les PMR.
  - `<Polygon>` par flèche (remplissage jaune, cohérent avec la couleur `VOIES` existante du DXF).
  - `<Polyline>` en pointillé (`dashArray`) pour la ligne centrale des voies à double sens uniquement.
- Se met à jour automatiquement quand `selectedConfigIndex` change dans le store (bascule entre configurations alternatives).
- Ne s'affiche rien si `configs` est vide (aucun plan généré) — cohérent avec le comportement déjà existant de `ResultsPanel`.

### 3.3 `dxfExporter.ts` (modifié)

- Calque `VOIES` : au lieu de dessiner uniquement `aisle.centerline` comme polyligne, dessine désormais :
  - Les flèches (`aisleDirectionArrows`) comme polylignes fermées (`LWPOLYLINE`, `closed: true`).
  - Pour les voies double sens : la ligne centrale en plus, avec un style de ligne DXF pointillé (`DASHED` au lieu de `CONTINUOUS` pour cette entité spécifique).
- Calques `PLACES`/`PLACES_PMR` : pas de changement de géométrie (rectangle simple déjà en place), mais le style de tracé doit refléter "contour seulement" pour les standards (déjà le cas, `drawPolyline` ne remplit pas) — aucune modification nécessaire ici, seule la couleur de calque existante (cyan) reste, cohérente avec un DXF technique où la distinction de calque suffit à identifier PMR vs standard (contrairement à l'aperçu carte où on ajoute un remplissage visuel).

### 3.4 Légende (`src/components/Legend.tsx`, nouveau)

- Petit composant affiché dans le panneau latéral (sous ou à côté de `ResultsPanel`), toujours visible.
- Liste statique : swatch couleur + libellé pour contour, exclusion, place standard, place PMR, voie/flèche, point d'accès.

### 3.5 Libellés Leaflet.Draw (modification de `MapView.tsx`)

- Avant le rendu de `MapContainer`, configurer `L.drawLocal` (objet de traduction global de leaflet-draw) avec des libellés français explicites pour les boutons de la barre d'outils (ex. "Tracer le contour ou une exclusion" pour l'outil polygone, "Poser un point d'accès" pour l'outil marqueur) et les actions (Terminer/Annuler/Supprimer le dernier point).
- Pas de changement de comportement, uniquement de texte/tooltip.

## 4. Flux de données

`App.tsx` calcule déjà `projection` (mémoïsé sur `boundary`) et détient `configs`/`selectedConfigIndex` via le store. `PlanOverlay` est ajouté comme enfant de `MapContainer` (dans `MapView`, ou directement dans `App.tsx` si plus simple architecturalement — à trancher en plan d'implémentation selon la structure de props la plus propre), lisant `configs[selectedConfigIndex]` et `projection` pour se dessiner. Aucune nouvelle donnée stockée : tout est dérivé de l'état déjà existant.

## 5. Tests

- `aisleRendering.ts` : tests unitaires sur `aisleDirectionArrows` — vérifier le nombre de flèches selon `loadType` (1 vs 2), leur position (centrées sur la ligne médiane), leur orientation (opposée en double sens), et que leur taille reste dans les bornes de la largeur de voie.
- `dxfExporter.ts` : étendre les tests existants pour vérifier que le calque `VOIES` contient désormais des entités flèche (polylignes fermées) en plus de la ligne centrale pointillée pour le cas double sens.
- `PlanOverlay.tsx` et les libellés `MapView.tsx` : pas de test automatisé (composants React/Leaflet, cohérent avec le reste du projet — Task 13/14 n'ont pas de tests dédiés non plus), vérifiés manuellement.

## 6. Hors périmètre (backlog)

- Refonte globale de l'interface (esthétique, bande blanche latérale inutile) — reportée par l'utilisateur, spec séparée à venir.
- Formes de places non-rectangulaires (chevron, trapèze) — écarté explicitement par l'utilisateur après comparaison visuelle.
- Bordure de délimitation de zone de circulation — écartée explicitement par l'utilisateur.
