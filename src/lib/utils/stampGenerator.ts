import * as modelingModule from '@jscad/modeling';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CookieCutterParams, HandleStyle, SizeMode } from '../types/CookieCutter';
import {
  extractClosedContours,
  signedArea,
  type NormalizedContour,
  type NormalizedPoint
} from './contourExtraction';
import {
  CutterGenerationError,
  validateCookieCutterParams
} from './generationValidation';
import { validatePrintableObject } from './geometryValidation';
import type { StampImprintMode } from '../domain/designDocument';
import { STAMP_IMPRINT_LIMITS } from '../domain/stampImprint';
import { createPlanarStampBody } from './stampBodyGeometry';

const modeling = (
  modelingModule as unknown as { readonly default?: typeof modelingModule }
).default ?? modelingModule;
const { booleans, extrusions, geometries, modifiers, primitives, transforms } = modeling;
const { subtract, union } = booleans;
const { extrudeLinear } = extrusions;
const { geom2, geom3, poly3 } = geometries;
const { cuboid, cylinder } = primitives;
const { translate } = transforms;

type Geom2 = ReturnType<typeof geom2.create>;
type Geom3 = ReturnType<typeof geom3.create>;
type Vec3 = NonNullable<Parameters<typeof poly3.create>[0]>[number];
type DirectedEdge = Readonly<{
  start: Vec3;
  end: Vec3;
  startKey: string;
  endKey: string;
}>;
const generalizeSolid = modifiers.generalize as unknown as (
  options: Readonly<{ snap: boolean; simplify: boolean; triangulate: boolean }>,
  geometry: Geom3
) => Geom3;
type Bounds2D = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}>;

const BASE_THICKNESS = STAMP_IMPRINT_LIMITS.baseThicknessMm;
const BOOLEAN_OVERLAP = 0.05;
const TRIANGLE_EPSILON = 1e-16;
const MAX_REPAIRABLE_TRIANGLE_AREA = 0.01;
const MAX_REPAIRABLE_TRIANGLE_COUNT = 8;
// Much finer than the 1e-5 mm mesh weld: canonicalize floating-point duplicates,
// not the artwork resolution or the user's millimetre parameters.
const BOOLEAN_VERTEX_PRECISION = 100_000_000;

const MATERIAL_OPTIONS = Object.freeze({
  color: 0xffa726,
  roughness: 0.5,
  metalness: 0.1,
  side: THREE.DoubleSide
});

function generationError(
  code: ConstructorParameters<typeof CutterGenerationError>[0],
  message: string,
  details: Readonly<Record<string, unknown>>
): never {
  throw new CutterGenerationError(code, message, details);
}

function selectedDimension(width: number, height: number, mode: SizeMode): number {
  if (mode === 'width') return width;
  if (mode === 'height') return height;
  return Math.max(width, height);
}

function contourBounds(contours: ReadonlyArray<NormalizedContour>): Bounds2D {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const contour of contours) {
    for (const point of contour) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width + height) || width <= 0 || height <= 0) {
    generationError('INVALID_GEOMETRY', 'The stamp artwork has invalid dimensions.', {
      field: 'targetSize'
    });
  }

  return Object.freeze({ minX, minY, maxX, maxY, width, height });
}

function pointInPolygon(point: NormalizedPoint, polygon: NormalizedContour): boolean {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;

    if (crosses) inside = !inside;
  }

  return inside;
}

function contourDepths(contours: ReadonlyArray<NormalizedContour>): readonly number[] {
  return contours.map((contour, index) =>
    contours.reduce(
      (depth, candidate, candidateIndex) =>
        candidateIndex !== index && pointInPolygon(contour[0], candidate) ? depth + 1 : depth,
      0
    )
  );
}

function scaledContourPoints(
  contour: NormalizedContour,
  bounds: Bounds2D,
  physicalScale: number
): Array<[number, number]> {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const normalized = contour.map(({ x, y }) => ({
    x: (x - centerX) * physicalScale,
    y: (y - centerY) * physicalScale
  }));

  if (signedArea(normalized) < 0) normalized.reverse();
  return normalized.map(({ x, y }) => [x, y]);
}

