import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { get, type Readable } from 'svelte/store';
import {
  checkPrintability,
  error,
  parameterError,
  params,
  printability,
  migrateLegacyCookieCutterParams,
  resetParams,
  setParams,
  updateParam,
  updateParams
} from '../../stores/cookieCutterStore';
import { DEFAULT_PARAMS, type CookieCutterParams } from '../../types/CookieCutter';
import {
  CutterGenerationError,
  GENERATION_LIMITS,
  validateCookieCutterParams
} from '../generationValidation';
import { analyzeParameters, autoFixIssues } from '../printOptimizer';

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
      minTargetSize: 10,
      maxTargetSize: 1000,
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
        targetSize: 10,
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
        targetSize: 1000,
        handleStyle: 'none',
        handleHeight: 100,
        buildPlateSize: 1000,
        embossDepth: 20,
        stampDepth: 50
      })
    ).not.toThrow();
  });

  it.each([0, -1, 9.99, 1000.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid target size %s instead of clamping it',
    (targetSize) => {
      expectInvalidParams({ ...validParams(), targetSize }, 'targetSize');
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

  it('rejects a total height below the active handle minimum when handleHeight increases', () => {
    const validationError = expectInvalidParams(
      { ...validParams(), handleHeight: DEFAULT_PARAMS.handleHeight + 1 },
      'totalHeight'
    );

    expect(validationError.message).toMatch(/cuttingHeight.*handleHeight/i);
  });

  it('does not apply cutter height coupling to Stamp mode', () => {
    expect(() =>
      validateCookieCutterParams({
        ...validParams(),
        mode: 'stamp',
        stampBase: true,
        cuttingHeight: 100,
        totalHeight: 1,
        handleHeight: 100
      })
    ).not.toThrow();
  });

  it('rejects baseless Stamp mode because it cannot guarantee one connected tool', () => {
    expectInvalidParams(
      { ...validParams(), mode: 'stamp', stampBase: false },
      'stampBase'
    );
  });

  it('does not reserve handle height when the handle style is none', () => {
    expect(() =>
      validateCookieCutterParams({
        ...validParams(),
        totalHeight: DEFAULT_PARAMS.cuttingHeight,
        handleStyle: 'none',
        handleHeight: GENERATION_LIMITS.maxHandleHeight
      })
    ).not.toThrow();
  });

  it('does not reserve handle height when the handle is disabled', () => {
    expect(() =>
      validateCookieCutterParams({
        ...validParams(),
        totalHeight: DEFAULT_PARAMS.cuttingHeight,
        enableHandle: false,
        handleHeight: GENERATION_LIMITS.maxHandleHeight
      })
    ).not.toThrow();
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

  it('rejects unsupported embossing instead of silently ignoring it', () => {
    expectInvalidParams(
      { ...validParams(), enableEmbossing: true },
      'enableEmbossing'
    );
    expect(() =>
      validateCookieCutterParams({ ...validParams(), enableEmbossing: false, embossDepth: 0 })
    ).not.toThrow();
  });

  it.each([
    ['handleStyle', 'rounded'],
    ['mode', 'laser'],
    ['sizeMode', 'diagonal']
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
    delete incomplete.targetSize;
    expectInvalidParams(incomplete, 'targetSize');

    expectInvalidParams({ ...validParams(), unexpected: true }, 'unexpected');
  });

  it('never silently falls back for an invalid value', () => {
    const source = { ...validParams(), targetSize: undefined };

    expectInvalidParams(source, 'targetSize');
    expect(source.targetSize).toBeUndefined();
  });
});

describe('legacy parameter migration', () => {
  it('converts percentage scale into an explicit millimeter target', () => {
    const legacy: Record<string, unknown> = { ...validParams(), scale: 1.2 };
    delete legacy.targetSize;
    delete legacy.sizeMode;

    expect(migrateLegacyCookieCutterParams(legacy)).toMatchObject({
      targetSize: 90,
      sizeMode: 'longest'
    });

    setParams(legacy);
    expect(get(params)).toMatchObject({ targetSize: 90, sizeMode: 'longest' });
  });
});

describe('cookieCutterStore parameter safety', () => {
  beforeEach(() => {
    resetParams();
    error.set(null);
    parameterError.set(null);
  });

  it('exposes params through a read-only store contract', () => {
    type ParamsHasSet = 'set' extends keyof typeof params ? true : false;
    type ParamsHasUpdate = 'update' extends keyof typeof params ? true : false;

    expectTypeOf(params).toMatchTypeOf<Readable<Readonly<CookieCutterParams>>>();
    expectTypeOf<ParamsHasSet>().toEqualTypeOf<false>();
    expectTypeOf<ParamsHasUpdate>().toEqualTypeOf<false>();
    expect('set' in params).toBe(false);
    expect('update' in params).toBe(false);
  });

  it('stores validated copies without retaining the caller object', () => {
    const input = { ...validParams(), targetSize: 80 };

    setParams(input);
    const stored = get(params);
    input.targetSize = 90;

    expect(stored).not.toBe(input);
    expect(stored.targetSize).toBe(80);
    expect(Object.isFrozen(stored)).toBe(true);
  });

  it('preserves the previous snapshot when setParams rejects input', () => {
    setParams({ ...validParams(), targetSize: 80 });
    const before = get(params);

    expect(() => setParams({ ...validParams(), targetSize: Number.NaN })).toThrow(
      CutterGenerationError
    );
    expect(get(params)).toBe(before);
  });

  it('rejects an invalid active-handle object through setParams without publishing it', () => {
    const before = get(params);

    expect(() =>
      setParams({ ...validParams(), handleHeight: DEFAULT_PARAMS.handleHeight + 1 })
    ).toThrow(/totalHeight/i);

    expect(get(params)).toBe(before);
  });

  it('returns false without throwing and preserves the snapshot for an invalid update', () => {
    const before = get(params);
    let result: boolean | undefined;
    error.set('Generation failed');

    expect(() => {
      result = updateParam('targetSize', 0);
    }).not.toThrow();

    expect(result).toBe(false);
    expect(get(params)).toBe(before);
    expect(get(parameterError)).toMatch(/targetSize/i);
    expect(get(error)).toBe('Generation failed');
  });

  it('rejects an explicitly low total height without changing the snapshot', () => {
    const before = get(params);

    expect(updateParam('totalHeight', 19)).toBe(false);

    expect(get(params)).toBe(before);
    expect(get(parameterError)).toMatch(/totalHeight/i);
  });

  it('clears only parameterError after a valid update', () => {
    error.set('Generation failed');
    expect(updateParam('targetSize', 0)).toBe(false);
    expect(get(parameterError)).toMatch(/targetSize/i);

    expect(updateParam('targetSize', 80)).toBe(true);

    expect(get(params).targetSize).toBe(80);
    expect(get(parameterError)).toBeNull();
    expect(get(error)).toBe('Generation failed');
  });

  it('atomically raises total height when cutting height needs active handle space', () => {
    expect(updateParam('cuttingHeight', 15)).toBe(true);

    expect(get(params)).toMatchObject({
      cuttingHeight: 15,
      totalHeight: 15 + DEFAULT_PARAMS.handleHeight
    });
  });

  it('atomically raises total height when handle height increases', () => {
    expect(updateParam('handleHeight', 10)).toBe(true);

    expect(get(params)).toMatchObject({
      handleHeight: 10,
      totalHeight: DEFAULT_PARAMS.cuttingHeight + 10
    });
  });

  it.each([
    [
      'enableHandle',
      { enableHandle: false, handleStyle: 'round' as const },
      ['enableHandle', true] as const
    ],
    [
      'handleStyle',
      { enableHandle: true, handleStyle: 'none' as const },
      ['handleStyle', 'round'] as const
    ]
  ])('raises total height when %s activates the handle', (_description, initial, update) => {
    setParams({ ...validParams(), ...initial, totalHeight: DEFAULT_PARAMS.cuttingHeight });

    expect(updateParam(update[0], update[1])).toBe(true);

    expect(get(params)).toMatchObject({
      [update[0]]: update[1],
      totalHeight: DEFAULT_PARAMS.cuttingHeight + DEFAULT_PARAMS.handleHeight
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

  it('preserves snapshot identity when the required handle height exceeds maxTotalHeight', () => {
    setParams({
      ...validParams(),
      cuttingHeight: 90,
      totalHeight: GENERATION_LIMITS.maxTotalHeight,
      handleHeight: 60
    });
    const before = get(params);

    expect(updateParam('handleHeight', 61)).toBe(false);

    expect(get(params)).toBe(before);
    expect(get(parameterError)).toMatch(/totalHeight.*150|150.*totalHeight/i);
  });

  it('preserves the snapshot when unsupported embossing is requested', () => {
    setParams({ ...validParams(), enableEmbossing: false, embossDepth: 0 });
    const before = get(params);

    expect(updateParam('enableEmbossing', true)).toBe(false);

    expect(get(params)).toBe(before);
    expect(get(parameterError)).toMatch(/embossing.*not available|not available.*embossing/i);
  });

  it('applies a valid optimizer patch atomically without fallback values', () => {
    const before = get(params);
    parameterError.set('Previous parameter error');

    expect(updateParams({ wallThickness: 1.2, taperAngle: 9 })).toBe(true);

    expect(get(params)).not.toBe(before);
    expect(get(params)).toMatchObject({ wallThickness: 1.2, taperAngle: 9 });
    expect(get(parameterError)).toBeNull();
  });

  it('applies the real optimizer payload and adjusts dependent total height', () => {
    const initial = {
      ...validParams(),
      cuttingHeight: 7,
      handleHeight: 2,
      totalHeight: 9
    };
    setParams(initial);
    const report = analyzeParameters(initial);
    const optimizerPatch = autoFixIssues(report.issues);

    expect(optimizerPatch).toEqual({ cuttingHeight: 12 });
    expect(updateParams(optimizerPatch)).toBe(true);
    expect(get(params)).toMatchObject({
      cuttingHeight: 12,
      handleHeight: 2,
      totalHeight: 14
    });
  });

  it('rejects an invalid optimizer patch atomically and preserves snapshot identity', () => {
    const before = get(params);

    expect(updateParams({ wallThickness: 1.2, targetSize: 0 })).toBe(false);

    expect(get(params)).toBe(before);
    expect(get(params).wallThickness).toBe(DEFAULT_PARAMS.wallThickness);
    expect(get(parameterError)).toMatch(/targetSize/i);
  });

  it('refuses an explicitly low totalHeight in a multi-parameter patch', () => {
    const before = get(params);

    expect(updateParams({ cuttingHeight: 15, totalHeight: 22 })).toBe(false);

    expect(get(params)).toBe(before);
    expect(get(parameterError)).toMatch(/totalHeight/i);
  });

  it('resets to a fresh default snapshot without sharing DEFAULT_PARAMS', () => {
    setParams({ ...validParams(), targetSize: 80 });
    parameterError.set('Previous parameter error');

    resetParams();
    const firstReset = get(params);
    resetParams();
    const secondReset = get(params);

    expect(firstReset).toEqual(DEFAULT_PARAMS);
    expect(firstReset).not.toBe(DEFAULT_PARAMS);
    expect(secondReset).not.toBe(firstReset);
    expect(Object.isFrozen(firstReset)).toBe(true);
    expect(Object.isFrozen(secondReset)).toBe(true);
    expect(get(parameterError)).toBeNull();
  });

  it('clears a stale parameter error after setParams succeeds', () => {
    parameterError.set('Previous parameter error');

    setParams(validParams());

    expect(get(parameterError)).toBeNull();
  });

  it('reports a non-finite snapshot through the pure printability check', () => {
    const result = checkPrintability({ ...validParams(), totalHeight: Number.NaN });

    expect(result.isValid).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/totalHeight/i);
    expect(result.recommendations).toEqual([]);
  });

  it('keeps the existing warnings and recommendations for runtime-valid params', () => {
    setParams({ ...validParams(), wallThickness: 0.5 });
    const thinWall = get(printability);

    expect(thinWall.isValid).toBe(false);
    expect(thinWall.warnings).toContain(
      'Wall thickness is below recommended minimum (0.8mm)'
    );
    expect(thinWall.recommendations).toContain('Print upside down (cutting edge facing up)');
    expect(thinWall.recommendations).toContain('Use PLA or PETG filament');
  });
});
