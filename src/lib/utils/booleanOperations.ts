import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'difference';

export interface BooleanShape {
  id: string;
  svgData: string;
  position: { x: number; y: number };
  rotation: number;
  scale: number;
  operation: BooleanOperation;
}

export interface BooleanResult {
  combinedSVG: string;
  shapes: BooleanShape[];
  bounds: { width: number; height: number };
}

/**
 * Combine multiple shapes using boolean operations
 */
export function combineShapes(shapes: BooleanShape[]): BooleanResult {
  if (shapes.length === 0) {
    return {
      combinedSVG: '',
      shapes: [],
      bounds: { width: 0, height: 0 }
    };
  }

  // Start with the first shape as the base
  let combinedPaths = parseSVGPaths(shapes[0].svgData);

  // Apply transformations to first shape
  combinedPaths = transformPaths(combinedPaths, shapes[0]);

  // Apply boolean operations for remaining shapes
  for (let i = 1; i < shapes.length; i++) {
    const shape = shapes[i];
    let newPaths = parseSVGPaths(shape.svgData);
    newPaths = transformPaths(newPaths, shape);

    switch (shape.operation) {
      case 'union':
        combinedPaths = unionPaths(combinedPaths, newPaths);
        break;
      case 'subtract':
        combinedPaths = subtractPaths(combinedPaths, newPaths);
        break;
      case 'intersect':
        combinedPaths = intersectPaths(combinedPaths, newPaths);
        break;
      case 'difference':
        combinedPaths = differencePaths(combinedPaths, newPaths);
        break;
    }
  }

  // Generate SVG from combined paths
  const bounds = calculateBounds(combinedPaths);
  const svgData = generateSVGFromPaths(combinedPaths, bounds);

  return {
    combinedSVG: svgData,
    shapes,
    bounds
  };
}

/**
 * Parse SVG data into path objects
 */
function parseSVGPaths(svgData: string): Path2D[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgData, 'image/svg+xml');
  const pathElements = doc.querySelectorAll('path, circle, rect, polygon, polyline, ellipse');

  const paths: Path2D[] = [];

  pathElements.forEach(element => {
    const path = new Path2D();

    if (element.tagName === 'path') {
      const d = element.getAttribute('d');
      if (d) path.addPath(new Path2D(d));
    } else if (element.tagName === 'circle') {
      const cx = parseFloat(element.getAttribute('cx') || '0');
      const cy = parseFloat(element.getAttribute('cy') || '0');
      const r = parseFloat(element.getAttribute('r') || '0');
      path.arc(cx, cy, r, 0, Math.PI * 2);
    } else if (element.tagName === 'rect') {
      const x = parseFloat(element.getAttribute('x') || '0');
      const y = parseFloat(element.getAttribute('y') || '0');
      const width = parseFloat(element.getAttribute('width') || '0');
      const height = parseFloat(element.getAttribute('height') || '0');
      path.rect(x, y, width, height);
    }

    paths.push(path);
  });

  return paths;
}

/**
 * Transform paths based on shape properties
 */
function transformPaths(paths: Path2D[], shape: BooleanShape): Path2D[] {
  // Note: Path2D doesn't support direct transformations in all browsers
  // This is a simplified version - in production, use a library like paper.js
  return paths; // Simplified - would need proper transformation
}

/**
 * Union operation - combine two path sets
 */
function unionPaths(paths1: Path2D[], paths2: Path2D[]): Path2D[] {
  // Simplified implementation - in production use clipper.js or similar
  return [...paths1, ...paths2];
}

/**
 * Subtract operation - remove paths2 from paths1
 */
function subtractPaths(paths1: Path2D[], paths2: Path2D[]): Path2D[] {
  // Simplified implementation - in production use clipper.js or similar
  return paths1;
}

/**
 * Intersect operation - keep only overlapping areas
 */
function intersectPaths(paths1: Path2D[], paths2: Path2D[]): Path2D[] {
  // Simplified implementation - in production use clipper.js or similar
  return paths1;
}

