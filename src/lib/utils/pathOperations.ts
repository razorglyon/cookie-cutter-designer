import {
  ClipType,
  EndType,
  JoinType,
  NativeClipperLibRequestedFormat,
  PolyFillType,
  loadNativeClipperLibInstanceAsync,
  type ClipperLibWrapper,
  type Path,
  type ReadonlyPath,
  type ReadonlyPaths
} from 'js-angusj-clipper';

type Point2D = { x: number; y: number };
type JoinStyle = 'miter' | 'round' | 'square';
type FillRule = 'evenodd' | 'nonzero' | 'positive' | 'negative';

const CLIPPER_SCALE = 1000;

const JOIN_TYPES: Record<JoinStyle, JoinType> = {
  miter: JoinType.Miter,
  round: JoinType.Round,
  square: JoinType.Square
};

const FILL_TYPES: Record<FillRule, PolyFillType> = {
  evenodd: PolyFillType.EvenOdd,
  nonzero: PolyFillType.NonZero,
  positive: PolyFillType.Positive,
  negative: PolyFillType.Negative
};

let clipperLibPromise: Promise<ClipperLibWrapper> | null = null;

/**
 * Initialize and share one Clipper wrapper instance.
 */
function initClipper(): Promise<ClipperLibWrapper> {
  if (!clipperLibPromise) {
    clipperLibPromise = loadNativeClipperLibInstanceAsync(
      NativeClipperLibRequestedFormat.WasmWithAsmJsFallback
    );
  }

  return clipperLibPromise;
}

/**
 * Convert SVG points to Clipper's scaled integer path format.
 */
function svgToClipperPath(points: readonly Point2D[]): Path {
  return points.map(({ x, y }) => ({
    x: Math.round(x * CLIPPER_SCALE),
    y: Math.round(y * CLIPPER_SCALE)
  }));
}

/**
 * Convert a scaled Clipper path back to SVG points.
 */
function clipperToSvgPath(path: ReadonlyPath): Point2D[] {
  return path.map(({ x, y }) => ({
    x: x / CLIPPER_SCALE,
    y: y / CLIPPER_SCALE
  }));
}

function svgToClipperPaths(paths: readonly Point2D[][]): Path[] {
  return paths.map(svgToClipperPath);
}

function clipperToSvgPaths(paths: ReadonlyPaths): Point2D[][] {
  return paths.map(clipperToSvgPath);
}

/**
 * Create offset paths for wall thickness.
 * Positive delta expands a polygon; negative delta shrinks it.
 */
export async function offsetPath(
  points: Point2D[],
  offsetDistance: number,
  joinType: JoinStyle = 'round'
): Promise<Point2D[][]> {
  const clipper = await initClipper();
  const result = clipper.offsetToPaths({
    delta: offsetDistance * CLIPPER_SCALE,
    offsetInputs: [
      {
        data: svgToClipperPath(points),
        joinType: JOIN_TYPES[joinType],
        endType: EndType.ClosedPolygon
      }
    ]
  });

  return result ? clipperToSvgPaths(result) : [];
}

/**
 * Compute the boolean union of closed paths.
 */
export async function unionPaths(paths: Point2D[][]): Promise<Point2D[][]> {
  if (paths.length === 0) return [];

  const clipper = await initClipper();
  const result = clipper.clipToPaths({
    clipType: ClipType.Union,
    subjectFillType: PolyFillType.NonZero,
    subjectInputs: [
      {
        data: svgToClipperPaths(paths),
        closed: true
      }
    ]
  });

  return clipperToSvgPaths(result);
}

/**
 * Subtract closed clip paths from closed subject paths.
 */
export async function differencePaths(
  subjectPaths: Point2D[][],
  clipPaths: Point2D[][]
): Promise<Point2D[][]> {
  if (subjectPaths.length === 0) return [];
  if (clipPaths.length === 0) return subjectPaths.map(path => [...path]);

  const clipper = await initClipper();
  const result = clipper.clipToPaths({
    clipType: ClipType.Difference,
    subjectFillType: PolyFillType.NonZero,
    clipFillType: PolyFillType.NonZero,
    subjectInputs: [
      {
        data: svgToClipperPaths(subjectPaths),
        closed: true
      }
    ],
    clipInputs: [
      {
        data: svgToClipperPaths(clipPaths)
      }
    ]
  });

  return clipperToSvgPaths(result);
}

/**
 * Compute the intersection of two sets of closed paths.
 */
export async function intersectPaths(
  pathsA: Point2D[][],
  pathsB: Point2D[][]
): Promise<Point2D[][]> {
  if (pathsA.length === 0 || pathsB.length === 0) return [];

  const clipper = await initClipper();
  const result = clipper.clipToPaths({
    clipType: ClipType.Intersection,
    subjectFillType: PolyFillType.NonZero,
    clipFillType: PolyFillType.NonZero,
    subjectInputs: [
      {
        data: svgToClipperPaths(pathsA),
        closed: true
      }
    ],
    clipInputs: [
      {
        data: svgToClipperPaths(pathsB)
      }
    ]
  });

  return clipperToSvgPaths(result);
}

/**
 * Remove self-intersections and redundant polygon sections.
 */
export async function simplifyPath(
  points: Point2D[],
  fillType: FillRule = 'nonzero'
): Promise<Point2D[][]> {
  const clipper = await initClipper();
  const result = clipper.simplifyPolygon(
    svgToClipperPath(points),
    FILL_TYPES[fillType]
  );

  return clipperToSvgPaths(result);
}

/**
 * Create inner and outer paths for a cookie-cutter wall.
 */
export async function createCutterWalls(
  points: Point2D[],
  wallThickness: number
): Promise<{ outer: Point2D[]; inner: Point2D[] }> {
  const outerPaths = await offsetPath(points, wallThickness / 2, 'round');
  const innerPaths = await offsetPath(points, -wallThickness / 2, 'round');

  return {
    outer: outerPaths[0] || points,
    inner: innerPaths[0] || points
  };
}
