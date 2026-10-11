<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { DesignDocument, CutterSeriesLayout } from '../../domain/designDocument';
  import CutterSeriesControls from './CutterSeriesControls.svelte';
  import { disposeObject3D } from '../../utils/disposeThree';
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
  export let currentDocument: DesignDocument | null = null;
  export let onUpdateSeries: ((layout: CutterSeriesLayout) => void) | undefined = undefined;
  export let onSingleCutter: (() => void) | undefined = undefined;
  let showLegacy = false;
  // Capture before production. Predicate must return strictly true; exceptions fail closed.
  export let captureOperationValidity: (() => (() => boolean)) | undefined = undefined;
  // Optional contextual handoff. Ownership transfers synchronously on invocation;
  // without it the existing batchCreated event still carries the Group unchanged.
  export let onBatchCreated: ((mesh: Group, isCurrent: () => boolean, params?: Readonly<CookieCutterParams>) => void) | undefined = undefined;

  const dispatch = createEventDispatcher<{
    batchCreated: Group;
  }>();

  let showPanel = false;
  let batchItems: BatchItem[] = [];
  let layout: BatchLayout = { type: 'grid', spacing: 20, columns: 3 };
  let processing = false;
  let batchController: AbortController | null = null;
  let alive = true;
  let operation = 0;
  onDestroy(() => {
    alive = false;
    operation += 1;
    const controller = batchController;
    batchController = null;
    controller?.abort();
  });
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

    if (!alive) return;
    // The exact detached, immutable recipe used by production owns its metadata.
    // Live input and panel edits during an await cannot rewrite this recipe.
    const items = Object.freeze(batchItems.map(item => Object.freeze({
      ...item, params: Object.freeze({ ...item.params })
    })));
    const capturedLayout = Object.freeze({ ...layout });
    const capturedPlateSize = buildPlateSize;
    const firstParams = items[0].params;
    const keys = Object.keys(firstParams) as (keyof CookieCutterParams)[];
    const commonParams = items.every(item => Object.keys(item.params).length === keys.length
      && keys.every(key => item.params[key] === firstParams[key])) ? firstParams : undefined;
    const token = ++operation;
    const controller = new AbortController();
    batchController = controller;
    processing = true;
    let context: () => boolean = () => true;
    let owned: Group | null = null;
    const localCurrent = () => alive && token === operation && batchController === controller;
    const current = () => {
      if (!localCurrent()) return false;
      try { return context() === true && localCurrent(); }
      catch { return false; }
    };
    try {
      context = captureOperationValidity ? captureOperationValidity() : () => true;
      if (typeof context !== 'function' || !current() || controller.signal.aborted) return;
      completedItems = 0;
      batchStatus = null;
      const receiver = onBatchCreated;
      const result = await createBatch(items, capturedLayout, capturedPlateSize, {
        signal: controller.signal,
        onProgress: (completed) => {
          if (current() && !controller.signal.aborted) completedItems = completed;
        }
      });
      owned = result.mesh;
      if (!current() || controller.signal.aborted) return;
      batchStatus = `${result.report.succeeded} items · ${result.totalDimensions.width.toFixed(1)} × ${result.totalDimensions.height.toFixed(1)} mm`;
      // No await between validity and handoff. After handoff only the receiver disposes.
      owned = null;
      if (receiver) receiver(result.mesh, context, commonParams);
      else dispatch('batchCreated', result.mesh);
    } catch (error) {
      if (!current()) return;
      if (controller.signal.aborted) {
        batchStatus = 'Cancelled — no partial batch was kept.';
      } else if (error instanceof BatchGenerationError) {
        batchStatus = error.failures.map((failure) => `${failure.name}: ${failure.message}`).join(' · ');
      } else {
        batchStatus = error instanceof Error ? error.message : 'Batch generation failed.';
      }
    } finally {
      // Release only this producer's local lock, even when its external context expired.
      // Never touch a newer producer's UI/controller or a destroyed component.
      if (localCurrent()) { batchController = null; processing = false; }
      if (owned) disposeObject3D(owned);
    }
  }

  $: fitCheck = checkBuildPlateFit(batchItems, layout, buildPlateSize);
</script>

{#if onUpdateSeries && !showLegacy}
  <CutterSeriesControls {currentDocument} {onUpdateSeries} {onSingleCutter} />
{/if}
{#if onUpdateSeries}
  <button type="button" class="legacy-switch" aria-expanded={showLegacy} on:click={() => showLegacy = !showLegacy}>{showLegacy ? 'Revenir à la série enregistrable' : 'Production libre historique — non enregistrable'}</button>
{/if}
<div class="batch-mode" hidden={Boolean(onUpdateSeries) && !showLegacy}>
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
  .batch-mode[hidden] { display: none; }
  .legacy-switch { min-height: 44px; padding: var(--spacing-2) var(--spacing-3); margin: var(--spacing-3) 0; border: 1px solid var(--border-strong); border-radius: var(--radius-md); color: var(--text-secondary); background: var(--surface-card); }
  .legacy-switch:focus-visible { outline: 3px solid var(--color-primary-500); outline-offset: 2px; }

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