function createReliefRegion(
  contours: ReadonlyArray<NormalizedContour>,
  depths: readonly number[],
  bounds: Bounds2D,
  physicalScale: number
): Geom2 {
  const regions: Geom2[] = [];

  for (let index = 0; index < contours.length; index += 1) {
    if (depths[index] % 2 !== 0) continue;

    let region = geom2.fromPoints(
      scaledContourPoints(contours[index], bounds, physicalScale)
    );
    const holes = contours
      .map((contour, holeIndex) => ({ contour, holeIndex }))
      .filter(
        ({ contour, holeIndex }) =>
          depths[holeIndex] === depths[index] + 1 &&
          pointInPolygon(contour[0], contours[index])
      )
      .map(({ contour }) =>
        geom2.fromPoints(scaledContourPoints(contour, bounds, physicalScale))
      );

    if (holes.length > 0) region = subtract(region, ...holes) as Geom2;
    regions.push(region);
  }

  if (regions.length === 0) {
    generationError('NO_VALID_CONTOURS', 'The SVG contains no usable filled stamp region.', {
      field: 'contours'
    });
  }

  const relief = regions.length === 1 ? regions[0] : (union(...regions) as Geom2);
  geom2.validate(relief);
  return relief;
}
function createHandle(
  style: HandleStyle,
  handleHeight: number,
  baseWidth: number,
  baseDepth: number
): Geom3 | null {
  if (style === 'none') return null;

  const connectionHeight = handleHeight + BOOLEAN_OVERLAP;
  const minimumBaseDimension = Math.min(baseWidth, baseDepth);
  const radius = Math.max(2, Math.min(10, minimumBaseDimension * 0.25));
  let handle: Geom3;

  switch (style) {
    case 'round':
      handle = cylinder({ height: connectionHeight, radius, segments: 32 });
      break;
    case 'chamfered':
      handle = cylinder({ height: connectionHeight, radius, segments: 8 });
      break;
    case 'rectangular':
      handle = cuboid({
        size: [
          Math.max(4, Math.min(20, baseWidth * 0.5)),
          Math.max(4, Math.min(20, baseDepth * 0.5)),
          connectionHeight
        ]
      });
      break;
    case 'flat':
      handle = cuboid({
        size: [
          Math.max(6, Math.min(30, baseWidth * 0.65)),
          Math.max(3, Math.min(8, baseDepth * 0.3)),
          connectionHeight
        ]
      });
      break;
    default:
      return null;
  }

  return translate([0, 0, -handleHeight / 2 + BOOLEAN_OVERLAP / 2], handle) as Geom3;
}

function vertexKey(vertex: Vec3): string {
  return `${vertex[0]},${vertex[1]},${vertex[2]}`;
}

function edgeKey(start: Vec3, end: Vec3): string {
  return `${vertexKey(start)}/${vertexKey(end)}`;
}

function triangleArea([first, second, third]: readonly Vec3[]): number {
  const abX = second[0] - first[0];
  const abY = second[1] - first[1];
  const abZ = second[2] - first[2];
  const acX = third[0] - first[0];
  const acY = third[1] - first[1];
  const acZ = third[2] - first[2];
  const crossX = abY * acZ - abZ * acY;
  const crossY = abZ * acX - abX * acZ;
  const crossZ = abX * acY - abY * acX;
  return Math.hypot(crossX, crossY, crossZ) / 2;
}

/**
 * Repair the tiny triangular cap holes that JSCAD can leave after a 3D union.
 * Any ambiguous, non-horizontal, non-top or larger boundary remains a hard error.
 */
