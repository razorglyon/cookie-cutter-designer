import * as THREE from 'three';

export type PatternType = 'grid' | 'radial' | 'honeycomb' | 'spiral' | 'wave' | 'brick';

export interface PatternConfig {
  type: PatternType;
  spacing: number;
  count: number;
  rotation: number;
  scale: number;
  offset: { x: number; y: number };
}

export interface PatternResult {
  svg: string;
  transforms: Array<{ x: number; y: number; rotation: number; scale: number }>;
}

/**
 * Generate a grid pattern
 */
function generateGridPattern(
  baseShape: string,
  rows: number,
  cols: number,
  spacing: number,
  scale: number
): PatternResult {
  const transforms: Array<{ x: number; y: number; rotation: number; scale: number }> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      transforms.push({
        x: col * spacing,
        y: row * spacing,
        rotation: 0,
        scale
      });
    }
  }

  return { svg: createPatternSVG(baseShape, transforms), transforms };
}

/**
 * Generate a radial pattern (circular array)
 */
function generateRadialPattern(
  baseShape: string,
  count: number,
  radius: number,
  rotation: number,
  scale: number
): PatternResult {
  const transforms: Array<{ x: number; y: number; rotation: number; scale: number }> = [];
  const angleStep = (2 * Math.PI) / count;

  for (let i = 0; i < count; i++) {
    const angle = i * angleStep + (rotation * Math.PI) / 180;
    transforms.push({
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      rotation: (angle * 180) / Math.PI,
      scale
    });
  }

  return { svg: createPatternSVG(baseShape, transforms), transforms };
}

/**
 * Generate a honeycomb pattern
 */
function generateHoneycombPattern(
  baseShape: string,
  rows: number,
  cols: number,
  spacing: number,
  scale: number
): PatternResult {
  const transforms: Array<{ x: number; y: number; rotation: number; scale: number }> = [];
  const hexWidth = spacing;
  const hexHeight = spacing * 0.866; // sin(60°)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const xOffset = row % 2 === 0 ? 0 : hexWidth / 2;
      transforms.push({
        x: col * hexWidth + xOffset,
        y: row * hexHeight,
        rotation: 0,
        scale
      });
    }
  }

  return { svg: createPatternSVG(baseShape, transforms), transforms };
}

/**
 * Generate a spiral pattern
 */
function generateSpiralPattern(
  baseShape: string,
  count: number,
  spiralTightness: number,
  rotation: number,
  scale: number
): PatternResult {
  const transforms: Array<{ x: number; y: number; rotation: number; scale: number }> = [];
  const angleStep = (2 * Math.PI) / 8;

  for (let i = 0; i < count; i++) {
    const angle = i * angleStep + (rotation * Math.PI) / 180;
    const radius = i * spiralTightness;
    transforms.push({
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      rotation: (angle * 180) / Math.PI,
      scale: scale * (1 - i / (count * 2)) // Gradually decrease size
    });
  }

  return { svg: createPatternSVG(baseShape, transforms), transforms };
}

/**
 * Generate a wave pattern
 */
function generateWavePattern(
  baseShape: string,
  count: number,
  wavelength: number,
  amplitude: number,
  scale: number
): PatternResult {
  const transforms: Array<{ x: number; y: number; rotation: number; scale: number }> = [];
  const spacing = 100 / count;

  for (let i = 0; i < count; i++) {
    const x = i * spacing;
    const y = 50 + Math.sin((i * 2 * Math.PI) / wavelength) * amplitude;
    transforms.push({
      x,
      y,
      rotation: 0,
      scale
    });
  }

  return { svg: createPatternSVG(baseShape, transforms), transforms };
}

/**
 * Generate a brick pattern
 */
function generateBrickPattern(
  baseShape: string,
  rows: number,
  cols: number,
  spacing: number,
  scale: number
): PatternResult {
  const transforms: Array<{ x: number; y: number; rotation: number; scale: number }> = [];

  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : spacing / 2;
    for (let col = 0; col < cols; col++) {
      transforms.push({
        x: col * spacing + offset,
        y: row * spacing,
        rotation: 0,
        scale
      });
    }
  }

  return { svg: createPatternSVG(baseShape, transforms), transforms };
}

/**
 * Main pattern generator
 */
