<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    generatePattern,
    getPatternPresets,
    type PatternConfig,
    type PatternType
  } from '../../utils/patternGenerator';

  const dispatch = createEventDispatcher<{
    patternCreated: string; // SVG string
  }>();

  let showPanel = false;
  let selectedPreset = getPatternPresets()[0];
  let config: PatternConfig = { ...selectedPreset.defaultConfig };
  let baseShape = createDefaultShape();
  let previewSVG = '';

  const presets = getPatternPresets();

  function createDefaultShape(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="5" fill="black"/>
    </svg>`;
  }

  function selectPreset(preset: typeof presets[0]) {
    selectedPreset = preset;
    config = { ...preset.defaultConfig };
    updatePreview();
  }

  function updatePreview() {
    const result = generatePattern(baseShape, config);
    previewSVG = result.svg;
  }

  function applyPattern() {
    if (previewSVG) {
      dispatch('patternCreated', previewSVG);
    }
  }

  function changeBaseShape(shape: 'circle' | 'square' | 'star' | 'heart') {
    switch (shape) {
      case 'circle':
        baseShape = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="5" fill="black"/></svg>';
        break;
      case 'square':
        baseShape = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="45" y="45" width="10" height="10" fill="black"/></svg>';
        break;
      case 'star':
        baseShape = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 50,42 L 52,48 L 58,48 L 53,52 L 55,58 L 50,54 L 45,58 L 47,52 L 42,48 L 48,48 Z" fill="black"/></svg>';
        break;
      case 'heart':
        baseShape = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 50,55 C 50,55 42,48 42,44 C 42,40 45,38 48,38 C 50,38 50,40 50,40 C 50,40 50,38 52,38 C 55,38 58,40 58,44 C 58,48 50,55 50,55 Z" fill="black"/></svg>';
        break;
    }
    updatePreview();
  }

  // Update preview when config changes
  $: if (config) {
    updatePreview();
  }
</script>

<div class="pattern-generator">
  <div class="panel-header">
    <h3>🔄 Pattern Generator</h3>
    <button class="toggle-btn" on:click={() => showPanel = !showPanel}>
      {showPanel ? '▼' : '▶'}
    </button>
  </div>

  {#if showPanel}
    <div class="panel-content">
      <!-- Pattern Type Selection -->
      <div class="preset-section">
        <h4>Pattern Type</h4>
        <div class="preset-grid">
          {#each presets as preset}
            <button
              class="preset-card"
              class:selected={selectedPreset.type === preset.type}
              on:click={() => selectPreset(preset)}
            >
              <div class="preset-icon">{preset.icon}</div>
              <div class="preset-name">{preset.name}</div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Base Shape Selection -->
      <div class="shape-section">
        <h4>Base Shape</h4>
        <div class="shape-buttons">
          <button class="shape-btn" on:click={() => changeBaseShape('circle')}>
            ⚪ Circle
          </button>
          <button class="shape-btn" on:click={() => changeBaseShape('square')}>
            ⬜ Square
          </button>
          <button class="shape-btn" on:click={() => changeBaseShape('star')}>
            ⭐ Star
          </button>
          <button class="shape-btn" on:click={() => changeBaseShape('heart')}>
            ❤️ Heart
          </button>
        </div>
      </div>

      <!-- Pattern Controls -->
      <div class="controls-section">
        <h4>Pattern Settings</h4>

        <div class="control-group">
          <label for="count">
            Count: {config.count}
          </label>
          <input
            id="count"
            type="range"
            min="2"
            max="20"
            step="1"
            bind:value={config.count}
          />
        </div>

        <div class="control-group">
          <label for="spacing">
            Spacing: {config.spacing.toFixed(1)}
          </label>
          <input
            id="spacing"
            type="range"
            min="5"
            max="40"
            step="1"
            bind:value={config.spacing}
          />
        </div>

        <div class="control-group">
          <label for="scale">
            Scale: {config.scale.toFixed(2)}
          </label>
          <input
            id="scale"
            type="range"
            min="0.2"
            max="1.5"
            step="0.1"
            bind:value={config.scale}
          />
        </div>

        {#if selectedPreset.type === 'radial' || selectedPreset.type === 'spiral'}
          <div class="control-group">
            <label for="rotation">
              Rotation: {config.rotation}°
            </label>
            <input
              id="rotation"
              type="range"
              min="0"
              max="360"
              step="15"
              bind:value={config.rotation}
            />
          </div>
        {/if}
      </div>

      <!-- Preview -->
      <div class="preview-section">
        <h4>Preview</h4>
        <div class="preview-container">
          {@html previewSVG}
        </div>
      </div>

      <!-- Apply Button -->
      <div class="action-section">
        <button class="apply-btn" on:click={applyPattern}>
          Apply Pattern
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .pattern-generator {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1rem;
  }

  .panel-header {
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

  h4 {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    color: #4a5568;
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

  .panel-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .preset-section,
  .shape-section,
  .controls-section,
  .preview-section {
    padding: 1rem;
    background: #f7fafc;
    border-radius: 6px;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .preset-card {
    padding: 1rem 0.5rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .preset-card:hover {
    border-color: #4299e1;
    transform: translateY(-2px);
  }

  .preset-card.selected {
    border-color: #4299e1;
    background: #ebf8ff;
  }

  .preset-icon {
    font-size: 1.5rem;
  }

  .preset-name {
    font-size: 0.85rem;
    color: #4a5568;
    font-weight: 500;
  }

  .shape-buttons {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .shape-btn {
    padding: 0.75rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .shape-btn:hover {
    border-color: #4299e1;
    background: #ebf8ff;
  }

  .control-group {
    margin-bottom: 1rem;
  }

  .control-group:last-child {
    margin-bottom: 0;
  }

  .control-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #4a5568;
    font-weight: 500;
  }

  .control-group input[type="range"] {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: #e2e8f0;
    outline: none;
    -webkit-appearance: none;
  }

  .control-group input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #4299e1;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .control-group input[type="range"]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #4299e1;
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .preview-container {
    width: 100%;
    aspect-ratio: 1;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .preview-container :global(svg) {
    width: 100%;
    height: 100%;
  }

  .apply-btn {
    width: 100%;
    padding: 1rem;
    background: #4299e1;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .apply-btn:hover {
    background: #3182ce;
  }
</style>
