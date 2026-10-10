# Lot 1 — App integration handoff

Status: implementation completed locally in source commit `141b774` on `feature/local-project-workflow`; integrated compliance PASS and independent quality APPROVED, 830 tests, check/smoke/build and native Chromium journey passed. See `docs/LOCAL_PROJECT_WORKFLOW_VALIDATION.md` for provenance and limits. The boundary descriptions and line numbers below are historical planning observations, not the current implementation. No merge or production authorization; PR #57 remains draft and remote CI must be checked separately.

## Ownership

One integration owner must own `src/App.svelte`, `src/lib/components/viewer/ThreeViewer.svelte` when required, and new App/history-boundary tests. Do not simultaneously rewrite session integration, workflow, or project UI. Parent owns final review, exact-head validation, browser verification, commits and publication.

## Actual legacy boundaries to replace

- `App.svelte:123–171`: identity + `createGenerationDocument` rebuild source, name and viewport from legacy defaults. Remove this competing document reconstruction. Generation must use the exact active session snapshot.
- `App.svelte:246–268`: `scheduleGeneration`, `publishSvg`, and reactive scheduling currently operate from `svgCache`/`params`. Replace scheduling ownership with the reviewed session integration; retain only read-only projections needed by legacy panels.
- `App.svelte:270–300`: upload/vectorization currently mutates filename/source before success and guards only sourceRevision. Keep operation-local data and validate sourceRevision + session epoch before committing the new document. A stale upload cannot replace an opened project. Dirty replacement must use workflow guards.
- `App.svelte:316–338`: library shapes and test circle create a new identity; use `createDesignDocument` plus guarded `workflow.startNew(candidate)`. Cancel must preserve the previous project and preview.
- `App.svelte:345–397`: history currently captures legacy SVG/params. Undo/redo must update session sketch/parameters, preserve original source/id, and suppress reactive duplicate history pushes. Opening/replacing the project clears its history.
- `App.svelte:410–474`: cloud gallery and AI imports must use the same validated source transition. Batch mesh generation (`427–438`) is not representable by V1; explicitly block project save/export for this external state with an explanation rather than save an unrelated document.
- `App.svelte:477–502`: replace native destructive `window.confirm`/ad-hoc reset with the accessible project confirmation + workflow guard. New clears the session only after the guard succeeds.
- `App.svelte:504–521`: preserve existing generated/external Three.js disposal ownership. Cancel/resolve pending confirmation safely; invalidate source work, dispose integration, and dispose workflow/storage after accepted writes. Do not dispose generated objects a second time.
- `App.svelte:753–770`: mount ProjectManager and LocalProjectLibrary so projects can be reopened from an initially empty app, independently of whether a mesh has already generated.

## Viewer gap verified from code

`ThreeViewer.svelte` currently exports only `mesh` and `buildPlateSize` (lines 12–13). Grid/axes and wall-thickness state are local (`gridHelper`, `axesHelper`, `wallHeatmapEnabled`). Merely storing preferences in JSON is insufficient.

Expose an explicit typed viewport input and user-change event/callback; the session owns persistent preferences. Apply restored showGrid/showAxes/showWallThickness to actual scene visibility/heatmap. Projection must not emit user-change events or dirty the document. Keep runtime heatmap geometries/materials under viewer ownership and existing cleanup.

## Confirmation ownership

`ProjectConfirmDialog` is reviewed, committed as `b3ed161`, and verified in native Chromium. Mount one instance per request, focus starts at Cancel, resolve exactly once and unmount from the parent. The callback must not throw or leak a rejected promise. Resolve pending requests as cancel on App destruction. Bind requested operation to its session/lifetime; no stale answer can replace a newer project.

## Required behavioral RED tests before implementation

1. Restored B (custom parameters, original source distinct from edited sketch, nondefault viewport) reaches the real orchestrator as that exact session document, not reconstructed defaults.
2. Slow source A followed by opening B never republishes A.
3. Dirty New/open/import: cancel preserves everything; save failure blocks the switch; discard switches explicitly.
4. Opening B removes A history; undo cannot cross project identity/source boundaries. Undo/redo modifies the saved document state and dirty status.
5. Viewer preferences change actual scene/heatmap state and persist to the session; restoration alone does not mark it dirty.
6. Unsupported external batch output cannot silently save the previous unrelated project.
7. Confirmation and pending async work settling after unmount cause no effects or unhandled errors; accepted writes drain before storage closes.

Mount real App/stores/workflow/orchestrator. Stub only unavailable platform edges such as WebGL, not the ownership contract itself. Preserve existing App lazy-loading/generation tests and serialization validation.

## Final gate

Serial tests with isolated TMP, one worker, GOMAXPROCS=2 and UV_THREADPOOL_SIZE=2; check, smoke, build; compliance then quality review. Native Chromium UI: create/import → rename → change parameters/view → save → full reload → library reopen → compare document and preview → JSON round-trip → STL validation. Include Stamp/raster, invalid file, unavailable IndexedDB, cancellation, and stale callbacks. CI audit failure remains a separate blocker, never bypass it.
