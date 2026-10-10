// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import Viewer from '../lib/components/viewer/ThreeViewer.svelte';
import { setTriangleWallThicknesses } from '../lib/utils/wallThicknessHeatmap';
const rendered = vi.hoisted(() => ({ scene: undefined as unknown }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    domElement = document.createElement('canvas'); renderLists = { dispose() {} };
    setSize() {} setPixelRatio() {} dispose() {} forceContextLoss() {}
    render(scene: unknown) { rendered.scene = scene; }
  } };
});
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({ OrbitControls: class { target = new THREE.Vector3(); update() {} dispose() {} } }));
it('restores grid, axes and heatmap without user notification; emits only user edits and restores owned source on destroy', async () => {
  const geometry = new THREE.BoxGeometry(10, 10, 10);
  setTriangleWallThicknesses(geometry, Array(geometry.index!.count / 3).fill(1));
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geometry, material); mesh.userData.params = { wallThickness: 1 };
  const sourceDispose = vi.spyOn(geometry, 'dispose'); const materialDispose = vi.spyOn(material, 'dispose');
  const onViewportChange = vi.fn();
  const props = { mesh, viewport: { showGrid: false, showAxes: true, showWallThickness: true }, onViewportChange };
  const target = document.body.appendChild(document.createElement('div'));
  const app = mount(Viewer, { target, props });
  try {
    await vi.waitFor(() => expect(rendered.scene).toBeInstanceOf(THREE.Scene));
    const scene = rendered.scene as THREE.Scene;
    expect(scene.children.find(child => child instanceof THREE.GridHelper)?.visible).toBe(false);
    expect(scene.children.find(child => child instanceof THREE.AxesHelper)?.visible).toBe(true);
    expect(mesh.geometry).not.toBe(geometry);
    expect(onViewportChange).not.toHaveBeenCalled();
    const cloneDispose = vi.spyOn(mesh.geometry, 'dispose');
    const grid = document.querySelector<HTMLInputElement>('input[aria-label="Show grid"]');
    expect(grid).not.toBeNull(); grid!.checked = true; grid!.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(onViewportChange).toHaveBeenCalledExactlyOnceWith({ showGrid: true, showAxes: true, showWallThickness: true });
    await unmount(app);
    expect(cloneDispose).toHaveBeenCalledTimes(1);
    expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material);
    expect(sourceDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
  } finally { if (target.childNodes.length) await unmount(app); target.remove(); geometry.dispose(); material.dispose(); }
});

it('read-only preview retains selection, two contours and heatmap when deletion is forced', async () => {
  const geometry = new THREE.BoxGeometry(10, 10, 10), material = new THREE.MeshStandardMaterial();
  setTriangleWallThicknesses(geometry, Array(geometry.index!.count / 3).fill(1));
  const first = new THREE.Mesh(geometry, material), second = new THREE.Mesh(geometry, material);
  first.userData.params = second.userData.params = { wallThickness: 1 };
  const mesh = new THREE.Group(); mesh.add(first, second); mesh.userData.params = { wallThickness: 1 };
  const disposed = vi.spyOn(geometry, 'dispose'), deleted = vi.fn();
  const intersect = vi.spyOn(THREE.Raycaster.prototype, 'intersectObject').mockReturnValue([{ object: first, distance: 1, point: new THREE.Vector3() }]);
  const target = document.body.appendChild(document.createElement('div'));
  const app = mount(Viewer, { target, props: { mesh, allowObjectDeletion: false, viewport: { showGrid: true, showAxes: false, showWallThickness: true } }, events: { deleteObject: deleted } });
  try {
    await vi.waitFor(() => expect(target.querySelector('canvas')).not.toBeNull());
    target.querySelector<HTMLButtonElement>('[aria-label="Enter selection mode"]')!.click(); await tick();
    target.querySelector('canvas')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick();
    const button = target.querySelector<HTMLButtonElement>('[aria-label="Delete selected element"]')!;
    expect(button).not.toBeNull(); expect(button.disabled).toBe(true);
    expect(target.querySelector('#viewer-deletion-reason')?.textContent).toContain('read-only');
    expect(first.geometry).not.toBe(geometry);
    const displayed = first.geometry, cloneDisposed = vi.spyOn(displayed, 'dispose');
    button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick();
    expect(deleted).not.toHaveBeenCalled(); expect(mesh.children).toHaveLength(2);
    expect(first.geometry).toBe(displayed); expect(cloneDisposed).not.toHaveBeenCalled(); expect(disposed).not.toHaveBeenCalled();
    expect(target.querySelector('[aria-label="Delete selected element"]')).toBe(button);
    await unmount(app); expect(cloneDisposed).toHaveBeenCalledTimes(1); expect(first.geometry).toBe(geometry);
  } finally { if (target.childNodes.length) await unmount(app); target.remove(); intersect.mockRestore(); geometry.dispose(); material.dispose(); }
});
