import * as THREE from 'three';
import type { Point2D } from '../types/CookieCutter';
import {
  normalizeContourPoints,
  signedArea,
  type NormalizedContour
} from './contourExtraction';
import { CutterGenerationError } from './generationValidation';
import { offsetPath, type JoinStyle } from './pathOperations';

export interface CutterWallGeometryOptions {
  readonly wallThickness: number;
  readonly height: number;
  readonly taperAngle: number;
  readonly scale: number;
  readonly baseHeight?: number;
  readonly joinStyle?: JoinStyle;
  readonly capBottom?: boolean;
  readonly capTop?: boolean;
}

interface PolygonRegion {
  readonly outer: NormalizedContour;
  readonly holes: ReadonlyArray<NormalizedContour>;
}

interface RegionPair {
  readonly bottom: PolygonRegion;
  readonly top: PolygonRegion;
}

interface SampledLoopPair {
  readonly bottom: NormalizedContour;
  readonly top: NormalizedContour;
}

interface IndexedLoopPair {
  readonly bottomPoints: NormalizedContour;
  readonly topPoints: NormalizedContour;
  readonly bottomIndices: readonly number[];
  readonly topIndices: readonly number[];
}

const TRIANGLE_EPSILON_SQUARED = 1e-16;

function generationError(
  code: 'INVALID_GEOMETRY' | 'OFFSET_FAILED',
  message: string,
  details: Readonly<Record<string, unknown>>
): CutterGenerationError {
  return new CutterGenerationError(code, message, details);
}

function assertFinitePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw generationError(
      'INVALID_GEOMETRY',
      `${field} must be a positive finite number.`,
      { field, value }
    );
  }
}

function scaleContour(
  contour: ReadonlyArray<Readonly<Point2D>>,
  scale: number
): NormalizedContour {
  const scaled = contour.map(({ x, y }) => ({ x: x * scale, y: y * scale }));
  const normalized = normalizeContourPoints(scaled);

  if (!normalized) {
    throw generationError(
      'INVALID_GEOMETRY',
      'The scaled contour is degenerate.',
      { field: 'contour', scale }
    );
  }

  return normalized;
}

function pointInPolygon(point: Readonly<Point2D>, polygon: NormalizedContour): boolean {
  let inside = false;

  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const first = polygon[current];
    const second = polygon[previous];
    const crossesRay =
      first.y > point.y !== second.y > point.y &&
      point.x <
        ((second.x - first.x) * (point.y - first.y)) /
          (second.y - first.y) +
          first.x;

    if (crossesRay) inside = !inside;
  }

  return inside;
}

function polygonCentroid(contour: NormalizedContour): Readonly<Point2D> {
  const area = signedArea(contour);
  let x = 0;
  let y = 0;

  if (Math.abs(area) > 1e-12) {
    for (let index = 0; index < contour.length; index += 1) {
      const current = contour[index];
      const next = contour[(index + 1) % contour.length];
      const cross = current.x * next.y - next.x * current.y;
      x += (current.x + next.x) * cross;
      y += (current.y + next.y) * cross;
    }

    const divisor = 6 * area;
    return Object.freeze({ x: x / divisor, y: y / divisor });
  }

  for (const point of contour) {
    x += point.x;
    y += point.y;
  }

  return Object.freeze({ x: x / contour.length, y: y / contour.length });
}

function classifyRegions(
  outerPaths: ReadonlyArray<NormalizedContour>,
  innerPaths: ReadonlyArray<NormalizedContour>,
  layer: 'bottom' | 'top'
): ReadonlyArray<PolygonRegion> {
  const regions = outerPaths.map((outer) => ({ outer, holes: [] as NormalizedContour[] }));

  for (const inner of innerPaths) {
    const probe = inner[0];
    const candidates = regions
      .map((region, index) => ({ index, area: Math.abs(signedArea(region.outer)) }))
      .filter(({ index }) => pointInPolygon(probe, regions[index].outer))
      .sort((first, second) => first.area - second.area);

    const containing = candidates[0];
    if (!containing) {
      throw generationError(
        'OFFSET_FAILED',
        'An inner offset is not contained by any outer offset.',
        { layer, reason: 'uncontained-inner-ring' }
      );
    }

    regions[containing.index].holes.push(inner);
  }

  return Object.freeze(
    regions.map(({ outer, holes }) =>
      Object.freeze({ outer, holes: Object.freeze(holes) })
    )
  );
}

