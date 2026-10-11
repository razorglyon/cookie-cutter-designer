# AGENT_CONTEXT — cookie-cutter-designer

## Dépôt et État courant

- `razorglyon/cookie-cutter-designer`, clone `/workspace/cookie-cutter-designer` ; branche principale `main`.
- `origin/main` vérifié au squash `c98e63855e7263aba2dc7de151b03daad251c24b` de la PR #69. Le contenu de son arbre Git est identique à celui du HEAD testé `23759cd1dcb1a58ef283e69c0120fa69bc00b3f6`. Photo guidée (#68) intégrée précédemment ; ancienne branche `feature/robust-photo-import` conservée, note documentaire `6870e9072d68aca269da416027c255d9e8ce01ac` poussée et vérifiée.
- Ancienne branche locale `feature/manual-island-bridges` conservée sans rebase ni suppression ; elle diverge de `main` par squash, mais le contenu applicatif fusionné est identique. Lot 5 **fusionné et déployé** : ponts V2, migration V1, chaînes d'îlots intermédiaires non exportables, géométrie et édition Undo/Redo. Quality, CodeQL et Pages verts sur le squash ; déploiement GitHub Pages du SHA confirmé, 56 fichiers publics vérifiés octet pour octet. Détails de validation locale : `docs/MANUAL_ISLAND_BRIDGES_VALIDATION.md`. La note initiale de reprise était locale, non commitée/non poussée ; son contenu utile est préservé dans ce lot. Son inclusion dans un commit local est autorisée par Rza le 2026-10-11 ; aucun accord de publication.
- Qualification photo guidée historique (avant lot 5) : **1 068/1 068 tests / 73 fichiers**, ciblés 151/151, check 0/0, smoke 3/3, build/audit/diff verts. Preuves : `docs/PHOTO_IMPORT_VALIDATION.md`. Ne pas confondre ces chiffres avec la qualification du lot 5.
- Feuille de route : `.hermes/plans/2026-10-09_214154-rea-product-improvements.md`. Presets lot 4 et ponts lot 5 intégrés ; profils et multi-cutter restent des chantiers distincts. Pour la suite, repartir d'une **nouvelle branche** depuis `origin/main` vérifié sans rebaser ou supprimer l'ancienne ; traiter d'abord cette note locale.

- Lot 6, première tranche : branche active `feature/simple-wall-profiles`, créée sans upstream depuis `origin/main` après fetch ; base de départ `c98e63855e7263aba2dc7de151b03daad251c24b`. Le commit local de livraison se relit avec `git log -1`. La note locale de reprise a traversé le changement de branche intégralement (empreinte avant/après identique) ; ses informations utiles sont conservées ici. Commit local autorisé par Rza le 2026-10-11. Push, PR, merge et déploiement restent non autorisés et non exécutés pour le lot 6. Le plan contient des statuts historiques : ce contexte et les références Git vérifiées priment.

## Lot 6 — profils de paroi : contrat et validation locale

