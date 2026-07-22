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
      slicingError = error instanceof Error ? error.message : 'Layer preview failed.';
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
    <h3>Layer Intersection Preview</h3>
    <button class="toggle-btn" on:click={() => showSliceView = !showSliceView}>
      {showSliceView ? '▼' : '▶'}
    </button>
  </div>

  {#if showSliceView}
    <div class="preview-content">
      {#if !mesh}
        <div class="no-model">
          <p>Upload a model to preview slicing</p>
        </div>
      {:else if isSlicing}
        <div class="slicing-progress">
          <div class="spinner"></div>
          <p>Slicing model...</p>
        </div>
      {:else if slicingError}
        <div class="no-layers"><p>{slicingError}</p></div>
      {:else if sliceLayers.length > 0}
        <p class="preview-note">
          Geometric cross-section only — no infill, supports, extrusion paths or G-code.
        </p>
        {#if drawing}
          <svg class="layer-drawing" viewBox={drawing.viewBox} aria-label="Current layer intersections">
            {#each drawing.paths as path}
              <path d={path} />
            {/each}
          </svg>
        {/if}
        <div class="layer-controls">
          <div class="layer-info">
            <div class="info-row">
              <span class="label">Layer:</span>
              <span class="value">{currentLayerIndex + 1} / {sliceLayers.length}</span>
            </div>
            <div class="info-row">
              <span class="label">Height:</span>
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
              title="Previous Layer"
            >
              ⏮
            </button>

            <button
              class="control-btn play-btn"
              on:click={toggleAutoPlay}
              title={autoPlay ? 'Pause' : 'Auto Play'}
            >
              {autoPlay ? '⏸' : '▶'}
            </button>

            <button
              class="control-btn"
              on:click={nextLayer}
              disabled={currentLayerIndex === sliceLayers.length - 1}
              title="Next Layer"
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
            Layer Height: {layerHeight.toFixed(2)}mm
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
              Fine (0.1mm)
            </button>
            <button class="preset-btn" on:click={() => { layerHeight = 0.2; performSlicing(); }}>
              Normal (0.2mm)
            </button>
            <button class="preset-btn" on:click={() => { layerHeight = 0.3; performSlicing(); }}>
              Fast (0.3mm)
            </button>
          </div>
        </div>
      {:else}
        <div class="no-layers">
          <p>No layers found. Try adjusting parameters.</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .slice-preview {
    background: white;
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
    color: #2d3748;
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
    color: #a0aec0;
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
    border-left: 3px solid #4299e1;
    background: #ebf8ff;
    color: #2c5282;
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
    color: #718096;
    background: #f7fafc;
    border-radius: 6px;
  }

  .spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto 1rem;
    border: 3px solid #e2e8f0;
    border-top-color: #4299e1;
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
    background: #f7fafc;
    border-radius: 6px;
  }

  .info-row {
    display: flex;
    flex-direction: column;
    text-align: center;
  }

  .label {
    font-size: 0.75rem;
    color: #a0aec0;
    text-transform: uppercase;
    font-weight: 600;
  }

  .value {
    font-size: 0.95rem;
    color: #2d3748;
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
    background: #e2e8f0;
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
    background: #4299e1;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #4299e1;
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .progress-bar {
    width: 100%;
    height: 4px;
    background: #e2e8f0;
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
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    font-size: 1.2rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .control-btn:hover:not(:disabled) {
    border-color: #4299e1;
    background: #ebf8ff;
  }

  .control-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .play-btn {
    width: 60px;
    background: #4299e1;
    color: white;
    border-color: #4299e1;
  }

  .play-btn:hover:not(:disabled) {
    background: #3182ce;
  }

  .layer-stats {
    display: flex;
    justify-content: space-around;
    padding: 0.75rem;
    background: #f7fafc;
    border-radius: 6px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat-label {
    font-size: 0.75rem;
    color: #a0aec0;
    text-transform: uppercase;
  }

  .stat-value {
    font-size: 0.95rem;
    color: #2d3748;
    font-weight: 600;
    margin-top: 0.25rem;
  }

  .layer-settings {
    padding: 1rem;
    background: #f7fafc;
    border-radius: 6px;
  }

  .layer-settings label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #4a5568;
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
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    color: #4a5568;
    cursor: pointer;
    transition: all 0.2s;
  }

  .preset-btn:hover {
    border-color: #4299e1;
    background: #ebf8ff;
    color: #2c5282;
  }
</style>
