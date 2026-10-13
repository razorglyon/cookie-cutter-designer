import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPlanarStampBody } from '../stampBodyGeometry';
import { extractClosedContours, signedArea } from '../contourExtraction';
import { GENERATION_LIMITS } from '../generationValidation';
import { validatePrintableObject } from '../geometryValidation';
import { getShapeById } from '../shapeLibrary';
import { installSvgLoaderDomParserAdapter } from './svgDomTestSupport';

let restore: () => void;
beforeAll(() => { restore = installSvgLoaderDomParserAdapter(); });
afterAll(() => restore());

function heartOutline() {
  const points = extractClosedContours(getShapeById('heart')!.svg, 48)[0];
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = 8 / Math.max(maxX - minX, maxY - minY);
  const outline = points.map(p => ({ x: Math.fround((p.x - (minX + maxX) / 2) * scale), y: Math.fround((p.y - (minY + maxY) / 2) * scale) }));
  if (signedArea(outline) < 0) outline.reverse();
  return outline;
}

/** Boundary edge counts on the actual Float32 triangles, not a visual comparison. */
function capBoundary(geometry: THREE.BufferGeometry, height: number) {
  const position = geometry.getAttribute('position');
  const edges = new Map<string, number>();
  let area = 0;
  const key = (x: number, y: number) => `${x},${y}`;
  for (let i = 0; i < position.count; i += 3) {
    if (![0, 1, 2].every(j => position.getY(i + j) === height)) continue;
    const vertices = [0, 1, 2].map(j => ({ x: position.getX(i + j), y: -position.getZ(i + j) }));
    area += Math.abs(signedArea(vertices));
    vertices.forEach((a, j) => {
      const b = vertices[(j + 1) % 3];
      const edge = [key(a.x, a.y), key(b.x, b.y)].sort().join('/');
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    });
  }
  return { area, boundary: new Set([...edges].filter(([, count]) => count === 1).map(([edge]) => edge)) };
}

function outlineEdges(outline: readonly { x: number; y: number }[]) {
  return outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length];
    return [`${a.x},${a.y}`, `${b.x},${b.y}`].sort().join('/');
  });
}

describe('10 mm heart planar caps', () => {
  it.each((['raised', 'recessed'] as const).flatMap(mode => [0, 1, 73, 144].flatMap(start => [false, true].map(reverse => ({ mode, start, reverse })))))('$mode start=$start reversed=$reverse preserves all 288 artwork edges, filled areas and analytic volume', ({ mode, start, reverse }) => {
    const original = heartOutline();
    const heart = [...original.slice(start), ...original.slice(0, start)];
    if (reverse) heart.reverse();
    expect(heart).toHaveLength(288);
    const depth = mode === 'raised' ? 2 : 3;
    const imprintPlane = mode === 'raised' ? 6 : 1;
    const geometry = createPlanarStampBody([heart], 10, 10, 4, depth, mode);
    const material = new THREE.MeshBasicMaterial();
    try {
      const report = validatePrintableObject(new THREE.Mesh(geometry, material), { requireSingleShell: true });
      expect(report.valid, report.errors.join('\n')).toBe(true);
      expect(report.shells).toBe(1);
      const imprint = capBoundary(geometry, imprintPlane);
      const base = capBoundary(geometry, 4);
      const rectangle = [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }];
      expect(imprint.boundary).toEqual(new Set(outlineEdges(heart)));
      expect(base.boundary).toEqual(new Set([...outlineEdges(heart), ...outlineEdges(rectangle)]));
      expect(imprint.area).toBeCloseTo(Math.abs(signedArea(heart)), 9);
      expect(base.area).toBeCloseTo(100 - Math.abs(signedArea(heart)), 9);
      expect(report.volume).toBeCloseTo(400 + (mode === 'raised' ? 1 : -1) * depth * Math.abs(signedArea(heart)), 8);
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(position, i);
        const b = new THREE.Vector3().fromBufferAttribute(position, i + 1).sub(a);
        const c = new THREE.Vector3().fromBufferAttribute(position, i + 2).sub(a);
        expect(b.cross(c).lengthSq()).toBeGreaterThan(GENERATION_LIMITS.triangleAreaEpsilon);
      }
    } finally { geometry.dispose(); material.dispose(); }
  });
});
