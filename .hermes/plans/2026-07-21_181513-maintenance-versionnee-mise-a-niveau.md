# Maintenance versionnée et mise à niveau — Plan d’implémentation

> **Pour Hermes :** exécuter ce plan lot par lot. Chaque lot doit rester réversible, être validé avant le suivant et recevoir son propre commit local. Aucun push, PR ou merge sans GO explicite de Rza.

**Objectif :** rétablir une baseline TypeScript/Svelte propre, supprimer les vulnérabilités connues, aligner l’outillage local/CI et préparer les futures mises à niveau majeures sans mélanger corrections fonctionnelles et migrations.

**Architecture :** travailler sur `fix/quality-security-baseline` à partir de `main`, avec un commit par frontière technique. Traiter d’abord les erreurs de code sans changer les dépendances, puis les vulnérabilités compatibles dans la majeure courante, ensuite les avertissements et la CI. Reporter Vite 8, TypeScript 7 et les autres migrations majeures sur des branches séparées.

**Stack :** Svelte 5, TypeScript strict, Vite 7, Three.js, pnpm, GitHub Actions, GitHub Pages.

---

## 1. Baseline constatée le 21 juillet 2026

### Addendum d’exécution

La revue indépendante du lot 1 a montré que l’ancien `pathOperations.ts` utilisait des constructeurs natifs absents du wrapper public `js-angusj-clipper@1.3.1`, ainsi que des coordonnées `{ X, Y }` incompatibles avec ses types `{ x, y }`. L’exécution a donc remplacé cette couche par `offsetToPaths`, `clipToPaths` et `simplifyPolygon`, puis validé six opérations Clipper au runtime. Cette correction dépasse volontairement la tâche 1.5 initiale, qui ne corrigeait que l’argument de chargement.

### Git et runtime

- Dépôt : `/workspace/cookie-cutter-designer`
- Base : `fd865ea` sur `main`
- Branche locale créée : `fix/quality-security-baseline`
- Node exécuté localement : `v22.23.1`
- pnpm exécuté localement : `10.33.4`
- `AGENT_CONTEXT.md` est local et non suivi ; décider explicitement de le versionner dans le lot documentation.

### Qualité

- `pnpm install --frozen-lockfile` : réussi.
- `pnpm run build` : réussi.
- `pnpm run check` : échec avec **6 erreurs** et **18 avertissements** dans 12 fichiers.
- Aucun script de test automatisé n’est déclaré dans `package.json`.
- Le bundle JavaScript principal est proche de 795 kB avant gzip.

### Sécurité des dépendances

`pnpm audit --json` signale :

- critique : 0 ;
- haute : 5 ;
- modérée : 12 ;
- faible : 0.

Familles concernées :

| Famille | Version actuelle | Correction minimale connue | Exposition principale |
|---|---:|---:|---|
| `vite` | 7.2.2 | 7.3.5+ | serveur de développement, lecture de fichiers/chemins Windows |
| `rollup` via Vite | 4.53.2 | 4.59.0+ | écriture arbitraire pendant un build avec entrée/plugin malveillant |
| `postcss` via Vite | 8.5.6 | 8.5.10+ | chaîne de build CSS |
| `svelte` | 5.43.6 | 5.55.7+ | plusieurs XSS/SSR ; application actuellement construite en SPA |
| `makerjs` | 0.18.1 | 0.19.2+ | pollution d’objet ; aucune importation trouvée dans `src/` |
| `picomatch` via `svelte-check` | 4.0.3 | 4.0.4+ | glob de développement, intégrité/ReDoS |

Le risque Vite est prioritaire même si le serveur n’est pas exposé par défaut : plusieurs avis concernent la lecture de fichiers locaux et la machine du développeur.

---

## 2. Politique de versionnement

### Lots et commits

1. `fix: restore TypeScript and Svelte checks`
2. `fix(security): update vulnerable dependencies`
3. `fix(a11y): resolve Svelte accessibility warnings`
4. `ci: align Node pnpm and quality gates`
5. `docs: record maintenance baseline and upgrade policy`

