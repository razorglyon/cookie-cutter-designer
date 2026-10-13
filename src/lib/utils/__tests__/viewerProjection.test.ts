import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createViewerProjection } from '../viewerProjection';
import { serializeSTL } from '../stlExporter';
import { setTriangleWallThicknesses } from '../wallThicknessHeatmap';

function bytes(source: THREE.Mesh | THREE.Group): Uint8Array {
  const data = serializeSTL(source, true) as DataView;
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
}

it.each([true, false])('owns display buffers for indexed=%s, retaining triangle order and source normals', indexed => {
  const box = new THREE.BoxGeometry(10, 4, 10);
  const geometry = indexed ? box : box.toNonIndexed();
  if (!indexed) box.dispose();
  const material = new THREE.MeshStandardMaterial();
  const source = new THREE.Mesh(geometry, material);
  const originalNormals = geometry.getAttribute('normal').array.slice();
  const originalPositions = geometry.getAttribute('position').array.slice();
  const originalSTL = bytes(source);
  const projection = createViewerProjection(source);
  try {
    const display = projection.object as THREE.Mesh;
    expect(display.geometry).not.toBe(geometry); expect(display.geometry.index).toBeNull();
    expect(display.material).toBe(material); expect(projection.sourceMesh(display)).toBe(source);
    expect(bytes(display)).toEqual(originalSTL);
    expect(bytes(source)).toEqual(originalSTL);
    expect(geometry.getAttribute('normal').array).toEqual(originalNormals);
    expect(geometry.getAttribute('position').array).toEqual(originalPositions);
  } finally { projection.dispose(); geometry.dispose(); material.dispose(); }
});

it('preserves hierarchy, transforms and metadata; releases shared display buffers once, never the sources', () => {
  const geometry = new THREE.BoxGeometry(10, 4, 10);
  setTriangleWallThicknesses(geometry, Array(geometry.index!.count / 3).fill(1));
  const material = new THREE.MeshStandardMaterial();
  const first = new THREE.Mesh(geometry, material), second = new THREE.Mesh(geometry, material);
  const nested = new THREE.Group(), source = new THREE.Group();
  second.position.set(15, 0, 3); nested.rotation.y = Math.PI / 6;
  source.position.set(3, 2, 1); source.userData.params = { wallThickness: 1 };
  nested.add(second); source.add(first, nested);
  const originalSTL = bytes(source), disposed = vi.spyOn(geometry, 'dispose'), materialDisposed = vi.spyOn(material, 'dispose');
  const projection = createViewerProjection(source);
  const a = projection.object.children[0] as THREE.Mesh;
  const b = projection.object.children[1].children[0] as THREE.Mesh;
  const cloneDisposed = vi.spyOn(a.geometry, 'dispose');
  expect(projection.object.position.toArray()).toEqual(source.position.toArray());
  expect(b.position.toArray()).toEqual(second.position.toArray());
  expect(a.geometry).toBe(b.geometry); expect(a.geometry).not.toBe(geometry);
  expect(a.geometry.userData.wallThicknessByTriangle).toEqual(geometry.userData.wallThicknessByTriangle);
  expect(projection.sourceMesh(a)).toBe(first); expect(projection.sourceMesh(b)).toBe(second);
  expect(bytes(projection.object)).toEqual(originalSTL); expect(bytes(source)).toEqual(originalSTL);
  projection.dispose(); projection.dispose();
  expect(cloneDisposed).toHaveBeenCalledTimes(1); expect(disposed).not.toHaveBeenCalled(); expect(materialDisposed).not.toHaveBeenCalled();
  expect(source.children).toHaveLength(2); expect(nested.children).toHaveLength(1);
  geometry.dispose(); material.dispose();
});
