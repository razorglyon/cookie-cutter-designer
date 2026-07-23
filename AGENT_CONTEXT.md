# AGENT_CONTEXT — cookie-cutter-designer

## Repo

- GitHub : `razorglyon/cookie-cutter-designer`
- Clone persistant : `/workspace/cookie-cutter-designer`
- Branche par défaut : `main`
- Branche courante de référence : `feature/design-domain-foundation`
- Dernière consolidation : PR #35 (pipeline/heatmap), PR #37 (`@tsconfig/svelte`) et PR #40 (dépendances cœur)
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
- `src/lib/domain/` — contrats persistants V1, validation runtime stricte, sûreté SVG et migration du format projet legacy.
- `src/lib/projects/` — codec JSON portable, compatibilité legacy, repository validé et adaptateur IndexedDB natif.
- `src/lib/generation/` — contrat de recette typé, registry lazy local et adaptateurs de génération par kind.

## État actuel

- Branche : `feature/design-domain-foundation`, créée depuis le commit documentaire local `125c696`.
- Dernière action : tâche 2.2 implémentée en TDD ; `cutterRecipe` adapte le document V1 vers le générateur legacy sans modifier sa géométrie et rejoue exactement la fixture Cutter.
- Domaine : catalogue de 11 `DesignKind`, mais seuls `cutter` et `stamp` sont constructibles ; les neuf recettes futures restent mappées vers `never`.
- Persistance : `DesignDocumentV1` readonly et sérialisable, discriminé par `kind`; `source` conserve l’import initial normalisé et `sketch` l’état vectoriel éditable courant.
- Runtime : `GeneratedArtifact<K>` contient l’`Object3D` Three.js et le rapport géométrique, avec rôles bornés par kind ; il ne doit jamais être sérialisé dans un projet.
- Paramètres V1 : DTO, valeurs par défaut et limites figés dans `domain`, sans dépendance de production vers `CookieCutterParams`, les stores ou `generationValidation`.
- Validation : parseur `unknown` strict, clés exactes, dates ISO, nombres bornés, invariants Cutter/Stamp, recettes non implémentées rejetées et objets reconstruits sans mutation.
- SVG : politique allowlist géométrique ; XML bien formé et racine `<svg>` obligatoires ; styles inline, ressources externes, événements, namespaces étrangers et contenu actif refusés.
- Migration : vrai `ProjectData` legacy `1.0.0` vers V1, conversion `scale → targetSize`, sources SVG/PNG/JPEG, UUID par défaut avec factory injectable et avertissements explicites pour `thumbnail`/`notes` non représentables.
- Projet portable : enveloppe JSON exacte `{ format, version, document }`, round-trip Cutter/Stamp, refus des versions futures et import legacy via la migration V0→V1.
- Stockage local : repository injectable avec copies défensives et validation en entrée/sortie ; adaptateur IndexedDB natif `cookie-cutter-designer` v1, store `projects`, clé `id`.
- Registry : instance locale, loaders lazy, cache de promesse concurrente, retry après rejet, validation structurelle des modules et résolution TypeScript distributive.
- Fixtures legacy : SVG avec trou, paramètres complets, dimensions monde, triangles, coques, volume signé, erreur attendue et hash FNV-1a orienté quantifié à `1e-4 mm`.
- Recette Cutter : validation unknown structurée, priorité d’annulation, validation d’imprimabilité finale et transfert explicite de l’ownership Three.js dans un unique artefact `role: cutter`.
- Reviews : domaine `APPROVED`; projet portable `PASS/APPROVED`; registry `PASS/APPROVED`; fixtures legacy `PASS/APPROVED`; recette Cutter `PASS/APPROVED` après renforcement des preuves de disposal et propagation d’erreur.
- Tests : `355/355` réussis dans 30 fichiers avec `--maxWorkers=1`.
- Typecheck : `0 erreur, 0 avertissement`.
- Smoke exports : `3/3` réussis.
- Build : réussi ; warning existant sur le chunk `three-vendor` à `605,79 kB`, inchangé et hors de cette tranche.
- Architecture : zéro import de production interdit depuis `src/lib/domain/` vers les contrats/stores/validateurs legacy.
- Diff : `git diff --check` réussi ; commits locaux `f8ce9c5`, `13cec32`, `39cd1fc` et `4c6f172`, aucun push.
- Réserve vérification : le bridge IndexedDB est typechecké et le repository est testé par backend injecté ; aucun runtime IndexedDB n’était disponible dans Node/happy-dom et le navigateur Hermes a échoué avant navigation.
- À faire ensuite : committer la recette Cutter 2.2, puis adapter Stamp au contrat en rejouant sa fixture sans modifier son cœur géométrique ni son chargement JSCAD dynamique.

## Décisions / pièges connus

- Unité logique : millimètre. STL ne stocke pas l'unité ; les coordonnées restent exprimées en mm.
- Scène Three.js : Y-up. Exports slicer : Z-up, modèle posé à `Z = 0`.
- `targetSize` remplace l'ancien facteur abstrait `scale`; migration historique : `scale: 1` devient 75 mm.
- `DesignDocument.kind` est l’unique discriminant métier ; `parameters.mode` reste uniquement un champ de compatibilité V1 avec le pipeline actuel.
- `DesignKind` expose le catalogue produit complet, mais un kind futur reste `never` tant que son vrai contrat et son pipeline n’existent pas.
- Le schéma persistant V1 doit rester découplé des règles de génération : toute évolution incompatible exige une nouvelle version et une migration explicite.
- Un SVG n’entre dans `DesignDocumentV1` qu’après validation allowlist ; normaliser en amont les métadonnées Illustrator/Inkscape non prises en charge plutôt que d’assouplir silencieusement cette frontière.
- La migration V0→V1 utilise `crypto.randomUUID()` pour éviter l’écrasement de deux imports identiques ; une factory injectable permet à l’adaptateur de contrôler l’identité.
- Le codec projet reste pur : les APIs `File`, téléchargement et UI appartiennent aux adaptateurs, pas à `projectCodec.ts`.
- Toute donnée lue depuis IndexedDB repasse par `parseDesignDocumentV1`; un enregistrement corrompu doit échouer explicitement, jamais être ignoré.
- Une ouverture IndexedDB rejetée est retirée du cache pour permettre un retry au prochain appel ; aucun retry automatique en boucle.
- Le registry de recettes reste une instance locale et stocke des loaders `import()` ; il ne doit importer directement ni JSCAD ni les générateurs lourds.
- Une promesse de recette rejetée ou un module lazy invalide est retiré du cache avec garde d’identité ; un nouvel appel peut retry sans boucle automatique.
- Les rôles d’artefact sont corrélés au kind : Cutter ne peut pas produire un rôle Stamp et inversement au niveau TypeScript.
- Les fixtures 0.2 sont l’oracle pré-adaptateur : les tests des recettes 2.2/2.3 doivent les rejouer via l’adaptateur et obtenir les mêmes métriques, hash orienté et codes d’erreur.
- Ownership d’une recette : avant retour réussi, elle possède l’`Object3D`; après retour, le caller le possède ; toute erreur ou annulation après génération impose un disposal unique avant propagation intacte de l’erreur.
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
- Analyse Cookiecad : `docs/product/COOKIECAD_V6_ANALYSIS.md`
- PRD personnel local-first : `docs/product/COOKIE_CUTTER_DESIGNER_PRD.md`
- Matrice d’écarts : `docs/product/FEATURE_GAP_MATRIX.md`
- Plan d’implémentation : `docs/product/CODEX_IMPLEMENTATION_PLAN.md`
