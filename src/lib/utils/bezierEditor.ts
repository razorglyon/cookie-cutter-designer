import * as THREE from 'three';

export interface BezierPoint {
  x: number;
  y: number;
  type: 'anchor' | 'control';
}

export interface BezierSegment {
  start: BezierPoint;
  cp1: BezierPoint; // Control point 1
  cp2: BezierPoint; // Control point 2
  end: BezierPoint;
}

export interface BezierPath {
  segments: BezierSegment[];
  closed: boolean;
}

/**
 * Create a new Bézier segment
 */
export function createBezierSegment(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): BezierSegment {
  // Calculate control points at 1/3 and 2/3 of the line
  const dx = endX - startX;
  const dy = endY - startY;

  return {
    start: { x: startX, y: startY, type: 'anchor' },
    cp1: { x: startX + dx / 3, y: startY + dy / 3, type: 'control' },
    cp2: { x: startX + 2 * dx / 3, y: startY + 2 * dy / 3, type: 'control' },
    end: { x: endX, y: endY, type: 'anchor' }
  };
}

/**
 * Convert Bézier path to SVG path data
 */
export function bezierToSVGPath(path: BezierPath): string {
  if (path.segments.length === 0) return '';

  let pathData = `M ${path.segments[0].start.x} ${path.segments[0].start.y}`;

  for (const segment of path.segments) {
    pathData += ` C ${segment.cp1.x} ${segment.cp1.y}, ${segment.cp2.x} ${segment.cp2.y}, ${segment.end.x} ${segment.end.y}`;
  }

  if (path.closed) {
    pathData += ' Z';
  }

  return pathData;
}

/**
 * Convert Bézier path to full SVG
 */
