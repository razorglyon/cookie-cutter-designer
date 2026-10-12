<script lang="ts">
  import {
    parameterError,
    parameterErrorField,
    params,
    updateParam
  } from '../../stores/cookieCutterStore';
  import AdvancedSection from '../parameters/AdvancedSection.svelte';
  import CommonSizeSection from '../parameters/CommonSizeSection.svelte';
  import CutterSection from '../parameters/CutterSection.svelte';
  import HandleSection from '../parameters/HandleSection.svelte';
  import ParameterAccordion from '../parameters/ParameterAccordion.svelte';
  import StampSection from '../parameters/StampSection.svelte';
</script>

<section class="parameter-panel" aria-labelledby="parameter-panel-title">
  <h2 id="parameter-panel-title">Paramètres de l’emporte-pièce</h2>

  {#if $parameterError}
    <div
      id="parameter-error-summary"
      class="parameter-error"
      role={$parameterErrorField === null || $parameterErrorField === 'mode' ? 'alert' : undefined}
    >
      <strong>Échec de la mise à jour des paramètres</strong>
      <span>{$parameterError}</span>
    </div>
  {/if}

  <div
    class="design-type"
    class:invalid={$parameterErrorField === 'mode'}
    role="group"
    aria-label="Type de création"
    aria-describedby={$parameterErrorField === 'mode'
      ? 'mode-hint parameter-error-summary'
      : 'mode-hint'}
  >
    <button
      type="button"
      data-mode="cutter"
      class="mode-btn"
      class:active={$params.mode === 'cutter'}
      on:click={() => updateParam('mode', 'cutter')}
      aria-pressed={$params.mode === 'cutter'}
    >
      <span aria-hidden="true">✂️</span> Découpe
    </button>
    <button
      type="button"
      data-mode="stamp"
      class="mode-btn"
      class:active={$params.mode === 'stamp'}
      on:click={() => updateParam('mode', 'stamp')}
      aria-pressed={$params.mode === 'stamp'}
    >
      <span aria-hidden="true">🔖</span> Tampon
    </button>
  </div>
  <p id="mode-hint" class="mode-hint">
    {$params.mode === 'cutter' ? 'Paroi de découpe creuse avec poignée facultative.' : 'Relief surélevé relié à une base imprimable.'}
  </p>

  <ParameterAccordion id="common" title="Dimensions" description="Dimensions finales et limites de l’imprimante">
    <CommonSizeSection />
  </ParameterAccordion>

  {#if $params.mode === 'cutter'}
    <ParameterAccordion id="cutter" title="Découpe" description="Géométrie de la paroi et de la découpe">
      <CutterSection />
    </ParameterAccordion>
  {:else}
    <ParameterAccordion id="stamp" title="Tampon" description="Profondeur du relief et base imprimable">
      <StampSection />
    </ParameterAccordion>
  {/if}

  <ParameterAccordion id="handle" title="Poignée" description="Forme et hauteur de la poignée">
    <HandleSection />
  </ParameterAccordion>

  <ParameterAccordion id="advanced" title="Avancé" description="Fonctions de génération facultatives" open={false}>
    <AdvancedSection />
  </ParameterAccordion>
</section>

<style>
  .parameter-panel {
    width: 100%;
    min-width: 0;
    padding: var(--spacing-4);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: var(--surface-card);
    color: var(--text-secondary);
    box-shadow: var(--shadow-sm);
    overflow-wrap: anywhere;
  }

  h2 {
    margin: 0 0 var(--spacing-4);
    color: var(--text-primary);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
  }

  .parameter-error {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    margin-bottom: var(--spacing-3);
    padding: var(--spacing-3);
    border-left: 4px solid var(--color-error);
    border-radius: var(--radius-md);
    background: var(--color-error-light);
    color: var(--color-error);
    font-size: var(--font-size-sm);
  }

  .design-type {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-2);
  }

  .mode-btn {
    min-width: 0;
    min-height: 44px;
    padding: 0 var(--spacing-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-input);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .mode-btn:hover {
    border-color: var(--color-primary-400);
    background: var(--surface-callout);
  }

  .design-type.invalid .mode-btn {
    border-color: var(--color-error);
  }

  .mode-btn.active {
    border-color: var(--color-primary-500);
    background: var(--surface-callout);
    color: var(--color-primary-600);
    font-weight: var(--font-weight-semibold);
  }

  .mode-hint {
    margin: var(--spacing-1) 0 var(--spacing-3);
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    line-height: var(--line-height-normal);
  }

  @media (max-width: 480px) {
    .parameter-panel {
      padding: var(--spacing-3);
    }

    h2 {
      font-size: var(--font-size-lg);
      line-height: var(--line-height-tight);
    }
  }
</style>
