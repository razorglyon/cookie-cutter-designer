import * as THREE from 'three';
import legacyCutterJson from '../../domain/__tests__/fixtures/legacy-cutter.json';
import legacyStampJson from '../../domain/__tests__/fixtures/legacy-stamp.json';
import type {
  CutterDesignParameters,
  StampDesignParameters
} from '../../domain/designParameters';
import type { GeometryBounds } from '../geometryValidation';
import type { CutterGenerationErrorCode } from '../generationValidation';
import {
  extractClosedContours,
  type NormalizedContour,
  type NormalizedPoint
} from '../contourExtraction';

export type LegacyGenerator = 'cutter' | 'stamp';

type LegacyParameters<G extends LegacyGenerator> = G extends 'cutter'
  ? CutterDesignParameters
  : StampDesignParameters;

export interface LegacyGeometryFixture<G extends LegacyGenerator = LegacyGenerator> {
  readonly schemaVersion: 1;
  readonly generator: G;
  readonly success: {
    readonly svg: string;
    readonly parameters: LegacyParameters<G>;
  };
  readonly topology: {
    readonly contours: number;
    readonly hasHoles: boolean;
  };
  readonly expected: {
    readonly dimensionsMm: {
      readonly width: number;
      readonly depth: number;
      readonly height: number;
    };
    readonly triangles: number;
    readonly shells: number;
    readonly signedVolumeMm3: number;
    readonly logicalTriangleHash: string;
    readonly logicalTriangleHashAlgorithm: typeof LEGACY_HASH_ALGORITHM;
  };
  readonly tolerance: {
    readonly dimensionsMm: number;
    readonly signedVolumeMm3: number;
  };
  readonly failure: {
    readonly svg: string;
    readonly parameters: LegacyParameters<G>;
    readonly errorCode: CutterGenerationErrorCode;
  };
}

export type QuantizedVertex = [number, number, number];
export type QuantizedTriangle = [QuantizedVertex, QuantizedVertex, QuantizedVertex];

export const LEGACY_HASH_ALGORITHM =
  'fnv1a64-world-oriented-triangles-q1e4-v1' as const;
const WORLD_QUANTIZATION = 10_000;
const FNV1A_64_OFFSET = 0xcbf29ce484222325n;
const FNV1A_64_PRIME = 0x100000001b3n;
const FNV1A_64_MASK = 0xffffffffffffffffn;

export const legacyCutterFixture =
  legacyCutterJson as unknown as LegacyGeometryFixture<'cutter'>;
export const legacyStampFixture =
  legacyStampJson as unknown as LegacyGeometryFixture<'stamp'>;
export const legacyFixtures = [legacyCutterFixture, legacyStampFixture] as const;

function pointInPolygon(point: NormalizedPoint, polygon: NormalizedContour): boolean {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;

    if (crosses) inside = !inside;
  }

  return inside;
}

function hasGeometricallyNestedHole(contours: ReadonlyArray<NormalizedContour>): boolean {
  return contours.some(
    (contour, contourIndex) =>
      contours.reduce(
        (depth, candidate, candidateIndex) =>
          candidateIndex !== contourIndex && pointInPolygon(contour[0], candidate)
            ? depth + 1
            : depth,
        0
      ) %
        2 ===
      1
  );
}

export function inspectSvgTopology(svg: string): LegacyGeometryFixture['topology'] {
  const contours = extractClosedContours(svg);
  return Object.freeze({
    contours: contours.length,
    hasHoles: hasGeometricallyNestedHole(contours)
  });
}

function compareQuantizedVertices(first: QuantizedVertex, second: QuantizedVertex): number {
  return first[0] - second[0] || first[1] - second[1] || first[2] - second[2];
}

function compareQuantizedTriangles(first: QuantizedTriangle, second: QuantizedTriangle): number {
  for (let vertex = 0; vertex < 3; vertex += 1) {
    const comparison = compareQuantizedVertices(first[vertex], second[vertex]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function normalizeOrientedTriangle(triangle: QuantizedTriangle): QuantizedTriangle {
  const cyclicRotations: QuantizedTriangle[] = [
    triangle,
    [triangle[1], triangle[2], triangle[0]],
    [triangle[2], triangle[0], triangle[1]]
  ];

  return cyclicRotations.reduce((minimum, rotation) =>
    compareQuantizedTriangles(rotation, minimum) < 0 ? rotation : minimum
  );
}

function quantizedWorldVertex(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
  matrixWorld: THREE.Matrix4
): QuantizedVertex {
  const vertex = new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(matrixWorld);
  return [
    Math.round(vertex.x * WORLD_QUANTIZATION),
    Math.round(vertex.y * WORLD_QUANTIZATION),
    Math.round(vertex.z * WORLD_QUANTIZATION)
  ];
}

export function fnv1a64(serialized: string): string {
  let hash = FNV1A_64_OFFSET;
  for (const byte of new TextEncoder().encode(serialized)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV1A_64_PRIME) & FNV1A_64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

export function logicalTriangleHash(object: THREE.Object3D): string {
  const triangles: QuantizedTriangle[] = [];
  object.updateMatrixWorld(true);

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    const index = child.geometry.getIndex();
    if (!position) throw new Error('Expected a printable position attribute.');

    const elementCount = index ? index.count : position.count;
    for (let item = 0; item < elementCount; item += 3) {
      const vertices = [
        quantizedWorldVertex(position, index ? index.getX(item) : item, child.matrixWorld),
        quantizedWorldVertex(position, index ? index.getX(item + 1) : item + 1, child.matrixWorld),
        quantizedWorldVertex(position, index ? index.getX(item + 2) : item + 2, child.matrixWorld)
      ] as QuantizedTriangle;
      triangles.push(normalizeOrientedTriangle(vertices));
    }
  });

  triangles.sort(compareQuantizedTriangles);
  return fnv1a64(JSON.stringify(triangles));
}

export function dimensionsFromBounds(bounds: GeometryBounds): LegacyGeometryFixture['expected']['dimensionsMm'] {
  return Object.freeze({
    width: bounds.max.x - bounds.min.x,
    depth: bounds.max.z - bounds.min.z,
    height: bounds.max.y - bounds.min.y
  });
}
