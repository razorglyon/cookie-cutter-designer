import { loadNativeClipperLibInstanceAsync } from 'js-angusj-clipper';

let clipperLib: any = null;

/**
 * Initialize Clipper library (async)
 */
async function initClipper() {
  if (!clipperLib) {
    clipperLib = await loadNativeClipperLibInstanceAsync();
  }
  return clipperLib;
}

/**
 * Convert SVG path points to Clipper path format
 */
function svgToClipperPath(points: { x: number; y: number }[], scale: number = 100): any[] {
  return points.map(p => ({
    X: Math.round(p.x * scale),
    Y: Math.round(p.y * scale)
  }));
}

/**
 * Convert Clipper path to SVG points
 */
function clipperToSvgPath(clipperPath: any[], scale: number = 100): { x: number; y: number }[] {
  return clipperPath.map(p => ({
    x: p.X / scale,
    y: p.Y / scale
  }));
}

/**
 * Create offset paths (for wall thickness)
 * Positive delta = outward offset, negative = inward offset
 */
export async function offsetPath(
  points: { x: number; y: number }[],
  offsetDistance: number,
  joinType: 'miter' | 'round' | 'square' = 'round'
): Promise<{ x: number; y: number }[][]> {
  const clipper = await initClipper();
  const scale = 1000; // Higher scale for precision

  // Convert to Clipper format
  const clipperPath = svgToClipperPath(points, scale);

  // Create ClipperOffset instance
  const co = new clipper.ClipperOffset();

  // JoinType mapping
  const joinTypeMap = {
    miter: clipper.JoinType.Miter,
    round: clipper.JoinType.Round,
    square: clipper.JoinType.Square
  };

  // Add path
  co.addPath(
    clipperPath,
    joinTypeMap[joinType],
    clipper.EndType.ClosedPolygon
  );

  // Execute offset (distance is scaled)
  const offsetted = new clipper.Paths();
  co.execute(offsetted, offsetDistance * scale);

  // Convert back to SVG format
  const result: { x: number; y: number }[][] = [];
  for (let i = 0; i < offsetted.size(); i++) {
    const path = offsetted.get(i);
    result.push(clipperToSvgPath(path, scale));
  }

  // Cleanup
  co.delete();
  offsetted.delete();

  return result;
}

/**
 * Boolean union of multiple paths
 */
export async function unionPaths(
  pathsArray: { x: number; y: number }[][]
): Promise<{ x: number; y: number }[][]> {
  const clipper = await initClipper();
  const scale = 1000;

  const clipperPaths = new clipper.Paths();
  pathsArray.forEach(points => {
    clipperPaths.push(svgToClipperPath(points, scale));
  });

  const solution = new clipper.Paths();
  const c = new clipper.Clipper();

  c.addPaths(clipperPaths, clipper.PolyType.Subject, true);
  c.execute(
    clipper.ClipType.Union,
    solution,
    clipper.PolyFillType.NonZero,
    clipper.PolyFillType.NonZero
  );

  // Convert result
  const result: { x: number; y: number }[][] = [];
  for (let i = 0; i < solution.size(); i++) {
    const path = solution.get(i);
    result.push(clipperToSvgPath(path, scale));
  }

  // Cleanup
  c.delete();
  clipperPaths.delete();
  solution.delete();

  return result;
}

/**
 * Boolean difference (subtract second from first)
 */
export async function differencePaths(
  subjectPaths: { x: number; y: number }[][],
  clipPaths: { x: number; y: number }[][]
): Promise<{ x: number; y: number }[][]> {
  const clipper = await initClipper();
  const scale = 1000;

  const clipperSubject = new clipper.Paths();
  subjectPaths.forEach(points => {
    clipperSubject.push(svgToClipperPath(points, scale));
  });

  const clipperClip = new clipper.Paths();
  clipPaths.forEach(points => {
    clipperClip.push(svgToClipperPath(points, scale));
  });

  const solution = new clipper.Paths();
  const c = new clipper.Clipper();

  c.addPaths(clipperSubject, clipper.PolyType.Subject, true);
  c.addPaths(clipperClip, clipper.PolyType.Clip, true);

  c.execute(
    clipper.ClipType.Difference,
    solution,
    clipper.PolyFillType.NonZero,
    clipper.PolyFillType.NonZero
  );

  // Convert result
  const result: { x: number; y: number }[][] = [];
  for (let i = 0; i < solution.size(); i++) {
    const path = solution.get(i);
    result.push(clipperToSvgPath(path, scale));
  }

  // Cleanup
  c.delete();
  clipperSubject.delete();
  clipperClip.delete();
  solution.delete();

  return result;
}

/**
 * Boolean intersection of paths
 */
export async function intersectPaths(
  pathsA: { x: number; y: number }[][],
  pathsB: { x: number; y: number }[][]
): Promise<{ x: number; y: number }[][]> {
  const clipper = await initClipper();
  const scale = 1000;

  const clipperA = new clipper.Paths();
  pathsA.forEach(points => {
    clipperA.push(svgToClipperPath(points, scale));
  });

  const clipperB = new clipper.Paths();
  pathsB.forEach(points => {
    clipperB.push(svgToClipperPath(points, scale));
  });

  const solution = new clipper.Paths();
  const c = new clipper.Clipper();

  c.addPaths(clipperA, clipper.PolyType.Subject, true);
  c.addPaths(clipperB, clipper.PolyType.Clip, true);

  c.execute(
    clipper.ClipType.Intersection,
    solution,
    clipper.PolyFillType.NonZero,
    clipper.PolyFillType.NonZero
  );

  // Convert result
  const result: { x: number; y: number }[][] = [];
  for (let i = 0; i < solution.size(); i++) {
    const path = solution.get(i);
    result.push(clipperToSvgPath(path, scale));
  }

  // Cleanup
  c.delete();
  clipperA.delete();
  clipperB.delete();
  solution.delete();

  return result;
}

/**
 * Simplify path (remove redundant points)
 */
export async function simplifyPath(
  points: { x: number; y: number }[],
  fillType: 'evenodd' | 'nonzero' | 'positive' | 'negative' = 'nonzero'
): Promise<{ x: number; y: number }[][]> {
  const clipper = await initClipper();
  const scale = 1000;

  const clipperPath = svgToClipperPath(points, scale);
  const paths = new clipper.Paths();
  paths.push(clipperPath);

  const fillTypeMap = {
    evenodd: clipper.PolyFillType.EvenOdd,
    nonzero: clipper.PolyFillType.NonZero,
    positive: clipper.PolyFillType.Positive,
    negative: clipper.PolyFillType.Negative
  };

  const simplified = clipper.simplifyPaths(paths, fillTypeMap[fillType]);

  const result: { x: number; y: number }[][] = [];
  for (let i = 0; i < simplified.size(); i++) {
    const path = simplified.get(i);
    result.push(clipperToSvgPath(path, scale));
  }

  // Cleanup
  paths.delete();
  simplified.delete();

  return result;
}

/**
 * Create cookie cutter walls using offset
 * Creates inner and outer paths for proper wall thickness
 */
export async function createCutterWalls(
  points: { x: number; y: number }[],
  wallThickness: number
): Promise<{
  outer: { x: number; y: number }[];
  inner: { x: number; y: number }[];
}> {
  // Create outer wall (offset outward by half thickness)
  const outerPaths = await offsetPath(points, wallThickness / 2, 'round');

  // Create inner wall (offset inward by half thickness)
  const innerPaths = await offsetPath(points, -wallThickness / 2, 'round');

  return {
    outer: outerPaths[0] || points,
    inner: innerPaths[0] || points
  };
}
