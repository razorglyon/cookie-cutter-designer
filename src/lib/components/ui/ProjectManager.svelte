<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ProjectData } from '../../types/Project';

  const dispatch = createEventDispatcher<{
    export: void;
    import: ProjectData;
    save: void;
  }>();

  let projectName = 'My Cookie Cutter';
  let fileInput: HTMLInputElement;

  function handleExportProject() {
    dispatch('export');
  }

  function handleImportProject(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string) as ProjectData;
          dispatch('import', data);
        } catch (error) {
          alert('Failed to import project. Invalid file format.');
        }
      };
      reader.readAsText(file);
    }
  }

  function handleSaveToLibrary() {
    dispatch('save');
  }

  function triggerImport() {
    fileInput.click();
  }
</script>

<div class="project-manager">
  <h3>Project</h3>

  <div class="project-name">
    <label for="project-name">Project Name</label>
    <input
      id="project-name"
      type="text"
      bind:value={projectName}
      placeholder="Enter project name..."
      maxlength="50"
    />
  </div>

  <div class="actions">
    <button class="action-btn save" on:click={handleSaveToLibrary}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
      Save to Library
    </button>

    <button class="action-btn export" on:click={handleExportProject}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Export Project
    </button>

    <button class="action-btn import" on:click={triggerImport}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      Import Project
    </button>

    <input
      bind:this={fileInput}
      type="file"
      accept=".json,.ccd.json"
      on:change={handleImportProject}
      style="display: none"
    />
  </div>

  <p class="hint">
    💾 Save to library for quick access<br/>
    📤 Export as .ccd.json file to share or backup
  </p>
</div>

<style>
  .project-manager {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
    color: #2d3748;
    font-weight: 600;
  }

  .project-name {
    margin-bottom: 1rem;
  }

  .project-name label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: #4a5568;
  }

  .project-name input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #cbd5e0;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .project-name input:focus {
    outline: none;
    border-color: #4299e1;
    box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    color: white;
  }

  .action-btn svg {
    flex-shrink: 0;
  }

  .action-btn.save {
    background: #805ad5;
  }

  .action-btn.save:hover {
    background: #6b46c1;
  }

  .action-btn.export {
    background: #3182ce;
  }

  .action-btn.export:hover {
    background: #2c5282;
  }

  .action-btn.import {
    background: #38a169;
  }

  .action-btn.import:hover {
    background: #2f855a;
  }

  .hint {
    margin: 0;
    padding: 0.75rem;
    background: #f7fafc;
    border-radius: 6px;
    font-size: 0.8rem;
    color: #718096;
    line-height: 1.6;
  }
</style>
