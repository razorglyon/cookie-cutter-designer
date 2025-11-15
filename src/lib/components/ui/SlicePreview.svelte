<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import type { Mesh, Group } from 'three';
  import {
    sliceMesh,
    getMeshBounds,
    calculateOptimalLayerHeight,
    estimateLayerPrintTime,
    type SliceLayer
  } from '../../utils/slicer';

  export let mesh: Mesh | Group | null = null;
  export let layerHeight: number = 0.2;

  let sliceLayers: SliceLayer[] = [];
  let currentLayerIndex: number = 0;
  let isSlicing: boolean = false;
  let totalPrintTime: number = 0;
  let showSliceView: boolean = false;
  let autoPlay: boolean = false;
  let playInterval: number | null = null;

  $: if (mesh && showSliceView) {
    performSlicing();
  }

  $: currentLayer = sliceLayers[currentLayerIndex];
  $: layerProgress = sliceLayers.length > 0
    ? ((currentLayerIndex + 1) / sliceLayers.length * 100).toFixed(0)
    : 0;

  async function performSlicing() {
    if (!mesh) return;

    isSlicing = true;
    try {
      const bounds = getMeshBounds(mesh);

      // Use provided layer height or calculate optimal
      const optimalHeight = layerHeight || calculateOptimalLayerHeight(bounds.maxZ - bounds.minZ);

      sliceLayers = sliceMesh(mesh, {
        layerHeight: optimalHeight,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ
      });

      // Calculate total print time
      totalPrintTime = sliceLayers.reduce((total, layer) => {
        return total + estimateLayerPrintTime(layer);
      }, 0);

      currentLayerIndex = 0;
    } catch (err) {
      console.error('Error slicing mesh:', err);
    } finally {
      isSlicing = false;
    }
  }

  function nextLayer() {
    if (currentLayerIndex < sliceLayers.length - 1) {
      currentLayerIndex++;
    }
  }

  function previousLayer() {
    if (currentLayerIndex > 0) {
      currentLayerIndex--;
    }
  }

  function jumpToLayer(index: number) {
    currentLayerIndex = Math.max(0, Math.min(index, sliceLayers.length - 1));
  }

  function toggleAutoPlay() {
    autoPlay = !autoPlay;

    if (autoPlay) {
      playInterval = setInterval(() => {
        if (currentLayerIndex < sliceLayers.length - 1) {
          currentLayerIndex++;
        } else {
          currentLayerIndex = 0; // Loop back to start
        }
      }, 500) as unknown as number;
    } else {
      if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
      }
    }
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  onDestroy(() => {
    if (playInterval) {
      clearInterval(playInterval);
    }
  });
</script>

<div class="slice-preview">
  <div class="preview-header">
    <h3>🔍 Slice Preview</h3>
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
      {:else if sliceLayers.length > 0}
        <div class="layer-controls">
          <div class="layer-info">
            <div class="info-row">
              <span class="label">Layer:</span>
              <span class="value">{currentLayerIndex + 1} / {sliceLayers.length}</span>
            </div>
            <div class="info-row">
              <span class="label">Height:</span>
              <span class="value">{currentLayer.z.toFixed(2)}mm</span>
            </div>
            <div class="info-row">
              <span class="label">Total Time:</span>
              <span class="value">{formatTime(totalPrintTime)}</span>
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
              <span class="stat-label">Layer Time:</span>
              <span class="stat-value">{formatTime(estimateLayerPrintTime(currentLayer))}</span>
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
    grid-template-columns: repeat(3, 1fr);
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
