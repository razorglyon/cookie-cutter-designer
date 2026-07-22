# AGENT_CONTEXT — cookie-cutter-designer

## Repo

- GitHub : `razorglyon/cookie-cutter-designer`
- Clone persistant : `/workspace/cookie-cutter-designer`
- Branche par défaut : `main`
- Branche courante : `perf/split-heavy-bundles`
- Push interdit sans GO explicite de Rza.

## Stack

- Langages : TypeScript, Svelte
- Frameworks : Svelte 5, Vite 7, Three.js
- Package manager : pnpm 10.33.4
- Runtime : Node.js 22.12+
- TypeScript : strict

## Commandes

| Action | Commande |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Dev | `pnpm run dev` |
| Test | `pnpm run test:run` |
| Build | `pnpm run build` |
| Typecheck | `pnpm run check` |
| Audit | `pnpm audit --audit-level=moderate` |

## Architecture sensible

- `src/lib/utils/contourExtraction.ts` normalise les contours SVG.
- `src/lib/utils/cutterGeometry.ts` construit les coques du découpoir.
- `src/lib/utils/geometryValidation.ts` vérifie les invariants imprimables en espace monde.
- `src/lib/utils/stlExporter.ts` sépare validation, sérialisation et téléchargement STL.
- `src/App.svelte` possède les objets Three.js générés et arbitre les révisions asynchrones.
- `ThreeViewer.svelte` affiche les objets sans détruire les ressources appartenant au parent.
- Utiliser Clipper.js pour les offsets et opérations booléennes.
- Examiner tout nouvel usage de `{@html}` avec des SVG non fiables.
- Les fonctions Gemini utilisent une clé côté client : ne jamais la committer et la restreindre côté fournisseur.

## État actuel

- Branche : `perf/split-heavy-bundles`
- Branche parente publiée : `fix/robust-cutter-generation` à `ffbe4e2`.
- Dernière action : chargement différé des panneaux optionnels et isolation de Three.js dans un chunk fournisseur stable.
- Tests : `146/146` réussis, dont un smoke test DOM des panneaux chargés dynamiquement.
- Typecheck : `0 erreur, 0 avertissement`.
- Build : réussi sans avertissement ; budgets intégrés de 200 KiB pour l'entrée et 600 KiB pour les chunks asynchrones.
- Bundle : entrée `827,48 → 135,81 kB` ; chargement initial JS `-12,6 %`, gzip `-13,7 %`, CSS `-64,4 %`.
- Audit : aucune vulnérabilité connue.
- Smoke HTTP : index `200` et `36/36` assets servis.
- État Git : optimisation prête pour un commit local séparé ; aucun push de cette branche.
- À faire ensuite : commit local, puis demander un nouveau GO avant tout push.

## Décisions / pièges connus

- Une seule génération debouncée doit traiter upload, bibliothèque, historique et changements de paramètres.
- Les lectures/vectorisations de source et les générations 3D utilisent des révisions séparées.
- Tout résultat 3D obsolète est détruit immédiatement.
- Le parent publie un nouveau modèle, attend `tick()`, puis détruit l’ancien.
- Le viewer détache uniquement la prop affichée ; il ne détruit jamais les meshes du parent.
- La sélection du viewer utilise un `BoxHelper` local pour ne pas remplacer les matériaux du modèle.
- L’embossage autonome est refusé explicitement ; le mode Stamp est l’alternative prise en charge.
- L’export STL refuse les objets vides, non finis, dégénérés ou ouverts.
- Les panneaux optionnels doivent rester chargés par `import()` uniquement à l'ouverture de leur catégorie.
- Three.js reste préchargé car le cœur de l'application en dépend ; il est isolé pour améliorer le cache navigateur.
- Le runtime Clipper/WASM reste asynchrone et séparé du chargement initial.
- Le plugin Vite `bundle-budget` bloque toute régression dépassant les budgets documentés.

## Documentation

- Architecture : `CLAUDE.md`
- Maintenance : `docs/MAINTENANCE.md`
- Sécurité : `SECURITY.md`
- Plan exécuté : `.hermes/plans/2026-07-21_181513-maintenance-versionnee-mise-a-niveau.md`
