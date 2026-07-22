import { describe, expect, it } from 'vitest';
import { CutterGenerationError } from '../generationValidation';
import { createCutterWalls, offsetPath } from '../pathOperations';
import { concavePoints, squarePoints, starPoints } from './fixtures';

const dumbbellPoints = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4.5 },
  { x: 20, y: 4.5 },
  { x: 20, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 10 },
  { x: 20, y: 10 },
  { x: 20, y: 5.5 },
  { x: 10, y: 5.5 },
  { x: 10, y: 10 },
  { x: 0, y: 10 }
] as const;

function area(points: ReadonlyArray<Readonly<{ x: number; y: number }>>): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum / 2);
}

function bounds(points: ReadonlyArray<Readonly<{ x: number; y: number }>>): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return points.reduce(
    (box, point) => ({
      minX: Math.min(box.minX, point.x),
      minY: Math.min(box.minY, point.y),
      maxX: Math.max(box.maxX, point.x),
      maxY: Math.max(box.maxY, point.y)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    }
  );
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

function expectFiniteNonDegenerate(
  paths: ReadonlyArray<ReadonlyArray<Readonly<{ x: number; y: number }>>>
): void {
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    expect(path.length).toBeGreaterThanOrEqual(3);
    expect(path.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(area(path)).toBeGreaterThan(0);
    expect(Object.isFrozen(path)).toBe(true);
  }
}

describe('offsetPath', () => {
  it('expands and shrinks a square by the requested physical distance', async () => {
    const [outer] = await offsetPath(squarePoints, 1, 'miter');
    const [inner] = await offsetPath(squarePoints, -1, 'miter');

    expect(bounds(outer)).toEqual({ minX: -1, minY: -1, maxX: 41, maxY: 41 });
    expect(bounds(inner)).toEqual({ minX: 1, minY: 1, maxX: 39, maxY: 39 });
    expect(area(outer)).toBeGreaterThan(area(squarePoints));
    expect(area(inner)).toBeLessThan(area(squarePoints));
  });

  it('is independent from caller winding and never mutates the input', async () => {
    const reversed = [...squarePoints].reverse();
    const snapshot = JSON.stringify(reversed);

    const [offset] = await offsetPath(reversed, 1, 'round');

    expect(bounds(offset)).toEqual({ minX: -1, minY: -1, maxX: 41, maxY: 41 });
    expect(JSON.stringify(reversed)).toBe(snapshot);
    expect(Object.isFrozen(offset)).toBe(true);
    expect(offset.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    ['concave', concavePoints],
    ['star', starPoints]
  ])('returns finite non-degenerate paths for a %s contour', async (_name, points) => {
    expectFiniteNonDegenerate(await offsetPath(points, 1.25));
    expectFiniteNonDegenerate(await offsetPath(points, -1.25));
  });

  it('returns every path when an inward offset changes topology', async () => {
    const paths = await offsetPath(dumbbellPoints, -1, 'round');

    expect(paths).toHaveLength(2);
    expectFiniteNonDegenerate(paths);
  });

  it('returns an empty result when an inward offset collapses completely', async () => {
    const result = await offsetPath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ],
      -1
    );

    expect(result).toEqual([]);
  });

  it.each([
    [squarePoints, Number.NaN],
    [squarePoints, Number.POSITIVE_INFINITY],
    [[{ x: 0, y: 0 }, { x: 1, y: 0 }], 1],
    [[{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }, { x: 1, y: 0 }], 1],
    [[{ x: 1e12, y: 0 }, { x: 1e12 + 2, y: 0 }, { x: 1e12, y: 2 }], 1]
  ])('rejects unsafe offset input %#', async (points, distance) => {
    await expectGenerationError(
      () => offsetPath(points, distance as number),
      'INVALID_GEOMETRY'
    );
  });
});

describe('createCutterWalls', () => {
  it('preserves all inner rings instead of silently taking the first one', async () => {
    const walls = await createCutterWalls(dumbbellPoints, 2);

    expect(walls.outer).toHaveLength(1);
    expect(walls.inner).toHaveLength(2);
    expectFiniteNonDegenerate(walls.outer);
    expectFiniteNonDegenerate(walls.inner);
  });

  it('fails with OFFSET_FAILED when the inner wall collapses instead of reusing input points', async () => {
    const error = await expectGenerationError(
      () =>
        createCutterWalls(
          [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 }
          ],
          2
        ),
      'OFFSET_FAILED'
    );

    expect(error.details).toMatchObject({ side: 'inner', wallThickness: 2 });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid wall thickness %s',
    async (wallThickness) => {
      await expectGenerationError(
        () => createCutterWalls(squarePoints, wallThickness),
        'INVALID_GEOMETRY'
      );
    }
  );
});
