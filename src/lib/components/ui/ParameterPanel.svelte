<script lang="ts">
  import { params, updateParam } from '../../stores/cookieCutterStore';
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

  <!-- Mode Selection -->
  <div class="param-group">
    <h3>Mode</h3>
    <div class="param-control">
      <label>Design Type</label>
      <div class="mode-selector">
        <button
          class="mode-btn"
          class:active={$params.mode === 'cutter'}
          on:click={() => updateParam('mode', 'cutter')}
        >
          ✂️ Cutter
        </button>
        <button
          class="mode-btn"
          class:active={$params.mode === 'stamp'}
          on:click={() => updateParam('mode', 'stamp')}
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
          Stamp Depth: {$params.stampDepth.toFixed(1)}mm
        </label>
        <input
          id="stampDepth"
          type="range"
          min="1.0"
          max="5.0"
          step="0.5"
          value={$params.stampDepth}
          on:input={(e) => updateParam('stampDepth', parseFloat(e.currentTarget.value))}
        />
        <div class="param-hint">Depth of the raised relief</div>
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
        Wall Thickness: {$params.wallThickness.toFixed(1)}mm
      </label>
      <input
        id="wallThickness"
        type="range"
        min="0.6"
        max="2.0"
        step="0.1"
        value={$params.wallThickness}
        on:input={(e) => updateParam('wallThickness', parseFloat(e.currentTarget.value))}
      />
      <div class="param-hint">Recommended: 0.8-1.2mm</div>
    </div>

    <div class="param-control">
      <label for="cuttingHeight">
        Cutting Height: {$params.cuttingHeight.toFixed(0)}mm
      </label>
      <input
        id="cuttingHeight"
        type="range"
        min="8"
        max="25"
        step="1"
        value={$params.cuttingHeight}
        on:input={(e) => updateParam('cuttingHeight', parseFloat(e.currentTarget.value))}
      />
      <div class="param-hint">Recommended: 10-15mm</div>
    </div>

    <div class="param-control">
      <label for="totalHeight">
        Total Height: {$params.totalHeight.toFixed(0)}mm
      </label>
      <input
        id="totalHeight"
        type="range"
        min="15"
        max="40"
        step="1"
        value={$params.totalHeight}
        on:input={(e) => updateParam('totalHeight', parseFloat(e.currentTarget.value))}
      />
      <div class="param-hint">Recommended: 15-25mm</div>
    </div>

    <div class="param-control">
      <label for="taperAngle">
        Taper Angle: {$params.taperAngle.toFixed(0)}°
      </label>
      <input
        id="taperAngle"
        type="range"
        min="0"
        max="15"
        step="1"
        value={$params.taperAngle}
        on:input={(e) => updateParam('taperAngle', parseFloat(e.currentTarget.value))}
      />
      <div class="param-hint">Recommended: 5-10°</div>
    </div>

    <div class="param-control">
      <label for="scale">
        Scale: {($params.scale * 100).toFixed(0)}%
      </label>
      <input
        id="scale"
        type="range"
        min="0.5"
        max="3.0"
        step="0.1"
        value={$params.scale}
        on:input={(e) => updateParam('scale', parseFloat(e.currentTarget.value))}
      />
    </div>

    <div class="param-control">
      <label for="buildPlateSize">
        Build Plate Size: {$params.buildPlateSize.toFixed(0)}mm ({($params.buildPlateSize / 10).toFixed(0)}cm)
      </label>
      <input
        id="buildPlateSize"
        type="range"
        min="100"
        max="300"
        step="10"
        value={$params.buildPlateSize}
        on:input={(e) => updateParam('buildPlateSize', parseFloat(e.currentTarget.value))}
      />
      <div class="param-hint">Common sizes: 150mm, 200mm, 220mm, 250mm</div>
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
          Handle Height: {$params.handleHeight.toFixed(0)}mm
        </label>
        <input
          id="handleHeight"
          type="range"
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

    <div class="param-control checkbox">
      <input
        id="enableEmbossing"
        type="checkbox"
        checked={$params.enableEmbossing}
        on:change={(e) => updateParam('enableEmbossing', e.currentTarget.checked)}
      />
      <label for="enableEmbossing">Enable Embossing/Stamp</label>
    </div>

    {#if $params.enableEmbossing}
      <div class="param-control">
        <label for="embossDepth">
          Emboss Depth: {$params.embossDepth.toFixed(1)}mm
        </label>
        <input
          id="embossDepth"
          type="range"
          min="1.0"
          max="5.0"
          step="0.5"
          value={$params.embossDepth}
          on:input={(e) => updateParam('embossDepth', parseFloat(e.currentTarget.value))}
        />
        <div class="param-hint">Typical: 2-3mm</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .parameter-panel {
    padding: 1rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .mode-selector {
    display: flex;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }

  .mode-btn {
    flex: 1;
    padding: 0.75rem 1rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    color: #4a5568;
    cursor: pointer;
    transition: all 0.2s;
  }

  .mode-btn:hover {
    border-color: #cbd5e0;
    background: #f7fafc;
  }

  .mode-btn.active {
    border-color: #4299e1;
    background: #ebf8ff;
    color: #2c5282;
    font-weight: 600;
  }

  h2 {
    margin: 0 0 1rem;
    font-size: 1.25rem;
    color: #2d3748;
    font-weight: 600;
  }

  h3 {
    margin: 0.75rem 0 0.5rem;
    font-size: 1rem;
    color: #4a5568;
    font-weight: 600;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 0.4rem;
  }

  .param-group {
    margin-bottom: 1rem;
  }

  .param-group:first-of-type h3 {
    margin-top: 0;
  }

  .param-control {
    margin-bottom: 0.9rem;
  }

  .param-control.checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .param-control.checkbox input[type="checkbox"] {
    width: auto;
    margin: 0;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #4a5568;
    font-size: 0.95rem;
  }

  .param-control.checkbox label {
    margin: 0;
  }

  input[type="range"] {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: #e2e8f0;
    outline: none;
    -webkit-appearance: none;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #4299e1;
    cursor: pointer;
    transition: background 0.2s;
  }

  input[type="range"]::-webkit-slider-thumb:hover {
    background: #3182ce;
  }

  input[type="range"]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #4299e1;
    cursor: pointer;
    border: none;
    transition: background 0.2s;
  }

  input[type="range"]::-moz-range-thumb:hover {
    background: #3182ce;
  }

  select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #cbd5e0;
    border-radius: 6px;
    background: white;
    font-size: 0.95rem;
    color: #2d3748;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  select:hover {
    border-color: #a0aec0;
  }

  select:focus {
    outline: none;
    border-color: #4299e1;
    box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
  }

  .param-hint {
    margin-top: 0.25rem;
    font-size: 0.8rem;
    color: #718096;
    font-style: italic;
  }
</style>
