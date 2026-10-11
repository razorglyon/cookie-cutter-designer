import * as THREE from 'three';
import type { Bridge } from '../domain/designDocument';
import {
  mergeGeometries,
  mergeVertices
} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  CookieCutterParams,
  HandleStyle,
  SizeMode
} from '../types/CookieCutter';
import { extractClosedContours, type NormalizedContour } from './contourExtraction';
import { createTaperedWallGeometry, createBridgedWallGeometry } from './cutterGeometry';
import {
  CutterGenerationError,
  validateCookieCutterParams
} from './generationValidation';
import {
  getTriangleWallThicknesses,
  setTriangleWallThicknesses
} from './wallThicknessHeatmap';

const MATERIAL_OPTIONS = Object.freeze({
  color: 0xffa726,
  roughness: 0.5,
  metalness: 0.1,
  side: THREE.DoubleSide
});

const HANDLE_SPREAD: Readonly<Record<Exclude<HandleStyle, 'none'>, number>> = Object.freeze({
  flat: 0,
  round: 0.75,
  chamfered: 1,
  rectangular: 0.25
});

const SIZE_FIT_MAX_ITERATIONS = 5;
const SIZE_FIT_MIN_SCALE = 1e-6;

function createCutterMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(MATERIAL_OPTIONS);
}

function hasActiveHandle(params: Readonly<CookieCutterParams>): boolean {
  return params.enableHandle && params.handleStyle !== 'none';
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
}

