import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARAMS } from '../../types/CookieCutter';
import { createTestCookieCutter } from '../cookieCutterGenerator';
import { CutterGenerationError } from '../generationValidation';
import {
  estimateSTLSize,
  exportToSTL,
  serializeSTL
} from '../stlExporter';
import { installSvgLoaderDomParserAdapter } from './svgDomTestSupport';

let restoreDomParser: (() => void) | undefined;

beforeAll(() => {
  restoreDomParser = installSvgLoaderDomParserAdapter();
});

afterAll(() => {
  restoreDomParser?.();
});

async function validCutter(): Promise<THREE.Group> {
  return createTestCookieCutter({ ...DEFAULT_PARAMS });
}

function expectExportError(action: () => unknown): CutterGenerationError {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(CutterGenerationError);
  const generationError = thrown as CutterGenerationError;
  expect(generationError.code).toBe('EXPORT_FAILED');
  return generationError;
}

describe('serializeSTL', () => {
  it('serializes a generated cutter to a coherent finite binary STL', async () => {
    const cutter = await validCutter();
    const output = serializeSTL(cutter, true);

    expect(output).toBeInstanceOf(DataView);
    const binary = output as DataView;
    const triangleCount = binary.getUint32(80, true);

    expect(triangleCount).toBeGreaterThan(0);
    expect(binary.byteLength).toBe(84 + 50 * triangleCount);
    expect(estimateSTLSize(cutter, true)).toBe(binary.byteLength);

    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const start = 84 + triangle * 50;
      for (let component = 0; component < 12; component += 1) {
        expect(Number.isFinite(binary.getFloat32(start + component * 4, true))).toBe(true);
      }
    }
  });

  it('serializes ASCII with the same number of facets', async () => {
    const cutter = await validCutter();
    const binary = serializeSTL(cutter, true) as DataView;
    const ascii = serializeSTL(cutter, false);

    expect(typeof ascii).toBe('string');
    expect(ascii).not.toMatch(/NaN|Infinity/);
    expect((ascii as string).match(/\bfacet normal\b/g)).toHaveLength(
      binary.getUint32(80, true)
    );
  });

  it('rejects an empty object before invoking the exporter', () => {
    const error = expectExportError(() => serializeSTL(new THREE.Group(), true));

    expect(error.details).toMatchObject({ triangles: 0, shells: 0 });
  });

  it('rejects non-finite and degenerate geometry', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, Number.NaN, 0, 0, 2, 0, 0], 3)
    );
    geometry.computeVertexNormals();

    const error = expectExportError(() =>
      serializeSTL(new THREE.Mesh(geometry), true)
    );

    expect(error.details?.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/not finite|degenerate/i)])
    );
  });
});

describe('exportToSTL', () => {
  it('never creates a download URL when preflight fails', () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL');

    expectExportError(() => exportToSTL(new THREE.Group(), 'invalid.stl'));

    expect(createObjectUrl).not.toHaveBeenCalled();
    createObjectUrl.mockRestore();
  });
});
