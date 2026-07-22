# Maintenance Guide

## Supported toolchain

- Node.js: `>=22.12.0` (`.nvmrc` selects Node 22)
- pnpm: `10.33.4` (`package.json#packageManager`)
- Package lock: `pnpm-lock.yaml`

Install reproducibly:

```sh
pnpm install --frozen-lockfile
```

## Required quality gates

Run these commands before proposing a pull request:

```sh
pnpm audit --audit-level=moderate
pnpm run check
pnpm run build
git diff --check
```

Expected result:

- no known vulnerability at moderate severity or above;
- zero TypeScript/Svelte error;
- zero Svelte warning;
- successful production build;
- no whitespace error.

The repository does not yet have an automated unit-test suite. Until one is added, manually smoke-test uploads, parameter changes, 3D rendering, project save/load, and STL export.

## Dependency policy

- Apply compatible patch/minor updates in small, reversible batches.
- Keep each dependency family in one commit.
- Review `package.json` and `pnpm-lock.yaml` together.
- Reject unexpected tarball, Git, or HTTP package sources.
- Validate with a frozen install after every lockfile change.
- Handle major upgrades on dedicated branches.

Current planned major-upgrade branches:

```text
upgrade/vite-8
upgrade/typescript-7
upgrade/three-0.185
perf/code-splitting
```

Dependabot groups compatible patch/minor updates. Major version updates are ignored by the version-update configuration and must be reviewed manually. GitHub Security Updates are controlled separately in repository settings.

## Security-sensitive surfaces

### User-provided files

SVG, PNG, and JPG files are processed in the browser. Treat parsed SVG markup and generated `{@html}` content as untrusted. Avoid adding new raw HTML sinks without sanitization and a focused review.

### Gemini API

Gemini features make optional requests directly from the browser. Client-side API keys cannot be treated as secrets. Use restricted keys, quotas, and API allowlists; never commit a key or `.env` file.

### Vite development server

Do not expose the Vite development server to an untrusted network. Prefer the default loopback binding. If remote testing is required, use a controlled tunnel or firewall rule and remove it after testing.

### Geometry and exports

Use Clipper.js for precision-sensitive offsets and boolean operations. Smoke-test binary STL export after Three.js or exporter changes.

## CI

- `.github/workflows/quality.yml`: frozen install, dependency audit, Svelte/TypeScript checks, production build.
- `.github/workflows/deploy.yml`: repeats check/build before publishing GitHub Pages.
- `.github/workflows/codeql.yml`: CodeQL analysis on pushes, pull requests, and weekly schedule.

## Rollback

Maintenance commits are separated by technical boundary. Revert the affected commit rather than rewriting branch history:

```sh
git revert <commit>
```

Never force-push a rollback without explicit maintainer approval.
