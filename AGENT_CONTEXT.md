# AGENT_CONTEXT — cookie-cutter-designer

## Dépôt et État courant

- Dépôt `razorglyon/cookie-cutter-designer`, clone `/workspace/cookie-cutter-designer`, branche par défaut `main`.
- **Lot 7a fusionné et déployé, vérifié le 2026-10-11.** PR #71 MERGED ; squash `bafc4246d5c5789a385f844ea5ff3a1d2d7e99dd`, `origin/main` fetché et égal au SHA GitHub.
- Branche applicative conservée : `feature/reprenable-cutter-series`, HEAD publié `5c74083baec230788468fa70c9bada5c1caecda3`. Son arbre est exactement celui du squash (`3492b6e40b02764c9f83fa021cd95852e7acb4e9`). Cette divergence d’historique ne représente pas du travail applicatif non livré. Main local et anciennes branches non modifiés/rebasés/supprimés.
- Quality et CodeQL Security Scan réussis sur le HEAD de PR ; verdict externe CodeQL « No new alerts in code changed by this pull request » et GitGuardian réussis. Sur le squash : Quality `38167985591`, CodeQL Security Scan `38167985501` et Pages `38167985508` SUCCESS ; validate, Analyze, build et deploy verts. Les verdicts externes de PR ne sont pas présentés comme réexécutés sur main.
- Déploiement github-pages `7000582643`, SHA exact et dernier statut success confirmés. Paquet comparé au build qualifié ; **58/58 fichiers publics** relus HTTP 200, tailles/SHA-256 identiques, lazy chunks et Workers inclus. Seul `.nojekyll` vide est propre au build, absent du paquet et qualifié comme métadonnée de packaging.
- Branche documentaire active : `docs/refresh-product-roadmap`, créée depuis `origin/main` vérifié, sans modifier main ni rebaser la branche livrée. GO courant : commit et push des cinq documents autorisés par Rza ; aucune PR, fusion ni mise en production autorisée.
- Aucun code local restant, aucune PR ouverte au relevé final. Les cinq documents sont prêts pour le commit/push autorisé ; cette phrase décrit le préflight, pas une preuve de publication distante. Le statut réel se relit dans Git et sur GitHub.
- Contrôle documentaire du profil : ce contexte respecte la limite ; le contrôle global reste en échec uniquement pour les contextes trop longs de Limace et Sangsue, non modifiés dans cette livraison. Ce contrôle de notes ne remet pas en cause la CI du produit.

## Lot livré et validation

- Séries homogènes de Cutters séparés depuis Batch : copies, colonnes, espacement ; source/profils/ponts/poignée communs éditables. Document/enveloppe V3 stricts, IndexedDB/JSON/reprise et Undo/Redo canoniques. Retour au Cutter unique sans perte. V1/V2 conservés ; V3 nécessite la nouvelle application. Batch libre historique non enregistrable.
- Bornes : 1–24 copies, 1–copies colonnes, 0,5–40 mm d’espace, 500 000 triangles. Disposition trop grande sauvegardable, géométrie bloquée ; Batch reste accessible sans mesh pour réparer après reload.
- Qualification du HEAD exact : audit sans vulnérabilité connue, check 0 erreur/0 avertissement, **1 128/1 128 tests (84 fichiers)**, smoke 4/4, benchmark 2/2, build/budgets verts (entrée 178 253, autre max 561 528 octets). Fichiers suivis conformes aux blobs Git et empreintes inchangées avant/après. Première tentative de suite interrompue à 210 s, enfants arrêtés ; relance réussie à 278,92 s sans changement de code.
- Recette Chromium locale précédente toujours rattachée : 225 empreintes src identiques au commit publié. Desktop/mobile, V1 comparé au vrai main, V2/ponts/profils, JSON/STL exacts après reload, historique et réparation du plateau. Pas de nouveau parcours navigateur sur production ; preuve HTTP de version servie seulement. Pas de Safari/Firefox/device/lecteur d’écran/slicer/impression ni qualification des séries maximales.

## Stack, commandes et ressources

Svelte 5, TypeScript strict, Vite 7, Three.js, Clipper/JSCAD, ImageTracer en Worker. pnpm 10.33.4 ; Node >=22.12.

```sh
REPO_TMP=$(python3 /workspace/.hermes-tools/workspace-tmp.py --repo "$PWD" --purpose commands --path-only) || exit 1
test -n "$REPO_TMP" || exit 1
export TMPDIR="$REPO_TMP" GOMAXPROCS=2 UV_THREADPOOL_SIZE=2
pnpm install --frozen-lockfile
pnpm check
pnpm test:run --pool=threads --maxWorkers=1 --fileParallelism=false
pnpm test:smoke --pool=threads --fileParallelism=false
pnpm benchmark --pool=threads --fileParallelism=false
pnpm build
# Dev : pnpm dev ; preview privé : ./scripts/start-private-preview.sh
```

TMP isolé obligatoire pour install/tests/build ; sérialiser les gates. Ne pas dupliquer maxWorkers dans smoke/benchmark. Budgeter les attentes selon la durée mesurée et garder propriété/arrêt des processus.

## Carte, décisions et reprise

- `src/lib/domain/`, `stores/designSessionStore.ts` : document/session canoniques ; `projects/` : codec/IndexedDB/recovery ; `App.svelte` : intégration.
- `import/`, `workers/` : import ; `sketch/` : édition ; `generation/`, `utils/` : recettes/géométrie/exports.
- Invariants durables conservés dans **`docs/PROJECT_INVARIANTS.md`** ; ancienne note intégrale préservée dans Git au HEAD publié. Preuves spécialisées : `docs/CUTTER_SERIES_VALIDATION.md`, `WALL_PROFILES_VALIDATION.md`, `MANUAL_ISLAND_BRIDGES_VALIDATION.md`, `PHOTO_IMPORT_VALIDATION.md` et `SKETCH_WORKSPACE_VALIDATION.md`.
- Preuves de livraison : `/workspace/reports/cutter-series-release-a0f7i03a/qualification.json`, `pages-verified.json` ; CI : `/workspace/reports/cutter-series-ci-pr-crj3f8yn/final.json` et `/workspace/reports/cutter-series-ci-main-x4dzinj3/final.json`.
- Suite : préserver les notes locales, fetch et repartir d’une nouvelle branche depuis `origin/main` vérifié. Feuille de route : `.hermes/plans/2026-10-09_214154-rea-product-improvements.md` ; ses anciens statuts ne remplacent pas ce contexte. Pas d’extension au monobloc/multi-dessins/Stamp ni de publication documentaire sans nouveau GO.
