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
      name: `Pièce ${regions.length + 1}`,
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
    <h3>🎨 Matériaux et couleurs</h3>
    <button class="toggle-btn" on:click={() => showPanel = !showPanel}>
      {showPanel ? '▼' : '▶'}
    </button>
  </div>

  {#if showPanel}
    <div class="panel-content">
      <!-- Material Selection -->
      <div class="material-section">
        <h4>Matériau principal</h4>
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
            <span class="property-label">Température d’impression :</span>
            <span class="property-value">{selectedMaterial.properties.printTemp}°C</span>
          </div>
          <div class="property">
            <span class="property-label">Température du plateau :</span>
            <span class="property-value">{selectedMaterial.properties.bedTemp}°C</span>
          </div>
          <div class="property">
            <span class="property-label">Densité :</span>
            <span class="property-value">{selectedMaterial.properties.density} g/cm³</span>
          </div>
          <div class="property">
            <span class="property-label">Type :</span>
            <span class="property-value">{selectedMaterial.properties.flexible ? 'Flexible' : 'Rigide'}</span>
          </div>
        </div>
      </div>

      <!-- Multi-Material Regions -->
      <div class="regions-section">
        <div class="section-header">
          <h4>Pièces multimatériaux</h4>
          <button class="add-region-btn" on:click={addRegion}>
            + Ajouter une pièce
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
              <div class="warning-header">⚠️ Avertissements de compatibilité</div>
              {#each compatibility.warnings as warning}
                <div class="warning-item">{warning}</div>
              {/each}
            </div>
          {/if}

          <!-- Réglages recommandés -->
          <div class="recommended-settings">
            <h5>Réglages recommandés</h5>
            <div class="settings-grid">
              <div class="setting">
                <span class="setting-label">Température d’impression :</span>
                <span class="setting-value">{recommendedSettings.printTemp}°C</span>
              </div>
              <div class="setting">
                <span class="setting-label">Température du plateau :</span>
                <span class="setting-value">{recommendedSettings.bedTemp}°C</span>
              </div>
              <div class="setting">
                <span class="setting-label">Volume de purge :</span>
                <span class="setting-value">{recommendedSettings.purgeVolume}mm³</span>
              </div>
            </div>
          </div>
        {:else}
          <div class="no-regions">
            <p>Aucune pièce multimatériau ajoutée.</p>
            <p class="hint">Ajoutez des pièces pour utiliser différentes couleurs ou différents matériaux.</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .material-manager {
    background: var(--surface-card);
    color: var(--text-primary);
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
    color: var(--text-primary);
    font-weight: 600;
  }

  h4 {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    color: var(--text-secondary);
    font-weight: 600;
  }

  h5 {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
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
    color: var(--text-secondary);
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
    background: var(--surface-muted);
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

  @media (max-width: 600px) {
    .material-group {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .group-label {
    grid-column: 1 / -1;
    font-size: 0.75rem;
    color: var(--text-secondary);
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
    padding: 0.25rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .material-swatch:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }

  .material-swatch.selected {
    border-color: var(--color-primary-500);
    box-shadow: 0 4px 12px rgba(66, 153, 225, 0.3);
  }

  .swatch-name {
    font-size: 0.7rem;
    font-weight: 600;
    background: rgba(0, 0, 0, 0.82);
    color: var(--text-on-brand);
    padding: 0.25rem 0.35rem;
    border-radius: 4px;
    box-sizing: border-box;
    max-width: 100%;
    overflow-wrap: anywhere;
    text-align: left;
  }

  .material-info {
    padding: 1rem;
    background: var(--surface-muted);
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
    border: 2px solid var(--border-default);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .material-name {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .material-type {
    font-size: 0.85rem;
    color: var(--text-secondary);
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
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .property-value {
    font-size: 0.9rem;
    color: var(--text-primary);
    font-weight: 600;
  }

  .regions-section {
    padding: 1rem;
    background: var(--surface-muted);
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
    background: var(--color-primary-700);
    color: var(--text-on-brand);
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .add-region-btn:hover {
    background: var(--color-primary-800);
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
    background: var(--surface-input);
    border-radius: 6px;
    border: 1px solid var(--border-default);
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
    border: 2px solid var(--border-default);
  }

  .region-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .region-material {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .remove-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-error);
    cursor: pointer;
    transition: all 0.2s;
  }

  .remove-btn:hover {
    background: var(--color-error-light);
    border-color: var(--color-error);
  }

  .no-regions {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--text-secondary);
  }

  .no-regions p {
    margin: 0.25rem 0;
    font-size: 0.9rem;
  }

  .hint {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .compatibility-warnings {
    padding: 1rem;
    background: var(--surface-warning);
    border-left: 4px solid var(--color-warning);
    border-radius: 6px;
    margin-bottom: 1rem;
  }

  .warning-header {
    font-weight: 600;
    color: var(--text-warning);
    margin-bottom: 0.5rem;
  }

  .warning-item {
    font-size: 0.85rem;
    color: var(--text-warning);
    margin: 0.25rem 0;
  }

  .recommended-settings {
    padding: 1rem;
    background: var(--surface-callout);
    border-radius: 6px;
    border-left: 4px solid var(--color-primary-500);
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
    color: var(--text-primary);
    text-transform: uppercase;
  }

  .setting-value {
    font-size: 0.9rem;
    color: var(--text-primary);
    font-weight: 600;
  }
</style>
