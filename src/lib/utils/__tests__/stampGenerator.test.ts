import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, type CookieCutterParams } from '../../types/CookieCutter';
import { validatePrintableObject } from '../geometryValidation';
import { CutterGenerationError } from '../generationValidation';
import { getShapeById } from '../shapeLibrary';
import { serializeSTL } from '../stlExporter';
import { generateStamp } from '../stampGenerator';
import { circleSvg } from './fixtures';
import { logicalTriangleHash } from './legacyGeometryFixtureSupport';
import { disposeObject3D } from '../disposeThree';
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
  it.each([circleSvg, ringSvg, disconnectedSvg, getShapeById('heart')!.svg,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M0 0H100V100H0Z M20 20V80H80V20Z M40 40H60V60H40Z"/></svg>'])('subtracts the filled region without piercing the base (%#)', async svg => {
    const depth = 3;
    const params = stampParams({ stampDepth: depth });
    const raised = await generateStamp(svg, params);
    const recessed = await generateStamp(svg, params, 'recessed');
    try {
      const report = validatePrintableObject(recessed, { requireSingleShell: true });
      expect(report.valid, report.errors.join('\n')).toBe(true);
      expect(report.shells).toBe(1);
      expect(report.bounds!.min.y).toBeCloseTo(0, 5);
      expect(report.bounds!.max.y).toBeCloseTo(4, 5);
      expect(report.volume).toBeLessThan(validatePrintableObject(raised).volume);
      const x = svg === disconnectedSvg ? -20 : 0;
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, 0), new THREE.Vector3(0, -1, 0));
      // Ring center is a preserved hole; the artwork at x=-20 is recessed.
      const centerHeight = ray.intersectObject(recessed, true)[0]?.point.y;
      if (svg === ringSvg) expect(centerHeight).toBeCloseTo(4, 5);
      else if (svg !== disconnectedSvg) expect(centerHeight).toBeCloseTo(1, 5);
      const artworkRay = new THREE.Raycaster(new THREE.Vector3(-20, 10, svg === disconnectedSvg ? 5 : 0), new THREE.Vector3(0, -1, 0));
      expect(artworkRay.intersectObject(recessed, true)[0]?.point.y).toBeCloseTo(1, 5);
      const binary = serializeSTL(recessed, true) as DataView;
      expect(binary.byteLength).toBe(84 + 50 * binary.getUint32(80, true));
      expect(binary.getUint32(80, true)).toBe(report.triangles);
    } finally { disposeObject3D(raised); disposeObject3D(recessed); }
  });

  it.each(([0.1, 3] as const).flatMap(stampDepth =>
    (['none', 'round', 'chamfered', 'rectangular', 'flat'] as const).map(handleStyle => ({ stampDepth, handleStyle }))))(
    'keeps the heart cavity closed at $stampDepth mm with the $handleStyle handle', async ({ stampDepth, handleStyle }) => {
      const group = await generateStamp(getShapeById('heart')!.svg,
        stampParams({ stampDepth, handleStyle, enableHandle: handleStyle !== 'none', handleHeight: 8 }), 'recessed');
      try {
        const report = validatePrintableObject(group, { requireSingleShell: true });
        expect(report.valid, report.errors.join('\n')).toBe(true);
        expect(report.shells).toBe(1);
        expect(report.volume).toBeGreaterThan(0);
        const lift = handleStyle === 'none' ? 0 : 8;
        expect(report.bounds!.min.y).toBeCloseTo(0, 5);
        expect(report.bounds!.max.y).toBeCloseTo(lift + 4, 5);
        const ray = new THREE.Raycaster(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -1, 0));
        expect(ray.intersectObject(group, true)[0].point.y).toBeCloseTo(lift + 4 - stampDepth, 5);
        const binary = serializeSTL(group, true) as DataView;
        expect(binary.byteLength).toBe(84 + 50 * report.triangles);
        expect(binary.getUint32(80, true)).toBe(report.triangles);
      } finally { disposeObject3D(group); }
    }
  );

  it.each([0.1, 0.5, 1.5, 2.5, 3])('preserves the exact %s mm depth without a pierced floor', async stampDepth => {
    const group = await generateStamp(circleSvg, stampParams({ stampDepth }), 'recessed');
    try {
      const report = validatePrintableObject(group, { requireSingleShell: true });
      expect(report.valid, report.errors.join('\n')).toBe(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(group, true)[0].point.y).toBeCloseTo(4 - stampDepth, 5);
      expect(report.bounds!.max.y).toBeCloseTo(4, 5);
    } finally { disposeObject3D(group); }
  });

  it('keeps the handle on the back of a 3 mm cavity with 1 mm remaining material', async () => {
    const group = await generateStamp(circleSvg, stampParams({ stampDepth: 3, enableHandle: true, handleStyle: 'round', handleHeight: 9 }), 'recessed');
    try {
      expect(validatePrintableObject(group, { requireSingleShell: true }).valid).toBe(true);
      const bounds = new THREE.Box3().setFromObject(group);
      expect(bounds.min.y).toBeCloseTo(0, 5); expect(bounds.max.y).toBeCloseTo(13, 5);
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(group, true)[0].point.y).toBeCloseTo(10, 5);
    } finally { disposeObject3D(group); }
  });

  it('refuses an over-deep or baseless cavity before building geometry', async () => {
    await expect(generateStamp(circleSvg, stampParams({ stampDepth: 3.01 }), 'recessed')).rejects.toMatchObject({ code: 'INVALID_PARAMS', details: { field: 'stampDepth' } });
    await expect(generateStamp(circleSvg, stampParams({ stampBase: false }), 'recessed')).rejects.toMatchObject({ code: 'INVALID_PARAMS', details: { field: 'stampBase' } });
  });

  it('enforces build plate limits for recessed geometry too', async () => {
    await expect(generateStamp(circleSvg, stampParams({ targetSize: 100, buildPlateSize: 50, stampDepth: 2 }), 'recessed')).rejects.toMatchObject({ details: { field: 'buildPlateSize' } });
  });

  it('characterizes the historical raised route for contours, holes, islands and handles', async () => {
    const hashes: string[] = [];
    for (const [svg, overrides] of [
      [circleSvg, {}],
      [ringSvg, {}],
      [disconnectedSvg, { targetSize: 80 }],
      [circleSvg, { enableHandle: true, handleStyle: 'round', handleHeight: 9, stampDepth: 3 }]
    ] as const) {
      const group = await generateStamp(svg, stampParams(overrides));
      try {
        expect(validatePrintableObject(group, { requireSingleShell: true }).valid).toBe(true);
        expect(serializeSTL(group, true)).toBeInstanceOf(DataView);
        hashes.push(logicalTriangleHash(group));
      } finally { disposeObject3D(group); }
    }
    expect(hashes).toMatchInlineSnapshot(`
      [
        "335c68d1927f0090",
        "cc5e641a148b32e5",
        "05e8502cfaca93f9",
        "006f840f73d1f4d1",
      ]
    `);
  });

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
