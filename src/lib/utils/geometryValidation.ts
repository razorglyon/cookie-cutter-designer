import * as THREE from 'three';
import { GENERATION_LIMITS } from './generationValidation';

export interface GeometryBounds {
  readonly min: Readonly<{ x: number; y: number; z: number }>;
  readonly max: Readonly<{ x: number; y: number; z: number }>;
}

export interface GeometryValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly triangles: number;
  readonly shells: number;
  readonly bounds: GeometryBounds | null;
}

const EDGE_PRECISION = 100_000;

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

/**
 * Validate exactly the transformed triangles that Three.js' STLExporter will serialize.
 */
export function validatePrintableObject(object: THREE.Object3D): GeometryValidationReport {
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
  let meshIndex = 0;

  object.updateMatrixWorld(true);

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

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
    shells += 1;

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

    const edgeCounts = new Map<string, number>();
    let indexError = false;
    let positionError = false;
    let degenerateError = false;

    for (let item = 0; item < elementCount; item += 3) {
      const vertexIndices = index
        ? [index.getX(item), index.getX(item + 1), index.getX(item + 2)]
        : [item, item + 1, item + 2];

      if (
        vertexIndices.some(
          (vertex) =>
            !Number.isInteger(vertex) || vertex < 0 || vertex >= position.count
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

      const keys = [vertexKey(first), vertexKey(second), vertexKey(third)];
      for (let edge = 0; edge < 3; edge += 1) {
        const key = edgeKey(keys[edge], keys[(edge + 1) % 3]);
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
      }
    }

    if (indexError) errors.add(`${label} contains an index outside the position range.`);
    if (positionError) errors.add(`${label} contains a position that is not finite.`);
    if (degenerateError) errors.add(`${label} contains a degenerate triangle.`);

    if (
      edgeCounts.size > 0 &&
      Array.from(edgeCounts.values()).some((incidence) => incidence !== 2)
    ) {
      errors.add(`${label} surface is not closed.`);
    }
  });

  if (shells === 0 || triangles === 0) {
    errors.add('The object contains no printable mesh or triangle.');
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
    bounds: reportBounds
  });
}
