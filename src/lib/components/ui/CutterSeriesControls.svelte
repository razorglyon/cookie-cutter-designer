<script lang="ts">
  import type { DesignDocument, CutterSeriesLayout } from '../../domain/designDocument';
  import { parseMultiCutterDocument } from '../../domain/documentValidation';
  import { DEFAULT_CUTTER_SERIES_LAYOUT } from '../../domain/cutterSeries';
  export let currentDocument: DesignDocument | null;
  export let onUpdateSeries: (layout: CutterSeriesLayout) => void;
  export let onSingleCutter: (() => void) | undefined;
  let copies = 4, columns = 2, spacingMm = 5;
  let seriesError: string | null = null;
  let layoutDocument: DesignDocument | null = null;
  $: if (currentDocument !== layoutDocument) {
    const layout = currentDocument?.schemaVersion === 3 ? currentDocument.layout : DEFAULT_CUTTER_SERIES_LAYOUT;
    copies = layout.copies; columns = layout.columns; spacingMm = layout.spacingMm;
    layoutDocument = currentDocument; seriesError = null;
  }
  function applySeries(): void {
    const current = currentDocument;
    if (!current || (current.kind !== 'cutter' && current.kind !== 'multi-cutter')) return;
    try {
      const parsed = parseMultiCutterDocument({ ...current, schemaVersion: 3, kind: 'multi-cutter',
        bridges: current.schemaVersion === 1 ? [] : current.bridges, layout: { copies, columns, spacingMm } });
      onUpdateSeries(parsed.layout); seriesError = null;
    } catch (cause) { seriesError = cause instanceof Error ? cause.message : 'Réglages de série invalides.'; }
  }
</script>
<section class="cutter-series" aria-labelledby="series-title">
  <h3 id="series-title">Série enregistrable</h3>
  <p id="series-help">Copies séparées du même Cutter, sans connexion entre elles. Dessin, paroi, poignée et ponts conservés. Réglez puis appliquez ; ouvrir ce panneau ne modifie rien.</p>
  {#if currentDocument?.kind === 'cutter' || currentDocument?.kind === 'multi-cutter'}
    <div class="series-fields">
      <label for="series-copies">Copies (1–24)<input id="series-copies" type="number" min="1" max="24" step="1" bind:value={copies} aria-invalid={seriesError !== null} aria-describedby="series-help series-error" /></label>
      <label for="series-columns">Colonnes<input id="series-columns" type="number" min="1" max={copies} step="1" bind:value={columns} aria-invalid={seriesError !== null} aria-describedby="series-help series-error" /></label>
      <label for="series-spacing">Espacement (mm)<input id="series-spacing" type="number" min="0.5" max="40" step="0.5" bind:value={spacingMm} aria-invalid={seriesError !== null} aria-describedby="series-help series-error" /></label>
    </div>
    <p>Lignes calculées : {Number.isFinite(copies / columns) ? Math.ceil(copies / columns) : '—'}. Plateau : {currentDocument.parameters.buildPlateSize} × {currentDocument.parameters.buildPlateSize} mm.</p>
    <p id="series-error" role={seriesError ? 'alert' : undefined}>{seriesError ?? ''}</p>
    <button type="button" data-apply-series on:click={applySeries}>{currentDocument.kind === 'multi-cutter' ? 'Appliquer la série' : 'Créer la série'}</button>
    {#if currentDocument.kind === 'multi-cutter'}
      <p role="status" data-series-active>{currentDocument.layout.copies} copies actives · {currentDocument.layout.columns} colonnes · {currentDocument.layout.spacingMm} mm. Sauvegardez dans Projets locaux ; exportez la géométrie lorsque la génération est valide.</p>
      <button type="button" data-single-cutter on:click={() => onSingleCutter?.()}>Revenir au Cutter unique</button>
    {/if}
    <p>Limite : 500 000 triangles. Plateau trop petit ou Cutter incomplet : export bloqué, sans réparation automatique.</p>
  {:else}<p role="status">Ouvrez ou créez un Cutter pour préparer une série. Stamp n’est pas pris en charge dans cette tranche.</p>{/if}
</section>
<style>
  .cutter-series { min-width: 0; padding: var(--spacing-4); border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--surface-card); color: var(--text-primary); }
  h3 { margin: 0 0 var(--spacing-3); }
  p { font-size: var(--font-size-sm); line-height: 1.5; }
  .series-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 7rem), 1fr)); gap: var(--spacing-3); }
  label { display: flex; flex-direction: column; min-width: 0; gap: var(--spacing-2); color: var(--text-secondary); font-size: var(--font-size-sm); }
  input { width: 100%; min-width: 0; box-sizing: border-box; min-height: 44px; padding: var(--spacing-2); border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--surface-input); color: var(--text-primary); }
  button { min-height: 44px; padding: var(--spacing-2) var(--spacing-3); border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--surface-input); color: var(--text-primary); margin: var(--spacing-2) 0; }
  button:focus-visible, input:focus-visible { outline: 3px solid var(--color-primary-500); outline-offset: 2px; }
  #series-error { color: var(--color-error); }
</style>
