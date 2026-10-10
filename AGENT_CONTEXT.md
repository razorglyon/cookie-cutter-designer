# AGENT_CONTEXT — cookie-cutter-designer

## Dépôt et état de consolidation

- Dépôt : `razorglyon/cookie-cutter-designer` ; clone `/workspace/cookie-cutter-designer`.
- `main` est la branche principale ; toujours créer une branche dédiée depuis son SHA distant vérifié pour la suite. Ne pas reprendre les anciennes branches fusionnées en squash.
- Fondations, projets locaux, correctif de dépendances, récupération et import intégrés par #62 au commit `867c102`. Quality, CodeQL et déploiement Pages réussis sur ce SHA ; site et assets HTTP 200. #41/#57/#58/#59 fermées comme remplacées, #47 Vitest déjà intégrée. Branches conservées.
- Maintenance compatible #63 intégrée : @types/node 24.19.1, @types/three 0.185.4, happy-dom 20.14.5 ; main `3c30739`, Quality/CodeQL/Pages réussis, #45/#52/#60 remplacées.
- Correctif `fix/dependency-bundle-budgets` : Svelte 5.57.2, svelte-check 4.7.6, Vite 7.3.7, Three.js 0.186.1 regroupés pour remplacer #61/#56 après intégration vérifiée. Séparer runtime Svelte et addons Three.js du moteur ; pas de changement métier. Seuils inchangés (200/600 KiB), comptage UTF-8 après preload Vite. Local : 968 tests/64 fichiers, check 0/0, build/audit réussis, smoke Chromium sur dist réussi. Détail et limites : `docs/DEPENDENCY_BUNDLE_BUDGETS.md`. Relire GitHub pour confirmer fusion/déploiement, jamais les déduire de cette note.
- Rza autorise la remise en état et les fusions validées, sans bypass ni suppression de branches. Les contrôles distants doivent toujours être relus sur le HEAD exact.
- Ne pas commencer un lot suivant implicitement. Feuille de route : `.hermes/plans/2026-10-09_214154-rea-product-improvements.md` ; prochains lots produit : atelier 2D, presets, ponts, profils de paroi, multi-cutter.

## Auth et publication

- Table des dépôts/comptes : `/workspace/AGENTS.md`.
- Compte `razorglyon` choisi par commande : `GH_TOKEN=$(gh auth token -u razorglyon) gh ...` ou la commande Git correspondante.
- Aucun `GITHUB_TOKEN`, aucun `gh auth switch`, aucune modification de `hosts.yml`.
- Push uniquement avec autorisation. Fusion uniquement après GO merge et contrôles réels ; ne jamais contourner les protections.
- `main` exige un historique linéaire et le check `validate`. Fusion squash compatible ; conserver les branches tant que leur suppression n’est pas autorisée.
- Push/fusion dans `main` déclenche Quality, CodeQL et le déploiement GitHub Pages. Vérifier leurs runs sur le SHA exact après publication.

## Stack et commandes

Svelte 5, TypeScript strict, Vite 7, Three.js ; Clipper/JSCAD pour la géométrie ; ImageTracer en Worker pour le raster. pnpm 10.33.4 ; Node >=22.12.

```sh
REPO_TMP=$(python3 /workspace/.hermes-tools/workspace-tmp.py --repo "$PWD" --purpose commands --path-only) || exit 1
test -n "$REPO_TMP" || exit 1
export TMPDIR="$REPO_TMP" GOMAXPROCS=2 UV_THREADPOOL_SIZE=2
pnpm install --frozen-lockfile
pnpm check
pnpm run test:run --pool=threads --maxWorkers=1 --fileParallelism=false
pnpm run test:smoke
pnpm build
pnpm audit --audit-level=moderate
# Dev : pnpm dev ; preview privé : ./scripts/start-private-preview.sh
```

TMP isolé obligatoire ; sortie vide/échec = arrêt. Sérialiser les validations. Mesurer la limite PID avant Chromium et n’arrêter que des processus autorisés.

## Contrats à préserver

- Document canonique V1 unique : sauvegarde, génération, aperçu et export utilisent la même session. Source SVG originale distincte du sketch. Octets raster originaux non persistés.
- `.ccd.json` validé strictement, limité à 10 Mio. Annuler un remplacement préserve le document ; drainer les écritures acceptées avant fermeture du stockage.
- Récupération dans une base IndexedDB séparée : reprise explicite, jamais automatique ; suppression atomique de la version affichée ; brouillons distincts par onglet/époque. La bibliothèque change uniquement sur action explicite.
- Workflows asynchrones gardés par lifetime/source/epoch jusqu’à publication ; réserver les clés avant callbacks réentrants ; invalider avant un effet partiellement faillible.
- Historique exact restauré avec son epoch. Export géométrique gardé au clic par identité mesh, epoch, ready et données canoniques ; export JSON indépendant.
- Ownership/disposal Three.js explicites. Canvas de preview distinct du producteur. Batch externe non sauvegardable en V1 ; provenance inconnue non inventée.

## Preuves et limites connues

