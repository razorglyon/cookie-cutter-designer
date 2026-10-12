<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Group, Mesh } from 'three';
  import {
    sliceMesh,
    getMeshBounds,
    calculateOptimalLayerHeight,
    disposeSliceLayers,
    type SliceLayer
  } from '../../utils/slicer';

  export let mesh: Mesh | Group | null = null;
  export let layerHeight = 0.2;

  let sliceLayers: SliceLayer[] = [];
  let currentLayerIndex = 0;
  let isSlicing = false;
  let slicingError: string | null = null;
  let showSliceView = false;
  let autoPlay = false;
  let playInterval: number | null = null;

  $: if (mesh && showSliceView) performSlicing();
  $: currentLayer = sliceLayers[currentLayerIndex];
  $: layerProgress = sliceLayers.length > 0
    ? ((currentLayerIndex + 1) / sliceLayers.length * 100).toFixed(0)
    : 0;
  $: drawing = currentLayer ? createDrawing(currentLayer) : null;

  function createDrawing(layer: SliceLayer): { viewBox: string; paths: string[] } {
    const points = layer.contours.flat();
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const padding = Math.max(1, Math.max(maxX - minX, maxY - minY) * 0.05);
    return {
      viewBox: `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`,
      paths: layer.contours.map((contour) =>
        `${contour.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`
      )
    };
  }

  function performSlicing(): void {
    if (!mesh) return;
    isSlicing = true;
    slicingError = null;
    try {
      const bounds = getMeshBounds(mesh);
      const effectiveHeight = layerHeight || calculateOptimalLayerHeight(bounds.maxHeight - bounds.minHeight);
      const nextLayers = sliceMesh(mesh, {
        layerHeight: effectiveHeight,
        minHeight: bounds.minHeight,
        maxHeight: bounds.maxHeight
      });
      disposeSliceLayers(sliceLayers);
      sliceLayers = nextLayers;
      currentLayerIndex = 0;
    } catch (error) {
      slicingError = error instanceof Error ? error.message : 'Échec de l’aperçu des couches.';
    } finally {
      isSlicing = false;
    }
  }

  function nextLayer(): void {
    if (currentLayerIndex < sliceLayers.length - 1) currentLayerIndex += 1;
  }

  function previousLayer(): void {
    if (currentLayerIndex > 0) currentLayerIndex -= 1;
  }

  function jumpToLayer(index: number): void {
    currentLayerIndex = Math.max(0, Math.min(index, sliceLayers.length - 1));
  }

  function toggleAutoPlay(): void {
    autoPlay = !autoPlay;
    if (autoPlay) {
      playInterval = window.setInterval(() => {
        currentLayerIndex = currentLayerIndex < sliceLayers.length - 1
          ? currentLayerIndex + 1
          : 0;
      }, 500);
    } else if (playInterval !== null) {
      window.clearInterval(playInterval);
      playInterval = null;
    }
  }

  onDestroy(() => {
    if (playInterval !== null) window.clearInterval(playInterval);
    disposeSliceLayers(sliceLayers);
  });
</script>

