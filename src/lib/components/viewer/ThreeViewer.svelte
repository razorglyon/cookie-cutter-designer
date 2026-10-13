<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { createViewerProjection, type ViewerProjection } from '../../utils/viewerProjection';
  import {
    createWallThicknessColorAttribute,
    getTriangleWallThicknesses,
    measureWallThicknessRange,
    type WallThicknessRange
  } from '../../utils/wallThicknessHeatmap';

  export let mesh: THREE.Mesh | THREE.Group | null = null;
  export let buildPlateSize = 200;
  // Legacy viewers remain editable; document-owned previews explicitly opt out.
  export let allowObjectDeletion: boolean = true;
  const deletionUnavailableReason = 'La géométrie générée est un aperçu en lecture seule. La modification permanente des pièces n’est pas disponible dans la V1.';
  export let viewport: import('../../domain/designDocument').ViewportPreferences = { showGrid: true, showAxes: false, showWallThickness: false };
  export let onViewportChange: (value: import('../../domain/designDocument').ViewportPreferences) => void = () => {};

  const dispatch = createEventDispatcher<{ deleteObject: THREE.Object3D }>();

  let container: HTMLDivElement;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let animationId: number | undefined;
  let gridHelper: THREE.GridHelper;
  let buildPlateBorder: THREE.LineSegments;
  let axesHelper: THREE.AxesHelper;
  let raycaster: THREE.Raycaster;
  let mouse: THREE.Vector2;
  let displayedMesh: THREE.Mesh | THREE.Group | null = null;
  let displayedSource: THREE.Mesh | THREE.Group | null = null;
  let viewerProjection: ViewerProjection | null = null;
  let selectedObject: THREE.Mesh | null = null;
  let selectionHelper: THREE.BoxHelper | null = null;
  let selectionMode = false;
  let renderedBuildPlateSize = buildPlateSize;
  let themeObserver: MutationObserver | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let wallHeatmapEnabled = false;
  let wallHeatmapAvailable = false;
  let wallHeatmapRange: WallThicknessRange | null = null;
  let wallHeatmapTarget: number | null = null;
  let wallHeatmapTargetPosition = 50;

  interface HeatmapOverride {
    readonly mesh: THREE.Mesh;
    readonly sourceGeometry: THREE.BufferGeometry;
    readonly sourceMaterial: THREE.Material | THREE.Material[];
    readonly heatmapGeometry: THREE.BufferGeometry;
    readonly heatmapMaterial: THREE.Material | THREE.Material[];
  }

  let heatmapOverrides: HeatmapOverride[] = [];

  onMount(() => {
    initThree();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(container);
    }
    themeObserver = new MutationObserver(applySceneTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    animate();
  });

  onDestroy(() => {
    if (animationId !== undefined) cancelAnimationFrame(animationId);

    clearSelection();
    clearWallThicknessHeatmap();
    viewerProjection?.dispose();
    viewerProjection = null;
    displayedSource = null;
    displayedMesh = null;

    window.removeEventListener('resize', handleResize);
    resizeObserver?.disconnect();
    themeObserver?.disconnect();
    renderer?.domElement.removeEventListener('click', handleClick);
    controls?.dispose();

    disposeRenderable(gridHelper);
    disposeRenderable(buildPlateBorder);
    disposeRenderable(axesHelper);

    if (renderer) {
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  });

  function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else {
      material.dispose();
    }
  }

  function disposeRenderable(object: THREE.Object3D | undefined): void {
    if (!object) return;
    scene?.remove(object);

    if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry) {
      object.geometry.dispose();
    }
    if ('material' in object) {
      const material = object.material;
      if (material instanceof THREE.Material || Array.isArray(material)) {
        disposeMaterial(material as THREE.Material | THREE.Material[]);
      }
    }
  }

  function targetWallThickness(object: THREE.Object3D | null): number | null {
    const params = object?.userData.params as { wallThickness?: unknown } | undefined;
    const value = params?.wallThickness;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  }

  function cloneHeatmapMaterial(
    material: THREE.Material | THREE.Material[]
  ): THREE.Material | THREE.Material[] {
    const clone = (source: THREE.Material): THREE.Material => {
      const result = source.clone() as THREE.Material & {
        color?: THREE.Color;
        vertexColors?: boolean;
      };
      if (result.color instanceof THREE.Color) result.color.set(0xffffff);
      if ('vertexColors' in result) result.vertexColors = true;
      result.needsUpdate = true;
      return result;
    };

    return Array.isArray(material) ? material.map(clone) : clone(material);
  }

  function clearWallThicknessHeatmap(): void {
    for (const override of heatmapOverrides) {
      override.mesh.geometry = override.sourceGeometry;
      override.mesh.material = override.sourceMaterial;
      override.heatmapGeometry.dispose();
      disposeMaterial(override.heatmapMaterial);
    }
    heatmapOverrides = [];
    wallHeatmapRange = null;
    wallHeatmapTargetPosition = 50;
  }

  function displayWallMeasurements(child: THREE.Mesh): readonly number[] | null {
    const original = viewerProjection?.sourceMesh(child);
    return original ? getTriangleWallThicknesses(original.geometry) : null;
  }

  function refreshWallHeatmapAvailability(): void {
    const target = targetWallThickness(displayedMesh);
    wallHeatmapTarget = target;
    let hasMeasurements = false;
    displayedMesh?.traverse((child) => {
      if (child instanceof THREE.Mesh && displayWallMeasurements(child)) {
        hasMeasurements = true;
      }
    });
    wallHeatmapAvailable = target !== null && hasMeasurements;
    wallHeatmapEnabled = viewport.showWallThickness && wallHeatmapAvailable;
  }

  function applyWallThicknessHeatmap(): void {
    clearWallThicknessHeatmap();
    const target = targetWallThickness(displayedMesh);
    if (!displayedMesh || target === null) return;

    const entries: Array<{
      mesh: THREE.Mesh;
      measurements: readonly number[];
    }> = [];
    const allMeasurements: number[] = [];
    displayedMesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const measurements = displayWallMeasurements(child);
      if (!measurements) return;
      entries.push({ mesh: child, measurements });
      allMeasurements.push(...measurements);
    });
    if (allMeasurements.length === 0) return;

    const range = measureWallThicknessRange(allMeasurements);
    const maximum = Math.max(range.max, target);
    const span = range.max - range.min;
    wallHeatmapTargetPosition = span <= Number.EPSILON
      ? 50
      : THREE.MathUtils.clamp(((target - range.min) / span) * 100, 0, 100);
    for (const { mesh: child, measurements } of entries) {
      const heatmapGeometry = child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone();
      const positions = heatmapGeometry.getAttribute('position');
      if (positions.count !== measurements.length * 3) {
        heatmapGeometry.dispose();
        continue;
      }
      heatmapGeometry.setAttribute(
        'color',
        createWallThicknessColorAttribute(measurements, target, maximum, positions)
      );
      const heatmapMaterial = cloneHeatmapMaterial(child.material);
      heatmapOverrides.push({
        mesh: child,
        sourceGeometry: child.geometry,
        sourceMaterial: child.material,
        heatmapGeometry,
        heatmapMaterial
      });
      child.geometry = heatmapGeometry;
      child.material = heatmapMaterial;
    }

    if (heatmapOverrides.length > 0) wallHeatmapRange = range;
  }

  function projectViewport(value: import('../../domain/designDocument').ViewportPreferences): void {
    if (!scene) return;
    gridHelper.visible = value.showGrid;
    buildPlateBorder.visible = value.showGrid;
    axesHelper.visible = value.showAxes;
    const enabled = value.showWallThickness && wallHeatmapAvailable;
    if (enabled !== wallHeatmapEnabled || (enabled && heatmapOverrides.length === 0)) {
      wallHeatmapEnabled = enabled;
      if (enabled) applyWallThicknessHeatmap(); else clearWallThicknessHeatmap();
    }
  }
  function userViewportChange(patch: Partial<import('../../domain/designDocument').ViewportPreferences>): void {
    viewport = { ...viewport, ...patch };
    projectViewport(viewport);
    onViewportChange(viewport);
  }
  function handleWallHeatmapChange(event: Event): void {
    userViewportChange({ showWallThickness: (event.currentTarget as HTMLInputElement).checked });
  }

  function createBuildPlate(size: number): void {
    gridHelper = new THREE.GridHelper(size, 20, 0x666666, 0xcccccc);
    scene.add(gridHelper);

    const plateGeometry = new THREE.PlaneGeometry(size, size);
    const borderGeometry = new THREE.EdgesGeometry(plateGeometry);
    plateGeometry.dispose();

    buildPlateBorder = new THREE.LineSegments(
      borderGeometry,
      new THREE.LineBasicMaterial({ color: 0xff6b6b, linewidth: 2 })
    );
    buildPlateBorder.rotation.x = -Math.PI / 2;
    buildPlateBorder.position.y = 0.1;
    scene.add(buildPlateBorder);
    renderedBuildPlateSize = size;
  }

  function replaceBuildPlate(): void {
    disposeRenderable(gridHelper);
    disposeRenderable(buildPlateBorder);
    createBuildPlate(buildPlateSize);
    projectViewport(viewport);
  }

  function initThree(): void {
    scene = new THREE.Scene();
    applySceneTheme();
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 50, 100);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Aperçu 3D du modèle. Glissez pour tourner ; utilisez les boutons pour zoomer.');
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 500;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-1, 0.5, -1);
    scene.add(directionalLight2);

    createBuildPlate(buildPlateSize);
    axesHelper = new THREE.AxesHelper(30);
    scene.add(axesHelper);

    window.addEventListener('resize', handleResize);
    renderer.domElement.addEventListener('click', handleClick);
    updateDisplayedMesh(mesh);
    projectViewport(viewport);
  }

  function applySceneTheme(): void {
    if (!scene) return;
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue('--viewer-scene')
      .trim() || '#f0f0f0';
    scene.background = new THREE.Color(background);
  }

  function handleClick(event: MouseEvent): void {
    if (!selectionMode || !displayedMesh) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const clickedObject = raycaster
      .intersectObject(displayedMesh, true)
      .map((intersection) => intersection.object)
      .find((object): object is THREE.Mesh => object instanceof THREE.Mesh);

    if (!clickedObject) {
      clearSelection();
      return;
    }

    if (selectedObject === clickedObject) {
      clearSelection();
      return;
    }

    clearSelection();
    selectedObject = clickedObject;
    selectionHelper = new THREE.BoxHelper(clickedObject, 0xff6b6b);
    scene.add(selectionHelper);
  }

  function clearSelection(): void {
    if (selectionHelper) disposeRenderable(selectionHelper);
    selectionHelper = null;
    selectedObject = null;
  }

  function deleteSelected(): void {
    if (!allowObjectDeletion || !selectedObject) return;

    const objectToDelete = selectedObject;
    const sourceToDelete = viewerProjection?.sourceMesh(objectToDelete);
    if (!sourceToDelete) return;
    clearSelection();
    if (heatmapOverrides.length > 0) {
      clearWallThicknessHeatmap();
      wallHeatmapEnabled = false;
    }
    objectToDelete.removeFromParent();
    dispatch('deleteObject', sourceToDelete);
  }

  function toggleSelectionMode(): void {
    selectionMode = !selectionMode;
    if (!selectionMode) clearSelection();
    if (renderer) renderer.domElement.style.cursor = selectionMode ? 'pointer' : 'default';
  }

  function handleResize(): void {
    if (!container || !camera || !renderer) return;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function animate(): void {
    animationId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  function fitCamera(object: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDimension) || maxDimension <= 0) return;

    const fieldOfView = camera.fov * (Math.PI / 180);
    const cameraDistance = Math.abs(maxDimension / 2 / Math.tan(fieldOfView / 2)) * 2.5;
    controls.minDistance = THREE.MathUtils.clamp(maxDimension / 500, 0.1, 2);
    controls.maxDistance = Math.max(500, cameraDistance * 3);
    camera.near = controls.minDistance / 20;
    camera.far = Math.max(1000, controls.maxDistance * 4);
    camera.updateProjectionMatrix();
    camera.position.set(
      center.x + cameraDistance * 0.7,
      center.y + cameraDistance * 0.8,
      center.z + cameraDistance * 0.7
    );
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
  }

  function fitCurrentView(): void {
    if (displayedMesh) fitCamera(displayedMesh);
  }

  function zoomView(factor: number): void {
    if (!displayedMesh || !camera || !controls) return;
    const offset = camera.position.clone().sub(controls.target);
    const distance = offset.length();
    if (distance <= 0) return;
    const nextDistance = THREE.MathUtils.clamp(distance * factor, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset.multiplyScalar(nextDistance / distance));
    controls.update();
  }

  function updateDisplayedMesh(next: THREE.Mesh | THREE.Group | null): void {
    if (!scene || displayedSource === next) return;

    clearSelection();
    if (displayedMesh) {
      clearWallThicknessHeatmap();
      viewerProjection?.dispose();
    }
    displayedSource = next;
    viewerProjection = next ? createViewerProjection(next) : null;
    displayedMesh = viewerProjection?.object ?? null;

    if (displayedMesh) {
      scene.add(displayedMesh);
      fitCamera(displayedMesh);
    }
    refreshWallHeatmapAvailability();
    if (wallHeatmapEnabled) applyWallThicknessHeatmap();
  }

  $: if (scene) updateDisplayedMesh(mesh);
  $: if (scene) projectViewport(viewport);
  $: if (scene && gridHelper && buildPlateBorder && buildPlateSize !== renderedBuildPlateSize) {
    replaceBuildPlate();
  }
