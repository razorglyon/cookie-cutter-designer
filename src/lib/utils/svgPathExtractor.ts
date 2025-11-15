import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import * as THREE from 'three';

export interface PathPoint {
  x: number;
  y: number;
}

/**
 * Extract points from SVG string
 */
export function extractPathsFromSVG(svgString: string): PathPoint[][] {
  const loader = new SVGLoader();
  const svgData = loader.parse(svgString);

  const allPaths: PathPoint[][] = [];

  for (const path of svgData.paths) {
    const shapes = SVGLoader.createShapes(path);

    for (const shape of shapes) {
      // Get points from the shape
      const points = shape.getPoints();

      if (points.length > 0) {
        allPaths.push(
          points.map(p => ({
            x: p.x,
            y: p.y
          }))
        );
      }

      // Also get holes if any
      const holes = shape.holes;
      for (const hole of holes) {
        const holePoints = hole.getPoints();
        if (holePoints.length > 0) {
          allPaths.push(
            holePoints.map(p => ({
              x: p.x,
              y: p.y
            }))
          );
        }
      }
    }
  }

  return allPaths;
}

/**
 * Convert paths back to SVG string
 */
export function pathsToSVG(paths: PathPoint[][], viewBoxSize: { width: number; height: number } = { width: 100, height: 100 }): string {
  const pathStrings = paths.map(points => {
    if (points.length === 0) return '';

    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }

    d += ' Z'; // Close path

    return d;
  });

  const pathElements = pathStrings
    .filter(d => d)
    .map(d => `  <path d="${d}" fill="black"/>`)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize.width} ${viewBoxSize.height}">
${pathElements}
</svg>`;
}

/**
 * Get bounding box of all paths
 */
export function getPathsBounds(paths: PathPoint[][]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const path of paths) {
    for (const point of path) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Center paths around origin
 */
export function centerPaths(paths: PathPoint[][]): PathPoint[][] {
  const bounds = getPathsBounds(paths);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return paths.map(path =>
    path.map(p => ({
      x: p.x - centerX,
      y: p.y - centerY
    }))
  );
}

/**
 * Scale paths
 */
export function scalePaths(paths: PathPoint[][], scale: number): PathPoint[][] {
  return paths.map(path =>
    path.map(p => ({
      x: p.x * scale,
      y: p.y * scale
    }))
  );
}

/**
 * Translate paths
 */
export function translatePaths(
  paths: PathPoint[][],
  dx: number,
  dy: number
): PathPoint[][] {
  return paths.map(path =>
    path.map(p => ({
      x: p.x + dx,
      y: p.y + dy
    }))
  );
}
