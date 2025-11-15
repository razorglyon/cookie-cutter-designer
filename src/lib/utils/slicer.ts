import * as THREE from 'three';
import type { Mesh, Group } from 'three';

export interface SliceLayer {
  z: number;
  contours: THREE.Vector2[][];
  geometry: THREE.BufferGeometry;
}

export interface SlicingOptions {
  layerHeight: number; // in mm
  minZ: number;
  maxZ: number;
}

/**
 * Slice a 3D mesh into horizontal layers for print preview
 */
export function sliceMesh(
  object: Mesh | Group,
  options: SlicingOptions
): SliceLayer[] {
  const layers: SliceLayer[] = [];
  const { layerHeight, minZ, maxZ } = options;

  // Calculate number of layers
  const numLayers = Math.ceil((maxZ - minZ) / layerHeight);

  for (let i = 0; i < numLayers; i++) {
    const z = minZ + i * layerHeight;
    const layer = sliceAtHeight(object, z);

    if (layer.contours.length > 0) {
      layers.push(layer);
    }
  }

  return layers;
}

/**
 * Slice the mesh at a specific Z height
 */
function sliceAtHeight(object: Mesh | Group, z: number): SliceLayer {
  const contours: THREE.Vector2[][] = [];
  const lineSegments: THREE.Vector3[] = [];

  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geometry = child.geometry;
      const positionAttribute = geometry.getAttribute('position');

      if (!positionAttribute) return;

      const worldMatrix = child.matrixWorld;
      const index = geometry.index;

      // Get triangles
      const triangleCount = index
        ? index.count / 3
        : positionAttribute.count / 3;

      for (let i = 0; i < triangleCount; i++) {
        const i0 = index ? index.getX(i * 3) : i * 3;
        const i1 = index ? index.getX(i * 3 + 1) : i * 3 + 1;
        const i2 = index ? index.getX(i * 3 + 2) : i * 3 + 2;

        const v0 = new THREE.Vector3(
          positionAttribute.getX(i0),
          positionAttribute.getY(i0),
          positionAttribute.getZ(i0)
        ).applyMatrix4(worldMatrix);

        const v1 = new THREE.Vector3(
          positionAttribute.getX(i1),
          positionAttribute.getY(i1),
          positionAttribute.getZ(i1)
        ).applyMatrix4(worldMatrix);

        const v2 = new THREE.Vector3(
          positionAttribute.getX(i2),
          positionAttribute.getY(i2),
          positionAttribute.getZ(i2)
        ).applyMatrix4(worldMatrix);

        // Check if triangle intersects the Z plane
        const intersection = intersectTriangleWithPlane(v0, v1, v2, z);
        if (intersection) {
          lineSegments.push(...intersection);
        }
      }
    }
  });

  // Convert line segments to contours
  const contourPaths = connectLineSegments(lineSegments);
  contours.push(...contourPaths);

  // Create geometry for this layer
  const geometry = createLayerGeometry(contours, z);

  return { z, contours, geometry };
}

/**
 * Find intersection of a triangle with a horizontal plane at height Z
 */
function intersectTriangleWithPlane(
  v0: THREE.Vector3,
  v1: THREE.Vector3,
  v2: THREE.Vector3,
  z: number
): THREE.Vector3[] | null {
  const vertices = [v0, v1, v2];
  const intersections: THREE.Vector3[] = [];

  // Check each edge of the triangle
  for (let i = 0; i < 3; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % 3];

    // Check if edge crosses the plane
    if ((a.z <= z && b.z >= z) || (a.z >= z && b.z <= z)) {
      if (Math.abs(a.z - b.z) < 0.0001) continue; // Skip if edge is on the plane

      // Linear interpolation to find intersection point
      const t = (z - a.z) / (b.z - a.z);
      const intersection = new THREE.Vector3(
        a.x + t * (b.x - a.x),
        a.y + t * (b.y - a.y),
        z
      );
      intersections.push(intersection);
    }
  }

  // Should have 0 or 2 intersections
  return intersections.length === 2 ? intersections : null;
}

/**
 * Connect line segments into closed contours
 */
function connectLineSegments(segments: THREE.Vector3[]): THREE.Vector2[][] {
  if (segments.length === 0) return [];

  const contours: THREE.Vector2[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < segments.length; i += 2) {
    if (used.has(i)) continue;

    const contour: THREE.Vector2[] = [];
    contour.push(new THREE.Vector2(segments[i].x, segments[i].y));
    contour.push(new THREE.Vector2(segments[i + 1].x, segments[i + 1].y));
    used.add(i);

    // Try to extend the contour
    let extended = true;
    while (extended) {
      extended = false;
      const lastPoint = contour[contour.length - 1];

      for (let j = 0; j < segments.length; j += 2) {
        if (used.has(j)) continue;

        const p0 = new THREE.Vector2(segments[j].x, segments[j].y);
        const p1 = new THREE.Vector2(segments[j + 1].x, segments[j + 1].y);

        const threshold = 0.01;

        if (lastPoint.distanceTo(p0) < threshold) {
          contour.push(p1);
          used.add(j);
          extended = true;
          break;
        } else if (lastPoint.distanceTo(p1) < threshold) {
          contour.push(p0);
          used.add(j);
          extended = true;
          break;
        }
      }
    }

    if (contour.length > 2) {
      contours.push(contour);
    }
  }

  return contours;
}

/**
 * Create line geometry for a layer
 */
function createLayerGeometry(contours: THREE.Vector2[][], z: number): THREE.BufferGeometry {
  const vertices: number[] = [];

  for (const contour of contours) {
    for (let i = 0; i < contour.length; i++) {
      const p0 = contour[i];
      const p1 = contour[(i + 1) % contour.length];

      vertices.push(p0.x, z, p0.y);
      vertices.push(p1.x, z, p1.y);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

  return geometry;
}

/**
 * Calculate optimal layer height based on model height
 */
export function calculateOptimalLayerHeight(modelHeight: number): number {
  // Common layer heights: 0.1mm, 0.15mm, 0.2mm, 0.3mm
  if (modelHeight < 10) return 0.1;
  if (modelHeight < 20) return 0.15;
  if (modelHeight < 50) return 0.2;
  return 0.3;
}

/**
 * Get bounding box of a mesh
 */
export function getMeshBounds(object: Mesh | Group): { minZ: number; maxZ: number } {
  const box = new THREE.Box3();
  box.setFromObject(object);

  return {
    minZ: box.min.y,
    maxZ: box.max.y
  };
}

/**
 * Estimate print time based on layer count and complexity
 */
export function estimateLayerPrintTime(layer: SliceLayer, printSpeed: number = 50): number {
  // Calculate total path length
  let totalLength = 0;
  for (const contour of layer.contours) {
    for (let i = 0; i < contour.length; i++) {
      const p0 = contour[i];
      const p1 = contour[(i + 1) % contour.length];
      totalLength += p0.distanceTo(p1);
    }
  }

  // Time = distance / speed (in mm/s) + overhead
  return (totalLength / printSpeed) + 2; // 2 seconds overhead per layer
}