- `domain/wallProfiles.ts` définit Fin (0,8 mm / 5°), Standard (1 mm / 7°), Robuste (1,5 mm / 10°). `CutterSection.svelte` applique uniquement `wallThickness` + `taperAngle` via une mise à jour atomique du port UI existant ; le document de session reste propriétaire des données. Taille, hauteurs, poignée, sketch/source et ponts conservés. Choix actif calculé par égalité exacte des deux valeurs ; sinon Personnalisé. Aucun identifiant de profil persisté, nouveau schéma, migration ou nouveau découpage géométrique. Les contrôles gardent leurs bornes/pas et affichent maintenant aussi les valeurs fractionnaires historiques sans arrondi trompeur.
- TDD : 9 tests d'absence de profils rouges avant code, puis verts ; régression de précision rouge `0.85 mm` affiché `0.8 mm`, corrigée. Régressions complémentaires App avec vraie recette/codec/STL et viewer GPU simulé : une étape Undo/Redo, sauvegarde/réouverture exacte V1/V2. Les deux échecs initiaux du runner App (délai puis identité mémoire) ne sont pas des succès : l'orchestrateur revalide/copie le document ; assertion corrigée en comparaison intégrale de contenu, tests finaux verts.
- 2026-10-11, TMP isolé, gates sérialisées : **191/191 tests ciblés/voisins (11 fichiers)** ; **1 096/1 096 tests (79 fichiers)** ; `pnpm check` **0 erreur/0 avertissement** ; smoke **3/3** ; build, audit moderate et `git diff --check` réussis. Smoke et benchmark utilisent `tmpdir()` au lieu de chemins `/tmp` fixes : artefacts réellement présents sous le TMP du dépôt. Logs `/workspace/reports/wall-profiles-{targeted,check,tests,smoke,build}-post-ui.log` ; budgets `/workspace/reports/wall-profiles-budgets-post-ui.json` : entrée **175 103 octets < 200 KiB**, plus gros autre chunk **561 528 octets < 600 KiB**, 35 JS sans violation.
- Chromium sur builds réels : baseline archivée depuis le SHA main vérifié puis reconstruite dans TMP, et nouveau `dist` ; 54 fichiers HTML/assets de chaque build relus en HTTP et comparés aux empreintes locales. Rapport final `/workspace/reports/wall-profiles-browser-1791725360750/report.json`, runner `/workspace/reports/wall-profiles-smoke.mjs`. V1 réellement exporté par la baseline : JSON et STL inchangés sans édition. Trois profils × V1/V2 avec pont simple : exports distincts, source/ponts conservés, Undo/Redo exacts ; personnalisation clavier (1,4 mm et hauteur ajustée), IndexedDB, reload, réouverture, JSON et STL strictement identiques. Dimensions STL mesurées et conformes au badge aperçu arrondi à 0,1 mm. Desktop 1365×900 et mobile 375×812, thèmes clair/sombre, sélection tactile et focus clavier 3 px ; aucune requête échouée/erreur console, aucune modification des sources pendant la recette, ports 4344/4345 fermés. Les premières captures étaient partiellement hors champ ou sous la barre Undo/Redo : comparatif final centré et contrôlé contre les occultations dans `/workspace/reports/wall-profiles-framing-1791726291148/report.json`, images avant/après desktop/mobile inspectées. Après correction CSS, Fin/Standard/Robuste chacun sur une ligne (`wall-profiles-labels-1791725349336/report.json`). L’appel groupé a atteint 420 s ; journaux relus individuellement et runner terminé, rapport PASS/ports fermés récupéré ensuite : ne pas assimiler le timeout à une réussite.
- Limites : Chromium seulement, toucher émulé ; pas de téléphone physique, lecteur d'écran, slicer, imprimante ou essai mécanique/alimentaire. Les nouveaux profils ont été exercés en navigateur avec un pont simple ; chaînes/états intermédiaires couverts par la suite historique, pas par un nouveau parcours profils-chaîne. Une combinaison peut toujours être refusée par les gardes géométriques existantes selon le SVG. Profils indicatifs sans certification. Aucune CI distante du lot 6 ni nouvelle livraison. Détails partageables : `docs/WALL_PROFILES_VALIDATION.md`.
- Reprise : code et docs **validés localement**, commit local de cette tranche autorisé par Rza le 2026-10-11. Après le commit, la prochaine frontière est push + PR brouillon, avec accord distinct requis ; aucune fusion ni livraison autorisée. Ne pas étendre au socle/paroi/tranchant séparés ni au multi-cutter.
- Qualification avant commit : fetch final confirmé, `HEAD == origin/main`, ancienne branche inchangée ; index vide, aucune PR ouverte. Revue du diff et nouveaux fichiers : pas de constat bloquant. 217 empreintes `src/` inchangées depuis la recette finale ; budgets 35 JS recalculés, liens locaux et whitespace (nouveaux fichiers inclus) vérifiés. Neuf fichiers dans le lot, aucune publication. Derniers edits documentaires seulement, dont enregistrement du GO limité au commit local ; sortie `/workspace/reports/wall-profiles-final-review.log`. Précommit du 2026-10-11 : `pnpm check` relancé 0/0, 13/13 tests des deux nouveaux fichiers réussis ; sources applicatives toujours identiques au snapshot qualifié.

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

## Validation lot 5 (locale)

2026-10-11 : **1 083/1 083 tests (77 fichiers)**, check **0 erreur/0 avertissement**, smoke **3/3**, build, audit, budgets JS et diff check verts localement. Chromium local : pont simple avec drag/clavier/touch/Undo/Redo, JSON et STL exacts après réouverture ; chaîne à deux ponts avec état intermédiaire V2 sauvegardable mais STL bloqué, puis export complet ; suppression globale annulable. Parcours raster V1 rejoué, source/JSON/STL identiques ; ports fermés. Détails, rapports, tailles, limites et preuves : `docs/MANUAL_ISLAND_BRIDGES_VALIDATION.md`. CI de la PR #69 et du squash `c98e63855e7263aba2dc7de151b03daad251c24b` verts ; déploiement Pages vérifié à l'empreinte sur les 56 fichiers publics. Aucun test sur device physique/imprimante.

