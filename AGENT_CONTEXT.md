# AGENT_CONTEXT — cookie-cutter-designer

## Dépôt et état de consolidation

- Dépôt : `razorglyon/cookie-cutter-designer` ; clone `/workspace/cookie-cutter-designer`.
- Branche actuelle : `feature/unified-image-import`. `main` est la branche principale ; toujours créer une branche dédiée pour la suite.
- Fondations, projets locaux, correctif de dépendances, récupération et import réunis dans la PR #62, désormais basée sur `main`. Les têtes #41/#57/#58/#59 sont des ancêtres vérifiés du snapshot applicatif `6bb7d68`.
- Rza a autorisé la consolidation et la fusion avec CI verte, sans bypass, puis la fermeture des PR remplacées après preuve du contenu intégré. À l’écriture de ce checkpoint, fusion et déploiement ne sont pas encore réalisés : relire GitHub pour connaître leur résultat, ne pas déduire la livraison de cette note.
- Snapshot applicatif : 965 tests/63 fichiers, check 0 erreur/0 warning, build réussi rejoués localement ; Quality distant (installation frozen, audit, check, tests, build) réussi. Un changement documentaire déclenche maintenant les contrôles de PR contre `main`.
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
- Cercle raster anticrénelé : génération 3D peut refuser `The polygon offset changes vertex topology between height layers.` Attribution au lot 2 non établie. Ne pas promettre toute image imprimable.
- Budget final du bundle initial non certifié malgré le build réussi ; warning chunk Three.js >600 kB connu.
- Pas de garantie du dernier geste avant transaction lors d’un crash, ni undo/raster original après reload. Pas de certification device, lecteur d’écran, presse-papiers OS ou impression physique.
- Les scripts/rapports navigateur hors dépôt sont des observations ponctuelles, pas des preuves de production. Une CI verte ne remplace pas la recette utilisateur.

## Carte de lecture et reprise

- `src/lib/domain/` : document et validation ; `src/lib/stores/designSessionStore.ts` : session canonique.
- `src/lib/projects/` : codec, IndexedDB, workflow et récupération ; `src/App.svelte` : intégration.
- `src/lib/import/` : validation, conversion et import unifié.
- `src/lib/generation/` : recettes/orchestrateur ; `src/lib/utils/` : géométrie/exports ; `src/workers/` : raster.
- `docs/AGENT_DECISIONS.md`, `docs/MAINTENANCE.md`, `SECURITY.md`, `docs/product/` : décisions et feuille de route.
- À la reprise : vérifier arbre/remotes, fetch/divergence, PR ouvertes et CI du HEAD exact. Après consolidation, repartir du `main` distant vérifié sur une nouvelle branche ; ne pas poursuivre une branche ancienne fusionnée en squash.
