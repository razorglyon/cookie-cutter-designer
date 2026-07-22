<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

  export let mesh: THREE.Mesh | THREE.Group | null = null;
  export let buildPlateSize = 200;

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
  let selectedObject: THREE.Mesh | null = null;
  let selectionHelper: THREE.BoxHelper | null = null;
  let selectionMode = false;
  let renderedBuildPlateSize = buildPlateSize;
  let themeObserver: MutationObserver | undefined;
  let resizeObserver: ResizeObserver | undefined;

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
    if (displayedMesh && scene) scene.remove(displayedMesh);
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
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 10;
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
    if (!selectedObject) return;

    const objectToDelete = selectedObject;
    clearSelection();
    dispatch('deleteObject', objectToDelete);
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

  function updateDisplayedMesh(next: THREE.Mesh | THREE.Group | null): void {
    if (!scene || displayedMesh === next) return;

    clearSelection();
    if (displayedMesh) scene.remove(displayedMesh);
    displayedMesh = next;

    if (displayedMesh) {
      scene.add(displayedMesh);
      fitCamera(displayedMesh);
    }
  }

  $: if (scene) updateDisplayedMesh(mesh);
  $: if (scene && gridHelper && buildPlateBorder && buildPlateSize !== renderedBuildPlateSize) {
    replaceBuildPlate();
  }
</script>

<div class="viewer-wrapper">
  <div class="viewer-container" bind:this={container}></div>

  <!-- Selection controls overlay -->
  <div class="controls-overlay">
    <button
      class="control-btn"
      class:active={selectionMode}
      on:click={toggleSelectionMode}
      title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
      aria-label={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
      aria-pressed={selectionMode}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      </svg>
      <span class="control-label">{selectionMode ? 'Finish selecting' : 'Select part'}</span>
    </button>

    <button
      class="control-btn"
      on:click={fitCurrentView}
      title="Fit model in view"
      aria-label="Fit model in view"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      </svg>
      <span class="control-label">Fit view</span>
    </button>

    {#if selectionMode && selectedObject}
      <button
        class="control-btn delete-btn"
        on:click={deleteSelected}
        title="Delete selected element"
        aria-label="Delete selected element"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        <span class="control-label">Delete</span>
      </button>
    {/if}

    {#if selectionMode}
      <div class="selection-hint">
        Click on an element to select it
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

  .control-btn {
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

  .control-btn:hover {
    border-color: var(--color-primary-400);
    background: var(--surface-callout);
  }

  .control-btn.active {
    border-color: var(--color-primary-500);
    background: var(--surface-callout);
    color: var(--color-primary-600);
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

    .selection-hint {
      flex-basis: 100%;
      width: 100%;
    }
  }
</style>
