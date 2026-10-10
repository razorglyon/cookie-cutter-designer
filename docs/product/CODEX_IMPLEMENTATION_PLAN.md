# Plan d’implémentation Codex — Refactorisation produit

> **Pour Codex :** exécuter les tâches dans l’ordre. Ne pas implémenter plusieurs recettes métier avant que le registry, les migrations et les tests Cutter/Stamp soient stables.

**Objectif :** transformer l’application monolithique Cutter/Stamp en plateforme extensible de recettes métier sans régression print-ready.

**Architecture :** un document versionné contient source, sketch et paramètres. Un registry résout la recette de génération. Un orchestrateur annulable produit des artefacts validés consommés par le viewer et les exports.

**Stack :** Svelte 5, TypeScript strict, Three.js, Vitest, Web Workers, pnpm.

---

## Règles d’exécution

### Synchronisation avec le chantier REA — 2026-10-10

La bibliothèque locale et le raccordement du document canonique ont été avancés avant le catalogue et les recettes supplémentaires, selon `.hermes/plans/2026-10-09_214154-rea-product-improvements.md`. Lot 1 intégré au commit source `141b774`, conformité PASS et qualité APPROVED ; validations et limites dans `docs/LOCAL_PROJECT_WORKFLOW_VALIDATION.md`. Ce n'est pas une clôture de toutes les phases de ce document : autosauvegarde, atelier raccordé, presets, ponts, profils et multi-cutter restent à livrer par lots séparés.

Pour ce chantier uniquement, le GO Discord `1558257545167114381` autorise commits, push et PR réversibles. Les règles générales ci-dessous restent applicables aux autres chantiers. PR #57 reste brouillon et empilée sur #41, CI distante à vérifier, aucune fusion ni production sans « GO merge ».

- Branche dédiée, jamais `main`.
- Un commit local cohérent par tâche ou petit groupe de tâches.
- Aucun push sans validation humaine.
- TDD sur migrations, recettes et validations.
- Ne pas supprimer les tests historiques pour faire passer une migration.
- Ne pas élargir les seuils géométriques pour masquer une régression.
- Préserver les imports dynamiques des fonctions lourdes.
- Ne créer aucun compte, abonnement, paiement, paywall, backend métier ou stockage cloud.
- Implémenter projets, presets et bibliothèque exclusivement en local avec export/import manuel.

## Phase 0 — Baseline

### Tâche 0.1 — Capturer l’état initial

**Fichiers :** aucun.