function distanceSquared(first: Readonly<Point2D>, second: Readonly<Point2D>): number {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return dx * dx + dy * dy;
}

function matchContours(
  bottom: ReadonlyArray<NormalizedContour>,
  top: ReadonlyArray<NormalizedContour>,
  context: string
): ReadonlyArray<readonly [NormalizedContour, NormalizedContour]> {
  if (bottom.length !== top.length) {
    throw generationError(
      'OFFSET_FAILED',
      'The polygon offset changes topology between height layers.',
      { context, bottomComponents: bottom.length, topComponents: top.length }
    );
  }

  const available = top.map((contour, index) => ({
    contour,
    center: polygonCentroid(contour),
    index
  }));
  const pairs: Array<readonly [NormalizedContour, NormalizedContour]> = [];

  for (const bottomContour of bottom) {
    const bottomCenter = polygonCentroid(bottomContour);
    let bestPosition = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let position = 0; position < available.length; position += 1) {
      const candidateDistance = distanceSquared(bottomCenter, available[position].center);
      if (candidateDistance < bestDistance) {
        bestDistance = candidateDistance;
        bestPosition = position;
      }
    }

    const [matched] = available.splice(bestPosition, 1);
    pairs.push(Object.freeze([bottomContour, matched.contour] as const));
  }

  return Object.freeze(pairs);
}

function matchRegions(
  bottom: ReadonlyArray<PolygonRegion>,
  top: ReadonlyArray<PolygonRegion>
): ReadonlyArray<RegionPair> {
  const outerPairs = matchContours(
    bottom.map(({ outer }) => outer),
    top.map(({ outer }) => outer),
    'outer-rings'
  );

  return Object.freeze(
    outerPairs.map(([bottomOuter, topOuter]) => {
      const bottomRegion = bottom.find(({ outer }) => outer === bottomOuter);
      const topRegion = top.find(({ outer }) => outer === topOuter);

      if (!bottomRegion || !topRegion) {
        throw generationError(
          'OFFSET_FAILED',
          'The offset regions could not be paired.',
          { context: 'regions' }
        );
      }

      return Object.freeze({ bottom: bottomRegion, top: topRegion });
    })
  );
}

function rotateToStableStart(contour: NormalizedContour): NormalizedContour {
  const oriented = signedArea(contour) >= 0 ? [...contour] : [...contour].reverse();
  let firstIndex = 0;

  for (let index = 1; index < oriented.length; index += 1) {
    const candidate = oriented[index];
    const first = oriented[firstIndex];
    if (candidate.x < first.x || (candidate.x === first.x && candidate.y < first.y)) {
      firstIndex = index;
    }
  }

  const rotated = [
    ...oriented.slice(firstIndex),
    ...oriented.slice(0, firstIndex)
  ].map(({ x, y }) => Object.freeze({ x, y }));

  return Object.freeze(rotated);
}

function sampleLoopPair(
  bottom: NormalizedContour,
  top: NormalizedContour
): SampledLoopPair {
  if (bottom.length !== top.length) {
    throw generationError(
      'OFFSET_FAILED',
      'The polygon offset changes vertex topology between height layers.',
      {
        context: 'loop-vertices',
        bottomVertices: bottom.length,
        topVertices: top.length
      }
    );
  }

  return Object.freeze({
    bottom: rotateToStableStart(bottom),
    top: rotateToStableStart(top)
  });
}

function addLoopPair(
  positions: THREE.Vector3[],
  pair: SampledLoopPair,
  bottomHeight: number,
  topHeight: number
): IndexedLoopPair {
  const bottomIndices = pair.bottom.map((point) => {
    positions.push(new THREE.Vector3(point.x, bottomHeight, point.y));
    return positions.length - 1;
  });
  const topIndices = pair.top.map((point) => {
    positions.push(new THREE.Vector3(point.x, topHeight, point.y));
    return positions.length - 1;
  });

  return Object.freeze({
    bottomPoints: pair.bottom,
    topPoints: pair.top,
    bottomIndices: Object.freeze(bottomIndices),
    topIndices: Object.freeze(topIndices)
  });
}

