<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    processImageWithAI,
    getAIPresets,
    type AIProcessingOptions,
    type ProcessingResult
  } from '../../utils/aiImageProcessor';

  const dispatch = createEventDispatcher<{
    processedImage: Blob;
  }>();

  let showPanel = false;
  let processing = false;
  let selectedFile: File | null = null;
  let selectedPreset: string = 'simple';
  let result: ProcessingResult | null = null;

  const presets = getAIPresets();

  let options: AIProcessingOptions = { ...presets.simple };

  // Update options when preset changes
  $: if (selectedPreset && presets[selectedPreset]) {
    options = { ...presets[selectedPreset] };
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    selectedFile = file;
    result = null;
  }

  async function processImage() {
    if (!selectedFile) return;

    processing = true;
    try {
      result = await processImageWithAI(selectedFile, options);
    } catch (error) {
      console.error('Error processing image:', error);
    } finally {
      processing = false;
    }
  }

  async function useProcessedImage() {
    if (!result) return;

    // Convert canvas to blob
    result.processedCanvas.toBlob((blob) => {
      if (blob) {
        dispatch('processedImage', blob);
      }
    }, 'image/png');
  }

  function resetProcessor() {
    selectedFile = null;
    result = null;
    selectedPreset = 'simple';
    options = { ...presets.simple };
  }
</script>

<div class="ai-processor">
  <div class="panel-header">
    <h3>🤖 AI Image Processor</h3>
    <button class="toggle-btn" on:click={() => showPanel = !showPanel}>
      {showPanel ? '▼' : '▶'}
    </button>
  </div>

  {#if showPanel}
    <div class="panel-content">
      <p class="description">
        Enhance your images with AI before converting to cookie cutters.
        Perfect for photos and complex graphics.
      </p>

      <div class="upload-section">
        <label class="file-input-label">
          <input
            type="file"
            accept="image/*"
            on:change={handleFileSelect}
            style="display: none;"
          />
          <div class="upload-button">
            📁 {selectedFile ? selectedFile.name : 'Select Image'}
          </div>
        </label>
      </div>

      {#if selectedFile}
        <div class="preset-selector">
          <label>
            <span>Processing Preset:</span>
            <select bind:value={selectedPreset}>
              <option value="simple">Simple (Best for logos)</option>
              <option value="detailed">Detailed (Best for photos)</option>
              <option value="outline">Outline (Edge detection)</option>
              <option value="clean">Clean (Black & white)</option>
            </select>
          </label>
        </div>

        <div class="advanced-options">
          <h4>Advanced Options:</h4>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={options.enhanceContrast} />
            <span>Enhance Contrast</span>
          </label>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={options.removeBackground} />
            <span>Remove Background</span>
          </label>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={options.edgeDetection} />
            <span>Edge Detection</span>
          </label>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={options.denoise} />
            <span>Denoise</span>
          </label>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={options.autoThreshold} />
            <span>Auto Threshold</span>
          </label>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={options.simplifyColors} />
            <span>Simplify Colors</span>
          </label>

          {#if options.simplifyColors}
            <label>
              <span>Max Colors: {options.maxColors || 8}</span>
              <input
                type="range"
                bind:value={options.maxColors}
                min="2"
                max="16"
                step="1"
              />
            </label>
          {/if}
        </div>

        <button
          class="process-btn"
          on:click={processImage}
          disabled={processing}
        >
          {processing ? '⏳ Processing...' : '🚀 Process Image'}
        </button>
      {/if}

      {#if result}
        <div class="results">
          <h4>Processing Results:</h4>

          <div class="preview">
            <div class="preview-item">
              <strong>Processed Image:</strong>
              <canvas
                bind:this={result.processedCanvas}
                width={result.processedSize.width}
                height={result.processedSize.height}
                style="max-width: 100%; border: 1px solid #e2e8f0; border-radius: 4px;"
              />
            </div>
          </div>

          <div class="stats">
            <h4>Statistics:</h4>
            <div class="stat-grid">
              <div class="stat-item">
                <span>Brightness:</span>
                <strong>{(result.stats.brightness * 100).toFixed(1)}%</strong>
              </div>
              <div class="stat-item">
                <span>Contrast:</span>
                <strong>{(result.stats.contrast * 100).toFixed(1)}%</strong>
              </div>
              <div class="stat-item">
                <span>Colors:</span>
                <strong>{result.stats.colorCount}</strong>
              </div>
              <div class="stat-item">
                <span>Edge Strength:</span>
                <strong>{(result.stats.edgeStrength * 100).toFixed(1)}%</strong>
              </div>
            </div>
          </div>

          <div class="actions">
            <button class="use-btn" on:click={useProcessedImage}>
              ✅ Use This Image
            </button>
            <button class="reset-btn" on:click={resetProcessor}>
              🔄 Start Over
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .ai-processor {
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

  h3, h4 {
    margin: 0;
    font-size: 1rem;
    color: #2d3748;
    font-weight: 600;
  }

  h4 {
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
  }

  .toggle-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
  }

  .panel-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .description {
    margin: 0;
    font-size: 0.9rem;
    color: #718096;
    line-height: 1.5;
  }

  .upload-section {
    display: flex;
    justify-content: center;
  }

  .file-input-label {
    cursor: pointer;
    width: 100%;
  }

  .upload-button {
    padding: 1rem;
    background: #4299e1;
    color: white;
    border-radius: 6px;
    text-align: center;
    font-weight: 600;
    transition: background 0.2s;
  }

  .upload-button:hover {
    background: #3182ce;
  }

  .preset-selector label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #4a5568;
  }

  select {
    padding: 0.75rem;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    background: white;
    cursor: pointer;
  }

  .advanced-options {
    background: #f7fafc;
    padding: 1rem;
    border-radius: 6px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    cursor: pointer;
    font-size: 0.9rem;
    color: #4a5568;
  }

  .checkbox-label input[type="checkbox"] {
    cursor: pointer;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #4a5568;
  }

  input[type="range"] {
    width: 100%;
    cursor: pointer;
  }

  .process-btn, .use-btn, .reset-btn {
    padding: 0.75rem 1rem;
    border: 2px solid #4299e1;
    border-radius: 6px;
    background: white;
    color: #4299e1;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }

  .process-btn {
    width: 100%;
    background: #4299e1;
    color: white;
  }

  .process-btn:hover:not(:disabled) {
    background: #3182ce;
  }

  .process-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: #f7fafc;
    border-radius: 6px;
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .preview-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .stats {
    background: white;
    padding: 1rem;
    border-radius: 6px;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    background: #f7fafc;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .use-btn {
    flex: 1;
    background: #48bb78;
    border-color: #48bb78;
    color: white;
  }

  .use-btn:hover {
    background: #38a169;
    border-color: #38a169;
  }

  .reset-btn {
    flex: 1;
  }

  .reset-btn:hover {
    background: #4299e1;
    color: white;
  }
</style>
