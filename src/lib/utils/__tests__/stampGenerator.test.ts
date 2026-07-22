import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, type CookieCutterParams } from '../../types/CookieCutter';
import { validatePrintableObject } from '../geometryValidation';
import { CutterGenerationError } from '../generationValidation';
import { getShapeById } from '../shapeLibrary';
import { serializeSTL } from '../stlExporter';
import { generateStamp } from '../stampGenerator';
import { circleSvg } from './fixtures';
import { installSvgLoaderDomParserAdapter } from './svgDomTestSupport';

const disconnectedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
  <rect x="5" y="5" width="25" height="25" />
  <rect x="70" y="20" width="20" height="20" />
</svg>`;

const ringSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 10 10 H 90 V 90 H 10 Z M 35 35 V 65 H 65 V 35 Z" fill-rule="evenodd" />
</svg>`;

function stampParams(overrides: Partial<CookieCutterParams> = {}): CookieCutterParams {
  return {
    ...DEFAULT_PARAMS,
    mode: 'stamp',
    stampBase: true,
    handleStyle: 'none',
    enableHandle: false,
    targetSize: 70,
    sizeMode: 'longest',
    ...overrides
  };
}

let restoreDomParser: (() => void) | undefined;

beforeAll(() => {
  restoreDomParser = installSvgLoaderDomParserAdapter();
});

afterAll(() => {
  restoreDomParser?.();
});

describe('generateStamp', () => {
  it('creates one closed, connected and exportable solid', async () => {
    const group = await generateStamp(circleSvg, stampParams());
    const report = validatePrintableObject(group, { requireSingleShell: true });
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());

    expect(report.valid, report.errors.join('\n')).toBe(true);
    expect(report.meshes).toBe(1);
    expect(report.shells).toBe(1);
    expect(Math.max(size.x, size.z)).toBeCloseTo(70, 1);
    expect(serializeSTL(group, true)).toBeInstanceOf(DataView);
  });

  it('connects disconnected relief islands through one common base', async () => {
    const group = await generateStamp(disconnectedSvg, stampParams({ targetSize: 80 }));
    const report = validatePrintableObject(group, { requireSingleShell: true });

    expect(report.valid, report.errors.join('\n')).toBe(true);
    expect(report.meshes).toBe(1);
    expect(report.shells).toBe(1);
  });

  it('preserves an internal hole while keeping the complete stamp connected', async () => {
    const group = await generateStamp(ringSvg, stampParams());
    const report = validatePrintableObject(group, { requireSingleShell: true });

    expect(report.valid, report.errors.join('\n')).toBe(true);
    expect(report.shells).toBe(1);
  });

  it('joins the handle on the opposite side of the relief', async () => {
    const params = stampParams({
      enableHandle: true,
      handleStyle: 'round',
      handleHeight: 9,
      totalHeight: 21,
      stampDepth: 3
    });
    const group = await generateStamp(circleSvg, params);
    const report = validatePrintableObject(group, { requireSingleShell: true });
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());

    expect(report.valid, report.errors.join('\n')).toBe(true);
    expect(size.y).toBeCloseTo(9 + 4 + 3, 1);
  });

  it('keeps the built-in heart manifold at maximum relief depth with the default round handle', async () => {
    const heart = getShapeById('heart');
    expect(heart).toBeDefined();

    const group = await generateStamp(heart!.svg, stampParams({
      targetSize: 75,
      stampDepth: 5,
      enableHandle: true,
      handleStyle: 'round',
      handleHeight: 8
    }));
    const report = validatePrintableObject(group, { requireSingleShell: true });
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());

    expect(report.valid, report.errors.join('\n')).toBe(true);
    expect(report.meshes).toBe(1);
    expect(report.shells).toBe(1);
    expect(size.y).toBeCloseTo(8 + 4 + 5, 1);
    expect(serializeSTL(group, true)).toBeInstanceOf(DataView);
  });

  it('rejects a baseless stamp because relief islands would not be one usable tool', async () => {
    let thrown: unknown;
    try {
      await generateStamp(circleSvg, stampParams({ stampBase: false }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CutterGenerationError);
    expect(thrown).toMatchObject({
      code: 'INVALID_PARAMS',
      details: { field: 'stampBase' }
    });
  });
});
