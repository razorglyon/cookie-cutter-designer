# Préparation photo guidée — qualification locale

## État

2026-10-10, branche `feature/robust-photo-import`, base `8683d16b73e843d5bc04ee149151944788a601fe` (#67). Diff local non commité/non publié. **Validé localement sur le snapshot final** : 1 068/1 068 tests, check0/0, smoke3/3, build/audit/diff verts et recette réelle rejouée après les correctifs. Les essais précédents restent décrits ci-dessous, mais ne remplacent pas ces preuves finales. Aucun commit/push/PR/merge/deploy du chantier. Revue indépendante du correctif cap : aucun bloqueur ; vérification numérique de216 cas/permutations et8 refus rapportée par le relecteur, distincte des tests exécutés par le parent. Aucun sous-agent encore actif au contrôle final.

## Parcours et propriété de l’état

`Dessin contrasté` conserve le traitement historique. `Photo — préparation guidée` n’est plus un flou2/pathomit16 : aperçu original/contour, recadrage normalisé, seuil luminance automatique ou manuel, polarité sombre/claire. Nettoyage par surface et comblement des trous explicitement choisis, off par défaut ; effets comptés et annoncés. Pas de sélection cachée du plus gros objet. Masques vides/uniformes, contact avec bord, composants multiples, contacts diagonaux ou complexité excessive refusés avant application. Les trous sont conservés, et la vectorisation qui ne peut pas les représenter est refusée.

`PhotoImportReview` possède le brouillon de réglages, le résultat et le signal ; changement de réglage invalide Apply jusqu’au recalcul. App conserve document, epoch et révision de source jusqu’à confirmation. Annulation/navigation/changement de document rejettent les réponses tardives. Un import confirmé crée le projet ; un retrace confirmé ne remplace que le sketch, via l’historique canonique. Source/identité/paramètres restent identiques.

Chaque préparation possède son Worker, terminé sur succès/abort/erreur/timeout. Décodage et traitement par createImageBitmap/OffscreenCanvas. Crop puis travail limité à1024px par côté et1MP ; fichier≤10Mio, raster source≤8192px/côté et16MP. Pas de cloud. La limite source est vérifiée après décodage du bitmap : ce n’est pas une garantie universelle de consommation mémoire pendant le décodage navigateur.

V1 inchangé : le raster et les réglages ne sont pas persistés. Réimport requis après reload. Préparation valide le contour, **pas l’imprimabilité** : les gardes de génération/export restent obligatoires.

## Corpus reproductible

Photos réelles `coins`, `coffee`, `chelsea`, attribution et empreintes dans `src/lib/import/__tests__/fixtures/photos/README.md`. Aucun téléchargement pendant les tests. Fixtures PNG décodées en tests Node et segmentation/vectorisation déterministes, sans mutation de l’original ; fond complexe refusé, aucun trou/îlot supprimé implicitement. Coin recadré explicite préparé avec un seul composant. Ces trois photos ne prouvent pas une segmentation universelle ni une reconnaissance d’objet.

## Premières gates (avant le correctif cap)

Manifest et logs `/workspace/reports/robust-photo-gates-1791670270537866951/manifest.json` ; sources SHA-256 inchangées pendant exécution, chaque code de sortie0 :

- ciblés :96 tests /5 fichiers ;
- `pnpm test:run --pool=threads --maxWorkers=1 --fileParallelism=false` :1065/1065 tests /72 fichiers ;
- `pnpm check` :0 erreur/0 warning ;
- `pnpm test:smoke --pool=threads --fileParallelism=false` :3/3 ;
- `pnpm build` :réussi, budgets200KiB entry/600KiB autres chunks non relevés.

TMP isolé sous workspace, GOMAXPROCS2/UV_THREADPOOL_SIZE2, gates sérialisées. Les commandes et logs individuels sont enregistrés, pas déduits du seul exit du wrapper.

## Recette réelle et défaut détecté

Runner hors dépôt `/workspace/reports/robust-photo-browser.mjs`, stockage jetable Chromium, build dist. Rapport initial `/workspace/reports/robust-photo-1791669949838/report.json` : pièce photographiée recadrée, Apply distinct, STL valide85584octets/1710triangles ; annulation retrace sans mutation ; IndexedDB/reload JSON et STL exacts ; raster non reconstruit après reload. Coffee plein cadre refuse1941 composants/1837 trous sans publication ; mobile375px sans overflow. Pas d’erreur JS/requête ; serveurs arrêtés/ports fermés.

Recette étendue `/workspace/reports/robust-photo-1791670700031/report.json` : seuil manuel140 produit un contour différent, puis génération refuse `The wall triangulation produced a degenerate triangle.` Export bloqué, aucun STL invalide produit. Le scénario undo/redo s’est donc arrêté : **ce rapport ne prouve pas son succès**.

RED produit : `/workspace/reports/robust-photo-geometry-red-product.log`, photo-auto réussit, photo-threshold140 échoue dans addCap. Instrumentation temporaire retirée, diagnostic hors dépôt `/workspace/reports/robust-photo-geometry-debug.log` : trois sommets alignés, aire double≈1.78e-14. `repairCollinearCapFaces` remplace le couple de faces adjacent en partageant le voisin via le point médian : mêmes sommets/arêtes frontières, aire conservée, aucune suppression de triangle/point/trou. Projection intérieure, voisin unique, nouvelle diagonale non existante et faces non dégénérées exigés ; en cas d’incertitude, garde stricte historique inchangée. Deux photos dérivées conservées comme fixtures.

Après premier correctif :39/39 tests dans photoGeometry, cutterGeometry et cookieCutterGenerator. Le contrôle renforcé `validatePrintableObject` a ensuite révélé une deuxième erreur : le chemin blanc servant de fond à l’aperçu était interprété comme une frontière de découpe et ajoutait un cadre. RED conservé dans `/workspace/reports/robust-photo-background-red.log` : deux tests refusent un path blanc. Worker corrigé pour n’émettre que les contours noirs ; le fond visuel appartient à la surface CSS, pas au SVG. Aucun filtre global sur les couleurs des SVG utilisateur ou sur le pipeline contrasté.

Les fixtures actuelles photo-auto/photo-threshold140 proviennent des exports Chromium du résultat corrigé. Test explicite : `validatePrintableObject(..., {requireSingleShell:true})`, fermeture, winding et volume positifs, une seule coque et un seul contour. L’ancien SVG avec cadre est conservé séparément (`coin-photo-pre-fix-frame.svg`) uniquement pour la régression cap ; il n’est jamais présenté comme la bonne sortie utilisateur.

Une attente UI du panneau CollisionDetector échouait à1s lors de son chargement différé (également en ciblé). Le test attend désormais le vrai contrôle jusqu’à10s, comme le reste du parcours asynchrone : toutes les assertions de refus de mutation et d’export sont conservées. Aucun timeout du produit ni contrôle de sécurité changé ; instrumentation temporaire retirée.

## Qualification finale après tous les correctifs

Manifest `/workspace/reports/robust-photo-qualified-gates-1791673153140978086/manifest.json`, hashes source identiques avant/après exécution ; tous les codes de sortie0 :

- ciblés photos/import/export/géométrie :151/151 tests dans9 fichiers ;
- suite entière :**1 068/1 068 tests,73 fichiers** ;
- `pnpm check` :0 erreur/0 warning ;
- exports smoke :3/3 ; build réussi,684 modules ;
- `pnpm audit --audit-level=moderate` :aucune vulnérabilité connue ;
- `git diff --check` :réussi ; budgets200/600KiB inchangés.

Recette finale sur ce dist : `/workspace/reports/robust-photo-1791673558128/report.json`.

- Photo caméra `coins.png`, crop33.3%/33.3%/14.1%/17.8%, polarité claire, nettoyage9px², silhouette extérieure explicitement choisie. Apply distinct du calcul, réglages invalidant le précédent résultat.
- STL de la seule silhouette :94 584octets /1 890triangles ; SHA-256 `a1fc1850819fea162ee1aea776ea235a0a740161cb13cb85a5b8869205380a32`. Ancienne valeur1 710 incluait le cadre incorrect et **n’est pas** une preuve de fidélité de la photo.
- Revectorisation réelle avec seuil manuel140 produit un autre sketch ; identité/nom/source/paramètres/viewport/date création restent inchangés. Génération/export réussis ; undo/redo restore les documents exacts, STL original retrouvé après undo.
- Annulation conserve le document exact ; IndexedDB sauvegarde/recharge JSON et STL strictement identiques. V1 demande bien l’original après reload.
- Coffee complexe :Apply désactivé, diagnostics explicites, aucun objet choisi/supprimé silencieusement. Mobile375px, document375px ; annulation conserve le projet. Pas d’erreur JS/console/requête.
- Serveur/navigateur fermés, port fermé. Captures desktop/mobile inspectées ; poignée/cadrage visibles sans chevauchement dans les zones exercées, contrôles restants atteints via défilement.

Cercle historique sur le même build : `/workspace/reports/raster-circle-loft-1791673641926/report.json`,178 884octets/3 576triangles, JSON et STL exacts après reload ; SHA-256 STL `272704f5baea3144ea793aec695e41eb049ba7ef6d6ff07477b28f804d4b1381` inchangé. Serveur et port fermés, aucune erreur. Les gates et recettes ne sont pas une CI distante.

## Limites

Pas d’objet arbitraire extrait automatiquement, pas d’IA sémantique ; recadrage et contraste sont des décisions utilisateur. Les détails impossibles à segmenter ne sont pas inventés. Nettoyage et comblement destructifs restent explicites. Le contour peut rester inadéquat aux dimensions/parois demandées ; l’application bloque l’export plutôt que livrer une forme non valide.

Pas de mesure de performance sur gros fichiers, de Safari/iOS physique, de lecteur d’écran ou d’impression réelle. L’absence d’overflow375px et un viewport tactile Chromium ne certifient pas tout device. Pas de CI distante ni déploiement du chantier.
