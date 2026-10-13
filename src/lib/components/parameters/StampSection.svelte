<script lang="ts">
  import { parameterError, parameterErrorField, params, updateParam } from '../../stores/cookieCutterStore';
  import type { DesignSessionStore } from '../../stores/designSessionStore';
  import type { DesignDocument, StampImprintMode } from '../../domain/designDocument';
  import { stampImprintMode, STAMP_IMPRINT_LIMITS } from '../../domain/stampImprint';

  export let session: DesignSessionStore | null = null;
  // Transient feedback only: the selected mode and depth belong to the session.
  let failure: { field: 'imprintMode' | 'stampDepth'; message: string } | null = null;
  let failedSnapshot: DesignDocument | null = null;
  const modes: readonly StampImprintMode[] = ['raised', 'recessed'];
  $: mode = stampImprintMode($session);
  $: if ($session !== failedSnapshot) failure = null;
  $: depthError = failure?.field === 'stampDepth' ? failure.message : $parameterErrorField === 'stampDepth' ? $parameterError : null;
  $: describedBy = depthError ? 'stampDepth-hint stampDepth-error' : 'stampDepth-hint';

  function reject(cause: unknown, field: 'imprintMode' | 'stampDepth'): void {
    failedSnapshot = session?.getDocument() ?? null;
    failure = { field, message: cause instanceof Error ? cause.message : 'Impossible de modifier le tampon.' };
  }
  function choose(imprintMode: StampImprintMode): void {
    if (!session) return;
    try { session.updateStampImprintMode(imprintMode); failure = null; }
    catch (cause) { reject(cause, 'imprintMode'); }
  }
  function updateDepth(stampDepth: number): void {
    if (session?.getDocument()?.kind !== 'stamp') { updateParam('stampDepth', stampDepth); return; }
    try { session.updateParameters('stamp', { stampDepth }); failure = null; }
    catch (cause) { reject(cause, 'stampDepth'); }
  }
</script>

<div class="param-control">
  <div class="imprint-choice" role="group" aria-label="Mode d’empreinte du tampon">
    {#each modes as imprintMode}
      <button
        type="button"
        data-imprint-mode={imprintMode}
        aria-pressed={mode === imprintMode}
        aria-describedby={failure?.field === 'imprintMode' ? 'stampImprint-hint stampImprint-error' : 'stampImprint-hint'}
        disabled={!session || $session?.kind !== 'stamp'}
        on:click={() => choose(imprintMode)}
      >{imprintMode === 'raised' ? 'Relief' : 'Creux'}</button>
    {/each}
  </div>
  <p id="stampImprint-hint" class="param-hint">Relief ajouté ou empreinte retirée de la face d’impression ; la poignée reste au dos.</p>
  {#if failure?.field === 'imprintMode'}
    <p id="stampImprint-error" class="param-error" role="alert">{failure.message}</p>
    {#if $params.stampDepth > STAMP_IMPRINT_LIMITS.maximumRecessDepthMm}
      <button type="button" class="reduce-depth" on:click={() => updateDepth(STAMP_IMPRINT_LIMITS.maximumRecessDepthMm)}>Réduire la profondeur à 3 mm</button>
    {/if}
  {/if}
  <label for="stampDepth">{mode === 'recessed' ? 'Profondeur du creux' : 'Profondeur du tampon'} : {$params.stampDepth.toFixed(1)} mm</label>
  <input
    id="stampDepth"
    data-field="stampDepth"
    type="range"
    min={mode === 'recessed' ? '0.1' : '1'}
    max={mode === 'recessed' ? '3' : '5'}
    step={mode === 'recessed' ? '0.1' : '0.5'}
    value={$params.stampDepth}
    aria-valuetext={`${$params.stampDepth.toFixed(1)} millimètres`}
    aria-invalid={Boolean(depthError)}
    aria-describedby={describedBy}
    on:input={(event) => updateDepth(Number(event.currentTarget.value))}
  />
  <p id="stampDepth-hint" class="param-hint">
    {#if mode === 'recessed'}
      0,1–3 mm · Base de 4 mm ; épaisseur conservée : {(STAMP_IMPRINT_LIMITS.baseThicknessMm - $params.stampDepth).toFixed(1)} mm (minimum 1 mm). À vérifier dans un slicer avant impression.
    {:else}
      1–5 mm · Hauteur du relief au-dessus de la base de 4 mm.
    {/if}
  </p>
  {#if depthError}
    <p id="stampDepth-error" class="param-error" role="alert">{depthError}</p>
  {/if}
</div>

<style>
  .imprint-choice { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--spacing-2); }
  .imprint-choice button, .reduce-depth { min-height: 44px; padding: var(--spacing-2) var(--spacing-3); border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--surface-input); color: var(--text-primary); }
  .imprint-choice button[aria-pressed="true"] { border-color: var(--color-primary-500); background: var(--surface-callout); color: var(--color-primary-600); font-weight: var(--font-weight-semibold); }
  .imprint-choice button:disabled { opacity: 0.5; cursor: not-allowed; }
  .reduce-depth { width: 100%; }
</style>
