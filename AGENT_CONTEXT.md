# AGENT_CONTEXT

## Projet

Cookie Cutter Designer, application web de création de découpoirs et tampons 3D à partir de SVG, PNG ou JPG.

## Chemin et Git

- Clone persistant : `/workspace/cookie-cutter-designer`
- Remote : `https://github.com/razorglyon/cookie-cutter-designer.git`
- Branche de maintenance : `fix/quality-security-baseline`
- Ne jamais pousser sans GO explicite de Rza.

## Stack

- Svelte 5
- TypeScript strict
- Vite 7
- Three.js
- pnpm 10.33.4
- Node.js 22.12+

## Commandes utiles

```sh
pnpm install --frozen-lockfile
pnpm audit --audit-level=moderate
pnpm run check
pnpm run build
pnpm run dev
```

## État validé

- Les 6 erreurs TypeScript initiales sont corrigées.
- Les 18 avertissements Svelte/accessibilité initiaux sont corrigés.
- L’audit pnpm est revenu de 5 vulnérabilités hautes et 12 modérées à zéro.
- Maker.js a été retiré car aucune consommation n’existait dans `src/`.
- Svelte, Vite, le plugin Svelte et `svelte-check` ont été mis à jour dans leurs majeures actuelles.
- `pnpm run check` passe avec 0 erreur et 0 avertissement.
- `pnpm run build` passe ; le bundle principal reste supérieur à 500 kB et mérite un chantier séparé.
- Un smoke test Vite réel retourne HTTP 200 et trouve le point de montage `#app`.
- Un smoke test runtime Clipper valide offset positif/négatif, union, différence, intersection, simplification et création de parois.
- Les workflows Quality, Pages et CodeQL sont alignés avec Node 22 et pnpm 10.

## Architecture sensible

- Utiliser Clipper.js pour les offsets et opérations booléennes.
- Libérer les meshes Three.js remplacés.
- Examiner tout nouvel usage de `{@html}` avec des données SVG non fiables.
- Les fonctions Gemini utilisent une clé côté client : elle doit être restreinte et ne jamais être commitée.

## Documentation

- Architecture : `CLAUDE.md`
- Maintenance : `docs/MAINTENANCE.md`
- Sécurité : `SECURITY.md`
- Plan exécuté : `.hermes/plans/2026-07-21_181513-maintenance-versionnee-mise-a-niveau.md`

## Prochaines étapes

1. Effectuer la revue finale du diff contre `origin/main`.
2. Corriger tout constat important de la revue.
3. Présenter commits, validations et risques à Rza.
4. Attendre un GO explicite avant tout push ou PR.
