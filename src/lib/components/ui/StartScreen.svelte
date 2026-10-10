<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FileUpload from './FileUpload.svelte';
  const dispatch = createEventDispatcher<{ upload: File; reject: string; shapes: void; projects: void }>();
</script>

<section class="start-screen" aria-label="Start a design">
  <h2>Start a design</h2>
  <p>Import an image, choose a shape, or resume a project saved in this browser.</p>
  <FileUpload on:upload on:reject />
  <div class="start-actions">
    <button type="button" class="btn" on:click={() => dispatch('shapes')}>Shapes</button>
    <button type="button" class="btn" on:click={() => dispatch('projects')}>Resume a project</button>
  </div>
</section>

<style>
  .start-screen { display: flex; flex-direction: column; gap: var(--spacing-3); min-width: 0; }
  h2 { margin: 0; color: var(--text-primary); font-size: var(--font-size-xl); }
  p { margin: 0; color: var(--text-muted); font-size: var(--font-size-sm); }
  .start-actions { display: flex; flex-wrap: wrap; gap: var(--spacing-2); }
  button { flex: 1 1 8rem; min-height: 44px; white-space: normal; }
</style>
