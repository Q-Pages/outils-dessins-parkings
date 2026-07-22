# Outil de dessin et d'optimisation de parkings — Design V1

Date : 2026-07-22
Statut : Approuvé par l'utilisateur, prêt pour planification d'implémentation

## 1. Contexte et objectif

Phenix Solar veut un outil interne, gratuit, inspiré de TestFit, permettant de :
1. Tracer un terrain/parking disponible sur un fond de carte satellite.
2. Générer automatiquement un plan de stationnement optimisé (nombre de places maximisé, dimensions conformes, places PMR incluses).
3. Exporter ce plan en DXF pour reprise sous AutoCAD (ajout des ombrières photovoltaïques en aval, hors de cet outil).

Le calcul de puissance PV n'est **pas** dans le périmètre de cette V1 — l'outil se concentre sur le plan de parking. Le retravail CAO (ombrières, structure) se fait ensuite manuellement sous AutoCAD à partir du DXF exporté.

La détection automatique d'éléments du site (bâtiments, arbres, voirie) par IA vision est explicitement exclue : tout le tracé (contour, exclusions, accès) est fait manuellement par l'utilisateur.

## 2. Contraintes non négociables

- **100% gratuit** : aucun serveur payant, aucune API payante. Hébergement statique gratuit (GitHub Pages / Cloudflare Pages).
- **Usage interne partageable** : accessible aux employés Phenix Solar via un lien, sans compte ni installation.
- **Pas de backend/base de données** : les projets se sauvegardent en fichier JSON local (export/download), rechargeable (import) — partage entre collègues par mail/Teams.
- **Puissant pour de gros parkings** : l'algorithme doit rester performant sur des terrains de grande taille.

## 3. Architecture générale

- **Application web statique** : React + Vite, déployée sur GitHub Pages ou Cloudflare Pages (gratuit).
- **Fond de carte satellite** : Esri World Imagery via Leaflet (gratuit, sans clé API).
- **Recherche de localisation** :
  - Par adresse : API Adresse du gouvernement français (BAN), gratuite et illimitée.
  - Par coordonnées GPS : l'utilisateur peut coller directement une paire lat/lon (ex. `43.618397290396885, 3.889741475881279`) ; l'outil détecte le format et centre la carte dessus.
- **Géométrie** :
  - [Turf.js](https://github.com/Turfjs/turf) (MIT) — opérations géospatiales de base (aires, buffers, mesures).
  - [Clipper2-WASM](https://github.com/ErikSom/Clipper2-WASM) — clipping/offset de polygones robustes (zones d'exclusion, retraits).
  - [straight-skeleton](https://www.npmjs.com/package/straight-skeleton) (WASM, CGAL, licence GPL — usage interne non redistribué, donc sans contrainte) — calcul automatique des marges/retraits parallèles au contour.
- **Export CAO** : [dxf-writer](https://github.com/bertrandmartel/dxf-writer) ou [@tarikjabiri/dxf](https://github.com/tarikjabiri/js-dxf) (MIT) — génération DXF calquée côté navigateur.
- **Sauvegarde** : export/import JSON en local, aucune base de données.

## 4. Fonctionnalités V1

### 4.1 Tracé (MapView)
- Recherche par adresse (API BAN) ou par coordonnées GPS collées.
- Dessin manuel du contour du terrain disponible (polygone).
- Dessin de zones d'exclusion à l'intérieur du contour (bâtiments existants, arbres, zones techniques) — l'algorithme les évite.
- Placement de points d'entrée/sortie : l'utilisateur clique sur le contour pour marquer un ou plusieurs accès ; le réseau de voies généré s'y raccorde automatiquement.

### 4.2 Paramètres
Valeurs par défaut normalisées françaises, toutes modifiables :
- Dimensions place standard (ex. 2,5 × 5 m).
- Dimensions place PMR (ex. 3,3 × 5 m).
- Angle de stationnement (90°, 60°, 45°...).
- Largeur de voie à sens unique / double sens.
- Ratio réglementaire de places PMR (proposé automatiquement selon le nombre total de places, modifiable).

### 4.3 Génération (ParkingSolver)
Approche retenue : **balayage de configurations standards** (validée par une étude MDPI 2024 sur la conception automatisée de parkings, qui décrit une approche similaire : rangées doubles parallèles séparées par des voies d'accès, plusieurs variantes générées puis comparées).

- Le solveur teste plusieurs agencements (angles, orientations, simple/double voie) sur le polygone en tenant compte des zones d'exclusion, des marges, et des points d'accès imposés.
- Pour chaque configuration : calcul du nombre de places placées.
- Les places PMR sont positionnées automatiquement selon le ratio réglementaire, à des emplacements pertinents (proches des accès).
- La meilleure configuration (nombre de places maximal) est retenue et affichée ; les alternatives restent consultables.
- Le `ParkingSolver` est un module pur, indépendant de l'UI, prenant en entrée (polygone, exclusions, accès, paramètres) et retournant une liste de configurations candidates — testable unitairement sans passer par la carte.

Non retenu pour la V1 : solveur de recherche combinatoire avancé (type OR-Tools WASM ou algorithme génétique/recuit simulé). Possible évolution V2 si le besoin d'optimisation plus poussée se confirme après usage réel de la V1.

### 4.4 Résultats
- Nombre total de places, dont PMR.
- Plan visuel interactif de la configuration retenue.
- Bascule possible entre les configurations alternatives générées.

### 4.5 Export
- DXF avec calques séparés : contour du terrain, places, places PMR, voies de circulation, zones d'exclusion.
- Format pensé pour reprise directe sous AutoCAD (ajout des ombrières en aval).

### 4.6 Sauvegarde
- Export du projet en fichier JSON (contour, exclusions, accès, paramètres).
- Import d'un fichier JSON pour reprendre un projet existant ou le partager avec un collègue.

## 5. Composants principaux

- **MapView** — carte Leaflet + fond Esri, recherche adresse/coordonnées, outils de tracé (Leaflet.draw) pour contour, exclusions et accès.
- **ProjectStore** — état du projet en mémoire (polygone, exclusions, accès, paramètres), source de vérité unique ; gère export/import JSON.
- **ParkingSolver** — module pur de génération/optimisation des configurations de stationnement (Turf.js, Clipper2, straight-skeleton).
- **ResultsPanel** — affichage de la config retenue et des alternatives, compteur de places.
- **DxfExporter** — conversion de la géométrie retenue en fichier DXF calqué.

## 6. Cas limites à gérer

- Terrain trop petit/étroit pour placer une seule rangée → message d'erreur clair, pas de plan vide silencieux.
- Zones d'exclusion couvrant tout le terrain ou le rendant non connexe → détection et avertissement à l'utilisateur.
- Point d'accès placé hors du contour ou sur une zone d'exclusion → validation immédiate au moment du clic.
- Polygone auto-intersectant (erreur de tracé) → validation avant lancement du solveur.

## 7. Tests

- Tests unitaires du `ParkingSolver` sur des polygones de référence (rectangle simple, forme en L, terrain avec zone d'exclusion) avec résultats attendus connus à l'avance.
- Validation manuelle sur 2-3 parkings réels Phenix Solar avant de considérer la V1 aboutie.

## 8. Hors périmètre V1 (évolutions possibles)

- Calcul de puissance PV installable et estimation de production (V2, si confirmé utile après usage de la V1).
- Détection automatique d'éléments du site par IA vision (explicitement exclue, tracé 100% manuel).
- Solveur d'optimisation avancé (recherche combinatoire, algorithme génétique).