/**
 * Difference operation - symmetric difference
 */
function differencePaths(paths1: Path2D[], paths2: Path2D[]): Path2D[] {
  // Simplified implementation - in production use clipper.js or similar
  return paths1;
}

/**
 * Calculate bounding box of paths
 */
function calculateBounds(paths: Path2D[]): { width: number; height: number } {
  // Simplified - would need proper path bounds calculation
  return { width: 100, height: 100 };
}

/**
 * Generate SVG from paths
 */
function generateSVGFromPaths(paths: Path2D[], bounds: { width: number; height: number }): string {
  // Simplified SVG generation
  // In production, convert Path2D back to SVG path data
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bounds.width} ${bounds.height}">
    <rect width="${bounds.width}" height="${bounds.height}" fill="black"/>
  </svg>`;
}

/**
 * Create common boolean shape presets
 */
export function createBooleanPresets(): Record<string, BooleanShape[]> {
  return {
    'heart-with-hole': [
      {
        id: 'heart',
        svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M 50,85 C 50,85 20,60 20,45 C 20,30 30,25 40,25 C 45,25 50,30 50,30 C 50,30 55,25 60,25 C 70,25 80,30 80,45 C 80,60 50,85 50,85 Z" fill="black"/>
        </svg>`,
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: 1,
        operation: 'union'
      },
      {
        id: 'circle',
        svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <circle cx="50" cy="45" r="10" fill="black"/>
        </svg>`,
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: 1,
        operation: 'subtract'
      }
    ],
    'star-and-circle': [
      {
        id: 'star',
        svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M 50,10 L 61,40 L 95,40 L 68,60 L 79,90 L 50,70 L 21,90 L 32,60 L 5,40 L 39,40 Z" fill="black"/>
        </svg>`,
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: 1,
        operation: 'union'
      },
      {
        id: 'circle',
        svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="20" fill="black"/>
        </svg>`,
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: 1,
        operation: 'intersect'
      }
    ],
    'double-heart': [
      {
        id: 'heart1',
        svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M 50,85 C 50,85 20,60 20,45 C 20,30 30,25 40,25 C 45,25 50,30 50,30 C 50,30 55,25 60,25 C 70,25 80,30 80,45 C 80,60 50,85 50,85 Z" fill="black"/>
        </svg>`,
        position: { x: -10, y: 0 },
        rotation: 0,
        scale: 0.8,
        operation: 'union'
      },
      {
        id: 'heart2',
        svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M 50,85 C 50,85 20,60 20,45 C 20,30 30,25 40,25 C 45,25 50,30 50,30 C 50,30 55,25 60,25 C 70,25 80,30 80,45 C 80,60 50,85 50,85 Z" fill="black"/>
        </svg>`,
        position: { x: 10, y: 0 },
        rotation: 0,
        scale: 0.8,
        operation: 'union'
      }
    ]
  };
}

/**
 * Advanced SVG boolean operations using canvas
 * This provides a more robust implementation using Canvas 2D API
 */
export function performCanvasBoolean(
  svg1: string,
  svg2: string,
  operation: BooleanOperation,
  size: number = 500
): string {
  const canvas1 = renderSVGToCanvas(svg1, size);
  const canvas2 = renderSVGToCanvas(svg2, size);

  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = size;
  resultCanvas.height = size;
  const ctx = resultCanvas.getContext('2d')!;

  const imageData1 = canvas1.getContext('2d')!.getImageData(0, 0, size, size);
  const imageData2 = canvas2.getContext('2d')!.getImageData(0, 0, size, size);
  const resultData = ctx.createImageData(size, size);

  // Perform pixel-wise boolean operation
  for (let i = 0; i < imageData1.data.length; i += 4) {
    const alpha1 = imageData1.data[i + 3];
    const alpha2 = imageData2.data[i + 3];

    let resultAlpha = 0;

    switch (operation) {
      case 'union':
        resultAlpha = Math.max(alpha1, alpha2);
        break;
      case 'subtract':
        resultAlpha = alpha1 > 0 && alpha2 === 0 ? alpha1 : 0;
        break;
      case 'intersect':
        resultAlpha = alpha1 > 0 && alpha2 > 0 ? Math.min(alpha1, alpha2) : 0;
        break;
      case 'difference':
        resultAlpha = (alpha1 > 0 && alpha2 === 0) || (alpha1 === 0 && alpha2 > 0) ? 255 : 0;
        break;
    }

    resultData.data[i] = 0;
    resultData.data[i + 1] = 0;
    resultData.data[i + 2] = 0;
    resultData.data[i + 3] = resultAlpha;
  }

  ctx.putImageData(resultData, 0, 0);

  // Convert canvas to SVG (simplified)
  return canvasToSVG(resultCanvas);
}

/**
 * Render SVG to canvas
 */
function renderSVGToCanvas(svgData: string, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const img = new Image();
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  // Note: This is synchronous for simplicity, in production use Promise
  img.src = url;
  ctx.drawImage(img, 0, 0, size, size);

  URL.revokeObjectURL(url);

  return canvas;
}

/**
 * Convert canvas to SVG (simplified trace)
 */
function canvasToSVG(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Simplified contour tracing
  const paths: string[] = [];
  const visited = new Set<string>();

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      const alpha = imageData.data[idx + 3];

      if (alpha > 128 && !visited.has(`${x},${y}`)) {
        // Found edge - trace it
        const path = traceContour(imageData, x, y, visited);
        if (path) paths.push(path);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}">
    ${paths.map(p => `<path d="${p}" fill="black"/>`).join('\n    ')}
  </svg>`;
}

