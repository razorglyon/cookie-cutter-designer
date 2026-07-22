# Robustesse de la génération 3D du cutter — Plan d’implémentation

> **Pour Hermes :** exécuter ce plan tâche par tâche, en TDD, avec revue de conformité puis revue qualité avant chaque commit.

**Objectif :** garantir que la génération d’un cutter produit soit une géométrie 3D finie, fermée et exportable, soit une erreur utilisateur claire — jamais un maillage silencieusement dégénéré ou un STL corrompu.

**Architecture :** séparer les contrats d’entrée, le noyau géométrique pur, l’orchestration SVG, la validation STL et la gestion du cycle de vie Three.js. Le noyau utilisera l’API publique Clipper déjà corrigée pour créer des offsets stables, puis `THREE.ExtrudeGeometry` pour produire des parois fermées. L’UI conservera uniquement le dernier résultat de génération et libérera systématiquement les résultats obsolètes.

**Stack :** Svelte 5, TypeScript strict, Three.js 0.181, js-angusj-clipper 1.3.1, pnpm 10, Node 22, Vitest avec environnement DOM léger.

---

## 1. Périmètre et preuves de départ

### Périmètre autorisé après GO

- génération principale du cutter ;
- validation des paramètres et contours ;
- poignée physiquement reliée au cutter ;
- orientation du modèle de test ;
- gestion des générations concurrentes et des ressources Three.js ;
- préflight STL ;
- tests automatisés et CI associée.

### Hors périmètre de ce lot

- migrations Vite 8, TypeScript 7 ou Three.js 0.185 ;
- réécriture du mode stamp ;
- véritable trancheur G-code ;
- réécriture générale des outils booléens avancés ;
- optimisation du bundle.

### Défauts reproduits

Le harness temporaire exécuté sur le code actuel donne :

```text
scale = 0       → 200/200 triangles dégénérés
scale = NaN     → sommets et bounding box non finis
height = ∞      → sommets et bounding box non finis
thickness < 0   → accepté silencieusement
```

Le STL binaire actuel accepte aussi ces maillages :

```text
scale = 0   → STL de 200 triangles tous dégénérés
scale = NaN → STL contenant 2 400 valeurs flottantes non finies
```

Le cercle valide reste une bonne baseline :

```text
200 triangles
300 arêtes uniques
300/300 arêtes avec incidence 2
maillage fermé/manifold
```

Constats de code confirmés :

- `cookieCutterGenerator.ts` ne valide pas les nombres finis ni les bornes physiques ;
- le décalage manuel des points ne gère pas correctement les contours complexes et les points répétés ;
- `taperAngle` est calculé mais jamais appliqué ;
- `totalHeight`, `enableEmbossing` et `embossDepth` sont exposés dans l’UI mais n’influencent pas le cutter ;
- le handle central est un solide séparé sans pont vers la paroi ;
- `createTestCookieCutter` suit un chemin différent et applique une rotation incohérente ;
- `App.svelte` peut lancer une génération manuelle puis une seconde génération réactive ;
- les résultats asynchrones ne sont pas versionnés : un résultat ancien peut remplacer le plus récent ;
- `ThreeViewer.svelte` ne retire pas tous ses listeners et ne libère pas toutes les ressources à la destruction ;
- `stlExporter.ts` télécharge toute géométrie, même vide, non finie ou dégénérée.

---

## 2. Stratégie Git

Après validation explicite du plan :

```sh
git switch -c fix/robust-cutter-generation
```

Cette branche sera temporairement empilée sur `fix/quality-security-baseline` afin de conserver l’API Clipper corrigée. Aucun push ni PR sans GO distinct.

Commits prévus :

```text
test: add 3d generation regression harness
fix: validate cutter generation inputs
fix: build cutter walls from robust offsets
fix: attach handles and unify test generation
fix: serialize only valid printable geometry
fix: prevent stale generations and dispose three resources
docs: document robust generation guarantees
```

---

## 3. Critères d’acceptation