## Contrat photo guidée

- `photoSettings.ts` : seuil null=auto ; polarité dark/light ; crop normalisé ; minComponentArea0 et fillHolesfalse par défaut. Aucun choix destructif implicite.
- `photoProcessing.ts` : segmentation luminance/alpha, diagnostics/topologie ; Worker `photoProcessor.worker.ts` : décodage, budgets, ImageTracer noir uniquement et contrôle des trous. `photoImport.ts` : Worker propriétaire par requête, timeout/abort/cleanup.
- App stage un brouillon gardé par document/snapshot/epoch/sourceRevision ; `PhotoImportReview` prépare sans mutation puis applique explicitement. Retrace conserve source/id/nom/paramètres, réutilise l’historique canonique. Raster et réglages restent volatiles, pas de schéma V2.
- Fixtures photographiques attribuées coins/coffee/chelsea dans `src/lib/import/__tests__/fixtures/photos/`. Test Node déterministe et vrai décodage Chromium complémentaires ; aucun détour cloud.

## Validation lot 4 (historique)

2026-10-10 : 995/995 tests (68 fichiers), check 0 erreur/0 warning, smoke 3/3, build et diff check réussis après correction du chevauchement flex du bouton retrace. Corpus : 4 rasters originaux procéduraux × 2 choix × 3 répétitions, vrais décodage/Worker Chromium ; SVG exactement reproductibles. Photo supprime du bruit mais aussi petit trou/îlot ; cercle historique identique. Ce corpus ne contient pas de photographie de caméra. Recette navigateur : choix explicite sans mutation, retrace cercle identique, IndexedDB/reload V1 exact et invitation à réimporter ; 375px sans overflow. Undo et cancel/edit/replace tardifs vérifiés dans tests App à Worker simulé, pas intégralement en navigateur réel. Cercle sur dist : STL identique après reload (178884 octets, 3576 triangles). Serveurs arrêtés/ports fermés. Preuves et essais échoués : `docs/TRACING_PRESETS_VALIDATION.md`. Pas de CI distante ni validation performance gros raster.

## Validation atelier antérieure

2026-10-10, diff atelier courant : **988/988 tests, 67 fichiers**, check **0/0**, smoke exports **3/3**, build réussi, diff check réussi. Recette réelle sur dist Chromium desktop 1365×900/mobile 375×812 : source/id/nom/params préservés, clavier/souris/touch + annulation, une étape undo par drag, fermeture/miroir/rotation, génération STL, save IndexedDB/reload exacts, ouverture d’un autre projet pendant le brouillon sans publication obsolète. Non-régression vrai cercle raster rejouée avec STL et JSON strictement identiques après reload. Preview arrêtée/port fermé, sources inchangées durant recette.

Preuves, empreintes, essais échoués et limites : `docs/SKETCH_WORKSPACE_VALIDATION.md`. Runner hors dépôt `/workspace/reports/sketch-workspace-smoke.mjs`. Les tests de switch navigateur activent la navigation par DOM click pendant le drag ; aucun store injecté. Pas de device/lecteur d’écran/impression réels ni garantie de performance gros SVG ou de toute construction SVG ; CI distante du lot non exécutée.

## Carte de lecture et publication

- `src/lib/domain/`, `stores/designSessionStore.ts` : document canonique ; `projects/` : codec/IndexedDB/workflow/recovery ; `App.svelte` : intégration.
- `src/lib/import/`, `workers/` : import ; `sketch/` : commandes bornées ; `generation/` et `utils/` : recettes/géométrie/exports.
- Preuves antérieures : `docs/LOCAL_PROJECT_WORKFLOW_VALIDATION.md`, `LOCAL_PROJECT_RECOVERY_VALIDATION.md`, `UNIFIED_IMAGE_IMPORT_VALIDATION.md`, `DEPENDENCY_BUNDLE_BUDGETS.md`.
- Auth : `/workspace/AGENTS.md`, compte razorglyon par commande ; jamais gh auth switch/login ni modification hosts.yml. Réseau/publication seulement si autorisé. main exige historique linéaire et validate ; pas de bypass/suppression de branches. Après autorisation de publication, relire les checks distants du SHA exact, sans déduire leur état de cette note.
