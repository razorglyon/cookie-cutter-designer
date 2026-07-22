import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  disposeSliceLayers,
  getMeshBounds,
  sliceMesh
} from '../slicer';

function printableCube(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
  mesh.position.y = 5;
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('sliceMesh geometric preview', () => {
  it('intersects a Y-up printable cube at layer centres', () => {
    const mesh = printableCube();
    const bounds = getMeshBounds(mesh);
    const layers = sliceMesh(mesh, {
      layerHeight: 2,
      minHeight: bounds.minHeight,
      maxHeight: bounds.maxHeight
    });

    expect(bounds).toEqual({ minHeight: 0, maxHeight: 10 });
    expect(layers).toHaveLength(5);
    expect(layers.map((layer) => layer.height)).toEqual([1, 3, 5, 7, 9]);
    for (const layer of layers) {
      expect(layer.contours).toHaveLength(1);
      expect(layer.contours[0].length).toBeGreaterThanOrEqual(4);
      expect(layer.geometry.getAttribute('position').count).toBeGreaterThanOrEqual(8);
    }
    disposeSliceLayers(layers);
  });

  it('uses world transforms when computing intersections', () => {
    const mesh = printableCube();
    mesh.position.set(20, 5, -12);
    mesh.updateMatrixWorld(true);
    const [layer] = sliceMesh(mesh, { layerHeight: 10, minHeight: 0, maxHeight: 10 });
    const points = layer.contours.flat();

    expect(Math.min(...points.map((point) => point.x))).toBeCloseTo(15, 5);
    expect(Math.max(...points.map((point) => point.x))).toBeCloseTo(25, 5);
    expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(-17, 5);
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(-7, 5);
    disposeSliceLayers([layer]);
  });

  it('does not invent a closed contour from an open triangle', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, 0, 0,
      1, 2, 0,
      0, 0, 1
    ], 3));
    const mesh = new THREE.Mesh(geometry);
    const layers = sliceMesh(mesh, { layerHeight: 1, minHeight: 0, maxHeight: 2 });

    expect(layers).toHaveLength(0);
  });

  it('rejects invalid or excessive preview layer counts', () => {
    const mesh = printableCube();
    expect(() => sliceMesh(mesh, { layerHeight: 0, minHeight: 0, maxHeight: 10 }))
      .toThrow(/positive finite/i);
    expect(() => sliceMesh(mesh, { layerHeight: 0.001, minHeight: 0, maxHeight: 10 }))
      .toThrow(/limited/i);
  });
});
