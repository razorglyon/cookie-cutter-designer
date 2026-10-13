# Lot A — tampon creux : validation locale

## Verdict

Ce bilan décrit le lot A du commit local `319d8cd`. L’extension géométrique et le cœur 10 mm sont désormais validés localement : voir `STAMP_QUALIFICATION.md` pour les preuves fraîches du 2026-10-13 et les réserves navigateur/matérielles restantes. Ce bilan historique ne remplace pas cette qualification du nouveau contenu.

**Lot A validé localement après correction du cœur le 2026-10-12.** Le défaut `non-manifold edges 12` est reproduit en RED puis corrigé, sans assouplir les validateurs ni retirer le test. Le verdict initial bloqué est remplacé par les résultats ci-dessous. Cette qualification porte sur le corpus testé, pas sur tous les dessins possibles.

Travail local sur `feature/recessed-stamp`, créée depuis `origin/main` vérifié (`acc50405b4a7d43b9b543893a6f77d6eeea3201a`). Remote vérifié : `razorglyon/cookie-cutter-designer`. Aucun push, PR, fusion ou déploiement. Lots B–E exclus.

## Périmètre implémenté

- Document/enveloppe V4 stricts, exclusivement Stamp, `bridges: []`, `imprintMode: raised | recessed`. Les définitions V1/V2/V3, paramètres legacy et valeurs par défaut sont conservés ; les anciens tests de « version future » visent maintenant V5.
- Commande session atomique, historique, sauvegarde JSON/stockage/récupération et snapshots de génération. Le mode ne passe pas dans `CookieCutterParams`.
- Refus explicite au-delà de 3 mm pour conserver nominalement 1 mm d’une base fixe de 4 mm ; absence de base refusée. Réduction à 3 mm proposée comme action volontaire, sans perte du réglage relief au refus.
- Contrôles Relief/Creux accessibles, profondeur/épaisseur restante explicites. Les gardes synchrones d’export incluent le mode, même après annulation de la régénération avec conservation du mesh précédent.
- Soustraction sur la face d’impression, poignée au dos. La réparation historique des petits capots reste exclusivement sur le relief. Les plans connus de profondeur sont recalés dans l’epsilon JSCAD sans ajouter/supprimer/reboucher de faces.

## Tests réellement exécutés

Toutes les commandes lourdes utilisent le TMP produit par `/workspace/.hermes-tools/workspace-tmp.py`, ainsi que `GOMAXPROCS=2` et `UV_THREADPOOL_SIZE=2`. Preuves initiales sous `/workspace/reports/recessed-stamp-noihqr_1/`, qualification après correctif sous `/workspace/reports/recessed-heart-opc6i2_c/`. Vitest utilise un worker, sans parallélisme de fichiers.

- Baseline avant modifications de production : **34/34**, empreintes géométriques relief cercle/trou/îlots/poignée et STL V1/V2 inchangés.
- RED document/codec V4 : **18 échecs / 1 succès**. RED session : **6 échecs / 1 succès**. RED géométrie initiale : **6 échecs / 8 succès**. RED recette/UI/export : **4 échecs / 15 succès**, dont export incorrect de l’ancien relief après annulation.
- GREEN initial contrat/session/stores historiques : **99/99**. La première qualification complète avait **1 193 succès / 1 échec** ; cet ancien résultat n'est pas le verdict courant.
- RED du correctif : **1 échec / 19 succès** pour le cœur original, puis **11 échecs / 19 succès** après ajout des combinaisons profondeur/poignée. Logs `red-heart-fix-2035.log` et `red-heart-depths-handles.log`.
- GREEN final ciblé géométrie/recette/App/contrat/session : **76/76**, 5 fichiers. Le parcours App exerce le cercle **et** le cœur, Undo/Redo, édition, sauvegarde/réouverture et garde d'export.
- Suite finale complète : **1 205/1 205**, 91 fichiers, 0 échec ; terminée normalement en **322,04 s** côté lanceur. Rapport `full-suite-vitest.json`.
- `pnpm check` : **0 erreur, 0 avertissement**.
- `pnpm build` : **réussi**, budgets existants respectés.
- `pnpm test:smoke --pool=threads --fileParallelism=false` : **4/4**.
- Contrôle global des notes du profil : échec uniquement pour les contextes trop longs de Limace et Sangsue, non modifiés. Ce projet respecte la limite (5 981 caractères), TMP/branche/état présents ; ce contrôle n'est pas un test applicatif.

Commandes reproductibles depuis la racine :

