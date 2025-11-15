<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ upload: File }>();

  let dragOver = false;
  let fileInput: HTMLInputElement;

  const acceptedTypes = [
    'image/svg+xml',
    'image/png',
    'image/jpeg',
    'image/jpg',
    '.svg'
  ];

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }

  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }

  function handleFile(file: File) {
    // Validate file type
    const isValid = acceptedTypes.some(type => {
      if (type.startsWith('.')) {
        return file.name.toLowerCase().endsWith(type);
      }
      return file.type === type;
    });

    if (!isValid) {
      alert('Please upload a valid SVG, PNG, or JPG file');
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File size must be less than 10MB');
      return;
    }

    dispatch('upload', file);
  }

  function triggerFileInput() {
    fileInput.click();
  }
</script>

<div
  class="upload-container"
  class:drag-over={dragOver}
  role="button"
  tabindex="0"
  on:click={triggerFileInput}
  on:keydown={(e) => e.key === 'Enter' && triggerFileInput()}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  <input
    bind:this={fileInput}
    type="file"
    accept=".svg,image/svg+xml,image/png,image/jpeg"
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
    <p>Drag and drop or click to browse</p>
    <p class="file-types">Supported: SVG, PNG, JPG (max 10MB)</p>
  </div>
</div>

<style>
  .upload-container {
    width: 100%;
    min-height: 180px;
    border: 2px dashed #cbd5e0;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s ease;
    background-color: #f7fafc;
  }

  .upload-container:hover {
    border-color: #4299e1;
    background-color: #ebf8ff;
  }

  .upload-container.drag-over {
    border-color: #3182ce;
    background-color: #bee3f8;
    transform: scale(1.02);
  }

  .upload-content {
    text-align: center;
    padding: 1rem;
    color: #4a5568;
  }

  .upload-content svg {
    margin: 0 auto 1rem;
    color: #4299e1;
  }

  h3 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
    color: #2d3748;
  }

  p {
    margin: 0.25rem 0;
    font-size: 0.95rem;
  }

  .file-types {
    font-size: 0.85rem;
    color: #718096;
    margin-top: 0.75rem;
  }
</style>