Chaque commit doit :

- modifier une seule frontière technique ;
- passer ses validations ciblées ;
- être annulable avec `git revert <commit>` ;
- ne contenir ni `dist/`, ni `node_modules/`, ni secret, ni fichier `.env`.

### Branches futures séparées

Ne pas inclure dans cette branche :

- Vite 8 ;
- `@sveltejs/vite-plugin-svelte` 7 ;
- TypeScript 7 ;
- Node 26 / `@types/node` 26 ;
- Three.js 0.185 ;
- refonte du code splitting ;
- migration générale vers les nouveaux event handlers Svelte.

Branches proposées après stabilisation :

```text
upgrade/vite-8
upgrade/typescript-7
upgrade/three-0.185
perf/code-splitting
```

---

## 3. Lot 1 — Rétablir le contrôle TypeScript/Svelte

**Objectif :** obtenir zéro erreur avec les versions actuellement verrouillées, avant toute mise à jour de dépendance.

### Tâche 1.1 — Corriger l’index courant de l’historique

**Fichier :** `src/lib/components/ui/HistoryPanel.svelte`

**Cause :** `$historyStore` contient `HistoryState[]`; `currentIndex` est un store séparé exposé par `historyStore.currentIndex`.

**Modification :**

```ts
const currentIndex = historyStore.currentIndex;
```

Puis remplacer :

```svelte
$historyStore.currentIndex
```

par :

```svelte
$currentIndex
```

**Validation ciblée :**

```sh
pnpm exec svelte-check --tsconfig ./tsconfig.app.json
```

Attendu : les deux erreurs `HistoryPanel.svelte` disparaissent.

### Tâche 1.2 — Respecter le type binaire de `STLExporter`

**Fichier :** `src/lib/utils/stlExporter.ts`

**Cause :** l’export binaire retourne `DataView<ArrayBuffer>`, pas `ArrayBuffer`.

**Modification :** appeler `exporter.parse` dans chaque branche avec un booléen littéral afin que TypeScript sélectionne la bonne surcharge :

```ts
const blob = options.binary
  ? new Blob([exporter.parse(object, { binary: true })], {
      type: 'application/octet-stream'
    })
  : new Blob([exporter.parse(object, { binary: false })], {
      type: 'text/plain'
    });
```

**Validation ciblée :** l’erreur `stlExporter.ts:18` disparaît et un export STL binaire reste téléchargeable lors du smoke test.

### Tâche 1.3 — Importer explicitement le type Three.js

**Fichier :** `src/lib/components/ui/BatchMode.svelte`

**Modification :**

```ts
import type { Group } from 'three';
```

Puis :

```ts
batchCreated: Group;
```

**Validation ciblée :** l’erreur `Cannot find namespace 'THREE'` disparaît.

### Tâche 1.4 — Supprimer la comparaison de types impossible

**Fichier :** `src/lib/utils/collisionDetector.ts`

**Cause :** après `child instanceof THREE.Mesh`, `child` ne peut pas être le `THREE.Group` racine.

**Modification :**

```ts
if (child instanceof THREE.Mesh) {
  objects.push(child);
}
```

**Validation ciblée :** l’erreur de comparaison `Mesh`/`Group` disparaît.

### Tâche 1.5 — Fournir le format de chargement Clipper

**Fichier :** `src/lib/utils/pathOperations.ts`

**Modification :**

```ts
import {
  loadNativeClipperLibInstanceAsync,
  NativeClipperLibRequestedFormat
} from 'js-angusj-clipper';
```

Puis :

```ts
clipperLib = await loadNativeClipperLibInstanceAsync(
  NativeClipperLibRequestedFormat.WasmWithAsmJsFallback
);
```

**Pourquoi :** le fallback conserve WebAssembly comme chemin rapide, tout en gardant une solution de repli compatible navigateur.

### Tâche 1.6 — Fermer le lot

```sh
pnpm run check
pnpm run build
git diff --check
git status --short
```

Attendu : zéro erreur ; les avertissements restent autorisés jusqu’au lot 3.

