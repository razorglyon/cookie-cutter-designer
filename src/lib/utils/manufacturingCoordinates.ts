import * as THREE from 'three';

/**
 * The editor uses Three.js' conventional Y-up scene. Manufacturing formats and
 * slicers expect the print-bed normal on Z, so exports rotate Y-up to Z-up.
 * The source object is cloned without duplicating geometry buffers or materials.
 */
export function cloneForManufacturing(object: THREE.Object3D): THREE.Group {
  object.updateWorldMatrix(true, true);

  const clone = object.clone(true);
  clone.matrixAutoUpdate = false;
  clone.matrix.copy(object.matrixWorld);

  const manufacturingRoot = new THREE.Group();
  manufacturingRoot.name = 'Manufacturing Z-up export';
  manufacturingRoot.rotation.x = Math.PI / 2;
  manufacturingRoot.add(clone);
  manufacturingRoot.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(manufacturingRoot);
  if (!bounds.isEmpty()) {
    manufacturingRoot.position.set(-bounds.min.x, -bounds.min.y, -bounds.min.z);
    manufacturingRoot.updateMatrixWorld(true);
  }

  return manufacturingRoot;
}
