# Corrections places/voies/accès/PMR — Design

Date : 2026-07-24
Statut : Approuvé par l'utilisateur, prêt pour planification d'implémentation

## 1. Contexte et objectif

Troisième round de retours utilisateur après usage réel de l'outil déployé (suite aux chantiers "aperçu carte et lisibilité DXF" et "rendu réaliste et corrections" du 2026-07-23). Six points remontés ; un point (réseau de voies de circulation interconnectées garantissant l'accessibilité de toutes les places sans rouler sur du stationnement, et sans dépasser le tracé) a été explicitement mis de côté par l'utilisateur pour un chantier de brainstorming séparé, car il correspond au chantier "réseau de voies interconnectées" déjà identifié comme plus gros lors du round précédent. Ce spec couvre les cinq points restants.

## 2. Périmètre

Dans le périmètre de cette spec :
1. Bug : les traits de séparation entre places ne séparent plus deux rangées collées dos-à-dos (sans allée entre elles).
2. Le point d'accès devient une ligne à 2 points tracée par l'utilisateur (au lieu d'un marker Leaflet dont l'icône ne charge pas), avec le milieu de la ligne comme référence de calcul.
3. Barre d'outils de dessin avec boutons texte explicites, remplaçant les icônes Leaflet.Draw peu discoverables.
4. Correction du rendu des flèches de sens sur les voies à double sens : une flèche par voie/sens, au milieu de chaque voie (pas sur la ligne séparatrice), pas répétée le long du tracé.
5. Ajout d'un pictogramme fauteuil roulant simplifié sur chaque place PMR (carte + DXF).

Hors périmètre (chantier séparé à cadrer) : réseau de voies de circulation interconnectées garantissant que toutes les places soient accessibles sans rouler sur du stationnement, et que les voies ne dépassent jamais le contour tracé.

## 3. Design par point

### 3.1 Traits de séparation entre places (bug)

`stallDividerLines` (`src/geometry/stallMarkings.ts`) ne dessine aujourd'hui que le côté gauche de chaque place systématiquement, et le côté droit seulement en l'absence de voisine à droite (bouchon de fin de rangée) — les arêtes avant/arrière ne sont jamais dessinées. Quand deux rangées sont placées dos-à-dos sans allée entre elles (cas du remplissage "double-loaded" du solveur, où un module se termine et le suivant recommence directement), l'arête partagée entre les deux rangées n'est jamais tracée : les places de la rangée du dessus et celles du dessous se touchent visuellement sans séparation.

Nouvelle implémentation, par déduplication de segments plutôt que par logique gauche/droite asymétrique :
- une clé canonique par segment (coordonnées des deux extrémités arrondies à 1e-6, ordonnées pour être indépendantes du sens de parcours) sert à dédoublonner ;
- pour chaque place, les côtés gauche et droit sont systématiquement candidats au tracé (le dédoublonnage absorbe le fait que le côté droit d'une place est la même arête géométrique que le côté gauche de sa voisine) ;
- le côté arrière n'est candidat au tracé que s'il existe une autre place dont le côté avant coïncide exactement avec lui (= deux rangées collées sans allée) ; sinon il reste ouvert (cas normal : la place donne sur une allée ou sur le bord du terrain).

Un seul fichier géométrique touché, pas de changement de signature de fonction. `PlanOverlay.tsx` et `dxfExporter.ts` consomment déjà `stallDividerLines` sans changement nécessaire de leur côté.

### 3.2 Point d'accès en ligne à 2 points

**Tracé** : remplacement de l'outil marker (`L.Draw.Marker`) par un outil ligne à 2 points (`L.Draw.Polyline` avec `maxPoints: 2`), déclenché par le nouveau bouton "Point d'accès" de la barre d'outils (voir 3.3).

**Store** (`src/store/projectStore.ts`) : le champ `accessPoints: LatLng[]` devient `accessLines: [LatLng, LatLng][]`. Setter renommé `setAccessLines`.

**Calculs géométriques inchangés** : `pmrAssignment.ts`, `accessConnectivity.ts` et `solver.ts` continuent de recevoir un tableau de `Point` en entrée — c'est `App.tsx` qui calcule le milieu de chaque ligne (`{x: (a.x+b.x)/2, y: (a.y+b.y)/2}`) avant de les passer au solveur, exactement comme il transforme aujourd'hui les `LatLng` en coordonnées locales. Aucune fonction de `src/geometry/` ne change de signature.

**Rendu** : `PlanOverlay.tsx` trace la ligne complète de chaque accès (`Polyline`, style distinct des voies). `dxfExporter.ts` ajoute un nouveau calque `ACCES` (`Drawing.ACI.GREEN` ou couleur distincte) qui trace chaque ligne d'accès.

**Validations dans `App.tsx`** (`handleGenerate`) : les vérifications "point d'accès hors contour" / "point d'accès dans une exclusion" s'appliquent désormais aux deux extrémités de chaque ligne (une ligne est valide si ses deux points sont dans le contour et hors exclusion — sinon même message d'erreur qu'aujourd'hui, adapté au pluriel "ligne(s) d'accès").

**Format de fichier projet** (`src/store/projectFile.ts`) : le champ sérialisé passe de `accessPoints` à `accessLines`, avec une validation de forme adaptée (tableau de paires de `LatLng`). C'est un changement incompatible : les fichiers `.json` de projet déjà exportés avec l'ancien format ne pourront plus être réimportés (message d'erreur clair si `accessLines` est absent, plutôt qu'un plantage silencieux) — l'utilisateur devra retracer ses points d'accès après mise à jour. Acceptable pour un outil interne mono-utilisateur.

