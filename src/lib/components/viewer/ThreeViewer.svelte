<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

  export let mesh: THREE.Mesh | THREE.Group | null = null;
  export let buildPlateSize: number = 200; // Default 200mm

  let container: HTMLDivElement;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let animationId: number;
  let gridHelper: THREE.GridHelper;
  let buildPlateBorder: THREE.LineSegments;
  let raycaster: THREE.Raycaster;
  let mouse: THREE.Vector2;
  let selectedObject: THREE.Object3D | null = null;
  let selectionMode: boolean = false;
  let highlightMaterial: THREE.MeshStandardMaterial;

  onMount(() => {
    initThree();
    animate();
  });

  onDestroy(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    if (renderer) {
      renderer.dispose();
    }
    if (controls) {
      controls.dispose();
    }
  });

  function initThree() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Raycaster for object picking
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Highlight material for selected objects
    highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6b6b,
      emissive: 0xff0000,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.8
    });

    // Camera
    camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 50, 100);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 10;
    controls.maxDistance = 500;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-1, 0.5, -1);
    scene.add(directionalLight2);

    // Build plate grid - dynamic size based on parameter
    gridHelper = new THREE.GridHelper(buildPlateSize, 20, 0x666666, 0xcccccc);
    scene.add(gridHelper);

    // Build plate border to show the limits clearly
    const borderGeometry = new THREE.EdgesGeometry(
      new THREE.PlaneGeometry(buildPlateSize, buildPlateSize)
    );
    const borderMaterial = new THREE.LineBasicMaterial({
      color: 0xff6b6b,
      linewidth: 2
    });
    buildPlateBorder = new THREE.LineSegments(borderGeometry, borderMaterial);
    buildPlateBorder.rotation.x = -Math.PI / 2;
    buildPlateBorder.position.y = 0.1; // Slightly above grid to be visible
    scene.add(buildPlateBorder);

    // Axes helper (smaller, less intrusive)
    const axesHelper = new THREE.AxesHelper(30);
    scene.add(axesHelper);

    // Handle window resize
    window.addEventListener('resize', handleResize);

    // Handle mouse clicks for selection
    renderer.domElement.addEventListener('click', handleClick);
  }

  function handleClick(event: MouseEvent) {
    if (!selectionMode) return;

    // Calculate mouse position in normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(mouse, camera);

    // Find intersected objects (only meshes within cookieCutter group, not grid/axes)
    const cookieCutterGroup = scene.children.find(child => child.name === 'cookieCutter');
    if (!cookieCutterGroup) return;

    const intersects = raycaster.intersectObjects(
      cookieCutterGroup.children.filter(child => child instanceof THREE.Mesh),
      true
    );

    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;

      // Toggle selection
      if (selectedObject === clickedObject) {
        // Deselect
        restoreOriginalMaterial(selectedObject);
        selectedObject = null;
      } else {
        // Deselect previous
        if (selectedObject) {
          restoreOriginalMaterial(selectedObject);
        }
        // Select new
        selectedObject = clickedObject;
        highlightObject(selectedObject);
      }
    } else {
      // Click on empty space - deselect
      if (selectedObject) {
        restoreOriginalMaterial(selectedObject);
        selectedObject = null;
      }
    }
  }

  function highlightObject(obj: THREE.Object3D) {
    if (obj instanceof THREE.Mesh) {
      // Store original material
      (obj as any).originalMaterial = obj.material;
      obj.material = highlightMaterial;
    }
  }

  function restoreOriginalMaterial(obj: THREE.Object3D) {
    if (obj instanceof THREE.Mesh && (obj as any).originalMaterial) {
      obj.material = (obj as any).originalMaterial;
      delete (obj as any).originalMaterial;
    }
  }

  function deleteSelected() {
    if (selectedObject && selectedObject.parent) {
      selectedObject.parent.remove(selectedObject);

      // Dispose geometry and material
      if (selectedObject instanceof THREE.Mesh) {
        selectedObject.geometry?.dispose();
        if (Array.isArray(selectedObject.material)) {
          selectedObject.material.forEach(mat => mat.dispose());
        } else {
          selectedObject.material?.dispose();
        }
      }

      selectedObject = null;
    }
  }

  function toggleSelectionMode() {
    selectionMode = !selectionMode;

    // Deselect if leaving selection mode
    if (!selectionMode && selectedObject) {
      restoreOriginalMaterial(selectedObject);
      selectedObject = null;
    }

    // Change cursor
    if (renderer && renderer.domElement) {
      renderer.domElement.style.cursor = selectionMode ? 'pointer' : 'default';
    }
  }

  function handleResize() {
    if (!container || !camera || !renderer) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function animate() {
    animationId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  // Update build plate when size changes
  $: if (scene && gridHelper && buildPlateBorder) {
    // Remove old grid and border
    scene.remove(gridHelper);
    scene.remove(buildPlateBorder);
    gridHelper.geometry.dispose();
    buildPlateBorder.geometry.dispose();

    // Create new grid with updated size
    gridHelper = new THREE.GridHelper(buildPlateSize, 20, 0x666666, 0xcccccc);
    scene.add(gridHelper);

    // Create new border with updated size
    const borderGeometry = new THREE.EdgesGeometry(
      new THREE.PlaneGeometry(buildPlateSize, buildPlateSize)
    );
    const borderMaterial = new THREE.LineBasicMaterial({
      color: 0xff6b6b,
      linewidth: 2
    });
    buildPlateBorder = new THREE.LineSegments(borderGeometry, borderMaterial);
    buildPlateBorder.rotation.x = -Math.PI / 2;
    buildPlateBorder.position.y = 0.1;
    scene.add(buildPlateBorder);
  }

  // Update mesh when it changes
  $: if (scene && mesh) {
    // Remove old mesh/group
    const oldObject = scene.children.find(child => child.name === 'cookieCutter');
    if (oldObject) {
      scene.remove(oldObject);
      // Dispose old geometry and material
      oldObject.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    }

    // Add new mesh/group
    if (!mesh.name) {
      mesh.name = 'cookieCutter';
    }
    scene.add(mesh);

    // Center camera on mesh and position it better
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 2.5; // Zoom out more for better view

    // Position camera at an angle for better 3D view
    camera.position.set(
      center.x + cameraZ * 0.7,
      center.y + cameraZ * 0.8,
      center.z + cameraZ * 0.7
    );

    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
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
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      </svg>
      {selectionMode ? 'Selection ON' : 'Selection OFF'}
    </button>

    {#if selectionMode && selectedObject}
      <button
        class="control-btn delete-btn"
        on:click={deleteSelected}
        title="Delete selected element"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        Delete
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
    position: relative;
  }

  .viewer-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  :global(.viewer-container canvas) {
    display: block;
  }

  .controls-overlay {
    position: absolute;
    top: 1rem;
    left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 10;
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
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .control-btn:hover {
    border-color: #cbd5e0;
    background: #f7fafc;
  }

  .control-btn.active {
    border-color: #4299e1;
    background: #ebf8ff;
    color: #2c5282;
  }

  .control-btn.delete-btn {
    background: #fff5f5;
    border-color: #fc8181;
    color: #c53030;
  }

  .control-btn.delete-btn:hover {
    background: #fed7d7;
    border-color: #f56565;
  }

  .selection-hint {
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 6px;
    font-size: 0.8rem;
    color: #718096;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
</style>
