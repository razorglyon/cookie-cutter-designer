import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestCookieCutter,
  generateCookieCutter
} from '../cookieCutterGenerator';
import { CutterGenerationError } from '../generationValidation';
import {
  DEFAULT_PARAMS,
  type CookieCutterParams,
  type HandleStyle
} from '../../types/CookieCutter';
import { circleSvg, openPathSvg } from './fixtures';
import { installSvgLoaderDomParserAdapter } from './svgDomTestSupport';

const closedSquareSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 0 0 H 100 V 100 H 0 Z" />
</svg>`;

const rectangularSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
  <path d="M 0 0 H 100 V 50 H 0 Z" />
</svg>`;

const concaveSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <path d="M 0 0 H 40 V 15 H 15 V 40 H 0 Z" />
</svg>`;

const compoundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 0 0 H 100 V 100 H 0 Z M 30 30 V 70 H 70 V 30 Z" fill-rule="evenodd" />
</svg>`;

function params(overrides: Partial<CookieCutterParams> = {}): CookieCutterParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}

function meshes(group: THREE.Group): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) result.push(child);
  });
  return result;
}

function expectWatertight(mesh: THREE.Mesh): void {
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const indices = geometry.getIndex();

  expect(indices).not.toBeNull();
  expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
  expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);

  const edgeCounts = new Map<string, number>();
  for (let item = 0; item < indices!.count; item += 3) {
    const triangle = [
      indices!.getX(item),
      indices!.getX(item + 1),
      indices!.getX(item + 2)
    ];

    for (let edge = 0; edge < 3; edge += 1) {
      const first = triangle[edge];
      const second = triangle[(edge + 1) % 3];
      const key = first < second ? `${first}:${second}` : `${second}:${first}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  expect(Array.from(edgeCounts.values()).every((count) => count === 2)).toBe(true);
}

async function expectGenerationError(
  action: () => Promise<unknown>,
  code: CutterGenerationError['code']
): Promise<CutterGenerationError> {
  let thrown: unknown;
  try {
    await action();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(CutterGenerationError);
  const generationError = thrown as CutterGenerationError;
  expect(generationError.code).toBe(code);
  return generationError;
}

let restoreDomParser: (() => void) | undefined;

beforeAll(() => {
  restoreDomParser = installSvgLoaderDomParserAdapter();
});

afterAll(() => {
  restoreDomParser?.();
});

describe('generateCookieCutter', () => {
  it('builds a centered watertight production mesh with an integrated handle', async () => {
    const group = await generateCookieCutter(circleSvg, params());
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const [mesh] = meshes(group);

    expect(group.name).toBe('cookieCutter');
    expect(meshes(group)).toHaveLength(1);
    expectWatertight(mesh);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(DEFAULT_PARAMS.totalHeight, 5);
    expect(center.x).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
    expect(group.userData.contourCount).toBe(1);
    const size = box.getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.z)).toBeCloseTo(DEFAULT_PARAMS.targetSize, 1);
    expect(group.userData.dimensions).toMatchObject({
      targetSize: DEFAULT_PARAMS.targetSize,
      sizeMode: 'longest'
    });
  });

  it('stops at cuttingHeight when the handle is disabled', async () => {
    const group = await generateCookieCutter(
      circleSvg,
      params({ enableHandle: false, handleStyle: 'none' })
    );
    const box = new THREE.Box3().setFromObject(group);

    expect(box.max.y).toBeCloseTo(DEFAULT_PARAMS.cuttingHeight, 5);
    expectWatertight(meshes(group)[0]);
  });

  it.each<HandleStyle>(['flat', 'round', 'chamfered', 'rectangular'])(
    'generates a connected %s handle profile',
    async (handleStyle) => {
      const group = await generateCookieCutter(circleSvg, params({ handleStyle }));
      const [mesh] = meshes(group);
      const box = new THREE.Box3().setFromObject(group);

      expect(meshes(group)).toHaveLength(1);
      expect(box.max.y).toBeCloseTo(DEFAULT_PARAMS.totalHeight, 5);
      expectWatertight(mesh);
    }
  );

  it('generates every closed compound contour as its own selectable mesh', async () => {
    const group = await generateCookieCutter(
      compoundSvg,
      params({ enableHandle: false, handleStyle: 'none', taperAngle: 3 })
    );

    expect(meshes(group)).toHaveLength(2);
    expect(meshes(group).map(({ name }) => name)).toEqual([
      'cutter-body-0',
      'cutter-body-1'
    ]);
    for (const mesh of meshes(group)) expectWatertight(mesh);
  });

  it('handles a concave SVG without degenerate output', async () => {
    const group = await generateCookieCutter(
      concaveSvg,
      params({ enableHandle: false, handleStyle: 'none', taperAngle: 3 })
    );

    expect(meshes(group)).toHaveLength(1);
    expectWatertight(meshes(group)[0]);
  });

  it.each([
    ['width', 60],
    ['height', 40]
  ] as const)('fits the final %s to an explicit millimeter target', async (sizeMode, targetSize) => {
    const group = await generateCookieCutter(
      rectangularSvg,
      params({
        sizeMode,
        targetSize,
        enableHandle: false,
        handleStyle: 'none',
        taperAngle: 0
      })
    );
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    const measured = sizeMode === 'width' ? size.x : size.z;

    expect(measured).toBeCloseTo(targetSize, 1);
  });

  it('rejects open-only SVG with the extraction error', async () => {
    await expectGenerationError(
      () => generateCookieCutter(openPathSvg, params()),
      'NO_VALID_CONTOURS'
    );
  });

  it('rejects a model outside the build plate instead of silently rescaling it', async () => {
    const error = await expectGenerationError(
      () =>
        generateCookieCutter(
          closedSquareSvg,
          params({
            enableHandle: false,
            handleStyle: 'none',
            taperAngle: 0,
            targetSize: 120,
            buildPlateSize: 100
          })
        ),
      'INVALID_GEOMETRY'
    );

    expect(error.details).toMatchObject({ field: 'buildPlateSize', max: 100 });
  });

  it('validates caller parameters before parsing geometry', async () => {
    const invalid = params({ wallThickness: Number.NaN });
    const error = await expectGenerationError(
      () => generateCookieCutter(circleSvg, invalid),
      'INVALID_PARAMS'
    );

    expect(error.details).toMatchObject({ field: 'wallThickness' });
  });

  it('is deterministic for identical SVG and parameters', async () => {
    const options = params({ enableHandle: false, handleStyle: 'none', taperAngle: 2 });
    const first = await generateCookieCutter(concaveSvg, options);
    const second = await generateCookieCutter(concaveSvg, options);

    expect(Array.from(meshes(first)[0].geometry.getAttribute('position').array)).toEqual(
      Array.from(meshes(second)[0].geometry.getAttribute('position').array)
    );
    expect(Array.from(meshes(first)[0].geometry.getIndex()!.array)).toEqual(
      Array.from(meshes(second)[0].geometry.getIndex()!.array)
    );
  });
});

describe('createTestCookieCutter', () => {
  it('uses the production async generation path', async () => {
    const group = await createTestCookieCutter(params());

    expect(group).toBeInstanceOf(THREE.Group);
    expect(meshes(group)).toHaveLength(1);
    expectWatertight(meshes(group)[0]);
  });
});
