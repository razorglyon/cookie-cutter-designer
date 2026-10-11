# Lot 5 — ponts manuels entre îlots : validation locale

Date : 11 octobre 2026. Branche `feature/manual-island-bridges`, issue de `origin/main` au commit `ee647698f4b94e75ba5993460e0f39527cc70f2e`. Commit et push de la branche autorisés par Rza ; aucune PR, fusion ou déploiement autorisé.

## Contrat et chemin de données

- Les projets historiques restent des documents **V1** tant qu'aucun pont n'est ajouté ; leur lecture, leur sauvegarde et leur génération suivent le chemin V1. Le premier ajout de pont promeut explicitement, par copie, vers **V2**. La version de l'enveloppe `.ccd.json` correspond à celle du document. Le parseur strict refuse les versions futures et les ponts mal formés.
- Un pont possède deux extrémités en coordonnées SVG, une largeur physique en millimètres et un identifiant stable. Les bornes du contrat sont 32 ponts, 0,8–10 mm et des coordonnées finies dans ±1 000 000. Chaque extrémité doit rejoindre un contour distinct ; croisements et segments superposés sont rejetés, mais deux ponts en chaîne peuvent partager une extrémité.
- L'édition passe par le document canonique et l'historique de session : ajout, déplacement souris/clavier/tactile, suppression, suppression globale et Undo/Redo. Un commit asynchrone revalide snapshot, époque et composant monté avant de publier ; une validation refusée ne modifie ni document ni historique.
- La géométrie des ponts est unie aux empreintes de paroi, avec conservation des trous et loft des parois, y compris poignée et dépouille. Une connexion **complète** doit générer une seule coque fermée et imprimable. Si plusieurs îlots exigent plusieurs ponts, chaque pont individuellement valide peut être conservé comme état **intermédiaire V2** ; l'export STL reste désactivé jusqu'à la connexion finale. Le modèle sans pont conserve son chemin historique. Le JSON de projet reste exportable pendant l'état intermédiaire.
- Une modification ultérieure du dessin peut invalider des ponts sauvegardés. L'export est alors bloqué ; « Supprimer tous les ponts » permet de récupérer en une action annulable même quand les suppressions individuelles ne passent pas la prévalidation.

## Vérifications automatisées

Avec `TMPDIR` isolé par `/workspace/.hermes-tools/workspace-tmp.py --repo "$PWD" --purpose commands --path-only`, `GOMAXPROCS=2` et `UV_THREADPOOL_SIZE=2` :

| Commande | Résultat |
| --- | --- |
| `pnpm check` | 0 erreur, 0 avertissement |
| `pnpm test:run --pool=threads --maxWorkers=1 --fileParallelism=false` | 1 083 tests réussis, 77 fichiers |
| `pnpm test:smoke --pool=threads --fileParallelism=false` | 3 tests réussis |
| `pnpm build` | réussi |
| `pnpm audit` | `No known vulnerabilities found` |
| `git diff --check` | réussi |

Les tests couvrent migration non mutante, codec V1/V2, persistance/récupération, publication asynchrone, historique, ponts isolés et en chaîne, segments superposés, trou central effectivement ouvert au rayon Three.js, variantes de poignée/dépouille et compatibilité du chemin sans pont. Le test du premier pont d'une chaîne à trois contours a d'abord échoué avant le correctif ; un test de chevauchement colinéaire et celui du trou central avaient également échoué avant leurs corrections. Les validations finales correspondantes sont vertes. Journaux locaux : `/workspace/reports/manual-island-bridges-final-{check,tests,smoke,build,audit}.log`.

## Navigateur réel (build de production, Chromium local)

Script de recette hors dépôt : `/workspace/reports/manual-island-bridges-smoke.mjs`. Rapport du dernier parcours : `/workspace/reports/manual-island-bridges-1791718707624/report.json` ; captures avant, desktop et mobile dans le même répertoire. Ce n'est pas un mock du générateur : le parcours charge de vrais SVG, déclenche génération et téléchargement STL, puis recharge des projets IndexedDB.

- Un pont : ajout, déplacement clavier/souris/tactile, suppression et Undo/Redo ; export JSON V1 de départ puis V2 après ajout, sauvegarde, rechargement et STL **strictement identique** avant/après : 6 284 octets, 124 triangles, SHA-256 `35a7017f7752b3754956b71c5b4a0b600215a5aa91cbaa7bfa9e4c50bb0ceb3e`.
- Trois contours : premier pont sauvegardé puis rouvert comme projet V2 incomplet, bouton STL désactivé ; second pont posé depuis l'extrémité existante, Undo/Redo, STL exporté (10 084 octets, 200 triangles), projet JSON à deux ponts vérifié ; suppression globale suivie d'Undo. Aucun événement console erroné ni requête échouée dans le rapport.
- Vue mobile émulée à 375 px : document à 375 px, sans débordement horizontal ; déplacement tactile et Undo exercés. Serveur de preview arrêté et port fermé après la recette.

Non-régression navigateur V1 : `/workspace/reports/raster-circle-loft-1791719156523/report.json`. Le cercle raster conserve son JSON canonique, la source, et le STL de 178 884 octets / 3 576 triangles **identique après rechargement** (SHA-256 `272704f5baea3144ea793aec695e41eb049ba7ef6d6ff07477b28f804d4b1381`). Le script rapporte `pass`, `sourceUnchanged` et `portClosed`.

Budgets JavaScript mesurés sur les fichiers réels de `dist/assets` : entrée `index-ygi8OyIm.js` **173 489 octets** < 200 KiB ; plus grand autre chunk `three-vendor-BVsn0h3b.js` **561 528 octets** < 600 KiB ; 35 fichiers JS, aucune violation. Ces tailles doivent être relevées de nouveau après toute modification du build.

## Limites

Aucun essai sur téléphone physique, autre moteur de navigateur, slicer ou imprimante 3D ; les contrôles de coque n'attestent pas tous les SVG possibles ni la résistance mécanique réelle d'un pont de 0,8 mm. Le navigateur est un Chromium local à localhost, le toucher est émulé. L'historique Undo/Redo reste en mémoire de l'onglet, pas dans le JSON. Le script Playwright et ses artefacts sont hors dépôt : les tests Vitest suivis par Git constituent la régression automatique partageable. Les workflows Quality/CodeQL ne se déclenchent pas sur un simple push de cette branche ; aucune PR, fusion ou déploiement du lot n'a été exécuté.
