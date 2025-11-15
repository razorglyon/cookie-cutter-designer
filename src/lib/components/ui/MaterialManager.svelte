<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    MATERIAL_PRESETS,
    checkMaterialCompatibility,
    getMultiMaterialSettings,
    type MaterialPreset,
    type ColorRegion
  } from '../../utils/materialManager';

  const dispatch = createEventDispatcher<{
    materialChanged: { meshName: string; material: MaterialPreset };
  }>();

  let showPanel = false;
  let selectedMaterial: MaterialPreset = MATERIAL_PRESETS[0];
  let regions: ColorRegion[] = [];

  // Group materials by type
  $: materialsByType = MATERIAL_PRESETS.reduce((acc, material) => {
    if (!acc[material.type]) {
      acc[material.type] = [];
    }
    acc[material.type].push(material);
    return acc;
  }, {} as Record<string, MaterialPreset[]>);

  $: usedMaterials = regions.map(r => r.material);
  $: compatibility = checkMaterialCompatibility(usedMaterials);
  $: recommendedSettings = getMultiMaterialSettings(usedMaterials);

  function selectMaterial(material: MaterialPreset) {
    selectedMaterial = material;
    dispatch('materialChanged', { meshName: 'cookieCutter', material });
  }

  function addRegion() {
    const newRegion: ColorRegion = {
      id: `region-${regions.length}`,
      name: `Part ${regions.length + 1}`,
      material: selectedMaterial,
      meshName: `part-${regions.length}`
    };
    regions = [...regions, newRegion];
  }

  function removeRegion(id: string) {
    regions = regions.filter(r => r.id !== id);
  }

  function updateRegionMaterial(regionId: string, material: MaterialPreset) {
    regions = regions.map(r =>
      r.id === regionId ? { ...r, material } : r
    );
  }
</script>

