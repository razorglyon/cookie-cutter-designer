# Cutter series — lot 7a, validation locale

## Périmètre et état

Le 2026-10-11, Rza a autorisé l’implémentation locale du lot 7a : copies homogènes **séparées et reprenables** du Cutter courant. Branche `feature/reprenable-cutter-series`, créée depuis `origin/main` vérifié à `1c9e54a2507eceac7bcb788ffc5ad90d4c38cc9e` (lot 6 intégré). Cette qualification précède la publication. GO explicite supplémentaire de Rza le 2026-10-11 : commit, push, PR, fusion uniquement après contrôles Quality et sécurité verts du SHA exact, puis vérification du déploiement Pages. Au moment de cette rédaction précommit, la production reste au lot 6 ; le résultat distant sera enregistré dans la note de reprise.

- Entrée Batch existante : ouvrir/saisir ne change pas le document ; Créer/Appliquer publie une modification atomique, enregistrée dans l’historique canonique.
- Un dessin et un jeu de paramètres, poignées et ponts communs. Profils Fin / Standard / Robuste et valeurs personnalisées continuent d’éditer la source de la série.
- Copies 1–24, colonnes 1–copies, espacement positif 0,5–40 mm ; lignes dérivées. Arrangement sur le plateau carré existant, mesuré depuis la géométrie complète, poignée comprise.
- Document/enveloppe V3 stricts (`kind: multi-cutter`, `layout`, ponts), sans meshes sérialisés. V1/V2 inchangés tant que la fonction n’est pas utilisée. Identité, source originale, sketch, paramètres et viewport conservés. Retour au Cutter unique : V2 si des ponts existent, sinon V1, sans réinitialisation des paramètres.
- Pas de migration automatique ni de nouvel identifiant de profil ; l’ancienne version de production refuse les fichiers V3 comme version future. Le format V3 nécessite la nouvelle application.
- Réutilisation de CutterRecipe et du moteur Batch ; le Cutter doit être complet/connecté. Chaque copie possède ses géométries et matériaux ; le prototype est libéré. Annulation et échec de placement ne publient aucune série partielle. Limite totale 500 000 triangles vérifiée avant duplication.
- Disposition physiquement impossible : document sauvegardable et JSON exportable, mais géométrie bloquée. Batch reste accessible sans mesh après réouverture pour réduire la disposition ; message sur le plateau, sans réparation automatique.
- Batch libre historique conservé sous un choix explicitement non enregistrable. Hors lot : connexions entre copies, monobloc, plusieurs dessins/tailles, Stamp, placement libre ou optimiseur avancé, socle/paroi/tranchant indépendants.

## TDD et régressions

Cycles RED/GREEN observés pour le contrat V3, la promotion/session, la recette absente et les contrôles de série absents. Compléments RED/GREEN : gardes Cutter-only empêchant l’édition des ponts V3 ; erreur de paramètres restant affichée après correction via le port UI ; impasse de réparation d’une V3 trop grande après réouverture et message de plateau masqué par une erreur générique. Les assertions d’export exigent un vrai bouton, pas `every()` sur une liste potentiellement vide.

Couverture complémentaire (pas présentée comme RED avant implémentation) : ownership des clones, annulation entre copies et libération des ressources ; préflight de budget de triangles avec compteur injecté à la frontière du validateur. Ce dernier prouve le garde, **pas** la performance d’une géométrie réelle de 500 000 triangles.

Les anciennes fixtures « version future 3 » passent à 4, en gardant le rejet strict et la priorité du diagnostic de version. Les changements de typage de fixtures reflètent la nouvelle union sans `any`. Un premier runner App a cherché Undo dans Batch plutôt que Parameters ; une attente trop courte d’import dynamique a aussi échoué. Ces tentatives ne sont pas des validations réussies ; la recette finale suit les contrôles réels avec une attente bornée.

## Qualification finale après le dernier patch applicatif

Depuis la racine Git, TMP isolé par `/workspace/.hermes-tools/workspace-tmp.py`, `GOMAXPROCS=2`, `UV_THREADPOOL_SIZE=2`, gates sérialisées :

| Contrôle | Résultat |
|---|---|
| Tests concernés et voisins | 511/511, 29 fichiers |
| Suite complète | 1 128/1 128, 84 fichiers |
| `pnpm check` | exit 0, Svelte 0 erreur / 0 avertissement, tsc réussi |
| `pnpm test:smoke --pool=threads --fileParallelism=false` | 4/4 |
| `pnpm benchmark --pool=threads --fileParallelism=false` | 2/2 |
| `pnpm build` | réussi |
| Budgets finaux JS | 37 fichiers, entrée 178 253 octets < 200 KiB ; autre chunk max 561 528 octets < 600 KiB ; aucune violation |
| `git diff --check` | réussi |

