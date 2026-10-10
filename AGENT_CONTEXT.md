# AGENT_CONTEXT — cookie-cutter-designer

## Dépôt et État courant

- `razorglyon/cookie-cutter-designer`, clone `/workspace/cookie-cutter-designer` ; branche principale `main`.
- Base locale `b1b6aa8c35b4a61cd299b1d860650174b0a64e0e` : atelier lot 3 intégré. Aucun réseau/GitHub exécuté dans cette validation du lot 4.
- Branche active `feature/tracing-presets` : **lot 4 préréglages validé localement**, gates locales réussies ; recette réelle documentée avec limites dans `docs/TRACING_PRESETS_VALIDATION.md`. GO explicite du 2026-10-10 : commit `add explicit raster tracing presets`, push uniquement cette branche, PR draft vers main et lecture des checks du SHA exact. **Aucun merge ni déploiement autorisé**. La note de validation décrit le snapshot avant publication ; vérifier l’état distant pour la reprise.
- Feuille de route : `.hermes/plans/2026-10-09_214154-rea-product-improvements.md`. Presets lot 4 implémentés ; ponts, profils et multi-cutter restent distincts et non réalisés.

## Stack et commandes

Svelte 5, TypeScript strict, Vite 7, Three.js ; Clipper/JSCAD ; ImageTracer en Worker. pnpm 10.33.4, Node >=22.12.

```sh
REPO_TMP=$(python3 /workspace/.hermes-tools/workspace-tmp.py --repo "$PWD" --purpose commands --path-only) || exit 1
test -n "$REPO_TMP" || exit 1
export TMPDIR="$REPO_TMP" GOMAXPROCS=2 UV_THREADPOOL_SIZE=2
pnpm check
pnpm test:run --pool=threads --maxWorkers=1 --fileParallelism=false
pnpm test:smoke --pool=threads --fileParallelism=false
pnpm build
# Dev : pnpm dev ; preview privé : ./scripts/start-private-preview.sh
```

TMP isolé obligatoire ; sérialiser les gates. Le script smoke fixe déjà maxWorkers : ne pas dupliquer cette option. Avant Chromium, mesurer les PID ; runner propriétaire du navigateur/serveur localhost, arrêt en finally.

## Contrats et limites

- Document V1 canonique : source SVG originale distincte de sketch ; identité, nom, paramètres et préférences conservés. Raster original non persisté, undo non durable après reload.
- Atelier dans Advanced Creation : `SketchWorkspace.svelte` + `sketchCommands.ts`, lecture du sketch courant et mutation via session.updateSketch. Déplacement souris/tactile/clavier/coordonnées ; add/delete/close sur contour linéaire unique ; miroir horizontal/rotation 90° centrés viewBox. M/L/C/Q/Z et contrôles conservés, sans polygonisation. Primitives/transform/styles/commandes non prises en charge conservés et signalés en lecture seule. Pas de pinceau/texte/calques/snapping/plume complète/restaurer-original dédié.
- Drag local jusqu’au release, un commit gardé par snapshot exact + epoch. Escape/pointercancel/blur/perte capture annulent ; navigation/remplacement/history invalident le brouillon. Historique et génération existants réutilisés ; autres outils legacy non déclarés migrés.
- `.ccd.json` strict, limite 10 Mio ; validation avant remplacement. Annuler préserve le document ; drainer écritures acceptées avant fermeture stockage.
- Récupération IndexedDB séparée, reprise explicite ; bibliothèque modifiée uniquement explicitement ; brouillons par onglet/époque, pas de collaboration implicite.
- Gardes lifetime/source/epoch jusqu’à publication. Export geometry exige mesh/epoch/ready/document cohérents ; JSON indépendant. Ownership/disposal Three.js conservés. Batch externe non sauvegardable V1.
- Loft raster : chemin legacy conservé pour cardinalités égales ; fusion périmétrique monotone pour cardinalités différentes sans rééchantillonnage. Changements du nombre de composants refusés ; validateurs et fixtures historiques inchangés par l’atelier.
- Budgets finaux UTF-8 après preload Vite : 200 KiB entry, 600 KiB chunks ; découpage runtime/addons ≠ baisse garantie du transfert total.

## Validation lot 4

2026-10-10 : 995/995 tests (68 fichiers), check 0 erreur/0 warning, smoke 3/3, build et diff check réussis après correction du chevauchement flex du bouton retrace. Corpus : 4 rasters originaux procéduraux × 2 choix × 3 répétitions, vrais décodage/Worker Chromium ; SVG exactement reproductibles. Photo supprime du bruit mais aussi petit trou/îlot ; cercle historique identique. Ce corpus ne contient pas de photographie de caméra. Recette navigateur : choix explicite sans mutation, retrace cercle identique, IndexedDB/reload V1 exact et invitation à réimporter ; 375px sans overflow. Undo et cancel/edit/replace tardifs vérifiés dans tests App à Worker simulé, pas intégralement en navigateur réel. Cercle sur dist : STL identique après reload (178884 octets, 3576 triangles). Serveurs arrêtés/ports fermés. Preuves et essais échoués : `docs/TRACING_PRESETS_VALIDATION.md`. Pas de CI distante ni validation performance gros raster.

## Validation atelier antérieure

2026-10-10, diff atelier courant : **988/988 tests, 67 fichiers**, check **0/0**, smoke exports **3/3**, build réussi, diff check réussi. Recette réelle sur dist Chromium desktop 1365×900/mobile 375×812 : source/id/nom/params préservés, clavier/souris/touch + annulation, une étape undo par drag, fermeture/miroir/rotation, génération STL, save IndexedDB/reload exacts, ouverture d’un autre projet pendant le brouillon sans publication obsolète. Non-régression vrai cercle raster rejouée avec STL et JSON strictement identiques après reload. Preview arrêtée/port fermé, sources inchangées durant recette.

Preuves, empreintes, essais échoués et limites : `docs/SKETCH_WORKSPACE_VALIDATION.md`. Runner hors dépôt `/workspace/reports/sketch-workspace-smoke.mjs`. Les tests de switch navigateur activent la navigation par DOM click pendant le drag ; aucun store injecté. Pas de device/lecteur d’écran/impression réels ni garantie de performance gros SVG ou de toute construction SVG ; CI distante du lot non exécutée.

## Carte de lecture et publication

- `src/lib/domain/`, `stores/designSessionStore.ts` : document canonique ; `projects/` : codec/IndexedDB/workflow/recovery ; `App.svelte` : intégration.
- `src/lib/import/`, `workers/` : import ; `sketch/` : commandes bornées ; `generation/` et `utils/` : recettes/géométrie/exports.
- Preuves antérieures : `docs/LOCAL_PROJECT_WORKFLOW_VALIDATION.md`, `LOCAL_PROJECT_RECOVERY_VALIDATION.md`, `UNIFIED_IMAGE_IMPORT_VALIDATION.md`, `DEPENDENCY_BUNDLE_BUDGETS.md`.
- Auth : `/workspace/AGENTS.md`, compte razorglyon par commande ; jamais gh auth switch/login ni modification hosts.yml. Réseau/publication seulement si autorisé. main exige historique linéaire et validate ; pas de bypass/suppression de branches. Après autorisation de publication, relire les checks distants du SHA exact, sans déduire leur état de cette note.
