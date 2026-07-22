<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Group } from 'three';
  import type { CookieCutterParams } from '../../types/CookieCutter';
  import {
    createBatch,
    duplicateItem,
    checkBuildPlateFit,
    BatchGenerationError,
    type BatchItem,
    type BatchLayout
  } from '../../utils/batchProcessor';

  export let currentSvg: string | null;
  export let currentParams: CookieCutterParams;
  export let buildPlateSize: number;

  const dispatch = createEventDispatcher<{
    batchCreated: Group;
  }>();

  let showPanel = false;
  let batchItems: BatchItem[] = [];
  let layout: BatchLayout = { type: 'grid', spacing: 20, columns: 3 };
  let processing = false;
  let batchController: AbortController | null = null;
  let completedItems = 0;
  let batchStatus: string | null = null;

  function addCurrentDesign() {
    if (!currentSvg) return;

    const newItem: BatchItem = {
      id: `item_${Date.now()}`,
      name: `Design ${batchItems.length + 1}`,
      svgData: currentSvg,
      params: { ...currentParams }
    };

    batchItems = [...batchItems, newItem];
  }

  function duplicateCurrent(count: number) {
    if (!currentSvg) return;

    const baseItem: BatchItem = {
      id: `item_${Date.now()}`,
      name: `Design`,
      svgData: currentSvg,
      params: { ...currentParams }
    };

    const duplicates = duplicateItem(baseItem, count);
    batchItems = [...batchItems, ...duplicates];
  }

  function removeItem(id: string) {
    batchItems = batchItems.filter(item => item.id !== id);
  }

  async function generateBatch() {
    if (processing) {
      batchController?.abort();
      return;
    }
    if (batchItems.length === 0) return;

    processing = true;
    completedItems = 0;
    batchStatus = null;
    const controller = new AbortController();
    batchController = controller;
    try {
      const result = await createBatch(batchItems, layout, buildPlateSize, {
        signal: controller.signal,
        onProgress: (completed) => { completedItems = completed; }
      });
      batchStatus = `${result.report.succeeded} items · ${result.totalDimensions.width.toFixed(1)} × ${result.totalDimensions.height.toFixed(1)} mm`;
      dispatch('batchCreated', result.mesh);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        batchStatus = 'Cancelled — no partial batch was kept.';
      } else if (error instanceof BatchGenerationError) {
        batchStatus = error.failures.map((failure) => `${failure.name}: ${failure.message}`).join(' · ');
      } else {
        batchStatus = error instanceof Error ? error.message : 'Batch generation failed.';
      }
    } finally {
      if (batchController === controller) batchController = null;
      processing = false;
    }
  }

  $: fitCheck = checkBuildPlateFit(batchItems, layout, buildPlateSize);
</script>

<div class="batch-mode">
  <div class="panel-header">
    <h3>🏭 Batch Mode</h3>
    <button class="toggle-btn" on:click={() => showPanel = !showPanel}>
      {showPanel ? '▼' : '▶'}
    </button>
  </div>

  {#if showPanel}
    <div class="panel-content">
      <div class="controls">
        <button class="btn" on:click={addCurrentDesign} disabled={!currentSvg}>
          + Add Current Design
        </button>
        <button class="btn" on:click={() => duplicateCurrent(5)} disabled={!currentSvg}>
          + Add 5 Copies
        </button>
      </div>

      <div class="layout-controls">
        <label>
          <span>Layout:</span>
          <select bind:value={layout.type}>
            <option value="grid">Grid</option>
            <option value="optimized">Optimized</option>
          </select>
        </label>
        <label>
          <span>Spacing: {layout.spacing}mm</span>
          <input type="range" bind:value={layout.spacing} min="10" max="40" />
        </label>
      </div>

      <div class="items-list">
        <h4>Items ({batchItems.length})</h4>
        {#each batchItems as item}
          <div class="item">
            <span>{item.name}</span>
            <button class="remove-btn" on:click={() => removeItem(item.id)}>✕</button>
          </div>
        {/each}
      </div>


      {#if fitCheck.warnings.length > 0}
        <div class="warning">{fitCheck.warnings.join(' · ')}</div>
      {/if}

      {#if batchStatus}<div class="batch-status">{batchStatus}</div>{/if}

      <button class="generate-btn" on:click={generateBatch} disabled={!processing && batchItems.length === 0}>
        {processing ? `Cancel (${completedItems}/${batchItems.length})` : 'Generate Atomic Batch'}
      </button>
    </div>
  {/if}
</div>

<style>
  .batch-mode {
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

  .toggle-btn {
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .panel-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .controls, .layout-controls {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .btn, .generate-btn {
    padding: 0.75rem 1rem;
    border: 2px solid #4299e1;
    border-radius: 6px;
    background: white;
    color: #4299e1;
    cursor: pointer;
    font-weight: 600;
  }

  .btn:hover:not(:disabled) {
    background: #4299e1;
    color: white;
  }

  .generate-btn {
    width: 100%;
    background: #48bb78;
    border-color: #48bb78;
    color: white;
  }

  .generate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .items-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    background: #f7fafc;
    margin-bottom: 0.25rem;
    border-radius: 4px;
  }

  .remove-btn {
    background: none;
    border: none;
    color: #e53e3e;
    cursor: pointer;
  }

  .batch-status {
    padding: 0.75rem;
    background: #f0fff4;
    border-left: 4px solid #48bb78;
    color: #276749;
    overflow-wrap: anywhere;
  }

  .warning {
    padding: 0.75rem;
    background: #fffaf0;
    border-left: 4px solid #ed8936;
    color: #c05621;
  }

  label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  select, input {
    padding: 0.5rem;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
  }
</style>