function addOrientedTriangle(
  indices: number[],
  positions: readonly THREE.Vector3[],
  first: number,
  second: number,
  third: number,
  desiredNormal: THREE.Vector3
): void {
  const edgeA = new THREE.Vector3().subVectors(positions[second], positions[first]);
  const edgeB = new THREE.Vector3().subVectors(positions[third], positions[first]);
  const normal = new THREE.Vector3().crossVectors(edgeA, edgeB);

  if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() <= TRIANGLE_EPSILON_SQUARED) {
    throw generationError(
      'INVALID_GEOMETRY',
      'The wall triangulation produced a degenerate triangle.',
      { triangle: indices.length / 3 }
    );
  }

  if (normal.dot(desiredNormal) < 0) {
    indices.push(first, third, second);
  } else {
    indices.push(first, second, third);
  }
}

function addCap(
  indices: number[],
  positions: readonly THREE.Vector3[],
  outerPoints: NormalizedContour,
  holePoints: ReadonlyArray<NormalizedContour>,
  outerIndices: readonly number[],
  holeIndices: ReadonlyArray<readonly number[]>,
  top: boolean
): void {
  const outer = outerPoints.map(({ x, y }) => new THREE.Vector2(x, y));
  const holes = holePoints.map((hole) =>
    hole.map(({ x, y }) => new THREE.Vector2(x, y))
  );
  const flattenedIndices = [...outerIndices, ...holeIndices.flatMap((loop) => [...loop])];
  const desiredNormal = new THREE.Vector3(0, top ? 1 : -1, 0);
  const faces = THREE.ShapeUtils.triangulateShape(outer, holes);

  if (faces.length === 0) {
    throw generationError(
      'INVALID_GEOMETRY',
      'The wall cap could not be triangulated.',
      { surface: top ? 'top' : 'bottom' }
    );
  }

  for (const [first, second, third] of faces) {
    addOrientedTriangle(
      indices,
      positions,
      flattenedIndices[first],
      flattenedIndices[second],
      flattenedIndices[third],
      desiredNormal
    );
  }
}

function addLoopSides(
  indices: number[],
  positions: readonly THREE.Vector3[],
  loop: IndexedLoopPair,
  center: Readonly<Point2D>,
  inner: boolean
): void {
  for (let index = 0; index < loop.bottomIndices.length; index += 1) {
    const next = (index + 1) % loop.bottomIndices.length;
    const bottomCurrent = loop.bottomIndices[index];
    const bottomNext = loop.bottomIndices[next];
    const topCurrent = loop.topIndices[index];
    const topNext = loop.topIndices[next];
    const midpoint = positions[bottomCurrent].clone().add(positions[bottomNext]).multiplyScalar(0.5);
    const desiredNormal = inner
      ? new THREE.Vector3(center.x - midpoint.x, 0, center.y - midpoint.z)
      : new THREE.Vector3(midpoint.x - center.x, 0, midpoint.z - center.y);

    addOrientedTriangle(
      indices,
      positions,
      bottomCurrent,
      bottomNext,
      topNext,
      desiredNormal
    );
    addOrientedTriangle(
      indices,
      positions,
      bottomCurrent,
      topNext,
      topCurrent,
      desiredNormal
    );
  }
}

function addRegionPair(
  positions: THREE.Vector3[],
  indices: number[],
  pair: RegionPair,
  bottomHeight: number,
  topHeight: number,
  capBottom: boolean,
  capTop: boolean
): void {
  const outerLoop = addLoopPair(
    positions,
    sampleLoopPair(pair.bottom.outer, pair.top.outer),
    bottomHeight,
    topHeight
  );
  const holePairs = matchContours(
    pair.bottom.holes,
    pair.top.holes,
    'inner-rings'
  );
  const holeLoops = holePairs.map(([bottom, top]) =>
    addLoopPair(positions, sampleLoopPair(bottom, top), bottomHeight, topHeight)
  );

  if (capBottom) {
    addCap(
      indices,
      positions,
      outerLoop.bottomPoints,
      holeLoops.map(({ bottomPoints }) => bottomPoints),
      outerLoop.bottomIndices,
      holeLoops.map(({ bottomIndices }) => bottomIndices),
      false
    );
  }
  if (capTop) {
    addCap(
      indices,
      positions,
      outerLoop.topPoints,
      holeLoops.map(({ topPoints }) => topPoints),
      outerLoop.topIndices,
      holeLoops.map(({ topIndices }) => topIndices),
      true
    );
  }

  addLoopSides(
    indices,
    positions,
    outerLoop,
    polygonCentroid(pair.bottom.outer),
    false
  );

  for (let index = 0; index < holeLoops.length; index += 1) {
    addLoopSides(
      indices,
      positions,
      holeLoops[index],
      polygonCentroid(holePairs[index][0]),
      true
    );
  }
}

