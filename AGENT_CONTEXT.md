# AGENT_CONTEXT — cookie-cutter-designer

## Dépôt et autorisations

- Dépôt : `razorglyon/cookie-cutter-designer` ; clone `/workspace/cookie-cutter-designer`.
- Branche de travail : `fix/dependency-audit`, depuis `feature/local-project-workflow` / `317ea35` ; branche par défaut `main` (ne pas modifier directement).
- PR #57 en brouillon, base `feature/design-domain-foundation` / PR #41. Ne pas fusionner les PR empilées hors ordre.
- GO Discord `1558257545167114381` autorise tout le plan REA, commits, push et PR organisés. **Aucune fusion ni production sans « GO merge ».**
- Publications : compte `razorglyon` explicitement sélectionné par sous-processus, sans changer le compte global `gh` (`bot-rza`, READ sur ce dépôt). Aucun token dans les fichiers/logs.
- Organisation et rollback : `.hermes/plans/rea-delivery-organization.md`.

## Stack et commandes

Svelte 5, TypeScript strict, Vite 7, Three.js ; Clipper et JSCAD pour la géométrie ; ImageTracer en Worker pour le raster. pnpm 10.33.4 ; Node >=22.12.

```sh
REPO_TMP=$(python3 /workspace/.hermes-tools/workspace-tmp.py --repo "$PWD" --purpose commands --path-only) || exit 1
test -n "$REPO_TMP" || exit 1
export TMPDIR="$REPO_TMP" GOMAXPROCS=2 UV_THREADPOOL_SIZE=2
pnpm install --frozen-lockfile
pnpm exec vitest run --pool=threads --maxWorkers=1 --fileParallelism=false
pnpm check
pnpm exec vitest run src/lib/utils/__tests__/exportArtifacts.smoke.test.ts --pool=threads --maxWorkers=1 --fileParallelism=false
pnpm build
# Dev : pnpm dev ; preview privé : ./scripts/start-private-preview.sh
# Audit : pnpm audit --audit-level=moderate
```

TMP isolé obligatoire, sortie vide/échec = arrêt. Mesurer la limite PID réelle avant Chromium ; arrêter uniquement les anciens arbres de preview autorisés. Sérialiser les validations et conserver les logs des essais échoués.

## État actuel — lot 1 intégré, 2026-10-10

- Source commitée : **`141b774cb12632b69d27d49d9932018160e5bb08`**, `connect canonical projects to the app workflow`.
- Commits amont cohérents : `5d69982` fondations, `57beddd` contrôleur, `b3ed161` dialogue, `0992e1d` UI bibliothèque/Projet, `3ce000f` intégration session, `a5cb7ec` historique exact, `99ed45b` transitions réentrantes.
- Conformité intégrée `deleg_aeeb6bd6` **PASS**, qualité indépendante `deleg_b958751c` **APPROVED** ; aucun finding bloquant démontrable sur les 17 fichiers source/tests.
- Digest relu `48e9e63739d290519362e865c10f79be7a99dee3c388926fd71cb971f9a429f6`. Avant commit, uniquement un LF final excédentaire retiré de chacun de quatre tests ; égalité octet par octet démontrée. Digest commité `e3ee4951fdeceb51b35c271f95ab299a7299a3e4d260da29a4273d33072e2f5c` (chemins triés + NUL + contenus + NUL). Code applicatif identique au snapshot approuvé.
- **HEAD source exact `141b774` rejoué : 830 tests / 55 fichiers, check 0 erreur / 0 warning, smoke exports 3, build réussi.** Warning connu chunk Three.js >600 kB, non bloquant pour le build.
- Recette native Chromium : 13 étapes réussies, dont sauvegarde/reload/réouverture, JSON et STL, pixels PNG, collisions/clic forcé, viewport personnalisé, import invalide, Stamp, suppression confirmée et panne IndexedDB injectée avec backup JSON disponible. Voir `docs/LOCAL_PROJECT_WORKFLOW_VALIDATION.md` pour provenance et limites.
- Les observations navigateur et scripts sont ponctuels hors dépôt : `/workspace/reports/local-project-app-browser.mjs` ; artefacts `commands/native-app-1791626877971/` dans le TMP du dépôt. Pas une certification de l'application déployée ni d'une impression physique.
- PR #57 reste brouillon ; relire son head, sa base et ses checks après publication/reprise. L'ancien run Quality `38005840408` a échoué à Audit dependencies (12 vulnérabilités : 1 low, 6 moderate, 5 high). Ne jamais déclarer le nouveau head CI vert à partir des tests locaux ou de cet ancien run. Aucun bypass d'audit.

## Contrats à préserver