</script>

<div class="viewer-wrapper">
  <div class="viewer-container" bind:this={container}></div>

  <!-- Selection controls overlay -->
  <div class="controls-overlay">
    <label class="heatmap-toggle"><input type="checkbox" aria-label="Afficher la grille" checked={viewport.showGrid}
      on:change={event => userViewportChange({ showGrid: event.currentTarget.checked })} />Grille</label>
    <label class="heatmap-toggle"><input type="checkbox" aria-label="Afficher les axes" checked={viewport.showAxes}
      on:change={event => userViewportChange({ showAxes: event.currentTarget.checked })} />Axes</label>
    <button
      class="control-btn"
      class:active={selectionMode}
      on:click={toggleSelectionMode}
      title={selectionMode ? 'Quitter le mode sélection' : 'Activer le mode sélection'}
      aria-label={selectionMode ? 'Quitter le mode sélection' : 'Activer le mode sélection'}
      aria-pressed={selectionMode}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      </svg>
      <span class="control-label">{selectionMode ? 'Terminer la sélection' : 'Sélectionner une pièce'}</span>
    </button>

    <button
      class="control-btn"
      on:click={fitCurrentView}
      title="Ajuster le modèle à la vue"
      aria-label="Ajuster le modèle à la vue"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      </svg>
      <span class="control-label">Ajuster la vue</span>
    </button>

    <div class="zoom-controls" role="group" aria-label="Zoom de l’aperçu 3D">
      <button type="button" class="control-btn" on:click={() => zoomView(0.8)}
        disabled={!displayedMesh} title="Rapprocher le modèle" aria-label="Rapprocher le modèle">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span class="control-label">Zoom +</span>
      </button>
      <button type="button" class="control-btn" on:click={() => zoomView(1.25)}
        disabled={!displayedMesh} title="Éloigner le modèle" aria-label="Éloigner le modèle">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
        <span class="control-label">Zoom −</span>
      </button>
    </div>

    <label
      class="heatmap-toggle"
      class:active={wallHeatmapEnabled}
      class:disabled={!wallHeatmapAvailable}
      title={wallHeatmapAvailable
        ? 'Colorer l’emporte-pièce selon l’épaisseur mesurée de ses parois'
        : 'La carte d’épaisseur des parois n’est disponible que pour les emporte-pièces'}
    >
      <input
        type="checkbox"
        checked={wallHeatmapEnabled}
        on:change={handleWallHeatmapChange}
        disabled={!wallHeatmapAvailable}
        aria-describedby={wallHeatmapEnabled ? 'wall-heatmap-legend' : undefined}
      />
      <span class="heatmap-swatch" aria-hidden="true"></span>
      <span class="control-label">Carte d’épaisseur</span>
    </label>

    {#if wallHeatmapEnabled && wallHeatmapRange && wallHeatmapTarget !== null}
      <div
        id="wall-heatmap-legend"
        class="heatmap-legend"
        aria-label={`Épaisseur mesurée des parois : de ${wallHeatmapRange.min.toFixed(2)} à ${wallHeatmapRange.max.toFixed(2)} millimètres. Cible : ${wallHeatmapTarget.toFixed(2)} millimètres.`}
      >
        <div class="heatmap-target">Cible : {wallHeatmapTarget.toFixed(2)} mm</div>
        <div
          class="heatmap-scale"
          style={`--heatmap-target-position: ${wallHeatmapTargetPosition}%`}
          aria-hidden="true"
        ></div>
        <div class="heatmap-values">
          <span>Min {wallHeatmapRange.min.toFixed(2)} mm</span>
          <span>Max {wallHeatmapRange.max.toFixed(2)} mm</span>
        </div>
      </div>
    {/if}

    {#if selectionMode && selectedObject}
      <button
        class="control-btn delete-btn"
        on:click={deleteSelected}
        disabled={!allowObjectDeletion}
        aria-describedby={!allowObjectDeletion ? 'viewer-deletion-reason' : undefined}
        title={!allowObjectDeletion ? deletionUnavailableReason : 'Supprimer l’élément sélectionné'}
        aria-label="Supprimer l’élément sélectionné"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        <span class="control-label">Supprimer</span>
      </button>
      {#if !allowObjectDeletion}
        <p id="viewer-deletion-reason" class="selection-hint">{deletionUnavailableReason}</p>
      {/if}
    {/if}

    {#if selectionMode}
      <div class="selection-hint">
        Cliquez sur un élément pour le sélectionner
      </div>
    {/if}
  </div>
</div>

<style>
  .viewer-wrapper {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    position: relative;
  }

  .viewer-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    touch-action: none;
  }

  :global(.viewer-container canvas) {
    display: block;
  }

  .controls-overlay {
    position: absolute;
    top: 1rem;
    right: 1rem;
    left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 10;
  }

  .control-btn,
  .heatmap-toggle {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--surface-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
    box-shadow: var(--shadow-sm);
    min-height: 44px;
    width: max-content;
    max-width: 100%;
  }

  .heatmap-toggle {
    user-select: none;
  }

  .zoom-controls {
    display: flex;
    gap: var(--spacing-1);
  }

  .control-btn:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  .control-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .heatmap-toggle input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--color-primary-500);
    cursor: pointer;
  }

  .heatmap-swatch {
    width: 32px;
    height: 10px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-full);
    background: linear-gradient(90deg, #2563eb 0%, #22c55e 50%, #f97316 100%);
  }

  .control-btn:hover,
  .heatmap-toggle:hover:not(.disabled) {
    border-color: var(--color-primary-400);
    background: var(--surface-callout);
  }

  .control-btn.active,
  .heatmap-toggle.active {
    border-color: var(--color-primary-500);
    background: var(--surface-callout);
    color: var(--color-primary-600);
  }

  .heatmap-toggle.disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .heatmap-toggle.disabled input {
    cursor: not-allowed;
  }

  .heatmap-legend {
    width: min(320px, 100%);
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--surface-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
  }

  .heatmap-scale {
    height: 10px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-full);
    background: linear-gradient(
      90deg,
      #2563eb 0%,
      #22c55e var(--heatmap-target-position),
      #f97316 100%
    );
  }

  .heatmap-target {
    margin-bottom: var(--spacing-1);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
  }

  .heatmap-values {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-1);
    margin-top: var(--spacing-1);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1.35;
  }

  .heatmap-values span:last-child {
    text-align: right;
  }

  .control-btn.delete-btn {
    background: var(--color-error-light);
    border-color: var(--color-error);
    color: var(--color-error);
  }

  .control-btn.delete-btn:hover {
    background: var(--color-error-light);
    border-color: var(--color-error);
  }

  .selection-hint {
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--surface-elevated);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    box-shadow: var(--shadow-sm);
  }

  @media (max-width: 480px) {
    .controls-overlay {
      top: var(--spacing-2);
      right: var(--spacing-2);
      left: var(--spacing-2);
      flex-direction: row;
      flex-wrap: wrap;
      gap: var(--spacing-1);
    }

    .control-btn {
      width: 44px;
      min-width: 44px;
      padding: var(--spacing-2);
      justify-content: center;
    }

    .control-label {
      display: none;
    }

    .heatmap-toggle {
      padding: var(--spacing-2);
      min-height: 44px;
    }

    .heatmap-toggle .control-label {
      display: inline;
    }

    .heatmap-swatch {
      width: 24px;
    }

    .heatmap-legend {
      flex-basis: 100%;
    }

    .selection-hint {
      flex-basis: 100%;
      width: 100%;
    }
  }
</style>