/**
 * Trace contour from a starting point
 */
function traceContour(
  imageData: ImageData,
  startX: number,
  startY: number,
  visited: Set<string>
): string | null {
  const points: { x: number; y: number }[] = [];
  const stack: { x: number; y: number }[] = [{ x: startX, y: startY }];

  while (stack.length > 0 && points.length < 1000) {
    const point = stack.pop()!;
    const key = `${point.x},${point.y}`;

    if (visited.has(key)) continue;
    visited.add(key);

    const idx = (point.y * imageData.width + point.x) * 4;
    if (idx < 0 || idx >= imageData.data.length) continue;

    const alpha = imageData.data[idx + 3];
    if (alpha > 128) {
      points.push(point);

      // Add neighbors
      const neighbors = [
        { x: point.x + 1, y: point.y },
        { x: point.x - 1, y: point.y },
        { x: point.x, y: point.y + 1 },
        { x: point.x, y: point.y - 1 }
      ];

      neighbors.forEach(n => {
        if (n.x >= 0 && n.x < imageData.width && n.y >= 0 && n.y < imageData.height) {
          stack.push(n);
        }
      });
    }
  }

  if (points.length < 3) return null;

  // Convert points to SVG path
  const pathData = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    return `${acc} L ${p.x} ${p.y}`;
  }, '');

  return `${pathData} Z`;
}

/**
 * Simple shape operations for UI
 */
export function createSimpleBooleanShapes(): Record<string, { svg1: string; svg2: string; operation: BooleanOperation; description: string }> {
  return {
    'union-circles': {
      svg1: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="40" cy="50" r="25" fill="black"/></svg>',
      svg2: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="60" cy="50" r="25" fill="black"/></svg>',
      operation: 'union',
      description: 'Two circles merged together'
    },
    'subtract-circle': {
      svg1: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="25" y="25" width="50" height="50" fill="black"/></svg>',
      svg2: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20" fill="black"/></svg>',
      operation: 'subtract',
      description: 'Square with circular hole'
    },
    'intersect-shapes': {
      svg1: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="black"/></svg>',
      svg2: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="30" y="30" width="40" height="40" fill="black"/></svg>',
      operation: 'intersect',
      description: 'Circle and square intersection'
    }
  };
}
