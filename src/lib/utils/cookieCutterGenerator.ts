import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { CookieCutterParams } from '../types/CookieCutter';

/**
 * Generate a 3D cookie cutter mesh from SVG path data
 */
export async function generateCookieCutter(
  svgString: string,
  params: CookieCutterParams
): Promise<THREE.Group> {
  // Parse SVG
  const loader = new SVGLoader();
  const svgData = loader.parse(svgString);

  if (!svgData.paths || svgData.paths.length === 0) {
    throw new Error('No paths found in SVG');
  }

  // Create a group to hold all meshes
  const group = new THREE.Group();
  group.name = 'cookieCutter';

  // Process each path
  let shapeIndex = 0;
  for (const path of svgData.paths) {
    const shapes = SVGLoader.createShapes(path);

    for (const shape of shapes) {
      // Create the main cutter body with extrusion
      const mesh = createCutterBody(shape, params);
      mesh.name = `cutter-body-${shapeIndex}`;
      group.add(mesh);

      // Add handle if enabled
      if (params.handleStyle !== 'none' && params.enableHandle) {
        const handle = createHandle(shape, params);
        if (handle) {
          handle.name = `handle-${shapeIndex}`;
          group.add(handle);
        }
      }

      shapeIndex++;
    }
  }

  // Auto-scale to fit within build plate
  const buildPlateSize = params.buildPlateSize || 200; // mm
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Calculate the maximum dimension (X or Z, ignore Y which is height)
  const maxDimension = Math.max(size.x, size.z);

  // Scale down if too large, keeping 80% of build plate for safety
  if (maxDimension > buildPlateSize * 0.8) {
    const autoScale = (buildPlateSize * 0.8) / maxDimension;
    group.scale.set(autoScale, autoScale, autoScale);

    // Recalculate bounding box after scaling
    box.setFromObject(group);
    center.copy(box.getCenter(new THREE.Vector3()));
  }

  // Position so it's centered on X/Z and sitting on the grid (Y=0)
  group.position.set(-center.x, 0, -center.z);

  // Return the group with all elements separate (not merged)
  // This allows individual selection and deletion
  return group;
}

/**
 * Create the main cutter body from a shape (hollow walls only)
 */
function createCutterBody(
  shape: THREE.Shape,
  params: CookieCutterParams
): THREE.Mesh {
  // Get the outline points
  const points = shape.getPoints();

  // Create the wall geometry using a tube/path approach
  const wallGeometry = createHollowWallGeometry(points, params);

  // Create material
  const material = new THREE.MeshStandardMaterial({
    color: 0xffa726,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(wallGeometry, material);
  return mesh;
}

/**
 * Create hollow wall geometry (just the walls, no top/bottom)
 */
function createHollowWallGeometry(
  points: THREE.Vector2[],
  params: CookieCutterParams
): THREE.BufferGeometry {
  // Validate input
  if (!points || points.length < 3) {
    throw new Error('Need at least 3 points to create geometry');
  }

  const vertices: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];

  const wallThickness = params.wallThickness;
  const height = params.cuttingHeight;
  const numPoints = points.length;

  // For each point, create inner and outer vertices
  for (let i = 0; i < numPoints; i++) {
    const p = points[i];
    const pNext = points[(i + 1) % numPoints];
    const pPrev = points[(i - 1 + numPoints) % numPoints];

    // Calculate normal direction (perpendicular to the edge)
    const dx = pNext.x - pPrev.x;
    const dy = pNext.y - pPrev.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    // Avoid division by zero - if points are too close, use default normal
    let nx, ny;
    if (len < 0.0001) {
      nx = 0;
      ny = 1;
    } else {
      // Normal pointing outward (perpendicular)
      nx = -dy / len;
      ny = dx / len;
    }

    // Outer point (outward by half wall thickness)
    const outerX = p.x + nx * wallThickness / 2;
    const outerY = p.y + ny * wallThickness / 2;

    // Inner point (inward by half wall thickness)
    const innerX = p.x - nx * wallThickness / 2;
    const innerY = p.y - ny * wallThickness / 2;

    // Create vertices at bottom (y=0) and top (y=height)
    // Bottom outer
    vertices.push(outerX * params.scale, 0, outerY * params.scale);
    // Top outer
    vertices.push(outerX * params.scale, height, outerY * params.scale);
    // Bottom inner
    vertices.push(innerX * params.scale, 0, innerY * params.scale);
    // Top inner
    vertices.push(innerX * params.scale, height, innerY * params.scale);

    // Normals (will be recalculated)
    for (let j = 0; j < 4; j++) {
      normals.push(0, 1, 0);
    }
  }

  // Create faces
  for (let i = 0; i < numPoints; i++) {
    const i0 = i * 4;
    const i1 = ((i + 1) % numPoints) * 4;

    // Outer wall (2 triangles)
    indices.push(i0, i0 + 1, i1);
    indices.push(i1, i0 + 1, i1 + 1);

    // Inner wall (2 triangles)
    indices.push(i0 + 2, i1 + 2, i0 + 3);
    indices.push(i1 + 2, i1 + 3, i0 + 3);

    // Top rim (connecting outer and inner at top)
    indices.push(i0 + 1, i0 + 3, i1 + 1);
    indices.push(i1 + 1, i0 + 3, i1 + 3);

    // Bottom cutting edge (connecting outer and inner at bottom)
    indices.push(i0, i1, i0 + 2);
    indices.push(i1, i1 + 2, i0 + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Calculate taper offset based on angle
 */
function calcTaperOffset(params: CookieCutterParams): number {
  const angleRad = (params.taperAngle * Math.PI) / 180;
  return Math.tan(angleRad) * params.cuttingHeight;
}

/**
 * Create a handle for the cookie cutter
 */
function createHandle(
  shape: THREE.Shape,
  params: CookieCutterParams
): THREE.Mesh | null {
  let handleGeometry: THREE.BufferGeometry;

  switch (params.handleStyle) {
    case 'round':
      handleGeometry = new THREE.CylinderGeometry(
        3,
        4,
        params.handleHeight,
        16
      );
      break;

    case 'chamfered':
      handleGeometry = new THREE.CylinderGeometry(
        2,
        4,
        params.handleHeight,
        4
      );
      break;

    case 'rectangular':
      handleGeometry = new THREE.BoxGeometry(
        8,
        params.handleHeight,
        8
      );
      break;

    case 'flat':
      // Flat top lip
      const flatShape = new THREE.Shape();
      flatShape.moveTo(-5, -5);
      flatShape.lineTo(5, -5);
      flatShape.lineTo(5, 5);
      flatShape.lineTo(-5, 5);
      flatShape.lineTo(-5, -5);

      handleGeometry = new THREE.ExtrudeGeometry(flatShape, {
        depth: 3,
        bevelEnabled: true,
        bevelThickness: 0.5,
        bevelSize: 0.5,
        bevelSegments: 2,
      });
      break;

    default:
      return null;
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0xffa726,
    roughness: 0.5,
    metalness: 0.1,
  });

  const handle = new THREE.Mesh(handleGeometry, material);

  // Position handle at center (0,0) and on top of the cutter
  // Since the cutter is now centered at 0,0 and sits at Y=0,
  // the handle should be at Y = cuttingHeight + handleHeight/2
  handle.position.set(
    0,
    params.cuttingHeight + params.handleHeight / 2,
    0
  );

  return handle;
}

/**
 * Merge multiple meshes in a group into a single mesh
 */
function mergeGroupMeshes(group: THREE.Group): THREE.Mesh {
  const geometries: THREE.BufferGeometry[] = [];

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geometry = child.geometry.clone();
      child.updateWorldMatrix(true, false);
      geometry.applyMatrix4(child.matrixWorld);
      geometries.push(geometry);
    }
  });

  // Merge geometries
  const mergedGeometry = mergeGeometries(geometries);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffa726,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(mergedGeometry, material);
}