Commit local :

```sh
git add src/lib/components/ui/HistoryPanel.svelte \
  src/lib/components/ui/BatchMode.svelte \
  src/lib/utils/stlExporter.ts \
  src/lib/utils/collisionDetector.ts \
  src/lib/utils/pathOperations.ts
git commit -m "fix: restore TypeScript and Svelte checks"
```

---

## 4. Lot 2 — Corriger les vulnérabilités sans migration majeure

**Objectif :** obtenir `pnpm audit` à zéro dans les majeures actuelles.

### Tâche 2.1 — Vérifier les versions compatibles publiées

Avant modification, consulter les métadonnées npm et les peer dependencies :

```sh
pnpm view vite@7 version
pnpm view vite@7.3.5 dependencies peerDependencies engines
pnpm view svelte@5 version
pnpm view svelte-check@4 version dependencies peerDependencies
pnpm view @sveltejs/vite-plugin-svelte@6 version peerDependencies
pnpm view makerjs@0.19.2 version
```

Ne pas utiliser `latest` sans borne de majeure.

### Tâche 2.2 — Retirer Maker.js s’il est réellement inutilisé

**Fichiers :** `package.json`, `pnpm-lock.yaml`, `CLAUDE.md`

La recherche actuelle ne trouve `makerjs` que dans le manifeste, le lockfile et la documentation.

Confirmer :

```sh
rg -n --glob '!node_modules/**' --glob '!pnpm-lock.yaml' 'makerjs|Maker\.js' .
```

Si aucune consommation applicative n’existe :

```sh
pnpm remove makerjs
```

Puis retirer Maker.js de la liste d’architecture dans `CLAUDE.md`.

Si une consommation indirecte est découverte pendant l’exécution :

```sh
pnpm update makerjs@^0.19.2
```

### Tâche 2.3 — Mettre à jour Svelte dans la majeure 5

Cible minimale : `5.55.7`; préférer la dernière `5.x` compatible publiée au moment de l’exécution.

```sh
pnpm update svelte@^5.55.7
```

Relancer immédiatement :

```sh
pnpm run check
pnpm run build
```

### Tâche 2.4 — Mettre à jour Vite et ses transitives vulnérables

Cible minimale : Vite `7.3.5`.

```sh
pnpm update vite@^7.3.5
pnpm update --depth Infinity rollup postcss
```

Vérifier les versions résolues :

```sh
pnpm why vite
pnpm why rollup
pnpm why postcss
```

Attendu : Vite `>=7.3.5`, Rollup `>=4.59.0`, PostCSS `>=8.5.10`.

### Tâche 2.5 — Mettre à jour `svelte-check` et Picomatch

```sh
pnpm update svelte-check@^4.7.3
pnpm update --depth Infinity picomatch
pnpm why picomatch
```

Attendu : Picomatch `>=4.0.4` sur le chemin de `svelte-check`.

Mettre `@sveltejs/vite-plugin-svelte` à la dernière `6.x` uniquement si les peer dependencies l’exigent ou si une correction compatible est disponible. Ne pas passer à `7.x` dans ce lot.

### Tâche 2.6 — Mesurer et fermer le lot

```sh
pnpm install --frozen-lockfile
pnpm audit --json
pnpm run check
pnpm run build
git diff -- package.json pnpm-lock.yaml CLAUDE.md
git diff --check
```

Critères :

- audit : 0 critique, 0 haute, 0 modérée, 0 faible ;
- installation frozen réussie ;
- zéro erreur TypeScript/Svelte ;
- build réussi ;
- aucune nouvelle source de paquet ou override non justifié.

Commit local :

```sh
git add package.json pnpm-lock.yaml CLAUDE.md
git commit -m "fix(security): update vulnerable dependencies"
```

---

## 5. Lot 3 — Traiter les 18 avertissements Svelte/accessibilité

**Objectif :** obtenir une sortie `pnpm run check` sans diagnostic, sans désactiver globalement les règles.

### Fichiers ciblés

