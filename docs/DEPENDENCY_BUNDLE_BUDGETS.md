# Dependency bundle budgets

## Scope

Svelte 5.57.2, svelte-check 4.7.6, Vite 7.3.7 and Three.js 0.186.1, consolidated from Dependabot #61/#56. No application or persistence logic changed. Limits remain 200 KiB per entry and 600 KiB per other JavaScript chunk.

The previous configuration grouped Three.js core and all examples (controls, loaders, exporters) into one chunk. Separate those addons from the core and cache the shared Svelte runtime independently. This reduces individual chunk sizes, not necessarily total startup transfer: synchronous dependencies remain synchronous and may be preloaded.

The budget plugin now runs in the post generateBundle phase and counts UTF-8 bytes, including Vite preload rewriting. Three regressions cover phase, exact boundaries and non-ASCII bytes. Final files were measured independently after build.

## Actual local evidence

- Before fix, combined dependency update failed: `three-vendor` 601.6 KiB >600 KiB. Existing #61 CI also showed entry 201.2 KiB >200 KiB.
- Frozen install successful; audit: no known vulnerabilities.
- `pnpm check`: 0 errors / 0 warnings.
- Full Vitest suite: 968 passing tests /64 files, single thread worker, no file parallelism.
- Production build successful, 677 modules; final entry 162738 bytes, Three.js core 561528 bytes, addons 53740 bytes, Svelte runtime 46981 bytes. Every final JS file below its applicable budget. Thresholds not raised.
- Chromium smoke against `vite preview` serving actual dist, disposable browser storage: PNG import, current geometry generation and STL download, local save/reload/reopen, 375px no horizontal overflow, zero page/console errors or failed requests.
- Smoke script outside repository: `/workspace/reports/dependency-bundle-smoke.mjs`. Initial harness attempts failed because export navigation/panel opening was missing; one diagnostic attempt timed out. These are not counted as successful validations. Final complete execution returned all assertions successful and closed browser/server.

## Limits and delivery

Not a device or physical printing certification; existing antialiased-circle geometry limitation unchanged. No UI redesign. Dependabot heads are replaced only after verified integration. Require actual Quality/CodeQL checks on PR head and post-merge runs on exact main SHA. Keep branch protections; no admin bypass, force-push or branch deletion. Rollback with dedicated revert PR.
