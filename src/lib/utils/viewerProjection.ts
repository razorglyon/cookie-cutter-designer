import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface ViewerProjection {
  readonly object: THREE.Mesh | THREE.Group;
  sourceMesh(displayed: THREE.Mesh): THREE.Mesh | undefined;
  dispose(): void;
}

/** Rendering owns its normals and resources; fabrication always keeps the original mesh. */
export function createViewerProjection(source: THREE.Mesh | THREE.Group): ViewerProjection {
  const object = source.clone(true);
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const originals = new WeakMap<THREE.Mesh, THREE.Mesh>();
  const sourceMeshes: THREE.Mesh[] = [];
  source.traverse(child => { if (child instanceof THREE.Mesh) sourceMeshes.push(child); });
  let meshIndex = 0;
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const original = sourceMeshes[meshIndex++];
    originals.set(child, original);
    let geometry = geometries.get(original.geometry);
    if (!geometry) {
      // toCreasedNormals mutates non-indexed inputs, so always supply our own buffer.
      const owned = original.geometry.index
        ? original.geometry.toNonIndexed()
        : original.geometry.clone();
      geometry = toCreasedNormals(owned, Math.PI / 3);
      // Non-indexing does not preserve userData. Keep per-triangle measurement order.
      geometry.userData = { ...original.geometry.userData };
      geometries.set(original.geometry, geometry);
    }
    child.geometry = geometry;
    // Materials are read-only here; the optional heatmap owns separate material clones.
  });
  let disposed = false;
  return {
    object,
    sourceMesh: displayed => originals.get(displayed),
    dispose() {
      if (disposed) return;
      disposed = true;
      object.removeFromParent();
      geometries.forEach(geometry => geometry.dispose());
      geometries.clear();
      object.clear();
    }
  };
}
