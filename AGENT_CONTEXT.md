# AGENT_CONTEXT — cookie-cutter-designer

## Repo

- GitHub : `razorglyon/cookie-cutter-designer`
- Clone persistant : `/workspace/cookie-cutter-designer`
- Branche par défaut : `main`
- Branche courante : `fix/ux-ui-consistency`
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

- Branche : `fix/ux-ui-consistency`, basée sur `perf/split-heavy-bundles`.
- Dernière action : consolidation UX/UI du shell, des thèmes, de Shape Library, Parameters, History, du viewer et de Gemini.
- Tests : `149/149` réussis, dont trois tests UX sur thème, Shape Library et sécurité perçue de Gemini.
- Typecheck : `0 erreur, 0 avertissement`.
- Build : réussi ; les budgets Vite restent respectés.
- Smoke visuel : build de production validé en clair et sombre, Shape Library → Circle → Parameters/viewer, Advanced et Gemini.
- Accessibilité : navigation nommée avec `aria-current`, contrôles clavier, accordéons et états dynamiques explicites.
- Sécurité : aucune clé Gemini trouvée dans les fichiers suivis ou modifiés ; la clé n'est jamais réaffichée après sauvegarde.
- État Git : diff local vérifié, sans commit et sans push.
- À faire ensuite : revue pré-commit par Rza, puis commit local sur demande explicite.

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
- `src/styles/theme.css` est l'unique fondation globale ; ne pas réintroduire `src/app.css`.
- Les couleurs fonctionnelles utilisent des tokens sémantiques (`--surface-*`, `--text-*`, `--border-*`) plutôt que l'inversion des gris numériques.
- Le fond Three.js lit `--viewer-scene` et se met à jour lorsque le thème change.
- Shape Library est un panneau direct et émet `{ svg, name }` ; ne pas réintroduire de modale intermédiaire.
- Les panneaux chargés dynamiquement doivent exposer chargement, erreur et relance.
- La clé Gemini reste locale au navigateur jusqu'à suppression ; les écrans doivent expliquer les données envoyées sans afficher la clé sauvegardée.

## Documentation

- Architecture : `CLAUDE.md`
- Maintenance : `docs/MAINTENANCE.md`
- Sécurité : `SECURITY.md`
- Plan maintenance : `.hermes/plans/2026-07-21_181513-maintenance-versionnee-mise-a-niveau.md`
- Plan UX/UI : `.hermes/plans/2026-07-22_081456-ux-ui-consistency.md`
