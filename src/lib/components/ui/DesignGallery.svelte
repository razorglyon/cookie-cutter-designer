<script lang="ts">
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { loadProjectsFromStorage, deleteProjectFromStorage } from '../../utils/projectManager';
  import type { ProjectData } from '../../types/Project';

  const dispatch = createEventDispatcher<{
    load: ProjectData;
  }>();

  let projects: ProjectData[] = [];
  let showGallery = false;

  onMount(() => {
    loadProjects();
  });

  function loadProjects() {
    projects = loadProjectsFromStorage();
  }

  function handleLoadProject(project: ProjectData) {
    dispatch('load', project);
    showGallery = false;
  }

  function handleDeleteProject(project: ProjectData, event: Event) {
    event.stopPropagation();

    if (confirm(`Delete project "${project.name}"?`)) {
      deleteProjectFromStorage(project);
      loadProjects();
    }
  }

  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="gallery-container">
  <button class="toggle-gallery" on:click={() => showGallery = !showGallery}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
    Design Library ({projects.length})
  </button>

  {#if showGallery}
    <div class="gallery-panel">
      <div class="gallery-header">
        <h3>Saved Designs</h3>
        <button class="close-btn" on:click={() => showGallery = false}>✕</button>
      </div>

      {#if projects.length === 0}
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          <p>No saved designs yet</p>
          <span>Create a design and save it to your library</span>
        </div>
      {:else}
        <div class="projects-grid">
          {#each projects as project}
            <div
              class="project-card"
              role="button"
              tabindex="0"
              on:click={() => handleLoadProject(project)}
              on:keydown={(e) => e.key === 'Enter' && handleLoadProject(project)}
            >
              <div class="project-thumbnail">
                {#if project.thumbnail}
                  <img src={project.thumbnail} alt={project.name} />
                {:else}
                  <div class="placeholder">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v6l4 2" />
                    </svg>
                  </div>
                {/if}
              </div>

              <div class="project-info">
                <h4>{project.name}</h4>
                <p class="project-date">{formatDate(project.modifiedAt)}</p>
                {#if project.metadata?.originalFileName}
                  <p class="project-meta">{project.metadata.originalFileName}</p>
                {/if}
              </div>

              <button
                class="delete-btn"
                on:click={(e) => handleDeleteProject(project, e)}
                title="Delete project"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .gallery-container {
    position: relative;
  }

  .toggle-gallery {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    color: #4a5568;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .toggle-gallery:hover {
    border-color: #cbd5e0;
    background: #f7fafc;
  }

  .gallery-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 800px;
    max-height: 80vh;
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  .gallery-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #e2e8f0;
  }

  .gallery-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #2d3748;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f7fafc;
    border: none;
    border-radius: 6px;
    font-size: 1.25rem;
    color: #718096;
    cursor: pointer;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: #edf2f7;
    color: #2d3748;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    color: #a0aec0;
    text-align: center;
  }

  .empty-state svg {
    margin-bottom: 1rem;
  }

  .empty-state p {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
    color: #718096;
    font-weight: 500;
  }

  .empty-state span {
    font-size: 0.9rem;
  }

  .projects-grid {
    padding: 1.5rem;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  .project-card {
    position: relative;
    background: #f7fafc;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    padding: 1rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .project-card:hover {
    border-color: #4299e1;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .project-thumbnail {
    width: 100%;
    aspect-ratio: 1;
    background: white;
    border-radius: 6px;
    margin-bottom: 0.75rem;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .project-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder {
    color: #cbd5e0;
  }

  .project-info h4 {
    margin: 0 0 0.25rem;
    font-size: 0.95rem;
    color: #2d3748;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-date {
    margin: 0 0 0.25rem;
    font-size: 0.75rem;
    color: #a0aec0;
  }

  .project-meta {
    margin: 0;
    font-size: 0.7rem;
    color: #cbd5e0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .delete-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    color: #e53e3e;
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s;
  }

  .project-card:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    background: #fff5f5;
    border-color: #fc8181;
  }
</style>
