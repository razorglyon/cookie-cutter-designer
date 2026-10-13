import * as THREE from 'three';
import type { StampImprintMode } from '../domain/designDocument';
import { GENERATION_LIMITS } from './generationValidation';

type Point = Readonly<{ x: number; y: number }>;
type Outline = readonly Point[];
type Triangle = readonly [Point, Point, Point];

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function safeTriangle(triangle: Triangle): boolean {
  const area2 = cross(...triangle);
  return area2 > 0 && area2 * area2 > GENERATION_LIMITS.triangleAreaEpsilon;
}

function floatPoint(x: number, y: number): Point {
  return { x: Math.fround(x), y: Math.fround(y) };
}

function center(points: Outline): Point {
  return floatPoint(points.reduce((sum, p) => sum + p.x, 0) / points.length,
    points.reduce((sum, p) => sum + p.y, 0) / points.length);
}

/** A replacement may add interior vertices, never remove or split a boundary.
 * Positive faces, exact directed boundary incidence and the area must all agree.
 */
function preservesCap(triangles: readonly Triangle[], outer: Outline, holes: readonly Outline[]): boolean {
  if (!triangles.every(safeTriangle)) return false;
  const key = (p: Point) => `${p.x},${p.y}`;
  const edges = new Map<string, string[]>();
  for (const triangle of triangles) {
    triangle.forEach((a, index) => {
      const b = triangle[(index + 1) % 3], from = key(a), to = key(b);
      const edge = [from, to].sort().join('/');
      edges.set(edge, [...(edges.get(edge) ?? []), `${from}/${to}`]);
    });
  }
  const boundary = new Map<string, string>();
  [outer, ...holes.map(hole => [...hole].reverse())].forEach(loop => loop.forEach((a, index) => {
    const b = loop[(index + 1) % loop.length], from = key(a), to = key(b);
    boundary.set([from, to].sort().join('/'), `${from}/${to}`);
  }));
  for (const [edge, directions] of edges) {
    const expected = boundary.get(edge);
    if (expected) {
      if (directions.length !== 1 || directions[0] !== expected) return false;
      boundary.delete(edge);
    } else if (directions.length !== 2 || directions[0] === directions[1]) return false;
  }
  if (boundary.size) return false;
  const expectedArea = area(outer) - holes.reduce((sum, hole) => sum + area(hole), 0);
  const actualArea = triangles.reduce((sum, triangle) => sum + cross(...triangle) / 2, 0);
  return expectedArea > 0 && Math.abs(actualArea - expectedArea) <= Number.EPSILON * 64 * triangles.length * Math.max(1, expectedArea);
}

/** Find a strip between two rings using only forward boundary edges. Each state
 * consumes one original edge, and every emitted triangle keeps the strict area.
 */
function triangulateRing(inner: Outline, outer: Outline): Triangle[] | null {
  const rows = inner.length + 1, columns = outer.length + 1;
  if (rows * columns > 1_000_000) return null;
  const parent = new Uint8Array(rows * columns);
  parent[0] = 3;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      if (!parent[i * columns + j]) continue;
      const a = inner[i % inner.length], b = outer[j % outer.length];
      if (i < inner.length && safeTriangle([a, b, inner[(i + 1) % inner.length]])) {
        const next = (i + 1) * columns + j;
        if (!parent[next]) parent[next] = 1;
      }
      if (j < outer.length && safeTriangle([a, b, outer[(j + 1) % outer.length]])) {
        const next = i * columns + j + 1;
        if (!parent[next]) parent[next] = 2;
      }
    }
  }
  let i = inner.length, j = outer.length;
  if (!parent[i * columns + j]) return null;
  const triangles: Triangle[] = [];
  while (i || j) {
    const step = parent[i * columns + j];
    if (step === 1) {
      i -= 1;
      triangles.push([inner[i], outer[j % outer.length], inner[(i + 1) % inner.length]]);
    } else {
      j -= 1;
      triangles.push([inner[i % inner.length], outer[j], outer[(j + 1) % outer.length]]);
    }
  }
  return triangles;
}

function ringCandidate(inner: Outline, outer: Outline): Triangle[] | null {
  const attempts = Math.min(outer.length, 8);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const start = Math.floor(attempt * outer.length / attempts);
    const orderedOuter = [...outer.slice(start), ...outer.slice(0, start)];
    let nearest = 0;
    const distance = (p: Point) => (p.x - orderedOuter[0].x) ** 2 + (p.y - orderedOuter[0].y) ** 2;
    inner.forEach((p, index) => { if (distance(p) < distance(inner[nearest])) nearest = index; });
    const candidate = triangulateRing([...inner.slice(nearest), ...inner.slice(0, nearest)], orderedOuter);
    if (candidate) return candidate;
  }
  return null;
}

