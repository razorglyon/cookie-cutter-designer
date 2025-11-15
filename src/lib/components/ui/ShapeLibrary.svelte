<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { SHAPE_LIBRARY, getAllCategories, getShapesByCategory, type ShapeDefinition } from '../../utils/shapeLibrary';

  const dispatch = createEventDispatcher<{
    selectShape: string; // SVG string
  }>();

  let selectedCategory: ShapeDefinition['category'] = 'basic';
  let isOpen = false;

  const categories = getAllCategories();
  const categoryLabels: Record<string, string> = {
    basic: 'Basic',
    seasonal: 'Seasonal',
    animals: 'Animals',
    letters: 'Letters',
    numbers: 'Numbers'
  };

  $: shapes = getShapesByCategory(selectedCategory);

  function selectShape(shape: ShapeDefinition) {
    dispatch('selectShape', shape.svg);
    isOpen = false;
  }

  function toggleLibrary() {
    isOpen = !isOpen;
  }
</script>

<div class="shape-library">
  <button class="library-toggle" on:click={toggleLibrary}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
    Shape Library
  </button>

  {#if isOpen}
    <div class="library-modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Shape Library</h3>
          <button class="close-btn" on:click={() => isOpen = false}>✕</button>
        </div>

        <div class="categories">
          {#each categories as category}
            <button
              class="category-btn"
              class:active={selectedCategory === category}
              on:click={() => selectedCategory = category}
            >
              {categoryLabels[category]}
            </button>
          {/each}
        </div>

        <div class="shapes-grid">
          {#each shapes as shape (shape.id)}
            <button
              class="shape-card"
              on:click={() => selectShape(shape)}
              title={shape.name}
            >
              <div class="shape-icon">{shape.icon}</div>
              <div class="shape-name">{shape.name}</div>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .shape-library {
    position: relative;
  }

  .library-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    color: #4a5568;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
  }

  .library-toggle:hover {
    border-color: #4299e1;
    background: #ebf8ff;
    color: #2c5282;
  }

  .library-modal {
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
    padding: 1rem;
  }

  .modal-content {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    max-width: 600px;
    width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #e2e8f0;
  }

  .modal-header h3 {
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
    background: transparent;
    border: none;
    font-size: 1.5rem;
    color: #a0aec0;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: #f7fafc;
    color: #4a5568;
  }

  .categories {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e2e8f0;
    overflow-x: auto;
  }

  .category-btn {
    padding: 0.5rem 1rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    color: #4a5568;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .category-btn:hover {
    border-color: #cbd5e0;
    background: #f7fafc;
  }

  .category-btn.active {
    border-color: #4299e1;
    background: #ebf8ff;
    color: #2c5282;
  }

  .shapes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 1rem;
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .shape-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .shape-card:hover {
    border-color: #4299e1;
    background: #ebf8ff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(66, 153, 225, 0.2);
  }

  .shape-icon {
    font-size: 2.5rem;
  }

  .shape-name {
    font-size: 0.8rem;
    font-weight: 500;
    color: #4a5568;
    text-align: center;
  }

  .shape-card:hover .shape-name {
    color: #2c5282;
  }
</style>