- `src/lib/components/ui/ParameterPanel.svelte`
- `src/lib/components/ui/SlicePreview.svelte`
- `src/lib/components/ui/PatternGenerator.svelte`
- `src/lib/components/ui/CloudGallery.svelte`
- `src/lib/components/ui/AIImageProcessor.svelte`
- `src/lib/components/ui/LayerManager.svelte`
- `src/lib/components/ui/TextEmbosser.svelte`

### Corrections attendues

1. Associer chaque `<label>` à un contrôle via `for`/`id`, ou remplacer le faux label par un texte non sémantique.
2. Ajouter `appearance` avant `-webkit-appearance`.
3. Remplacer les `<div on:click>` interactifs par des `<button type="button">` lorsque possible.
4. Si un conteneur doit rester un `<div>`, ajouter comportement clavier, rôle cohérent et `tabindex`.
5. Fermer explicitement le `<canvas></canvas>`.
6. Ajouter `line-clamp` avec le fallback `-webkit-line-clamp`.
7. Ajouter la gestion clavier manquante sur les éléments `role="button"` de `LayerManager.svelte`.

### Validation

```sh
pnpm run check
pnpm run build
git diff --check
```

Attendu : 0 erreur, 0 avertissement.

Smoke tests manuels :

- navigation clavier dans la galerie ;
- ouverture/fermeture de la modale avec clavier et souris ;
- sélection d’un calque avec Entrée/Espace ;
- canvas de prévisualisation toujours rendu.

Commit local :

```sh
git add src/lib/components/ui
git commit -m "fix(a11y): resolve Svelte accessibility warnings"
```

---

## 6. Lot 4 — Aligner runtime, CI et portes qualité

**Objectif :** rendre les validations reproductibles localement et sur GitHub Actions.

### Tâche 4.1 — Déclarer l’outillage

**Fichiers :** `package.json`, `.nvmrc`

Ajouter après vérification des engines officielles de Vite 7 :

```json
{
  "packageManager": "pnpm@10.33.4",
  "engines": {
    "node": ">=22.12.0"
  }
}
```

Créer `.nvmrc` :

```text
22
```

Pourquoi Node 22 : le développement local utilise déjà Node 22 et la branche est en maintenance active. Éviter une CI Node 20 différente du runtime réellement validé.

### Tâche 4.2 — Moderniser le workflow Pages

**Fichier :** `.github/workflows/deploy.yml`

- passer `actions/checkout` à la majeure stable validée ;
- passer `actions/setup-node` à la majeure stable validée ;
- utiliser Node 22 ;
- passer `pnpm/action-setup` à la majeure stable validée ;
- utiliser pnpm 10 ;
- remplacer `pnpm install` par `pnpm install --frozen-lockfile` ;
- exécuter `pnpm run check` avant `pnpm run build` ;
- mettre à jour les actions Pages dans des commits séparés si leur majeure change.

Ne pas recopier aveuglément les PR Dependabot distantes : vérifier les changelogs officiels et les entrées/sorties de chaque action.

### Tâche 4.3 — Ajouter une porte d’audit CI

Créer un workflow dédié, par exemple `.github/workflows/quality.yml`, déclenché sur pull request et push vers `main` :

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm audit --audit-level=moderate
- run: pnpm run check
- run: pnpm run build
```

Garder le déploiement séparé : une CI de qualité doit échouer avant toute publication.

### Tâche 4.4 — Ajuster Dependabot

**Fichier :** `.github/dependabot.yml`

- grouper les patchs/mineures Svelte/Vite compatibles ;
- exclure les mises à jour majeures automatiques de version ;
- conserver les alertes de sécurité ;
- documenter que les migrations majeures sont traitées manuellement ;
- limiter le bruit des PR automatiques.

Attention : ignorer les `version-update:semver-major` ne bloque pas nécessairement les Security Updates majeures. Le réglage distant GitHub doit être vérifié séparément après intégration, avec GO utilisateur.

### Validation

```sh
pnpm install --frozen-lockfile
pnpm audit --audit-level=moderate
pnpm run check
pnpm run build
git diff --check
```

Commit local :

```sh
git add package.json .nvmrc .github
git commit -m "ci: align Node pnpm and quality gates"
```

---

## 7. Lot 5 — Documentation et baseline durable

**Fichiers :**

- `AGENT_CONTEXT.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- éventuellement `docs/MAINTENANCE.md`

