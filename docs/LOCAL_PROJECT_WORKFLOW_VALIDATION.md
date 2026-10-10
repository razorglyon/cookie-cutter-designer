# Validation du parcours projets locaux — lot REA 1

## Périmètre

Intégration source : `141b774cb12632b69d27d49d9932018160e5bb08`, branche `feature/local-project-workflow`, PR #57 empilée sur #41. Les commits documentaires ultérieurs ne changent pas l'application. Aucune fusion ni publication production autorisée sans « GO merge ».

Le lot raccorde la session canonique à App, sauvegarde IndexedDB, bibliothèque, confirmations, import/export `.ccd.json`, historique, paramètres, génération, viewport et exports géométriques. Il ne livre pas les lots suivants.

## Revues et provenance

- Conformité intégrée : `deleg_aeeb6bd6`, PASS.
- Qualité indépendante : `deleg_b958751c`, APPROVED.
- Revues statiques de 17 fichiers ; aucun défaut P1/P2 démontrable. Elles ne sont pas des exécutions navigateur.
- SHA-256 du snapshot relu : `48e9e63739d290519362e865c10f79be7a99dee3c388926fd71cb971f9a429f6`.
- SHA-256 des mêmes 17 fichiers commités : `e3ee4951fdeceb51b35c271f95ab299a7299a3e4d260da29a4273d33072e2f5c`.
- Convention : chemins lexicographiquement triés, chaque chemin UTF-8 + NUL + octets du fichier + NUL.
- Seule différence après revue : un LF excédentaire en fin de chacun des tests App.export-validity, App.local-projects, BatchMode.lifecycle et ThreeViewer.project-viewport, refusé par le diff indexé. Pour chacun, `ancien == nouveau + b'\n'` démontré ; tous les autres fichiers inchangés. Code applicatif identique au snapshot approuvé. Les quatre tests ont ensuite été rejoués : 57 verts.

## Gates locales sur le commit source exact

Exécutées sur `141b774cb12632b69d27d49d9932018160e5bb08`, avec TMP isolé, GOMAXPROCS=2, UV_THREADPOOL_SIZE=2 et Vitest à un worker :

```sh
pnpm exec vitest run --pool=threads --maxWorkers=1 --fileParallelism=false
pnpm check
pnpm exec vitest run src/lib/utils/__tests__/exportArtifacts.smoke.test.ts --pool=threads --maxWorkers=1 --fileParallelism=false
pnpm build
git diff --check
```

Résultats réellement retournés : **830 tests / 55 fichiers**, check **0 erreur / 0 warning**, smoke **3 tests**, build réussi et diff-check réussi. Warning de taille du chunk Three.js >600 kB conservé ; aucun seuil modifié.

## Recette Chromium réelle — observation ponctuelle de session

13 étapes réussies dans le clone local, avant commit et sur le code applicatif identique. Aucune erreur JS, console ou requête sur la page principale ; aucune erreur JS dans le contexte de panne. Les rapports et captures bruts sont **hors dépôt**, non archivés ici : `/workspace/.hermes-tmp/repos/cookie-cutter-designer-4f8693bb50/commands/native-app-1791626877971/`. Harness : `/workspace/reports/local-project-app-browser.mjs`, Playwright Core 1.58.2 et Chromium headless shell 1208, WebGL logiciel.

1. Bibliothèque accessible dans l'App vide.
2. Cercle créé, renommé et sauvegardé par l'UI réelle en IndexedDB.
3. Rechargement complet puis réouverture : dimensions et nom identiques, projet clean.
4. Dialogue natif : focus initial Cancel, annulation préservant le projet dirty.
5. Téléchargement STL réel : 576 triangles, 28 884 octets ; longueur binaire vérifiée.
6. SVG réel à deux contours proches : sauvegarde, collisions, Auto-Fix désactivé ; clic forcé préservant positions, document, historique et état clean.
7. Canvas traité non vide ; PNG sérialisé identique pixel par pixel à l'aperçu (64×64).
8. Handoff PNG traité, vectorisation raster puis résultat canonique ready réellement attendu.
9. Grille off/axes on conservés après save/reload/réouverture du raster.
10. Import JSON invalide : erreur visible et projet enregistré courant préservé.
11. Projet Stamp construit par factory/codec réels puis importé par fichier UI : pas d'autosave, sauvegarde, reload, réouverture conservant le mode Stamp ; STL réel 804 triangles, 40 284 octets.
12. Suppression d'un projet inactif : Cancel le conserve ; confirmation le retire sans remplacer le projet actif.
13. IndexedDB `SecurityError` injecté dans un contexte isolé : sauvegarde refusée, document dirty conservé, backup JSON portable téléchargé et relu. Ce n'est pas une panne spontanée du navigateur.

Les preuves de course asynchrone, réentrée et historique exact restent dans les tests versionnés ; ne pas prétendre que ces courses ont toutes été reproduites nativement.

## Essais échoués conservés, non comptés comme succès

- Premiers sélecteurs STL trop stricts pour son nom accessible : harness corrigé, pas l'application.
- Prédicats async de `waitForFunction` insuffisants : code installé Playwright `frames.js:1243–1288` vérifie la truthiness du retour avant attente ; une Promise peut donc résoudre false sans répéter la condition. Imports préchargés puis prédicats synchrones et rejeu réel. Les anciens libellés « ready » obtenus ainsi ne sont pas une preuve d'attente de génération.
- Run `native-app-1791626451286` interrompu par rechargement Vite après optimisation lazy de `imagetracer`, confirmé par `server.log`. Rejeu séparé à cache préparé réussi, sans changer le code applicatif.
- Une tentative de nettoyage EOF via texte retourné par l'outil a altéré un mock en remplaçant `()` par un marqueur de masquage ; test refusé au parsing. Littéral restauré, égalité aux octets indexés prouvée avant rejeu/commit. Aucun changement de comportement conservé.

## Limites et CI

- La CI distante doit être lue sur le head publié exact. Les gates locales ne la rendent pas verte.
- Ancien run Quality `38005840408` : échec Audit dependencies, 12 vulnérabilités (1 low, 6 moderate, 5 high). Aucun bypass, baisse de seuil ou mise à jour de dépendances mélangée à ce lot.
- Pas de certification de production, de tous les navigateurs, de garantie CAS multi-onglets ou d'impression physique.
- V1 sauvegarde le SVG vectorisé, pas les octets raster originaux. Batch externe non sauvegardable ; métadonnées globales omises pour provenance hétérogène/inconnue.
- Aucun nouveau compte, cloud ou autosave. La récupération et les fonctionnalités ultérieures ont des branches/PR séparées.
