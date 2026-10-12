<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import {
    processImageWithAI,
    getAIPresets,
    type AIProcessingOptions,
    type ProcessingResult
  } from '../../utils/aiImageProcessor';

  const dispatch = createEventDispatcher<{
    processedImage: Blob;
  }>();

  export let captureOperationValidity: (() => (() => boolean)) | undefined = undefined;
  export let onProcessedImage: ((blob: Blob, validity: () => boolean) => void) | undefined = undefined;
  let alive = true;
  let sequence = 0;
  let resultOperation: { current: () => boolean; validity: () => boolean } | null = null;
  onDestroy(() => { alive = false; sequence++; });
  function invalidate() { sequence++; processing = false; result = null; resultOperation = null; }
  let showPanel = false;
  let processing = false;
  let selectedFile: File | null = null;
  let selectedPreset: string = 'simple';
  let result: ProcessingResult | null = null;

  // The preview owns a separate DOM canvas; never replace the producer's pixels.
  function renderPreview(canvas: HTMLCanvasElement, processed: ProcessingResult) {
    function draw(value: ProcessingResult): void {
      if (!alive || value !== result || !resultOperation?.current()) return;
      // One owner sets dimensions before drawing; no later attribute update erases pixels.
      canvas.width = value.processedSize.width;
      canvas.height = value.processedSize.height;
      canvas.getContext('2d')?.drawImage(value.processedCanvas, 0, 0, canvas.width, canvas.height);
    }
    draw(processed);
    return { update: draw };
  }

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

    invalidate();
    selectedFile = file;
  }

  async function processImage() {
    if (!selectedFile) return;

    const token = ++sequence;
    const file = selectedFile;
    const local = () => alive && token === sequence && selectedFile === file;
    let validity: () => boolean;
    try { validity = captureOperationValidity ? captureOperationValidity() : () => true; } catch { return; }
    const current = () => {
      if (!local()) return false;
      try { return validity() === true && local(); } catch { return false; }
    };
    if (!current()) return;
    processing = true;
    result = null;
    resultOperation = null;
    try {
      const processed = await processImageWithAI(file, { ...options });
      if (!current()) return;
      resultOperation = { current, validity };
      result = processed;
    } catch (error) {
      if (current()) console.error('Error processing image:', error);
    } finally {
      if (local()) processing = false;
    }
  }

  async function useProcessedImage() {
    const operation = resultOperation;
    if (!result || !operation?.current()) return;

    // The delayed canvas callback retains the processing start context, not use-time context.
    result.processedCanvas.toBlob((blob) => {
      if (blob && operation.current()) {
        if (onProcessedImage) onProcessedImage(blob, operation.validity);
        else dispatch('processedImage', blob);
      }
    }, 'image/png');
  }

  function resetProcessor() {
    invalidate();
    selectedFile = null;
    result = null;
    selectedPreset = 'simple';
    options = { ...presets.simple };
  }
</script>

<div class="ai-processor">
  <div class="panel-header">
    <h3>🤖 Traitement d’images par IA</h3>
    <button
      class="toggle-btn"
      on:click={() => showPanel = !showPanel}
      aria-label={showPanel ? 'Replier le traitement d’images par IA' : 'Déplier le traitement d’images par IA'}
      aria-expanded={showPanel}
      aria-controls="ai-image-processor-content"
    >
      {showPanel ? '▼' : '▶'}
    </button>
  </div>

  {#if showPanel}
    <div class="panel-content" id="ai-image-processor-content">
      <p class="description">
        Améliorez vos images avec l’IA avant de les convertir en emporte-pièces.
        Idéal pour les photos et les illustrations complexes.
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
            📁 {selectedFile ? selectedFile.name : 'Choisir une image'}
          </div>
        </label>
      </div>

      {#if selectedFile}
        <div class="preset-selector">
          <label>
            <span>Préréglage de traitement :</span>
            <select bind:value={selectedPreset}>
              <option value="simple">Simple (idéal pour les logos)</option>
              <option value="detailed">Détaillé (idéal pour les photos)</option>
              <option value="outline">Contours (détection des bords)</option>
              <option value="clean">Épuré (noir et blanc)</option>
            </select>
          </label>
        </div>

        <div class="advanced-options">
          <h4>Options avancées :</h4>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={options.enhanceContrast} />
            <span>Améliorer le contraste</span>
          </label>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={options.removeBackground} />
            <span>Supprimer l’arrière-plan</span>
          </label>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={options.edgeDetection} />
            <span>Détection des bords</span>
          </label>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={options.denoise} />
            <span>Réduire le bruit</span>
          </label>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={options.autoThreshold} />
            <span>Seuil automatique</span>
          </label>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={options.simplifyColors} />
            <span>Simplifier les couleurs</span>
          </label>

          {#if options.simplifyColors}
            <label>
              <span>Nombre maximal de couleurs : {options.maxColors || 8}</span>
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
          {processing ? '⏳ Traitement…' : '🚀 Traiter l’image'}
        </button>
      {/if}

      {#if result}
        <div class="results">
          <h4>Résultats du traitement :</h4>

          <div class="preview">
            <div class="preview-item">
              <strong>Image traitée :</strong>
              <canvas
                use:renderPreview={result}
                style="max-width: 100%; border: 1px solid #e2e8f0; border-radius: 4px;"
              ></canvas>
            </div>
          </div>

          <div class="stats">
            <h4>Statistiques :</h4>
            <div class="stat-grid">
              <div class="stat-item">
                <span>Luminosité :</span>
                <strong>{(result.stats.brightness * 100).toFixed(1)}%</strong>
              </div>
              <div class="stat-item">
                <span>Contraste :</span>
                <strong>{(result.stats.contrast * 100).toFixed(1)}%</strong>
              </div>
              <div class="stat-item">
                <span>Couleurs :</span>
                <strong>{result.stats.colorCount}</strong>
              </div>
              <div class="stat-item">
                <span>Intensité des bords :</span>
                <strong>{(result.stats.edgeStrength * 100).toFixed(1)}%</strong>
              </div>
            </div>
          </div>

          <div class="actions">
            <button class="use-btn" on:click={useProcessedImage}>
              ✅ Utiliser cette image
            </button>
            <button class="reset-btn" on:click={resetProcessor}>
              🔄 Recommencer
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
