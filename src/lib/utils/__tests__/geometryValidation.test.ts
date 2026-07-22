import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { validatePrintableObject } from '../geometryValidation';

function messages(report: ReturnType<typeof validatePrintableObject>): string {
  return report.errors.join(' ');
}

function reverseTriangle(
  geometry: THREE.BufferGeometry,
  triangleIndex: number
): THREE.BufferGeometry {
  const index = geometry.getIndex();
  if (!index) throw new Error('Expected an indexed geometry');

  const first = triangleIndex * 3;
  const left = index.getX(first);
  index.setX(first, index.getX(first + 1));
  index.setX(first + 1, left);
  index.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function reverseAllTriangles(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = geometry.getIndex();
  if (!index) throw new Error('Expected an indexed geometry');

  for (let triangle = 0; triangle < index.count / 3; triangle += 1) {
    reverseTriangle(geometry, triangle);
  }

  geometry.computeVertexNormals();
  return geometry;
}

describe('validatePrintableObject', () => {
  it('accepts a finite closed box in world coordinates', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8));
    mesh.position.set(20, 2.5, -4);

    const report = validatePrintableObject(mesh);

    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.triangles).toBe(12);
    expect(report.shells).toBe(1);
    expect(report.meshes).toBe(1);
    expect(report.volume).toBeCloseTo(400, 5);
    expect(report.bounds).not.toBeNull();
    if (!report.bounds) throw new Error('Expected finite bounds');
    expect(report.bounds.min).toEqual({ x: 15, y: 0, z: -8 });
    expect(report.bounds.max).toEqual({ x: 25, y: 5, z: 0 });
  });

  it('rejects an object without printable meshes', () => {
    const report = validatePrintableObject(new THREE.Group());

    expect(report.valid).toBe(false);
    expect(report.triangles).toBe(0);
    expect(report.shells).toBe(0);
    expect(messages(report)).toMatch(/no printable mesh/i);
  });

  it('rejects non-finite positions and normals', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.getAttribute('position').setX(0, Number.NaN);
    geometry.getAttribute('normal').setY(0, Number.POSITIVE_INFINITY);

    const report = validatePrintableObject(new THREE.Mesh(geometry));

    expect(report.valid).toBe(false);
    expect(messages(report)).toMatch(/position.*finite/i);
    expect(messages(report)).toMatch(/normal.*finite/i);
  });

  it('rejects a degenerate triangle', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 2, 0, 0], 3)
    );
    geometry.computeVertexNormals();

    const report = validatePrintableObject(new THREE.Mesh(geometry));

    expect(report.valid).toBe(false);
    expect(messages(report)).toMatch(/degenerate triangle/i);
  });

  it('rejects an out-of-range index without reading invalid vertices', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)
    );
    geometry.setIndex([0, 1, 3]);

    const report = validatePrintableObject(new THREE.Mesh(geometry));

    expect(report.valid).toBe(false);
    expect(messages(report)).toMatch(/index.*range/i);
  });

  it('rejects an open surface even when every triangle is finite', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10));

    const report = validatePrintableObject(mesh);

    expect(report.valid).toBe(false);
    expect(messages(report)).toMatch(/not closed/i);
  });

  it('counts disconnected closed components inside a single mesh', () => {
    const first = new THREE.BoxGeometry(2, 2, 2);
    const second = new THREE.BoxGeometry(2, 2, 2);
    second.translate(10, 0, 0);
    const merged = mergeGeometries([first, second]);
    if (!merged) throw new Error('Expected merged geometry');

    const report = validatePrintableObject(new THREE.Mesh(merged));

    expect(report.valid).toBe(true);
    expect(report.meshes).toBe(1);
    expect(report.shells).toBe(2);
    expect(report.volume).toBeCloseTo(16, 5);
    expect(report.warnings.join(' ')).toMatch(/2 disconnected shells/i);
  });

  it('can require a single connected printable component', () => {
    const group = new THREE.Group();
    const left = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const right = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    right.position.x = 10;
    group.add(left, right);

    const report = validatePrintableObject(group, { requireSingleShell: true });

    expect(report.valid).toBe(false);
    expect(report.meshes).toBe(2);
    expect(report.shells).toBe(2);
    expect(messages(report)).toMatch(/single connected shell/i);
  });

  it('rejects inconsistent winding around a shared edge', () => {
    const geometry = reverseTriangle(new THREE.BoxGeometry(2, 2, 2), 0);

    const report = validatePrintableObject(new THREE.Mesh(geometry));

    expect(report.valid).toBe(false);
    expect(messages(report)).toMatch(/inconsistent triangle orientation/i);
  });

  it('rejects a consistently closed mesh with inward-facing triangles', () => {
    const geometry = reverseAllTriangles(new THREE.BoxGeometry(2, 2, 2));

    const report = validatePrintableObject(new THREE.Mesh(geometry));

    expect(report.valid).toBe(false);
    expect(report.volume).toBeCloseTo(-8, 5);
    expect(messages(report)).toMatch(/outward|positive volume/i);
  });

  it('rejects a zero world scale that collapses an otherwise valid mesh', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8));
    mesh.scale.set(0, 1, 1);

    const report = validatePrintableObject(mesh);

    expect(report.valid).toBe(false);
    expect(messages(report)).toMatch(/degenerate triangle|bounds/i);
  });
});