<div class="material-manager">
  <div class="panel-header">
    <h3>🎨 Material & Colors</h3>
    <button class="toggle-btn" on:click={() => showPanel = !showPanel}>
      {showPanel ? '▼' : '▶'}
    </button>
  </div>

  {#if showPanel}
    <div class="panel-content">
      <!-- Material Selection -->
      <div class="material-section">
        <h4>Primary Material</h4>
        <div class="material-grid">
          {#each Object.entries(materialsByType) as [type, materials]}
            <div class="material-group">
              <div class="group-label">{type}</div>
              {#each materials as material}
                <button
                  class="material-swatch"
                  class:selected={selectedMaterial.id === material.id}
                  style="background-color: {material.color}"
                  on:click={() => selectMaterial(material)}
                  title={material.name}
                >
                  <div class="swatch-name">{material.name}</div>
                </button>
              {/each}
            </div>
          {/each}
        </div>
      </div>

      <!-- Selected Material Info -->
      <div class="material-info">
        <div class="info-header">
          <div class="color-preview" style="background-color: {selectedMaterial.color}"></div>
          <div class="info-text">
            <div class="material-name">{selectedMaterial.name}</div>
            <div class="material-type">{selectedMaterial.type}</div>
          </div>
        </div>
        <div class="properties-grid">
          <div class="property">
            <span class="property-label">Print Temp:</span>
            <span class="property-value">{selectedMaterial.properties.printTemp}°C</span>
          </div>
          <div class="property">
            <span class="property-label">Bed Temp:</span>
            <span class="property-value">{selectedMaterial.properties.bedTemp}°C</span>
          </div>
          <div class="property">
            <span class="property-label">Density:</span>
            <span class="property-value">{selectedMaterial.properties.density} g/cm³</span>
          </div>
          <div class="property">
            <span class="property-label">Type:</span>
            <span class="property-value">{selectedMaterial.properties.flexible ? 'Flexible' : 'Rigid'}</span>
          </div>
        </div>
      </div>

      <!-- Multi-Material Regions -->
      <div class="regions-section">
        <div class="section-header">
          <h4>Multi-Material Parts</h4>
          <button class="add-region-btn" on:click={addRegion}>
            + Add Part
          </button>
        </div>

        {#if regions.length > 0}
          <div class="regions-list">
            {#each regions as region}
              <div class="region-item">
                <div class="region-info">
                  <div
                    class="region-color"
                    style="background-color: {region.material.color}"
                  ></div>
                  <div class="region-details">
                    <div class="region-name">{region.name}</div>
                    <div class="region-material">{region.material.name}</div>
                  </div>
                </div>
                <button class="remove-btn" on:click={() => removeRegion(region.id)}>
                  ✕
                </button>
              </div>
            {/each}
          </div>

          <!-- Compatibility Check -->
          {#if !compatibility.compatible}
            <div class="compatibility-warnings">
              <div class="warning-header">⚠️ Compatibility Warnings</div>
              {#each compatibility.warnings as warning}
                <div class="warning-item">{warning}</div>
              {/each}
            </div>
          {/if}

          <!-- Recommended Settings -->
          <div class="recommended-settings">
            <h5>Recommended Settings</h5>
            <div class="settings-grid">
              <div class="setting">
                <span class="setting-label">Print Temp:</span>
                <span class="setting-value">{recommendedSettings.printTemp}°C</span>
              </div>
              <div class="setting">
                <span class="setting-label">Bed Temp:</span>
                <span class="setting-value">{recommendedSettings.bedTemp}°C</span>
              </div>
              <div class="setting">
                <span class="setting-label">Purge Volume:</span>
                <span class="setting-value">{recommendedSettings.purgeVolume}mm³</span>
              </div>
            </div>
          </div>
        {:else}
          <div class="no-regions">
            <p>No multi-material parts added yet.</p>
            <p class="hint">Add parts to use different colors or materials.</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .material-manager {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1rem;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    color: #2d3748;
    font-weight: 600;
  }

  h4 {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    color: #4a5568;
    font-weight: 600;
  }

  h5 {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    color: #4a5568;
    font-weight: 600;
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

  .panel-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .material-section {
    padding: 1rem;
    background: #f7fafc;
    border-radius: 6px;
  }

  .material-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .material-group {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 0.5rem;
  }

  .group-label {
    grid-column: 1 / -1;
    font-size: 0.75rem;
    color: #a0aec0;
    font-weight: 600;
    text-transform: uppercase;
    padding: 0.25rem 0;
  }

  .material-swatch {
    aspect-ratio: 1;
    border: 3px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: flex-end;
    padding: 0.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .material-swatch:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }

  .material-swatch.selected {
    border-color: #4299e1;
    box-shadow: 0 4px 12px rgba(66, 153, 225, 0.3);
  }

  .swatch-name {
    font-size: 0.7rem;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.7);
    text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
  }

  .material-info {
    padding: 1rem;
    background: #f7fafc;
    border-radius: 6px;
  }

  .info-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .color-preview {
    width: 50px;
    height: 50px;
    border-radius: 8px;
    border: 2px solid #e2e8f0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .material-name {
    font-size: 1rem;
    font-weight: 600;
    color: #2d3748;
  }

  .material-type {
    font-size: 0.85rem;
    color: #718096;
  }

  .properties-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .property {
    display: flex;
    flex-direction: column;
  }

  .property-label {
    font-size: 0.75rem;
    color: #a0aec0;
    text-transform: uppercase;
  }

  .property-value {
    font-size: 0.9rem;
    color: #2d3748;
    font-weight: 600;
  }

  .regions-section {
    padding: 1rem;
    background: #f7fafc;
    border-radius: 6px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .add-region-btn {
    padding: 0.5rem 1rem;
    background: #4299e1;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .add-region-btn:hover {
    background: #3182ce;
  }

  .regions-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .region-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: white;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
  }

  .region-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .region-color {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: 2px solid #e2e8f0;
  }

  .region-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: #2d3748;
  }

  .region-material {
    font-size: 0.8rem;
    color: #718096;
  }

  .remove-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    color: #e53e3e;
    cursor: pointer;
    transition: all 0.2s;
  }

  .remove-btn:hover {
    background: #fff5f5;
    border-color: #fc8181;
  }

  .no-regions {
    text-align: center;
    padding: 2rem 1rem;
    color: #718096;
  }

  .no-regions p {
    margin: 0.25rem 0;
    font-size: 0.9rem;
  }

  .hint {
    font-size: 0.85rem;
    color: #a0aec0;
  }

  .compatibility-warnings {
    padding: 1rem;
    background: #fffaf0;
    border-left: 4px solid #ed8936;
    border-radius: 6px;
    margin-bottom: 1rem;
  }

  .warning-header {
    font-weight: 600;
    color: #c05621;
    margin-bottom: 0.5rem;
  }

  .warning-item {
    font-size: 0.85rem;
    color: #7c2d12;
    margin: 0.25rem 0;
  }

  .recommended-settings {
    padding: 1rem;
    background: #ebf8ff;
    border-radius: 6px;
    border-left: 4px solid #4299e1;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  .setting {
    display: flex;
    flex-direction: column;
  }

  .setting-label {
    font-size: 0.75rem;
    color: #2c5282;
    text-transform: uppercase;
  }

  .setting-value {
    font-size: 0.9rem;
    color: #1a365d;
    font-weight: 600;
  }
</style>
