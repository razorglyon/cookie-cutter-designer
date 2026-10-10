# Lot 4 — préréglages de vectorisation : validation locale

2026-10-10, branche `feature/tracing-presets`, base `b1b6aa8c35b4a61cd299b1d860650174b0a64e0e`, diff local non commité. Aucun commit/push/PR/merge/deploy ; aucune nouvelle vérification distante.

## Livré et garanties

Deux choix explicites dans Upload et Advanced Creation : Dessin contrasté conserve exactement les options historiques ; Photo — lissage expérimental change uniquement `blurradius: 2` et `pathomit: 16`. Palette déterministe, aucun choix automatique. SVG ignorent ces options. Le choix seul ne modifie rien. Import et retrace passent par le même importeur/Worker existant.

Le fichier raster est volatile, associé à l’epoch de session. Retrace ne remplace que le sketch ; source/id/nom/paramètres conservés. Snapshot exact, signal et epoch gardent la publication ; toute édition concurrente ou remplacement invalide le résultat. Undo récupère les corrections remplacées. V1 reste inchangé et ne contient pas les pixels : après ouverture/reload, réimport demandé, pas de raster fabriqué.

## Commandes réellement réussies après dernier patch applicatif

Avec TMP projet fail-closed et `GOMAXPROCS=2 UV_THREADPOOL_SIZE=2` :

- `pnpm test:run --pool=threads --maxWorkers=1 --fileParallelism=false` : **995/995 tests, 68 fichiers**, 213.74 s.
- `pnpm check` : **0 erreur, 0 warning** ; tsc réussi.
- `pnpm test:smoke --pool=threads --fileParallelism=false` : **3/3**.
- `pnpm build` : réussi, 26.51 s ; entry 166.43 kB, plus gros chunk 561.53 kB.
- `git diff --check` : réussi.

Sorties : `/workspace/reports/tracing-presets-{fulltests,check,smoke,build}.log`.

## Corpus réellement exécuté

Runner hors dépôt `/workspace/reports/tracing-presets-browser.mjs`. Rapport final : `/workspace/reports/tracing-presets-1791664025018/report.json`, PNG/SVG et empreintes SHA-256 dans ce dossier. Quatre **fixtures originales procédurales**, dont le cercle raster historique ; **aucune photographie de caméra**. 2 presets × 3 répétitions × 4 fixtures : **24 vrais décodages Canvas et vectorisations Worker Chromium**, SVG strictement identiques entre répétitions pour chaque couple.

Mesure des coordonnées : paires présentes dans les chemins SVG, y compris contrôles de courbes, **pas un nombre de sommets du mesh**. Topologie mesurée après rasterisation SVG à sa résolution d’origine, seuil noir <128, flood-fill à 4 voisins ; ce n’est pas la topologie printable. Durée inclut décodage et roundtrip Worker ; médiane de trois essais, ordre contrast puis photo, premier cercle inclut démarrage froid. Pas un benchmark contrôlé sous charge constante.

| Fixture | Paires contrast → photo | Composantes contrast → photo | Trous contrast → photo | Médiane ms contrast → photo |
|---|---:|---:|---:|---:|
| Cercle 96×96 | 37 → 37 | 1 → 1 | 0 → 0 | 73.8 → 80.3 |
| Anneau + petit trou 128×128 | 35 → 25 | 1 → 1 | 2 → 1 | 5.2 → 9.3 |
| Détails fins + petit îlot 128×128 | 43 → 33 | 2 → 1 | 1 → 1 | 4.3 → 9.3 |
| Bruit déterministe 128×128 | 634 → 54 | 3 → 1 | 22 → 0 | 8.5 → 12.0 |

Photo réduit le bruit mais supprime aussi un trou voulu et un petit îlot ; la pointe fine testée reste noire dans les deux choix. Cercle identique octet pour octet. Aucune promesse de meilleure qualité photo ni de gain de durée.

## Recette et sécurité : distinction des preuves

Chromium réel dev, desktop 1365×900 et mobile 375×812 : défaut contrast, sélection photo sans mutation exacte du document, clic retrace réellement accessible, retrace cercle identique et identité/source/paramètres/viewport conservés, sauvegarde IndexedDB puis full reload/réouverture exacts, bouton retrace absent et réimport demandé. Largeur mobile 375/375. Aucun pageerror/console error/requête échouée ; serveur arrêté, port fermé, diff source inchangé pendant collecte.

Tests App/happy-dom à Worker simulé : résultat différent met à jour seulement sketch, undo exact, annulation explicite puis réponse tardive, édition et remplacement pendant retrace n’écrasent rien, V1 restauré ne revectorise pas. Le scénario navigateur sur cercle ne valide pas undo d’un résultat différent : les presets produisent ici le même SVG. Aucune injection de store dans la recette UI.

Non-régression sur **dist** : `node /workspace/reports/raster-circle-loft-smoke.mjs`, rapport `/workspace/reports/raster-circle-loft-1791664090814/report.json`. Import raster historique strictement conforme à la fixture canonique ; JSON/reload exact ; STL avant/après identiques : **178884 octets, 3576 triangles**, SHA-256 `272704f5baea3144ea793aec695e41eb049ba7ef6d6ff07477b28f804d4b1381`. Aucune erreur ; serveur arrêté et port fermé.

## Échecs rencontrés et limites

- Première exécution dev interrompue par l’optimisation Vite tardive d’imagetracer/reload ; reprise après cache prêt réussie.
- Bouton retrace recouvert par le dropzone : vrai clic Playwright refusé. Correction du shrink des enfants du panneau scrollable ; vrai clic réussi ensuite et gates complètes rejouées.
- Assertion initiale « cercle doit changer » incorrecte : mesures prouvent des SVG identiques. Remplacée par égalité explicite, aucune preuve de changement inventée.
- Essai UI anneau avec trou 3×3 rejeté par validation géométrique existante : `The contour is too small for the requested wall and taper.` Corpus de tracing conservé, pas présenté comme modèle printable.
- Pas de photo de caméra, gros raster, device/tactile physique, lecteur d’écran, impression physique ni CI distante. Pas de performance UI universelle garantie. Recette presets détaillée en dev ; recette dist couvre cercle/génération/export/reload.

Le lot est implémenté et gates locales vertes dans ce périmètre. Une qualification photographique et une recette navigateur complète de retrace modifiant la géométrie avec undo/cancel restent des extensions de couverture, pas des résultats acquis.
