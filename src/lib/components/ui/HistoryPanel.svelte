<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { historyStore, canUndo, canRedo } from '../../stores/historyStore';

  const currentIndex = historyStore.currentIndex;

  const dispatch = createEventDispatcher<{
    undo: void;
    redo: void;
  }>();

  let showHistory = false;

  $: historyLength = historyStore.getLength();

  function handleUndo() {
    if ($canUndo) {
      dispatch('undo');
    }
  }

  function handleRedo() {
    if ($canRedo) {
      dispatch('redo');
    }
  }

  // Keyboard shortcuts
  function handleKeyDown(e: KeyboardEvent) {
    // Ctrl+Z or Cmd+Z for Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    }
    // Ctrl+Shift+Z or Cmd+Shift+Z for Redo
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      handleRedo();
    }
    // Ctrl+Y or Cmd+Y for Redo (alternative)
    else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      handleRedo();
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="history-panel">
  <div class="history-controls">
    <button
      class="control-btn"
      class:disabled={!$canUndo}
      on:click={handleUndo}
      disabled={!$canUndo}
      title="Undo (Ctrl+Z)"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7v6h6" />
        <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
      </svg>
      <span class="btn-label">Undo</span>
    </button>

    <button
      class="control-btn"
      class:disabled={!$canRedo}
      on:click={handleRedo}
      disabled={!$canRedo}
      title="Redo (Ctrl+Shift+Z)"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 7v6h-6" />
        <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" />
      </svg>
      <span class="btn-label">Redo</span>
    </button>

    <button
      class="control-btn info-btn"
      on:click={() => showHistory = !showHistory}
      title="Show history"
      aria-label={`History, ${historyLength} states`}
      aria-expanded={showHistory}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span class="history-count">{historyLength}</span>
    </button>
  </div>

  {#if showHistory && historyLength > 0}
    <div class="history-list">
      <h4>History</h4>
      <div class="history-items">
        {#each $historyStore as state, index}
          <div
            class="history-item"
            class:current={index === $currentIndex}
          >
            <div class="item-icon">
              {#if index === $currentIndex}
                →
              {:else}
                ·
              {/if}
            </div>
            <div class="item-info">
              <div class="item-description">{state.description}</div>
              <div class="item-time">
                {new Date(state.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .history-panel {
    display: flex;
    position: sticky;
    bottom: 0;
    z-index: var(--z-dropdown);
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .history-controls {
    display: flex;
    gap: var(--spacing-2);
    padding: var(--spacing-2);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: var(--surface-elevated);
    box-shadow: var(--shadow-sm);
  }

  .control-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-input);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
  }

  .control-btn:hover:not(:disabled) {
    border-color: var(--color-primary-500);
    background: var(--surface-callout);
    color: var(--color-primary-600);
  }

  .control-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .control-btn.info-btn {
    margin-left: auto;
  }

  .history-count {
    display: grid;
    place-items: center;
    min-width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-full);
    background: var(--color-primary-600);
    color: white;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
  }

  .history-list {
    max-height: 300px;
    padding: var(--spacing-4);
    overflow-y: auto;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: var(--surface-elevated);
    box-shadow: var(--shadow-md);
  }

  h4 {
    margin: 0 0 var(--spacing-3);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  .history-items {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .history-item {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-2);
    padding: var(--spacing-2);
    border-radius: var(--radius-md);
  }

  .history-item:hover {
    background: var(--surface-muted);
  }

  .history-item.current {
    border-left: 3px solid var(--color-primary-500);
    background: var(--surface-callout);
  }

  .item-icon {
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    color: var(--color-primary-500);
    font-weight: var(--font-weight-bold);
  }

  .item-info {
    min-width: 0;
    flex: 1;
  }

  .item-description {
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .item-time {
    margin-top: var(--spacing-1);
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }
</style>