function validateGeometry(geometry: THREE.BufferGeometry): void {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();

  if (!positions || positions.count < 3 || !index || index.count < 3) {
    throw generationError(
      'INVALID_GEOMETRY',
      'The generated wall geometry is empty.',
      { field: 'geometry' }
    );
  }

  for (let item = 0; item < positions.array.length; item += 1) {
    if (!Number.isFinite(positions.array[item])) {
      throw generationError(
        'INVALID_GEOMETRY',
        'The generated wall contains a non-finite coordinate.',
        { field: 'position', index: item }
      );
    }
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const box = geometry.boundingBox;
  const sphere = geometry.boundingSphere;
  if (
    !box ||
    !sphere ||
    !Number.isFinite(box.min.x + box.min.y + box.min.z + box.max.x + box.max.y + box.max.z) ||
    !Number.isFinite(sphere.radius)
  ) {
    throw generationError(
      'INVALID_GEOMETRY',
      'The generated wall has invalid bounds.',
      { field: 'bounds' }
    );
  }
}

/**
 * Build a closed tapered cutter wall from robust Clipper offsets.
 */
export async function createTaperedWallGeometry(
  contour: ReadonlyArray<Readonly<Point2D>>,
  options: CutterWallGeometryOptions
): Promise<THREE.BufferGeometry> {
  assertFinitePositive(options.wallThickness, 'wallThickness');
  assertFinitePositive(options.height, 'height');
  assertFinitePositive(options.scale, 'scale');

  if (!Number.isFinite(options.taperAngle) || options.taperAngle < 0 || options.taperAngle >= 90) {
    throw generationError(
      'INVALID_GEOMETRY',
      'taperAngle must be finite and between 0 and 90 degrees.',
      { field: 'taperAngle', value: options.taperAngle }
    );
  }

  const baseHeight = options.baseHeight ?? 0;
  if (!Number.isFinite(baseHeight) || baseHeight < 0) {
    throw generationError(
      'INVALID_GEOMETRY',
      'baseHeight must be a non-negative finite number.',
      { field: 'baseHeight', value: baseHeight }
    );
  }

  const scaledContour = scaleContour(contour, options.scale);
  const halfThickness = options.wallThickness / 2;
  const taperOffset = Math.tan((options.taperAngle * Math.PI) / 180) * options.height;
  const topHalfThickness = halfThickness + taperOffset;
  const joinStyle = options.joinStyle ?? 'miter';

  if (!Number.isFinite(topHalfThickness)) {
    throw generationError(
      'INVALID_GEOMETRY',
      'The taper produces a non-finite wall width.',
      { field: 'taperAngle', value: options.taperAngle }
    );
  }

  const [bottomOuter, bottomInner, topOuter, topInner] = await Promise.all([
    offsetPath(scaledContour, halfThickness, joinStyle),
    offsetPath(scaledContour, -halfThickness, joinStyle),
    offsetPath(scaledContour, topHalfThickness, joinStyle),
    offsetPath(scaledContour, -topHalfThickness, joinStyle)
  ]);

  const layers = [
    ['bottomOuter', bottomOuter],
    ['bottomInner', bottomInner],
    ['topOuter', topOuter],
    ['topInner', topInner]
  ] as const;
  for (const [layer, paths] of layers) {
    if (paths.length === 0) {
      throw generationError(
        'OFFSET_FAILED',
        'The contour is too small for the requested wall and taper.',
        { layer, wallThickness: options.wallThickness, taperAngle: options.taperAngle }
      );
    }
  }

  const bottomRegions = classifyRegions(bottomOuter, bottomInner, 'bottom');
  const topRegions = classifyRegions(topOuter, topInner, 'top');
  const regionPairs = matchRegions(bottomRegions, topRegions);
  const capBottom = options.capBottom ?? true;
  const capTop = options.capTop ?? true;
  const positions: THREE.Vector3[] = [];
  const indices: number[] = [];

  for (const pair of regionPairs) {
    addRegionPair(
      positions,
      indices,
      pair,
      baseHeight,
      baseHeight + options.height,
      capBottom,
      capTop
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions.flatMap(({ x, y, z }) => [x, y, z]), 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  validateGeometry(geometry);
  return geometry;
}
