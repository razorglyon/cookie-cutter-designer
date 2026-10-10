<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { ProjectRecoveryState } from '../../projects/projectRecovery';
  import type { ProjectRecoveryEnvelope } from '../../projects/projectRecoveryStorage';
  export let recovery: Readable<ProjectRecoveryState>;
  export let busy = false;
  export let actionError: string | null = null;
  export let onRefresh: () => void;
  export let onFlush: () => void;
  export let onResume: (draft: ProjectRecoveryEnvelope) => void;
  export let onDelete: (draft: ProjectRecoveryEnvelope) => void;
</script>

<section class="recovery-panel" aria-label="Recovery drafts">
  <h3>Recovery drafts</h3>
  <p role="status">
    {#if $recovery.saving}Saving recovery draft…
    {:else if $recovery.pending}Recovery pending…
    {:else if $recovery.error}Recovery not saved
    {:else if $recovery.savedAt}Recovery saved at {$recovery.savedAt}
    {:else}No recovery save confirmed for this session{/if}
  </p>
  {#if $recovery.error}<p role="alert">Could not save recovery: {$recovery.error.message} Retry or export a project file backup.</p>{/if}
  {#if actionError}<p role="alert">{actionError}</p>{/if}
  <div class="actions">
    <button type="button" data-recovery-refresh aria-label="Refresh recovery drafts" disabled={busy || $recovery.loading} on:click={onRefresh}>Refresh recovery drafts</button>
    <button type="button" disabled={$recovery.disposed || $recovery.saving} on:click={onFlush}>Retry recovery save</button>
  </div>
  {#if $recovery.loading}<p role="status">Loading recovery drafts…</p>{/if}
  {#if $recovery.listError}<p role="alert">Could not load recovery drafts: {$recovery.listError.message}</p><button type="button" disabled={busy || $recovery.loading} on:click={onRefresh}>Retry loading recovery drafts</button>{/if}
  {#if $recovery.loaded && !$recovery.drafts.length}<p>No recovery drafts in this browser.</p>{/if}
  <ul>
    {#each $recovery.drafts as draft (draft.draftId)}
      <li data-draft-id={draft.draftId}>
        <strong>{draft.document.name}</strong>
        <time datetime={draft.savedAt}>{draft.savedAt}</time>
        <div class="actions">
          <button type="button" data-recovery-resume aria-label={`Resume draft ${draft.document.name}, ${draft.savedAt}`} disabled={busy || $recovery.disposed} on:click={() => onResume(draft)}>Resume draft</button>
          <button type="button" data-recovery-delete aria-label={`Delete draft ${draft.document.name}, ${draft.savedAt}`} disabled={busy || $recovery.disposed} on:click={() => onDelete(draft)}>Delete draft</button>
        </div>
      </li>
    {/each}
  </ul>
  <p class="hint">Recovery drafts are separate from saved projects and remain after Save project. They stay in this browser and origin (site address). Export a .ccd.json project file for a portable backup. Closing or force-stopping the browser can interrupt a pending save.</p>
</section>

<style>
  .recovery-panel { background: white; color: #2d3748; padding: 1rem; margin-bottom: 1rem; border-radius: 8px; box-shadow: 0 2px 8px rgb(0 0 0 / 10%); }
  h3 { margin: 0 0 1rem; font-size: 1rem; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  button { flex: 1 1 9rem; min-width: 0; min-height: 44px; padding: 0.65rem; border: 1px solid #718096; border-radius: 6px; background: #f7fafc; color: #2d3748; font: inherit; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  button:focus-visible { outline: 3px solid #3182ce; outline-offset: 2px; }
  ul { padding: 0; list-style: none; }
  li { border-top: 1px solid #cbd5e0; padding: 0.75rem 0; }
  strong, time { display: block; overflow-wrap: anywhere; margin-bottom: 0.5rem; }
  [role='alert'] { color: #9b2c2c; overflow-wrap: anywhere; }
  .hint { font-size: 0.85rem; line-height: 1.6; }
</style>