/**
 * Merge multiple geometries into one
 */
function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const mergedGeometry = new THREE.BufferGeometry();

  let totalVertices = 0;
  let totalIndices = 0;

  // Calculate total sizes
  for (const geometry of geometries) {
    totalVertices += geometry.attributes.position.count;
    if (geometry.index) {
      totalIndices += geometry.index.count;
    } else {
      totalIndices += geometry.attributes.position.count;
    }
  }

  // Create arrays
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalIndices);

  let vertexOffset = 0;
  let indexOffset = 0;
  let vertexBase = 0;

  // Merge data
  for (const geometry of geometries) {
    const posAttr = geometry.attributes.position;
    const normAttr = geometry.attributes.normal;

    // Copy positions
    positions.set(posAttr.array as Float32Array, vertexOffset * 3);

    // Copy normals
    if (normAttr) {
      normals.set(normAttr.array as Float32Array, vertexOffset * 3);
    }

    // Copy indices
    if (geometry.index) {
      const indexArray = geometry.index.array;
      for (let i = 0; i < indexArray.length; i++) {
        indices[indexOffset + i] = indexArray[i] + vertexBase;
      }
      indexOffset += indexArray.length;
    } else {
      // Non-indexed geometry
      for (let i = 0; i < posAttr.count; i++) {
        indices[indexOffset + i] = vertexBase + i;
      }
      indexOffset += posAttr.count;
    }

    vertexBase += posAttr.count;
    vertexOffset += posAttr.count;
  }

  // Set attributes
  mergedGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  mergedGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

  // Compute normals if needed
  mergedGeometry.computeVertexNormals();

  return mergedGeometry;
}

/**
 * Create a simple cookie cutter from a circle (for testing)
 */
export function createTestCookieCutter(params: CookieCutterParams): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 20, 0, Math.PI * 2, false);

  const mesh = createCutterBody(shape, params);

  // Apply rotation and positioning like in generateCookieCutter
  mesh.rotation.x = Math.PI / 2;

  // Position so cutting edge is at y=0
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  mesh.position.set(-center.x, -box.min.y, -center.z);

  // Update matrix after transformations
  mesh.updateMatrix();
  mesh.geometry.applyMatrix4(mesh.matrix);
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();

  return mesh;
}
