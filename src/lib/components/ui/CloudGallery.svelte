<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    getGalleryDesigns,
    getUserDesigns,
    saveDesignToGallery,
    publishToGallery,
    deleteDesign,
    likeDesign,
    filterDesigns,
    getPopularTags,
    type SavedDesign,
    type GalleryFilter
  } from '../../utils/cloudGallery';
  import type { CookieCutterParams } from '../../types/CookieCutter';

  export let currentSvg: string | null = null;
  export let currentParams: CookieCutterParams;

  const dispatch = createEventDispatcher<{
    loadDesign: SavedDesign;
  }>();

  let showGallery = false;
  let activeTab: 'community' | 'myDesigns' = 'community';
  let showSaveDialog = false;

  let saveName = '';
  let saveDescription = '';
  let saveTags = '';

  let searchQuery = '';
  let selectedTags: string[] = [];
  let sortBy: 'recent' | 'popular' | 'downloads' = 'popular';

  // Multi-select state
  let selectedDesigns = new Set<string>();
  let lastSelectedIndex = -1;

  $: filter = { search: searchQuery, tags: selectedTags, sortBy } as GalleryFilter;
  $: communityDesigns = filterDesigns(getGalleryDesigns(), filter);
  $: myDesigns = getUserDesigns();
  $: popularTags = getPopularTags();

  function openSaveDialog() {
    if (!currentSvg) return;
    showSaveDialog = true;
    saveName = '';
    saveDescription = '';
    saveTags = '';
  }

  function handleSave() {
    if (!currentSvg || !saveName) return;

    const tags = saveTags.split(',').map(t => t.trim()).filter(t => t);
    const design = saveDesignToGallery(
      { svgData: currentSvg, params: currentParams },
      saveName,
      saveDescription,
      tags
    );

    showSaveDialog = false;
    activeTab = 'myDesigns';
    myDesigns = getUserDesigns();
  }

  function handlePublish(design: SavedDesign) {
    publishToGallery(design);
    communityDesigns = filterDesigns(getGalleryDesigns(), filter);
  }

  function handleDelete(id: string) {
    if (confirm('Are you sure you want to delete this design?')) {
      deleteDesign(id);
      selectedDesigns.delete(id);
      selectedDesigns = selectedDesigns;
      myDesigns = getUserDesigns();
    }
  }

  function handleDeleteSelected() {
    const count = selectedDesigns.size;
    if (count === 0) return;

    const message = count === 1
      ? 'Are you sure you want to delete this design?'
      : `Are you sure you want to delete ${count} designs?`;

    if (confirm(message)) {
      selectedDesigns.forEach(id => deleteDesign(id));
      selectedDesigns.clear();
      selectedDesigns = selectedDesigns;
      myDesigns = getUserDesigns();
    }
  }

  function handleDesignClick(design: SavedDesign, index: number, event: MouseEvent) {
    const id = design.metadata.id;

    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd+Click: Toggle selection
      if (selectedDesigns.has(id)) {
        selectedDesigns.delete(id);
      } else {
        selectedDesigns.add(id);
      }
      lastSelectedIndex = index;
      selectedDesigns = selectedDesigns;
    } else if (event.shiftKey && lastSelectedIndex !== -1) {
      // Shift+Click: Range selection
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);

      for (let i = start; i <= end; i++) {
        if (myDesigns[i]) {
          selectedDesigns.add(myDesigns[i].metadata.id);
        }
      }
      selectedDesigns = selectedDesigns;
    } else {
      // Regular click: Clear selection and select this one
      selectedDesigns.clear();
      selectedDesigns.add(id);
      lastSelectedIndex = index;
      selectedDesigns = selectedDesigns;
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (activeTab !== 'myDesigns') return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      handleDeleteSelected();
    } else if (event.key === 'Escape') {
      selectedDesigns.clear();
      selectedDesigns = selectedDesigns;
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
      event.preventDefault();
      myDesigns.forEach(design => selectedDesigns.add(design.metadata.id));
      selectedDesigns = selectedDesigns;
    }
  }

  function handleLike(id: string) {
    likeDesign(id);
    communityDesigns = filterDesigns(getGalleryDesigns(), filter);
  }

  function handleLoad(design: SavedDesign) {
    dispatch('loadDesign', design);
    showGallery = false;
  }

  function toggleTag(tag: string) {
    if (selectedTags.includes(tag)) {
      selectedTags = selectedTags.filter(t => t !== tag);
    } else {
      selectedTags = [...selectedTags, tag];
    }
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return date.toLocaleDateString();
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="cloud-gallery">
  <div class="gallery-header">
    <h3>☁️ Cloud Gallery</h3>
    <div class="header-actions">
      {#if currentSvg}
        <button class="save-btn" on:click={openSaveDialog}>
          💾 Save Design
        </button>
      {/if}
      <button class="toggle-btn" on:click={() => showGallery = !showGallery}>
        {showGallery ? '▼' : '▶'}
      </button>
    </div>
  </div>

  {#if showGallery}
    <div class="gallery-content">
      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab"
          class:active={activeTab === 'community'}
          on:click={() => activeTab = 'community'}
        >
          🌍 Community ({communityDesigns.length})
        </button>
        <button
          class="tab"
          class:active={activeTab === 'myDesigns'}
          on:click={() => activeTab = 'myDesigns'}
        >
          📁 My Designs ({myDesigns.length})
        </button>
      </div>

      {#if activeTab === 'community'}
        <!-- Search and Filters -->
        <div class="filters-section">
          <input
            type="text"
            class="search-input"
            placeholder="Search designs..."
            bind:value={searchQuery}
          />

          <div class="sort-controls">
            <label for="sortBy">Sort by:</label>
            <select id="sortBy" bind:value={sortBy}>
              <option value="popular">Most Popular</option>
              <option value="recent">Most Recent</option>
              <option value="downloads">Most Downloaded</option>
            </select>
          </div>

          <div class="tags-filter">
            <div class="tags-label">Popular Tags:</div>
            <div class="tags-list">
              {#each popularTags as tag}
                <button
                  class="tag-chip"
                  class:selected={selectedTags.includes(tag)}
                  on:click={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              {/each}
            </div>
          </div>
        </div>

        <!-- Designs Grid -->
        <div class="designs-grid">
          {#each communityDesigns as design}
            <div class="design-card">
              <div class="card-preview" on:click={() => handleLoad(design)}>
                {@html design.svgData}
              </div>
              <div class="card-info">
                <h4 class="design-name">{design.metadata.name}</h4>
                <p class="design-description">{design.metadata.description}</p>
                <div class="design-meta">
                  <span class="author">By {design.metadata.author}</span>
                  <span class="date">{formatDate(design.metadata.createdAt)}</span>
                </div>
                <div class="design-tags">
                  {#each design.metadata.tags.slice(0, 3) as tag}
                    <span class="tag">{tag}</span>
                  {/each}
                </div>
                <div class="card-actions">
                  <button class="action-btn" on:click={() => handleLike(design.metadata.id)}>
                    ❤️ {design.metadata.likes}
                  </button>
                  <button class="action-btn" on:click={() => handleLoad(design)}>
                    📥 Load
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <!-- My Designs -->
        {#if selectedDesigns.size > 0}
          <div class="selection-toolbar">
            <span class="selection-count">{selectedDesigns.size} selected</span>
            <button class="btn-delete-selected" on:click={handleDeleteSelected}>
              🗑️ Delete Selected
            </button>
          </div>
        {/if}

        <div class="designs-grid">
          {#each myDesigns as design, index}
            <div
              class="design-card"
              class:selected={selectedDesigns.has(design.metadata.id)}
              on:click={(e) => handleDesignClick(design, index, e)}
            >
              <div class="selection-indicator">
                {#if selectedDesigns.has(design.metadata.id)}
                  <div class="checkbox checked">✓</div>
                {:else}
                  <div class="checkbox"></div>
                {/if}
              </div>
              <div class="card-preview" on:click|stopPropagation={() => handleLoad(design)}>
                {@html design.svgData}
              </div>
              <div class="card-info">
                <h4 class="design-name">{design.metadata.name}</h4>
                <p class="design-description">{design.metadata.description}</p>
                <div class="design-meta">
                  <span class="date">{formatDate(design.metadata.createdAt)}</span>
                </div>
                <div class="card-actions">
                  <button class="action-btn primary" on:click|stopPropagation={() => handlePublish(design)}>
                    📤 Publish
                  </button>
                  <button class="action-btn" on:click|stopPropagation={() => handleLoad(design)}>
                    📥 Load
                  </button>
                  <button class="action-btn danger" on:click|stopPropagation={() => handleDelete(design.metadata.id)}>
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          {/each}

          {#if myDesigns.length === 0}
            <div class="empty-state">
              <p>No saved designs yet.</p>
              <p class="hint">Save your current design to get started!</p>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Save Dialog -->
{#if showSaveDialog}
  <div class="modal-overlay" on:click={() => showSaveDialog = false}>
    <div class="modal-content" on:click|stopPropagation>
      <h3>Save Design</h3>

      <div class="form-group">
        <label for="designName">Design Name *</label>
        <input
          id="designName"
          type="text"
          bind:value={saveName}
          placeholder="My Awesome Cookie Cutter"
        />
      </div>

      <div class="form-group">
        <label for="designDescription">Description</label>
        <textarea
          id="designDescription"
          bind:value={saveDescription}
          placeholder="Describe your design..."
          rows="3"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="designTags">Tags (comma-separated)</label>
        <input
          id="designTags"
          type="text"
          bind:value={saveTags}
          placeholder="christmas, star, festive"
        />
      </div>

      <div class="modal-actions">
        <button class="btn-cancel" on:click={() => showSaveDialog = false}>
          Cancel
        </button>
        <button class="btn-save" on:click={handleSave} disabled={!saveName}>
          Save Design
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .cloud-gallery {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1rem;
  }

  .gallery-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    color: #2d3748;
    font-weight: 600;
  }

  .save-btn {
    padding: 0.5rem 1rem;
    background: #48bb78;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .save-btn:hover {
    background: #38a169;
  }

  .toggle-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #a0aec0;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .gallery-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 2px solid #e2e8f0;
  }

  .tab {
    padding: 0.75rem 1.5rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #718096;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -2px;
  }

  .tab:hover {
    color: #4299e1;
  }

  .tab.active {
    color: #4299e1;
    border-bottom-color: #4299e1;
  }

  .filters-section {
    padding: 1rem;
    background: #f7fafc;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .search-input {
    padding: 0.75rem;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.9rem;
    width: 100%;
  }

  .search-input:focus {
    outline: none;
    border-color: #4299e1;
  }

  .sort-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .sort-controls label {
    font-size: 0.85rem;
    color: #4a5568;
  }

  .sort-controls select {
    padding: 0.5rem;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .tags-filter {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tags-label {
    font-size: 0.85rem;
    color: #4a5568;
    font-weight: 500;
  }

  .tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tag-chip {
    padding: 0.4rem 0.8rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 16px;
    font-size: 0.8rem;
    color: #4a5568;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tag-chip:hover {
    border-color: #4299e1;
    color: #4299e1;
  }

  .tag-chip.selected {
    background: #4299e1;
    border-color: #4299e1;
    color: white;
  }

  .designs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
    max-height: 500px;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .design-card {
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.2s;
    position: relative;
    cursor: pointer;
  }

  .design-card:hover {
    border-color: #4299e1;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .design-card.selected {
    border-color: #4299e1;
    background: #ebf8ff;
    box-shadow: 0 0 0 2px rgba(66, 153, 225, 0.2);
  }

  .card-preview {
    aspect-ratio: 1;
    background: #f7fafc;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    cursor: pointer;
  }

  .card-preview :global(svg) {
    width: 100%;
    height: 100%;
  }

  .card-info {
    padding: 1rem;
  }

  .design-name {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
    color: #2d3748;
    font-weight: 600;
  }

  .design-description {
    margin: 0 0 0.75rem;
    font-size: 0.8rem;
    color: #718096;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .design-meta {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    color: #a0aec0;
  }

  .design-tags {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }

  .tag {
    padding: 0.2rem 0.5rem;
    background: #ebf8ff;
    color: #2c5282;
    border-radius: 4px;
    font-size: 0.7rem;
  }

  .card-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    flex: 1;
    padding: 0.5rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:hover {
    border-color: #4299e1;
    color: #4299e1;
  }

  .action-btn.primary {
    background: #4299e1;
    border-color: #4299e1;
    color: white;
  }

  .action-btn.primary:hover {
    background: #3182ce;
  }

  .action-btn.danger {
    flex: 0;
    padding: 0.5rem 0.75rem;
  }

  .action-btn.danger:hover {
    border-color: #e53e3e;
    color: #e53e3e;
  }

  .empty-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 3rem 1rem;
    color: #718096;
  }

  .empty-state p {
    margin: 0.5rem 0;
  }

  .hint {
    font-size: 0.85rem;
    color: #a0aec0;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 8px;
    padding: 2rem;
    width: 90%;
    max-width: 500px;
  }

  .modal-content h3 {
    margin: 0 0 1.5rem;
    font-size: 1.25rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #4a5568;
    font-weight: 500;
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.9rem;
    font-family: inherit;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #4299e1;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }

  .btn-cancel,
  .btn-save {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-cancel {
    background: #edf2f7;
    color: #4a5568;
  }

  .btn-cancel:hover {
    background: #e2e8f0;
  }

  .btn-save {
    background: #48bb78;
    color: white;
  }

  .btn-save:hover:not(:disabled) {
    background: #38a169;
  }

  .btn-save:disabled {
    background: #cbd5e0;
    cursor: not-allowed;
  }

  /* Selection Toolbar */
  .selection-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: #ebf8ff;
    border: 2px solid #4299e1;
    border-radius: 6px;
    margin-bottom: 1rem;
  }

  .selection-count {
    font-size: 0.9rem;
    font-weight: 600;
    color: #2c5282;
  }

  .btn-delete-selected {
    padding: 0.5rem 1rem;
    background: #e53e3e;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-delete-selected:hover {
    background: #c53030;
  }

  /* Selection Checkbox */
  .selection-indicator {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 10;
  }

  .checkbox {
    width: 24px;
    height: 24px;
    border: 2px solid #cbd5e0;
    border-radius: 4px;
    background: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    font-weight: bold;
    color: white;
    transition: all 0.2s;
    cursor: pointer;
  }

  .checkbox.checked {
    background: #4299e1;
    border-color: #4299e1;
  }

  .design-card:hover .checkbox {
    border-color: #4299e1;
  }
</style>