Une génération réussie doit respecter toutes les règles suivantes :

1. chaque position et normale est finie ;
2. chaque index référence un sommet existant ;
3. aucun triangle n’a une aire inférieure à l’epsilon défini ;
4. chaque coque de paroi est fermée : incidence de deux triangles par arête logique ;
5. la bounding box est finie, non vide et posée sur `Y = 0` ;
6. l’épaisseur et la hauteur restent exprimées en millimètres après auto-fit ;
7. aucun handle activé n’est flottant ;
8. un contour trop étroit, vide ou auto-intersecté produit une erreur explicite ;
9. une génération obsolète ne remplace jamais la plus récente ;
10. un STL invalide n’est jamais téléchargé.

Limites initiales proposées :

```ts
const GENERATION_LIMITS = {
  maxSvgBytes: 2 * 1024 * 1024,
  maxSvgPaths: 256,
  maxContours: 512,
  maxPointsPerContour: 10_000,
  maxTotalPoints: 50_000,
  minContourArea: 1e-4,
  triangleAreaEpsilon: 1e-10
} as const;
```

Les limites seront documentées et testées. Elles protègent le navigateur contre les SVG pathologiques sans réduire les usages normaux.

---

## 4. Tâches d’implémentation

### Tâche 1 — Ajouter un vrai harness de tests

**Objectif :** transformer les reproductions temporaires en garde-fous versionnés.

**Fichiers :**

- modifier `package.json` ;
- modifier `pnpm-lock.yaml` ;
- créer `vitest.config.ts` ;
- créer `src/lib/utils/__tests__/fixtures.ts` ;
- modifier `.github/workflows/quality.yml` ;
- modifier `.github/workflows/deploy.yml`.

**Étapes :**

1. Vérifier dans le registre officiel les versions compatibles de Vitest et de l’environnement DOM retenu.
2. Ajouter des dépendances de développement exactes ou bornées dans la majeure actuelle.
3. Ajouter :

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

4. Ajouter `pnpm run test:run` avant le build dans les deux workflows.
5. Créer les fixtures `circle`, `square`, `star`, `concave`, `duplicatePoints`, `tinyFeature`, `emptySvg` et `openPathSvg`.
6. Exécuter `pnpm run test:run` et constater les premiers tests rouges.

**Commit :**

```text
test: add 3d generation regression harness
```

---

### Tâche 2 — Centraliser les contrats d’entrée

**Objectif :** refuser les paramètres non finis, incohérents ou physiquement impossibles avant toute allocation Three.js.

**Fichiers :**

- créer `src/lib/utils/generationValidation.ts` ;
- créer `src/lib/utils/__tests__/generationValidation.test.ts` ;
- modifier `src/lib/types/CookieCutter.ts` ;
- modifier `src/lib/stores/cookieCutterStore.ts`.

**API prévue :**

```ts
export class CutterGenerationError extends Error {
  constructor(
    public readonly code: GenerationErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CutterGenerationError';
  }
}

export function validateCookieCutterParams(
  value: CookieCutterParams
): Readonly<CookieCutterParams>;
```

**Tests rouges obligatoires :**

- `scale` égal à `0`, négatif, `NaN` ou `Infinity` ;
- épaisseur négative ou supérieure à une borne sûre ;
- hauteur nulle/non finie ;
- plaque non finie ou trop petite ;
- `totalHeight < cuttingHeight` quand un handle est activé ;
- enum `handleStyle` ou `mode` inconnu depuis des données JSON.

**Comportement :**

- ne jamais corriger silencieusement `NaN` ou une dimension invalide ;
- retourner des messages orientés utilisateur ;
- cloner les paramètres validés pour éviter une mutation concurrente du store ;
- remplacer `CookieCutterModel.mesh: any` par un type Three.js explicite.

**Commit :**

```text
fix: validate cutter generation inputs
```

---

### Tâche 3 — Normaliser les contours et construire une paroi robuste

**Objectif :** remplacer le calcul manuel des normales par des offsets Clipper et une extrusion fermée.

