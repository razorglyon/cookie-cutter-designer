<script lang="ts">
  import {
    parameterError,
    parameterErrorField,
    params,
    updateParam
  } from '../../stores/cookieCutterStore';

  $: describedBy = $parameterErrorField === 'stampDepth'
    ? 'stampDepth-hint stampDepth-error'
    : 'stampDepth-hint';
</script>

<div class="param-control">
  <label for="stampDepth">Profondeur du tampon : {$params.stampDepth.toFixed(1)} mm</label>
  <input
    id="stampDepth"
    data-field="stampDepth"
    type="range"
    min="1"
    max="5"
    step="0.5"
    value={$params.stampDepth}
    aria-valuetext={`${$params.stampDepth.toFixed(1)} millimètres`}
    aria-invalid={$parameterErrorField === 'stampDepth'}
    aria-describedby={describedBy}
    on:input={(event) => updateParam('stampDepth', Number(event.currentTarget.value))}
  />
  <p id="stampDepth-hint" class="param-hint">1–5 mm · Hauteur du relief au-dessus de la base de 4 mm.</p>
  {#if $parameterErrorField === 'stampDepth' && $parameterError}
    <p id="stampDepth-error" class="param-error" role="alert">{$parameterError}</p>
  {/if}
</div>
