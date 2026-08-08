# AGENT_CONTEXT — cookie-cutter-designer

## Repo

- GitHub : `razorglyon/cookie-cutter-designer`
- Clone : `/workspace/cookie-cutter-designer`
- Branche par défaut : `main`
- Branche courante : `feature/design-domain-foundation`
- Push interdit sans GO explicite.

## Stack

- TypeScript strict, Svelte 5, Vite 7 et Three.js
- Géométrie : js-angusj-clipper et JSCAD
- Raster : ImageTracer dans un Web Worker
- Package manager : pnpm 10.33.4
- Runtime : Node.js 22.12+

## Commandes

```sh
REPO_TMP=$(python3 /workspace/.hermes-tools/workspace-tmp.py --repo "$PWD" --purpose commands --path-only) || exit 1
test -n "$REPO_TMP" || exit 1
```

| Action | Commande |
|---|---|
| Install | `TMPDIR="$REPO_TMP" pnpm install --frozen-lockfile` |
| Dev | `TMPDIR="$REPO_TMP" pnpm run dev` |
| Preview privé | `TMPDIR="$REPO_TMP" ./scripts/start-private-preview.sh` |
| Tests | `TMPDIR="$REPO_TMP" pnpm exec vitest run --maxWorkers=1` |
| Smoke exports | `TMPDIR="$REPO_TMP" pnpm run test:smoke` |
| Benchmark | `TMPDIR="$REPO_TMP" pnpm run benchmark` |
| Build | `TMPDIR="$REPO_TMP" pnpm run build` |
| Typecheck | `TMPDIR="$REPO_TMP" pnpm run check` |
| Audit dépendances | `TMPDIR="$REPO_TMP" pnpm audit --audit-level=moderate` |

## Ressources

- Toutes les commandes lourdes utilisent le TMP isolé retourné par le helper.
- Garder Vitest à un worker dans ce sandbox.
- Avant Chromium, nettoyer uniquement les previews stale autorisées ; la limite est de 256 PID.

## Structure

- `src/lib/domain/` — document V1, paramètres, validation stricte et migrations
- `src/lib/projects/` — codec portable et persistance IndexedDB
- `src/lib/generation/` — recettes lazy et orchestrateur annulable
- `src/lib/utils/` — géométrie, validation et exports
- `src/lib/components/parameters/` — sections accessibles du panneau
- `src/lib/components/viewer/` — rendu Three.js
- `src/workers/` — vectorisation raster hors thread UI
- `docs/AGENT_DECISIONS.md` — décisions techniques durables

## État actuel

- Dernier commit : `a8da1be split parameter panel into accessible sections`.
- `ParameterPanel` orchestre six composants dédiés et conserve temporairement le store legacy comme bridge.
- Le domaine V1, le codec projet, IndexedDB, le registry lazy, les recettes Cutter/Stamp, l'orchestrateur et le store document sont en place.
- Dernière baseline documentée : 425 tests réussis, typecheck sans erreur, smoke exports et build réussis. Cette baseline doit être rejouée avant le prochain commit fonctionnel.
- Limite connue : le parcours Chromium complet n'a pas été certifié sous saturation PID ; ne pas modifier le registry sans reproduction propre.
- Suite prévue : tâche 3.3 `DesignKindPicker`, après plan validé.

## Décisions / pièges connus

Voir `docs/AGENT_DECISIONS.md`. Points critiques : ownership/disposal Three.js, schéma V1 versionné, lazy loading JSCAD, validation SVG fail-closed et séparation scène Y-up / fabrication Z-up.

## Documentation

- `README.md` — usage et garanties produit
- `docs/MAINTENANCE.md` — maintenance courante
- `SECURITY.md` — politique de sécurité
- `docs/product/` — benchmark, PRD, matrice d'écarts et plan d'implémentation
- `.hermes/plans/` — plans de travail détaillés