export function generatePattern(
  baseShape: string,
  config: PatternConfig
): PatternResult {
  const { type, spacing, count, rotation, scale } = config;

  switch (type) {
    case 'grid':
      return generateGridPattern(baseShape, count, count, spacing, scale);
    case 'radial':
      return generateRadialPattern(baseShape, count, spacing, rotation, scale);
    case 'honeycomb':
      return generateHoneycombPattern(baseShape, count, count, spacing, scale);
    case 'spiral':
      return generateSpiralPattern(baseShape, count, spacing, rotation, scale);
    case 'wave':
      return generateWavePattern(baseShape, count, spacing, 10, scale);
    case 'brick':
      return generateBrickPattern(baseShape, count, count, spacing, scale);
    default:
      return { svg: '', transforms: [] };
  }
}

/**
 * Create SVG from transforms
 */
function createPatternSVG(
  baseShape: string,
  transforms: Array<{ x: number; y: number; rotation: number; scale: number }>
): string {
  // Extract the path from the base shape SVG
  const pathMatch = baseShape.match(/<path[^>]*d="([^"]+)"/);
  const circleMatch = baseShape.match(/<circle[^>]*cx="([^"]+)"[^>]*cy="([^"]+)"[^>]*r="([^"]+)"/);
  const rectMatch = baseShape.match(/<rect[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*width="([^"]+)"[^>]*height="([^"]+)"/);

  let shapeElement = '';

  if (pathMatch) {
    shapeElement = `<path d="${pathMatch[1]}" fill="black"/>`;
  } else if (circleMatch) {
    const cx = circleMatch[1];
    const cy = circleMatch[2];
    const r = circleMatch[3];
    shapeElement = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="black"/>`;
  } else if (rectMatch) {
    shapeElement = `<rect x="${rectMatch[1]}" y="${rectMatch[2]}" width="${rectMatch[3]}" height="${rectMatch[4]}" fill="black"/>`;
  } else {
    // Fallback to a simple circle
    shapeElement = '<circle cx="50" cy="50" r="5" fill="black"/>';
  }

  let svgContent = '';
  for (const transform of transforms) {
    const transformStr = `translate(${transform.x}, ${transform.y}) rotate(${transform.rotation}) scale(${transform.scale})`;
    svgContent += `<g transform="${transformStr}">${shapeElement}</g>\n`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    ${svgContent}
  </svg>`;
}

/**
 * Get pattern presets
 */
export function getPatternPresets(): Array<{
  name: string;
  type: PatternType;
  icon: string;
  defaultConfig: PatternConfig;
}> {
  return [
    {
      name: 'Grid',
      type: 'grid',
      icon: '⊞',
      defaultConfig: {
        type: 'grid',
        spacing: 15,
        count: 5,
        rotation: 0,
        scale: 0.8,
        offset: { x: 0, y: 0 }
      }
    },
    {
      name: 'Radial',
      type: 'radial',
      icon: '✴️',
      defaultConfig: {
        type: 'radial',
        spacing: 30,
        count: 8,
        rotation: 0,
        scale: 0.6,
        offset: { x: 0, y: 0 }
      }
    },
    {
      name: 'Honeycomb',
      type: 'honeycomb',
      icon: '⬡',
      defaultConfig: {
        type: 'honeycomb',
        spacing: 12,
        count: 6,
        rotation: 0,
        scale: 0.7,
        offset: { x: 0, y: 0 }
      }
    },
    {
      name: 'Spiral',
      type: 'spiral',
      icon: '🌀',
      defaultConfig: {
        type: 'spiral',
        spacing: 3,
        count: 15,
        rotation: 0,
        scale: 0.5,
        offset: { x: 0, y: 0 }
      }
    },
    {
      name: 'Wave',
      type: 'wave',
      icon: '〰️',
      defaultConfig: {
        type: 'wave',
        spacing: 8,
        count: 10,
        rotation: 0,
        scale: 0.6,
        offset: { x: 0, y: 0 }
      }
    },
    {
      name: 'Brick',
      type: 'brick',
      icon: '🧱',
      defaultConfig: {
        type: 'brick',
        spacing: 15,
        count: 5,
        rotation: 0,
        scale: 0.8,
        offset: { x: 0, y: 0 }
      }
    }
  ];
}

/**
 * Calculate bounding box for a pattern
 */
export function getPatternBounds(result: PatternResult): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (result.transforms.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const transform of result.transforms) {
    minX = Math.min(minX, transform.x);
    minY = Math.min(minY, transform.y);
    maxX = Math.max(maxX, transform.x);
    maxY = Math.max(maxY, transform.y);
  }

  return { minX, minY, maxX, maxY };
}
