import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractClosedContours } from '../contourExtraction';
import { offsetPath } from '../pathOperations';
import rasterCircle from './fixtures/raster-circle.ccd.json';
import { installSvgLoaderDomParserAdapter } from './svgDomTestSupport';

let restoreDomParser: (() => void) | undefined;
beforeAll(() => { restoreDomParser = installSvgLoaderDomParserAdapter(); });
afterAll(() => { restoreDomParser?.(); });
import { createTaperedWallGeometry } from '../cutterGeometry';
import { CutterGenerationError } from '../generationValidation';
import {
  getTriangleWallThicknesses,
  measureWallThicknessRange
} from '../wallThicknessHeatmap';
import {
  concavePoints,
  duplicatePoints,
  squarePoints,
  starPoints,
  tinyDetailsSvg
} from './fixtures';

const dumbbellPoints = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4.5 },
  { x: 20, y: 4.5 },
  { x: 20, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 10 },
  { x: 20, y: 10 },
  { x: 20, y: 5.5 },
  { x: 10, y: 5.5 },
  { x: 10, y: 10 },
  { x: 0, y: 10 }
] as const;

const baseOptions = Object.freeze({
  wallThickness: 1,
  height: 12,
  taperAngle: 0,
  scale: 1
});

function triangleAreaSquared(
  geometry: THREE.BufferGeometry,
  triangleIndex: number
): number {
  const positions = geometry.getAttribute('position');
  const indices = geometry.getIndex();
  if (!indices) throw new Error('Expected indexed geometry');

  const first = new THREE.Vector3().fromBufferAttribute(
    positions as THREE.BufferAttribute,
    indices.getX(triangleIndex * 3)
  );
  const second = new THREE.Vector3().fromBufferAttribute(
    positions as THREE.BufferAttribute,
    indices.getX(triangleIndex * 3 + 1)
  );
  const third = new THREE.Vector3().fromBufferAttribute(
    positions as THREE.BufferAttribute,
    indices.getX(triangleIndex * 3 + 2)
  );

  return new THREE.Vector3()
    .crossVectors(
      new THREE.Vector3().subVectors(second, first),
      new THREE.Vector3().subVectors(third, first)
    )
    .lengthSq() / 4;
}

