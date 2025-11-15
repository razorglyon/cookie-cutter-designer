<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Layer, LayerType } from '../../types/Layer';
  import { DEFAULT_LAYER } from '../../types/Layer';

  export let layers: Layer[] = [];

  const dispatch = createEventDispatcher<{
    addLayer: LayerType;
    removeLayer: string;
    updateLayer: Layer;
    reorderLayers: Layer[];
    toggleLayer: string;
  }>();

  let selectedLayerId: string | null = null;
  let draggedLayerId: string | null = null;

  function addNewLayer(type: LayerType) {
    dispatch('addLayer', type);
  }

  function removeLayer(id: string) {
    if (confirm('Delete this layer?')) {
      dispatch('removeLayer', id);
    }
  }

  function toggleLayerVisibility(id: string) {
    dispatch('toggleLayer', id);
  }

  function selectLayer(id: string) {
    selectedLayerId = id;
  }

  function handleLayerUpdate(layer: Layer) {
    dispatch('updateLayer', layer);
  }

  // Drag and drop for reordering
  function handleDragStart(e: DragEvent, layerId: string) {
    draggedLayerId = layerId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }

  function handleDrop(e: DragEvent, targetLayerId: string) {
    e.preventDefault();
    if (!draggedLayerId || draggedLayerId === targetLayerId) return;

    const draggedIndex = layers.findIndex(l => l.id === draggedLayerId);
    const targetIndex = layers.findIndex(l => l.id === targetLayerId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newLayers = [...layers];
    const [draggedLayer] = newLayers.splice(draggedIndex, 1);
    newLayers.splice(targetIndex, 0, draggedLayer);

    dispatch('reorderLayers', newLayers);
    draggedLayerId = null;
  }

  function getLayerIcon(type: LayerType): string {
    switch (type) {
      case 'cutter': return '✂️';
      case 'stamp': return '🔖';
      case 'emboss': return '⚡';
      default: return '📄';
    }
  }
</script>

<div class="layer-manager">
  <div class="header">
    <h3>Layers</h3>
    <div class="add-buttons">
      <button class="add-btn cutter" on:click={() => addNewLayer('cutter')} title="Add Cutter Layer">
        ✂️
      </button>
      <button class="add-btn stamp" on:click={() => addNewLayer('stamp')} title="Add Stamp Layer">
        🔖
      </button>
      <button class="add-btn emboss" on:click={() => addNewLayer('emboss')} title="Add Emboss Layer">
        ⚡
      </button>
    </div>
  </div>

  <div class="layers-list">
    {#if layers.length === 0}
      <div class="empty-state">
        <p>No layers yet</p>
        <span>Add a layer to start designing</span>
      </div>
    {:else}
      {#each layers as layer (layer.id)}
        <div
          class="layer-item"
          class:selected={selectedLayerId === layer.id}
          class:disabled={!layer.enabled}
          draggable={true}
          on:dragstart={(e) => handleDragStart(e, layer.id)}
          on:dragover={handleDragOver}
          on:drop={(e) => handleDrop(e, layer.id)}
          on:click={() => selectLayer(layer.id)}
          role="button"
          tabindex="0"
        >
          <button
            class="visibility-btn"
            class:visible={layer.visible}
            on:click|stopPropagation={() => toggleLayerVisibility(layer.id)}
            title={layer.visible ? 'Hide layer' : 'Show layer'}
          >
            {layer.visible ? '👁️' : '👁️‍🗨️'}
          </button>

          <span class="layer-icon">{getLayerIcon(layer.type)}</span>

          <div class="layer-info">
            <input
              type="text"
              class="layer-name"
              value={layer.name}
              on:click|stopPropagation
              on:input={(e) => handleLayerUpdate({ ...layer, name: e.currentTarget.value })}
              placeholder="Layer name"
            />
            <span class="layer-type">{layer.type}</span>
          </div>

          {#if layer.type !== 'cutter'}
            <input
              type="number"
              class="depth-input"
              value={layer.depth}
              min="0.5"
              max="10"
              step="0.5"
              on:click|stopPropagation
              on:input={(e) => handleLayerUpdate({ ...layer, depth: parseFloat(e.currentTarget.value) })}
              title="Depth (mm)"
            />
          {/if}

          <button
            class="delete-btn"
            on:click|stopPropagation={() => removeLayer(layer.id)}
            title="Delete layer"
          >
            🗑️
          </button>
        </div>
      {/each}
    {/if}
  </div>

  <div class="layer-info-panel">
    <p class="hint">
      💡 Drag layers to reorder<br/>
      ✂️ Cutter: Main cutting shape<br/>
      🔖 Stamp: Raised design<br/>
      ⚡ Emboss: Indented design
    </p>
  </div>
</div>

<style>
  .layer-manager {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    max-height: 400px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #e2e8f0;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    color: #2d3748;
    font-weight: 600;
  }

  .add-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .add-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    font-size: 1.1rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-btn.cutter {
    background: #e6fffa;
  }

  .add-btn.stamp {
    background: #fef5e7;
  }

  .add-btn.emboss {
    background: #f3e5f5;
  }

  .add-btn:hover {
    transform: scale(1.1);
  }

  .layers-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .empty-state {
    text-align: center;
    padding: 2rem 1rem;
    color: #a0aec0;
  }

  .empty-state p {
    margin: 0 0 0.25rem;
    font-size: 0.95rem;
    color: #718096;
  }

  .empty-state span {
    font-size: 0.85rem;
  }

  .layer-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #f7fafc;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    margin-bottom: 0.5rem;
    cursor: move;
    transition: all 0.2s;
  }

  .layer-item:hover {
    border-color: #cbd5e0;
    background: #edf2f7;
  }

  .layer-item.selected {
    border-color: #4299e1;
    background: #ebf8ff;
  }

  .layer-item.disabled {
    opacity: 0.5;
  }

  .visibility-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .visibility-btn:hover {
    background: #f7fafc;
  }

  .layer-icon {
    font-size: 1.25rem;
  }

  .layer-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .layer-name {
    padding: 0.25rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 500;
    color: #2d3748;
    background: transparent;
    transition: all 0.2s;
  }

  .layer-name:hover {
    background: white;
    border-color: #e2e8f0;
  }

  .layer-name:focus {
    outline: none;
    background: white;
    border-color: #4299e1;
  }

  .layer-type {
    font-size: 0.75rem;
    color: #a0aec0;
    text-transform: uppercase;
  }

  .depth-input {
    width: 60px;
    padding: 0.25rem 0.5rem;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 0.85rem;
    text-align: center;
  }

  .depth-input:focus {
    outline: none;
    border-color: #4299e1;
  }

  .delete-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .delete-btn:hover {
    background: #fff5f5;
    border-color: #fc8181;
  }

  .layer-info-panel {
    padding: 0.75rem 1rem;
    background: #f7fafc;
    border-top: 1px solid #e2e8f0;
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
  }

  .hint {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.6;
    color: #718096;
  }
</style>