**Fichiers :**

- créer `src/lib/utils/cutterGeometry.ts` ;
- créer `src/lib/utils/__tests__/cutterGeometry.test.ts` ;
- modifier `src/lib/utils/pathOperations.ts` uniquement si une petite API typée manque ;
- modifier `src/lib/utils/cookieCutterGenerator.ts`.

**API prévue :**

```ts
export function normalizeClosedContour(
  points: readonly Point2D[]
): Point2D[];

export async function createCutterWallGeometry(
  points: readonly Point2D[],
  params: Readonly<CookieCutterParams>
): Promise<THREE.BufferGeometry>;
```

**Normalisation :**

1. rejeter toute coordonnée non finie ;
2. retirer le point final s’il duplique le premier ;
3. supprimer les doublons consécutifs ;
4. supprimer les points colinéaires dans une tolérance documentée ;
5. exiger trois points uniques et une aire minimale ;
6. imposer les limites de complexité.

**Construction :**

1. appliquer `params.scale` au contour central ;
2. calculer les offsets extérieur/intérieur avec Clipper, en millimètres ;
3. rejeter clairement un offset vide, scindé ou ambigu plutôt que produire une paroi corrompue ;
4. normaliser l’orientation de l’extérieur et du trou ;
5. construire une `THREE.Shape` avec le contour intérieur comme trou ;
6. extruder sur `cuttingHeight`, sans bevel implicite ;
7. orienter l’extrusion pour que la hauteur soit l’axe `Y` ;
8. calculer normals et bounding box ;
9. exécuter la validation géométrique avant retour.

**Tests obligatoires :**

- cercle, carré, étoile et contour concave valides ;
- point de fermeture dupliqué ;
- points consécutifs identiques ;
- contour colinéaire ;
- détail plus étroit que l’épaisseur ;
- contour auto-intersecté ;
- épaisseur inchangée quand `scale` change ;
- maillage fermé et sans triangle dégénéré.

**Note taper :** `taperAngle` est actuellement mensonger car non appliqué. Dans ce lot, soit un loft testé est implémenté, soit le contrôle est explicitement marqué indisponible et neutralisé. Il ne doit plus être silencieusement ignoré.

**Commit :**

```text
fix: build cutter walls from robust offsets
```

---

### Tâche 4 — Orchestrer le SVG sans groupe vide ni fuite

**Objectif :** rendre `generateCookieCutter` atomique et borné.

**Fichiers :**

- modifier `src/lib/utils/cookieCutterGenerator.ts` ;
- créer `src/lib/utils/__tests__/cookieCutterGenerator.test.ts`.

**Étapes :**

1. vérifier la taille UTF-8 du SVG avant parsing ;
2. capturer les erreurs `SVGLoader.parse` et les convertir en `CutterGenerationError` ;
3. limiter paths, contours et points ;
4. extraire le contour principal et les trous avec une résolution de courbe documentée ;
5. générer une paroi pour chaque contour réellement imprimable ;
6. refuser un SVG sans forme fermée ;
7. en cas d’échec partiel, libérer toutes les géométries et matières déjà créées ;
8. calculer l’auto-fit uniquement dans le plan `X/Z`, sans modifier épaisseur ni hauteur ;
9. centrer sur `X/Z` et poser le minimum de la bounding box sur `Y = 0` ;
10. enregistrer dans `group.userData.generation` les dimensions, le nombre de coques, les avertissements et l’échelle planaire appliquée.

**Tests obligatoires :**

- SVG vide ;
- SVG avec ligne ouverte uniquement ;
- SVG malformé ;
- SVG au-dessus des limites ;
- SVG avec plusieurs formes et trous ;
- forme trop grande auto-ajustée sans changement de hauteur/épaisseur ;
- nettoyage des ressources après erreur au deuxième contour.

**Commit inclus avec la tâche 3** si les changements sont inséparables ; sinon commit dédié :

```text
fix: make cutter generation atomic and bounded
```

---