function expectValidClosedGeometry(geometry: THREE.BufferGeometry): void {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const indices = geometry.getIndex();

  expect(positions.count).toBeGreaterThan(0);
  expect(indices).not.toBeNull();
  expect(indices?.count ?? 0).toBeGreaterThan(0);
  expect((indices?.count ?? 0) % 3).toBe(0);
  expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
  expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
  const wallThicknesses = getTriangleWallThicknesses(geometry);
  expect(wallThicknesses).not.toBeNull();
  expect(wallThicknesses).toHaveLength((indices?.count ?? 0) / 3);

  const edgeCounts = new Map<string, number>();
  const edgeDirections = new Map<string, number>();
  for (let item = 0; item < (indices?.count ?? 0); item += 3) {
    const triangle = [
      indices!.getX(item),
      indices!.getX(item + 1),
      indices!.getX(item + 2)
    ];
    expect(triangleAreaSquared(geometry, item / 3)).toBeGreaterThan(1e-12);

    for (let edge = 0; edge < 3; edge += 1) {
      const first = triangle[edge];
      const second = triangle[(edge + 1) % 3];
      const key = first < second ? `${first}:${second}` : `${second}:${first}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
      edgeDirections.set(key, (edgeDirections.get(key) ?? 0) + (first < second ? 1 : -1));
    }
  }

  const invalidEdges = Array.from(edgeCounts.entries()).filter(([, count]) => count !== 2);
  const invalidEdgeDetails = invalidEdges.slice(0, 20).map(([edge, count]) => {
    const [first, second] = edge.split(':').map(Number);
    return {
      edge,
      count,
      first: new THREE.Vector3().fromBufferAttribute(
        positions as THREE.BufferAttribute,
        first
      ).toArray(),
      second: new THREE.Vector3().fromBufferAttribute(
        positions as THREE.BufferAttribute,
        second
      ).toArray()
    };
  });
  expect(invalidEdges, JSON.stringify(invalidEdgeDetails)).toEqual([]);
  expect([...edgeDirections.values()].every((direction) => direction === 0)).toBe(true);
  expect(geometry.boundingBox).not.toBeNull();
  expect(geometry.boundingSphere?.radius).toBeGreaterThan(0);
}

function horizontalBoundsAt(
  geometry: THREE.BufferGeometry,
  height: number
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const positions = geometry.getAttribute('position');
  const points: THREE.Vector3[] = [];

  for (let index = 0; index < positions.count; index += 1) {
    const point = new THREE.Vector3().fromBufferAttribute(
      positions as THREE.BufferAttribute,
      index
    );
    if (Math.abs(point.y - height) < 1e-5) points.push(point);
  }

  return points.reduce(
    (box, point) => ({
      minX: Math.min(box.minX, point.x),
      maxX: Math.max(box.maxX, point.x),
      minZ: Math.min(box.minZ, point.z),
      maxZ: Math.max(box.maxZ, point.z)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY
    }
  );
}

async function expectGenerationError(
  action: () => Promise<unknown>,
  code: CutterGenerationError['code']
): Promise<CutterGenerationError> {
  let thrown: unknown;
  try {
    await action();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(CutterGenerationError);
  const generationError = thrown as CutterGenerationError;
  expect(generationError.code).toBe(code);
  return generationError;
}

describe('createTaperedWallGeometry', () => {
  it('preserves every original offset vertex and edge for the saved raster circle', async () => {
    const sourceContour = extractClosedContours(rasterCircle.document.sketch.svg)[0];
    // This scale makes Clipper retain 149 bottom inner vertices but 147 top
    // inner vertices. The exact production size/parameters are covered by the
    // generator regression; here we specifically exercise unequal boundaries.
    const contour = sourceContour.map(({ x, y }) => ({ x: x * 0.75, y: y * 0.75 }));
    const options = { ...baseOptions, taperAngle: 7 };
    const topWidth = 0.5 + Math.tan(7 * Math.PI / 180) * 12;
    const layers = await Promise.all([
      offsetPath(contour, 0.5, 'miter'), offsetPath(contour, -0.5, 'miter'),
      offsetPath(contour, topWidth, 'miter'), offsetPath(contour, -topWidth, 'miter')
    ]);
    expect(layers[1][0].length).not.toBe(layers[3][0].length);
    const geometry = await createTaperedWallGeometry(contour, options);
    expectValidClosedGeometry(geometry);
    const positions = geometry.getAttribute('position');
    expect(positions.count).toBe(layers.flat().reduce((sum, ring) => sum + ring.length, 0));
    const edges = new Set<string>();
    const index = geometry.getIndex()!;
    for (let item = 0; item < index.count; item += 3) {
      for (let edge = 0; edge < 3; edge += 1) {
        const first = index.getX(item + edge);
        const second = index.getX(item + (edge + 1) % 3);
        edges.add(first < second ? `${first}:${second}` : `${second}:${first}`);
      }
    }
    for (let layer = 0; layer < layers.length; layer += 1) {
      const height = layer < 2 ? 0 : 12;
      for (const ring of layers[layer]) {
        const vertices = ring.map((point) => {
          for (let vertex = 0; vertex < positions.count; vertex += 1) {
            if (positions.getY(vertex) === height &&
                Math.abs(positions.getX(vertex) - point.x) < 1e-5 &&
                Math.abs(positions.getZ(vertex) - point.y) < 1e-5) return vertex;
          }
          throw new Error('An original boundary vertex was lost');
        });
        for (let vertex = 0; vertex < vertices.length; vertex += 1) {
          const first = vertices[vertex];
          const second = vertices[(vertex + 1) % vertices.length];
          expect(edges.has(first < second ? `${first}:${second}` : `${second}:${first}`)).toBe(true);
        }
      }
    }
  });

  it.each(['round', 'square', 'miter'] as const)(
    'lofts unequal edge sequences with %s joins', async (joinStyle) => {
      const geometry = await createTaperedWallGeometry(concavePoints, {
        ...baseOptions, taperAngle: 7, joinStyle
      });
      expectValidClosedGeometry(geometry);
    }
  );

  it('keeps the shallow notch closed when only offset vertex counts change', async () => {
    // Match the physical scale range used when fitting the 90-unit artwork
    // to a 75 mm cutter; the outward top offset closes the shallow notch.
    const contour = extractClosedContours(tinyDetailsSvg)[0]
      .map(({ x, y }) => ({ x: x * 0.8, y: y * 0.8 }));
    const topWidth = 0.5 + Math.tan(2 * Math.PI / 180) * 12;
    const layers = await Promise.all([
      offsetPath(contour, 0.5, 'miter'), offsetPath(contour, -0.5, 'miter'),
      offsetPath(contour, topWidth, 'miter'), offsetPath(contour, -topWidth, 'miter')
    ]);
    expect(layers.map((rings) => rings.length)).toEqual([1, 1, 1, 1]);
    expect([0, 1].some((ring) => layers[ring][0].length !== layers[ring + 2][0].length)).toBe(true);
    const geometry = await createTaperedWallGeometry(contour, { ...baseOptions, taperAngle: 2 });
    try {
      expectValidClosedGeometry(geometry);
    } finally {
      geometry.dispose();
    }
  });

  it('still rejects an actual inner component split between layers', async () => {
    const error = await expectGenerationError(
      () => createTaperedWallGeometry(dumbbellPoints, {
        ...baseOptions, wallThickness: 0.4, taperAngle: 3
      }), 'OFFSET_FAILED'
    );
    expect(error.details).toMatchObject({
      context: 'inner-rings', bottomComponents: 1, topComponents: 2
    });
  });

  it('builds a closed finite square wall at the requested height', async () => {
    const geometry = await createTaperedWallGeometry(squarePoints, baseOptions);

    expectValidClosedGeometry(geometry);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(0, 5);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(12, 5);
    expect(geometry.boundingBox?.min.x).toBeCloseTo(-0.5, 3);
    expect(geometry.boundingBox?.max.x).toBeCloseTo(40.5, 3);
  });

  it('widens the top footprint according to the taper angle', async () => {
    const geometry = await createTaperedWallGeometry(squarePoints, {
      ...baseOptions,
      taperAngle: 7
    });
    const bottom = horizontalBoundsAt(geometry, 0);
    const top = horizontalBoundsAt(geometry, 12);

    expectValidClosedGeometry(geometry);
    expect(top.maxX - top.minX).toBeGreaterThan(bottom.maxX - bottom.minX);
    expect(top.maxZ - top.minZ).toBeGreaterThan(bottom.maxZ - bottom.minZ);
  });

  it('records actual local wall thickness for every triangle', async () => {
    const straight = await createTaperedWallGeometry(squarePoints, baseOptions);
    const tapered = await createTaperedWallGeometry(squarePoints, {
      ...baseOptions,
      taperAngle: 7
    });
    const straightValues = getTriangleWallThicknesses(straight);
    const taperedValues = getTriangleWallThicknesses(tapered);

    expect(straightValues).not.toBeNull();
    expect(taperedValues).not.toBeNull();
    const straightRange = measureWallThicknessRange(straightValues!);
    const taperedRange = measureWallThicknessRange(taperedValues!);

    expect(straightRange.min).toBeCloseTo(baseOptions.wallThickness, 5);
    expect(straightRange.max).toBeGreaterThan(straightRange.min);
    expect(taperedRange.max).toBeGreaterThan(straightRange.max);
  });

  it.each([
    ['concave', concavePoints],
    ['star', starPoints],
    ['duplicate-points', duplicatePoints]
  ])('builds non-degenerate geometry for %s input', async (_name, points) => {
    const geometry = await createTaperedWallGeometry(points, {
      ...baseOptions,
      taperAngle: 3
    });

    expectValidClosedGeometry(geometry);
  });

  it('supports an inward offset that splits into multiple holes', async () => {
    const geometry = await createTaperedWallGeometry(dumbbellPoints, {
      ...baseOptions,
      wallThickness: 2
    });

    expectValidClosedGeometry(geometry);
  });

  it('keeps physical wall thickness independent from contour scale', async () => {
    const normal = await createTaperedWallGeometry(squarePoints, baseOptions);
    const doubled = await createTaperedWallGeometry(squarePoints, {
      ...baseOptions,
      scale: 2
    });

    const normalWidth = normal.boundingBox!.max.x - normal.boundingBox!.min.x;
    const doubledWidth = doubled.boundingBox!.max.x - doubled.boundingBox!.min.x;
    expect(normalWidth).toBeCloseTo(41, 3);
    expect(doubledWidth).toBeCloseTo(81, 3);
  });

  it('is deterministic for identical contour and options', async () => {
    const first = await createTaperedWallGeometry(starPoints, baseOptions);
    const second = await createTaperedWallGeometry(starPoints, baseOptions);

    expect(Array.from(first.getAttribute('position').array)).toEqual(
      Array.from(second.getAttribute('position').array)
    );
    expect(Array.from(first.getIndex()!.array)).toEqual(
      Array.from(second.getIndex()!.array)
    );
  });

  it('fails safely when taper collapses the inner profile', async () => {
    const error = await expectGenerationError(
      () =>
        createTaperedWallGeometry(
          [
            { x: 0, y: 0 },
            { x: 5, y: 0 },
            { x: 5, y: 5 },
            { x: 0, y: 5 }
          ],
          { ...baseOptions, taperAngle: 30 }
        ),
      'OFFSET_FAILED'
    );

    expect(error.details).toMatchObject({ layer: 'topInner' });
  });

  it.each([
    [{ ...baseOptions, wallThickness: 0 }, 'wallThickness'],
    [{ ...baseOptions, height: Number.NaN }, 'height'],
    [{ ...baseOptions, scale: -1 }, 'scale'],
    [{ ...baseOptions, taperAngle: 90 }, 'taperAngle'],
    [{ ...baseOptions, baseHeight: -1 }, 'baseHeight']
  ])('rejects invalid geometry option %#', async (options, field) => {
    const error = await expectGenerationError(
      () => createTaperedWallGeometry(squarePoints, options),
      'INVALID_GEOMETRY'
    );

    expect(error.details).toMatchObject({ field });
  });
});
