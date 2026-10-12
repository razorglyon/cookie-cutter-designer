<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FileUpload from './FileUpload.svelte';
  const dispatch = createEventDispatcher<{ upload: File; reject: string; shapes: void; projects: void }>();
</script>

<section class="start-screen" aria-label="Commencer un dessin">
  <h2>Commencer un dessin</h2>
  <div class="start-actions">
    <button type="button" class="btn" on:click={() => dispatch('shapes')}>Formes</button>
    <button type="button" class="btn" on:click={() => dispatch('projects')}>Reprendre un projet</button>
  </div>
  <FileUpload on:upload on:reject />
  <p>Importez une image, choisissez une forme ou reprenez un projet enregistré dans ce navigateur.</p>
</section>

<style>
  .start-screen { display: flex; flex-direction: column; gap: var(--spacing-3); min-width: 0; }
  h2 { margin: 0; color: var(--text-primary); font-size: var(--font-size-xl); }
  p { margin: 0; color: var(--text-muted); font-size: var(--font-size-sm); }
  .start-actions { display: flex; flex-wrap: wrap; gap: var(--spacing-2); }
  button { flex: 1 1 8rem; min-height: 44px; white-space: normal; }
  @media (max-width: 768px) {
    .start-screen { gap: var(--spacing-2); }
    .start-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .start-screen :global(.upload-container) { min-height: 122px; }
    .start-screen :global(.upload-content) { padding: var(--spacing-2); }
    .start-screen :global(.upload-content svg) { width: 28px; height: 28px; margin-bottom: var(--spacing-1); }
    .start-screen :global(.upload-content h3) { font-size: var(--font-size-base); margin-bottom: var(--spacing-1); }
    .start-screen :global(.upload-content p) { margin: 0; }
  }
  @media (max-width: 768px) and (max-height: 480px) {
    .start-screen :global(.upload-container) { min-height: 96px; }
    .start-screen :global(.upload-content svg) { display: none; }
  }
</style>
