import { describe, expect, it } from 'vitest';
import {
  circleSvg,
  concavePoints,
  duplicatePoints,
  emptySvg,
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
});
