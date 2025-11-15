# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cookie Cutter Designer is a web application for designing custom 3D-printable cookie cutters and stamps from vector (SVG) or raster (PNG/JPG) images. The app provides real-time 3D preview, extensive customization options, and exports to STL format.

## Development Commands

### Package Manager
This project uses **pnpm** (not npm or yarn).

### Common Commands
```bash
# Install dependencies
pnpm install

# Start development server (http://localhost:5173/)
pnpm run dev

# Build for production
pnpm run build

# Preview production build
pnpm run preview

# Type checking
pnpm run check
```

## Tech Stack

- **Framework**: Svelte 5 (with runes and modern reactive syntax)
- **Language**: TypeScript (strict mode)
- **Build Tool**: Vite 7
- **3D Rendering**: Three.js (0.181.x)
- **Vector Operations**: js-angusj-clipper (Clipper.js WebAssembly)
- **Image Vectorization**: imagetracer
- **Geometric Operations**: @jscad/modeling, makerjs, paper, tess2

## Architecture

### State Management

The app uses Svelte stores for centralized state management:

- **cookieCutterStore.ts**: Main store containing:
  - `params`: Cookie cutter parameters (reactive)
  - `uploadedFile`: Current uploaded file
  - `pathData`: Extracted SVG path data
  - `model`: Generated 3D model
  - `isProcessing`: Loading state
  - `error`: Error messages
  - `printability`: Derived store for real-time validation

- **historyStore.ts**: Undo/redo functionality for path editing

### Core Pipeline

The app follows this data flow:

1. **File Upload** → `FileUpload.svelte`
   - Accepts SVG, PNG, JPG (max 10MB)
   - Validates file type and size

2. **Image Processing** → `imageProcessor.ts` + `imageProcessor.worker.ts`
   - Raster images vectorized using Web Workers (non-blocking)
   - SVG files extracted directly

3. **Path Operations** → `pathOperations.ts`
   - Uses Clipper.js for precise offset/boolean operations
   - Creates inner/outer walls with exact thickness
   - Supports union, difference, intersection

4. **3D Generation** → `cookieCutterGenerator.ts`
   - Converts 2D paths to 3D meshes using Three.js
   - Applies extrusion, taper, handles, embossing
   - Two modes: 'cutter' or 'stamp'

5. **Rendering** → `ThreeViewer.svelte`
   - Real-time WebGL preview with OrbitControls
   - Auto-centering and camera positioning
   - Grid and lighting

6. **Export** → `stlExporter.ts`
   - Exports to binary STL format
   - Includes optional metadata

### Advanced Features

#### Multi-Layer Support
- **Layer Types**: Cutter, Stamp, Emboss (see `Layer.ts`)
- **LayerManager.svelte**: UI for managing multiple layers
- **multiLayerGenerator.ts**: Combines layers into single or separate STL files
- Each layer has independent depth, visibility, and SVG data

#### Boolean Operations
- **BooleanOperations.svelte**: UI for union/subtract/intersect
- **booleanOperations.ts**: Implements operations using Clipper.js
- Upload secondary shapes and combine with main design

#### Text Embossing
- **TextEmbosser.svelte**: Add custom text to designs
- 9 fonts available (Arial, Impact, Times New Roman, etc.)
- Configurable size (6-30mm), depth (0.5-5mm)
- Mirror option for stamps

#### Project Management
- **Project.ts**: Type definitions for .ccd.json format
- **projectManager.ts**: Import/export logic with localStorage
- **ProjectManager.svelte** + **DesignGallery.svelte**: UI for saving/loading designs
- Projects include metadata, thumbnails, and version info

#### Path Editing
- **PathEditor.svelte**: Interactive canvas for editing vector paths
- **bezierEditor.ts**: Utilities for Bezier curve manipulation
- Three modes: Select, Add, Delete points

