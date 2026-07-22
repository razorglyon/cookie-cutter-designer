import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CurvePath } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import {
  CutterGenerationError,
  GENERATION_LIMITS,
  type CutterGenerationErrorCode
} from '../generationValidation';
import {
  extractClosedContours,
  normalizeContourPoints,
  signedArea,
  type NormalizedContour
} from '../contourExtraction';
import { circleSvg, openPathSvg } from './fixtures';
import { installSvgLoaderDomParserAdapter } from './svgDomTestSupport';

function svg(contents: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${contents}</svg>`;
}

function expectGenerationError(
  action: () => unknown,
  code: CutterGenerationErrorCode
): CutterGenerationError {
  let thrown: unknown;

  try {
    action();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(CutterGenerationError);
  const generationError = thrown as CutterGenerationError;
  expect(generationError.code).toBe(code);
  return generationError;
}

function expectNoDuplicateClosure(contour: NormalizedContour): void {
  expect(contour.length).toBeGreaterThanOrEqual(3);
  expect(contour[contour.length - 1]).not.toEqual(contour[0]);
}

let restoreDomParser: (() => void) | undefined;

beforeAll(() => {
  restoreDomParser = installSvgLoaderDomParserAdapter();
});

afterAll(() => {
  restoreDomParser?.();
});

describe('extractClosedContours', () => {
  it('extracts a circle whose Three.js subpath is geometrically closed without autoClose', () => {
    const [contour] = extractClosedContours(circleSvg);

    expect(contour).toHaveLength(48);
    expectNoDuplicateClosure(contour);
    expect(Math.abs(signedArea(contour))).toBeGreaterThan(GENERATION_LIMITS.minContourArea);
  });

  it('extracts a path closed with Z without duplicating its closing point', () => {
    const [contour] = extractClosedContours(
      svg('<path d="M 0 0 L 40 0 L 40 40 L 0 40 Z" />')
    );

    expect(contour).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 }
    ]);
    expectNoDuplicateClosure(contour);
  });

  it('rejects an open path and reports why no contour survived', () => {
    const error = expectGenerationError(
      () => extractClosedContours(openPathSvg),
      'NO_VALID_CONTOURS'
    );

    expect(error.details).toMatchObject({ rejectedOpen: 1, rejectedDegenerate: 0 });
  });

  it('keeps both outer and hole subpaths with their original opposite winding', () => {
    const contours = extractClosedContours(
      svg(
        '<path d="M 0 0 H 100 V 100 H 0 Z M 25 25 V 75 H 75 V 25 Z" fill-rule="evenodd" />'
      )
    );

    expect(contours).toHaveLength(2);
    expect(Math.sign(signedArea(contours[0]))).toBe(-Math.sign(signedArea(contours[1])));
  });

  it('removes repeated consecutive and closing points', () => {
    const [contour] = extractClosedContours(
      svg('<path d="M 0 0 L 40 0 L 40 0 L 40 40 L 0 40 L 0 0 Z" />')
    );

    expect(contour).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 }
    ]);
  });

  it('ignores a degenerate closed subpath when another valid contour exists', () => {
    const contours = extractClosedContours(
      svg(
        '<path d="M 0 0 L 10 0 L 20 0 Z" /><path d="M 0 0 L 20 0 L 20 20 L 0 20 Z" />'
      )
    );

    expect(contours).toHaveLength(1);
    expect(Math.abs(signedArea(contours[0]))).toBe(400);
  });

  it('reports degenerate contours and rejects non-finite sampled coordinates', () => {
    const error = expectGenerationError(
      () => extractClosedContours(svg('<path d="M 0 0 L 10 0 L 20 0 Z" />')),
      'NO_VALID_CONTOURS'
    );

    expect(error.details).toMatchObject({ rejectedOpen: 0, rejectedDegenerate: 1 });
    expect(
      normalizeContourPoints([
        { x: 0, y: 0 },
        { x: Number.POSITIVE_INFINITY, y: 0 },
        { x: 0, y: 1 }
      ])
    ).toBeNull();
  });

  it('rejects contours below the minimum area rather than falling back', () => {
    const error = expectGenerationError(
      () => extractClosedContours(svg('<path d="M 0 0 L 0.001 0 L 0 0.001 Z" />')),
      'NO_VALID_CONTOURS'
    );

    expect(error.details).toMatchObject({ rejectedDegenerate: 1 });
  });

  it('translates malformed SVG path data into a short parse error without exposing a cause', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const error = expectGenerationError(
        () => extractClosedContours(svg('<path id="private-marker" d="M 0 0 L nope Z" />')),
        'SVG_PARSE_FAILED'
      );

      expect(error.message).not.toContain('private-marker');
      expect(error).not.toHaveProperty('cause');
      expect(error.details).toMatchObject({ reason: expect.any(String) });
      expect(String(error.details?.reason).length).toBeLessThanOrEqual(160);
      expect(JSON.stringify(error.details)).not.toContain('private-marker');
    } finally {
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });

  it('checks UTF-8 size before invoking SVGLoader.parse', () => {
    const oversizedSvg = svg(`<!--${'é'.repeat(Math.floor(GENERATION_LIMITS.maxSvgBytes / 2) + 1)}-->`);
    const actual = new TextEncoder().encode(oversizedSvg).byteLength;
    const parseSpy = vi.spyOn(SVGLoader.prototype, 'parse');

    try {
      const error = expectGenerationError(
        () => extractClosedContours(oversizedSvg),
        'SVG_TOO_LARGE'
      );

      expect(error.details).toEqual({
        field: 'svgBytes',
        actual,
        max: GENERATION_LIMITS.maxSvgBytes
      });
      expect(parseSpy).not.toHaveBeenCalled();
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('rejects non-string input before parsing at runtime', () => {
    const parseSpy = vi.spyOn(SVGLoader.prototype, 'parse');

    try {
      const callWithUnknown = extractClosedContours as (
        value: unknown
      ) => ReadonlyArray<NormalizedContour>;
      const error = expectGenerationError(() => callWithUnknown(42), 'INVALID_PARAMS');

      expect(error.details).toMatchObject({ field: 'svgString', actualType: 'number' });
      expect(parseSpy).not.toHaveBeenCalled();
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('rejects more parsed paths than the configured maximum', () => {
    const paths = Array.from(
      { length: GENERATION_LIMITS.maxSvgPaths + 1 },
      () => '<path d="M 0 0 L 2 0 L 0 2 Z" />'
    ).join('');
    const getPointsSpy = vi.spyOn(CurvePath.prototype, 'getPoints');

    try {
      const error = expectGenerationError(
        () => extractClosedContours(svg(paths)),
        'CONTOUR_TOO_COMPLEX'
      );

      expect(error.details).toEqual({
        field: 'paths',
        actual: GENERATION_LIMITS.maxSvgPaths + 1,
        max: GENERATION_LIMITS.maxSvgPaths
      });
      expect(getPointsSpy).not.toHaveBeenCalled();
    } finally {
      getPointsSpy.mockRestore();
    }
  });

  it('counts all subpaths against maxContours before sampling any of them', () => {
    const subpaths = Array.from(
      { length: GENERATION_LIMITS.maxContours + 1 },
      (_, index) => `M ${index * 2} 0 l 1 0 l 0 1 Z`
    ).join(' ');
    const getPointsSpy = vi.spyOn(CurvePath.prototype, 'getPoints');

    try {
      const error = expectGenerationError(
        () => extractClosedContours(svg(`<path d="${subpaths}" />`)),
        'CONTOUR_TOO_COMPLEX'
      );

      expect(error.details).toEqual({
        field: 'contours',
        actual: GENERATION_LIMITS.maxContours + 1,
        max: GENERATION_LIMITS.maxContours
      });
      expect(getPointsSpy).not.toHaveBeenCalled();
    } finally {
      getPointsSpy.mockRestore();
    }
  });

  it('bounds points requested for one contour before excessive sampling', () => {
    const error = expectGenerationError(
      () => extractClosedContours(circleSvg, 5_001),
      'CONTOUR_TOO_COMPLEX'
    );

    expect(error.details).toMatchObject({
      field: 'pointsPerContour',
      max: GENERATION_LIMITS.maxPointsPerContour
    });
    expect(Number(error.details?.actual)).toBeGreaterThan(
      GENERATION_LIMITS.maxPointsPerContour
    );
  });

  it('bounds total sampled points across contours', () => {
    const circles = Array.from(
      { length: 6 },
      (_, index) => `<circle cx="${10 + index * 12}" cy="50" r="5" />`
    ).join('');
    const error = expectGenerationError(
      () => extractClosedContours(svg(circles), 4_500),
      'CONTOUR_TOO_COMPLEX'
    );

    expect(error.details).toMatchObject({
      field: 'totalPoints',
      max: GENERATION_LIMITS.maxTotalPoints
    });
    expect(Number(error.details?.actual)).toBeGreaterThan(GENERATION_LIMITS.maxTotalPoints);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY])(
    'rejects invalid curveSegments value %s',
    (curveSegments) => {
      const error = expectGenerationError(
        () => extractClosedContours(circleSvg, curveSegments),
        'INVALID_PARAMS'
      );

      expect(error.details).toMatchObject({ field: 'curveSegments', value: curveSegments });
    }
  );

  it('returns deeply frozen fresh plain data with finite points and non-zero area', () => {
    const contours = extractClosedContours(circleSvg);
    const [contour] = contours;

    expect(Object.isFrozen(contours)).toBe(true);
    expect(Object.isFrozen(contour)).toBe(true);
    expect(contour.every((point) => Object.isFrozen(point))).toBe(true);
    expect(
      contour.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    ).toBe(true);
    expect(Object.getPrototypeOf(contour[0])).toBe(Object.prototype);
    expect(Math.abs(signedArea(contour))).toBeGreaterThan(0);
  });
});

describe('signedArea', () => {
  it('is pure and preserves the caller winding convention', () => {
    const counterClockwise = Object.freeze([
      Object.freeze({ x: 0, y: 0 }),
      Object.freeze({ x: 2, y: 0 }),
      Object.freeze({ x: 0, y: 2 })
    ]);
    const snapshot = JSON.stringify(counterClockwise);

    expect(signedArea(counterClockwise)).toBe(2);
    expect(signedArea([...counterClockwise].reverse())).toBe(-2);
    expect(JSON.stringify(counterClockwise)).toBe(snapshot);
  });
});
