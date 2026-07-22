import { describe, expect, it } from 'vitest';
import {
  circleSvg,
  concavePoints,
  duplicatePoints,
  emptySvg,
  noisyRasterFixture,
  openPathSvg,
  squarePoints,
  starPoints,
  tinyFeaturePoints
} from './fixtures';

const closedContourFixtures = [squarePoints, starPoints, concavePoints, tinyFeaturePoints];

describe('3D generation fixtures', () => {
  it('provides representative finite contours', () => {
    expect(squarePoints).toHaveLength(4);

    for (const points of closedContourFixtures) {
      expect(points.length).toBeGreaterThanOrEqual(3);
      expect(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    }
  });

  it('preserves duplicate-point edge cases', () => {
    expect(duplicatePoints[1]).toEqual(duplicatePoints[2]);
    expect(duplicatePoints.at(-1)).toEqual(duplicatePoints[0]);
  });

  it('loads SVG fixtures in the happy-dom environment', () => {
    const container = document.createElement('div');

    container.innerHTML = circleSvg;
    expect(container.querySelector('circle')).not.toBeNull();

    container.innerHTML = emptySvg;
    expect(container.querySelector('svg')?.childElementCount).toBe(0);

    container.innerHTML = openPathSvg;
    expect(container.querySelector('path')?.getAttribute('d')).not.toMatch(/[zZ]/);
  });

  it('provides a deterministic opaque noisy raster fixture', () => {
    const first = noisyRasterFixture(16, 8);
    const second = noisyRasterFixture(16, 8);

    expect(first.width).toBe(16);
    expect(first.height).toBe(8);
    expect(first.data).toEqual(second.data);
    expect(Array.from(first.data).filter((_value, index) => index % 4 === 3))
      .toEqual(Array(16 * 8).fill(255));
  });
});