Exécuter :

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run --maxWorkers=1
pnpm run check
pnpm run test:smoke
pnpm run build
```

Attendu : baseline documentée. Si un échec existe déjà, arrêter et le consigner avant toute modification.

### Tâche 0.2 — Ajouter les fixtures de compatibilité

**Créer :**

```text
src/lib/domain/__tests__/fixtures/legacy-cutter.json
src/lib/domain/__tests__/fixtures/legacy-stamp.json
```

Capturer uniquement des paramètres non sensibles et des résultats mesurables déterministes : dimensions, nombre de coques, volume signé et hash logique des triangles normalisés si stable.

## Phase 1 — Domaine versionné

### Tâche 1.1 — Définir les types de document

**Créer :**

```text
src/lib/domain/designKind.ts
src/lib/domain/designDocument.ts
src/lib/domain/designParameters.ts
src/lib/domain/generatedArtifact.ts
```

**Modifier :**

```text
src/lib/types/CookieCutter.ts
```

Actions :

1. Ajouter `DesignKind` avec toutes les recettes du PRD.
2. Ajouter `DesignDocumentV1`.
3. Séparer paramètres communs, Cutter et Stamp.
4. Garder temporairement `CookieCutterParams` comme type legacy.
5. Interdire `any` et les unions non discriminées.

**Tests :**

```text
src/lib/domain/__tests__/designDocument.test.ts
```

Vérifier : discriminants, defaults, impossibilité de mélanger paramètres Stamp et Cutter.

### Tâche 1.2 — Ajouter validation et migration

**Créer :**

```text
src/lib/domain/documentValidation.ts
src/lib/domain/migrations/index.ts
src/lib/domain/migrations/v0ToV1.ts
src/lib/domain/__tests__/documentValidation.test.ts
src/lib/domain/__tests__/migrations.test.ts
```

La migration `v0 → v1` doit convertir :

```ts
mode: 'cutter' -> kind: 'cutter'
mode: 'stamp' -> kind: 'stamp'
scale: 1 -> targetSize: 75 // uniquement pour l’ancien format connu
```

Refuser les versions futures inconnues sans modifier le document source.

### Tâche 1.3 — Créer le format projet portable

**Créer :**

```text
src/lib/projects/projectCodec.ts
src/lib/projects/projectStorage.ts
src/lib/projects/__tests__/projectCodec.test.ts
```

Règles :

- JSON versionné ;
- pas d’objet Three.js ;
- source SVG nettoyée ;
- export/import round-trip ;
- checksum optionnel des blobs raster ;
- IndexedDB derrière une interface testable.

## Phase 2 — Registry et orchestration

### Tâche 2.1 — Définir le contrat de recette

**Créer :**

```text
src/lib/generation/generationRecipe.ts
src/lib/generation/recipeRegistry.ts
src/lib/generation/__tests__/recipeRegistry.test.ts
```

Le registry :

- refuse les doublons ;
- retourne une erreur structurée pour une recette inconnue ;
- expose defaults, validation et génération ;
- permet un import dynamique.

### Tâche 2.2 — Adapter Cutter

**Créer :**

```text
src/lib/generation/recipes/cutterRecipe.ts
src/lib/generation/recipes/__tests__/cutterRecipe.test.ts
```

**Réutiliser sans dupliquer :**

```text
src/lib/utils/cookieCutterGenerator.ts
src/lib/utils/cutterGeometry.ts
src/lib/utils/geometryValidation.ts
```

Le test compare la recette à la fixture legacy : dimensions, topologie et orientation fabrication.

### Tâche 2.3 — Adapter Stamp

**Créer :**

```text
src/lib/generation/recipes/stampRecipe.ts
src/lib/generation/recipes/__tests__/stampRecipe.test.ts
```

Conserver l’import dynamique de JSCAD et la réparation locale strictement bornée du Heart.

### Tâche 2.4 — Extraire l’orchestrateur

**Créer :**

```text
src/lib/generation/generationOrchestrator.ts
src/lib/generation/generationState.ts
src/lib/generation/__tests__/generationOrchestrator.test.ts
```

**Modifier :**

```text
src/App.svelte
src/lib/stores/cookieCutterStore.ts
```

L’orchestrateur gère :

- debounce ;
- révision ;
- `AbortController` ;
- génération ;
- validation ;
- publication atomique ;
- conservation du dernier résultat valide ;
- disposal du résultat remplacé.

Tests obligatoires : réponse obsolète, annulation, erreur, publication atomique et disposal unique.

## Phase 3 — UI pilotée par schéma

### Tâche 3.1 — Créer le store document

**Créer :**

```text
src/lib/stores/designDocumentStore.ts
src/lib/stores/__tests__/designDocumentStore.test.ts
```

**Déprécier progressivement :**

```text
src/lib/stores/cookieCutterStore.ts
```

Le store expose des mutations typées, jamais de mutation directe imbriquée.

### Tâche 3.2 — Découper le panneau de paramètres

**Créer :**

```text
src/lib/components/parameters/CommonSizeSection.svelte
src/lib/components/parameters/CutterSection.svelte
src/lib/components/parameters/StampSection.svelte
src/lib/components/parameters/HandleSection.svelte
src/lib/components/parameters/AdvancedSection.svelte
src/lib/components/parameters/ParameterAccordion.svelte
```

**Modifier :**

```text
src/lib/components/ui/ParameterPanel.svelte
```

Chaque champ doit avoir label, unité, min/max, aide et erreur. Les contrôles tactiles restent à 44 px.

### Tâche 3.3 — Ajouter catalogue et recherche

**Créer :**

```text
src/lib/components/design/DesignKindPicker.svelte
src/lib/components/parameters/ParameterSearch.svelte
src/lib/domain/designKindMetadata.ts
```

Ne pas afficher comme stable une recette sans implémentation enregistrée. Les futures recettes peuvent apparaître sous badge « planned » uniquement dans un écran roadmap non actionnable.

## Phase 4 — Import et édition 2D

### Tâche 4.1 — Ajouter WebP et collage

**Modifier :**

```text
src/lib/components/ui/FileUpload.svelte
src/lib/utils/imageProcessor.ts
src/App.svelte
```

**Tests :**

```text
src/lib/utils/__tests__/imageProcessor.test.ts
src/lib/components/ui/__tests__/FileUpload.test.ts
```

Vérifier MIME, extension, clipboard sans fichier, image trop grande et annulation.

### Tâche 4.2 — Unifier le document de sketch

**Créer :**

```text
src/lib/sketch/sketchDocument.ts
src/lib/sketch/sketchOperations.ts
src/lib/sketch/sketchValidation.ts
src/lib/sketch/__tests__/sketchOperations.test.ts
```

**Adapter :**

```text
src/lib/components/ui/PathEditor.svelte
src/lib/components/ui/BezierEditor.svelte
src/lib/components/ui/BooleanOperations.svelte
src/lib/utils/pathOperations.ts
src/lib/utils/booleanOperations.ts
```

Un seul document doit alimenter aperçu 2D, historique et génération.

### Tâche 4.3 — Intégrer l’éditeur

**Créer :**

```text
src/lib/components/editor/SketchEditor.svelte
src/lib/components/editor/EditorToolbar.svelte
```

Fonctions P1 : sélectionner, déplacer, dupliquer, supprimer, éditer points/Bézier, undo/redo, restaurer l’original.

### Tâche 4.4 — Ajouter primitives, grille et transformations

**Créer :**

```text
src/lib/sketch/primitives.ts
src/lib/sketch/snapping.ts
src/lib/sketch/transforms.ts
src/lib/components/editor/GridSettings.svelte
src/lib/components/editor/TransformPanel.svelte
src/lib/sketch/__tests__/primitives.test.ts
src/lib/sketch/__tests__/snapping.test.ts
src/lib/sketch/__tests__/transforms.test.ts
```

Implémenter rectangle, ellipse, polygone régulier et étoile. Le snapping doit être une fonction pure prenant points candidats, seuil en pixels converti dans l’espace document et préférences actives. Tester zoom, valeurs négatives, égalité de candidats et désactivation.

### Tâche 4.5 — Finaliser les calques

**Adapter :**

```text
src/lib/components/ui/LayerManager.svelte
src/lib/types/Layer.ts
```

Ajouter visibilité, verrouillage, renommage et ordre. La génération ignore les calques invisibles selon une règle documentée et refuse un document sans contour générable.

## Phase 5 — Recettes P1

### Tâche 5.1 — Imprint Cutter

**Créer :**

```text
src/lib/generation/recipes/imprintCutterRecipe.ts
src/lib/generation/recipes/__tests__/imprintCutterRecipe.test.ts
src/lib/components/parameters/ImprintSection.svelte
```

Cas de test : trou, îlot, profondeur zéro, relief non connecté, dessin concave.

### Tâche 5.2 — Cutter + Stamp

**Créer :**

```text
src/lib/generation/recipes/cutterAndStampRecipe.ts
src/lib/generation/recipes/__tests__/cutterAndStampRecipe.test.ts
src/lib/components/parameters/CutterAndStampSection.svelte
```

La recette compose Cutter et Stamp sans fusionner leurs artefacts. Tester tolérance, miroir, noms et export 3MF multi-objets.

### Tâche 5.3 — Multi Cutter

**Créer :**

```text
src/lib/generation/recipes/multiCutterRecipe.ts
src/lib/generation/layout/gridLayout.ts
src/lib/generation/recipes/__tests__/multiCutterRecipe.test.ts
```

Réutiliser le rollback de :

```text
src/lib/utils/batchProcessor.ts
```

Tester grille, espacement négatif refusé si collision, plateau trop petit, annulation et rollback.

### Tâche 5.4 — Stencil

**Créer :**

```text
src/lib/generation/recipes/stencilRecipe.ts
src/lib/generation/recipes/__tests__/stencilRecipe.test.ts
src/lib/components/parameters/StencilSection.svelte
```

**Réutiliser après audit :**

```text
src/lib/utils/patternGenerator.ts
src/lib/components/ui/PatternGenerator.svelte
```

Tester détails flottants, ponts, grille diagonale, dimensions extérieures et topologie finale.

## Phase 6 — Presets et bibliothèque locale

### Tâche 6.1 — Presets versionnés

**Créer :**

```text
src/lib/presets/presetStore.ts
src/lib/presets/presetCodec.ts
src/lib/components/presets/PresetPicker.svelte
src/lib/presets/__tests__/presetStore.test.ts
```

Un preset est lié à une recette et une version de schéma.

### Tâche 6.2 — Bibliothèque locale

**Adapter/remplacer :**

```text
src/lib/utils/projectManager.ts
src/lib/components/ui/ProjectManager.svelte
src/lib/components/ui/CloudGallery.svelte
```

**Créer :**

```text
src/lib/components/library/LocalProjectLibrary.svelte
src/lib/projects/__tests__/projectStorage.test.ts
```

Déprécier le concept `CloudGallery` et migrer son éventuelle logique réutilisable vers `LocalProjectLibrary`. Aucun backend n’est prévu.

## Phase 7 — Recettes P2

Chaque recette suit le même cycle : types → validation paramètres → tests rouges → génération → validation géométrique → UI → exports → documentation.

Ordre recommandé :

1. profils de lame et seconde lame ;
2. barres centrales ;
3. texte de paroi et name plates ;
4. grip/socket ;
5. Sandwich Cutter ;
6. Cake Topper ;
7. Cutter Set ;
8. PDF/SVG contour.

Chemins recommandés :

```text
src/lib/generation/profiles/
src/lib/generation/recipes/sandwichCutterRecipe.ts
src/lib/generation/recipes/cakeTopperRecipe.ts
src/lib/generation/recipes/cutterSetRecipe.ts
src/lib/text/
src/lib/export/pdfOutlineExporter.ts
```

Ne pas démarrer Cake Pop Mold avant tests physiques de clearance.

## Phase 8 — Exports multi-artefacts

### Tâche 8.1 — Normaliser les exports

**Créer :**

```text
src/lib/export/exportRequest.ts
src/lib/export/exportService.ts
src/lib/export/fileNaming.ts
src/lib/export/__tests__/exportService.test.ts
```

**Adapter :**

```text
src/lib/utils/stlExporter.ts
src/lib/utils/advancedExporter.ts
src/lib/utils/manufacturingCoordinates.ts
```

Tester :

- artefact unique ;
- plusieurs STL ;
- OBJ ;
- 3MF multi-objets ;
- noms déterministes ;
- Z-up ;
- `Z = 0` ;
- blocage si une pièce est invalide.

## Phase 9 — Sécurité et performance

### Tâche 9.1 — Durcir le SVG

**Modifier :**

```text
src/lib/utils/imageProcessor.ts
src/lib/utils/contourExtraction.ts
```

Ajouter corpus : scripts, événements, `foreignObject`, URL distante, entités, SVG surdimensionné.

### Tâche 9.2 — Généraliser les Workers

Profiler avant déplacement. Ne déplacer que les opérations mesurées comme bloquantes. Définir protocoles avec `requestId`, annulation et erreurs structurées.

### Tâche 9.3 — Budgets mémoire et bundle

Ajouter un test ou script borné :

```text
scripts/check-bundle-budget.mjs
src/lib/utils/__tests__/generationLifecycle.test.ts
```

Scénario mémoire : 20 générations, bascule heatmap et remplacement de modèle sans croissance non bornée des géométries actives.

### Tâche 9.4 — Benchmark de l’éditeur 2D

**Créer :**

```text
src/lib/sketch/__tests__/editorPerformance.benchmark.test.ts
```

Générer une fixture déterministe de 10 000 points. Mesurer sélection, transformation et snapping séparément. Enregistrer la machine et les durées ; utiliser ce benchmark comme signal de régression, pas comme promesse universelle de FPS.

## Phase 9 bis — PWA locale optionnelle

### Tâche 9.5 — Ajouter le mode hors ligne

À réaliser uniquement après stabilisation du format projet.

**Créer :**

```text
public/manifest.webmanifest
src/lib/pwa/updateManager.ts
src/lib/pwa/__tests__/updateManager.test.ts
```

Ajouter un service worker via un plugin Vite maintenu seulement si son coût et sa politique de mise à jour sont validés. Ne jamais mettre en cache les requêtes IA. Tester installation, nouvelle version, cache obsolète et démarrage sans réseau.

## Phase 10 — Validation finale

Exécuter :

```sh
pnpm exec vitest run --maxWorkers=1
pnpm run check
pnpm run test:smoke
pnpm run benchmark
pnpm run build
pnpm audit --audit-level=moderate
git diff --check
```

Validation manuelle minimale :

- SVG avec trou ;
- raster ;
- Cutter ;
- Stamp ;
- Imprint Cutter ;
- Cutter + Stamp ;
- Multi Cutter ;
- Stencil ;
- thèmes clair/sombre ;
- viewport mobile ;
- export STL/OBJ/3MF ouvert dans un slicer.

## Critères de livraison

- aucune régression du corpus historique ;
- migrations testées ;
- aucune fonctionnalité factice visible ;
- chaque recette retourne des artefacts validés ;
- UI non bloquante et résultats obsolètes rejetés ;
- documentation synchronisée ;
- diff sans secret ;
- branche prête pour review, sans push implicite.
