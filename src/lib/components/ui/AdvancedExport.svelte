<script lang="ts">
  import { onMount } from 'svelte';
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
  onMount(() => {
    if (window.matchMedia?.('(max-width: 768px)').matches) showPanel = true;
  });
  let selectedFormat: ExportFormat = 'stl';
  let binaryFormat = true;

  const formats = [
    { id: 'stl' as ExportFormat, name: 'STL', icon: '📦', description: 'Maillage validé, axe Z vertical, compatible avec les logiciels de découpe' },
    { id: 'obj' as ExportFormat, name: 'OBJ', icon: '🔷', description: 'Maillage Wavefront validé pour les outils 3D compatibles' },
    { id: '3mf' as ExportFormat, name: '3MF', icon: '📐', description: 'Fichier conforme aux normes, en millimètres, avec métadonnées' }
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
    <h3>💾 Export avancé</h3>
    <button type="button" class="toggle-btn" aria-expanded={showPanel}
      aria-label={showPanel ? 'Masquer les options d’export' : 'Afficher les options d’export'}
      on:click={() => showPanel = !showPanel}>
      {showPanel ? '▼' : '▶'}
    </button>
  </div>

  {#if showPanel}
    <div class="panel-content">
      <!-- Format Selection -->
      <div class="format-section">
        <h4>Format d’export</h4>
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
          <h4>Options STL</h4>
          <label class="checkbox-option">
            <input type="checkbox" bind:checked={binaryFormat} />
            <span>Format binaire (fichier plus léger)</span>
          </label>
          <p class="format-note">
            Les fichiers STL ne définissent pas d’unité ; les dimensions exportées sont destinées aux logiciels de découpe qui les interprètent en millimètres.
          </p>
        </div>
      {/if}

      <p class="slicer-note">
        Générez le G-code adapté à votre imprimante avec un logiciel de découpe fiable comme OrcaSlicer, PrusaSlicer, Bambu Studio ou Cura.
      </p>

      <!-- Export Info -->
      <div class="export-info">
        <div class="info-row">
          <span class="info-label">Format:</span>
          <span class="info-value">{formats.find(f => f.id === selectedFormat)?.name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Taille estimée :</span>
          <span class="info-value">{estimatedSize}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Nom du fichier :</span>
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
        <span>Exporter en {selectedFormat.toUpperCase()}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .advanced-export {
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


  .toggle-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-muted);
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
    background: var(--surface-muted);
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
    background: var(--surface-input);
    border: 2px solid var(--border-default);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .format-card:hover {
    border-color: var(--color-primary-500);
    transform: translateX(4px);
  }

  .format-card.selected {
    border-color: var(--color-primary-500);
    background: var(--surface-callout);
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
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .format-description {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .checkbox-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--surface-input);
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
    color: var(--text-secondary);
  }


  .format-note,
  .slicer-note {
    margin: 0.75rem 0 0;
    color: var(--text-secondary);
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
    background: var(--surface-muted);
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
    color: var(--text-secondary);
  }

  .info-value {
    font-size: 0.85rem;
    color: var(--text-primary);
    font-weight: 600;
  }

  .filename-preview {
    font-family: monospace;
    background: var(--surface-input);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
  }

  .export-btn {
    width: 100%;
    padding: 1rem;
    background: var(--color-secondary-700);
    color: var(--text-on-brand);
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
    background: var(--color-secondary-800);
  }

  .export-btn:disabled {
    background: var(--surface-muted);
    color: var(--text-muted);
    cursor: not-allowed;
  }

  .btn-icon {
    font-size: 1.2rem;
  }
  @media (max-width: 768px) {
    .toggle-btn { width: 44px; height: 44px; color: var(--text-primary); font-size: 1rem; }
    .format-card { min-height: 44px; min-width: 0; }
    .format-info, .info-row { min-width: 0; overflow-wrap: anywhere; }
    .info-row { gap: 0.5rem; }
  }
</style>