### Contenu

- versions Node/pnpm attendues ;
- commandes `install`, `audit`, `check`, `build` ;
- politique de mises à jour : patch/mineure regroupées, majeure isolée ;
- dernier résultat d’audit sans figer des numéros qui deviendront obsolètes ;
- procédure de rollback par commit ;
- surfaces sensibles : rendu HTML avec `{@html}`, fichiers utilisateur SVG/raster, génération Gemini côté client, serveur Vite non exposé au réseau.

Décider avant le commit si `AGENT_CONTEXT.md` doit devenir un fichier collaboratif versionné. S’il reste spécifique à Hermes, ne pas l’ajouter au commit et l’ignorer explicitement seulement après accord utilisateur.

Commit local :

```sh
git add CONTRIBUTING.md SECURITY.md docs/MAINTENANCE.md
git commit -m "docs: record maintenance baseline and upgrade policy"
```

---

## 8. Revue finale avant proposition de push

### Commandes obligatoires

```sh
pnpm install --frozen-lockfile
pnpm audit --json
pnpm run check
pnpm run build
git diff --check
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

### Revue sécurité

- rechercher les secrets et fichiers `.env` sans afficher leur contenu ;
- vérifier les usages de `{@html}` et confirmer que les SVG non fiables sont assainis ou clairement bornés ;
- vérifier qu’aucun serveur Vite n’est lancé avec `--host 0.0.0.0` par défaut ;
- inspecter les changements du lockfile : packages attendus, intégrités présentes, absence de source inattendue ;
- demander une revue indépendante en lecture seule du diff complet.

### Critères de sortie

- audit à zéro au seuil modéré ;
- `pnpm run check` sans erreur ni avertissement ;
- build réussi ;
- smoke tests principaux réussis ;
- cinq commits locaux maximum, chacun réversible ;
- aucune migration majeure mélangée ;
- aucun push sans GO explicite.

---

## 9. Programme de mises à niveau futures

### Vite 8 + plugin Svelte 7

Branche : `upgrade/vite-8`

- lire les guides de migration officiels ;
- vérifier les engines Node ;
- mettre à jour Vite et le plugin ensemble ;
- comparer les sorties `dist/` et tester GitHub Pages avec `base: '/cookie-cutter-designer/'` ;
- conserver un commit dédié à la configuration.

### TypeScript 7

Branche : `upgrade/typescript-7`

- attendre la compatibilité déclarée de Svelte, `svelte-check` et Vite ;
- lancer le contrôle strict avant/après ;
- corriger les changements de typage sans ajouter de `any` ;
- ne pas mélanger cette migration avec Three.js.

### Three.js 0.185

Branche : `upgrade/three-0.185`

- mettre à jour `three` et `@types/three` ensemble ;
- valider `STLExporter`, `SVGLoader`, OrbitControls et la libération des meshes ;
- comparer visuellement un cutter simple et un modèle complexe ;
- exporter puis ouvrir au moins un STL dans un slicer.

### Performance du bundle

Branche : `perf/code-splitting`

- mesurer avec un analyseur de bundle avant toute refonte ;
- charger dynamiquement les fonctions lourdes : Three.js, traitement IA, galeries avancées ;
- définir un budget mesurable plutôt qu’un objectif vague ;
- vérifier qu’aucun chunk différé ne casse le déploiement GitHub Pages.

---

## 10. Ordre d’exécution recommandé

```text
Lot 1 qualité bloquante
  → Lot 2 sécurité compatible
    → Lot 3 accessibilité
      → Lot 4 runtime et CI
        → Lot 5 documentation
          → revue indépendante
            → GO utilisateur pour push/PR
```

Chaque lot peut être interrompu après son commit local sans perdre la capacité de rollback.
