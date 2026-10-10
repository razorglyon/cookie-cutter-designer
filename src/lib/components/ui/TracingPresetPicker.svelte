<script lang="ts">
  import { DEFAULT_TRACING_PRESET, TRACING_PRESETS, type TracingPresetId } from '../../import/tracingPresets';
  export let preset: TracingPresetId = DEFAULT_TRACING_PRESET;
  export let disabled = false;
</script>
<section aria-label="Vectorization settings">
  <label>Préréglage de vectorisation
    <select aria-label="Vectorization preset" value={preset} on:change={event => preset = event.currentTarget.value as TracingPresetId} {disabled}>
      {#each TRACING_PRESETS as option}<option value={option.id}>{option.label}</option>{/each}
    </select>
  </label>
  <p>{TRACING_PRESETS.find(option => option.id === preset)?.description}</p>
  <p>Images raster uniquement. Le SVG importé reste inchangé. Le choix ne modifie pas le dessin existant sans action explicite.</p>
</section>
<style>
  section { margin-bottom: var(--spacing-4); }
  label { display: grid; gap: var(--spacing-2); }
  select { width: 100%; min-height: 44px; color: var(--text-primary); background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; }
  p { color: var(--text-muted); font-size: var(--font-size-sm); }
</style>