#### Web Workers
- **workerManager.ts**: Manages worker lifecycle
- **imageProcessor.worker.ts**: Offloads image vectorization to prevent UI blocking
- Handles errors and cleanup automatically

## Key Design Patterns

### Svelte 5 Runes
The codebase uses Svelte 5's runes syntax:
- `$state()` for component-level reactive state
- `$derived()` for computed values
- `$effect()` for side effects
- Stores still use `writable()` and `derived()` from svelte/store

### TypeScript Interfaces
All parameters and data structures are strongly typed:
- `CookieCutterParams`: All customization options
- `Point2D`, `Path2D`: 2D geometry primitives
- `Layer`, `Project`: Multi-layer and project types
- Always reference these types when modifying features

### Path Precision
- **Critical**: Use Clipper.js (`pathOperations.ts`) for any path offsetting or boolean operations
- Native JavaScript operations lack precision for manufacturing tolerances
- Clipper.js uses integer scaling internally for exact arithmetic

### 3D Model Updates
When modifying parameters:
1. Update the store with `updateParam(key, value)`
2. Store reactivity triggers regeneration in `ThreeViewer.svelte`
3. New mesh replaces old mesh in the Three.js scene
4. No manual `requestAnimationFrame` needed

## File Organization

```
src/lib/
├── components/
│   ├── ui/              # All UI components (23 files)
│   │   ├── FileUpload.svelte
│   │   ├── ParameterPanel.svelte
│   │   ├── BooleanOperations.svelte
│   │   ├── TextEmbosser.svelte
│   │   ├── LayerManager.svelte
│   │   ├── PathEditor.svelte
│   │   ├── ProjectManager.svelte
│   │   ├── DesignGallery.svelte
│   │   └── ... (pattern generators, material managers, etc.)
│   └── viewer/
│       └── ThreeViewer.svelte
├── stores/              # Svelte stores
│   ├── cookieCutterStore.ts
│   └── historyStore.ts
├── types/               # TypeScript type definitions
│   ├── CookieCutter.ts
│   ├── Layer.ts
│   └── Project.ts
└── utils/               # Business logic (28 files)
    ├── cookieCutterGenerator.ts  # Core 3D generation
    ├── pathOperations.ts         # Clipper.js operations
    ├── imageProcessor.ts         # Image vectorization
    ├── stlExporter.ts           # STL export
    ├── multiLayerGenerator.ts   # Multi-layer STL
    └── ... (specialized utilities)
```

## Important Constraints

### 3D Printing Requirements
The app enforces printability through validation (`checkPrintability` in cookieCutterStore.ts):
- Wall thickness: 0.8-2.0mm (1.0mm recommended)
- Cutting height: 8-25mm (10-15mm ideal)
- Taper angle: 0-15° (5-10° recommended)
- Print orientation: upside down (cutting edge up)

When adding new parameters, ensure they respect these physical constraints.

### Performance Considerations
- Use Web Workers for CPU-intensive operations (>100ms)
- Clipper.js operations scale with path complexity - consider simplification for very detailed paths
- Three.js meshes should be disposed when replaced to prevent memory leaks
- LocalStorage has ~5-10MB limit - compress thumbnails if needed

### SVG Handling
- SVGs are parsed using Three.js SVGLoader (not browser native parsing)
- Complex paths with many points should be simplified using `pathOperations.ts`
- Text in SVG must be converted to paths before processing

## Testing Recommendations

When making changes:
1. Test with simple shapes (test-star.svg in public/)
2. Test with complex SVGs (many paths, curves)
3. Test with large raster images (>5MB)
4. Verify STL exports in slicer software (PrusaSlicer, Cura)
5. Check printability warnings update correctly
6. Test project save/load with localStorage

## Code Style

- Use TypeScript strict mode - no `any` types unless interfacing with untyped libraries
- Prefer async/await over promises
- Component files should handle UI only - delegate logic to utils/
- Extract magic numbers to constants or parameters
- Add JSDoc comments to exported functions