### Tâche 5 — Remplacer la poignée flottante par une poignée attachée

**Objectif :** garantir qu’un handle activé intersecte physiquement une structure reliée à la paroi.

**Fichiers :**

- modifier `src/lib/utils/cookieCutterGenerator.ts` ;
- compléter `src/lib/utils/__tests__/cookieCutterGenerator.test.ts` ;
- modifier les libellés de `src/lib/components/ui/ParameterPanel.svelte` uniquement si nécessaire pour rester honnête sur le profil produit.

**Approche minimale :**

- calculer un point intérieur valide dans le contour ;
- construire un pont supérieur à travers le contour, légèrement superposé aux deux parois ;
- placer le handle sur ce pont ;
- pour `flat`, utiliser le pont seul ;
- pour `round`, `chamfered` et `rectangular`, conserver le profil mais l’intersecter avec le pont ;
- ne créer qu’un ensemble poignée/pont par coque principale ;
- refuser la poignée si aucun segment intérieur fiable ne peut être construit.

**Tests :**

- cercle et forme concave : pont intersectant les deux côtés ;
- handle intersectant le pont ;
- aucun objet `handle-*` lorsque désactivé ;
- aucune bounding box disjointe entre poignée et pont ;
- `totalHeight` et `handleHeight` cohérents.

**Paramètres actuellement sans effet :**

- `totalHeight` doit devenir la hauteur finale réelle de l’ensemble paroi + poignée ;
- `taperAngle` doit soit piloter un loft testé, soit être désactivé avec un message explicite ;
- `enableEmbossing` et `embossDepth` doivent soit produire une géométrie validée, soit être désactivés en mode cutter avec une explication.

Aucun de ces paramètres ne doit rester silencieusement ignoré.

**Commit :**

```text
fix: attach handles to cutter walls
```

---

### Tâche 6 — Unifier le modèle de test

**Objectif :** supprimer le chemin géométrique divergent qui masque les régressions.

**Fichiers :**

- modifier `src/lib/utils/cookieCutterGenerator.ts` ;
- modifier `src/App.svelte` ;
- compléter les tests générateur.

**Comportement :**

- `createTestCookieCutter` doit utiliser le même noyau que les SVG réels ;
- aucune rotation spéciale après génération ;
- la dimension verticale doit être `cuttingHeight` ou `totalHeight` selon la poignée ;
- le minimum `Y` doit être zéro ;
- le résultat doit passer le même validateur et le même préflight STL.

**Commit :**

```text
fix: unify test and production cutter generation
```

---

### Tâche 7 — Bloquer les STL invalides

**Objectif :** séparer sérialisation et téléchargement, puis refuser tout fichier non imprimable.

**Fichiers :**

- créer `src/lib/utils/geometryValidation.ts` ;
- créer `src/lib/utils/__tests__/geometryValidation.test.ts` ;
- modifier `src/lib/utils/stlExporter.ts` ;
- créer `src/lib/utils/__tests__/stlExporter.test.ts` ;
- modifier `src/App.svelte` pour afficher l’erreur d’export.

**API prévue :**

```ts
export interface GeometryValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  triangles: number;
  shells: number;
}

export function validatePrintableObject(
  object: THREE.Object3D
): GeometryValidationReport;

export function serializeSTL(
  object: THREE.Object3D,
  binary?: boolean
): DataView | string;
```

**Préflight :**

- objet non vide ;
- matrices monde mises à jour ;
- positions/normales finies ;
- indices entiers dans les bornes ;
- triangles non dégénérés ;
- bounding box finie et non nulle ;
- taille finale cohérente avec le nombre de triangles ;
- aucun téléchargement si le rapport contient une erreur.

**Tests :**

- cutter valide ;
- objet vide ;
- géométrie `NaN` ;
- triangle dégénéré ;
- index hors borne ;
- STL binaire : `84 + 50 × triangles` octets et compteur little-endian correct.

**Commit :**

```text
fix: serialize only valid printable geometry
```

---

### Tâche 8 — Éliminer les courses et fuites Three.js