export function bezierToSVG(path: BezierPath, width: number = 100, height: number = 100): string {
  const pathData = bezierToSVGPath(path);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
    <path d="${pathData}" fill="black" stroke="none"/>
  </svg>`;
}

/**
 * Evaluate a cubic Bézier curve at parameter t (0 to 1)
 */
export function evaluateBezier(segment: BezierSegment, t: number): { x: number; y: number } {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;

  const x =
    mt3 * segment.start.x +
    3 * mt2 * t * segment.cp1.x +
    3 * mt * t2 * segment.cp2.x +
    t3 * segment.end.x;

  const y =
    mt3 * segment.start.y +
    3 * mt2 * t * segment.cp1.y +
    3 * mt * t2 * segment.cp2.y +
    t3 * segment.end.y;

  return { x, y };
}

/**
 * Sample points along a Bézier path
 */
export function sampleBezierPath(path: BezierPath, samplesPerSegment: number = 20): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];

  for (const segment of path.segments) {
    for (let i = 0; i < samplesPerSegment; i++) {
      const t = i / samplesPerSegment;
      const point = evaluateBezier(segment, t);
      points.push(new THREE.Vector2(point.x, point.y));
    }
  }

  // Add the final point
  if (path.segments.length > 0) {
    const lastSegment = path.segments[path.segments.length - 1];
    points.push(new THREE.Vector2(lastSegment.end.x, lastSegment.end.y));
  }

  return points;
}

/**
 * Create a simple shape from preset
 */
export function createPresetBezierPath(preset: 'heart' | 'star' | 'flower' | 'custom'): BezierPath {
  switch (preset) {
    case 'heart':
      return createHeartPath();
    case 'star':
      return createStarPath();
    case 'flower':
      return createFlowerPath();
    default:
      return createDefaultPath();
  }
}

function createHeartPath(): BezierPath {
  const segments: BezierSegment[] = [
    // Right curve
    {
      start: { x: 50, y: 30, type: 'anchor' },
      cp1: { x: 50, y: 20, type: 'control' },
      cp2: { x: 70, y: 20, type: 'control' },
      end: { x: 70, y: 30, type: 'anchor' }
    },
    // Right bottom
    {
      start: { x: 70, y: 30, type: 'anchor' },
      cp1: { x: 70, y: 50, type: 'control' },
      cp2: { x: 50, y: 70, type: 'control' },
      end: { x: 50, y: 85, type: 'anchor' }
    },
    // Left bottom
    {
      start: { x: 50, y: 85, type: 'anchor' },
      cp1: { x: 50, y: 70, type: 'control' },
      cp2: { x: 30, y: 50, type: 'control' },
      end: { x: 30, y: 30, type: 'anchor' }
    },
    // Left curve
    {
      start: { x: 30, y: 30, type: 'anchor' },
      cp1: { x: 30, y: 20, type: 'control' },
      cp2: { x: 50, y: 20, type: 'control' },
      end: { x: 50, y: 30, type: 'anchor' }
    }
  ];

  return { segments, closed: true };
}

function createStarPath(): BezierPath {
  const segments: BezierSegment[] = [];
  const numPoints = 5;
  const outerRadius = 40;
  const innerRadius = 18;
  const centerX = 50;
  const centerY = 50;

  for (let i = 0; i < numPoints * 2; i++) {
    const angle = (i * Math.PI) / numPoints - Math.PI / 2;
    const nextAngle = ((i + 1) * Math.PI) / numPoints - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const nextRadius = (i + 1) % 2 === 0 ? outerRadius : innerRadius;

    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    const nextX = centerX + Math.cos(nextAngle) * nextRadius;
    const nextY = centerY + Math.sin(nextAngle) * nextRadius;

    segments.push({
      start: { x, y, type: 'anchor' },
      cp1: { x: x + (nextX - x) * 0.3, y: y + (nextY - y) * 0.3, type: 'control' },
      cp2: { x: x + (nextX - x) * 0.7, y: y + (nextY - y) * 0.7, type: 'control' },
      end: { x: nextX, y: nextY, type: 'anchor' }
    });
  }

  return { segments, closed: true };
}

function createFlowerPath(): BezierPath {
  const segments: BezierSegment[] = [];
  const numPetals = 6;
  const centerX = 50;
  const centerY = 50;
  const petalRadius = 35;

  for (let i = 0; i < numPetals; i++) {
    const angle = (i * 2 * Math.PI) / numPetals;
    const nextAngle = ((i + 1) * 2 * Math.PI) / numPetals;

    // Petal arc
    const x1 = centerX + Math.cos(angle) * 10;
    const y1 = centerY + Math.sin(angle) * 10;
    const cpx1 = centerX + Math.cos(angle) * petalRadius;
    const cpy1 = centerY + Math.sin(angle) * petalRadius;
    const cpx2 = centerX + Math.cos(nextAngle) * petalRadius;
    const cpy2 = centerY + Math.sin(nextAngle) * petalRadius;
    const x2 = centerX + Math.cos(nextAngle) * 10;
    const y2 = centerY + Math.sin(nextAngle) * 10;

    segments.push({
      start: { x: x1, y: y1, type: 'anchor' },
      cp1: { x: cpx1, y: cpy1, type: 'control' },
      cp2: { x: cpx2, y: cpy2, type: 'control' },
      end: { x: x2, y: y2, type: 'anchor' }
    });
  }

  return { segments, closed: true };
}

function createDefaultPath(): BezierPath {
  return {
    segments: [
      createBezierSegment(20, 20, 80, 20),
      createBezierSegment(80, 20, 80, 80),
      createBezierSegment(80, 80, 20, 80),
      createBezierSegment(20, 80, 20, 20)
    ],
    closed: true
  };
}

/**
 * Calculate the bounding box of a Bézier path
 */
export function getBezierBounds(path: BezierPath): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const points = sampleBezierPath(path, 20);

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Normalize Bézier path to fit within a bounding box
 */
export function normalizeBezierPath(
  path: BezierPath,
  targetWidth: number,
  targetHeight: number
): BezierPath {
  const bounds = getBezierBounds(path);
  const scaleX = targetWidth / (bounds.maxX - bounds.minX);
  const scaleY = targetHeight / (bounds.maxY - bounds.minY);
  const scale = Math.min(scaleX, scaleY);

  const offsetX = (targetWidth - (bounds.maxX - bounds.minX) * scale) / 2 - bounds.minX * scale;
  const offsetY = (targetHeight - (bounds.maxY - bounds.minY) * scale) / 2 - bounds.minY * scale;

  const normalizedSegments = path.segments.map((segment) => ({
    start: {
      x: segment.start.x * scale + offsetX,
      y: segment.start.y * scale + offsetY,
      type: segment.start.type as 'anchor' | 'control'
    },
    cp1: {
      x: segment.cp1.x * scale + offsetX,
      y: segment.cp1.y * scale + offsetY,
      type: segment.cp1.type as 'anchor' | 'control'
    },
    cp2: {
      x: segment.cp2.x * scale + offsetX,
      y: segment.cp2.y * scale + offsetY,
      type: segment.cp2.type as 'anchor' | 'control'
    },
    end: {
      x: segment.end.x * scale + offsetX,
      y: segment.end.y * scale + offsetY,
      type: segment.end.type as 'anchor' | 'control'
    }
  }));

  return { segments: normalizedSegments, closed: path.closed };
}
