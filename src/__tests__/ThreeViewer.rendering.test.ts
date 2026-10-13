// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Viewer from '../lib/components/viewer/ThreeViewer.svelte';
import { serializeSTL } from '../lib/utils/stlExporter';
import { setTriangleWallThicknesses } from '../lib/utils/wallThicknessHeatmap';

const observed = vi.hoisted(() => ({ scene: undefined as unknown, camera: undefined as unknown, controls: undefined as unknown }));
vi.mock('three', async original => {
  const actual = await original<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    domElement = document.createElement('canvas'); renderLists = { dispose() {} };
    setSize() {} setPixelRatio() {} dispose() {} forceContextLoss() {}
    render(scene: unknown, camera: unknown) { observed.scene = scene; observed.camera = camera; }
  } };
});
vi.mock('three/examples/jsm/controls/OrbitControls.js', async original => {
  const actual = await original<typeof import('three/examples/jsm/controls/OrbitControls.js')>();
  return { OrbitControls: class extends actual.OrbitControls {
    constructor(camera: THREE.PerspectiveCamera, canvas: HTMLElement) { super(camera, canvas); observed.controls = this; }
  } };
});

let app: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;
let owned: THREE.Mesh[] = [];
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined; target?.remove();
  for (const mesh of owned) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
  owned = []; observed.scene = undefined; observed.camera = undefined; observed.controls = undefined;
  vi.restoreAllMocks();
});
function bytes(mesh: THREE.Mesh): Uint8Array {
  const data = serializeSTL(mesh, true) as DataView;
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
}
async function start(mesh: THREE.Mesh, viewport = { showGrid: true, showAxes: false, showWallThickness: false }) {
  owned.push(mesh); target = document.body.appendChild(document.createElement('div'));
  app = mount(Viewer, { target, props: { mesh, viewport } });
  await vi.waitFor(() => expect(observed.scene).toBeInstanceOf(THREE.Scene));
  return {
    scene: observed.scene as THREE.Scene,
    camera: observed.camera as THREE.PerspectiveCamera,
    controls: observed.controls as OrbitControls
  };
}
function model(scene: THREE.Scene): THREE.Mesh {
  const meshes: THREE.Mesh[] = [];
  scene.traverse(child => { if (child instanceof THREE.Mesh) meshes.push(child); });
  expect(meshes).toHaveLength(1);
  return meshes[0];
}

it('keeps cap normals planar and curved walls smooth without modifying the source STL', async () => {
  // Deliberately weld cap/wall vertices, reproducing the indexed stamp's false rounded edge.
  const { mergeVertices } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
  const cylinder = new THREE.CylinderGeometry(10, 10, 4, 48);
  cylinder.deleteAttribute('normal'); cylinder.deleteAttribute('uv');
  const geometry = mergeVertices(cylinder); cylinder.dispose(); geometry.computeVertexNormals();
  const source = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  const originalNormals = geometry.getAttribute('normal').array.slice();
  const originalSTL = bytes(source);
  const { scene } = await start(source);
  const display = model(scene);
  const g = display.geometry, positions = g.getAttribute('position'), normals = g.getAttribute('normal'), index = g.index;
  const count = index?.count ?? positions.count;
  let capVertices = 0, smoothWallVertices = 0;
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map(n => index?.getX(i + n) ?? i + n);
    const points = ids.map(n => new THREE.Vector3().fromBufferAttribute(positions, n));
    const face = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    for (const n of ids) {
      const normal = new THREE.Vector3().fromBufferAttribute(normals, n);
      if (Math.abs(face.y) > 0.999999) {
        capVertices++; expect(normal.dot(face), 'planar caps must not inherit wall lighting').toBeCloseTo(1, 6);
      } else {
        expect(normal.y).toBeCloseTo(0, 6);
        if (normal.distanceTo(face) > 0.005) smoothWallVertices++;
      }
    }
  }
  expect(capVertices).toBeGreaterThan(0); expect(smoothWallVertices).toBeGreaterThan(0);
  expect(display).not.toBe(source); expect(display.geometry).not.toBe(geometry);
  expect((display.material as THREE.MeshStandardMaterial).flatShading).toBe(false);
  expect(source.geometry).toBe(geometry); expect(geometry.getAttribute('normal').array).toEqual(originalNormals);
  expect(bytes(source)).toEqual(originalSTL);
  const disposed = vi.spyOn(display.geometry, 'dispose'), sourceDisposed = vi.spyOn(geometry, 'dispose');
  await unmount(app!); app = undefined;
  expect(disposed).toHaveBeenCalledTimes(1); expect(sourceDisposed).not.toHaveBeenCalled();
});

it('never swaps the printable source geometry while the thickness overlay is active', async () => {
  const geometry = new THREE.BoxGeometry(10, 10, 10);
  setTriangleWallThicknesses(geometry, Array(geometry.index!.count / 3).fill(1));
  const material = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
  const source = new THREE.Mesh(geometry, material); source.userData.params = { wallThickness: 1 };
  const originalSTL = bytes(source);
  const { scene } = await start(source, { showGrid: true, showAxes: false, showWallThickness: true });
  const display = model(scene);
  expect(source.geometry).toBe(geometry); expect(source.material).toBe(material);
  expect(display.geometry).not.toBe(geometry); expect(display.material).not.toBe(material);
  expect(bytes(source)).toEqual(originalSTL);
  const checkbox = target.querySelector<HTMLInputElement>('input[aria-describedby="wall-heatmap-legend"]')!;
  expect(checkbox).not.toBeNull(); checkbox.checked = false; checkbox.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  expect(display.geometry).not.toBe(geometry); expect(display.material).toBe(material);
  expect(source.geometry).toBe(geometry); expect(bytes(source)).toEqual(originalSTL);
});

it.each([10, 75, 200])('permits detail inspection for a %s mm model and resets the camera without changing its STL', async size => {
  const source = new THREE.Mesh(new THREE.BoxGeometry(size, 4, size), new THREE.MeshStandardMaterial());
  const originalSTL = bytes(source);
  const { camera, controls } = await start(source);
  expect(controls.minDistance).toBeLessThan(10); expect(controls.minDistance).toBeGreaterThan(0);
  expect(camera.near).toBeLessThan(controls.minDistance / 5);
  expect(controls.zoomToCursor).toBe(true); expect(controls.screenSpacePanning).toBe(true);
  const initialDistance = controls.getDistance();
  const closer = target.querySelector<HTMLButtonElement>('[aria-label="Rapprocher le modèle"]');
  const farther = target.querySelector<HTMLButtonElement>('[aria-label="Éloigner le modèle"]');
  expect(closer).not.toBeNull(); expect(farther).not.toBeNull();
  closer!.click(); await tick(); const closeDistance = controls.getDistance(); expect(closeDistance).toBeLessThan(initialDistance);
  farther!.click(); await tick(); expect(controls.getDistance()).toBeGreaterThan(closeDistance);
  for (let n = 0; n < 80; n++) closer!.click(); await tick();
  expect(controls.getDistance()).toBeCloseTo(controls.minDistance, 6);
  target.querySelector<HTMLButtonElement>('[aria-label="Ajuster le modèle à la vue"]')!.click(); await tick();
  expect(controls.getDistance()).toBeCloseTo(initialDistance, 5);
  expect(bytes(source)).toEqual(originalSTL);
});
