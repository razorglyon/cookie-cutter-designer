<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import FileUpload from './lib/components/ui/FileUpload.svelte';
  import ParameterPanel from './lib/components/ui/ParameterPanel.svelte';
  import ThreeViewer from './lib/components/viewer/ThreeViewer.svelte';
  import ShapeLibrary from './lib/components/ui/ShapeLibrary.svelte';
  import HistoryPanel from './lib/components/ui/HistoryPanel.svelte';

  import {
    uploadedFile,
    model,
    isProcessing,
    error,
    params,
    setParams,
    updateParams,
    publishGenerationState
  } from './lib/stores/cookieCutterStore';
  import { historyStore } from './lib/stores/historyStore';
  import {
    vectorizeImage,
    readFileAsText,
    cleanSVG,
    terminateImageProcessor
  } from './lib/utils/imageProcessor';
  import { exportToSTL, estimateSTLSize, formatFileSize } from './lib/utils/stlExporter';
  import { applyMaterialToMesh, type MaterialPreset } from './lib/utils/materialManager';
  import type { SavedDesign } from './lib/utils/cloudGallery';
  import { disposeObject3D } from './lib/utils/disposeThree';
  import { createGenerationOrchestrator } from './lib/generation/generationOrchestrator';
  import { RecipeRegistry } from './lib/generation/recipeRegistry';
  import {
    isGenerationPending,
    type GenerationResult,
    type GenerationState,
    type ImplementedDesignDocument
  } from './lib/generation/generationState';
  import type { CookieCutterParams } from './lib/types/CookieCutter';
  import type { Mesh, Group } from 'three';
  import * as THREE from 'three';

  type ModelObject = Mesh | Group;
  type ModelDimensions = Readonly<{ width: number; depth: number; height: number }>;
  type Category =
    | 'upload'
    | 'params'
    | 'shapes'
    | 'advanced'
    | 'ai'
    | 'gallery'
    | 'materials'
    | 'preview'
    | 'batch'
    | 'export';

  let currentMesh: ModelObject | null = null;
  let fileName = '';
  let svgCache: string | null = null;
  let svgRevision = 0;
  let sourceRevision = 0;
  let isRestoringHistory = false;
  let activeCategory: Category = 'upload';
  let darkMode = false;
  let vectorizationController: AbortController | null = null;
  const THEME_STORAGE_KEY = 'cookie-cutter-theme';
  let localDesignCounter = 0;
  let designIdentity = createDesignIdentity();
  let publishedGenerationResult: GenerationResult | null = null;
  const pendingExternalDisposals = new Set<ModelObject>();
  const disposedExternalObjects = new WeakSet<THREE.Object3D>();

  const recipeRegistry = new RecipeRegistry();
  recipeRegistry.register('cutter', async () =>
    (await import('./lib/generation/recipes/cutterRecipe')).cutterRecipe
  );
  recipeRegistry.register('stamp', async () =>
    (await import('./lib/generation/recipes/stampRecipe')).stampRecipe
  );

  const generationOrchestrator = createGenerationOrchestrator({
    registry: recipeRegistry,
    debounceMs: 300,
    onStateChange: handleGenerationStateChange,
    afterResultChange: completeGenerationPublication
  });
  publishGenerationState(generationOrchestrator.getState());

  function applyTheme(nextDarkMode: boolean): void {
    darkMode = nextDarkMode;
    document.documentElement.classList.toggle('dark-mode', darkMode);
  }

  function measureModel(object: THREE.Object3D): ModelDimensions {
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    return { width: size.x, depth: size.z, height: size.y };
  }

  function toggleDarkMode() {
    applyTheme(!darkMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Theme persistence is optional when storage is unavailable.
    }
  }

  onMount(() => {
    let prefersDark = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches;

    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'dark' || savedTheme === 'light') {
        prefersDark = savedTheme === 'dark';
      }
    } catch {
      // Fall back to the operating-system preference.
    }

    applyTheme(prefersDark);
  });

  function createDesignIdentity(): Readonly<{ id: string; createdAt: string }> {
    localDesignCounter += 1;
    const createdAt = new Date().toISOString();
    const id = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `local-design-${createdAt}-${localDesignCounter}`;
    return Object.freeze({ id, createdAt });
  }

  function createGenerationDocument(
    svgSnapshot: string,
    paramsSnapshot: Readonly<CookieCutterParams>
  ): ImplementedDesignDocument {
    const updatedAt = new Date().toISOString();
    const sourceFileName = fileName || 'untitled.svg';
    const name = sourceFileName.replace(/\.[^/.]+$/, '') || 'Untitled design';
    const common = {
      schemaVersion: 1 as const,
      id: designIdentity.id,
      name,
      source: {
        type: 'svg' as const,
        fileName: sourceFileName,
        svg: svgSnapshot
      },
      sketch: {
        svg: svgSnapshot,
        revision: svgRevision
      },
      viewport: {
        showGrid: true,
        showAxes: false,
        showWallThickness: false
      },
      createdAt: designIdentity.createdAt,
      updatedAt
    };

    return paramsSnapshot.mode === 'stamp'
      ? {
          ...common,
          kind: 'stamp',
          parameters: { ...paramsSnapshot, mode: 'stamp' }
        }
      : {
          ...common,
          kind: 'cutter',
          parameters: { ...paramsSnapshot, mode: 'cutter' }
        };
  }

  function isModelObject(object: THREE.Object3D): object is ModelObject {
    return object instanceof THREE.Mesh || object instanceof THREE.Group;
  }

  function disposeExternalObject(object: ModelObject): void {
    if (disposedExternalObjects.has(object)) return;
    disposedExternalObjects.add(object);
    disposeObject3D(object);
  }

  function handleGenerationStateChange(state: GenerationState): void {
    publishGenerationState(state);
    $isProcessing = isGenerationPending(state);
    $error = state.error?.message ?? null;

    if (state.result === publishedGenerationResult) return;

    const previousMesh = currentMesh;
    const previousGeneratedObject = publishedGenerationResult?.artifacts[0].object ?? null;
    const nextObject = state.result?.artifacts[0].object ?? null;
    const nextMesh = nextObject !== null && isModelObject(nextObject) ? nextObject : null;

    publishedGenerationResult = state.result;
    currentMesh = nextMesh;
    $model = nextMesh && state.result
      ? {
          mesh: nextMesh,
          paths: [],
          params: { ...state.result.document.parameters }
        }
      : null;

    if (nextObject !== null && nextMesh === null) {
      $error = 'Le résultat généré ne peut pas être affiché dans le viewer.';
    }

    if (
      previousMesh
      && previousMesh !== previousGeneratedObject
      && previousMesh !== nextMesh
    ) {
      pendingExternalDisposals.add(previousMesh);
    }
  }

  async function completeGenerationPublication(): Promise<void> {
    const externalObjects = [...pendingExternalDisposals];
    pendingExternalDisposals.clear();
    await tick();
    for (const object of externalObjects) disposeExternalObject(object);
  }

  function cancelPendingGeneration(): void {
    generationOrchestrator.cancel();
  }

  async function replaceCurrentMesh(
    next: ModelObject,
    generationParams: Readonly<CookieCutterParams>
  ): Promise<void> {
    const previous = currentMesh;
    currentMesh = next;
    $model = {
      mesh: next,
      paths: [],
      params: { ...generationParams }
    };

    await tick();
    if (previous && previous !== next) disposeExternalObject(previous);
  }

  function scheduleGeneration(
    svgSnapshot: string,
    paramsSnapshot: Readonly<CookieCutterParams>
  ): void {
    generationOrchestrator.schedule(
      createGenerationDocument(svgSnapshot, paramsSnapshot)
    );
  }

  function publishSvg(svg: string, nextFileName: string): void {
    cancelPendingGeneration();
    designIdentity = createDesignIdentity();
    fileName = nextFileName;
    svgRevision += 1;
    svgCache = svg;
    $error = null;
    $isProcessing = true;
    activeCategory = 'params';
  }

  $: if (svgCache && svgRevision > 0) {
    scheduleGeneration(svgCache, { ...$params });
  }

  async function handleFileUpload(event: CustomEvent<File>) {
    const file = event.detail;
    const revision = ++sourceRevision;
    vectorizationController?.abort();
    const controller = new AbortController();
    vectorizationController = controller;
    cancelPendingGeneration();
    $uploadedFile = file;
    fileName = file.name;
    $error = null;
    $isProcessing = true;
    let published = false;

    try {
      const svgString = file.type === 'image/svg+xml' || file.name.endsWith('.svg')
        ? cleanSVG(await readFileAsText(file))
        : await vectorizeImage(file, controller.signal);

      if (revision !== sourceRevision) return;
      publishSvg(svgString, file.name);
      published = true;
    } catch (processingError) {
      if (revision !== sourceRevision) return;
      console.error('Error processing file:', processingError);
      $error = processingError instanceof Error
        ? processingError.message
        : 'Failed to process file';
    } finally {
      if (vectorizationController === controller) vectorizationController = null;
      if (revision === sourceRevision && !published) $isProcessing = false;
    }
  }

  function handleExport() {
    if (!currentMesh) return;

    try {
      const filename = `${fileName.replace(/\.[^/.]+$/, '') || 'cookie-cutter'}.stl`;
      exportToSTL(currentMesh, filename, { binary: true });
      $error = null;
    } catch (exportError) {
      console.error('Error exporting STL:', exportError);
      $error = exportError instanceof Error ? exportError.message : 'Failed to export STL';
    }
  }

  function handleShapeSelect(shape: string | { svg: string; name: string }): void {
    const svg = typeof shape === 'string' ? shape : shape.svg;
    const fileBaseName = typeof shape === 'string'
      ? 'generated-shape'
      : shape.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    sourceRevision += 1;
    try {
      publishSvg(cleanSVG(svg), `${fileBaseName || 'library-shape'}.svg`);
    } catch (shapeError) {
      $error = shapeError instanceof Error ? shapeError.message : 'Failed to process shape';
      $isProcessing = false;
    }
  }

  function loadTestModel() {
    const circleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="20" fill="black"/>
    </svg>`;

    sourceRevision += 1;
    publishSvg(circleSvg, 'test-circle.svg');
  }

  $: estimatedSize = currentMesh
    ? formatFileSize(estimateSTLSize(currentMesh, true))
    : null;
  $: modelDimensions = currentMesh ? measureModel(currentMesh) : null;

  $: if (!isRestoringHistory && svgCache && $params) {
    historyStore.pushState({
      params: { ...$params },
      svgData: svgCache,
      description: 'Changed parameters'
    });
  }

  async function handleUndo() {
    const state = historyStore.undo();
    if (!state) return;

    isRestoringHistory = true;
    try {
      setParams(state.params);
      if (state.svgData && state.svgData !== svgCache) {
        sourceRevision += 1;
        svgRevision += 1;
        svgCache = state.svgData;
      }
      await tick();
    } catch (historyError) {
      console.error('Error restoring undo state:', historyError);
      $error = historyError instanceof Error
        ? historyError.message
        : 'Failed to restore undo state';
    } finally {
      isRestoringHistory = false;
    }
  }

  async function handleRedo() {
    const state = historyStore.redo();
    if (!state) return;

    isRestoringHistory = true;
    try {
      setParams(state.params);
      if (state.svgData && state.svgData !== svgCache) {
        sourceRevision += 1;
        svgRevision += 1;
        svgCache = state.svgData;
      }
      await tick();
    } catch (historyError) {
      console.error('Error restoring redo state:', historyError);
      $error = historyError instanceof Error
        ? historyError.message
        : 'Failed to restore redo state';
    } finally {
      isRestoringHistory = false;
    }
  }

  function handleMaterialChange(
    event: CustomEvent<{ meshName: string; material: MaterialPreset }>
  ) {
    if (!currentMesh) return;

    const { material } = event.detail;
    currentMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) applyMaterialToMesh(child, material);
    });
  }

  function handleLoadFromGallery(event: CustomEvent<SavedDesign>) {
    try {
      const design = event.detail;
      const nextSvg = cleanSVG(design.svgData);

      setParams(design.params);
      sourceRevision += 1;
      publishSvg(nextSvg, `${design.metadata.name}.svg`);
    } catch (galleryError) {
      console.error('Error loading design:', galleryError);
      $error = galleryError instanceof Error
        ? galleryError.message
        : 'Failed to load design';
      $isProcessing = false;
    }
  }

  async function handleBatchCreated(event: CustomEvent<THREE.Group>) {
    const batch = event.detail;
    const revision = ++sourceRevision;
    await generationOrchestrator.clear();
    if (revision !== sourceRevision) {
      disposeExternalObject(batch);
      return;
    }
    await replaceCurrentMesh(batch, $params);
    fileName = 'batch-production.stl';
    $isProcessing = false;
  }

  function handleDeleteObject(event: CustomEvent<THREE.Object3D>): void {
    const object = event.detail;
    if (!currentMesh || !object.parent) return;

    let belongsToCurrentModel = false;
    currentMesh.traverse((child) => {
      if (child === object) belongsToCurrentModel = true;
    });

    if (belongsToCurrentModel) disposeObject3D(object);
  }

  async function handleAIProcessedImage(event: CustomEvent<Blob>) {
    const revision = ++sourceRevision;
    const file = new File([event.detail], 'ai-processed.png', { type: 'image/png' });
    cancelPendingGeneration();
    $uploadedFile = file;
    $error = null;
    $isProcessing = true;
    let published = false;

    try {
      const svgString = await vectorizeImage(file);
      if (revision !== sourceRevision) return;
      publishSvg(svgString, file.name);
      published = true;
    } catch (processingError) {
      if (revision !== sourceRevision) return;
      console.error('Error processing AI image:', processingError);
      $error = processingError instanceof Error
        ? processingError.message
        : 'Failed to process AI image';
    } finally {
      if (revision === sourceRevision && !published) $isProcessing = false;
    }
  }

  async function startNewDesign(): Promise<void> {
    sourceRevision += 1;
    vectorizationController?.abort();
    const generatedObject = publishedGenerationResult?.artifacts[0].object ?? null;
    const externalObject = currentMesh && currentMesh !== generatedObject ? currentMesh : null;

    await generationOrchestrator.clear();
    currentMesh = null;
    $model = null;
    svgCache = null;
    svgRevision = 0;
    $uploadedFile = null;
    $isProcessing = false;
    $error = null;
    activeCategory = 'upload';
    designIdentity = createDesignIdentity();

    await tick();
    if (externalObject) disposeExternalObject(externalObject);
  }

  function requestNewDesign(): void {
    if (window.confirm('Start a new design? Unsaved changes will be lost.')) {
      void startNewDesign();
    }
  }

  onDestroy(() => {
    sourceRevision += 1;
    vectorizationController?.abort();
    terminateImageProcessor();
    const generatedObject = publishedGenerationResult?.artifacts[0].object ?? null;
    const externalObjects = new Set<ModelObject>(pendingExternalDisposals);
    if (currentMesh && currentMesh !== generatedObject) externalObjects.add(currentMesh);
    pendingExternalDisposals.clear();
    currentMesh = null;
    $model = null;
    $isProcessing = false;
    const generationDisposal = generationOrchestrator.dispose();
    void (async () => {
      await tick();
      for (const object of externalObjects) disposeExternalObject(object);
      await generationDisposal;
    })();
  });
</script>

<main>
  <!-- Modern Header with Gradient -->
  <header class="modern-header">
    <div class="header-content">
      <div class="logo-section">
        <span class="logo-icon">🍪</span>
        <div class="logo-text">
          <h1>Cookie Cutter Designer</h1>
          <p class="tagline">Professional 3D-Printable Cookie Cutter Creation</p>
        </div>
      </div>
      <div class="header-actions">
        {#if $model}
          <span class="current-file">{fileName}</span>
          <button
            class="btn btn-outline btn-sm"
            on:click={requestNewDesign}
            title="Start a new design"
            aria-label="Start a new design"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12h18M12 3v18"/>
            </svg>
            <span class="new-design-label">New Design</span>
          </button>
        {/if}
        <button
          class="btn btn-outline btn-sm btn-icon"
          on:click={toggleDarkMode}
          title={darkMode ? 'Use light mode' : 'Use dark mode'}
          aria-label={darkMode ? 'Use light mode' : 'Use dark mode'}
          aria-pressed={darkMode}
        >
          {#if darkMode}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          {/if}
        </button>
      </div>
    </div>
  </header>

  <div class="app-layout">
    <!-- Mini Sidebar with Category Icons -->
    <aside class="mini-sidebar">
      <nav class="category-nav" aria-label="Design tools">
        <button
          class="category-btn"
          class:active={activeCategory === 'upload'}
          on:click={() => activeCategory = 'upload'}
          title="Upload"
          aria-label="Upload design"
          aria-current={activeCategory === 'upload' ? 'page' : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span class="nav-label" aria-hidden="true">Upload</span>
        </button>

        {#if $model}
          <button
            class="category-btn"
            class:active={activeCategory === 'params'}
            on:click={() => activeCategory = 'params'}
            title="Parameters"
            aria-label="Parameters"
            aria-current={activeCategory === 'params' ? 'page' : undefined}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v6m0 6v6"/>
            </svg>
            <span class="nav-label" aria-hidden="true">Parameters</span>
          </button>
        {/if}

        <button
          class="category-btn"
          class:active={activeCategory === 'shapes'}
          on:click={() => activeCategory = 'shapes'}
          title="Shape Library"
          aria-label="Shape Library"
          aria-current={activeCategory === 'shapes' ? 'page' : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span class="nav-label" aria-hidden="true">Shape Library</span>
        </button>

        <button
          class="category-btn"
          class:active={activeCategory === 'advanced'}
          on:click={() => activeCategory = 'advanced'}
          title="Advanced Creation"
          aria-label="Advanced Creation"
          aria-current={activeCategory === 'advanced' ? 'page' : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v20M2 12h20"/>
          </svg>
          <span class="nav-label" aria-hidden="true">Advanced Creation</span>
        </button>

        <button
          class="category-btn ai-btn"
          class:active={activeCategory === 'ai'}
          on:click={() => activeCategory = 'ai'}
          title="AI Tools (Gemini)"
          aria-label="AI Tools (Gemini)"
          aria-current={activeCategory === 'ai' ? 'page' : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
            <circle cx="9" cy="16" r="1"/>
            <circle cx="15" cy="16" r="1"/>
          </svg>
          <span class="nav-label" aria-hidden="true">AI Tools</span>
        </button>

        <button
          class="category-btn"
          class:active={activeCategory === 'gallery'}
          on:click={() => activeCategory = 'gallery'}
          title="Cloud Gallery"
          aria-label="Cloud Gallery"
          aria-current={activeCategory === 'gallery' ? 'page' : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="nav-label" aria-hidden="true">Cloud Gallery</span>
        </button>

        {#if $model}
          <button
            class="category-btn"
            class:active={activeCategory === 'materials'}
            on:click={() => activeCategory = 'materials'}
            title="Materials"
            aria-label="Materials and optimization"
            aria-current={activeCategory === 'materials' ? 'page' : undefined}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            <span class="nav-label" aria-hidden="true">Materials</span>
          </button>

          <button
            class="category-btn"
            class:active={activeCategory === 'preview'}
            on:click={() => activeCategory = 'preview'}
            title="Preview"
            aria-label="Print preview"
            aria-current={activeCategory === 'preview' ? 'page' : undefined}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span class="nav-label" aria-hidden="true">Preview</span>
          </button>

          <button
            class="category-btn"
            class:active={activeCategory === 'batch'}
            on:click={() => activeCategory = 'batch'}
            title="Batch"
            aria-label="Batch production"
            aria-current={activeCategory === 'batch' ? 'page' : undefined}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 16h6v6M8 8H2V2"/>
            </svg>
            <span class="nav-label" aria-hidden="true">Batch</span>
          </button>

          <button
            class="category-btn"
            class:active={activeCategory === 'export'}
            on:click={() => activeCategory = 'export'}
            title="Export"
            aria-label="Export design"
            aria-current={activeCategory === 'export' ? 'page' : undefined}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span class="nav-label" aria-hidden="true">Export</span>
          </button>
        {/if}
      </nav>
    </aside>

    <!-- Content Panel -->
    <div class="content-panel">
      {#if $error}
        <div class="alert alert-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>
            <strong>Error</strong>
            <p>{$error}</p>
          </div>
        </div>
      {/if}

      <div class="panel-content">
        {#if activeCategory === 'upload'}
          <FileUpload on:upload={handleFileUpload} />
          {#if !$model}
            <div class="quick-start">
              <button class="btn-quick" on:click={loadTestModel}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                </svg>
                Try Test Circle
              </button>
            </div>
          {/if}

        {:else if activeCategory === 'params' && $model}
          <HistoryPanel on:undo={handleUndo} on:redo={handleRedo} />
          <ParameterPanel />

        {:else if activeCategory === 'shapes'}
          <ShapeLibrary on:selectShape={(e) => handleShapeSelect(e.detail)} />

        {:else if activeCategory === 'advanced'}
          <header class="feature-header">
            <h2>Advanced Creation</h2>
            <p>Create or combine shapes before applying them to the 3D model.</p>
          </header>
          {#await import('./lib/components/ui/AIImageProcessor.svelte')}
            <div class="panel-loading" role="status">Loading image processor…</div>
          {:then component}
            <component.default on:processedImage={handleAIProcessedImage} />
          {:catch}
            <div class="panel-load-error" role="alert">The image processor could not be loaded.</div>
          {/await}
          {#await import('./lib/components/ui/BezierEditor.svelte')}
            <div class="panel-loading" role="status">Loading Bézier editor…</div>
          {:then component}
            <component.default on:pathCreated={(e) => handleShapeSelect(e.detail)} />
          {:catch}
            <div class="panel-load-error" role="alert">The Bézier editor could not be loaded.</div>
          {/await}
          {#await import('./lib/components/ui/PatternGenerator.svelte')}
            <div class="panel-loading" role="status">Loading pattern generator…</div>
          {:then component}
            <component.default on:patternCreated={(e) => handleShapeSelect(e.detail)} />
          {:catch}
            <div class="panel-load-error" role="alert">The pattern generator could not be loaded.</div>
          {/await}
          {#await import('./lib/components/ui/BooleanOperations.svelte')}
            <div class="panel-loading" role="status">Loading boolean operations…</div>
          {:then component}
            <component.default on:shapeCreated={(e) => handleShapeSelect(e.detail)} />
          {:catch}
            <div class="panel-load-error" role="alert">Boolean operations could not be loaded.</div>
          {/await}

        {:else if activeCategory === 'ai'}
          <header class="feature-header">
            <h2>AI Tools</h2>
            <p>Connect Gemini, then use AI assistance on the current design.</p>
          </header>
          {#await import('./lib/components/ui/GeminiAPIConfig.svelte')}
            <div class="panel-loading" role="status">Loading Gemini configuration…</div>
          {:then component}
            <component.default />
          {:catch}
            <div class="panel-load-error" role="alert">Gemini configuration could not be loaded.</div>
          {/await}
          {#await import('./lib/components/ui/AIAssistant.svelte')}
            <div class="panel-loading" role="status">Loading AI assistant…</div>
          {:then component}
            <component.default
              params={$params}
              svgContent={svgCache}
              on:optimizedSVG={(e) => handleShapeSelect(e.detail)}
            />
          {:catch}
            <div class="panel-load-error" role="alert">The AI assistant could not be loaded.</div>
          {/await}

        {:else if activeCategory === 'gallery'}
          {#await import('./lib/components/ui/CloudGallery.svelte')}
            <div class="panel-loading" role="status">Loading cloud gallery…</div>
          {:then component}
            <component.default
              currentSvg={svgCache}
              currentParams={$params}
              on:loadDesign={handleLoadFromGallery}
            />
          {:catch}
            <div class="panel-load-error" role="alert">The cloud gallery could not be loaded.</div>
          {/await}

        {:else if activeCategory === 'materials' && $model}
          {#await import('./lib/components/ui/MaterialManager.svelte')}
            <div class="panel-loading" role="status">Loading materials…</div>
          {:then component}
            <component.default on:materialChanged={handleMaterialChange} />
          {:catch}
            <div class="panel-load-error" role="alert">Materials could not be loaded.</div>
          {/await}
          {#await import('./lib/components/ui/OptimizationPanel.svelte')}
            <div class="panel-loading" role="status">Loading optimization tools…</div>
          {:then component}
            <component.default on:applyFix={(e) => updateParams(e.detail)} />
          {:catch}
            <div class="panel-load-error" role="alert">Optimization tools could not be loaded.</div>
          {/await}
          {#await import('./lib/components/ui/CollisionDetector.svelte')}
            <div class="panel-loading" role="status">Loading collision detector…</div>
          {:then component}
            <component.default mesh={currentMesh} buildPlateSize={$params.buildPlateSize} />
          {:catch}
            <div class="panel-load-error" role="alert">The collision detector could not be loaded.</div>
          {/await}

        {:else if activeCategory === 'preview' && $model}
          {#await import('./lib/components/ui/SlicePreview.svelte')}
            <div class="panel-loading" role="status">Loading slice preview…</div>
          {:then component}
            <component.default mesh={currentMesh} layerHeight={0.2} />
          {:catch}
            <div class="panel-load-error" role="alert">The slice preview could not be loaded.</div>
          {/await}
          {#await import('./lib/components/ui/PrintabilityInfo.svelte')}
            <div class="panel-loading" role="status">Loading printability details…</div>
          {:then component}
            <component.default />
          {:catch}
            <div class="panel-load-error" role="alert">Printability details could not be loaded.</div>
          {/await}

        {:else if activeCategory === 'batch' && $model}
          {#await import('./lib/components/ui/BatchMode.svelte')}
            <div class="panel-loading" role="status">Loading batch mode…</div>
          {:then component}
            <component.default
              currentSvg={svgCache}
              currentParams={$params}
              buildPlateSize={$params.buildPlateSize}
              on:batchCreated={handleBatchCreated}
            />
          {:catch}
            <div class="panel-load-error" role="alert">Batch mode could not be loaded.</div>
          {/await}

        {:else if activeCategory === 'export' && $model}
          {#await import('./lib/components/ui/AdvancedExport.svelte')}
            <div class="panel-loading" role="status">Loading export tools…</div>
          {:then component}
            <component.default mesh={currentMesh} filename={fileName} params={$params} />
          {:catch}
            <div class="panel-load-error" role="alert">Export tools could not be loaded.</div>
          {/await}
        {/if}
      </div>
    </div>

    <!-- 3D Viewer Panel -->
    <div class="viewer-panel">
      {#if $isProcessing}
        <div class="loading-state">
          <div class="modern-spinner"></div>
          <p class="loading-text">Processing your design...</p>
        </div>
      {:else if currentMesh}
        <ThreeViewer
          mesh={currentMesh}
          buildPlateSize={$params.buildPlateSize}
          on:deleteObject={handleDeleteObject}
        />
        {#if modelDimensions}
          <div class="dimension-badge" aria-label="Final model dimensions">
            <strong>Final size</strong>
            <span>
              {modelDimensions.width.toFixed(1)} × {modelDimensions.depth.toFixed(1)} × {modelDimensions.height.toFixed(1)} mm
            </span>
            <small>width × depth × height</small>
          </div>
        {/if}
      {:else}
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <h3>No Model Loaded</h3>
          <p>Upload a design or select a shape to start creating</p>
        </div>
      {/if}
    </div>
  </div>
</main>

<style>
  /* ============================================
     GLOBAL OVERRIDES
     ============================================ */
  :global(html) {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  :global(#app) {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  /* ============================================
     MAIN LAYOUT
     ============================================ */
  main {
    height: 100%;
    height: 100dvh;
    width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--surface-app);
    flex: 1;
  }

  /* ============================================
     HEADER - MODERN DESIGN
     ============================================ */
  .modern-header {
    background: linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%);
    box-shadow: var(--shadow-lg);
    z-index: var(--z-sticky);
    flex-shrink: 0;
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-4);
    max-width: 100%;
    min-width: 0;
    height: 48px;
  }

  .logo-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    min-width: 0;
  }

  .logo-text {
    min-width: 0;
  }

  .logo-icon {
    font-size: 1.75rem;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  }

  .logo-text h1 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: white;
    line-height: 1.2;
  }

  .tagline {
    margin: 0;
    font-size: var(--font-size-xs);
    color: rgba(255, 255, 255, 0.85);
    font-weight: var(--font-weight-normal);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
  }

  .current-file {
    color: rgba(255, 255, 255, 0.95);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-sm {
    height: 2rem;
    padding: 0 var(--spacing-3);
    font-size: var(--font-size-sm);
  }

  .btn-outline {
    background: rgba(255, 255, 255, 0.15);
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.3);
    backdrop-filter: blur(10px);
  }

  .btn-outline:hover {
    background: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.5);
  }

  .btn-icon {
    min-width: 2rem;
    padding: 0 var(--spacing-2);
  }

  .btn-icon svg {
    margin: 0;
  }

  /* ============================================
     APP LAYOUT - 3 COLUMN LAYOUT (Mini Sidebar + Content + Viewer)
     ============================================ */
  .app-layout {
    display: grid;
    grid-template-columns: 60px 420px 1fr;
    flex: 1;
    overflow: hidden;
    background: var(--surface-app);
    gap: 0;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  /* ============================================
     MINI SIDEBAR WITH CATEGORY ICONS
     ============================================ */
  .mini-sidebar {
    background: var(--surface-sidebar);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border-strong);
    z-index: var(--z-sticky);
    min-width: 0;
  }

  .category-nav {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-2) 0;
    gap: var(--spacing-1);
    min-width: 0;
  }

  .category-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 52px;
    padding: var(--spacing-2);
    border: none;
    background: transparent;
    color: var(--text-on-sidebar);
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
  }

  .category-btn svg {
    transition: all var(--transition-fast);
  }

  .nav-label {
    position: absolute;
    left: calc(100% + var(--spacing-2));
    top: 50%;
    z-index: var(--z-tooltip);
    padding: var(--spacing-1) var(--spacing-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-elevated);
    color: var(--text-primary);
    box-shadow: var(--shadow-md);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    line-height: 1.4;
    opacity: 0;
    pointer-events: none;
    transform: translate(-4px, -50%);
    transition: opacity var(--transition-fast), transform var(--transition-fast);
    white-space: nowrap;
  }

  .category-btn:hover .nav-label,
  .category-btn:focus-visible .nav-label {
    opacity: 1;
    transform: translate(0, -50%);
  }

  .category-btn:hover {
    background: var(--surface-sidebar-hover);
    color: var(--color-primary-400);
  }

  .category-btn:hover svg {
    transform: scale(1.15);
  }

  .category-btn.active {
    background: var(--surface-sidebar-active);
    color: var(--color-primary-400);
  }

  /* AI Button Special Styling */
  .category-btn.ai-btn:hover {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
    color: #a78bfa;
  }

  .category-btn.ai-btn.active {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%);
    color: #a78bfa;
  }

  .category-btn.ai-btn.active::before {
    background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  }

  .category-btn.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 60%;
    background: var(--color-primary-500);
    border-radius: 0 var(--radius-full) var(--radius-full) 0;
  }

  /* ============================================
     CONTENT PANEL
     ============================================ */
  .content-panel {
    background: var(--surface-panel);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--border-default);
    min-width: 0;
    width: 100%;
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-3);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    min-width: 0;
    overscroll-behavior: contain;
  }

  .feature-header {
    padding: var(--spacing-4);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: var(--surface-card);
    box-shadow: var(--shadow-sm);
  }

  .feature-header h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-size-xl);
    line-height: var(--line-height-tight);
  }

  .feature-header p {
    margin: var(--spacing-1) 0 0;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .panel-loading,
  .panel-load-error {
    padding: var(--spacing-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--surface-card);
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .panel-load-error {
    border-color: var(--color-error);
    color: var(--color-error);
  }

  /* ============================================
     ALERT MESSAGES
     ============================================ */
  .alert {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    margin-bottom: var(--spacing-2);
    border-radius: var(--radius-lg);
    animation: slideDown var(--transition-base);
  }

  .alert-error {
    background: #fef2f2;
    border-left: 4px solid var(--color-error);
    color: #991b1b;
  }

  .alert svg {
    flex-shrink: 0;
    color: var(--color-error);
  }

  .alert strong {
    display: block;
    margin-bottom: var(--spacing-1);
    font-weight: var(--font-weight-semibold);
  }

  .alert p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  /* ============================================
     QUICK START SECTION
     ============================================ */
  .quick-start {
    padding: var(--spacing-3);
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-default);
  }

  .btn-quick {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    background: var(--color-primary-600);
    color: white;
    border: 1px solid var(--color-primary-600);
    border-radius: var(--radius-md);
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-quick:hover {
    background: var(--color-primary-700);
    color: white;
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .btn-quick svg {
    transition: transform var(--transition-fast);
  }

  .btn-quick:hover svg {
    transform: rotate(360deg);
  }

  /* ============================================
     3D VIEWER PANEL
     ============================================ */
  .viewer-panel {
    background: linear-gradient(135deg, var(--surface-viewer-start) 0%, var(--surface-viewer-end) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  .dimension-badge {
    position: absolute;
    right: var(--spacing-4);
    bottom: var(--spacing-4);
    z-index: var(--z-sticky);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    padding: var(--spacing-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: var(--surface-elevated);
    color: var(--text-primary);
    box-shadow: var(--shadow-md);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    max-width: calc(100% - 2 * var(--spacing-4));
  }

  .dimension-badge span {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  .dimension-badge small {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }

  /* ============================================
     LOADING STATE
     ============================================ */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-6);
  }

  .modern-spinner {
    width: 60px;
    height: 60px;
    border: 4px solid var(--color-gray-200);
    border-top-color: var(--color-primary-600);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading-text {
    margin: 0;
    color: var(--color-gray-600);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-medium);
  }

  /* ============================================
     EMPTY STATE
     ============================================ */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--spacing-12);
    color: var(--text-muted);
  }

  .empty-icon {
    margin-bottom: var(--spacing-6);
    opacity: 0.3;
  }

  .empty-state h3 {
    margin: 0 0 var(--spacing-2);
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--text-muted);
  }

  /* ============================================
     RESPONSIVE DESIGN
     ============================================ */
  @media (max-width: 1440px) {
    .app-layout {
      grid-template-columns: 60px 340px 1fr;
    }
  }

  @media (max-width: 1024px) {
    .app-layout {
      grid-template-columns: 60px 300px 1fr;
    }

    .panel-content {
      padding: var(--spacing-2);
      gap: var(--spacing-2);
    }
  }

  @media (max-width: 768px) {
    .app-layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr) minmax(13rem, 42%);
    }

    .mini-sidebar {
      flex-direction: row;
      border-right: none;
      border-bottom: 1px solid var(--border-strong);
    }

    .category-nav {
      flex-direction: row;
      width: 100%;
      padding: 0 var(--spacing-2);
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scroll-snap-type: x proximity;
      -webkit-overflow-scrolling: touch;
    }

    .category-btn {
      height: 48px;
      min-width: 48px;
      flex: 0 0 48px;
      scroll-snap-align: start;
    }

    .nav-label {
      display: none;
    }

    .category-btn.active::before {
      left: 50%;
      top: auto;
      bottom: 0;
      width: 60%;
      height: 3px;
      border-radius: var(--radius-full) var(--radius-full) 0 0;
      transform: translateX(-50%);
    }

    .content-panel {
      min-height: 0;
      max-height: none;
      border-right: none;
      border-bottom: 1px solid var(--border-default);
    }

    .viewer-panel {
      min-height: 13rem;
    }

    .header-content {
      height: auto;
      min-height: 56px;
      gap: var(--spacing-2);
      padding-top: var(--spacing-1);
      padding-right: max(var(--spacing-3), env(safe-area-inset-right));
      padding-bottom: var(--spacing-1);
      padding-left: max(var(--spacing-3), env(safe-area-inset-left));
    }

    .logo-section {
      flex: 1;
      overflow: hidden;
    }

    .logo-icon {
      flex-shrink: 0;
      font-size: 1.5rem;
    }

    .logo-text {
      overflow: hidden;
    }

    .logo-text h1 {
      overflow: hidden;
      font-size: var(--font-size-sm);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tagline {
      display: none;
    }

    .current-file {
      display: none;
    }

    .header-actions {
      flex-shrink: 0;
      gap: var(--spacing-2);
    }

    .btn-sm {
      min-width: 44px;
      height: 44px;
      padding: 0 var(--spacing-2);
      font-size: 0.75rem;
    }

    .dimension-badge {
      right: var(--spacing-2);
      bottom: var(--spacing-2);
      left: var(--spacing-2);
      width: max-content;
      max-width: calc(100% - 2 * var(--spacing-2));
      padding: var(--spacing-2);
    }

    .dimension-badge span,
    .dimension-badge small {
      white-space: normal;
    }
  }

  @media (max-width: 768px) and (max-height: 650px) {
    .panel-content {
      padding: var(--spacing-1) var(--spacing-2);
      gap: var(--spacing-1);
    }

    .quick-start {
      padding: var(--spacing-1);
    }
  }

  @media (max-width: 480px) {
    .new-design-label {
      display: none;
    }

    .logo-text h1 {
      font-size: var(--font-size-xs);
    }

    .panel-content {
      padding: var(--spacing-2);
    }
  }
</style>
