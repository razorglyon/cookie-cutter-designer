<script lang="ts">
  import FileUpload from './lib/components/ui/FileUpload.svelte';
  import ParameterPanel from './lib/components/ui/ParameterPanel.svelte';
  import PrintabilityInfo from './lib/components/ui/PrintabilityInfo.svelte';
  import ThreeViewer from './lib/components/viewer/ThreeViewer.svelte';
  import ShapeLibrary from './lib/components/ui/ShapeLibrary.svelte';
  import HistoryPanel from './lib/components/ui/HistoryPanel.svelte';
  import OptimizationPanel from './lib/components/ui/OptimizationPanel.svelte';
  import SlicePreview from './lib/components/ui/SlicePreview.svelte';
  import BezierEditor from './lib/components/ui/BezierEditor.svelte';
  import MaterialManager from './lib/components/ui/MaterialManager.svelte';
  import PatternGenerator from './lib/components/ui/PatternGenerator.svelte';
  import AdvancedExport from './lib/components/ui/AdvancedExport.svelte';
  import CloudGallery from './lib/components/ui/CloudGallery.svelte';
  import BatchMode from './lib/components/ui/BatchMode.svelte';
  import CollisionDetector from './lib/components/ui/CollisionDetector.svelte';
  import AIImageProcessor from './lib/components/ui/AIImageProcessor.svelte';
  import BooleanOperations from './lib/components/ui/BooleanOperations.svelte';
  import GeminiAPIConfig from './lib/components/ui/GeminiAPIConfig.svelte';
  import AIAssistant from './lib/components/ui/AIAssistant.svelte';

  import { uploadedFile, model, isProcessing, error, params } from './lib/stores/cookieCutterStore';
  import { historyStore } from './lib/stores/historyStore';
  import { vectorizeImage, readFileAsText, cleanSVG } from './lib/utils/imageProcessor';
  import { generateCookieCutter, createTestCookieCutter } from './lib/utils/cookieCutterGenerator';
  import { generateStamp } from './lib/utils/stampGenerator';
  import { exportToSTL, estimateSTLSize, formatFileSize } from './lib/utils/stlExporter';
  import { applyMaterialToMesh, type MaterialPreset } from './lib/utils/materialManager';
  import type { SavedDesign } from './lib/utils/cloudGallery';
  import type { Mesh, Group } from 'three';
  import * as THREE from 'three';

  let currentMesh: Mesh | Group | null = null;
  let fileName: string = '';
  let svgCache: string | null = null;
  let isRestoringHistory = false; // Flag to prevent circular history updates
  let activeCategory: 'upload' | 'params' | 'shapes' | 'advanced' | 'ai' | 'gallery' | 'materials' | 'preview' | 'batch' | 'export' = 'upload';
  let darkMode = false;

  function toggleDarkMode() {
    darkMode = !darkMode;
    document.documentElement.classList.toggle('dark-mode', darkMode);
  }

  // Handle file upload
  async function handleFileUpload(event: CustomEvent<File>) {
    const file = event.detail;
    $uploadedFile = file;
    fileName = file.name;
    $error = null;
    $isProcessing = true;

    try {
      let svgString: string;

      // Check if it's an SVG or raster image
      if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
        svgString = await readFileAsText(file);
        svgString = cleanSVG(svgString);
      } else {
        // Vectorize raster image
        svgString = await vectorizeImage(file);
      }

      // Store SVG in cache for parameter changes
      svgCache = svgString;

      // Generate 3D model
      const mesh = await generateCookieCutter(svgString, $params);
      currentMesh = mesh;
      $model = {
        mesh,
        paths: [],
        params: $params,
      };

      // Switch to params after creating model
      activeCategory = 'params';
    } catch (err) {
      $error = err instanceof Error ? err.message : 'Failed to process file';
      console.error('Error processing file:', err);
    } finally {
      $isProcessing = false;
    }
  }

  let debounceTimer: number;

  // Regenerate model when parameters change
  $: if (svgCache && $params) {
    // Debounce to avoid too many regenerations
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      regenerateModel();
    }, 300);
  }

  async function regenerateModel() {
    if (!svgCache) return;

    $isProcessing = true;
    try {
      // Use appropriate generator based on mode
      const mesh = $params.mode === 'stamp'
        ? await generateStamp(svgCache, $params)
        : await generateCookieCutter(svgCache, $params);

      currentMesh = mesh;
      $model = {
        mesh,
        paths: [],
        params: $params,
      };
    } catch (err) {
      console.error('Error regenerating model:', err);
      $error = err instanceof Error ? err.message : 'Failed to regenerate model';
    } finally {
      $isProcessing = false;
    }
  }

  // Export to STL
  function handleExport() {
    if (!currentMesh) return;

    const filename = fileName.replace(/\.[^/.]+$/, '') + '.stl';
    exportToSTL(currentMesh, filename, { binary: true, includeMetadata: false });
  }

  // Handle shape selection from library
  async function handleShapeSelect(svg: string) {
    fileName = 'shape-library.svg';
    $error = null;
    $isProcessing = true;

    try {
      svgCache = cleanSVG(svg);

      // Generate the model
      const mesh = $params.mode === 'stamp'
        ? await generateStamp(svgCache, $params)
        : await generateCookieCutter(svgCache, $params);

      currentMesh = mesh;
      $model = {
        mesh,
        paths: [],
        params: $params,
      };

      // Switch to params after creating model
      activeCategory = 'params';
    } catch (err) {
      console.error('Error processing shape:', err);
      $error = err instanceof Error ? err.message : 'Failed to process shape';
    } finally {
      $isProcessing = false;
    }
  }

  // Load test model
  function loadTestModel() {
    $isProcessing = true;
    try {
      // Create a simple circle SVG for the cache
      const circleRadius = 20;
      svgCache = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="${circleRadius}" fill="black"/>
      </svg>`;

      const mesh = createTestCookieCutter($params);
      currentMesh = mesh;
      $model = {
        mesh,
        paths: [],
        params: $params,
      };
      fileName = 'test-circle.stl';

      // Switch to params after creating model
      activeCategory = 'params';
    } catch (err) {
      $error = err instanceof Error ? err.message : 'Failed to create test model';
    } finally {
      $isProcessing = false;
    }
  }

  // Calculate estimated file size
  $: estimatedSize = currentMesh ? formatFileSize(estimateSTLSize(currentMesh, true)) : null;

  // Save to history when parameters change (but not when restoring from history)
  $: if (!isRestoringHistory && svgCache && $params) {
    historyStore.pushState({
      params: { ...$params },
      svgData: svgCache,
      description: `Changed ${getCurrentChangeDescription()}`
    });
  }

  function getCurrentChangeDescription(): string {
    // Simple description based on last change
    return 'parameters';
  }

  // Handle undo
  async function handleUndo() {
    const state = historyStore.undo();
    if (state) {
      isRestoringHistory = true;

      // Restore parameters
      $params = { ...state.params };

      // Restore SVG if different
      if (state.svgData && state.svgData !== svgCache) {
        svgCache = state.svgData;
      }

      // Regenerate model
      await regenerateModel();

      isRestoringHistory = false;
    }
  }

  // Handle redo
  async function handleRedo() {
    const state = historyStore.redo();
    if (state) {
      isRestoringHistory = true;

      // Restore parameters
      $params = { ...state.params };

      // Restore SVG if different
      if (state.svgData && state.svgData !== svgCache) {
        svgCache = state.svgData;
      }

      // Regenerate model
      await regenerateModel();

      isRestoringHistory = false;
    }
  }

  // Handle material change
  function handleMaterialChange(event: CustomEvent<{ meshName: string; material: MaterialPreset }>) {
    if (!currentMesh) return;

    const { material } = event.detail;

    // Apply material to all meshes in the group
    currentMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        applyMaterialToMesh(child, material);
      }
    });
  }

  // Handle loading design from gallery
  async function handleLoadFromGallery(event: CustomEvent<SavedDesign>) {
    const design = event.detail;
    fileName = design.metadata.name + '.svg';
    $error = null;
    $isProcessing = true;

    try {
      svgCache = cleanSVG(design.svgData);
      $params = { ...design.params };

      const mesh = $params.mode === 'stamp'
        ? await generateStamp(svgCache, $params)
        : await generateCookieCutter(svgCache, $params);

      currentMesh = mesh;
      $model = {
        mesh,
        paths: [],
        params: $params
      };
    } catch (err) {
      console.error('Error loading design:', err);
      $error = err instanceof Error ? err.message : 'Failed to load design';
    } finally {
      $isProcessing = false;
    }
  }

  // Handle batch creation
  async function handleBatchCreated(event: CustomEvent<THREE.Group>) {
    const batchGroup = event.detail;
    currentMesh = batchGroup;
    $model = {
      mesh: batchGroup,
      paths: [],
      params: $params
    };
    fileName = 'batch-production.stl';
  }

  // Handle AI processed image
  async function handleAIProcessedImage(event: CustomEvent<Blob>) {
    const blob = event.detail;
    const file = new File([blob], 'ai-processed.png', { type: 'image/png' });

    // Process like a normal upload
    $uploadedFile = file;
    fileName = file.name;
    $error = null;
    $isProcessing = true;

    try {
      const svgString = await vectorizeImage(file);
      svgCache = svgString;

      const mesh = await generateCookieCutter(svgString, $params);
      currentMesh = mesh;
      $model = {
        mesh,
        paths: [],
        params: $params
      };
    } catch (err) {
      $error = err instanceof Error ? err.message : 'Failed to process AI image';
      console.error('Error processing AI image:', err);
    } finally {
      $isProcessing = false;
    }
  }
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
          <button class="btn btn-outline btn-sm" on:click={() => { $model = null; currentMesh = null; svgCache = null; $uploadedFile = null; }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12h18M12 3v18"/>
            </svg>
            New Design
          </button>
        {/if}
        <button class="btn btn-outline btn-sm btn-icon" on:click={toggleDarkMode} title={darkMode ? 'Light Mode' : 'Dark Mode'}>
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
      <nav class="category-nav">
        <button
          class="category-btn"
          class:active={activeCategory === 'upload'}
          on:click={() => activeCategory = 'upload'}
          title="Upload"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>

        {#if $model}
          <button
            class="category-btn"
            class:active={activeCategory === 'params'}
            on:click={() => activeCategory = 'params'}
            title="Parameters"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v6m0 6v6"/>
            </svg>
          </button>
        {/if}

        <button
          class="category-btn"
          class:active={activeCategory === 'shapes'}
          on:click={() => activeCategory = 'shapes'}
          title="Shape Library"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
        </button>

        <button
          class="category-btn"
          class:active={activeCategory === 'advanced'}
          on:click={() => activeCategory = 'advanced'}
          title="Advanced Creation"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v20M2 12h20"/>
          </svg>
        </button>

        <button
          class="category-btn ai-btn"
          class:active={activeCategory === 'ai'}
          on:click={() => activeCategory = 'ai'}
          title="AI Tools (Gemini)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
            <circle cx="9" cy="16" r="1"/>
            <circle cx="15" cy="16" r="1"/>
          </svg>
        </button>

        <button
          class="category-btn"
          class:active={activeCategory === 'gallery'}
          on:click={() => activeCategory = 'gallery'}
          title="Cloud Gallery"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </button>

        {#if $model}
          <button
            class="category-btn"
            class:active={activeCategory === 'materials'}
            on:click={() => activeCategory = 'materials'}
            title="Materials"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          </button>

          <button
            class="category-btn"
            class:active={activeCategory === 'preview'}
            on:click={() => activeCategory = 'preview'}
            title="Preview"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>

          <button
            class="category-btn"
            class:active={activeCategory === 'batch'}
            on:click={() => activeCategory = 'batch'}
            title="Batch"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 16h6v6M8 8H2V2"/>
            </svg>
          </button>

          <button
            class="category-btn"
            class:active={activeCategory === 'export'}
            on:click={() => activeCategory = 'export'}
            title="Export"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
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
          <ParameterPanel />
          <HistoryPanel on:undo={handleUndo} on:redo={handleRedo} />

        {:else if activeCategory === 'shapes'}
          <ShapeLibrary on:selectShape={(e) => handleShapeSelect(e.detail)} />

        {:else if activeCategory === 'advanced'}
          <AIImageProcessor on:processedImage={handleAIProcessedImage} />
          <BezierEditor on:pathCreated={(e) => handleShapeSelect(e.detail)} />
          <PatternGenerator on:patternCreated={(e) => handleShapeSelect(e.detail)} />
          <BooleanOperations on:shapeCreated={(e) => handleShapeSelect(e.detail)} />

        {:else if activeCategory === 'ai'}
          <GeminiAPIConfig />
          <AIAssistant params={$params} svgContent={svgCache} on:optimizedSVG={(e) => handleShapeSelect(e.detail)} />

        {:else if activeCategory === 'gallery'}
          <CloudGallery currentSvg={svgCache} currentParams={$params} on:loadDesign={handleLoadFromGallery} />

        {:else if activeCategory === 'materials' && $model}
          <MaterialManager on:materialChanged={handleMaterialChange} />
          <OptimizationPanel on:applyFix={(e) => $params = { ...$params, ...e.detail }} />
          <CollisionDetector mesh={currentMesh} buildPlateSize={$params.buildPlateSize} />

        {:else if activeCategory === 'preview' && $model}
          <SlicePreview mesh={currentMesh} layerHeight={0.2} />
          <PrintabilityInfo />

        {:else if activeCategory === 'batch' && $model}
          <BatchMode
            currentSvg={svgCache}
            currentParams={$params}
            buildPlateSize={$params.buildPlateSize}
            on:batchCreated={handleBatchCreated}
          />

        {:else if activeCategory === 'export' && $model}
          <AdvancedExport mesh={currentMesh} filename={fileName} params={$params} />
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
        <ThreeViewer mesh={currentMesh} buildPlateSize={$params.buildPlateSize} />
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
    width: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-gray-50);
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
    height: 48px;
  }

  .logo-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .logo-icon {
    font-size: 1.75rem;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  }

  .logo-text h1 {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-bold);
    color: white;
    line-height: 1.2;
  }

  .tagline {
    margin: 0;
    font-size: 0.65rem;
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
    grid-template-columns: 60px 360px 1fr;
    flex: 1;
    overflow: hidden;
    background: var(--color-gray-100);
    gap: 0;
  }

  /* ============================================
     MINI SIDEBAR WITH CATEGORY ICONS
     ============================================ */
  .mini-sidebar {
    background: linear-gradient(180deg, var(--color-gray-900) 0%, var(--color-gray-800) 100%);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--color-gray-700);
    z-index: var(--z-sticky);
  }

  .category-nav {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-2) 0;
    gap: var(--spacing-1);
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
    color: var(--color-gray-400);
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
  }

  .category-btn svg {
    transition: all var(--transition-fast);
  }

  .category-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-primary-400);
  }

  .category-btn:hover svg {
    transform: scale(1.15);
  }

  .category-btn.active {
    background: rgba(59, 130, 246, 0.15);
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
    width: 3px;
    height: 60%;
    background: var(--color-primary-500);
    border-radius: 0 var(--radius-full) var(--radius-full) 0;
  }

  /* ============================================
     CONTENT PANEL
     ============================================ */
  .content-panel {
    background: var(--color-gray-50);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--color-gray-200);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-3);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
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
    background: linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-secondary-50) 100%);
    border-radius: var(--radius-lg);
    border: 2px dashed var(--color-primary-300);
  }

  .btn-quick {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    background: white;
    color: var(--color-primary-700);
    border: 2px solid var(--color-primary-500);
    border-radius: var(--radius-md);
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-quick:hover {
    background: var(--color-primary-600);
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
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
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
    color: var(--color-gray-500);
  }

  .empty-icon {
    margin-bottom: var(--spacing-6);
    opacity: 0.3;
  }

  .empty-state h3 {
    margin: 0 0 var(--spacing-2);
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-gray-700);
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--color-gray-500);
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
      grid-template-rows: auto auto 1fr;
    }

    .mini-sidebar {
      flex-direction: row;
      border-right: none;
      border-bottom: 1px solid var(--color-gray-700);
    }

    .category-nav {
      flex-direction: row;
      padding: 0 var(--spacing-2);
      overflow-x: auto;
      width: 100%;
    }

    .category-btn {
      height: 48px;
      min-width: 48px;
    }

    .category-btn.active::before {
      left: 50%;
      transform: translateX(-50%);
      top: auto;
      bottom: 0;
      width: 60%;
      height: 3px;
      border-radius: var(--radius-full) var(--radius-full) 0 0;
    }

    .content-panel {
      max-height: 40vh;
    }

    .header-content {
      padding: var(--spacing-2) var(--spacing-3);
    }

    .logo-text h1 {
      font-size: var(--font-size-sm);
    }

    .tagline {
      display: none;
    }

    .current-file {
      max-width: 100px;
      font-size: 0.75rem;
    }

    .btn-sm {
      font-size: 0.75rem;
      padding: 0 var(--spacing-2);
    }
  }
</style>