function repairBooleanCapTriangles(solid: Geom3): Geom3 {
  const polygons = geom3.toPolygons(solid);
  const directed = new Map<string, { count: number; edge: DirectedEdge }>();
  let maximumZ = Number.NEGATIVE_INFINITY;

  for (const polygon of polygons) {
    polygon.vertices.forEach((start, index) => {
      const end = polygon.vertices[(index + 1) % polygon.vertices.length];
      const key = edgeKey(start, end);
      const current = directed.get(key);
      directed.set(key, {
        count: (current?.count ?? 0) + 1,
        edge: current?.edge ?? {
          start,
          end,
          startKey: vertexKey(start),
          endKey: vertexKey(end)
        }
      });
      maximumZ = Math.max(maximumZ, start[2]);
    });
  }

  const boundaryEdges: DirectedEdge[] = [];
  for (const { count, edge } of directed.values()) {
    const reverseCount = directed.get(edgeKey(edge.end, edge.start))?.count ?? 0;
    for (let index = reverseCount; index < count; index += 1) {
      boundaryEdges.push(edge);
    }
  }

  if (boundaryEdges.length === 0) return solid;
  if (boundaryEdges.length > MAX_REPAIRABLE_TRIANGLE_COUNT * 3) {
    throw new Error(`boolean repair refused ${boundaryEdges.length} unmatched edges`);
  }

  const outgoing = new Map<string, DirectedEdge[]>();
  const incoming = new Map<string, number>();
  for (const edge of boundaryEdges) {
    outgoing.set(edge.startKey, [...(outgoing.get(edge.startKey) ?? []), edge]);
    incoming.set(edge.endKey, (incoming.get(edge.endKey) ?? 0) + 1);
  }
  for (const [key, edges] of outgoing) {
    if (edges.length !== 1 || incoming.get(key) !== 1) {
      throw new Error('boolean repair refused an ambiguous boundary');
    }
  }

  const unused = new Set(boundaryEdges);
  const repairs: ReturnType<typeof poly3.create>[] = [];
  while (unused.size > 0) {
    const firstEdge = unused.values().next().value as DirectedEdge | undefined;
    if (!firstEdge) break;

    const loop: Vec3[] = [];
    let edge = firstEdge;
    while (true) {
      if (!unused.delete(edge)) {
        throw new Error('boolean repair refused a repeated boundary edge');
      }
      loop.push(edge.start);
      if (edge.endKey === firstEdge.startKey) break;
      const next = outgoing.get(edge.endKey)?.[0];
      if (!next || loop.length >= 3) {
        throw new Error('boolean repair refused a non-triangular boundary');
      }
      edge = next;
    }

    if (loop.length !== 3) {
      throw new Error('boolean repair refused a non-triangular boundary');
    }
    const topZ = loop[0][2];
    const isHorizontal = loop.every((vertex) => Math.abs(vertex[2] - topZ) <= Number.EPSILON);
    if (!isHorizontal || Math.abs(topZ - maximumZ) > Number.EPSILON) {
      throw new Error('boolean repair refused a boundary outside the top cap');
    }
    const area = triangleArea(loop);
    if (!Number.isFinite(area) || area <= TRIANGLE_EPSILON || area > MAX_REPAIRABLE_TRIANGLE_AREA) {
      throw new Error(`boolean repair refused a ${area} mm² triangle`);
    }

    repairs.push(poly3.create([loop[0], loop[2], loop[1]]));
  }

  const repaired = geom3.create([...polygons, ...repairs]);
  geom3.validate(repaired);
  return repaired;
}

/** Connect boolean T-junctions before snapping can move them off a shared edge.
 * Use public JSCAD operations only; never fill holes or apply the legacy cap repair.
 */
function generalizeConnectedSolid(solid: Geom3): Geom3 {
  const canonical = geom3.create(geom3.toPolygons(solid).map(polygon => poly3.create(
    polygon.vertices.map(vertex => vertex.map(value =>
      Math.round(value * BOOLEAN_VERTEX_PRECISION) / BOOLEAN_VERTEX_PRECISION) as Vec3)
  )));
  const connected = generalizeSolid(
    { snap: false, simplify: false, triangulate: true }, canonical);
  return generalizeSolid(
    { snap: true, simplify: false, triangulate: true }, connected);
}

/** Restore only known construction planes within JSCAD's own snap epsilon.
 * No faces are filled, removed or repaired; shared vertices retain identical Z.
 */
function restoreRecessDepthPlanes(solid: Geom3, planes: readonly number[], epsilon: number): Geom3 {
  if (!Number.isFinite(epsilon) || epsilon <= 0) throw new Error('Invalid depth-plane precision.');
  return geom3.create(geom3.toPolygons(solid).map(polygon => poly3.create(polygon.vertices.map(vertex => {
    const plane = planes.find(value => Math.abs(vertex[2] - value) <= epsilon);
    return [vertex[0], vertex[1], plane ?? vertex[2]] as Vec3;
  }))));
}

