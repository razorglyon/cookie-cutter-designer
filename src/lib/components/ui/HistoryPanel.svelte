<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { historyStore, canUndo, canRedo } from '../../stores/historyStore';

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
            class:current={index === $historyStore.currentIndex}
          >
            <div class="item-icon">
              {#if index === $historyStore.currentIndex}
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
    flex-direction: column;
    gap: 0.5rem;
  }

  .history-controls {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .control-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    color: #4a5568;
    cursor: pointer;
    transition: all 0.2s;
  }

  .control-btn:hover:not(.disabled) {
    border-color: #4299e1;
    background: #ebf8ff;
    color: #2c5282;
  }

  .control-btn.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .control-btn.info-btn {
    margin-left: auto;
  }

  .btn-label {
    font-size: 0.85rem;
  }

  .history-count {
    min-width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #4299e1;
    color: white;
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .history-list {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1rem;
    max-height: 300px;
    overflow-y: auto;
  }

  h4 {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    color: #2d3748;
    font-weight: 600;
  }

  .history-items {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .history-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .history-item:hover {
    background: #f7fafc;
  }

  .history-item.current {
    background: #ebf8ff;
    border-left: 3px solid #4299e1;
  }

  .item-icon {
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    color: #4299e1;
  }

  .item-info {
    flex: 1;
  }

  .item-description {
    font-size: 0.85rem;
    color: #2d3748;
    font-weight: 500;
  }

  .item-time {
    font-size: 0.75rem;
    color: #a0aec0;
    margin-top: 0.25rem;
  }
</style>
