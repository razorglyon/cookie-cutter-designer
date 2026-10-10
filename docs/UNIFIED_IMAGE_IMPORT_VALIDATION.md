# Unified image import — validation du lot 2

## Portée et provenance

Branche `feature/unified-image-import`, base recovery `1f3afd0dd928fc31a0f68cfec51db087aee21d56` (PR #59). Nouveau démarrage Import / Shapes / Resume, pipeline unique fichier/dépôt/collage pour SVG, PNG, JPEG et WebP. Annulation, confirmation des changements non sauvegardés et document canonique conservés. Format projet V1 inchangé ; octets raster originaux non persistés. Aucune dépendance, configuration, worker, règle géométrique ou stockage modifié.

Snapshot des 10 fichiers source/tests relu par deux revues indépendantes : SHA-256 `d8372363d63bd940fad7a98a18193567fd9a6d1c38488dccc6c2243be1525947` (chemins triés, NUL, contenu, NUL). Conformité PASS et qualité APPROVED. Le parent a vérifié les hashes individuels des fichiers du rapport navigateur contre le snapshot actuel : aucune différence.

## Vérifications locales

Exécutions sérialisées avec TMP isolé, `GOMAXPROCS=2`, `UV_THREADPOOL_SIZE=2` :

- `pnpm exec vitest run` avec `--pool=threads --maxWorkers=1 --fileParallelism=false` : ciblés **50/50, 4 fichiers** ; global **965/965, 63 fichiers**.
- `pnpm check` : **0 erreur, 0 warning**.
- Smoke `src/lib/utils/__tests__/exportArtifacts.smoke.test.ts`, mêmes flags : **3/3**.
- `pnpm build` : **réussi**, 676 modules.
- `pnpm audit --audit-level=moderate` : **aucune vulnérabilité connue** au moment de l'exécution.
- `git diff --check` : propre.

Logs finaux hors dépôt : `/workspace/.hermes-tmp/repos/cookie-cutter-designer-4f8693bb50/commands/lot2-final-validation/`, fichiers `10-targeted.log` à `15-audit.log`, `final-results.json`, `snapshot.json`. Essais échoués conservés. Preuves RED rapportées : nom sans extension accepté, conversion non annulée à l'ouverture d'un projet, collage PDF intercepté ; correction puis gates finales vertes. Le RED initial de toute l'implémentation n'a pas été retrouvé.

## Chromium réel

Script ponctuel hors dépôt `/workspace/reports/unified-image-import-browser.mjs`. Rapport `/workspace/reports/unified-image-import-1791642893544/report.json`, fixtures, JSON et captures dans le même dossier. **12 contrôles PASS, 1 contrôle additionnel FAIL** ; aucun pageerror, console error ni requête échouée.

Contrôles réussis : démarrage clavier Entrée/Espace et routes Shapes/Resume ; PNG fichier, dépôt et collage ; resélection identique ; équivalence stricte de la source et du SVG des contours exportés entre fichier et collage ; WebP réellement décodé/vectorisé avec génération de modèle ; image corrompue refusée sans perte ; Cancel dirty préservant exactement le document et focus initial Cancel ; collage ignoré dans input/textarea/descendant contenteditable ; sauvegarde IndexedDB, reload et réouverture WebP avec JSON identique et état propre ; démarrage/document à 375 px sans overflow horizontal.

Captures desktop et mobile chargées et inspectées par le parent : actions desktop lisibles, modèle mobile visible. La capture mobile montre une portion de panneau ; pas de preuve de visibilité simultanée de toutes les commandes. Le texte limite de taille atteint le bas de la zone d'import.

SHA-256 navigateur de l'ensemble source/config : `9884c48c8d74cade4b4fa9da29a1908256ccc64637c4288e0399db4d026e67af`, identique avant/après ; liste et hashes individuels dans le rapport. Serveur et navigateur fermés en finally, port fermé, PID revenu à la baseline du run.

## Réserves et suivi séparé

1. **Cas géométrique reproductible non corrigé** : cercle noir anticrénelé 96×96, rayon 28, fond blanc ; import/vectorisation et JSON fonctionnent, génération 3D refuse `The polygon offset changes vertex topology between height layers.` Reproduit en page fraîche. Attribution au lot 2 non établie ; fixture, JSON et `circle-generation-error.png` conservés. Ne pas qualifier toutes les images d'imprimables.
2. **Budget initial final non certifié** : plugin build réussi, mais entry final mesuré à 206286 caractères / 206606 octets, seuil du plugin 204800 caractères. Le contrôle préexistant dans generateBundle précède l'ajout Vite des dépendances preload. Configuration inchangée ; régression par rapport à la base exacte non établie. Warning chunk Three.js >600 kB maintenu.
3. Collage/dépôt : événements navigateur construits avec de vrais File, pas presse-papiers OS ni geste physique. Pas de test device réel, lecteur d'écran ou impression physique.
4. Ces preuves sont locales, pas une certification CI, aperçu distant ou production. PR aval prévue en brouillon sur `feature/local-project-recovery` ; aucune fusion sans GO merge.

## Reprise et rollback

Conserver ce snapshot, vérifier statut et divergence avant publication. Relire le HEAD final exact de la PR et sa CI après publication. Rollback par revert sur branche dédiée, sans suppression de données ni force-push ; format V1 inchangé. Ne pas commencer le lot 3 avant la pause de redémarrage demandée.
