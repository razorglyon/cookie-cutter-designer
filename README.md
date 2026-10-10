# Cookie Cutter Designer

[![Deploy to GitHub Pages](https://github.com/razorglyon/cookie-cutter-designer/actions/workflows/deploy.yml/badge.svg)](https://github.com/razorglyon/cookie-cutter-designer/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Made with Svelte](https://img.shields.io/badge/Made%20with-Svelte-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A browser application that turns SVG, PNG, and JPG artwork into dimensioned cookie cutters and connected stamps for 3D printing.

**[Live demo](https://razorglyon.github.io/cookie-cutter-designer/)**

## What is print-ready here?

The production pipeline does more than display a plausible Three.js preview:

- dimensions are expressed and measured in millimetres;
- cutter walls and handles are generated as closed geometry;
- Stamp relief, base, and handle are united into one connected solid;
- final triangle buffers are checked for finite coordinates, degenerate triangles, open or non-manifold edges, connected components, adjacent-face orientation, and signed volume;
- exports are blocked when these checks fail;
- manufacturing exports are transformed from Three.js Y-up to slicer-friendly Z-up and placed on `Z = 0`.

The validator does **not** claim complete triangle-versus-triangle self-intersection detection. Always inspect the exported model in your slicer before printing.

## Inputs

| Format | Processing |
|---|---|
| SVG | Parsed as vector contours |
| PNG | Decoded through Canvas, then vectorized in a Web Worker |
| JPG/JPEG | Decoded through Canvas, then vectorized in a Web Worker |

Upload limits:

- maximum file size: 10 MB;
- maximum raster side: 8192 px;
- maximum raster area: 16 megapixels.

Two explicit raster vectorization presets are available in Upload and Advanced Creation: **Dessin contrasté** (historical default) and **Photo — lissage expérimental** (blur radius 2, path omission 16). Selection alone never edits the current design. Revectorize explicitly uses the original raster still held in this session and edits only the sketch; source and identity stay unchanged. Undo restores replaced corrections. V1 does not save raster pixels: after reopening, reimport the original image. Photo may remove wanted small holes/details and does not guarantee improved photographic quality. Measurements and limits: `docs/TRACING_PRESETS_VALIDATION.md`.

Raster decoding remains a browser/Canvas operation. The expensive ImageTracer vectorization receives a transferable pixel buffer in a Worker. Requests use IDs, support concurrent processing and cancellation, reject stale responses, and return structured errors.

## Design modes

### Cutter

- physical target dimension: width, height, or longest side;
- default target: 75 mm;
- configurable wall thickness, cutting height, total height, taper, and handle;
- final measured `width × depth × height` shown in the viewer.

### Stamp

- relief, mandatory common base, and optional handle form one boolean-unioned JSCAD solid;
- disconnected artwork islands remain connected through the base;
- SVG holes are retained;
- the result must pass the same printable-geometry validator as a cutter.

## Exports

| Format | Guarantee |
|---|---|
| Binary STL | Triangle count and exact payload size checked; finite Z-up coordinates |
| OBJ | Validated model exported in Z-up manufacturing coordinates |
| 3MF | Real ZIP/OPC package with millimetre units, relationships, model resources, and build items |

A 3MF package contains at least:

```text
[Content_Types].xml
_rels/.rels
3D/3dmodel.model
```

STL does not store a unit declaration. This application generates STL coordinates using millimetres; choose millimetres when importing if a slicer asks.

### G-code

Cookie Cutter Designer does not generate G-code. G-code depends on the printer, nozzle, material, temperatures, speeds, and firmware. Export STL or 3MF, then slice it with OrcaSlicer, PrusaSlicer, Bambu Studio, Cura, or another established slicer.

## Layer Intersection Preview

The layer panel intersects the actual model triangles with horizontal planes and displays closed X/Z contours at the selected height.

It is a geometric inspection tool, **not a slicer**. It does not compute perimeters, infill, supports, extrusion, travel moves, or print time.

## Atomic batch generation

Batch mode:

- generates and measures each item before publishing a result;
- lays out the measured footprints on the requested build plate;
- reports the item that failed and why;
- supports cancellation and progress;
- disposes every partial model if generation or layout fails;
- never returns a silently incomplete batch.

## Getting started

### Prerequisites

- Node.js 22.12 or newer;
- pnpm 10.

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

The development server normally opens at `http://localhost:5173/`.

### Private mobile preview with Tailscale

The repository includes a foreground launcher for a tailnet-only preview:

```bash
./scripts/start-private-preview.sh
```

It starts Tailscale in userspace mode when necessary, launches the production preview on loopback, and publishes it through `tailscale serve`. Authentication state stays outside the repository under `/root/.tailscale`; no token or credential is written to Git.

The URL is reachable only from devices connected to the same Tailscale network. Keep the launcher process running while the preview is needed; stopping it disables the HTTPS proxy and the local preview.

### Production validation

```bash
pnpm run check
pnpm run test:run -- --maxWorkers=1
pnpm run build
pnpm audit --audit-level=moderate
```

Focused export smoke test:

```bash
pnpm run test:smoke
unzip -t /tmp/cookie-cutter-export-smoke/cookie-cutter.3mf
unzip -Z1 /tmp/cookie-cutter-export-smoke/cookie-cutter.3mf
```

Pipeline benchmark:

```bash
pnpm run benchmark
```

The benchmark writes `/tmp/cookie-cutter-pipeline-benchmark.json`. Its timings are local regression signals, not printer-time estimates.

## Usage

1. Upload SVG, PNG, or JPG artwork, or select a library shape.
2. Choose Cutter or Stamp.
3. Set the final dimension in millimetres and select width, height, or longest side.
4. Inspect the measured dimensions and printability result.
5. Optionally inspect real layer intersections.
6. Export binary STL, OBJ, or 3MF.
7. Open the export in a slicer, confirm millimetre dimensions and orientation, choose a printer profile, then generate G-code there.

## Testing corpus

Regression fixtures cover:

- rectangles, circles, concavities, holes, and multiple contours;
- disconnected Stamp relief islands;
- open, degenerate, and self-intersecting paths;
- sub-resolution details that alter offset topology;
- extreme aspect ratios;
- deterministic noisy raster data;
- non-finite parameters, floating components, reversed triangles, and Float32-degenerate geometry.

Unsupported or unsafe artwork is rejected rather than silently repaired into an unverified model.

## Current practical limits

- no complete triangle-triangle self-intersection test;
- no interactive SVG node editor;
- very small details may disappear or change topology during wall offsets and are rejected;
- layer preview is not a slicing engine;
- G-code must be generated externally;
- automatic tests validate the files structurally, but a final manual import in the target slicer remains recommended.

## Technology

- Svelte 5 and strict TypeScript;
- Vite 7;
- Three.js;
- js-angusj-clipper for polygon offsets;
- JSCAD for Stamp boolean solids;
- ImageTracer in a Web Worker;
- fflate for 3MF ZIP/OPC packaging;
- Vitest and happy-dom.

Heavy optional features are dynamically imported. Vite enforces a 200 KiB entry-chunk budget and a 600 KiB asynchronous-chunk budget.

## Optional Gemini features

Gemini-powered image generation and suggestions require the user's own API key. The current integration calls Gemini from the browser. For a public production service, use a backend proxy and restrict the key at the provider.

See [Gemini setup](GEMINI_API_SETUP.md) and [technical documentation](GEMINI_API_TECHNICAL.md).

Never commit API keys or environment secrets.

## License

MIT. See the repository license for details.
