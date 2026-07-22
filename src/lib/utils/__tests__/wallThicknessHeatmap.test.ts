import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createWallThicknessColorAttribute,
  getTriangleWallThicknesses,
  measureWallThicknessRange,
  setTriangleWallThicknesses,
  wallThicknessColor
} from '../wallThicknessHeatmap';

function triangleGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0
    ], 3)
  );
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

describe('wallThicknessHeatmap', () => {
  it('stores exactly one positive measurement per indexed triangle', () => {
    const geometry = triangleGeometry();

    setTriangleWallThicknesses(geometry, [1.25]);

    expect(getTriangleWallThicknesses(geometry)).toEqual([1.25]);
    expect(() => setTriangleWallThicknesses(geometry, [])).toThrow(/one positive value/i);
    expect(() => setTriangleWallThicknesses(geometry, [Number.NaN])).toThrow(
      /one positive value/i
    );
  });

  it('measures the finite range', () => {
    expect(measureWallThicknessRange([1.2, 0.8, 1])).toEqual({ min: 0.8, max: 1.2 });
  });

  it('maps thin, target and thick measurements to an ordered heatmap', () => {
    const thin = wallThicknessColor(0.5, 1);
    const target = wallThicknessColor(1, 1);
    const thick = wallThicknessColor(2, 1);

    expect(thin.getHexString()).toBe('2563eb');
    expect(target.getHexString()).toBe('22c55e');
    expect(thick.getHexString()).toBe('f97316');
    expect(wallThicknessColor(2, 1, 5).getHexString()).not.toBe('f97316');
  });

  it('repeats each triangle color for its three display vertices', () => {
    const attribute = createWallThicknessColorAttribute([0.5, 1, 2], 1);

    expect(attribute.count).toBe(9);
    for (let triangle = 0; triangle < 3; triangle += 1) {
      const first = new THREE.Color(
        attribute.getX(triangle * 3),
        attribute.getY(triangle * 3),
        attribute.getZ(triangle * 3)
      );
      for (let vertex = 1; vertex < 3; vertex += 1) {
        expect(attribute.getX(triangle * 3 + vertex)).toBeCloseTo(first.r, 6);
        expect(attribute.getY(triangle * 3 + vertex)).toBeCloseTo(first.g, 6);
        expect(attribute.getZ(triangle * 3 + vertex)).toBeCloseTo(first.b, 6);
      }
    }
  });

  it('keeps horizontal caps neutral while coloring vertical walls', () => {
    const positions = new THREE.Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      0, 0, 1,
      0, 0, 0,
      1, 0, 0,
      0, 1, 0
    ], 3);
    const attribute = createWallThicknessColorAttribute([1, 1], 1, 2, positions);
    const cap = new THREE.Color(attribute.getX(0), attribute.getY(0), attribute.getZ(0));
    const wall = new THREE.Color(attribute.getX(3), attribute.getY(3), attribute.getZ(3));

    expect(cap.getHexString()).toBe('64748b');
    expect(wall.getHexString()).toBe('22c55e');
  });

  it('shares averaged colors across adjacent wall triangles', () => {
    const positions = new THREE.Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 0
    ], 3);
    const attribute = createWallThicknessColorAttribute([1, 3], 1, 3, positions);

    expect(attribute.getX(1)).toBeCloseTo(attribute.getX(3));
    expect(attribute.getY(1)).toBeCloseTo(attribute.getY(3));
    expect(attribute.getZ(1)).toBeCloseTo(attribute.getZ(3));
    expect(attribute.getX(2)).toBeCloseTo(attribute.getX(5));
    expect(attribute.getY(2)).toBeCloseTo(attribute.getY(5));
    expect(attribute.getZ(2)).toBeCloseTo(attribute.getZ(5));
    expect(attribute.getX(0)).not.toBeCloseTo(attribute.getX(4));
  });
});
