import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  error,
  params,
  printability,
  resetParams,
  setParams,
  updateParam
} from '../../stores/cookieCutterStore';
import { DEFAULT_PARAMS, type CookieCutterParams } from '../../types/CookieCutter';
import {
  CutterGenerationError,
  GENERATION_LIMITS,
  validateCookieCutterParams
} from '../generationValidation';

function validParams(): CookieCutterParams {
  return { ...DEFAULT_PARAMS };
}

function expectInvalidParams(value: unknown, field: string): CutterGenerationError {
  let thrown: unknown;

  try {
    validateCookieCutterParams(value);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(CutterGenerationError);
  const generationError = thrown as CutterGenerationError;
  expect(generationError).toMatchObject({
    name: 'CutterGenerationError',
    code: 'INVALID_PARAMS',
    details: { field }
  });
  expect(generationError.message.toLowerCase()).toContain(field.toLowerCase());
  return generationError;
}

describe('CutterGenerationError', () => {
  it('carries a typed code and optional immutable details', () => {
    const error = new CutterGenerationError('SVG_TOO_LARGE', 'The SVG file is too large.', {
      field: 'svg',
      actualBytes: 3_000_000
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CutterGenerationError');
    expect(error.code).toBe('SVG_TOO_LARGE');
    expect(error.details).toEqual({ field: 'svg', actualBytes: 3_000_000 });
    expect(Object.isFrozen(error.details)).toBe(true);
  });
});

describe('GENERATION_LIMITS', () => {
  it('centralizes geometry, SVG and physical safety limits', () => {
    expect(GENERATION_LIMITS).toMatchObject({
      maxSvgBytes: 2 * 1024 * 1024,
      maxSvgPaths: 256,
      maxContours: 512,
      maxPointsPerContour: 10_000,
      maxTotalPoints: 50_000,
      minContourArea: 1e-4,
      triangleAreaEpsilon: 1e-10,
      minWallThickness: 0.4,
      maxWallThickness: 10,
      minCuttingHeight: 1,
      maxCuttingHeight: 100,
      minTotalHeight: 1,
      maxTotalHeight: 150,
      minTaperAngle: 0,
      maxTaperAngle: 30,
      minScale: 0.01,
      maxScale: 100,
      minHandleHeight: 0,
      maxHandleHeight: 100,
      minBuildPlateSize: 20,
      maxBuildPlateSize: 1000,
      minEmbossDepth: 0,
      maxEmbossDepth: 20,
      minStampDepth: 0.1,
      maxStampDepth: 50
    });
  });
});

describe('validateCookieCutterParams', () => {
  it('accepts defaults and returns a distinct frozen copy', () => {
    const validated = validateCookieCutterParams(DEFAULT_PARAMS);

    expect(validated).toEqual(DEFAULT_PARAMS);
    expect(validated).not.toBe(DEFAULT_PARAMS);
    expect(Object.isFrozen(validated)).toBe(true);
  });

  it('accepts the inclusive physical boundaries used by normal controls', () => {
    expect(() =>
      validateCookieCutterParams({
        ...validParams(),
        wallThickness: 0.4,
        cuttingHeight: 1,
        totalHeight: 1,
        taperAngle: 0,
        scale: 0.01,
        enableHandle: false,
        handleHeight: 0,
        buildPlateSize: 20,
        enableEmbossing: false,
        embossDepth: 0,
        stampDepth: 0.1
      })
    ).not.toThrow();

    expect(() =>
      validateCookieCutterParams({
        ...validParams(),
        wallThickness: 10,
        cuttingHeight: 100,
        totalHeight: 150,
        taperAngle: 30,
        scale: 100,
        handleHeight: 100,
        buildPlateSize: 1000,
        embossDepth: 20,
        stampDepth: 50
      })
    ).not.toThrow();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid scale %s instead of clamping it',
    (scale) => {
      expectInvalidParams({ ...validParams(), scale }, 'scale');
    }
  );

  it('rejects a zero cutting height', () => {
    expectInvalidParams({ ...validParams(), cuttingHeight: 0 }, 'cuttingHeight');
  });

  it('rejects a zero total height', () => {
    expectInvalidParams({ ...validParams(), totalHeight: 0 }, 'totalHeight');
  });

  it.each([-1, 0, 0.39, 10.01])('rejects unsafe wall thickness %s', (wallThickness) => {
    expectInvalidParams({ ...validParams(), wallThickness }, 'wallThickness');
  });

  it.each([
    ['cuttingHeight', Number.NaN],
    ['cuttingHeight', Number.POSITIVE_INFINITY],
    ['totalHeight', Number.NaN],
    ['totalHeight', Number.NEGATIVE_INFINITY],
    ['handleHeight', Number.NaN]
  ])('rejects non-finite %s', (field, value) => {
    expectInvalidParams({ ...validParams(), [field]: value }, field);
  });

  it('rejects a total height below the cutting height', () => {
    expectInvalidParams(
      { ...validParams(), cuttingHeight: 12, totalHeight: 11.99 },
      'totalHeight'
    );
  });

  it.each([0, 19.99, 1000.01, Number.NaN])(
    'rejects unsafe build plate size %s',
    (buildPlateSize) => {
      expectInvalidParams({ ...validParams(), buildPlateSize }, 'buildPlateSize');
    }
  );

  it('requires a positive handle height only when the handle is enabled', () => {
    expectInvalidParams({ ...validParams(), enableHandle: true, handleHeight: 0 }, 'handleHeight');
    expect(() =>
      validateCookieCutterParams({ ...validParams(), enableHandle: false, handleHeight: 0 })
    ).not.toThrow();
  });

  it('requires a positive emboss depth only when embossing is enabled', () => {
    expectInvalidParams(
      { ...validParams(), enableEmbossing: true, embossDepth: 0 },
      'embossDepth'
    );
    expect(() =>
      validateCookieCutterParams({ ...validParams(), enableEmbossing: false, embossDepth: 0 })
    ).not.toThrow();
  });

  it.each([
    ['handleStyle', 'rounded'],
    ['mode', 'laser']
  ])('rejects unknown %s enum values', (field, value) => {
    expectInvalidParams({ ...validParams(), [field]: value }, field);
  });

  it.each([
    ['wallThickness', '1'],
    ['enableHandle', 1],
    ['enableEmbossing', 'false'],
    ['stampBase', 'true']
  ])('rejects JSON values with an incorrect type for %s', (field, value) => {
    expectInvalidParams({ ...validParams(), [field]: value }, field);
  });

  it('rejects null, arrays, incomplete objects and unknown fields', () => {
    expectInvalidParams(null, 'params');
    expectInvalidParams([], 'params');

    const incomplete: Record<string, unknown> = { ...validParams() };
    delete incomplete.scale;
    expectInvalidParams(incomplete, 'scale');

    expectInvalidParams({ ...validParams(), unexpected: true }, 'unexpected');
  });

  it('never silently falls back for an invalid value', () => {
    const source = { ...validParams(), scale: undefined };

    expectInvalidParams(source, 'scale');
    expect(source.scale).toBeUndefined();
  });
});

describe('cookieCutterStore parameter safety', () => {
  beforeEach(() => {
    resetParams();
    error.set(null);
  });

  it('stores validated copies without retaining the caller object', () => {
    const input = { ...validParams(), scale: 2 };

    setParams(input);
    const stored = get(params);
    input.scale = 3;

    expect(stored).not.toBe(input);
    expect(stored.scale).toBe(2);
    expect(Object.isFrozen(stored)).toBe(true);
  });

  it('preserves the previous snapshot when setParams rejects input', () => {
    setParams({ ...validParams(), scale: 2 });
    const before = get(params);

    expect(() => setParams({ ...validParams(), scale: Number.NaN })).toThrow(
      CutterGenerationError
    );
    expect(get(params)).toBe(before);
  });

  it('returns false without throwing and preserves the snapshot for an invalid update', () => {
    const before = get(params);
    let result: boolean | undefined;

    expect(() => {
      result = updateParam('scale', 0);
    }).not.toThrow();

    expect(result).toBe(false);
    expect(get(params)).toBe(before);
    expect(get(error)).toMatch(/scale/i);
  });

  it('rejects a total height below the active handle minimum without changing the snapshot', () => {
    const before = get(params);

    expect(updateParam('totalHeight', 19)).toBe(false);

    expect(get(params)).toBe(before);
    expect(get(error)).toMatch(/totalHeight/i);
  });

  it('returns true for a valid update and clears the previous error', () => {
    expect(updateParam('scale', 0)).toBe(false);
    expect(get(error)).toMatch(/scale/i);

    expect(updateParam('scale', 2)).toBe(true);

    expect(get(params).scale).toBe(2);
    expect(get(error)).toBeNull();
  });

  it('atomically raises total height when cutting height needs active handle space', () => {
    expect(updateParam('cuttingHeight', 15)).toBe(true);

    expect(get(params)).toMatchObject({
      cuttingHeight: 15,
      totalHeight: 15 + DEFAULT_PARAMS.handleHeight
    });
  });

  it.each([
    ['a disabled handle', { enableHandle: false, handleStyle: 'round' as const }],
    ['the none handle style', { enableHandle: true, handleStyle: 'none' as const }]
  ])('raises total height only to cutting height with %s', (_description, handleConfig) => {
    setParams({ ...validParams(), ...handleConfig, totalHeight: 12 });

    expect(updateParam('cuttingHeight', 20)).toBe(true);

    expect(get(params)).toMatchObject({ cuttingHeight: 20, totalHeight: 20 });
  });

  it('rejects a cutting height transition whose active handle would exceed maxTotalHeight', () => {
    setParams({
      ...validParams(),
      cuttingHeight: 90,
      totalHeight: GENERATION_LIMITS.maxTotalHeight,
      handleHeight: 60
    });
    const before = get(params);
    let result: boolean | undefined;

    expect(() => {
      result = updateParam('cuttingHeight', 100);
    }).not.toThrow();

    expect(result).toBe(false);
    expect(get(params)).toBe(before);
    expect(get(error)).toMatch(/totalHeight.*150|150.*totalHeight/i);
  });

  it('atomically restores the default emboss depth when enabling embossing from zero', () => {
    setParams({ ...validParams(), enableEmbossing: false, embossDepth: 0 });

    expect(updateParam('enableEmbossing', true)).toBe(true);

    expect(get(params)).toMatchObject({
      enableEmbossing: true,
      embossDepth: DEFAULT_PARAMS.embossDepth
    });
  });

  it('resets to a fresh default snapshot without sharing DEFAULT_PARAMS', () => {
    setParams({ ...validParams(), scale: 2 });

    resetParams();
    const firstReset = get(params);
    resetParams();
    const secondReset = get(params);

    expect(firstReset).toEqual(DEFAULT_PARAMS);
    expect(firstReset).not.toBe(DEFAULT_PARAMS);
    expect(secondReset).not.toBe(firstReset);
    expect(Object.isFrozen(firstReset)).toBe(true);
    expect(Object.isFrozen(secondReset)).toBe(true);
  });

  it('marks a bypassed non-finite snapshot as invalid with a useful message', () => {
    params.set({ ...validParams(), totalHeight: Number.NaN });

    const result = get(printability);
    expect(result.isValid).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/totalHeight/i);
    expect(result.recommendations).toEqual([]);
  });

  it('keeps the existing warnings and recommendations for runtime-valid params', () => {
    params.set({ ...validParams(), wallThickness: 0.5 });
    const thinWall = get(printability);

    expect(thinWall.isValid).toBe(false);
    expect(thinWall.warnings).toContain(
      'Wall thickness is below recommended minimum (0.8mm)'
    );
    expect(thinWall.recommendations).toContain('Print upside down (cutting edge facing up)');
    expect(thinWall.recommendations).toContain('Use PLA or PETG filament');
  });
});