<div class="slice-preview">
  <div class="preview-header">
    <h3>Aperçu des intersections de couches</h3>
    <button class="toggle-btn" on:click={() => showSliceView = !showSliceView}>
      {showSliceView ? '▼' : '▶'}
    </button>
  </div>

  {#if showSliceView}
    <div class="preview-content">
      {#if !mesh}
        <div class="no-model">
          <p>Importez un modèle pour prévisualiser les couches</p>
        </div>
      {:else if isSlicing}
        <div class="slicing-progress">
          <div class="spinner"></div>
          <p>Calcul des couches…</p>
        </div>
      {:else if slicingError}
        <div class="no-layers"><p>{slicingError}</p></div>
      {:else if sliceLayers.length > 0}
        <p class="preview-note">
          Coupe géométrique uniquement : sans remplissage, supports, trajectoires d’extrusion ni G-code.
        </p>
        {#if drawing}
          <svg class="layer-drawing" viewBox={drawing.viewBox} aria-label="Intersections de la couche actuelle">
            {#each drawing.paths as path}
              <path d={path} />
            {/each}
          </svg>
        {/if}
        <div class="layer-controls">
          <div class="layer-info">
            <div class="info-row">
              <span class="label">Couche :</span>
              <span class="value">{currentLayerIndex + 1} / {sliceLayers.length}</span>
            </div>
            <div class="info-row">
              <span class="label">Hauteur :</span>
              <span class="value">{currentLayer.height.toFixed(2)} mm</span>
            </div>
          </div>

          <div class="layer-slider">
            <input
              type="range"
              min="0"
              max={sliceLayers.length - 1}
              bind:value={currentLayerIndex}
              on:input={(e) => jumpToLayer(parseInt(e.currentTarget.value))}
              class="slider"
            />
            <div class="progress-bar">
              <div class="progress-fill" style="width: {layerProgress}%"></div>
            </div>
          </div>

          <div class="playback-controls">
            <button
              class="control-btn"
              on:click={previousLayer}
              disabled={currentLayerIndex === 0}
              title="Couche précédente"
            >
              ⏮
            </button>

            <button
              class="control-btn play-btn"
              on:click={toggleAutoPlay}
              title={autoPlay ? 'Pause' : 'Lecture automatique'}
            >
              {autoPlay ? '⏸' : '▶'}
            </button>

            <button
              class="control-btn"
              on:click={nextLayer}
              disabled={currentLayerIndex === sliceLayers.length - 1}
              title="Couche suivante"
            >
              ⏭
            </button>
          </div>

          <div class="layer-stats">
            <div class="stat-item">
              <span class="stat-label">Contours:</span>
              <span class="stat-value">{currentLayer.contours.length}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Points:</span>
              <span class="stat-value">{currentLayer.contours.reduce((sum, contour) => sum + contour.length, 0)}</span>
            </div>
          </div>
        </div>

        <div class="layer-settings">
          <label for="layerHeight">
            Hauteur de couche : {layerHeight.toFixed(2)}mm
          </label>
          <input
            id="layerHeight"
            type="range"
            min="0.05"
            max="0.4"
            step="0.05"
            bind:value={layerHeight}
            on:change={performSlicing}
          />
          <div class="preset-buttons">
            <button class="preset-btn" on:click={() => { layerHeight = 0.1; performSlicing(); }}>
              Fin (0,1 mm)
            </button>
            <button class="preset-btn" on:click={() => { layerHeight = 0.2; performSlicing(); }}>
              Normal (0,2 mm)
            </button>
            <button class="preset-btn" on:click={() => { layerHeight = 0.3; performSlicing(); }}>
              Rapide (0,3 mm)
            </button>
          </div>
        </div>
      {:else}
        <div class="no-layers">
          <p>Aucune couche trouvée. Essayez d’ajuster les paramètres.</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .slice-preview {
    background: var(--surface-card);
    color: var(--text-primary);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1rem;
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary);
    font-weight: 600;
  }

  .toggle-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.8rem;
  }

  .preview-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .preview-note {
    margin: 0;
    padding: 0.75rem;
    border-left: 3px solid var(--color-primary-500);
    background: var(--surface-callout);
    color: var(--text-primary);
    font-size: 0.8rem;
  }

  .layer-drawing {
    width: 100%;
    height: 220px;
    padding: 0.75rem;
    box-sizing: border-box;
    border-radius: 6px;
    background: #1a202c;
  }

  .layer-drawing path {
    fill: rgba(66, 153, 225, 0.18);
    stroke: #63b3ed;
    stroke-width: 0.5;
    vector-effect: non-scaling-stroke;
  }

  .no-model,
  .no-layers,
  .slicing-progress {
    padding: 2rem;
    text-align: center;
    color: var(--text-secondary);
    background: var(--surface-muted);
    border-radius: 6px;
  }

  .spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto 1rem;
    border: 3px solid var(--border-default);
    border-top-color: var(--color-primary-500);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .layer-controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .layer-info {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--surface-muted);
    border-radius: 6px;
  }

  .info-row {
    display: flex;
    flex-direction: column;
    text-align: center;
  }

  .label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    font-weight: 600;
  }

  .value {
    font-size: 0.95rem;
    color: var(--text-primary);
    font-weight: 600;
    margin-top: 0.25rem;
  }

  .layer-slider {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .slider {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-muted);
    outline: none;
    appearance: none;
    -webkit-appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--color-primary-700);
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--color-primary-700);
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .progress-bar {
    width: 100%;
    height: 4px;
    background: var(--surface-muted);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4299e1, #3182ce);
    transition: width 0.3s ease;
  }

  .playback-controls {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }

  .control-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-input);
    border: 2px solid var(--border-default);
    border-radius: 6px;
    font-size: 1.2rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .control-btn:hover:not(:disabled) {
    border-color: var(--color-primary-500);
    background: var(--surface-callout);
  }

  .control-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .play-btn {
    width: 60px;
    background: var(--color-primary-700);
    color: var(--text-on-brand);
    border-color: var(--color-primary-500);
  }

  .play-btn:hover:not(:disabled) {
    background: var(--color-primary-800);
  }

  .layer-stats {
    display: flex;
    justify-content: space-around;
    padding: 0.75rem;
    background: var(--surface-muted);
    border-radius: 6px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .stat-value {
    font-size: 0.95rem;
    color: var(--text-primary);
    font-weight: 600;
    margin-top: 0.25rem;
  }

  .layer-settings {
    padding: 1rem;
    background: var(--surface-muted);
    border-radius: 6px;
  }

  .layer-settings label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .layer-settings input[type="range"] {
    width: 100%;
    margin-bottom: 0.75rem;
  }

  .preset-buttons {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .preset-btn {
    padding: 0.5rem;
    background: var(--surface-input);
    border: 2px solid var(--border-default);
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .preset-btn:hover {
    border-color: var(--color-primary-500);
    background: var(--surface-callout);
    color: var(--text-primary);
  }
</style>