Tests : `pnpm test:run --pool=threads --maxWorkers=1 --fileParallelism=false`. Ne pas redonner maxWorkers aux scripts smoke/benchmark qui le fixent déjà. Artefacts smoke/benchmark dans leurs répertoires privés uniques sous le TMP du dépôt, comportement sécurisé du lot 6 conservé.

Logs : `/workspace/reports/multi-cutter-{targeted,full,check,smoke,benchmark,build}-qualified.log`. Le premier appel groupé a dépassé 420 s : ses journaux ont montré des tests terminés et un tsc encore actif. Le check a ensuite été confirmé par un vrai exit 0 ; les gates finales ci-dessus ont été relancées après les correctifs navigateur. Ne pas qualifier le timeout initial de succès.

## Recette navigateur réelle

Chromium existant, serveur de build localhost possédé par le runner, nouveaux contextes de stockage. Aucun store, réponse réseau ou donnée persistée injectés. Runner hors dépôt : `/workspace/reports/cutter-series-smoke.mjs`. Rapport final **PASS** : `/workspace/reports/cutter-series-browser-PjTE35/report.json`.

- Baseline réelle archivée depuis le SHA main vérifié et reconstruite dans le TMP, puis comparée au nouveau dist. HTML et tous les assets de ces deux builds relus en HTTP et comparés à leurs SHA-256 : 54 ressources baseline, 56 ressources nouveau build. Ce décompte local n’est pas une nouvelle vérification du déploiement Pages historique.
- V1 à paroi personnalisée 1,4 mm : JSON et STL inchangés sans édition entre main et la nouvelle application. Une copie 576 triangles ; trois copies 1 728, deux copies 1 152. Dimensions STL cohérentes avec le badge aperçu arrondi à 0,1 mm, Z-up et coordonnées finies.
- Ouvrir Batch ne modifie pas le JSON. Copies 25 refusées, document intact ; création 3 copies / 2 colonnes / 5 mm. Undo/Redo exacts, STL identique après Redo.
- Mobile 375×812 : application tactile d’une série de deux copies ; sauvegarde IndexedDB, reload/réouverture, JSON et STL strictement identiques ; profil Personnalisé toujours affiché.
- Disposition 4×1 rangée trop large : export bloqué, JSON sauvegardé et rouvert exact. Sans mesh après reload, export géométrique absent et Batch accessible ; réparation 2 copies / 2 colonnes, STL exact puis retour au Cutter unique au STL original.
- V2 construit par l’éditeur de ponts natif, puis V3 : source/ponts conservés, triangles doublés ; profil Fin réellement appliqué à la source de série ; extrémité du pont déplacée au clavier, disposition conservée ; save/reload et JSON/STL exacts.
- Desktop 1365×900 clair/sombre, mobile sombre ; champs/actions ≥44 px, focus clavier 3 px, pas d’overflow horizontal. Captures des champs et action centrés avec sondes DOM de visibilité/non-occultation, puis inspection visuelle. Le titre ou la fin du texte peut être hors champ après défilement normal du panneau mobile ; les contrôles ciblés sont visibles, sans revendiquer une capture intégrale du panneau.
- Zéro erreur page/console et zéro requête échouée. Les 225 empreintes sous `src/`, HEAD, branche et statut sont identiques avant/après recette ; les empreintes sont encore identiques après la suite finale. Navigateur et serveurs arrêtés ; ports 4354/4355 vérifiés fermés par le runner.

Le premier run navigateur `/workspace/reports/cutter-series-browser-ZMfVGW/` est **FAIL** : il a exposé l’impasse après réouverture d’une série trop grande. Correctifs transformés en tests RED/GREEN, puis qualification complète et run final ci-dessus. Ne pas utiliser cette première capture comme validation du code final.

## Limites

Chromium uniquement, toucher émulé ; pas de Safari/Firefox, téléphone physique, lecteur d’écran, slicer, impression ni essai mécanique/alimentaire. Corpus navigateur : cercle SVG et SVG à un pont simple ; chaînes intermédiaires, annulation et documents malformés couverts par tests, pas rejoués intégralement en navigateur. Pas de nouveau parcours raster/photo ni benchmark de performance des séries maximales. Smoke/benchmark historiques qualifient leurs propres pipelines, pas une promesse de débit pour 24 copies. V3 refuse un Cutter incomplet pour l’export mais le document reste reprenable. Ancien Batch libre toujours hors persistance canonique. CI et CodeQL non exécutés au moment de cette qualification locale ; leur exécution sur le SHA publié est désormais autorisée et reste un prérequis à la fusion. Les contrôles distants ne lèvent pas les limites de recette ci-dessus.
