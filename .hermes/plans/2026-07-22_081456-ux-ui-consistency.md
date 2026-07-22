# UX/UI Consistency Implementation Plan

> **For Hermes:** Exécuter ce plan localement, avec tests de non-régression et revue finale. Ne pas pousser sans GO explicite.

**Goal:** Corriger les incohérences UX/UI les plus impactantes de Cookie Cutter Designer sans refondre les moteurs 3D ni les fonctionnalités métier.

**Architecture:** Unifier le shell et les composants autour de tokens sémantiques clair/sombre, supprimer les doubles parcours, rendre les états asynchrones explicites et améliorer les contrôles techniques à fort usage. Les changements restent progressifs, réversibles et sans nouvelle dépendance.

**Tech Stack:** Svelte 5, TypeScript strict, Vite 7, Vitest, happy-dom, Three.js.

---

## Baseline

- Base de travail : `perf/split-heavy-bundles` à `9bfef07`, soit 15 commits au-dessus de `main`.
- Branche cible : `fix/ux-ui-consistency`, créée depuis cette base afin de conserver les correctifs de robustesse et le lazy-loading déjà validés.
- État initial : dépôt propre.
- Vérifications initiales : `pnpm run check`, `pnpm run test:run` (`146/146`) et `pnpm run build` réussis.

## Principes de périmètre

- Corriger les incohérences démontrées par l’audit runtime.
- Ne pas refaire l’architecture du moteur 3D.
- Ne pas ajouter de bibliothèque UI ou d’icônes.
- Ne pas modifier le stockage réel de la clé Gemini sans besoin fonctionnel ; le texte de confiance doit décrire précisément l’implémentation existante.
- Conserver le lazy-loading et les budgets de bundle.
- Aucun commit ni push sans validation humaine conformément au workflow du dépôt.

---

### Task 1: Consolider la fondation visuelle et le thème

**Objective:** Supprimer les styles du starter Vite et fournir des tokens sémantiques réellement utilisables en modes clair et sombre.

**Files:**
- Modify: `src/main.ts`
- Delete: `src/app.css`
- Modify: `src/styles/theme.css`
- Modify: `src/App.svelte`

**Steps:**
1. Retirer l’import de `src/app.css` et centraliser reset, focus, contrôles et surfaces dans `theme.css`.
2. Ajouter les tokens `--surface-*`, `--text-*`, `--border-*`, `--viewer-*` et leurs valeurs dark-mode.
3. Remplacer dans `App.svelte` les gradients et fonds basés sur l’inversion de `gray-*` par les tokens sémantiques.
4. Initialiser le thème depuis `localStorage` ou `prefers-color-scheme`, puis persister le choix.
5. Respecter `prefers-reduced-motion`.
6. Vérifier le thème clair et sombre dans le navigateur, notamment sidebar, panneau, viewer et état vide.

**Validation:**
- `pnpm run check`
- Test DOM : restauration/persistance du thème.
- Inspection des styles calculés : aucun texte clair sur surface claire dans les zones principales.

---

### Task 2: Clarifier la navigation et le contexte du design

**Objective:** Rendre les catégories compréhensibles au clavier, au pointeur et sans mémoriser les icônes.

**Files:**
- Modify: `src/App.svelte`

**Steps:**
1. Ajouter un libellé réel à chaque entrée, affiché comme tooltip custom au survol/focus.
2. Exposer `aria-label`, `aria-current="page"` et un état actif non dépendant uniquement de la couleur.
3. Regrouper visuellement les catégories disponibles après génération, sans modifier leur logique métier.
4. Renommer les actions ambiguës si nécessaire (`Advanced Creation`, `Select tool`).
5. Rendre le nom du design courant cohérent : `shape-library.svg`, fichiers importés et exemple de test.
6. Ajouter une confirmation avant `New Design` seulement lorsqu’un modèle existe.

**Validation:**
- Navigation complète au clavier.
- Les entrées disposent toutes d’un nom accessible et d’un tooltip visible.
- Test DOM des états actifs et de la confirmation de nouveau design.

---

### Task 3: Transformer Shape Library en panneau direct

**Objective:** Supprimer le double clic et l’entre-deux panneau/modale.

**Files:**
- Modify: `src/lib/components/ui/ShapeLibrary.svelte`
- Modify: `src/App.svelte`
- Test: `src/__tests__/App.ux.test.ts`

**Steps:**
1. Supprimer le bouton d’ouverture et la modale interne.
2. Afficher directement un titre, une instruction, les catégories et la grille dans le panneau actif.
3. Utiliser une sémantique de filtres explicite avec `aria-pressed`.
4. Remplacer les noms accessibles reposant sur les emojis par des libellés fonctionnels.
5. Fermer le parcours en basculant vers Parameters après sélection, comportement déjà assuré par le parent.
6. Ajouter un test prouvant qu’un seul clic sur la navigation rend les formes sélectionnables.

**Validation:**
- Un clic `Shape Library` affiche immédiatement les cartes.
- Sélection d’une forme → génération → panneau Parameters.
- Aucun dialogue ou contrôle sous-jacent inaccessible n’est nécessaire.

---

### Task 4: Ajouter des états explicites aux panneaux chargés dynamiquement

**Objective:** Éviter les panneaux blancs silencieux sur réseau lent ou erreur de chunk.

