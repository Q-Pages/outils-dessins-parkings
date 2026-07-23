# Rendu réaliste des places/voies + corrections diverses — Design

Date : 2026-07-23
Statut : Approuvé par l'utilisateur, prêt pour planification d'implémentation

## 1. Contexte et objectif

Deuxième round de retours utilisateur après usage réel de l'outil déployé (suite au chantier "aperçu carte et lisibilité DXF" du même jour). Cinq points retenus dans ce chantier (un sixième point, plus important — un réseau de voies de circulation interconnectées garantissant l'accessibilité de toutes les places — est explicitement reporté à un chantier séparé, cadré indépendamment) :

1. Le rendu des places (carte et DXF) utilise des rectangles fermés par place, ce qui double visuellement les traits entre deux places voisines — l'utilisateur veut un rendu façon marquage au sol réel (traits de séparation partagés, pas de rectangle par place).
2. Les flèches de sens de circulation sont trop grandes et trop vives (jaune plein) — l'utilisateur veut des flèches plus petites et discrètes, façon peinture routière.
3. Le niveau de zoom maximal de la carte est insuffisant pour tracer un contour précisément.
4. Un bug a été identifié en cours de session : si aucun point d'accès n'est posé avant de générer un plan, l'attribution des places PMR est silencieusement sautée (0 PMR sans avertissement), car `assignPmrStalls` a besoin d'un point d'accès de référence pour la proximité.
5. Le panneau latéral (paramètres/résultats/légende) doit passer sous la carte plutôt qu'à droite (indépendamment du bug de débordement de page déjà corrigé séparément dans ce même round de retours — voir note ci-dessous).

**Note sur un bug déjà corrigé séparément** : pendant l'investigation de ce retour, un bug distinct a été trouvé et corrigé (hors de cette spec, déjà déployé) — `src/index.css` contenait encore des styles par défaut du scaffold Vite (`#root` à largeur fixe 1126px centrée) jamais retirés depuis la création du projet, causant un espace vide à gauche de la page et un débordement horizontal masquant une partie du panneau. Ce bug est résolu ; il n'explique pas à lui seul la demande de repositionnement du panneau (point 5), que l'utilisateur maintient indépendamment.

## 2. Périmètre

Dans le périmètre de cette spec : points 1 à 5 ci-dessus.
Hors périmètre (chantier séparé à venir) : réseau de voies de circulation interconnectées garantissant que toutes les places soient accessibles (actuellement, les voies générées sont parallèles et indépendantes, sans liaison transversale garantissant la connectivité de l'ensemble du réseau vers les points d'accès).

## 3. Design par point

### 3.1 Places en traits de séparation

Nouvelle fonction géométrique pure (`src/geometry/stallMarkings.ts`) qui, à partir d'une liste de places d'une même rangée (regroupées et triées par position le long de la rangée), retourne uniquement les segments de séparation nécessaires : pour chaque place, son côté "gauche" (dans l'ordre de la rangée), plus le côté "droit" de la dernière place de la rangée (le "bouchon" de fin). Ça donne exactement N+1 traits pour N places, sans doubler les traits partagés entre places voisines — chaque `Stall.corners` étant déjà généré dans un ordre stable par `packRows` (Task 5 du plan V1 : `[avant-gauche, avant-droite, arrière-droite, arrière-gauche]` avant rotation), le côté "gauche" d'une place correspond au segment entre son 1er et son 4e coin, et son côté "droit" entre son 2e et son 3e coin.

Les places PMR restent visuellement distinctes par un remplissage plein (comme actuellement), les places standard n'ont plus que leurs traits de séparation (pas de remplissage, pas de rectangle fermé).

Consommé par `PlanOverlay.tsx` (aperçu carte) et `dxfExporter.ts` (calques PLACES/PLACES_PMR), remplaçant le tracé actuel en rectangle fermé pour les places standard uniquement (les PMR gardent un tracé fermé rempli, nécessaire pour le remplissage).

### 3.2 Flèches discrètes

Modification de `aisleDirectionArrows` (`src/geometry/aisleRendering.ts`, déjà existant) : réduction du ratio de largeur de flèche de `aisle.width * 0.5` à `aisle.width * 0.2`. Le plafond de longueur (déjà en place pour éviter le débordement sur voie courte) reste proportionnel à la nouvelle largeur, donc continue de fonctionner sans changement de formule.

Couleur : passage de jaune (`#ffcc00` sur la carte, `Drawing.ACI.YELLOW` en DXF) à blanc (`#ffffff` sur la carte, `Drawing.ACI.WHITE` en DXF) pour les calques VOIES et VOIES_SEPARATEUR, dans `PlanOverlay.tsx` et `dxfExporter.ts`.

### 3.3 Zoom maximal

Ajout de `maxZoom={22}` et `maxNativeZoom={19}` au `TileLayer` dans `MapView.tsx`. `maxNativeZoom` indique à Leaflet de continuer à agrandir (interpoler) la dernière tuile disponible au-delà du niveau natif du fournisseur Esri (~19 dans la plupart des zones), plutôt que d'afficher des tuiles vides passé ce niveau — l'utilisateur peut ainsi zoomer plus loin pour tracer précisément, même si l'image devient floue au-delà du niveau natif (comportement normal et attendu, pas un bug).

### 3.4 Garde-fou PMR (point d'accès requis)

Ajout d'une validation dans `handleGenerate` (`App.tsx`) : si `accessPoints.length === 0`, afficher une alerte explicite ("Pose au moins un point d'accès avant de générer un plan — nécessaire pour placer les places PMR et raccorder les voies.") et arrêter, avant tout appel au solveur. Positionnée avec les validations existantes (contour, auto-intersection, points d'accès hors contour/dans une exclusion).

### 3.5 Panneau en bas de la carte

`App.css` : `.app-layout` passe de `flex-direction: row` (implicite) à `flex-direction: column`. `.map-container` garde `flex: 1` (prend l'espace vertical restant). `.side-panel` passe d'une largeur fixe (320px, hauteur pleine) à une hauteur fixe (ex. 260px) et largeur pleine, avec son contenu interne réorganisé en rangée horizontale avec retour à la ligne (`flex-wrap: wrap`) plutôt qu'empilé verticalement, pour utiliser l'espace efficacement sous forme de bandeau bas plutôt que de colonne étroite. Les composants enfants (`ParamsPanel`, `ResultsPanel`, `Legend`) ne changent pas de structure interne, seul le conteneur `.side-panel` et son agencement changent.

## 4. Tests

- `stallMarkings.ts` : tests unitaires sur le calcul des traits de séparation (nombre de segments pour N places, pas de doublon, position correcte des bouchons de rangée).
- `aisleRendering.test.ts` : mise à jour des tests existants pour la nouvelle proportion de largeur de flèche (0.2 au lieu de 0.5) — les valeurs attendues changent, la logique de bornage reste la même.
- `dxfExporter.test.ts` : mise à jour pour vérifier le nouveau tracé des places standard (traits, pas rectangle fermé) et la couleur blanche du calque VOIES.
- `PlanOverlay.tsx`, `MapView.tsx`, `App.tsx`, `App.css` : pas de test automatisé (cohérent avec le reste des composants React/CSS du projet), vérifiés manuellement.

## 5. Hors périmètre (backlog)

- Réseau de voies de circulation interconnectées garantissant l'accessibilité de toutes les places (chantier séparé à cadrer).
