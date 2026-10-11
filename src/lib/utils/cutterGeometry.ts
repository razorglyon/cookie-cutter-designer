import * as THREE from 'three';
import type { Bridge } from '../domain/designDocument';
import { createConnectedRegions } from '../geometry/connectors';
import type { Point2D } from '../types/CookieCutter';
import {
  normalizeContourPoints,
  signedArea,
  type NormalizedContour
} from './contourExtraction';
import { CutterGenerationError } from './generationValidation';
import { offsetPath, type JoinStyle } from './pathOperations';
import { setTriangleWallThicknesses } from './wallThicknessHeatmap';

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

interface PreparedLoopPair {
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
  context: string,
  matchByArea = false
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
    const bottomArea = Math.abs(signedArea(bottomContour));
    if (matchByArea && (!Number.isFinite(bottomArea) || bottomArea <= 1e-12)) {
      throw generationError('OFFSET_FAILED', 'A bridged hole has no measurable area.', { context });
    }
    let bestPosition = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let position = 0; position < available.length; position += 1) {
      const candidateDistance = distanceSquared(bottomCenter, available[position].center);
      // In a bridged wall, concentric hole centroids can coincide while one
      // hole wraps the bridge and the other is the island's empty centre.
      // Match their areas first. Keep legacy centroid-only pairing unchanged.
      const candidateArea = matchByArea ? Math.abs(signedArea(available[position].contour)) : 0;
      if (matchByArea && (!Number.isFinite(candidateArea) || candidateArea <= 1e-12)) {
        throw generationError('OFFSET_FAILED', 'A bridged hole has no measurable area.', { context });
      }
      const score = matchByArea
        ? Math.abs(Math.log(candidateArea / bottomArea))
        : candidateDistance;
      if (score < bestScore || (score === bestScore && candidateDistance < bestDistance)) {
        bestScore = score;
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

function prepareLoopPair(
  bottom: NormalizedContour,
  top: NormalizedContour
): PreparedLoopPair {
  return Object.freeze({
    bottom: rotateToStableStart(bottom),
    top: rotateToStableStart(top)
  });
}

function addLoopPair(
  positions: THREE.Vector3[],
  pair: PreparedLoopPair,
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
  triangleThicknesses: number[],
  positions: readonly THREE.Vector3[],
  first: number,
  second: number,
  third: number,
  desiredNormal: THREE.Vector3,
  wallThickness: number
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
  triangleThicknesses.push(wallThickness);
}

function distanceToSegment(
  point: Readonly<Point2D>,
  start: Readonly<Point2D>,
  end: Readonly<Point2D>
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return Math.sqrt(distanceSquared(point, start));

  const projection = THREE.MathUtils.clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    0,
    1
  );
  const closest = {
    x: start.x + projection * dx,
    y: start.y + projection * dy
  };
  return Math.sqrt(distanceSquared(point, closest));
}

function distanceToContours(
  point: Readonly<Point2D>,
  contours: ReadonlyArray<NormalizedContour>
): number {
  let distance = Number.POSITIVE_INFINITY;

  for (const contour of contours) {
    for (let index = 0; index < contour.length; index += 1) {
      distance = Math.min(
        distance,
        distanceToSegment(point, contour[index], contour[(index + 1) % contour.length])
      );
    }
  }

  if (!Number.isFinite(distance) || distance <= 0) {
    throw generationError(
      'INVALID_GEOMETRY',
      'The wall thickness could not be measured from the generated contours.',
      { field: 'wallThickness', value: distance }
    );
  }
  return distance;
}

function edgeMidpoint(
  points: NormalizedContour,
  index: number
): Readonly<Point2D> {
  const current = points[index];
  const next = points[(index + 1) % points.length];
  return Object.freeze({
    x: (current.x + next.x) / 2,
    y: (current.y + next.y) / 2
  });
}

function setLoopThicknesses(
  thicknessByIndex: Map<number, number>,
  points: NormalizedContour,
  indices: readonly number[],
  oppositeContours: ReadonlyArray<NormalizedContour>
): void {
  for (let index = 0; index < indices.length; index += 1) {
    thicknessByIndex.set(
      indices[index],
      distanceToContours(points[index], oppositeContours)
    );
  }
}

/**
 * Earcut can emit a numerically flat cap face between collinear boundary samples.
 * Split its neighbour across the retained middle point instead: preserve every
 * boundary index/edge, rather than drop a face and leave an open mesh.
 */
function repairCollinearCapFaces(
  points: readonly THREE.Vector2[],
  faces: number[][]
): number[][] {
  const areaEpsilon = Math.sqrt(TRIANGLE_EPSILON_SQUARED);
  const area2 = (face: readonly number[]): number => {
    const [a, b, c] = face.map(index => points[index]);
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  };
  for (let index = 0; index < faces.length; index++) {
    const face = faces[index];
    const oldArea = area2(face);
    if (!Number.isFinite(oldArea) || Math.abs(oldArea) > areaEpsilon) continue;
    const edges = [
      [face[0], face[1], face[2]],
      [face[1], face[2], face[0]],
      [face[2], face[0], face[1]]
    ];
    edges.sort((first, second) => points[second[0]].distanceToSquared(points[second[1]]) - points[first[0]].distanceToSquared(points[first[1]]));
    const [start, end, middle] = edges[0];
    const dx = points[end].x - points[start].x, dy = points[end].y - points[start].y;
    const lengthSquared = dx * dx + dy * dy;
    const projection = ((points[middle].x - points[start].x) * dx + (points[middle].y - points[start].y) * dy) / lengthSquared;
    if (!Number.isFinite(projection) || projection <= 0 || projection >= 1) continue;
    const neighbours = faces.map((candidate, position) => ({ candidate, position })).filter(({ candidate, position }) => position !== index && candidate.includes(start) && candidate.includes(end));
    if (neighbours.length !== 1) continue;
    const neighbour = neighbours[0];
    const far = neighbour.candidate.find(vertex => vertex !== start && vertex !== end);
    if (far === undefined || far === middle || faces.some(candidate => candidate.includes(middle) && candidate.includes(far))) continue;
    const first = [start, middle, far], second = [middle, end, far];
    const firstArea = area2(first), secondArea = area2(second);
    const neighbourArea = area2(neighbour.candidate);
    if (!Number.isFinite(firstArea) || !Number.isFinite(secondArea) || !Number.isFinite(neighbourArea)
      || Math.abs(firstArea) <= areaEpsilon || Math.abs(secondArea) <= areaEpsilon
      || firstArea * secondArea <= 0
      || Math.abs(Math.abs(firstArea) + Math.abs(secondArea) - Math.abs(neighbourArea) - Math.abs(oldArea)) > areaEpsilon * 2) continue;
    faces[index] = first;
    faces[neighbour.position] = second;
  }
  // Unrepairable faces still reach addOrientedTriangle's existing strict guard.
  return faces;
}

function addCap(
  indices: number[],
  triangleThicknesses: number[],
  positions: readonly THREE.Vector3[],
  outerPoints: NormalizedContour,
  holePoints: ReadonlyArray<NormalizedContour>,
  outerIndices: readonly number[],
  holeIndices: ReadonlyArray<readonly number[]>,
  thicknessByIndex: ReadonlyMap<number, number>,
  top: boolean
): void {
  const outer = outerPoints.map(({ x, y }) => new THREE.Vector2(x, y));
  const holes = holePoints.map((hole) =>
    hole.map(({ x, y }) => new THREE.Vector2(x, y))
  );
  const flattenedIndices = [...outerIndices, ...holeIndices.flatMap((loop) => [...loop])];
  const desiredNormal = new THREE.Vector3(0, top ? 1 : -1, 0);
  const faces = repairCollinearCapFaces([...outer, ...holes.flat()], THREE.ShapeUtils.triangulateShape(outer, holes));

  if (faces.length === 0) {
    throw generationError(
      'INVALID_GEOMETRY',
      'The wall cap could not be triangulated.',
      { surface: top ? 'top' : 'bottom' }
    );
  }

  for (const [first, second, third] of faces) {
    const triangle = [
      flattenedIndices[first],
      flattenedIndices[second],
      flattenedIndices[third]
    ] as const;
    const wallThickness = triangle.reduce((total, vertexIndex) => {
      const value = thicknessByIndex.get(vertexIndex);
      if (value === undefined) {
        throw generationError(
          'INVALID_GEOMETRY',
          'The wall cap is missing thickness metadata.',
          { surface: top ? 'top' : 'bottom', vertexIndex }
        );
      }
      return total + value;
    }, 0) / triangle.length;

    addOrientedTriangle(
      indices,
      triangleThicknesses,
      positions,
      triangle[0],
      triangle[1],
      triangle[2],
      desiredNormal,
      wallThickness
    );
  }
}

/** Parameter values at original edge ends, including the closing edge at 1. */
function loopEdgeProgress(points: NormalizedContour): readonly number[] {
  const progress = [0];
  for (let index = 0; index < points.length; index += 1) {
    progress.push(progress[index] + Math.sqrt(distanceSquared(
      points[index], points[(index + 1) % points.length]
    )));
  }
  const perimeter = progress[points.length];
  return progress.map((value) => value / perimeter);
}

function addLoopSides(
  indices: number[],
  triangleThicknesses: number[],
  positions: readonly THREE.Vector3[],
  loop: IndexedLoopPair,
  inner: boolean,
  oppositeBottom: ReadonlyArray<NormalizedContour>,
  oppositeTop: ReadonlyArray<NormalizedContour>,
  thicknessOverride?: Readonly<{ bottom: number; top: number }>
): void {
  // Preserve the historical diagonals, triangle order and thickness metadata
  // whenever offsets retain the same number of vertices.
  if (loop.bottomIndices.length === loop.topIndices.length) {
    for (let index = 0; index < loop.bottomIndices.length; index += 1) {
      const next = (index + 1) % loop.bottomIndices.length;
      const bottomCurrent = loop.bottomIndices[index];
      const bottomNext = loop.bottomIndices[next];
      const topCurrent = loop.topIndices[index];
      const topNext = loop.topIndices[next];
      const edgeX = positions[bottomNext].x - positions[bottomCurrent].x;
      const edgeZ = positions[bottomNext].z - positions[bottomCurrent].z;
      const desiredNormal = inner
        ? new THREE.Vector3(-edgeZ, 0, edgeX)
        : new THREE.Vector3(edgeZ, 0, -edgeX);
      const bottomThickness = thicknessOverride?.bottom ?? distanceToContours(
        edgeMidpoint(loop.bottomPoints, index),
        oppositeBottom
      );
      const topThickness = thicknessOverride?.top ?? distanceToContours(
        edgeMidpoint(loop.topPoints, index),
        oppositeTop
      );

      addOrientedTriangle(
        indices,
        triangleThicknesses,
        positions,
        bottomCurrent,
        bottomNext,
        topNext,
        desiredNormal,
        (bottomThickness * 2 + topThickness) / 3
      );
      addOrientedTriangle(
        indices,
        triangleThicknesses,
        positions,
        bottomCurrent,
        topNext,
        topCurrent,
        desiredNormal,
        (bottomThickness + topThickness * 2) / 3
      );
    }
    return;
  }

  // Merge the cyclic edge sequences by normalized perimeter progress.
  // No resampling: every original vertex and boundary edge is retained,
  // so caps and adjacent height segments share their exact boundaries.
  const bottomProgress = loopEdgeProgress(loop.bottomPoints);
  const topProgress = loopEdgeProgress(loop.topPoints);
  let bottom = 0;
  let top = 0;
  while (bottom < loop.bottomIndices.length || top < loop.topIndices.length) {
    const advanceBottom = bottom < loop.bottomIndices.length &&
      (top === loop.topIndices.length || bottomProgress[bottom + 1] <= topProgress[top + 1]);
    const points = advanceBottom ? loop.bottomPoints : loop.topPoints;
    const edge = advanceBottom ? bottom : top;
    const current = points[edge % points.length];
    const next = points[(edge + 1) % points.length];
    const edgeX = next.x - current.x;
    const edgeZ = next.y - current.y;
    const desiredNormal = inner
      ? new THREE.Vector3(-edgeZ, 0, edgeX)
      : new THREE.Vector3(edgeZ, 0, -edgeX);
    const bottomCurrent = loop.bottomIndices[bottom % loop.bottomIndices.length];
    const topCurrent = loop.topIndices[top % loop.topIndices.length];
    const boundaryThickness = thicknessOverride?.[advanceBottom ? 'bottom' : 'top'] ?? distanceToContours(
      edgeMidpoint(points, edge % points.length),
      advanceBottom ? oppositeBottom : oppositeTop
    );
    const oppositeThickness = thicknessOverride?.[advanceBottom ? 'top' : 'bottom'] ?? distanceToContours(
      advanceBottom
        ? loop.topPoints[top % loop.topPoints.length]
        : loop.bottomPoints[bottom % loop.bottomPoints.length],
      advanceBottom ? oppositeTop : oppositeBottom
    );
    if (advanceBottom) {
      addOrientedTriangle(
        indices, triangleThicknesses, positions,
        bottomCurrent, loop.bottomIndices[(bottom + 1) % loop.bottomIndices.length], topCurrent,
        desiredNormal, (boundaryThickness * 2 + oppositeThickness) / 3
      );
      bottom += 1;
    } else {
      addOrientedTriangle(
        indices, triangleThicknesses, positions,
        bottomCurrent, loop.topIndices[(top + 1) % loop.topIndices.length], topCurrent,
        desiredNormal, (boundaryThickness * 2 + oppositeThickness) / 3
      );
      top += 1;
    }
  }
}

function addRegionPair(
  positions: THREE.Vector3[],
  indices: number[],
  triangleThicknesses: number[],
  pair: RegionPair,
  bottomHeight: number,
  topHeight: number,
  capBottom: boolean,
  capTop: boolean,
  thicknessOverride?: Readonly<{ bottom: number; top: number }>
): void {
  const outerLoop = addLoopPair(
    positions,
    prepareLoopPair(pair.bottom.outer, pair.top.outer),
    bottomHeight,
    topHeight
  );
  const holePairs = matchContours(
    pair.bottom.holes,
    pair.top.holes,
    'inner-rings',
    thicknessOverride !== undefined
  );
  const holeLoops = holePairs.map(([bottom, top]) =>
    addLoopPair(positions, prepareLoopPair(bottom, top), bottomHeight, topHeight)
  );
  const bottomThicknessByIndex = new Map<number, number>();
  const topThicknessByIndex = new Map<number, number>();
  const bottomHoles = holeLoops.map(({ bottomPoints }) => bottomPoints);
  const topHoles = holeLoops.map(({ topPoints }) => topPoints);

  if (thicknessOverride) {
    for (const index of [outerLoop.bottomIndices, ...holeLoops.map(loop => loop.bottomIndices)].flat()) bottomThicknessByIndex.set(index, thicknessOverride.bottom);
    for (const index of [outerLoop.topIndices, ...holeLoops.map(loop => loop.topIndices)].flat()) topThicknessByIndex.set(index, thicknessOverride.top);
  } else {
    setLoopThicknesses(bottomThicknessByIndex, outerLoop.bottomPoints, outerLoop.bottomIndices, bottomHoles);
    setLoopThicknesses(topThicknessByIndex, outerLoop.topPoints, outerLoop.topIndices, topHoles);
    for (const holeLoop of holeLoops) {
      setLoopThicknesses(bottomThicknessByIndex, holeLoop.bottomPoints, holeLoop.bottomIndices, [outerLoop.bottomPoints]);
      setLoopThicknesses(topThicknessByIndex, holeLoop.topPoints, holeLoop.topIndices, [outerLoop.topPoints]);
    }
  }

  if (capBottom) {
    addCap(
      indices,
      triangleThicknesses,
      positions,
      outerLoop.bottomPoints,
      holeLoops.map(({ bottomPoints }) => bottomPoints),
      outerLoop.bottomIndices,
      holeLoops.map(({ bottomIndices }) => bottomIndices),
      bottomThicknessByIndex,
      false
    );
  }
  if (capTop) {
    addCap(
      indices,
      triangleThicknesses,
      positions,
      outerLoop.topPoints,
      holeLoops.map(({ topPoints }) => topPoints),
      outerLoop.topIndices,
      holeLoops.map(({ topIndices }) => topIndices),
      topThicknessByIndex,
      true
    );
  }

  addLoopSides(
    indices,
    triangleThicknesses,
    positions,
    outerLoop,
    false,
    bottomHoles,
    topHoles,
    thicknessOverride
  );

  for (let index = 0; index < holeLoops.length; index += 1) {
    addLoopSides(
      indices,
      triangleThicknesses,
      positions,
      holeLoops[index],
      true,
      [outerLoop.bottomPoints],
      [outerLoop.topPoints],
      thicknessOverride
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
  const triangleThicknesses: number[] = [];

  for (const pair of regionPairs) {
    addRegionPair(
      positions,
      indices,
      triangleThicknesses,
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
  setTriangleWallThicknesses(geometry, triangleThicknesses);
  validateGeometry(geometry);
  return geometry;
}

/** Union des bandes et ponts avant triangulation, avec les gardes de loft historiques. */
export async function createBridgedWallGeometry(
  contours: readonly NormalizedContour[],
  bridges: readonly Bridge[],
  options: Readonly<{
    scale: number; bottomWidthMm: number; topWidthMm: number;
    bottomBridgeGrowthMm: number; topBridgeGrowthMm: number;
    baseHeight: number; height: number; capBottom: boolean; capTop: boolean;
  }>
): Promise<THREE.BufferGeometry> {
  if (!Number.isFinite(options.height) || options.height <= 0 || !Number.isFinite(options.baseHeight) || options.baseHeight < 0) {
    throw generationError('INVALID_GEOMETRY', 'Invalid bridged wall height.', { field: 'height' });
  }
  const [bottom, top] = await Promise.all([
    createConnectedRegions(contours, bridges, options.scale, options.bottomWidthMm, options.bottomBridgeGrowthMm),
    createConnectedRegions(contours, bridges, options.scale, options.topWidthMm, options.topBridgeGrowthMm)
  ]);
  const pairs = matchRegions(bottom, top);
  const positions: THREE.Vector3[] = [];
  const indices: number[] = [];
  const thicknesses: number[] = [];
  for (const pair of pairs) {
    addRegionPair(positions, indices, thicknesses, pair,
      options.baseHeight, options.baseHeight + options.height,
      options.capBottom, options.capTop,
      { bottom: options.bottomWidthMm, top: options.topWidthMm });
  }
  const geometry = new THREE.BufferGeometry();
  try {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flatMap(p => [p.x, p.y, p.z]), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    setTriangleWallThicknesses(geometry, thicknesses);
    validateGeometry(geometry);
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}
