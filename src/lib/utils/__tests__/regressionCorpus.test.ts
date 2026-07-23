import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import legacyCutterJson from '../../domain/__tests__/fixtures/legacy-cutter.json';
import legacyStampJson from '../../domain/__tests__/fixtures/legacy-stamp.json';
import { DEFAULT_PARAMS, type CookieCutterParams } from '../../types/CookieCutter';
import { generateCookieCutter } from '../cookieCutterGenerator';
import {
  extractClosedContours,
  type NormalizedContour,
  type NormalizedPoint
} from '../contourExtraction';
import { disposeObject3D } from '../disposeThree';
import {
  CutterGenerationError,
  type CutterGenerationErrorCode,
  validateCookieCutterParams
} from '../generationValidation';
import { validatePrintableObject } from '../geometryValidation';
import { generateStamp } from '../stampGenerator';
import {
  compoundHoleSvg,
  concaveSvg,
  degenerateSvg,
  extremeAspectSvg,
  multipleContoursSvg,
  rectangleSvg,
  selfIntersectingSvg,
  tinyDetailsSvg
} from './fixtures';
import { installSvgLoaderDomParserAdapter } from './svgDomTestSupport';

interface LegacyGeometryFixture {
  readonly schemaVersion: 1;
  readonly generator: 'cutter' | 'stamp';
  readonly success: {
    readonly svg: string;
    readonly parameters: CookieCutterParams;
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
    readonly logicalTriangleHashAlgorithm: 'fnv1a64-world-oriented-triangles-q1e4-v1';
  };
  readonly tolerance: {
    readonly dimensionsMm: number;
    readonly signedVolumeMm3: number;
  };
  readonly failure: {
    readonly svg: string;
    readonly parameters: CookieCutterParams;
    readonly errorCode: CutterGenerationErrorCode;
  };
}

type QuantizedVertex = [number, number, number];
type QuantizedTriangle = [QuantizedVertex, QuantizedVertex, QuantizedVertex];

const LEGACY_HASH_ALGORITHM = 'fnv1a64-world-oriented-triangles-q1e4-v1' as const;
const WORLD_QUANTIZATION = 10_000;
const FNV1A_64_OFFSET = 0xcbf29ce484222325n;
const FNV1A_64_PRIME = 0x100000001b3n;
const FNV1A_64_MASK = 0xffffffffffffffffn;
// Cette suite capture volontairement le pipeline pré-adaptateur ; les tests recettes 2.2/2.3 doivent rejouer ces JSON via leurs adaptateurs.
const legacyFixtures = [
  legacyCutterJson as unknown as LegacyGeometryFixture,
  legacyStampJson as unknown as LegacyGeometryFixture
] as const;

let restoreDomParser: (() => void) | undefined;

beforeAll(() => {
  restoreDomParser = installSvgLoaderDomParserAdapter();
});

afterAll(() => {
  restoreDomParser?.();
});

const cutterParams = {
  ...DEFAULT_PARAMS,
  enableHandle: false,
  handleStyle: 'none' as const,
  taperAngle: 2
};

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

