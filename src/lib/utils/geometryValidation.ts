import * as THREE from 'three';
import { GENERATION_LIMITS } from './generationValidation';

export interface GeometryBounds {
  readonly min: Readonly<{ x: number; y: number; z: number }>;
  readonly max: Readonly<{ x: number; y: number; z: number }>;
}

export interface GeometryValidationOptions {
  /** Reject multi-part objects when the product must be one connected solid. */
  readonly requireSingleShell?: boolean;
}

export interface GeometryValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly triangles: number;
  /** Number of connected triangle components, not merely Three.js meshes. */
  readonly shells: number;
  readonly meshes: number;
  /** Signed volume in world-coordinate units cubed. A printable solid is positive. */
  readonly volume: number;
  readonly bounds: GeometryBounds | null;
}

const EDGE_PRECISION = 100_000;
const MIN_VOLUME_EPSILON = 1e-9;

interface EdgeOccurrence {
  readonly triangle: number;
  readonly from: string;
  readonly to: string;
}

interface TriangleRecord {
  readonly signedVolume: number;
}

function finiteVector(vector: THREE.Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function vertexKey(vertex: THREE.Vector3): string {
  return `${Math.round(vertex.x * EDGE_PRECISION)}:${Math.round(vertex.y * EDGE_PRECISION)}:${Math.round(vertex.z * EDGE_PRECISION)}`;
}

function edgeKey(first: string, second: string): string {
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function meshLabel(mesh: THREE.Mesh, index: number): string {
  return mesh.name ? `Mesh "${mesh.name}"` : `Mesh ${index + 1}`;
}

function signedTetrahedronVolume(
  first: THREE.Vector3,
  second: THREE.Vector3,
  third: THREE.Vector3
): number {
  return (
    first.x * (second.y * third.z - second.z * third.y) -
    first.y * (second.x * third.z - second.z * third.x) +
    first.z * (second.x * third.y - second.y * third.x)
  ) / 6;
}

function connectTriangles(
  adjacency: readonly Set<number>[],
  occurrences: readonly EdgeOccurrence[]
): void {
  if (occurrences.length !== 2) return;

  const [first, second] = occurrences;
  adjacency[first.triangle].add(second.triangle);
  adjacency[second.triangle].add(first.triangle);
}

function connectedComponents(adjacency: readonly Set<number>[]): number[][] {
  const visited = new Uint8Array(adjacency.length);
  const components: number[][] = [];

  for (let start = 0; start < adjacency.length; start += 1) {
    if (visited[start]) continue;

    const component: number[] = [];
    const stack = [start];
    visited[start] = 1;

    while (stack.length > 0) {
      const triangle = stack.pop();
      if (triangle === undefined) break;
      component.push(triangle);

      for (const neighbour of adjacency[triangle]) {
        if (visited[neighbour]) continue;
        visited[neighbour] = 1;
        stack.push(neighbour);
      }
    }

    components.push(component);
  }

  return components;
}

/**
 * Validate exactly the transformed triangles that Three.js' STLExporter will serialize.
 */
export function validatePrintableObject(
  object: THREE.Object3D,
  options: GeometryValidationOptions = {}
): GeometryValidationReport {
  const errors = new Set<string>();
  const warnings = new Set<string>();
  const bounds = new THREE.Box3();
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  const third = new THREE.Vector3();
  const sideA = new THREE.Vector3();
  const sideB = new THREE.Vector3();
  let triangles = 0;
  let shells = 0;
  let meshes = 0;
  let volume = 0;
  let meshIndex = 0;

  object.updateMatrixWorld(true);

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    meshes += 1;
    const label = meshLabel(child, meshIndex++);
    const geometry = child.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = geometry.getIndex();

    if (!position || position.itemSize < 3 || position.count < 3) {
      errors.add(`${label} has no printable position attribute.`);
      return;
    }

    const elementCount = index ? index.count : position.count;
    if (elementCount === 0 || elementCount % 3 !== 0) {
      errors.add(`${label} does not contain a complete triangle list.`);
      return;
    }

    const meshTriangles = elementCount / 3;
    triangles += meshTriangles;

    if (!normal || normal.itemSize < 3 || normal.count < position.count) {
      errors.add(`${label} has no complete normal attribute.`);
    } else {
      for (let vertex = 0; vertex < normal.count; vertex += 1) {
        if (
          !Number.isFinite(normal.getX(vertex)) ||
          !Number.isFinite(normal.getY(vertex)) ||
          !Number.isFinite(normal.getZ(vertex))
        ) {
          errors.add(`${label} contains a normal that is not finite.`);
          break;
        }
      }
    }

    if (!child.matrixWorld.elements.every(Number.isFinite)) {
      errors.add(`${label} has a world transform that is not finite.`);
      return;
    }

    const edgeOccurrences = new Map<string, EdgeOccurrence[]>();
    const triangleRecords: TriangleRecord[] = [];
    let indexError = false;
    let positionError = false;
    let degenerateError = false;

    for (let item = 0; item < elementCount; item += 3) {
      const vertexIndices = index
        ? [index.getX(item), index.getX(item + 1), index.getX(item + 2)]
        : [item, item + 1, item + 2];

      if (
        vertexIndices.some(
          (vertex) => !Number.isInteger(vertex) || vertex < 0 || vertex >= position.count
        )
      ) {
        indexError = true;
        continue;
      }

      first.fromBufferAttribute(position, vertexIndices[0]).applyMatrix4(child.matrixWorld);
      second.fromBufferAttribute(position, vertexIndices[1]).applyMatrix4(child.matrixWorld);
      third.fromBufferAttribute(position, vertexIndices[2]).applyMatrix4(child.matrixWorld);

      if (!finiteVector(first) || !finiteVector(second) || !finiteVector(third)) {
        positionError = true;
        continue;
      }

      bounds.expandByPoint(first);
      bounds.expandByPoint(second);
      bounds.expandByPoint(third);

      sideA.subVectors(second, first);
      sideB.subVectors(third, first);
      if (sideA.cross(sideB).lengthSq() <= GENERATION_LIMITS.triangleAreaEpsilon) {
        degenerateError = true;
        continue;
      }

      const triangle = triangleRecords.length;
      triangleRecords.push({ signedVolume: signedTetrahedronVolume(first, second, third) });
      const keys = [vertexKey(first), vertexKey(second), vertexKey(third)];

      for (let edge = 0; edge < 3; edge += 1) {
        const from = keys[edge];
        const to = keys[(edge + 1) % 3];
        const key = edgeKey(from, to);
        const occurrences = edgeOccurrences.get(key) ?? [];
        occurrences.push({ triangle, from, to });
        edgeOccurrences.set(key, occurrences);
      }
    }

    if (indexError) errors.add(`${label} contains an index outside the position range.`);
    if (positionError) errors.add(`${label} contains a position that is not finite.`);
    if (degenerateError) errors.add(`${label} contains a degenerate triangle.`);

    const occurrences = Array.from(edgeOccurrences.values());
    const surfaceClosed =
      occurrences.length > 0 && occurrences.every((edge) => edge.length === 2);
    if (!surfaceClosed) {
      errors.add(`${label} surface is not closed.`);
    }

    const inconsistentOrientation = occurrences.some(
      (edge) =>
        edge.length === 2 &&
        !(edge[0].from === edge[1].to && edge[0].to === edge[1].from)
    );
    if (inconsistentOrientation) {
      errors.add(`${label} has inconsistent triangle orientation.`);
    }

    const adjacency = Array.from(
      { length: triangleRecords.length },
      () => new Set<number>()
    );
    for (const edge of occurrences) connectTriangles(adjacency, edge);

    const components = connectedComponents(adjacency);
    shells += components.length;

    for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
      const componentVolume = components[componentIndex].reduce(
        (sum, triangle) => sum + triangleRecords[triangle].signedVolume,
        0
      );
      volume += componentVolume;

      if (
        surfaceClosed &&
        !inconsistentOrientation &&
        componentVolume <= MIN_VOLUME_EPSILON
      ) {
        errors.add(
          `${label} shell ${componentIndex + 1} does not have outward-facing triangles with positive volume.`
        );
      }
    }
  });

  if (meshes === 0 || triangles === 0) {
    errors.add('The object contains no printable mesh or triangle.');
  }

  if (shells > 1) {
    warnings.add(`The object contains ${shells} disconnected shells.`);
  }

  if (options.requireSingleShell && shells !== 1) {
    errors.add('The printable object must contain a single connected shell.');
  }

  let reportBounds: GeometryBounds | null = null;
  if (bounds.isEmpty()) {
    errors.add('The printable object bounds are empty or not finite.');
  } else {
    const size = bounds.getSize(new THREE.Vector3());
    if (!finiteVector(bounds.min) || !finiteVector(bounds.max) || !finiteVector(size)) {
      errors.add('The printable object bounds are empty or not finite.');
    } else if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
      errors.add('The printable object bounds have a zero dimension.');
    } else {
      reportBounds = Object.freeze({
        min: Object.freeze({ x: bounds.min.x, y: bounds.min.y, z: bounds.min.z }),
        max: Object.freeze({ x: bounds.max.x, y: bounds.max.y, z: bounds.max.z })
      });
    }
  }

  const errorList = Object.freeze(Array.from(errors));
  return Object.freeze({
    valid: errorList.length === 0,
    errors: errorList,
    warnings: Object.freeze(Array.from(warnings)),
    triangles,
    shells,
    meshes,
    volume,
    bounds: reportBounds
  });
}