### 3.3 Barre d'outils de dessin explicite

Nouvelle barre de boutons texte au-dessus de la carte, à côté de la barre de recherche existante : **Tracer le contour**, **Zone d'exclusion**, **Point d'accès**, **Modifier**, **Supprimer**. La barre d'outils Leaflet.Draw par défaut (icônes) est masquée (`display: none` sur `.leaflet-draw-toolbar` en CSS) — la logique de dessin sous-jacente reste Leaflet.Draw, seule l'interface change.

Chaque bouton pilote directement le handler Leaflet.Draw correspondant :
- "Tracer le contour" → instancie et active `new L.Draw.Polygon(map, polygonOptions)` ; à la création (`L.Draw.Event.CREATED`), le calque est tagué `layer.customType = 'boundary'` avant d'être ajouté au `FeatureGroup`. Comme un seul contour est autorisé, si un contour existe déjà dans le `FeatureGroup`, il est retiré avant l'ajout du nouveau.
- "Zone d'exclusion" → même mécanisme, `layer.customType = 'exclusion'`, ajout multiple autorisé.
- "Point d'accès" → `new L.Draw.Polyline(map, { maxPoints: 2, ...})`, `layer.customType = 'access'`, ajout multiple autorisé.
- "Modifier" → active `featureGroup.editing` / le toolbar d'édition Leaflet.Draw existant sur le `FeatureGroup`.
- "Supprimer" → active le mode suppression existant.

`syncStoreFromLayers` (dans `DrawingLayer`, `MapView.tsx`) est réécrit pour classer chaque calque du `FeatureGroup` selon `layer.customType` (au lieu de déduire boundary/exclusion par ordre de tracé comme aujourd'hui, ce qui est fragile — ex. si le contour est supprimé, la première exclusion restante était jusqu'ici réinterprétée à tort comme contour).

### 3.4 Flèches de sens sur voies à double sens

`aisleDirectionArrows` (`src/geometry/aisleRendering.ts`), cas `loadType === 'double'` : au lieu de deux flèches positionnées à 1/3 et 2/3 de la longueur sur la centerline (ligne séparatrice), une flèche par voie est calculée en décalant le point central perpendiculairement à la direction de la voie de `± aisle.width / 4` (milieu de chaque demi-largeur/voie), toutes deux positionnées au **milieu de la longueur** du segment de voie (pas à 1/3 et 2/3), chacune orientée dans le sens de circulation de sa voie (donc sens opposés l'une de l'autre). Le plafond de longueur de flèche existant (`Math.min(arrowWidth * 2, ...)`) est conservé pour éviter le débordement sur voie courte. Le cas `loadType === 'single'` ne change pas (une seule flèche, déjà au milieu, pas sur de ligne séparatrice puisqu'il n'y en a pas en simple sens).

Confirmation explicite de l'utilisateur : une seule flèche par voie/sens et par segment de voie généré par le solveur (pas de répétition le long du tracé) — c'est déjà le comportement actuel et celui de ce fix, aucune boucle de répétition n'est introduite.

### 3.5 Pictogramme PMR

Nouvelle fonction géométrique pure `pmrPictogram(stall: Stall): PictogramShape` (`src/geometry/pmrPictogram.ts`) qui, à partir des coins d'une place PMR, calcule un symbole fauteuil roulant simplifié et reconnaissable centré dans la place : un cercle (tête), un arc ou segment coudé pour le dossier/bras, un cercle ou arc pour la roue arrière — un tracé minimal en primitives (cercles + segments/arcs), pas une réplique fidèle du pictogramme officiel. Dimensionné proportionnellement à la taille de la place (ex. hauteur du pictogramme = 60 % de la largeur de la place, centré).

**Rendu carte** (`PlanOverlay.tsx`) : le pictogramme est superposé à chaque place PMR déjà remplie en bleu, tracé en blanc (contraste suffisant sur le remplissage bleu existant) via des `Circle`/`Polyline` react-leaflet.

**Rendu DXF** (`dxfExporter.ts`) : les primitives du pictogramme (cercles, segments) sont ajoutées sur le calque `PLACES_PMR` existant, via `d.drawCircle(...)` et `d.drawPolyline(...)` de `dxf-writer`.

## 4. Tests

- `stallMarkings.test.ts` : cas de deux rangées collées dos-à-dos sans allée (le bug rapporté) en plus des cas existants (rangée simple, places PMR).
- `aisleRendering.test.ts` : mise à jour pour la nouvelle position (milieu de longueur, décalage perpendiculaire ± width/4) des flèches en double sens ; le cas simple sens ne change pas.
- `accessConnectivity.test.ts`, `pmrAssignment.test.ts` : inchangés dans leur logique (ils reçoivent toujours des `Point[]`), pas de nouveau test nécessaire sauf si la forme des fixtures de test doit changer.
- `pmrPictogram.test.ts` : nouveau — vérifie que le pictogramme reste dans les limites de la place, dimensions proportionnelles.
- `dxfExporter.test.ts` : nouveau calque `ACCES`, primitives du pictogramme PMR sur `PLACES_PMR`.
- `projectFile.test.ts` : validation du nouveau champ `accessLines` (forme, erreur claire si absent/ancien format).
- Barre d'outils, `MapView.tsx`, `App.tsx`, CSS : pas de test automatisé (cohérent avec le reste des composants React/CSS du projet), vérifiés manuellement.

## 5. Hors périmètre (backlog)

- Réseau de voies de circulation interconnectées garantissant l'accessibilité de toutes les places sans rouler sur du stationnement, et sans dépasser le contour tracé (chantier séparé à cadrer, brainstorming dédié à venir).
