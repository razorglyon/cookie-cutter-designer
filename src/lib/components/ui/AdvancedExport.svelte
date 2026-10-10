<script lang="ts">
  import type { Mesh, Group } from 'three';
  import {
    exportToOBJ,
    exportTo3MF,
    estimateExportSize,
    type ExportFormat
  } from '../../utils/advancedExporter';
  import { exportToSTL } from '../../utils/stlExporter';
  import type { CookieCutterParams } from '../../types/CookieCutter';

  export let mesh: Mesh | Group | null;
  export let filename: string;
  export let params: Readonly<CookieCutterParams> | undefined = undefined;
  /** Query the owner at click time, even before reactive props have flushed. */
  export let captureExport: (() => { mesh: Mesh | Group; params: Readonly<CookieCutterParams> | undefined; filename: string } | null) | undefined = undefined;
  export let unavailableReason: string | null = null;

  let showPanel = false;
  let selectedFormat: ExportFormat = 'stl';
  let binaryFormat = true;

  const formats = [
    { id: 'stl' as ExportFormat, name: 'STL', icon: '📦', description: 'Validated mesh in slicer-compatible Z-up coordinates' },
    { id: 'obj' as ExportFormat, name: 'OBJ', icon: '🔷', description: 'Validated Wavefront mesh for compatible 3D tools' },
    { id: '3mf' as ExportFormat, name: '3MF', icon: '📐', description: 'Standards-compliant package with millimeter units and metadata' }
  ];

  function handleExport() {
    const snapshot = captureExport ? captureExport() : mesh ? { mesh, params, filename } : null;
    if (!snapshot) return;
    const { mesh: exportMesh, params: exportParams } = snapshot;
    const exportFilename = snapshot.filename.replace(/\.[^/.]+$/, '');

    switch (selectedFormat) {
      case 'stl':
        exportToSTL(exportMesh, `${exportFilename}.stl`, { binary: binaryFormat });
        break;
      case 'obj':
        exportToOBJ(exportMesh, `${exportFilename}.obj`);
        break;
      case '3mf':
        exportTo3MF(exportMesh, `${exportFilename}.3mf`, exportParams);
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
          <p class="format-note">
            STL files are unitless; this application exports dimensions for slicers that interpret them as millimeters.
          </p>
        </div>
      {/if}

      <p class="slicer-note">
        Generate printer-specific G-code with a trusted slicer such as OrcaSlicer, PrusaSlicer, Bambu Studio, or Cura.
      </p>

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
      {#if unavailableReason}
        <p id="geometry-export-reason" role="status">{unavailableReason}</p>
      {/if}
      <button class="export-btn" on:click={handleExport} disabled={!mesh || unavailableReason !== null}
        aria-describedby={unavailableReason ? 'geometry-export-reason' : undefined}>
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
  .options-section {
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


  .format-note,
  .slicer-note {
    margin: 0.75rem 0 0;
    color: var(--text-muted);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .slicer-note {
    padding: 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--surface-muted);
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
