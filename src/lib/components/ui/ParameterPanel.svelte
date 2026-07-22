<script lang="ts">
  import { parameterError, params, updateParam } from '../../stores/cookieCutterStore';
  import type { HandleStyle } from '../../types/CookieCutter';

  const handleStyles: { value: HandleStyle; label: string }[] = [
    { value: 'none', label: 'No Handle' },
    { value: 'flat', label: 'Flat Top' },
    { value: 'round', label: 'Round' },
    { value: 'chamfered', label: 'Chamfered' },
    { value: 'rectangular', label: 'Rectangular' }
  ];
</script>

<div class="parameter-panel">
  <h2>Cookie Cutter Parameters</h2>

  {#if $parameterError}
    <div class="parameter-error" role="alert">
      <strong>Parameter update failed</strong>
      <span>{$parameterError}</span>
    </div>
  {/if}

  <div class="param-group">
    <h3>Design Type</h3>
    <div class="param-control">
      <div class="mode-selector">
        <button
          class="mode-btn"
          class:active={$params.mode === 'cutter'}
          on:click={() => updateParam('mode', 'cutter')}
          aria-pressed={$params.mode === 'cutter'}
        >
          ✂️ Cutter
        </button>
        <button
          class="mode-btn"
          class:active={$params.mode === 'stamp'}
          on:click={() => updateParam('mode', 'stamp')}
          aria-pressed={$params.mode === 'stamp'}
        >
          🔖 Stamp
        </button>
      </div>
      <div class="param-hint">
        {$params.mode === 'cutter' ? 'Cookie cutter with hollow walls' : 'Stamp with raised relief'}
      </div>
    </div>

    {#if $params.mode === 'stamp'}
      <div class="param-control">
        <label for="stampDepth">
          Stamp Depth: {$params.stampDepth.toFixed(1)} mm
        </label>
        <input
          id="stampDepth"
          type="range"
          aria-valuetext={`${$params.stampDepth.toFixed(1)} millimeters`}
          min="1.0"
          max="5.0"
          step="0.5"
          value={$params.stampDepth}
          on:input={(e) => updateParam('stampDepth', parseFloat(e.currentTarget.value))}
        />
        <div class="param-hint">Range: 1–5 mm · Depth of the raised relief</div>
      </div>

      <div class="param-control">
        <label>
          <input
            type="checkbox"
            checked={$params.stampBase}
            on:change={(e) => updateParam('stampBase', e.currentTarget.checked)}
          />
          Add Base Plate
        </label>
        <div class="param-hint">Adds a solid base for the stamp</div>
      </div>
    {/if}
  </div>

  <div class="param-group">
    <h3>Dimensions</h3>

    <div class="param-control">
      <label for="wallThickness">
        Wall Thickness: {$params.wallThickness.toFixed(1)} mm
      </label>
      <input
        id="wallThickness"
        type="range"
        aria-valuetext={`${$params.wallThickness.toFixed(1)} millimeters`}
        min="0.6"
        max="2.0"
        step="0.1"
        value={$params.wallThickness}
        on:input={(e) => updateParam('wallThickness', parseFloat(e.currentTarget.value))}
      />
      <div class="param-hint">Range: 0.6–2 mm · Recommended: 0.8–1.2 mm</div>
    </div>

    <div class="param-control">
      <label for="cuttingHeight">
        Cutting Height: {$params.cuttingHeight.toFixed(0)} mm
      </label>
      <input
        id="cuttingHeight"
        type="range"
        aria-valuetext={`${$params.cuttingHeight.toFixed(0)} millimeters`}
        min="8"
        max="25"
        step="1"
        value={$params.cuttingHeight}
        on:input={(e) => updateParam('cuttingHeight', parseFloat(e.currentTarget.value))}
      />
      <div class="param-hint">Range: 8–25 mm · Recommended: 10–15 mm</div>
    </div>

    <div class="param-control">
      <label for="totalHeight">
        Total Height: {$params.totalHeight.toFixed(0)} mm
      </label>
      <input
        id="totalHeight"
        type="range"
        aria-valuetext={`${$params.totalHeight.toFixed(0)} millimeters`}
        min="15"
        max="40"
        step="1"
        value={$params.totalHeight}
        on:input={(e) => updateParam('totalHeight', parseFloat(e.currentTarget.value))}
      />
      <div class="param-hint">Range: 15–40 mm · Recommended: 15–25 mm</div>
    </div>

    <div class="param-control">
      <label for="taperAngle">
        Taper Angle: {$params.taperAngle.toFixed(0)}°
      </label>
      <input
        id="taperAngle"
        type="range"
        aria-valuetext={`${$params.taperAngle.toFixed(0)} degrees`}
        min="0"
        max="15"
        step="1"
        value={$params.taperAngle}
        on:input={(e) => updateParam('taperAngle', parseFloat(e.currentTarget.value))}
      />
      <div class="param-hint">Range: 0–15° · Recommended: 5–10°</div>
    </div>

    <div class="param-control">
      <label for="scale">
        Scale: {($params.scale * 100).toFixed(0)}%
      </label>
      <input
        id="scale"
        type="range"
        aria-valuetext={`${($params.scale * 100).toFixed(0)} percent`}
        min="0.5"
        max="3.0"
        step="0.1"
        value={$params.scale}
        on:input={(e) => updateParam('scale', parseFloat(e.currentTarget.value))}
      />
    </div>

    <div class="param-control">
      <label for="buildPlateSize">
        Build Plate Size: {$params.buildPlateSize.toFixed(0)} mm ({($params.buildPlateSize / 10).toFixed(0)} cm)
      </label>
      <input
        id="buildPlateSize"
        type="range"
        aria-valuetext={`${$params.buildPlateSize.toFixed(0)} millimeters`}
        min="100"
        max="300"
        step="10"
        value={$params.buildPlateSize}
        on:input={(e) => updateParam('buildPlateSize', parseFloat(e.currentTarget.value))}
      />
      <div class="param-hint">Range: 100–300 mm · Common sizes: 150, 200, 220, 250 mm</div>
    </div>
  </div>

  <div class="param-group">
    <h3>Handle</h3>

    <div class="param-control">
      <label for="handleStyle">Handle Style</label>
      <select
        id="handleStyle"
        value={$params.handleStyle}
        on:change={(e) => updateParam('handleStyle', e.currentTarget.value as HandleStyle)}
      >
        {#each handleStyles as style}
          <option value={style.value}>{style.label}</option>
        {/each}
      </select>
    </div>

    {#if $params.handleStyle !== 'none'}
      <div class="param-control">
        <label for="handleHeight">
          Handle Height: {$params.handleHeight.toFixed(0)} mm
        </label>
        <input
          id="handleHeight"
          type="range"
          aria-valuetext={`${$params.handleHeight.toFixed(0)} millimeters`}
          min="3"
          max="15"
          step="1"
          value={$params.handleHeight}
          on:input={(e) => updateParam('handleHeight', parseFloat(e.currentTarget.value))}
        />
      </div>
    {/if}
  </div>

  <div class="param-group">
    <h3>Advanced</h3>

    <div class="param-control">
      <span class="control-label">Standalone Embossing</span>
      <div class="param-hint">
        Not available in cutter mode. Select Stamp mode and use Stamp Depth for raised relief.
      </div>
    </div>
  </div>
</div>

<style>
  .parameter-panel {
    padding: var(--spacing-4);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: var(--surface-card);
    color: var(--text-secondary);
    box-shadow: var(--shadow-sm);
  }

  .parameter-error {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    margin-bottom: var(--spacing-4);
    padding: var(--spacing-3);
    border-left: 4px solid var(--color-error);
    border-radius: var(--radius-md);
    background: var(--color-error-light);
    color: var(--color-error);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-normal);
  }

  h2 {
    margin: 0 0 var(--spacing-4);
    color: var(--text-primary);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
  }

  h3 {
    margin: var(--spacing-3) 0 var(--spacing-2);
    padding-bottom: var(--spacing-2);
    border-bottom: 1px solid var(--border-default);
    color: var(--text-secondary);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
  }

  .param-group {
    margin-bottom: var(--spacing-4);
  }

  .param-group:first-of-type h3 {
    margin-top: 0;
  }

  .param-control {
    margin-bottom: var(--spacing-4);
  }

  label,
  .control-label {
    display: block;
    margin-bottom: var(--spacing-2);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .mode-selector {
    display: flex;
    gap: var(--spacing-2);
    margin-bottom: var(--spacing-2);
  }

  .mode-btn {
    min-height: var(--button-height-lg);
    flex: 1;
    padding: 0 var(--spacing-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-input);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
  }

  .mode-btn:hover {
    border-color: var(--color-primary-400);
    background: var(--surface-callout);
  }

  .mode-btn.active {
    border-color: var(--color-primary-500);
    background: var(--surface-callout);
    color: var(--color-primary-600);
    font-weight: var(--font-weight-semibold);
  }

  input[type="range"] {
    width: 100%;
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--text-muted);
    outline: none;
    appearance: none;
    -webkit-appearance: none;
  }

  input[type="range"]::-webkit-slider-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--color-primary-600);
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }

  input[type="range"]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: var(--color-primary-600);
    cursor: pointer;
  }

  select {
    width: 100%;
    min-height: var(--input-height);
    padding: 0 var(--spacing-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-input);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
  }

  .param-hint {
    margin-top: var(--spacing-1);
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    line-height: var(--line-height-normal);
  }
</style>
