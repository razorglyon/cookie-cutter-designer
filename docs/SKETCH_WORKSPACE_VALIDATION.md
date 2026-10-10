# Atelier 2D — validation locale du lot 3

## État et périmètre

Validation du 2026-10-10 sur `/workspace/cookie-cutter-designer`, branche `feature/sketch-workspace`, base `8037df81f73e4c4aa6a824e8f75e26b3d80c547c` (#65). Le code d’atelier est **non commité, non publié**. Aucune opération commit/push/PR/merge/déploiement réalisée pendant cette validation. Le build servi est celui du diff local, pas celui du seul SHA de base.

`Advanced Creation` charge désormais `SketchWorkspace` à partir de la session canonique et propose l’historique existant. L’ancien générateur Bézier de formes indépendantes n’est plus l’atelier principal. Les autres outils avancés legacy ne sont pas déclarés migrés par ce lot.

Capacités livrées : sélection d’un path et d’un point, déplacement souris/tactile/clavier (flèches, Shift pour pas de 10 unités SVG), saisie X/Y, ajout d’un milieu, suppression de point, fermeture, miroir horizontal, rotation de 90° autour du centre du viewBox. Les coordonnées sont des **unités SVG, pas des mm**. La génération physique conserve les paramètres du projet.

## Contrats et revue source

- Lecture et édition de `document.sketch.svg` ; `session.updateSketch` est l’unique commande canonique. Identité, nom, source originale et paramètres ne sont pas reconstruits.
- Grammaire volontairement bornée à M/L/C/Q/Z, absolus ou relatifs ; contrôles Bézier conservés. Le path édité peut être réécrit en absolu, mais n’est pas échantillonné en polygone. Les paths voisins et attributs du SVG restent conservés sémantiquement ; la sérialisation XML n’est pas une garantie de conservation octet pour octet du sketch.
- Ajouter/supprimer/fermer exige un seul contour linéaire. Minimum trois points après suppression/avant fermeture. Déplacements et transformations ne suppriment pas les sous-contours voisins.
- Transform/style sur le path ou ses ancêtres, stylesheet, classe du path, géométrie dans defs/SVG imbriqué, commandes non prises en charge et viewBox absent/invalide : édition refusée, raison visible. Les primitives SVG ne sont pas converties.
- Un drag n’écrit qu’à son relâchement ; aperçu local auparavant. Le commit vérifie snapshot exact et époque de session. Escape, pointercancel, perte de capture et blur annulent ; remplacement/restauration invalident un geste obsolète. La navigation qui démonte l’atelier abandonne également le brouillon.
- Historique existant réutilisé, génération réactive existante conservée. Pas de modification des validateurs géométriques, du loft raster ou des seuils bundle. Affichage SVG par image data URL, pas d’injection de SVG avec innerHTML.

La revue n’a pas trouvé de défaut bloquant supplémentaire dans le périmètre exercé. Elle ne démontre pas la prise en charge exhaustive de toutes les constructions SVG/CSS ni les performances sur des fichiers massifs.

## Gates réellement exécutées

TMP projet isolé par `/workspace/.hermes-tools/workspace-tmp.py`, `GOMAXPROCS=2`, `UV_THREADPOOL_SIZE=2`.

| Commande | Résultat |
|---|---|
| `pnpm test:run --pool=threads --maxWorkers=1 --fileParallelism=false` | **988/988**, 67 fichiers, 211.14 s |
| `pnpm check` | **0 erreur, 0 warning** |
| `pnpm test:smoke --pool=threads --fileParallelism=false` | **3/3**, 1 fichier, 3.38 s |
| `pnpm build` | **réussi**, 27.53 s ; budgets inchangés |
| `git diff --check` | **réussi** |

Logs hors dépôt : `/workspace/reports/sketch-full-tests.log`, `sketch-check.log`, `sketch-build.log`. La première invocation du smoke ajoutait `--maxWorkers=1` alors que le script le contient déjà : Vitest a rejeté cette option dupliquée avant de tester. La relance ci-dessus réussit ; ce n’était pas un échec produit. Le log `sketch-export-smoke.log` conserve cet essai erroné.

Le handoff précédent indiquait 987/988 avec expiration de l’attente de chargement dynamique. Le test d’intégration transmis utilise désormais une attente explicite de 10 s pour le panneau réellement chargé, cohérente avec ses attentes de génération. La suite complète a été rejouée et réussit ; ni assertion métier ni fixture n’a été retirée.

## Chromium réel sur dist

Runner hors dépendances applicatives : `/workspace/reports/sketch-workspace-smoke.mjs`. Chromium headless, contexte de stockage jetable, preview `http://127.0.0.1:4342/cookie-cutter-designer/` limitée à localhost. Desktop **1365×900**, mobile **375×812** avec événements tactiles Chromium CDP réels (pas seulement dispatchEvent de PointerEvent).

Rapport final : `/workspace/reports/sketch-workspace-1791659413721/report.json` (**pass: true**). Captures inspectées : `desktop-ready.png`, `mobile-ready-controls.png` ; autres états dans le même dossier.

Parcours vérifiés :

1. Import SVG linéaire → nommer → sauvegarder → ouvrir l’atelier.
2. Déplacement clavier → undo/redo exact ; drag souris → une seule étape undo/redo ; Escape annule.
3. Coordonnées → ajout/suppression → undo ; miroir et rotation → undo.
4. Export JSON : source, id, nom, paramètres identiques au baseline ; sketch réellement modifié.
5. Génération/export STL → sauvegarde IndexedDB → rechargement complet → ouverture → JSON strictement égal et STL strictement égal : **2484 octets, 48 triangles**.
6. Import d’un second projet à identité différente et contour ouvert → fermeture → source inchangée → sauvegarde.
7. Mobile : touchCancel abandonne le brouillon ; touchEnd applique un geste, undo unique. Largeur document **375**, viewport **375**.
8. Drag en cours → navigation Projet et ouverture du second projet → relâchement : export du projet B strictement égal à son snapshot enregistré. Pour éviter de relâcher artificiellement la souris avant la transition, les deux boutons de navigation sont activés par leur méthode DOM click ; aucun store n’est injecté ni muté par le runner.

Aucune erreur JS/console ni requête échouée. Preview et navigateur arrêtés, port fermé. Empreintes des sources et statut Git inchangés avant/après recette.

Les captures prêtes montrent le canvas, les points alignés et le résultat 3D ; les contrôles mobiles se consultent en faisant défiler le panneau, indépendamment du viewer. La barre historique sticky peut masquer le haut du contenu déjà défilé : les captures ne garantissent pas que toute l’interface tient simultanément dans le viewport. Les petites poignées ne sont pas une garantie ergonomique pour tous les doigts ; la sélection et les coordonnées offrent un autre chemin.

Empreintes SHA-256 des sources testées :

```text
src/App.svelte 60d9fa0771af261c90e03e350428b27509d2d8bd7b25193446179e85e5d74836
src/lib/sketch/sketchCommands.ts 440be0ec8d99f3eb25a2de116fdaf36491ca1369bab34ec6d39436130b7bac9b
src/lib/components/ui/SketchWorkspace.svelte f8e382feba14e6f0bc238bc3bca439642f9781a266754bfd1f37dc6ac0b97026
dist/index.html 01114155899556fe7c93e3fbf4a5357be3d68b3c5f34d436f71fd7aa04285029
```

## Non-régression raster

Runner antérieur `/workspace/reports/raster-circle-loft-smoke.mjs` rejoué sur ce même dist : `/workspace/reports/raster-circle-loft-1791659317735/report.json`, **pass: true**. Vrai PNG anticrénelé importé, source/sketch/paramètres identiques à la fixture canonique ; sauvegarde/reload exacts ; STL identique avant/après (**178884 octets, 3576 triangles**), mobile sans overflow, aucune erreur JS/requête, port fermé. Cela valide le parcours raster existant, pas l’édition de tous ses points.

## Limites explicites

- Pas de pinceau, texte, calques, snapping, plume complète, nouvelles primitives ou restaurer-original dédié ; pas de duplication de path ni rotation/échelle libre.
- Pas de revectorisation du raster après reload (octets raster absents en V1), ni historique undo durable après reload.
- Certaines constructions restent en lecture seule, sans polygonisation silencieuse ; absence de garantie générale sur les styles SVG externes ou les géométries arbitraires.
- Les commandes ne certifient pas qu’une édition est imprimable : les gardes génération/export existants restent la référence.
- Performance gros SVG, lecteur d’écran réel, appareil physique, thème sombre exhaustif, autres navigateurs, crash au dernier geste et impression physique non validés dans cette recette.
- Recette locale sur diff non commité : aucune CI distante ou preuve de production pour ce lot.
