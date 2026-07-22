import * as THREE from 'three';

export interface DisposalReport {
  readonly geometries: number;
  readonly materials: number;
  readonly textures: number;
}

function materialTextures(material: THREE.Material): THREE.Texture[] {
  const textures: THREE.Texture[] = [];

  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) textures.push(value);
  }

  return textures;
}

/**
 * Dispose all resources owned by an object, deduplicating resources shared by meshes.
 */
export function disposeObject3D(object: THREE.Object3D): DisposalReport {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    geometries.add(child.geometry);
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of childMaterials) {
      materials.add(material);
      for (const texture of materialTextures(material)) textures.add(texture);
    }
  });

  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());

  object.removeFromParent();
  object.clear();

  return Object.freeze({
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size
  });
}