```sh
REPO_TMP=$(python3 /workspace/.hermes-tools/workspace-tmp.py --repo "$PWD" --purpose commands --path-only) || exit 1
test -n "$REPO_TMP" || exit 1
export TMPDIR="$REPO_TMP" GOMAXPROCS=2 UV_THREADPOOL_SIZE=2
pnpm exec vitest run src/lib/utils/__tests__/stampGenerator.test.ts src/lib/generation/recipes/__tests__/stampRecipe.test.ts src/__tests__/App.recessed-stamp.test.ts src/lib/projects/__tests__/recessedStamp.test.ts src/lib/projects/__tests__/recessedStampSession.test.ts --pool=threads --maxWorkers=1 --fileParallelism=false
pnpm test:run --pool=threads --maxWorkers=1 --fileParallelism=false
pnpm check
pnpm build
pnpm test:smoke --pool=threads --fileParallelism=false
```

## Recette Chromium finale — cœur

Build local servi par Vite preview sur loopback, sans exposition publique. Runner et navigateur possédés et arrêtés ; dernière collecte : `/workspace/reports/recessed-heart-opc6i2_c/browser-VvSzWY/browser-result.json`. Le runner `browser-smoke.mjs` est archivé dans son répertoire parent. La recette est rattachée aux empreintes des sources, pas au seul SHA de la base Git.

- Desktop 1 365 × 900 et mobile 390 × 844 ; captures inspectées. Refus d’un relief à 5 mm sans mutation, réduction volontaire puis sélection Creux au clavier.
- Vraie lecture IndexedDB après sauvegarde, téléchargement `.ccd.json` V4, rechargement complet et ouverture explicite par la bibliothèque.
- Aperçu WebGL réel et STL binaire téléchargé : **1 828 triangles, 91 484 octets**, dimensions affichées 75 × 75 × 12 mm (poignée 8 mm comprise), présence du plan de fond à 9 mm conservant 1 mm de base. Une coque connectée, arêtes partagées deux fois avec orientations opposées, aucun triangle dégénéré, volume signé positif.
- JSON exact et STL **identique octet par octet après réouverture** : SHA-256 `cc943cca4ebaab2bb6d2c503f4ae0b2317b1a024f1c2c641cda32964981a89c6`. Retour Relief puis Creux régénère les bons exports.
- Deux cibles tactiles d’au moins 44 px, état sélectionné, absence de débordement global ; capture mobile recadrée par défilement et hit-tests des deux boutons.
- Aucun message d’erreur navigateur ; **56 assets** du paquet servi comparés au build local ; **233 empreintes de sources identiques avant/après** et aux entrées de qualification finale.

Cette recette navigateur finale valide le cœur. Le cercle avait également passé le navigateur avant le correctif ; ses régressions et la suite complète ont été réexécutées après le correctif. Les seuls changements ultérieurs aux 233 empreintes qualifiées sont documentaires et dans la note locale.

## Diagnostic et correctif

Le diagnostic isole les jonctions en T et les doublons numériques lors du snapping JSCAD. La double passe publique sans canonicalisation conservait six arêtes ouvertes ; avec canonicalisation à 1e-8 mm, aucune arête ouverte et validation JSCAD réussie (`publicTwoPass` dans `stages.json`).

Le chemin creux canonicalise les coordonnées, triangule/raccorde sans snap ni simplification, puis applique snap/triangulation sans simplification. Il utilise seulement les API publiques JSCAD et ne rebouche/supprime aucune face. Les plans de profondeur sont recalés dans l'epsilon JSCAD ; la réparation des capots reste exclusivement relief. Les essais exploratoires infructueux sont retirés et leurs diagnostics archivés hors du dépôt applicatif.

Les régressions couvrent le cœur à **0,1 et 3 mm** avec **les cinq styles de poignée**, les raycasts de profondeur, une coque/volume/manifold valides et le STL. Le chemin relief historique, ses empreintes et les formats V1–V3 restent inchangés.

## Limites et défaut historique distinct

Le cœur en **relief**, 75 mm / profondeur 2 mm / sans poignée, est déjà refusé sur le générateur exact de la base Git (`boolean repair refused a non-triangular boundary`). Ce rejet est reproduit également sur la branche ; le même cas en creux est valide. Il n'est ni introduit ni corrigé par V4. Preuve : `baseline-raised-refusal.log`.

Pas de slicer disponible, pas d’impression physique, pas de Safari/Firefox/téléphone réel/lecteur d’écran, ni qualification des tailles ou complexités maximales. **STL structurellement validé sur le corpus testé ; impression physique non testée.** Le texte local antérieur d’`AGENT_CONTEXT.md` est intégralement préservé, avec uniquement un court en-tête de reprise ajouté ; cette note reste exclue de toute indexation.
