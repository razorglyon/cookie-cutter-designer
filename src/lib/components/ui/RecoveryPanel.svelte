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

<section class="recovery-panel" aria-label="Brouillons de récupération">
  <h3>Brouillons de récupération</h3>
  <p role="status">
    {#if $recovery.saving}Enregistrement du brouillon de récupération…
    {:else if $recovery.pending}Récupération en attente…
    {:else if $recovery.error}Récupération non enregistrée
    {:else if $recovery.savedAt}Récupération enregistrée à {$recovery.savedAt}
    {:else}Aucune sauvegarde de récupération confirmée pour cette session{/if}
  </p>
  {#if $recovery.error}<p role="alert">Impossible d’enregistrer la récupération : {$recovery.error.message} Réessayez ou exportez une sauvegarde du projet.</p>{/if}
  {#if actionError}<p role="alert">{actionError}</p>{/if}
  <div class="actions">
    <button type="button" data-recovery-refresh aria-label="Actualiser les brouillons de récupération" disabled={busy || $recovery.loading} on:click={onRefresh}>Actualiser les brouillons de récupération</button>
    <button type="button" disabled={$recovery.disposed || $recovery.saving} on:click={onFlush}>Réessayer l’enregistrement de récupération</button>
  </div>
  {#if $recovery.loading}<p role="status">Chargement des brouillons de récupération…</p>{/if}
  {#if $recovery.listError}<p role="alert">Impossible de charger les brouillons de récupération : {$recovery.listError.message}</p><button type="button" disabled={busy || $recovery.loading} on:click={onRefresh}>Réessayer le chargement des brouillons de récupération</button>{/if}
  {#if $recovery.loaded && !$recovery.drafts.length}<p>Aucun brouillon de récupération dans ce navigateur.</p>{/if}
  <ul>
    {#each $recovery.drafts as draft (draft.draftId)}
      <li data-draft-id={draft.draftId}>
        <strong>{draft.document.name}</strong>
        <time datetime={draft.savedAt}>{draft.savedAt}</time>
        <div class="actions">
          <button type="button" data-recovery-resume aria-label={`Reprendre le brouillon ${draft.document.name}, ${draft.savedAt}`} disabled={busy || $recovery.disposed} on:click={() => onResume(draft)}>Reprendre le brouillon</button>
          <button type="button" data-recovery-delete aria-label={`Supprimer le brouillon ${draft.document.name}, ${draft.savedAt}`} disabled={busy || $recovery.disposed} on:click={() => onDelete(draft)}>Supprimer le brouillon</button>
        </div>
      </li>
    {/each}
  </ul>
  <p class="hint">Les brouillons de récupération sont distincts des projets enregistrés et restent disponibles après l’enregistrement du projet. Ils restent dans ce navigateur et sur ce site. Exportez un fichier projet .ccd.json pour une sauvegarde transférable. Fermer ou forcer l’arrêt du navigateur peut interrompre un enregistrement en attente.</p>
</section>

<style>
  .recovery-panel { background: var(--surface-card); color: var(--text-primary); padding: 1rem; margin-bottom: 1rem; border-radius: 8px; box-shadow: var(--shadow-sm); }
  h3 { margin: 0 0 1rem; font-size: 1rem; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  button { flex: 1 1 9rem; min-width: 0; min-height: 44px; padding: 0.65rem; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface-muted); color: var(--text-primary); font: inherit; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  button:focus-visible { outline: 3px solid var(--color-primary-500); outline-offset: 2px; }
  ul { padding: 0; list-style: none; }
  li { border-top: 1px solid var(--border-strong); padding: 0.75rem 0; }
  strong, time { display: block; overflow-wrap: anywhere; margin-bottom: 0.5rem; }
  [role='alert'] { color: var(--text-error); overflow-wrap: anywhere; }
  .hint { font-size: 0.85rem; line-height: 1.6; }
</style>
