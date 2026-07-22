import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeObject3D } from '../disposeThree';

function trackedBox(
  geometry: THREE.BufferGeometry,
  material: THREE.Material
): THREE.Mesh {
  return new THREE.Mesh(geometry, material);
}

describe('disposeObject3D', () => {
  it('disposes shared geometry, material and texture exactly once', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    const group = new THREE.Group();
    group.add(trackedBox(geometry, material), trackedBox(geometry, material));

    const report = disposeObject3D(group);

    expect(report).toEqual({ geometries: 1, materials: 1, textures: 1 });
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(group.children).toHaveLength(0);
  });

  it('supports material arrays and detaches the root from its parent', () => {
    const parent = new THREE.Group();
    const materialA = new THREE.MeshBasicMaterial();
    const materialB = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [materialA, materialB]);
    parent.add(mesh);

    const report = disposeObject3D(mesh);

    expect(report.materials).toBe(2);
    expect(parent.children).toHaveLength(0);
  });
});
