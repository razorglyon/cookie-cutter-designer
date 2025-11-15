<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Mesh, Group } from 'three';
  import {
    exportToOBJ,
    exportTo3MF,
    exportToGCODE,
    getDefaultPrinterProfiles,
    estimateExportSize,
    type ExportFormat,
    type PrinterProfile
  } from '../../utils/advancedExporter';
  import { exportToSTL } from '../../utils/stlExporter';
  import type { CookieCutterParams } from '../../types/CookieCutter';

  export let mesh: Mesh | Group | null;
  export let filename: string;
  export let params: CookieCutterParams;

  let showPanel = false;
  let selectedFormat: ExportFormat = 'stl';
  let selectedProfile: PrinterProfile = getDefaultPrinterProfiles()[0];
  let binaryFormat = true;
  let includeMetadata = true;

  const printerProfiles = getDefaultPrinterProfiles();

  const formats = [
    { id: 'stl' as ExportFormat, name: 'STL', icon: '📦', description: 'Standard Tessellation Language (most common)' },
    { id: 'obj' as ExportFormat, name: 'OBJ', icon: '🔷', description: 'Wavefront Object (compatible with many tools)' },
    { id: '3mf' as ExportFormat, name: '3MF', icon: '📐', description: '3D Manufacturing Format (modern, with metadata)' },
    { id: 'gcode' as ExportFormat, name: 'GCODE', icon: '⚙️', description: 'Direct printer instructions (ready to print)' }
  ];

  function handleExport() {
    if (!mesh) return;

    const exportFilename = filename.replace(/\.[^/.]+$/, '');

    switch (selectedFormat) {
      case 'stl':
        exportToSTL(mesh, `${exportFilename}.stl`, { binary: binaryFormat, includeMetadata });
        break;
      case 'obj':
        exportToOBJ(mesh, `${exportFilename}.obj`);
        break;
      case '3mf':
        exportTo3MF(mesh, `${exportFilename}.3mf`, params);
        break;
      case 'gcode':
        exportToGCODE(mesh, `${exportFilename}.gcode`, selectedProfile, params);
        break;
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  $: estimatedSize = mesh ? formatFileSize(estimateExportSize(mesh, selectedFormat)) : '—';
</script>

<div class="advanced-export">
  <div class="panel-header">
    <h3>💾 Advanced Export</h3>
    <button class="toggle-btn" on:click={() => showPanel = !showPanel}>
      {showPanel ? '▼' : '▶'}
    </button>
  </div>

  {#if showPanel}
    <div class="panel-content">
      <!-- Format Selection -->
      <div class="format-section">
        <h4>Export Format</h4>
        <div class="format-grid">
          {#each formats as format}
            <button
              class="format-card"
              class:selected={selectedFormat === format.id}
              on:click={() => selectedFormat = format.id}
            >
              <div class="format-icon">{format.icon}</div>
              <div class="format-info">
                <div class="format-name">{format.name}</div>
                <div class="format-description">{format.description}</div>
              </div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Format-specific Options -->
      {#if selectedFormat === 'stl'}
        <div class="options-section">
          <h4>STL Options</h4>
          <label class="checkbox-option">
            <input type="checkbox" bind:checked={binaryFormat} />
            <span>Binary Format (smaller file size)</span>
          </label>
          <label class="checkbox-option">
            <input type="checkbox" bind:checked={includeMetadata} />
            <span>Include Metadata</span>
          </label>
        </div>
      {/if}

      {#if selectedFormat === 'gcode'}
        <div class="printer-section">
          <h4>Printer Profile</h4>
          <div class="profile-selector">
            {#each printerProfiles as profile}
              <button
                class="profile-btn"
                class:selected={selectedProfile.name === profile.name}
                on:click={() => selectedProfile = profile}
              >
                <div class="profile-name">{profile.name}</div>
                <div class="profile-specs">
                  {profile.bedSize.x}×{profile.bedSize.y}mm | {profile.nozzleDiameter}mm nozzle
                </div>
              </button>
            {/each}
          </div>

          <div class="profile-details">
            <h5>Profile Settings</h5>
            <div class="details-grid">
              <div class="detail">
                <span class="detail-label">Bed Size:</span>
                <span class="detail-value">
                  {selectedProfile.bedSize.x}×{selectedProfile.bedSize.y}×{selectedProfile.bedSize.z}mm
                </span>
              </div>
              <div class="detail">
                <span class="detail-label">Nozzle:</span>
                <span class="detail-value">{selectedProfile.nozzleDiameter}mm</span>
              </div>
              <div class="detail">
                <span class="detail-label">Temp:</span>
                <span class="detail-value">
                  {selectedProfile.temperature.nozzle}°C / {selectedProfile.temperature.bed}°C
                </span>
              </div>
              <div class="detail">
                <span class="detail-label">Layer Height:</span>
                <span class="detail-value">{selectedProfile.layerHeight}mm</span>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Export Info -->
      <div class="export-info">
        <div class="info-row">
          <span class="info-label">Format:</span>
          <span class="info-value">{formats.find(f => f.id === selectedFormat)?.name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Estimated Size:</span>
          <span class="info-value">{estimatedSize}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Filename:</span>
          <span class="info-value filename-preview">
            {filename.replace(/\.[^/.]+$/, '')}.{selectedFormat}
          </span>
        </div>
      </div>

      <!-- Export Button -->
      <button class="export-btn" on:click={handleExport} disabled={!mesh}>
        <span class="btn-icon">💾</span>
        <span>Export as {selectedFormat.toUpperCase()}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .advanced-export {
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
    gap: 1.5rem;
  }

  .format-section,
  .options-section,
  .printer-section {
    padding: 1rem;
    background: #f7fafc;
    border-radius: 6px;
  }

  .format-grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .format-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .format-card:hover {
    border-color: #4299e1;
    transform: translateX(4px);
  }

  .format-card.selected {
    border-color: #4299e1;
    background: #ebf8ff;
  }

  .format-icon {
    font-size: 2rem;
    flex-shrink: 0;
  }

  .format-info {
    flex: 1;
  }

  .format-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: #2d3748;
    margin-bottom: 0.25rem;
  }

  .format-description {
    font-size: 0.8rem;
    color: #718096;
  }

  .checkbox-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: white;
    border-radius: 6px;
    margin-bottom: 0.5rem;
    cursor: pointer;
  }

  .checkbox-option:last-child {
    margin-bottom: 0;
  }

  .checkbox-option input {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .checkbox-option span {
    font-size: 0.9rem;
    color: #4a5568;
  }

  .profile-selector {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .profile-btn {
    padding: 0.75rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .profile-btn:hover {
    border-color: #4299e1;
  }

  .profile-btn.selected {
    border-color: #4299e1;
    background: #ebf8ff;
  }

  .profile-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: #2d3748;
    margin-bottom: 0.25rem;
  }

  .profile-specs {
    font-size: 0.8rem;
    color: #718096;
  }

  .profile-details {
    padding: 1rem;
    background: white;
    border-radius: 6px;
  }

  .details-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .detail {
    display: flex;
    flex-direction: column;
  }

  .detail-label {
    font-size: 0.75rem;
    color: #a0aec0;
    text-transform: uppercase;
  }

  .detail-value {
    font-size: 0.9rem;
    color: #2d3748;
    font-weight: 600;
  }

  .export-info {
    padding: 1rem;
    background: #f7fafc;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .info-label {
    font-size: 0.85rem;
    color: #718096;
  }

  .info-value {
    font-size: 0.85rem;
    color: #2d3748;
    font-weight: 600;
  }

  .filename-preview {
    font-family: monospace;
    background: white;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
  }

  .export-btn {
    width: 100%;
    padding: 1rem;
    background: #48bb78;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .export-btn:hover:not(:disabled) {
    background: #38a169;
  }

  .export-btn:disabled {
    background: #cbd5e0;
    cursor: not-allowed;
  }

  .btn-icon {
    font-size: 1.2rem;
  }
</style>