**Objectif :** garantir qu’une génération obsolète ou un démontage UI ne garde aucun objet GPU vivant.

**Fichiers :**

- créer `src/lib/utils/disposeThree.ts` ;
- créer `src/lib/utils/__tests__/disposeThree.test.ts` ;
- modifier `src/App.svelte` ;
- modifier `src/lib/components/viewer/ThreeViewer.svelte`.

**Règles d’ownership :**

- `App.svelte` possède les modèles générés ;
- le viewer affiche mais ne détruit pas arbitrairement la prop active ;
- tout modèle remplacé, obsolète ou abandonné est détruit exactement une fois ;
- les ressources propres au viewer sont détruites dans `onDestroy`.

**Implémentation :**

```ts
let generationRevision = 0;

async function generateLatest(snapshot: GenerationSnapshot) {
  const revision = ++generationRevision;
  const next = await generateCookieCutter(snapshot.svg, snapshot.params);

  if (revision !== generationRevision) {
    disposeObject3D(next);
    return;
  }

  replaceCurrentMesh(next);
}
```

Ajouter :

- annulation du debounce lors d’un nouvel upload et au démontage ;
- suppression de la double génération upload + réaction `$:` ;
- snapshots immuables SVG/params ;
- nettoyage du mesh courant sur « New Design » et `onDestroy` ;
- retrait des listeners `resize` et `click` ;
- restauration d’une sélection avant remplacement ;
- destruction de `highlightMaterial`, grid, bordure, renderer et contrôles ;
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` pour limiter la pression GPU mobile.

**Tests :**

- deux générations inversées dans le temps : seule la plus récente est retenue ;
- le résultat obsolète est détruit ;
- le résultat précédent est détruit au remplacement ;
- le résultat courant est détruit au démontage ;
- pas de double génération lors d’un upload.

**Commit :**

```text
fix: prevent stale generations and dispose three resources
```

---

### Tâche 9 — Documentation et validation finale

**Fichiers :**

- modifier `AGENT_CONTEXT.md` ;
- modifier `docs/MAINTENANCE.md` ;
- éventuellement créer `docs/3D_GENERATION.md` si les contrats dépassent une page.

**Commandes finales :**

```sh
pnpm install --frozen-lockfile
pnpm audit --audit-level=moderate
pnpm run test:run
pnpm run check
pnpm run build
git diff --check origin/main...HEAD
```

**Smoke tests réels :**

1. cercle par défaut ;
2. étoile concave ;
3. SVG avec trou ;
4. SVG contenant doublons et segments minuscules ;
5. paramètres invalides restaurés depuis JSON ;
6. changements rapides de scale ;
7. export STL binaire puis lecture du header et du compteur de triangles ;
8. smoke HTTP Vite dans un seul processus borné, avec arrêt en `finally`.

**Revue finale :**

- scan de secrets ;
- provenance du lockfile ;
- revue indépendante de la géométrie et de l’ownership Three.js ;
- arbre Git propre ;
- aucun push.

**Commit :**

```text
docs: document robust generation guarantees
```

---

## 5. Rollback

Chaque lot est réversible par commit :

```sh
git revert <commit>
```

Si le noyau Clipper révèle une incompatibilité sur un contour réel, revenir au dernier commit vert, conserver validation/exports/cycle de vie, puis isoler l’algorithme d’offset dans une branche expérimentale. Aucun `reset --hard` ni push forcé.

---

## 6. Décisions à ne pas prendre silencieusement

- Ne pas « réparer » une dimension invalide par une valeur par défaut sans message.
- Ne pas auto-réduire la hauteur ou l’épaisseur pour faire tenir le cutter sur la plaque.
- Ne pas exporter un maillage partiellement valide.
- Ne pas masquer un contour rejeté si cela change le dessin final.
- Ne pas conserver un paramètre UI qui n’a aucun effet sans l’indiquer.
- Ne pas accepter un handle flottant sous prétexte que certains slicers fusionnent les coques.