/** Successful legacy unions remain byte-stable. A rejected topology is rebuilt
 * from the same boolean solid, without extending the cap-hole repair contract.
 */
function finalizeRaisedSolid(solid: Geom3, planes: readonly number[]): Geom3 {
  try {
    const legacy = repairBooleanCapTriangles(
      generalizeSolid({ snap: true, simplify: true, triangulate: true }, solid));
    geom3.validate(legacy);
    return legacy;
  } catch {
    const connected = restoreRecessDepthPlanes(generalizeConnectedSolid(solid), planes,
      Number(modeling.measurements.measureEpsilon(solid)));
    geom3.validate(connected);
    return connected;
  }
}

function triangulateSolid(solid: Geom3): THREE.BufferGeometry {
  const positions: number[] = [];
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  const third = new THREE.Vector3();
  const sideA = new THREE.Vector3();
  const sideB = new THREE.Vector3();

  for (const polygon of geom3.toPolygons(solid)) {
    if (polygon.vertices.length < 3) continue;
    const origin = polygon.vertices[0];

    for (let index = 1; index < polygon.vertices.length - 1; index += 1) {
      const next = polygon.vertices[index];
      const last = polygon.vertices[index + 1];
      first.set(origin[0], origin[2], -origin[1]);
      second.set(next[0], next[2], -next[1]);
      third.set(last[0], last[2], -last[1]);
      sideA.subVectors(second, first);
      sideB.subVectors(third, first);
      if (sideA.cross(sideB).lengthSq() <= TRIANGLE_EPSILON) continue;

      positions.push(
        first.x,
        first.y,
        first.z,
        second.x,
        second.y,
        second.z,
        third.x,
        third.y,
        third.z
      );
    }
  }

  if (positions.length === 0) {
    generationError('INVALID_GEOMETRY', 'The stamp boolean result contains no triangles.', {
      field: 'geometry'
    });
  }

  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const welded = mergeVertices(raw, 1e-5);
  raw.dispose();
  welded.computeVertexNormals();
  welded.computeBoundingBox();
  welded.computeBoundingSphere();
  return welded;
}

