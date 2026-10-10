import type * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, type CookieCutterParams } from '../../types/CookieCutter';
import { generateCookieCutter } from '../cookieCutterGenerator';
import { disposeObject3D } from '../disposeThree';
import {
  CutterGenerationError,
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
import {
  fnv1a64,
  inspectSvgTopology,
  LEGACY_HASH_ALGORITHM,
  legacyFixtures,
  logicalTriangleHash,
  normalizeOrientedTriangle,
  type LegacyGeometryFixture,
  type QuantizedTriangle,
  type QuantizedVertex
} from './legacyGeometryFixtureSupport';

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

  it('validates a shallow notch whose offsets simplify vertices without splitting rings', async () => {
    // The old rejection was a vertex-count mismatch, not a component change
    // or a manufacturing-resolution policy. Keep the export validator as the
    // contract: closed, consistently oriented, non-degenerate, positive solid.
    let object: THREE.Object3D | undefined;
    try {
      object = await generateCookieCutter(tinyDetailsSvg, cutterParams);
      const report = validatePrintableObject(object, { requireSingleShell: true });
      expect(report.valid, report.errors.join('\n')).toBe(true);
      expect(report.shells).toBe(1);
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
    ['degenerate contour', degenerateSvg]
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

      expect(inspectSvgTopology(fixture.success.svg)).toEqual(fixture.topology);

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
