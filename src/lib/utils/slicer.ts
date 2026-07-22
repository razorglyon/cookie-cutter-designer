import * as THREE from 'three';
import type { Group, Mesh } from 'three';

export interface SliceLayer {
  /** Scene-space Y coordinate in millimetres. */
  height: number;
  /** Closed X/Z intersection contours. */
  contours: THREE.Vector2[][];
  geometry: THREE.BufferGeometry;
}

export interface SlicingOptions {
  layerHeight: number;
  minHeight: number;
  maxHeight: number;
}

const INTERSECTION_EPSILON = 1e-6;
const CONNECTION_EPSILON = 1e-3;
const MAX_PREVIEW_LAYERS = 2000;

function validateOptions(options: SlicingOptions): void {
  if (!Number.isFinite(options.layerHeight) || options.layerHeight <= 0) {
    throw new Error('Preview layer height must be a positive finite number.');
  }
  if (
    !Number.isFinite(options.minHeight) ||
    !Number.isFinite(options.maxHeight) ||
    options.maxHeight <= options.minHeight
  ) {
    throw new Error('Preview bounds must define a positive finite height range.');
  }
  const count = Math.ceil((options.maxHeight - options.minHeight) / options.layerHeight);
  if (count > MAX_PREVIEW_LAYERS) {
    throw new Error(`Layer preview is limited to ${MAX_PREVIEW_LAYERS} layers.`);
  }
}

/**
 * Compute geometric triangle/plane intersections. This is a visual section preview,
 * not a manufacturing slicer: it creates no infill, supports or printer toolpaths.
 */
export function sliceMesh(
  object: Mesh | Group,
  options: SlicingOptions
): SliceLayer[] {
  validateOptions(options);
  object.updateMatrixWorld(true);
  const count = Math.ceil((options.maxHeight - options.minHeight) / options.layerHeight);
  const layers: SliceLayer[] = [];

  for (let index = 0; index < count; index += 1) {
    const height = Math.min(
      options.minHeight + (index + 0.5) * options.layerHeight,
      options.maxHeight - INTERSECTION_EPSILON
    );
    const layer = sliceAtHeight(object, height);
    if (layer.contours.length > 0) layers.push(layer);
    else layer.geometry.dispose();
  }

  return layers;
}

function addUniquePoint(points: THREE.Vector3[], candidate: THREE.Vector3): void {
  if (!points.some((point) => point.distanceToSquared(candidate) <= INTERSECTION_EPSILON ** 2)) {
    points.push(candidate);
  }
}

function intersectTriangleAtHeight(
  first: THREE.Vector3,
  second: THREE.Vector3,
  third: THREE.Vector3,
  height: number
): readonly [THREE.Vector3, THREE.Vector3] | null {
  const vertices = [first, second, third];
  const intersections: THREE.Vector3[] = [];

  for (let index = 0; index < 3; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % 3];
    const startDistance = start.y - height;
    const endDistance = end.y - height;

    if (Math.abs(startDistance) <= INTERSECTION_EPSILON && Math.abs(endDistance) <= INTERSECTION_EPSILON) {
      continue;
    }
    if (Math.abs(startDistance) <= INTERSECTION_EPSILON) {
      addUniquePoint(intersections, start.clone());
      continue;
    }
    if (Math.abs(endDistance) <= INTERSECTION_EPSILON) {
      addUniquePoint(intersections, end.clone());
      continue;
    }
    if (startDistance * endDistance < 0) {
      const ratio = (height - start.y) / (end.y - start.y);
      addUniquePoint(
        intersections,
        new THREE.Vector3().lerpVectors(start, end, ratio)
      );
    }
  }

  return intersections.length === 2
    ? [intersections[0], intersections[1]]
    : null;
}

function pointsMatch(first: THREE.Vector2, second: THREE.Vector2): boolean {
  return first.distanceToSquared(second) <= CONNECTION_EPSILON ** 2;
}

function connectLineSegments(
  segments: ReadonlyArray<readonly [THREE.Vector2, THREE.Vector2]>
): THREE.Vector2[][] {
  const unused = segments.map(([first, second]) => [first.clone(), second.clone()] as const);
  const contours: THREE.Vector2[][] = [];

  while (unused.length > 0) {
    const seed = unused.pop();
    if (!seed) break;
    const contour = [seed[0], seed[1]];
    let extended = true;

    while (extended && unused.length > 0) {
      extended = false;
      const tail = contour[contour.length - 1];
      for (let index = 0; index < unused.length; index += 1) {
        const [first, second] = unused[index];
        if (pointsMatch(tail, first)) {
          contour.push(second);
        } else if (pointsMatch(tail, second)) {
          contour.push(first);
        } else {
          continue;
        }
        unused.splice(index, 1);
        extended = true;
        break;
      }
    }

    if (contour.length >= 4 && pointsMatch(contour[0], contour[contour.length - 1])) {
      contour.pop();
      contours.push(contour);
    }
  }

  return contours;
}

function createLayerGeometry(contours: THREE.Vector2[][], height: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const contour of contours) {
    for (let index = 0; index < contour.length; index += 1) {
      const start = contour[index];
      const end = contour[(index + 1) % contour.length];
      positions.push(start.x, height, start.y, end.x, height, end.y);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function sliceAtHeight(object: Mesh | Group, height: number): SliceLayer {
  const segments: Array<readonly [THREE.Vector2, THREE.Vector2]> = [];
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  const third = new THREE.Vector3();

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    if (!position) return;
    const index = child.geometry.index;
    const triangleCount = Math.floor((index?.count ?? position.count) / 3);

    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const vertexIndices = [0, 1, 2].map((offset) =>
        index ? index.getX(triangle * 3 + offset) : triangle * 3 + offset
      );
      first.fromBufferAttribute(position, vertexIndices[0]).applyMatrix4(child.matrixWorld);
      second.fromBufferAttribute(position, vertexIndices[1]).applyMatrix4(child.matrixWorld);
      third.fromBufferAttribute(position, vertexIndices[2]).applyMatrix4(child.matrixWorld);
      const intersection = intersectTriangleAtHeight(first, second, third, height);
      if (!intersection) continue;
      segments.push([
        new THREE.Vector2(intersection[0].x, intersection[0].z),
        new THREE.Vector2(intersection[1].x, intersection[1].z)
      ]);
    }
  });

  const contours = connectLineSegments(segments);
  return { height, contours, geometry: createLayerGeometry(contours, height) };
}

export function calculateOptimalLayerHeight(modelHeight: number): number {
  if (modelHeight < 10) return 0.1;
  if (modelHeight < 20) return 0.15;
  if (modelHeight < 50) return 0.2;
  return 0.3;
}

export function getMeshBounds(object: Mesh | Group): { minHeight: number; maxHeight: number } {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  return { minHeight: box.min.y, maxHeight: box.max.y };
}

export function disposeSliceLayers(layers: readonly SliceLayer[]): void {
  for (const layer of layers) layer.geometry.dispose();
}