function assertWatertightGeometry(geometry: THREE.BufferGeometry): void {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();

  if (!positions || !index || index.count === 0 || index.count % 3 !== 0) {
    throw new CutterGenerationError(
      'INVALID_GEOMETRY',
      'The generated cutter geometry is empty or incomplete.',
      { field: 'geometry' }
    );
  }

  const edgeCounts = new Map<string, number>();
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  const third = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();

  for (let item = 0; item < index.count; item += 3) {
    const triangle = [index.getX(item), index.getX(item + 1), index.getX(item + 2)];

    first.fromBufferAttribute(positions as THREE.BufferAttribute, triangle[0]);
    second.fromBufferAttribute(positions as THREE.BufferAttribute, triangle[1]);
    third.fromBufferAttribute(positions as THREE.BufferAttribute, triangle[2]);
    edgeA.subVectors(second, first);
    edgeB.subVectors(third, first);

    if (edgeA.cross(edgeB).lengthSq() <= 1e-16) {
      throw new CutterGenerationError(
        'INVALID_GEOMETRY',
        'The generated cutter contains a degenerate triangle.',
        { triangle: item / 3 }
      );
    }

    for (let edge = 0; edge < 3; edge += 1) {
      const start = triangle[edge];
      const end = triangle[(edge + 1) % 3];
      const key = start < end ? `${start}:${end}` : `${end}:${start}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  const invalidEdge = Array.from(edgeCounts.entries()).find(([, count]) => count !== 2);
  if (invalidEdge) {
    throw new CutterGenerationError(
      'INVALID_GEOMETRY',
      'The generated cutter surface is not watertight.',
      { edge: invalidEdge[0], incidence: invalidEdge[1] }
    );
  }
}

function finalizeJoinedGeometry(
  segments: readonly THREE.BufferGeometry[]
): THREE.BufferGeometry {
  const triangleThicknesses = segments.flatMap((segment) => {
    const values = getTriangleWallThicknesses(segment);
    if (!values) {
      throw new CutterGenerationError(
        'INVALID_GEOMETRY',
        'A cutter segment is missing wall-thickness metadata.',
        { field: 'wallThickness' }
      );
    }
    return [...values];
  });
  const prepared = segments.map((segment) => {
    const clone = segment.clone();
    clone.deleteAttribute('normal');
    return clone;
  });

  let merged: THREE.BufferGeometry | null = null;
  try {
    merged = mergeGeometries(prepared, false);
    if (!merged) {
      throw new CutterGenerationError(
        'INVALID_GEOMETRY',
        'The cutter wall segments could not be merged.',
        { field: 'geometry' }
      );
    }

    const welded = mergeVertices(merged, 1e-5);
    welded.computeVertexNormals();
    welded.computeBoundingBox();
    welded.computeBoundingSphere();
    setTriangleWallThicknesses(welded, triangleThicknesses);
    assertWatertightGeometry(welded);
    return welded;
  } finally {
    for (const geometry of prepared) geometry.dispose();
    merged?.dispose();
  }
}

async function createContourGeometry(
  contour: NormalizedContour,
  params: Readonly<CookieCutterParams>,
  scale: number
): Promise<THREE.BufferGeometry> {
  const activeHandle = hasActiveHandle(params);
  const joinStyle = 'miter';
  const body = await createTaperedWallGeometry(contour, {
    wallThickness: params.wallThickness,
    height: params.cuttingHeight,
    taperAngle: params.taperAngle,
    scale,
    joinStyle,
    capTop: !activeHandle
  });

  if (!activeHandle) {
    assertWatertightGeometry(body);
    return body;
  }

  const handleHeight = params.totalHeight - params.cuttingHeight;
  const taperOffset =
    Math.tan((params.taperAngle * Math.PI) / 180) * params.cuttingHeight;
  const seamWallThickness = params.wallThickness + taperOffset * 2;
  const topSpread = HANDLE_SPREAD[params.handleStyle as Exclude<HandleStyle, 'none'>];
  const handleTaperAngle = Math.atan(topSpread / handleHeight) * (180 / Math.PI);
  let handle: THREE.BufferGeometry | null = null;

  try {
    handle = await createTaperedWallGeometry(contour, {
      wallThickness: seamWallThickness,
      height: handleHeight,
      taperAngle: handleTaperAngle,
      scale,
      baseHeight: params.cuttingHeight,
      joinStyle,
      capBottom: false
    });

    return finalizeJoinedGeometry([body, handle]);
  } finally {
    body.dispose();
    handle?.dispose();
  }
}

function selectedPlanarDimension(
  width: number,
  height: number,
  mode: SizeMode
): number {
  if (mode === 'width') return width;
  if (mode === 'height') return height;
  return Math.max(width, height);
}

export function sourceDimension(
  contours: ReadonlyArray<NormalizedContour>,
  mode: SizeMode
): number {
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

  const dimension = selectedPlanarDimension(maxX - minX, maxY - minY, mode);
  if (!Number.isFinite(dimension) || dimension <= 0) {
    throw new CutterGenerationError(
      'INVALID_GEOMETRY',
      'The artwork has no measurable planar dimension.',
      { field: 'targetSize', sizeMode: mode }
    );
  }

  return dimension;
}

function measuredPlanarDimension(group: THREE.Group, mode: SizeMode): number {
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  return selectedPlanarDimension(size.x, size.z, mode);
}

async function createBridgedContourGeometry(
  contours: ReadonlyArray<NormalizedContour>, bridges: readonly Bridge[],
  params: Readonly<CookieCutterParams>, scale: number
): Promise<THREE.BufferGeometry> {
  const activeHandle = hasActiveHandle(params);
  const taper = Math.tan(params.taperAngle * Math.PI / 180) * params.cuttingHeight;
  const topWidth = params.wallThickness + 2 * taper;
  const body = await createBridgedWallGeometry(contours, bridges, {
    scale, bottomWidthMm: params.wallThickness, topWidthMm: topWidth,
    bottomBridgeGrowthMm: 0, topBridgeGrowthMm: 2 * taper,
    baseHeight: 0, height: params.cuttingHeight,
    capBottom: true, capTop: !activeHandle
  });
  if (!activeHandle) {
    try { assertWatertightGeometry(body); return body; }
    catch (error) { body.dispose(); throw error; }
  }
  const handleHeight = params.totalHeight - params.cuttingHeight;
  const spread = HANDLE_SPREAD[params.handleStyle as Exclude<HandleStyle, 'none'>];
  let handle: THREE.BufferGeometry | null = null;
  try {
    handle = await createBridgedWallGeometry(contours, bridges, {
      scale, bottomWidthMm: topWidth, topWidthMm: topWidth + 2 * spread,
      bottomBridgeGrowthMm: 2 * taper, topBridgeGrowthMm: 2 * (taper + spread),
      baseHeight: params.cuttingHeight, height: handleHeight,
      capBottom: false, capTop: true
    });
    return finalizeJoinedGeometry([body, handle]);
  } finally { body.dispose(); handle?.dispose(); }
}

async function buildCutterGroup(
  contours: ReadonlyArray<NormalizedContour>,
  params: Readonly<CookieCutterParams>,
  scale: number,
  bridges: readonly Bridge[] = []
): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = 'cookieCutter';

  try {
    if (bridges.length > 0) {
      const geometry = await createBridgedContourGeometry(contours, bridges, params, scale);
      const mesh = new THREE.Mesh(geometry, createCutterMaterial());
      mesh.name = 'cutter-body-bridged';
      group.add(mesh);
    } else {
      for (let index = 0; index < contours.length; index += 1) {
        const geometry = await createContourGeometry(contours[index], params, scale);
        const mesh = new THREE.Mesh(geometry, createCutterMaterial());
        mesh.name = `cutter-body-${index}`;
        mesh.userData.contourIndex = index;
        group.add(mesh);
      }
    }

    return group;
  } catch (error) {
    disposeGroup(group);
    throw error;
  }
}

async function buildFittedCutterGroup(
  contours: ReadonlyArray<NormalizedContour>,
  params: Readonly<CookieCutterParams>,
  bridges: readonly Bridge[] = []
): Promise<{ group: THREE.Group; scale: number }> {
  let scale = params.targetSize / sourceDimension(contours, params.sizeMode);
  const tolerance = Math.max(0.02, params.targetSize * 0.0005);

  for (let iteration = 0; iteration < SIZE_FIT_MAX_ITERATIONS; iteration += 1) {
    if (!Number.isFinite(scale) || scale < SIZE_FIT_MIN_SCALE) {
      throw new CutterGenerationError(
        'INVALID_GEOMETRY',
        'The requested physical size is too small for the selected wall and handle.',
        { field: 'targetSize', targetSize: params.targetSize }
      );
    }

    const group = await buildCutterGroup(contours, params, scale, bridges);
    const measured = measuredPlanarDimension(group, params.sizeMode);
    const difference = Math.abs(measured - params.targetSize);

    if (Number.isFinite(measured) && measured > 0 && difference <= tolerance) {
      return { group, scale };
    }

    disposeGroup(group);
    if (!Number.isFinite(measured) || measured <= 0) {
      throw new CutterGenerationError(
        'INVALID_GEOMETRY',
        'The generated cutter has no measurable planar dimension.',
        { field: 'targetSize', measured }
      );
    }

    scale *= params.targetSize / measured;
  }

  throw new CutterGenerationError(
    'INVALID_GEOMETRY',
    'The cutter could not converge to the requested physical size.',
    { field: 'targetSize', targetSize: params.targetSize, sizeMode: params.sizeMode }
  );
}

function assertFitsBuildPlate(
  group: THREE.Group,
  params: Readonly<CookieCutterParams>
): THREE.Box3 {
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());

  if (!Number.isFinite(size.x + size.y + size.z) || size.x <= 0 || size.y <= 0 || size.z <= 0) {
    throw new CutterGenerationError(
      'INVALID_GEOMETRY',
      'The generated cutter has invalid dimensions.',
      { field: 'bounds' }
    );
  }

  if (size.x > params.buildPlateSize || size.z > params.buildPlateSize) {
    throw new CutterGenerationError(
      'INVALID_GEOMETRY',
      'The cutter does not fit on the selected build plate. Reduce the target size or choose a larger plate.',
      {
        field: 'buildPlateSize',
        width: size.x,
        depth: size.z,
        max: params.buildPlateSize
      }
    );
  }

  return bounds;
}

/**
 * Generate a finite, watertight cookie-cutter group from all valid closed SVG contours.
 */
export async function generateCookieCutter(
  svgString: string,
  paramsValue: Readonly<CookieCutterParams>,
  bridges: readonly Bridge[] = []
): Promise<THREE.Group> {
  const params = validateCookieCutterParams(paramsValue);
  const contours = extractClosedContours(svgString);
  let group: THREE.Group | null = null;

  try {
    const fitted = await buildFittedCutterGroup(contours, params, bridges);
    group = fitted.group;

    const bounds = assertFitsBuildPlate(group, params);
    const center = bounds.getCenter(new THREE.Vector3());
    group.position.set(-center.x, -bounds.min.y, -center.z);
    group.updateMatrixWorld(true);

    const centeredBounds = new THREE.Box3().setFromObject(group);
    if (Math.abs(centeredBounds.min.y) > 1e-5) {
      throw new CutterGenerationError(
        'INVALID_GEOMETRY',
        'The cutter could not be placed on the build plane.',
        { minY: centeredBounds.min.y }
      );
    }

    const finalSize = centeredBounds.getSize(new THREE.Vector3());
    group.userData.params = { ...params };
    group.userData.contourCount = contours.length;
    group.userData.effectiveScale = fitted.scale;
    group.userData.dimensions = Object.freeze({
      width: finalSize.x,
      depth: finalSize.z,
      height: finalSize.y,
      targetSize: params.targetSize,
      sizeMode: params.sizeMode
    });
    return group;
  } catch (error) {
    if (group) disposeGroup(group);

    if (error instanceof CutterGenerationError) throw error;
    throw new CutterGenerationError(
      'INVALID_GEOMETRY',
      'The cutter geometry could not be generated safely.',
      { stage: 'generation' }
    );
  }
}

/**
 * Generate the same circle fixture used by the test-model button through the production pipeline.
 */
export async function createTestCookieCutter(
  params: Readonly<CookieCutterParams>
): Promise<THREE.Group> {
  const circleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="20" fill="black" />
  </svg>`;

  return generateCookieCutter(circleSvg, params);
}