**Files:**
- Modify: `src/App.svelte`
- Test: `src/__tests__/App.lazy-loading.test.ts`

**Steps:**
1. Regrouper les imports par catégorie dans des chargeurs mis en cache.
2. Afficher un skeleton/statut `Loading tools…` pendant la promesse.
3. Afficher un message d’erreur borné et une action Retry en cas de rejet.
4. Conserver un seul chargement par catégorie et les budgets de bundle existants.
5. Étendre les tests pour valider pending, success et error sans rendre les modules eager.

**Validation:**
- `pnpm run test:run -- src/__tests__/App.lazy-loading.test.ts`
- `pnpm run build` sans dépassement de budget.

---

### Task 5: Améliorer Parameters, History et le viewer

**Objective:** Rendre les réglages techniques précis et les actions globales constamment accessibles.

**Files:**
- Modify: `src/lib/components/ui/ParameterPanel.svelte`
- Modify: `src/lib/components/ui/HistoryPanel.svelte`
- Modify: `src/lib/components/viewer/ThreeViewer.svelte`
- Modify: `src/App.svelte`

**Steps:**
1. Normaliser les unités avec espaces insécables visuels et plages en tiret demi-cadratin.
2. Ajouter `aria-valuetext`, bornes visibles et champs numériques compacts aux paramètres prioritaires.
3. Simplifier `Mode / Design Type` en un seul contrôle segmenté avec `aria-pressed`.
4. Placer History dans une barre sticky et remplacer le compteur seul par `History · N steps`.
5. Renommer `Selection OFF` en `Select tool`, exposer `aria-pressed` et ajouter `Fit view`.
6. Utiliser les tokens du thème pour le canvas, les overlays et les contrôles.

**Validation:**
- Typecheck strict.
- Navigation clavier sur sliders, champs et actions.
- Vérification que les changements continuent de déclencher une seule génération debouncée.

---

### Task 6: Structurer Advanced Creation et fiabiliser la configuration Gemini

**Objective:** Donner une hiérarchie stable aux outils avancés et clarifier le traitement de la clé API.

**Files:**
- Modify: `src/App.svelte`
- Modify: `src/lib/components/ui/AIImageProcessor.svelte`
- Modify: `src/lib/components/ui/PatternGenerator.svelte`
- Modify: `src/lib/components/ui/GeminiAPIConfig.svelte`
- Modify: `src/lib/components/ui/AIAssistant.svelte`

**Steps:**
1. Ajouter les titres `Advanced Creation` et `AI Tools` au niveau `h2`.
2. Normaliser les boutons de disclosure avec nom accessible, `aria-expanded` et chevron cohérent.
3. Garder les actions principales visibles ou clairement atteignables dans le scroll interne.
4. Vérifier le stockage actuel de la clé puis afficher une note exacte sur stockage et transmission.
5. Remplacer le bouton emoji afficher/masquer par un nom accessible dynamique.
6. Clarifier les états vide, validation, succès et échec sans exposer la clé complète.
7. Présenter `Setup Required` comme un état bloqué, pas comme une fausse action.

**Validation:**
- Aucun secret dans les logs, le DOM persistant ou le diff.
- Contrôles Gemini correctement nommés au clavier/lecteur d’écran.
- Panneaux avancés avec hiérarchie `h1 > h2 > h3`.

---

### Task 7: Tests de non-régression et vérification finale

**Objective:** Prouver que les correctifs fonctionnent sans casser la génération, le lazy-loading ni le build.

**Files:**
- Modify/Create: `src/__tests__/App.ux.test.ts`
- Modify: `src/__tests__/App.lazy-loading.test.ts`
- Modify: `AGENT_CONTEXT.md`

**Steps:**
1. Tester le thème, les libellés de navigation, Shape Library directe et les états asynchrones.
2. Exécuter `pnpm run check`.
3. Exécuter `pnpm run test:run`.
4. Exécuter `pnpm run build` et contrôler les budgets.
5. Lancer l’application et effectuer un smoke visuel clair/sombre sur Upload, Shapes, Parameters, Advanced et AI.
6. Examiner `git diff --check`, `git diff --stat` et le diff complet pour secrets et fichiers générés.
7. Mettre à jour `AGENT_CONTEXT.md` avec branche, validations et prochaine étape.
8. Présenter les fichiers modifiés et le message de commit proposé avant tout commit.

**Expected result:**
- `svelte-check`: 0 erreur, 0 avertissement.
- Suite Vitest complète réussie.
- Build Vite réussi sans dépassement de budget.
- Aucun push.

---

## Risques et rollback

- **Risque CSS transversal :** les composants historiques utilisent de nombreuses couleurs codées en dur. Migrer seulement les composants touchés, puis vérifier chaque écran en clair/sombre.
- **Risque bundle :** un regroupement incorrect des imports peut annuler le lazy-loading. Le test de chargement et les budgets Vite constituent la gate de révision.
- **Risque comportemental :** les champs numériques et sliders doivent rester synchronisés et continuer d’utiliser `updateParam`.
- **Risque secret :** aucune clé réelle ne doit être saisie durant les tests. Utiliser uniquement une valeur factice et ne jamais afficher `localStorage` dans les logs.
- **Rollback :** chaque tâche reste isolée par fichiers et peut être restaurée sans modifier les algorithmes de génération 3D.