- Session native unique : le document sauvegardé pilote génération, aperçu et export. Source originale SVG distincte du sketch courant. V1 ne conserve pas les octets du raster original.
- Import `.ccd.json` strict, limité à 10 Mio, jamais autosauvé ; annuler un remplacement préserve le projet courant. Les sauvegardes acceptées drainent avant fermeture du stockage.
- `restoreHistory(snapshot, expectedEpoch)` restaure exactement métadonnées/timestamps/révision du sketch, sans identité parallèle ni traversée de frontière de projet.
- Workflows et producteurs asynchrones capturent leur validité au démarrage ; invalidation par lifetime/source/epoch et dernière garde avant publication. Réserver les clés avant callbacks réentrants ; invalider avant un effet qui peut échouer partiellement.
- Export géométrique gardé synchroniquement au clic : identité mesh, epoch, ready et entrées canoniques. Rename/viewport ne reconstruisent pas la géométrie ; export JSON indépendant.
- Previews App readonly : suppression viewer et Auto-Fix Positions interdits jusque dans les handlers ; aucune disposal directe des ressources de l'orchestrateur.
- Batch externe non sauvegardable en V1. Paramètres/layout/items capturés avant production ; métadonnées globales exactes pour batch homogène, omises pour hétérogène/provenance inconnue.
- Canvas DOM de preview distinct du canvas producteur ; sérialiser ce dernier. Ownership et disposal Three.js explicites.
- Les prédicats `waitForFunction` du harness Playwright 1.58.2 doivent être synchrones : précharger les imports avec `evaluate`. Une Promise truthy n'est pas une attente métier. Une nouvelle optimisation Vite lazy peut recharger la page : préserver l'échec puis rejouer après diagnostic, sans compter cet essai comme réussi.

## Reprise et suite

### Correctif de dépendances autorisé et en validation

- GO « Oui » de Rza, message `1558438205903212658`, pour un lot séparé avant recovery. Plan `.hermes/plans/2026-10-10-dependency-audit-remediation.md`.
- Baseline actuelle audit12 : 5 high / 6 moderate / 1 low. Patch de la PR #47 Vitest4.1.11 réutilisé ; son SHA2bd47a8 a été installé frozen/audité dans le worktree détaché `/workspace/cookie-cutter-designer-security-pr47` : il laisse10 avis. PR #43 devalue5.9.0 insuffisante, pas reprise.
- Diff correctif limité à package.json et pnpm-lock.yaml : Vitest4.1.11, devalue5.9.4, PostCSS8.5.29, nanoid3.3.20, source-map-js1.2.2 et transitives de la famille Vitest. Aucun override ni majeure, aucune modification de src/CI/config. Résolutions des packages inchangés et integrities nouvelles vérifiées.
- Audit après **0 avis connus**, installation frozenOK ; **830 tests/55 fichiers**, check0/0, smoke3, buildOK. Chromium13 étapes réussi, observation ponctuelle hors dépôt dans `commands/native-app-1791631667132/report.json`. Deux essais antérieurs ont subi les reloads Vite de réoptimisation du lockfile/lazy imports (fflate/OBJExporter puis imagetracer), logs conservés ; pas comptés comme succès.
- Revue indépendante à terminer avant commit/publication. Aucun commit correctif ni PR sécurité encore publié à ce checkpoint ; PR #57 est publiée au head317ea35 et son Quality38044892881 reste en échec d'audit. Un audit local zéro ne modifie pas cette CI historique. Aucune fusion autorisée.

1. Vérifier status/remotes, fetch et divergence avant toute nouvelle modification. Relire PR #57 et CI de son head exact ; aucune fusion implicite.
2. Les lots suivants ne sont **pas réalisés** : brouillon de récupération distinct, import fluide, atelier 2D, presets de vectorisation, ponts, profils de paroi et multi-cutter. Détail et dépendances dans `.hermes/plans/2026-10-09_214154-rea-product-improvements.md`.
3. Lot suivant : branche `feature/local-project-recovery` depuis le lot 1, PR empilée ; politique de recovery/multi-onglets explicite. Ne pas ajouter de compte/backend/cloud.

## Carte de lecture

- `src/lib/domain/` : document V1 et validation ; `src/lib/stores/designSessionStore.ts` : source canonique.
- `src/lib/projects/` : codec, IndexedDB, workflow et intégration session ; `src/App.svelte` : raccordement UI.
- `src/lib/generation/` : registry/recettes/orchestrateur ; `src/lib/utils/` : géométrie et exports ; `src/workers/` : raster.
- `src/lib/components/parameters/` et `viewer/` : réglages et rendu.
- `docs/AGENT_DECISIONS.md`, `docs/MAINTENANCE.md`, `SECURITY.md`, `docs/product/` : décisions, exploitation et feuille de route.