function normalizeOrientedTriangle(triangle: QuantizedTriangle): QuantizedTriangle {
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

function fnv1a64(serialized: string): string {
  let hash = FNV1A_64_OFFSET;
  for (const byte of new TextEncoder().encode(serialized)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV1A_64_PRIME) & FNV1A_64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

function logicalTriangleHash(object: THREE.Object3D): string {
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

async function generateLegacyObject(
  generator: LegacyGeometryFixture['generator'],
  svg: string,
  parameters: Readonly<CookieCutterParams>
): Promise<THREE.Object3D> {
  return generator === 'cutter'
    ? generateCookieCutter(svg, parameters)
    : generateStamp(svg, parameters);
}

async function captureGenerationFailure(
  generator: LegacyGeometryFixture['generator'],
  svg: string,
  parameters: Readonly<CookieCutterParams>
): Promise<unknown> {
  let object: THREE.Object3D | undefined;
  let thrown: unknown;

  try {
    object = await generateLegacyObject(generator, svg, parameters);
  } catch (error) {
    thrown = error;
  } finally {
    if (object) disposeObject3D(object);
  }

  return thrown;
}

function expectAbsoluteTolerance(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe('manufacturing regression corpus', () => {
  it('keeps cyclic triangle rotations equivalent while preserving winding', () => {
    const a: QuantizedVertex = [0, 0, 0];
    const b: QuantizedVertex = [1, 0, 0];
    const c: QuantizedVertex = [0, 1, 0];
    const cyclicRotations: QuantizedTriangle[] = [
      [a, b, c],
      [b, c, a],
      [c, a, b]
    ];
    const normalized = normalizeOrientedTriangle(cyclicRotations[0]);
    const normalizedHashes = cyclicRotations.map((triangle) =>
      fnv1a64(JSON.stringify(normalizeOrientedTriangle(triangle)))
    );

    for (const rotation of cyclicRotations) {
      expect(normalizeOrientedTriangle(rotation)).toEqual(normalized);
    }
    expect(new Set(normalizedHashes).size).toBe(1);

    const reversed = normalizeOrientedTriangle([a, c, b]);
    expect(reversed).not.toEqual(normalized);
    expect(fnv1a64(JSON.stringify(reversed))).not.toBe(normalizedHashes[0]);
  });

  it.each([
    ['rectangle', rectangleSvg],
    ['concavity', concaveSvg],
    ['compound hole', compoundHoleSvg],
    ['multiple contours', multipleContoursSvg]
  ])('produces finite validated cutter geometry for %s', async (_name, svg) => {
    let object: THREE.Object3D | undefined;

    try {
      object = await generateCookieCutter(svg, cutterParams);
      const report = validatePrintableObject(object);

      expect(report.valid, report.errors.join('\n')).toBe(true);
      expect(report.triangles).toBeGreaterThan(0);
      expect(report.volume).toBeGreaterThan(0);
    } finally {
      if (object) disposeObject3D(object);
    }
  });

  it('handles an extreme aspect ratio without losing the requested longest dimension', async () => {
    let object: THREE.Object3D | undefined;

    try {
      object = await generateCookieCutter(extremeAspectSvg, {
        ...cutterParams,
        wallThickness: 0.6,
        targetSize: 100,
        taperAngle: 0
      });
      const dimensions = object.userData.dimensions as { width: number; depth: number };

      expect(Math.max(dimensions.width, dimensions.depth)).toBeCloseTo(100, 1);
      expect(validatePrintableObject(object).valid).toBe(true);
    } finally {
      if (object) disposeObject3D(object);
    }
  });

  it.each([
    ['self-intersection', selfIntersectingSvg],
    ['degenerate contour', degenerateSvg],
    ['sub-resolution detail that changes offset topology', tinyDetailsSvg]
  ])('rejects %s instead of exporting plausible-looking geometry', async (_name, svg) => {
    const error = await captureGenerationFailure('cutter', svg, cutterParams);
    expect(error).toBeInstanceOf(CutterGenerationError);
  });

  it.each([
    ['compound hole', compoundHoleSvg],
    ['disconnected relief islands', multipleContoursSvg]
  ])('turns %s into one connected Stamp shell', async (_name, svg) => {
    let object: THREE.Object3D | undefined;

    try {
      object = await generateStamp(svg, {
        ...DEFAULT_PARAMS,
        mode: 'stamp',
        stampBase: true,
        enableHandle: false,
        handleStyle: 'none'
      });
      const report = validatePrintableObject(object, { requireSingleShell: true });

      expect(report.valid, report.errors.join('\n')).toBe(true);
      expect(report.shells).toBe(1);
    } finally {
      if (object) disposeObject3D(object);
    }
  });

  it.each(legacyFixtures)(
    'matches the measured legacy $generator geometry fixture',
    async (fixture) => {
      expect(fixture.schemaVersion).toBe(1);
      expect(fixture.expected.logicalTriangleHashAlgorithm).toBe(LEGACY_HASH_ALGORITHM);
      const parameters = validateCookieCutterParams(fixture.success.parameters);
      expect(parameters).toEqual(fixture.success.parameters);
      expect(parameters.mode).toBe(fixture.generator);

      const contours = extractClosedContours(fixture.success.svg);
      expect({
        contours: contours.length,
        hasHoles: hasGeometricallyNestedHole(contours)
      }).toEqual(fixture.topology);

      let object: THREE.Object3D | undefined;
      try {
        object = await generateLegacyObject(fixture.generator, fixture.success.svg, parameters);
        const report = validatePrintableObject(object, {
          requireSingleShell: fixture.generator === 'stamp'
        });

        expect(report.valid, report.errors.join('\n')).toBe(true);
        expect(report.bounds).not.toBeNull();
        if (!report.bounds) throw new Error('Expected measured world bounds.');

        const dimensions = {
          width: report.bounds.max.x - report.bounds.min.x,
          depth: report.bounds.max.z - report.bounds.min.z,
          height: report.bounds.max.y - report.bounds.min.y
        };
        expectAbsoluteTolerance(
          dimensions.width,
          fixture.expected.dimensionsMm.width,
          fixture.tolerance.dimensionsMm
        );
        expectAbsoluteTolerance(
          dimensions.depth,
          fixture.expected.dimensionsMm.depth,
          fixture.tolerance.dimensionsMm
        );
        expectAbsoluteTolerance(
          dimensions.height,
          fixture.expected.dimensionsMm.height,
          fixture.tolerance.dimensionsMm
        );
        expect(report.triangles).toBe(fixture.expected.triangles);
        expect(report.shells).toBe(fixture.expected.shells);
        expectAbsoluteTolerance(
          report.volume,
          fixture.expected.signedVolumeMm3,
          fixture.tolerance.signedVolumeMm3
        );
        expect(logicalTriangleHash(object)).toBe(fixture.expected.logicalTriangleHash);
      } finally {
        if (object) disposeObject3D(object);
      }
    }
  );

  it.each(legacyFixtures)(
    'rejects the measured legacy $generator failure fixture with its captured code',
    async (fixture) => {
      const parameters = validateCookieCutterParams(fixture.failure.parameters);
      expect(parameters).toEqual(fixture.failure.parameters);
      expect(parameters.mode).toBe(fixture.generator);

      const error = await captureGenerationFailure(
        fixture.generator,
        fixture.failure.svg,
        parameters
      );
      expect(error).toBeInstanceOf(CutterGenerationError);
      expect((error as CutterGenerationError).code).toBe(fixture.failure.errorCode);
    }
  );
});