- `docs/LOCAL_PROJECT_WORKFLOW_VALIDATION.md`, `docs/LOCAL_PROJECT_RECOVERY_VALIDATION.md`, `docs/UNIFIED_IMAGE_IMPORT_VALIDATION.md` : commandes, recette antérieure et limites.
- Correctif local cercle raster anticrénelé terminé sur `fix/raster-circle-loft`, HEAD inchangé `1259f4f6126352716f7ad2b60b4b37bb5d611dff`. Cardinalités égales : triangulation historique, ordre et métadonnées conservés ; hash legacy `ed8078da35e4ce53` validé sans changer les fixtures. Cardinalités différentes : fusion monotone des progressions périmétriques, sans rééchantillonnage ; frontières originales préservées. Vrais changements du nombre de composants toujours refusés. Aucun commit/push/PR/merge/déploiement.
- Fichiers du lot : `src/lib/utils/cutterGeometry.ts`, tests `cutterGeometry.test.ts`, `cookieCutterGenerator.test.ts`, `regressionCorpus.test.ts`, nouvelle fixture `src/lib/utils/__tests__/fixtures/raster-circle.ccd.json` et ce contexte. SVG/paramètres sauvegardés exacts avec manche rond exercés ; test frontières à échelle 0.75 (149/147 sommets intérieurs), fermeture, orientation opposée des arêtes partagées et triangles non dégénérés. Instrumentation retirée.
- `tinyDetailsSvg` : cran peu profond dans un contour simple, non auto-intersectant. L'ancien rejet venait du garde « même nombre de sommets », pas d'une politique de résolution physique. À échelle 0.8, les quatre offsets gardent chacun un anneau mais changent les sommets ; le test démontre fermeture/orientation/non-dégénérescence. Production validée avec `validatePrintableObject(..., { requireSingleShell: true })`, volume positif. Attente remplacée par cette preuve argumentée, sans relâcher les validateurs ni les rejets de contour dégénéré, auto-intersection, collapse et scission.
- Validation finale du 2026-10-10 : TMP isolé, `GOMAXPROCS=2`, `UV_THREADPOOL_SIZE=2`. `pnpm test:run src/lib/utils/__tests__/cutterGeometry.test.ts src/lib/utils/__tests__/cookieCutterGenerator.test.ts src/lib/utils/__tests__/regressionCorpus.test.ts src/lib/generation/recipes/__tests__/cutterRecipe.test.ts --pool=threads --maxWorkers=1 --fileParallelism=false` : **64/64**, 4 fichiers (11.59 s). `pnpm check` : **0 erreur/0 warning**. `pnpm test:run --pool=threads --maxWorkers=1 --fileParallelism=false` : **975/975**, 64 fichiers (207.30 s). `pnpm build` : **réussi**, 677 modules (27.80 s). `git diff --check` réussi.
- Essais antérieurs conservés comme contexte : première suite 969 succès/5 échecs (2 hash legacy, tinyDetails, 2 délais UI). Les hash sont corrigés par le chemin historique ; les deux tests UI passent dans la suite finale sans modification UI. Deux essais du nouveau test tinyDetails à échelle 1 ont échoué car ses offsets avaient la même cardinalité (8/8 intérieur), puis échelle 0.8 utilisée pour exercer réellement le changement. Les diagnostics automatiques du patch utilisaient un tsc hors configuration ; seul `pnpm check` canonique fait foi et réussit.
- Recette Chromium headless réelle sur le build de production du 2026-10-10 réussie : PNG anticrénelé original `/workspace/reports/unified-image-import-1791642893544/circle.png`, source/sketch/paramètres strictement égaux à la fixture canonique ; génération et téléchargement STL binaire (178884 octets, 3576 triangles), sauvegarde locale puis reload/réouverture avec JSON et STL strictement identiques. Mobile 375×812 : largeur document 375, aucune erreur JS/console/requête. Serveur localhost arrêté, port fermé, sources inchangées. Script/rapport ponctuels hors dépôt : `/workspace/reports/raster-circle-loft-smoke.mjs`, `/workspace/reports/raster-circle-loft-1791656272447/report.json` ; captures desktop/mobile disponibles.
- Nouvelle validation prépublication : check 0/0 ; première suite 974/975 avec délai de chargement `App.lazy-loading.test.ts`, relance sans modification 975/975 (64 fichiers, 206.17 s) ; build 677 modules réussi (26.07 s), diff check réussi. Impression physique et device réel non testés ; aucune certification de toute image imprimable ni garantie sur les auto-intersections arbitraires de loft. Les invariants testés et gardes existants restent conservés.
- Budgets JS contrôlés sur octets finaux, après preload Vite : 200 KiB entry, 600 KiB autres chunks. Le découpage runtime/addons améliore la taille par fichier et la réutilisation cache, sans garantir une baisse du total téléchargé.
- Pas de garantie du dernier geste avant transaction lors d’un crash, ni undo/raster original après reload. Pas de certification device, lecteur d’écran, presse-papiers OS ou impression physique.
- Les scripts/rapports navigateur hors dépôt sont des observations ponctuelles, pas des preuves de production. Une CI verte ne remplace pas la recette utilisateur.

## Carte de lecture et reprise

- `src/lib/domain/` : document et validation ; `src/lib/stores/designSessionStore.ts` : session canonique.
- `src/lib/projects/` : codec, IndexedDB, workflow et récupération ; `src/App.svelte` : intégration.
- `src/lib/import/` : validation, conversion et import unifié.
- `src/lib/generation/` : recettes/orchestrateur ; `src/lib/utils/` : géométrie/exports ; `src/workers/` : raster.
- `docs/AGENT_DECISIONS.md`, `docs/MAINTENANCE.md`, `SECURITY.md`, `docs/product/` : décisions et feuille de route.
- À la reprise : vérifier arbre/remotes, fetch/divergence, PR ouvertes et CI du HEAD exact. Après consolidation, repartir du `main` distant vérifié sur une nouvelle branche ; ne pas poursuivre une branche ancienne fusionnée en squash.
