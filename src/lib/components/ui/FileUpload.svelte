<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { IMAGE_ACCEPT, selectSingleImage } from '../../import/imageImport';

  const dispatch = createEventDispatcher<{ upload: File; reject: string }>();
  let dragOver = false;
  let fileInput: HTMLInputElement;

  function handleDragOver(e: DragEvent) { e.preventDefault(); dragOver = true; }
  function handleDragLeave(e: DragEvent) { e.preventDefault(); dragOver = false; }
  function select(files: ArrayLike<File>): void {
    try {
      const file = selectSingleImage(files);
      // Validation belongs to the common App pipeline, not this input surface.
      if (file) dispatch('upload', file);
    } catch (cause) {
      dispatch('reject', cause instanceof Error ? cause.message : 'Could not select image.');
    }
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault(); dragOver = false;
    if (e.dataTransfer?.files) select(e.dataTransfer.files);
  }
  function handleFileSelect(e: Event) {
    if (!(e.currentTarget instanceof HTMLInputElement)) return;
    const target = e.currentTarget;
    try { if (target.files) select(target.files); }
    finally { target.value = ''; }
  }
  function triggerFileInput() { fileInput.click(); }
</script>

<div
  class="upload-container"
  class:drag-over={dragOver}
  role="button"
  aria-label="Import image"
  tabindex="0"
  on:click={triggerFileInput}
  on:keydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerFileInput();
    }
  }}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  <input
    bind:this={fileInput}
    type="file"
    accept={IMAGE_ACCEPT}
    aria-label="Image file"
    on:click|stopPropagation
    on:change={handleFileSelect}
    style="display: none"
  />

  <div class="upload-content">
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>

    <h3>Upload Your Design</h3>
    <p>Drag and drop, paste an image, or click to browse</p>
    <p class="file-types">Supported: SVG, PNG, JPEG, WebP (max 10 MiB)</p>
  </div>
</div>

<style>
  .upload-container {
    width: 100%;
    min-height: 180px;
    border: 2px dashed var(--border-strong);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s ease;
    background-color: var(--surface-card);
  }

  .upload-container:hover {
    border-color: var(--color-primary-500);
    background-color: var(--surface-callout);
  }

  .upload-container.drag-over {
    border-color: var(--color-primary-600);
    background-color: var(--color-primary-100);
    transform: scale(1.02);
  }

  .upload-content {
    text-align: center;
    padding: 1rem;
    color: var(--text-secondary);
  }

  .upload-content svg {
    margin: 0 auto 1rem;
    color: #4299e1;
  }

  h3 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
    color: var(--text-primary);
  }

  p {
    margin: 0.25rem 0;
    font-size: 0.95rem;
  }

  .file-types {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-top: 0.75rem;
  }
</style>