/** Legacy two-argument calls keep the raised route; V4 cavities subtract from the front only. */
export async function generateStamp(
  svgString: string,
  paramsValue: Readonly<CookieCutterParams>,
  imprintMode: StampImprintMode = 'raised'
): Promise<THREE.Group> {
  const params = validateCookieCutterParams(paramsValue);
  if (imprintMode !== 'raised' && imprintMode !== 'recessed') {
    generationError('INVALID_PARAMS', 'Unknown stamp imprint mode.', { field: 'imprintMode' });
  }
  if (imprintMode === 'recessed' && params.stampDepth > STAMP_IMPRINT_LIMITS.maximumRecessDepthMm) {
    generationError('INVALID_PARAMS', 'The recessed stamp depth must not exceed 3 mm; at least 1 mm of the 4 mm base must remain.', { field: 'stampDepth', value: params.stampDepth });
  }
  if (!params.stampBase) {
    generationError(
      'INVALID_PARAMS',
      'A printable stamp requires a base connecting every relief region.',
      { field: 'stampBase', value: false }
    );
  }

  try {
    const contours = extractClosedContours(svgString, 48);
    const bounds = contourBounds(contours);
    const padding = Math.min(5, params.targetSize * 0.1);
    const sourceTarget = selectedDimension(bounds.width, bounds.height, params.sizeMode);
    const physicalScale = (params.targetSize - padding * 2) / sourceTarget;

    if (!Number.isFinite(physicalScale) || physicalScale <= 0) {
      generationError(
        'INVALID_PARAMS',
        'The requested stamp size is too small for its base padding.',
        { field: 'targetSize', targetSize: params.targetSize }
      );
    }

    const baseWidth = bounds.width * physicalScale + padding * 2;
    const baseDepth = bounds.height * physicalScale + padding * 2;
    if (baseWidth > params.buildPlateSize || baseDepth > params.buildPlateSize) {
      generationError(
        'INVALID_GEOMETRY',
        'The stamp does not fit on the selected build plate.',
        {
          field: 'buildPlateSize',
          width: baseWidth,
          depth: baseDepth,
          max: params.buildPlateSize
        }
      );
    }

    const reliefRegion = createReliefRegion(
      contours,
      contourDepths(contours),
      bounds,
      physicalScale
    );
    const base = cuboid({
      size: [baseWidth, baseDepth, BASE_THICKNESS],
      center: [0, 0, BASE_THICKNESS / 2]
    });
    const relief = translate(
      [0, 0, imprintMode === 'recessed' ? BASE_THICKNESS - params.stampDepth : BASE_THICKNESS - BOOLEAN_OVERLAP],
      extrudeLinear(
        { height: params.stampDepth + BOOLEAN_OVERLAP },
        reliefRegion
      )
    ) as Geom3;
    const activeHandle = params.enableHandle
      ? createHandle(params.handleStyle, params.handleHeight, baseWidth, baseDepth)
      : null;
    const stampBody = (imprintMode === 'recessed' ? subtract(base, relief) : union(base, relief)) as Geom3;
    const joined = activeHandle
      ? (union(stampBody, activeHandle) as Geom3)
      : stampBody;
    const lifted = activeHandle
      ? (translate([0, 0, params.handleHeight], joined) as Geom3)
      : joined;
    const handleLift = activeHandle ? params.handleHeight : 0;
    function checkedGroup(geometry: THREE.BufferGeometry): THREE.Group {
      const material = new THREE.MeshStandardMaterial(MATERIAL_OPTIONS);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'stamp-solid';
      const group = new THREE.Group(); group.name = 'stamp'; group.add(mesh); group.updateMatrixWorld(true);
      const report = validatePrintableObject(group, { requireSingleShell: true });
      if (!report.valid) {
        geometry.dispose(); material.dispose();
        generationError('INVALID_GEOMETRY', 'The generated stamp is not one printable solid.', { field: 'geometry', errors: report.errors });
      }
      return group;
    }
    let group: THREE.Group;
    try {
      // Keep successful boolean results unchanged; never repair failed cavities.
      const printableSolid = imprintMode === 'recessed'
        ? restoreRecessDepthPlanes(generalizeConnectedSolid(lifted),
            [0, handleLift, handleLift + BASE_THICKNESS - params.stampDepth, handleLift + BASE_THICKNESS],
            Number(modeling.measurements.measureEpsilon(lifted)))
        : finalizeRaisedSolid(lifted,
            [0, handleLift, handleLift + BASE_THICKNESS, handleLift + BASE_THICKNESS + params.stampDepth]);
      geom3.validate(printableSolid);
      group = checkedGroup(triangulateSolid(printableSolid));
      const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
      if (!activeHandle && (Math.abs(size.x - baseWidth) > 0.001 || Math.abs(size.z - baseDepth) > 0.001)) {
        group.traverse(child => { if (child instanceof THREE.Mesh) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); } });
        throw new Error('Boolean snapping exceeds the dimensional precision.');
      }
      group.userData.geometryRoute = 'boolean';
    } catch (error) {
      // No handle joins are guessed. This direct layer construction only concerns
      // a tool without a back handle; the same strict final mesh validator remains mandatory.
      if (activeHandle) throw error;
      const outlines = geom2.toOutlines(reliefRegion).map(outline => outline.map(point => ({ x: point[0], y: point[1] })));
      group = checkedGroup(createPlanarStampBody(outlines, baseWidth, baseDepth, BASE_THICKNESS, params.stampDepth, imprintMode));
      group.userData.geometryRoute = 'planar';
    }

    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    group.userData.params = { ...params };
    group.userData.contourCount = contours.length;
    group.userData.dimensions = Object.freeze({
      width: size.x,
      depth: size.z,
      height: size.y,
      targetSize: params.targetSize,
      sizeMode: params.sizeMode
    });
    return group;
  } catch (error) {
    if (error instanceof CutterGenerationError) throw error;
    const rawReason = error instanceof Error ? error.message : 'Unknown geometry error';
    const reason = rawReason.length > 500 ? `${rawReason.slice(0, 500)}…` : rawReason;
    throw new CutterGenerationError(
      'INVALID_GEOMETRY',
      `The stamp geometry could not be generated safely: ${reason}`,
      {
        stage: 'stamp',
        reason
      }
    );
  }
}
