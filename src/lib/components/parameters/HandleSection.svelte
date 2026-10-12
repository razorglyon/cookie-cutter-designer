<script lang="ts">
  import {
    parameterError,
    parameterErrorField,
    params,
    updateParam
  } from '../../stores/cookieCutterStore';
  import type { HandleStyle } from '../../types/CookieCutter';

  const handleStyles: { value: HandleStyle; label: string }[] = [
    { value: 'none', label: 'Sans poignée' },
    { value: 'flat', label: 'Dessus plat' },
    { value: 'round', label: 'Arrondie' },
    { value: 'chamfered', label: 'Chanfreinée' },
    { value: 'rectangular', label: 'Rectangulaire' }
  ];

  const describedBy = (field: string) =>
    $parameterErrorField === field ? `${field}-hint ${field}-error` : `${field}-hint`;
</script>

<div class="param-control">
  <label for="handleStyle">Forme de la poignée</label>
  <select id="handleStyle" data-field="handleStyle" value={$params.handleStyle}
    aria-invalid={$parameterErrorField === 'handleStyle'} aria-describedby={describedBy('handleStyle')}
    on:change={(event) => updateParam('handleStyle', event.currentTarget.value as HandleStyle)}>
    {#each handleStyles as style}<option value={style.value}>{style.label}</option>{/each}
  </select>
  <p id="handleStyle-hint" class="param-hint">Choisissez « Sans poignée » pour un outil imprimable plus compact.</p>
  {#if $parameterErrorField === 'handleStyle' && $parameterError}<p id="handleStyle-error" class="param-error" role="alert">{$parameterError}</p>{/if}
</div>

{#if $params.handleStyle !== 'none'}
  <div class="param-control">
    <label for="handleHeight">Hauteur de la poignée : {$params.handleHeight.toFixed(0)} mm</label>
    <input id="handleHeight" data-field="handleHeight" type="range" min="3" max="15" step="1"
      value={$params.handleHeight} aria-valuetext={`${$params.handleHeight.toFixed(0)} millimètres`}
      aria-invalid={$parameterErrorField === 'handleHeight'} aria-describedby={describedBy('handleHeight')}
      on:input={(event) => updateParam('handleHeight', Number(event.currentTarget.value))} />
    <p id="handleHeight-hint" class="param-hint">3–15 mm · Ajoutée au-dessus de la paroi de découpe.</p>
    {#if $parameterErrorField === 'handleHeight' && $parameterError}<p id="handleHeight-error" class="param-error" role="alert">{$parameterError}</p>{/if}
  </div>
{/if}
