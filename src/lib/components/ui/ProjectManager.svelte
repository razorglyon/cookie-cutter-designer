<script lang="ts">
  import type { DesignSessionStore } from '../../stores/designSessionStore';
  import type { ProjectWorkflow } from '../../projects/projectWorkflow';

  export let session: DesignSessionStore;
  export let workflow: ProjectWorkflow;
  export let unavailableReason: string | null = null;

  let fileInput: HTMLInputElement;
  let nameDraft = '';
  let nameError: string | null = null;
  let observedName: string | undefined;
  let observedEpoch = -1;
  // A draft is not another document name: only session.rename commits it.
  $: synchronizeName($session?.name, $workflow.sessionEpoch);
  $: transitionBusy = $workflow.disposed || $workflow.saving || $workflow.pending !== null;
  $: documentUnavailable = !$session || unavailableReason !== null || $workflow.disposed;
  $: saveBlocked = documentUnavailable || transitionBusy || nameError !== null;

  function synchronizeName(name: string | undefined, epoch: number): void {
    if (name !== observedName || epoch !== observedEpoch) {
      observedName = name;
      observedEpoch = epoch;
      nameDraft = name ?? '';
      nameError = null;
    }
  }
  function rename(event: Event): void {
    nameDraft = (event.currentTarget as HTMLInputElement).value;
    try { session.rename(nameDraft); nameError = null; }
    catch (cause) { nameError = cause instanceof Error ? cause.message : String(cause); }
  }
  async function save(): Promise<void> {
    if (!saveBlocked && await workflow.save()) await workflow.list();
  }
  async function importFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    try { if (file && !transitionBusy) await workflow.import(file); }
    finally { input.value = ''; }
  }
</script>

<section class="project-manager" aria-label="Projet">
  <h3>Projet</h3>
  <label for="project-name">Nom du projet</label>
  <input id="project-name" type="text" value={nameDraft} on:input={rename}
    disabled={!$session || $workflow.disposed}
    aria-invalid={nameError !== null} aria-describedby={nameError ? 'project-name-error' : undefined} />
  {#if nameError}<p id="project-name-error" role="alert">{nameError}</p>{/if}
  <p role="status">{#if $workflow.saving}Enregistrement du projet…{:else if !$session}Aucun projet actif{:else if $workflow.dirty}Modifications non enregistrées{:else}Enregistré localement{/if}</p>
  {#if unavailableReason !== null}<p role="status">{unavailableReason}</p>{/if}
  <div class="actions">
    <button type="button" disabled={saveBlocked} on:click={save}>Enregistrer le projet</button>
    <button type="button" disabled={documentUnavailable || ($workflow.pending !== null && $workflow.pending !== 'save')}
      on:click={() => workflow.export()}>Exporter le projet</button>
    <button type="button" disabled={transitionBusy} on:click={() => fileInput.click()}>Importer un fichier projet</button>
    <input bind:this={fileInput} type="file" accept=".ccd.json,.json" aria-label="Fichier projet"
      disabled={transitionBusy} on:change={importFile} hidden />
  </div>
  {#if $workflow.saveError}<p role="alert">Impossible d’enregistrer le projet : {$workflow.saveError.message} Réessayez ou exportez une sauvegarde du fichier.</p>{/if}
  {#if $workflow.error && $workflow.error !== $workflow.saveError}<p role="alert">{$workflow.error.message}</p>{/if}
  {#if $workflow.warnings.length}
    <div role="status"><p>Avertissements lors de l’import</p><ul>{#each $workflow.warnings as warning}<li>{warning}</li>{/each}</ul></div>
  {/if}
  <p class="hint">Les projets locaux restent dans ce navigateur et sur ce site. Exportez un fichier .ccd.json pour disposer d’une sauvegarde transférable ou changer de navigateur.</p>
</section>

<style>
  .project-manager { background: var(--surface-card); color: var(--text-primary); padding: 1rem; border-radius: 8px; box-shadow: var(--shadow-sm); }
  h3 { margin: 0 0 1rem; font-size: 1rem; }
  label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
  input[type='text'] { box-sizing: border-box; width: 100%; min-height: 44px; padding: 0.5rem; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface-input); color: var(--text-primary); }
  .actions { display: flex; flex-direction: column; gap: 0.5rem; }
  button { min-height: 44px; padding: 0.65rem; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface-muted); color: var(--text-primary); font: inherit; cursor: pointer; }
  button:first-child { background: var(--color-primary-700); border-color: var(--color-primary-700); color: var(--text-on-brand); }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  button:focus-visible, input:focus-visible { outline: 3px solid var(--color-primary-500); outline-offset: 2px; }
  [role='alert'] { color: var(--text-error); overflow-wrap: anywhere; }
  .hint { font-size: 0.85rem; line-height: 1.6; }
  li { overflow-wrap: anywhere; }
</style>
