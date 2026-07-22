# AGENT_CONTEXT — cookie-cutter-designer

## Repo

- GitHub : `razorglyon/cookie-cutter-designer`
- Clone persistant : `/workspace/cookie-cutter-designer`
- Branche par défaut : `main`
- Branche courante : `chore/refresh-dependencies` (destinée à `main`)
- Branche de référence : `main` (`dea9e70` après fusion des PR #35 et #37)
- Push interdit sans GO explicite de Rza.

## Stack

- Langages : TypeScript strict, Svelte
- Frameworks : Svelte 5, Vite 7, Three.js
- Géométrie : js-angusj-clipper, JSCAD
- Raster : ImageTracer dans un Web Worker
- 3MF : fflate
- Package manager : pnpm 10.33.4
- Runtime : Node.js 22.12+

## Commandes

| Action | Commande |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Dev | `pnpm run dev` |
| Preview privé mobile | `./scripts/start-private-preview.sh` |
| Test complet | `pnpm exec vitest run --maxWorkers=1` |
| Smoke exports | `pnpm run test:smoke` |
| Benchmark | `pnpm run benchmark` |
| Build | `pnpm run build` |
| Typecheck | `pnpm run check` |
| Audit | `pnpm audit --audit-level=moderate` |

## Structure

- `src/App.svelte` — orchestration, révisions asynchrones, import dynamique du Stamp, dimensions finales.
- `src/lib/utils/contourExtraction.ts` — extraction et normalisation des contours SVG.
- `src/lib/utils/cutterGeometry.ts` — offsets et coque fermée du cutter.
- `src/lib/utils/cookieCutterGenerator.ts` — taille physique, génération et validation du cutter.
- `src/lib/utils/wallThicknessHeatmap.ts` — métadonnées par triangle, palette et lissage viewer-only de l’épaisseur locale.
- `src/lib/components/viewer/ThreeViewer.svelte` — rendu Three.js, toggle et légende de la heatmap d’épaisseur.
- `src/lib/utils/stampGenerator.ts` — union JSCAD relief/base/poignée en solide unique.
- `src/lib/utils/geometryValidation.ts` — topologie du buffer final, orientation, volume et coques.
- `src/lib/utils/manufacturingCoordinates.ts` — Y-up scène vers Z-up fabrication et pose à `Z = 0`.
- `src/lib/utils/stlExporter.ts` — sérialisation STL binaire validée.
- `src/lib/utils/advancedExporter.ts` — OBJ Z-up et package 3MF ZIP/OPC.
- `src/lib/utils/imageProcessor.ts` — décodage Canvas et limites raster.
- `src/lib/utils/workerManager.ts` — requêtes Worker concurrentes et annulables par `requestId`.
- `src/workers/imageProcessor.worker.ts` — vectorisation ImageTracer hors thread UI.
- `src/lib/utils/slicer.ts` — intersections géométriques de couches, pas du slicing d'impression.
- `src/lib/utils/batchProcessor.ts` — batch mesuré, atomique, annulable et nettoyé en rollback.
- `src/lib/utils/__tests__/` — corpus, smoke exports et benchmark inclus.

## État actuel

- Branche : `chore/refresh-dependencies` (destinée à `main`).
- Dernière action : PR #35 fusionnée dans `main`, PR #37 intégrée, puis consolidation de Three.js `0.185.1`, `@types/node` `24.13.3` et `happy-dom` `20.11.1` dans une branche unique.
- Heatmap : mesure par triangle entre contours opposés pendant la génération, propagée après fusion body/poignée dans `geometry.userData`, puis appliquée sur une copie non indexée réservée au viewer.
- Rendu : bleu sous la cible, vert à la cible, orange au maximum mesuré; capots horizontaux neutres et couleurs lissées entre sommets latéraux partagés.
- UI : toggle décoché par défaut, désactivé en mode Stamp, légende accessible `Target / Min / Max` en millimètres et restauration du matériau monochrome après désactivation.
- Stamp : répare uniquement les minuscules trous triangulaires fermés, horizontaux et situés sur le capot supérieur (`≤ 0,01 mm²`, maximum 8), puis relance les validations JSCAD et indépendantes.
- JSCAD : `@jscad/modeling` mis à jour de `2.12.6` à `2.13.0`; la mise à jour seule ne corrige pas le Heart, confirmé par un test rouge sans la réparation locale.
- Régression Heart : forme intégrée à `75 mm`, relief `5 mm`, poignée ronde `8 mm`, hauteur finale `17 mm`, une mesh, un shell et export STL validé.
- Responsive : header compact, navigation horizontale tactile, panneaux sans largeur desktop résiduelle, historique placé en haut, sliders 44 px et overlays 3D adaptés aux écrans étroits.
- Tests : `216/216` réussis dans 22 fichiers avec `--maxWorkers=1` et Three.js `0.185.1`.
- Typecheck : `0 erreur, 0 avertissement`.
- Smoke exports : `3/3` réussis ; STL, OBJ et 3MF générés et validés.
- Build : réussi en 14,50 s ; chunk d’entrée `138,97 kB`, sous la limite `200 KiB`.
- Diff : `git diff --check` réussi.
- Validation visuelle : Circle et Star validés en Cutter; dégradé latéral lissé, capots neutres, thèmes sombre/clair, 20 bascules successives, option désactivée en Stamp. Camofox ne redimensionne pas son viewport (`1860×992`), donc pas de nouvelle capture mobile spécifique à la heatmap.
- Preview mobile privé : Tailscale Serve configuré en userspace sur `cookie-cutter-dev.tail218fe6.ts.net`; accès limité au tailnet.
- Audit : aucune vulnérabilité connue au niveau `moderate` lors du dernier contrôle.
- État Git : branche de dépendances validée localement ; fusion distante encore à réaliser.
- À faire ensuite : fusionner la PR consolidée de dépendances, synchroniser `main` et confirmer zéro PR ouverte.

## Décisions / pièges connus

- Unité logique : millimètre. STL ne stocke pas l'unité ; les coordonnées restent exprimées en mm.
- Scène Three.js : Y-up. Exports slicer : Z-up, modèle posé à `Z = 0`.
- `targetSize` remplace l'ancien facteur abstrait `scale`; migration historique : `scale: 1` devient 75 mm.
- Les dimensions sont ajustées par `width`, `height` ou `longest`, puis mesurées sur le modèle final.
- Toujours valider l'objet source puis sa copie transformée pour la fabrication.
- Le validateur compte les composants par adjacence de triangles, pas par nombre de meshes.
- Le validateur ne garantit pas une détection triangle-triangle exhaustive des auto-intersections.
- Pour les côtés concaves, orienter les triangles depuis la normale locale de l'arête, jamais depuis un centroïde supposé intérieur.
- La heatmap transporte une valeur par triangle dans `BufferGeometry.userData`; l’export STL ignore cette métadonnée et le viewer clone géométrie/matériau avant d’ajouter les couleurs.
- Les capots sont détectés par la normale géométrique de chaque triangle non indexé et restent neutres; seules les faces latérales contribuent au lissage par position partagée.
- Protection de `main` : check strict `validate`, historique linéaire, force-push et suppression interdits ; aucune approbation externe obligatoire sur ce dépôt solo.
- Un détail plus petit que les offsets de paroi peut changer la topologie : refuser explicitement plutôt que lisser silencieusement.
- Stamp impose une base commune afin de connecter tous les reliefs; `modifiers.generalize` répare normalement les unions JSCAD avant triangulation.
- Bug upstream JSCAD confirmé : l’union base/relief du Heart laisse deux trous triangulaires de `0,00004002825 mm²` sur le capot supérieur, même en `2.13.0` avec `simplify: true`.
- `repairBooleanCapTriangles` refuse toute frontière ambiguë, non triangulaire, non horizontale, hors capot supérieur, trop grande ou trop nombreuse; ne jamais élargir ces seuils pour masquer une géométrie réellement invalide.
- Charger `stampGenerator.ts` dynamiquement : un import statique de JSCAD dépasse le budget du bundle initial.
- La vectorisation raster utilise un buffer transférable, un `requestId`, l'annulation, les erreurs structurées et un plafond de 16 MP.
- Tailscale vit hors du repo dans `/root/.local/tailscale` et `/root/.tailscale`; ne jamais committer son état. Le script `scripts/start-private-preview.sh` lance le preview en foreground et coupe Serve à l'arrêt.
- Vite autorise uniquement `cookie-cutter-dev.tail218fe6.ts.net` dans `preview.allowedHosts`; ne pas remplacer cette allowlist par `true`.
- Le décodage raster reste sur Canvas/UI; ImageTracer s'exécute dans le Worker.
- L'aperçu de couches montre les intersections X/Z réelles et ne doit jamais être présenté comme un slicer ou une estimation de temps.
- Le batch ne publie rien avant réussite complète; tout échec ou annulation détruit les géométries partielles.
- Aucun faux G-code : orienter vers OrcaSlicer, PrusaSlicer, Bambu Studio ou Cura.
- Un 3MF est un package OPC/ZIP, jamais un XML renommé.
- Préserver la fenêtre exacte `byteOffset`/`byteLength` du `DataView` STL.
- Les panneaux optionnels et JSCAD restent chargés par `import()` pour respecter les budgets Vite.
- Examiner tout nouvel usage de `{@html}` avec un SVG non fiable.
- La clé Gemini reste locale au navigateur et ne doit jamais être committée ou réaffichée.

## Documentation

- Usage et garanties : `README.md`
- Architecture historique : `CLAUDE.md`
- Maintenance : `docs/MAINTENANCE.md`
- Sécurité : `SECURITY.md`
- Plan UX/UI : `.hermes/plans/2026-07-22_081456-ux-ui-consistency.md`
