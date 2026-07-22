import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { Curve, Vector2 } from 'three';
import {
  CutterGenerationError,
  GENERATION_LIMITS
} from './generationValidation';

export type NormalizedPoint = Readonly<{ x: number; y: number }>;
export type NormalizedContour = ReadonlyArray<NormalizedPoint>;

const POINT_EPSILON = 1e-7;
const POINT_EPSILON_SQUARED = POINT_EPSILON * POINT_EPSILON;

type SampledCurve = Curve<Vector2> & {
  readonly isEllipseCurve?: boolean;
  readonly isLineCurve?: boolean;
  readonly isLineCurve3?: boolean;
  readonly isSplineCurve?: boolean;
  readonly points?: readonly Vector2[];
};

function pointsAreClose(
  first: Readonly<{ x: number; y: number }>,
  second: Readonly<{ x: number; y: number }>
): boolean {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return dx * dx + dy * dy <= POINT_EPSILON_SQUARED;
}

export function signedArea(points: ReadonlyArray<Readonly<{ x: number; y: number }>>): number {
  let twiceArea = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }

  return twiceArea / 2;
}

export function normalizeContourPoints(
  points: ReadonlyArray<Readonly<{ x: number; y: number }>>
): NormalizedContour | null {
  const normalized: Array<{ x: number; y: number }> = [];

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null;
    }

    const copy = { x: point.x, y: point.y };
    const previous = normalized[normalized.length - 1];

    if (!previous || !pointsAreClose(previous, copy)) {
      normalized.push(copy);
    }
  }

  while (
    normalized.length > 1 &&
    pointsAreClose(normalized[0], normalized[normalized.length - 1])
  ) {
    normalized.pop();
  }

  if (normalized.length < 3) {
    return null;
  }

  const area = signedArea(normalized);
  if (!Number.isFinite(area) || Math.abs(area) < GENERATION_LIMITS.minContourArea) {
    return null;
  }

  return Object.freeze(normalized.map((point) => Object.freeze(point)));
}

function svgParseFailed(): CutterGenerationError {
  return new CutterGenerationError(
    'SVG_PARSE_FAILED',
    'The SVG data could not be parsed.',
    { reason: 'Invalid SVG markup or path data.' }
  );
}

function estimateCurvePointCount(curve: SampledCurve, curveSegments: number): number {
  if (curve.isEllipseCurve) {
    return curveSegments * 2 + 1;
  }

  if (curve.isLineCurve || curve.isLineCurve3) {
    return 2;
  }

  if (curve.isSplineCurve) {
    return curveSegments * Math.max(curve.points?.length ?? 1, 1) + 1;
  }

  return curveSegments + 1;
}

function estimateSubPathPointCount(
  curves: readonly Curve<Vector2>[],
  autoClose: boolean,
  curveSegments: number
): number {
  const estimated = curves.reduce(
    (total, curve) => total + estimateCurvePointCount(curve as SampledCurve, curveSegments),
    0
  );

  return estimated + (autoClose ? 1 : 0);
}

function assertCurveSegments(curveSegments: number): void {
  if (
    !Number.isSafeInteger(curveSegments) ||
    curveSegments <= 0
  ) {
    throw new CutterGenerationError(
      'INVALID_PARAMS',
      'The curveSegments parameter must be a positive safe integer.',
      { field: 'curveSegments', value: curveSegments }
    );
  }
}

function assertComplexity(field: string, actual: number, max: number): void {
  if (actual > max) {
    throw new CutterGenerationError(
      'CONTOUR_TOO_COMPLEX',
      `The SVG contains too many ${field} to generate safely.`,
      { field, actual, max }
    );
  }
}

/**
 * Parse an SVG and return only finite, non-degenerate closed contours.
 * Winding is intentionally preserved for later containment classification.
 */
export function extractClosedContours(
  svgString: string,
  curveSegments = 24
): ReadonlyArray<NormalizedContour> {
  assertCurveSegments(curveSegments);

  if (typeof svgString !== 'string') {
    throw new CutterGenerationError(
      'INVALID_PARAMS',
      'The svgString parameter must be a string.',
      { field: 'svgString', actualType: typeof svgString }
    );
  }

  const svgBytes = new TextEncoder().encode(svgString).byteLength;
  if (svgBytes > GENERATION_LIMITS.maxSvgBytes) {
    throw new CutterGenerationError(
      'SVG_TOO_LARGE',
      'The SVG file is too large to generate safely.',
      {
        field: 'svgBytes',
        actual: svgBytes,
        max: GENERATION_LIMITS.maxSvgBytes
      }
    );
  }

  let parsed: ReturnType<SVGLoader['parse']>;
  try {
    parsed = new SVGLoader().parse(svgString);
  } catch {
    throw svgParseFailed();
  }

  assertComplexity('paths', parsed.paths.length, GENERATION_LIMITS.maxSvgPaths);

  const subPaths = parsed.paths.flatMap((path) => path.subPaths);
  assertComplexity('contours', subPaths.length, GENERATION_LIMITS.maxContours);

  let estimatedTotalPoints = 0;
  for (const subPath of subPaths) {
    const estimatedPoints = estimateSubPathPointCount(
      subPath.curves,
      subPath.autoClose,
      curveSegments
    );
    assertComplexity(
      'pointsPerContour',
      estimatedPoints,
      GENERATION_LIMITS.maxPointsPerContour
    );

    estimatedTotalPoints += estimatedPoints;
    assertComplexity(
      'totalPoints',
      estimatedTotalPoints,
      GENERATION_LIMITS.maxTotalPoints
    );
  }

  const contours: NormalizedContour[] = [];
  let rejectedOpen = 0;
  let rejectedDegenerate = 0;
  let actualTotalPoints = 0;

  for (const subPath of subPaths) {
    let start: Vector2;
    let end: Vector2;

    try {
      start = subPath.getPoint(0);
      end = subPath.getPoint(1);
    } catch {
      throw svgParseFailed();
    }

    if (!start || !end) {
      throw svgParseFailed();
    }

    const geometricallyClosed =
      Number.isFinite(start.x) &&
      Number.isFinite(start.y) &&
      Number.isFinite(end.x) &&
      Number.isFinite(end.y) &&
      start.distanceToSquared(end) <= POINT_EPSILON_SQUARED;

    if (!subPath.autoClose && !geometricallyClosed) {
      rejectedOpen += 1;
      continue;
    }

    let sampled: Vector2[];
    try {
      sampled = subPath.getPoints(curveSegments);
    } catch {
      throw svgParseFailed();
    }

    actualTotalPoints += sampled.length;
    assertComplexity(
      'pointsPerContour',
      sampled.length,
      GENERATION_LIMITS.maxPointsPerContour
    );
    assertComplexity(
      'totalPoints',
      actualTotalPoints,
      GENERATION_LIMITS.maxTotalPoints
    );

    const normalized = normalizeContourPoints(sampled);
    if (!normalized) {
      rejectedDegenerate += 1;
      continue;
    }

    contours.push(normalized);
  }

  if (contours.length === 0) {
    throw new CutterGenerationError(
      'NO_VALID_CONTOURS',
      'The SVG does not contain a valid closed contour.',
      { rejectedOpen, rejectedDegenerate }
    );
  }

  return Object.freeze(contours);
}
