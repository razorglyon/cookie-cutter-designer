import * as THREE from 'three';

let lastBatch: THREE.Group | null = null;
let lastBatchDisposed = false;
let disposeObserver: (() => void) | null = null;

export function createBatchFixture(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'batch-fixture';
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.addEventListener('dispose', () => {
    lastBatchDisposed = true;
    disposeObserver?.();
  });
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  lastBatch = group;
  lastBatchDisposed = false;
  return group;
}

export function getLastBatch(): THREE.Group | null {
  return lastBatch;
}

export function wasLastBatchDisposed(): boolean {
  return lastBatchDisposed;
}

export function observeLastBatchDisposal(observer: (() => void) | null): void {
  disposeObserver = observer;
}

export function resetBatchFixture(): void {
  lastBatch = null;
  lastBatchDisposed = false;
  disposeObserver = null;
}