function capTriangles(outer: THREE.Vector2[], holes: THREE.Vector2[][]): readonly Triangle[] {
  const vertices = [...outer, ...holes.flat()];
  const legacy = THREE.ShapeUtils.triangulateShape(outer.slice(), holes.map(hole => hole.slice())).map(([a, b, c]): Triangle =>
    cross(vertices[a], vertices[b], vertices[c]) > 0 ? [vertices[a], vertices[b], vertices[c]] : [vertices[a], vertices[c], vertices[b]]);
  if (legacy.length && legacy.every(safeTriangle)) return legacy;

  if (!holes.length) {
    const pivot = center(outer);
    const fan = outer.map((p, index): Triangle => [p, outer[(index + 1) % outer.length], pivot]);
    if (preservesCap(fan, outer, holes)) return fan;
  } else if (holes.length === 1) {
    const direct = ringCandidate(holes[0], outer);
    if (direct && preservesCap(direct, outer, holes)) return direct;
    // Interior support vertices let both sides of a concave cusp connect to a
    // distant point, rather than clipping a tiny ear. The outer boundary itself
    // stays intact: each support point is joined back to its original edge.
    const pivot = center(outer), supports: Point[] = [], patches: Triangle[] = [];
    outer.forEach((a, index) => {
      const b = outer[(index + 1) % outer.length];
      const midpointX = (a.x + b.x) / 2, midpointY = (a.y + b.y) / 2;
      const support = floatPoint(midpointX + (pivot.x - midpointX) * 0.01,
        midpointY + (pivot.y - midpointY) * 0.01);
      supports.push(a, support);
      patches.push([a, b, support]);
    });
    const ring = ringCandidate(holes[0], supports);
    if (ring) {
      const candidate = [...ring, ...patches];
      if (preservesCap(candidate, outer, holes)) return candidate;
    }
  }
  throw new Error('The artwork has no safe boundary-preserving cap triangulation.');
}
function area(points: Outline) { return points.reduce((sum, a, i) => { const b = points[(i + 1) % points.length]; return sum + a.x * b.y - b.x * a.y; }, 0) / 2; }
function inside(point: Point, polygon: Outline) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
/** Layered stamp body, built from the already validated 2D boolean region.
 * No cap-hole filling, 3D snapping, resampling or changes to the SVG contract.
 * The caller must validate exactly the final triangles and require one shell.
 */
export function createPlanarStampBody(outlines: readonly Outline[], width: number, depth: number,
  baseThickness: number, imprintDepth: number, mode: StampImprintMode): THREE.BufferGeometry {
  const loops = outlines.map(outline => {
    const points = outline.map(p => new THREE.Vector2(Math.fround(p.x), Math.fround(p.y)));
    // Only identical consecutive Float32 vertices can disappear on STL conversion.
    const unique = points.filter((p, i) => !p.equals(points[(i + points.length - 1) % points.length]));
    if (unique.length < 3) throw new Error('The artwork collapses at STL precision.');
    if (area(unique) < 0) unique.reverse();
    return unique;
  });
  const depths = loops.map((loop, index) => loops.reduce((sum, candidate, other) => sum + (index !== other && inside(loop[0], candidate) ? 1 : 0), 0));
  const rectangle = [new THREE.Vector2(-width / 2, -depth / 2), new THREE.Vector2(width / 2, -depth / 2),
    new THREE.Vector2(width / 2, depth / 2), new THREE.Vector2(-width / 2, depth / 2)];
  const positions: number[] = [];
  function triangle(a: Point, b: Point, c: Point, height: number, upward: boolean) {
    const ordered = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0) === upward ? [a, b, c] : [a, c, b];
    for (const p of ordered) positions.push(p.x, height, -p.y);
  }
  function cap(outer: THREE.Vector2[], holes: THREE.Vector2[][], height: number, upward = true) {
    for (const [a, b, c] of capTriangles(outer, holes)) triangle(a, b, c, height, upward);
  }
  function walls(loop: Outline, bottom: number, top: number, reverse = false) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const points = [[a.x, bottom, -a.y], [b.x, bottom, -b.y], [b.x, top, -b.y], [a.x, top, -a.y]];
      for (const indices of reverse ? [[0, 2, 1], [0, 3, 2]] : [[0, 1, 2], [0, 2, 3]]) for (const index of indices) positions.push(...points[index]);
    }
  }
  cap(rectangle, [], 0, false); walls(rectangle, 0, baseThickness);
  cap(rectangle, loops.filter((_, i) => depths[i] === 0), baseThickness);
  const imprintPlane = mode === 'raised' ? baseThickness + imprintDepth : baseThickness - imprintDepth;
  loops.forEach((loop, index) => {
    const children = loops.filter((candidate, child) => depths[child] === depths[index] + 1 && inside(candidate[0], loop));
    cap(loop, children, depths[index] % 2 === 0 ? imprintPlane : baseThickness);
    walls(loop, Math.min(baseThickness, imprintPlane), Math.max(baseThickness, imprintPlane),
      (depths[index] % 2 !== 0) !== (mode === 'recessed'));
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
