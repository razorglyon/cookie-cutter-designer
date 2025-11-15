<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Mesh, Group } from 'three';
  import {
    detectCollisions,
    checkBuildPlateBounds,
    autoFixCollisions,
    createCollisionVisualization,
    type CollisionResult
  } from '../../utils/collisionDetector';

  export let mesh: Mesh | Group | null;
  export let buildPlateSize: number;

  const dispatch = createEventDispatcher<{
    fixCollisions: void;
    visualizeCollisions: Group;
  }>();

  let showPanel = false;
  let collisionResult: CollisionResult | null = null;
  let minSeparation = 2;
  let autoCheckEnabled = true;
  let showVisualization = false;

  // Check for collisions when mesh changes
  $: if (mesh && autoCheckEnabled) {
    checkCollisions();
  }

  function checkCollisions() {
    if (!mesh) {
      collisionResult = null;
      return;
    }

    const objects: any[] = [];
    mesh.traverse((child) => {
      if ((child as any).isMesh && child !== mesh) {
        objects.push(child);
      }
    });

    if (objects.length < 2) {
      collisionResult = {
        hasCollisions: false,
        collisions: [],
        warnings: ['Only one object detected. Add more items to check for collisions.']
      };
      return;
    }

    collisionResult = detectCollisions(objects, minSeparation);

    // Also check build plate bounds
    objects.forEach(obj => {
      const boundsCheck = checkBuildPlateBounds(obj, buildPlateSize);
      if (!boundsCheck.inBounds) {
        collisionResult!.warnings.push(...boundsCheck.warnings);
      }
    });
  }

  function handleAutoFix() {
    if (!mesh || !(mesh as any).isGroup) return;

    const result = autoFixCollisions(mesh as Group, buildPlateSize, minSeparation);

    if (result.fixed) {
      // Re-check collisions after fixing
      setTimeout(() => {
        checkCollisions();
      }, 100);
    }

    dispatch('fixCollisions');
  }

  function toggleVisualization() {
    showVisualization = !showVisualization;

    if (showVisualization && collisionResult && collisionResult.hasCollisions) {
      const objects: any[] = [];
      mesh?.traverse((child) => {
        if ((child as any).isMesh && child !== mesh) {
          objects.push(child);
        }
      });

      const vizGroup = createCollisionVisualization(collisionResult.collisions, objects);
      dispatch('visualizeCollisions', vizGroup);
    }
  }
</script>

<div class="collision-detector">
  <div class="panel-header">
    <h3>⚠️ Collision Detection</h3>
    <button class="toggle-btn" on:click={() => showPanel = !showPanel}>
      {showPanel ? '▼' : '▶'}
    </button>
  </div>

  {#if showPanel}
    <div class="panel-content">
      <div class="controls">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={autoCheckEnabled} />
          <span>Auto-check on changes</span>
        </label>

        <label>
          <span>Min Separation: {minSeparation}mm</span>
          <input
            type="range"
            bind:value={minSeparation}
            min="0"
            max="10"
            step="0.5"
            on:change={checkCollisions}
          />
        </label>
      </div>

      <button class="check-btn" on:click={checkCollisions} disabled={!mesh}>
        🔍 Check Now
      </button>

      {#if collisionResult}
        <div class="results">
          {#if collisionResult.hasCollisions}
            <div class="status error">
              <strong>❌ Collisions Detected!</strong>
              <p>{collisionResult.collisions.length} collision(s) found</p>
            </div>

            <div class="collisions-list">
              <h4>Collision Details:</h4>
              {#each collisionResult.collisions as collision}
                <div class="collision-item">
                  <div class="collision-pair">
                    <strong>{collision.object1}</strong> ↔ <strong>{collision.object2}</strong>
                  </div>
                  {#if collision.overlap > 0}
                    <div class="overlap">Overlap: {collision.overlap.toFixed(2)}mm</div>
                  {:else}
                    <div class="close">Gap: {collision.distance.toFixed(2)}mm (too close)</div>
                  {/if}
                </div>
              {/each}
            </div>

            {#if collisionResult.warnings.length > 0}
              <div class="warnings">
                <h4>Warnings:</h4>
                {#each collisionResult.warnings as warning}
                  <div class="warning-item">⚠️ {warning}</div>
                {/each}
              </div>
            {/if}

            <div class="actions">
              <button class="fix-btn" on:click={handleAutoFix}>
                🔧 Auto-Fix Positions
              </button>
              <button class="viz-btn" on:click={toggleVisualization}>
                {showVisualization ? '👁️ Hide' : '👁️ Show'} Visualization
              </button>
            </div>
          {:else}
            <div class="status success">
              <strong>✅ No Collisions</strong>
              <p>All objects are properly spaced</p>
            </div>
          {/if}
        </div>
      {:else}
        <div class="no-results">
          <p>Click "Check Now" to analyze for collisions</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .collision-detector {
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

  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
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

  .check-btn, .fix-btn, .viz-btn {
    padding: 0.75rem 1rem;
    border: 2px solid #4299e1;
    border-radius: 6px;
    background: white;
    color: #4299e1;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }

  .check-btn:hover:not(:disabled),
  .fix-btn:hover,
  .viz-btn:hover {
    background: #4299e1;
    color: white;
  }

  .check-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .status {
    padding: 1rem;
    border-radius: 6px;
    text-align: center;
  }

  .status.success {
    background: #f0fff4;
    border: 2px solid #48bb78;
    color: #22543d;
  }

  .status.error {
    background: #fff5f5;
    border: 2px solid #fc8181;
    color: #742a2a;
  }

  .status p {
    margin: 0.5rem 0 0;
    font-size: 0.9rem;
  }

  .collisions-list {
    background: #f7fafc;
    padding: 1rem;
    border-radius: 6px;
  }

  .collision-item {
    background: white;
    padding: 0.75rem;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    border-left: 4px solid #fc8181;
  }

  .collision-pair {
    font-size: 0.9rem;
    margin-bottom: 0.25rem;
  }

  .overlap {
    font-size: 0.85rem;
    color: #c53030;
    font-weight: 600;
  }

  .close {
    font-size: 0.85rem;
    color: #d69e2e;
    font-weight: 600;
  }

  .warnings {
    background: #fffaf0;
    padding: 1rem;
    border-radius: 6px;
    border-left: 4px solid #ed8936;
  }

  .warning-item {
    font-size: 0.85rem;
    color: #7c2d12;
    margin-bottom: 0.25rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .fix-btn {
    flex: 1;
    background: #48bb78;
    border-color: #48bb78;
    color: white;
  }

  .fix-btn:hover {
    background: #38a169;
    border-color: #38a169;
  }

  .viz-btn {
    flex: 1;
  }

  .no-results {
    text-align: center;
    padding: 2rem 1rem;
    color: #718096;
    font-size: 0.9rem;
  }
</style>
