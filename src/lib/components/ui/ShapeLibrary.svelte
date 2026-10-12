<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { getAllCategories, getShapesByCategory, type ShapeDefinition } from '../../utils/shapeLibrary';

  const dispatch = createEventDispatcher<{
    selectShape: { svg: string; name: string };
  }>();

  let selectedCategory: ShapeDefinition['category'] = 'basic';

  const categories = getAllCategories();
  const categoryLabels: Record<ShapeDefinition['category'], string> = {
    basic: 'Formes de base',
    seasonal: 'Saisons',
    animals: 'Animaux',
    letters: 'Lettres',
    numbers: 'Chiffres'
  };

  $: shapes = getShapesByCategory(selectedCategory);

  function selectShape(shape: ShapeDefinition): void {
    dispatch('selectShape', { svg: shape.svg, name: shape.name });
  }
</script>

<section class="shape-library" aria-labelledby="shape-library-title">
  <header class="library-header">
    <div class="header-icon" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    </div>
    <div>
      <h2 id="shape-library-title">Bibliothèque de formes</h2>
      <p>Choisissez une forme prête à l’emploi pour commencer votre dessin.</p>
    </div>
  </header>

  <div class="categories" role="group" aria-label="Catégories de formes">
    {#each categories as category}
      <button
        class="category-filter"
        class:active={selectedCategory === category}
        on:click={() => selectedCategory = category}
        aria-pressed={selectedCategory === category}
      >
        {categoryLabels[category]}
      </button>
    {/each}
  </div>

  <div class="shapes-grid" aria-live="polite">
    {#each shapes as shape (shape.id)}
      <button
        class="shape-card"
        data-shape-id={shape.id}
        on:click={() => selectShape(shape)}
        aria-label={`Utiliser la forme ${shape.name}`}
      >
        <span class="shape-icon" aria-hidden="true">{shape.icon}</span>
        <span class="shape-name">{shape.name}</span>
      </button>
    {/each}
  </div>
</section>

<style>
  .shape-library {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    min-height: 100%;
  }

  .library-header {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-3);
    padding: var(--spacing-4);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: var(--surface-card);
    box-shadow: var(--shadow-sm);
  }

  .header-icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    border-radius: var(--radius-md);
    background: var(--surface-callout);
    color: var(--color-primary-600);
  }

  h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-size-xl);
    line-height: var(--line-height-tight);
  }

  .library-header p {
    margin: var(--spacing-1) 0 0;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .categories {
    display: flex;
    gap: var(--spacing-2);
    padding-bottom: var(--spacing-1);
    overflow-x: auto;
  }

  .category-filter {
    flex: 0 0 auto;
    min-height: 36px;
    padding: 0 var(--spacing-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-full);
    background: var(--surface-card);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
  }

  .category-filter:hover {
    border-color: var(--color-primary-400);
    background: var(--surface-callout);
  }

  .category-filter.active {
    border-color: var(--color-primary-600);
    background: var(--color-primary-600);
    color: white;
  }

  .shapes-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-3);
    padding-bottom: var(--spacing-4);
  }

  .shape-card {
    display: flex;
    min-height: 116px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: var(--surface-card);
    color: var(--text-secondary);
    box-shadow: var(--shadow-xs);
    transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
  }

  .shape-card:hover {
    border-color: var(--color-primary-400);
    background: var(--surface-callout);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  .shape-icon {
    display: grid;
    place-items: center;
    min-height: 44px;
    font-size: 2.25rem;
    line-height: 1;
  }

  .shape-card[data-shape-id='square'] .shape-icon {
    filter: drop-shadow(0 0 1px var(--text-primary));
  }

  .shape-name {
    color: inherit;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    text-align: center;
  }

  @media (max-width: 360px) {
    .shapes-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
