import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { Layer } from '../types/Layer';
import type { CookieCutterParams } from '../types/CookieCutter';

/**
 * Generate a multi-layer cookie cutter/stamp
 */
export async function generateMultiLayerModel(
  layers: Layer[],
  params: CookieCutterParams
): Promise<THREE.Mesh> {
  const group = new THREE.Group();

  for (const layer of layers) {
    if (!layer.enabled || !layer.visible) continue;

    const layerMesh = await generateLayerMesh(layer, params);
    if (layerMesh) {
      group.add(layerMesh);
    }
  }

  // Merge all meshes into one
  return mergeMeshes(group);
}

/**
 * Generate mesh for a single layer
 */
async function generateLayerMesh(
  layer: Layer,
  params: CookieCutterParams
): Promise<THREE.Mesh | null> {
  const loader = new SVGLoader();
  const svgData = loader.parse(layer.svgData);

  if (!svgData.paths || svgData.paths.length === 0) {
    return null;
  }

  const shapes: THREE.Shape[] = [];
  for (const path of svgData.paths) {
    const pathShapes = SVGLoader.createShapes(path);
    shapes.push(...pathShapes);
  }

  if (shapes.length === 0) return null;

  let geometry: THREE.BufferGeometry;
  let material: THREE.MeshStandardMaterial;

  switch (layer.type) {
    case 'cutter':
      geometry = createCutterGeometry(shapes[0], params);
      material = new THREE.MeshStandardMaterial({
        color: 0xffa726,
        roughness: 0.5,
        metalness: 0.1,
      });
      break;

    case 'stamp':
      geometry = createStampGeometry(shapes[0], layer.depth, params.scale);
      material = new THREE.MeshStandardMaterial({
        color: 0xffb74d,
        roughness: 0.6,
        metalness: 0.05,
      });
      break;

    case 'emboss':
      geometry = createEmbossGeometry(shapes[0], layer.depth, params.scale);
      material = new THREE.MeshStandardMaterial({
        color: 0xff9800,
        roughness: 0.7,
        metalness: 0.05,
      });
      break;

    default:
      return null;
  }

  const mesh = new THREE.Mesh(geometry, material);

  // Apply layer offset
  mesh.position.y = layer.offset;

  return mesh;
}

/**
 * Create cutter geometry (main cutting shape)
 */
function createCutterGeometry(
  shape: THREE.Shape,
  params: CookieCutterParams
): THREE.BufferGeometry {
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: params.cuttingHeight,
    bevelEnabled: params.taperAngle > 0,
    bevelThickness: params.taperAngle > 0 ? calcTaperOffset(params) : 0,
    bevelSize: params.taperAngle > 0 ? calcTaperOffset(params) : 0,
    bevelSegments: 3,
    curveSegments: 24,
    steps: 1,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  if (params.scale !== 1.0) {
    geometry.scale(params.scale, params.scale, params.scale);
  }

  return geometry;
}

/**
 * Create stamp geometry (raised design)
 */
function createStampGeometry(
  shape: THREE.Shape,
  depth: number,
  scale: number
): THREE.BufferGeometry {
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.5,
    bevelSegments: 2,
    curveSegments: 24,
    steps: 1,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  if (scale !== 1.0) {
    geometry.scale(scale, scale, scale);
  }

  return geometry;
}

/**
 * Create emboss geometry (indented design)
 */
function createEmbossGeometry(
  shape: THREE.Shape,
  depth: number,
  scale: number
): THREE.BufferGeometry {
  // Emboss is like stamp but inverted
  const geometry = createStampGeometry(shape, depth, scale);

  // Invert by scaling Y negatively
  geometry.scale(1, -1, 1);

  return geometry;
}

/**
 * Calculate taper offset
 */
function calcTaperOffset(params: CookieCutterParams): number {
  const angleRad = (params.taperAngle * Math.PI) / 180;
  return Math.tan(angleRad) * params.cuttingHeight;
}

/**
 * Merge multiple meshes into one
 */
function mergeMeshes(group: THREE.Group): THREE.Mesh {
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
  let totalVertices = 0;
  let totalIndices = 0;

  for (const geometry of geometries) {
    totalVertices += geometry.attributes.position.count;
    if (geometry.index) {
      totalIndices += geometry.index.count;
    } else {
      totalIndices += geometry.attributes.position.count;
    }
  }

  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalIndices);

  let vertexOffset = 0;
  let indexOffset = 0;
  let vertexBase = 0;

  for (const geometry of geometries) {
    const posAttr = geometry.attributes.position;
    const normAttr = geometry.attributes.normal;

    positions.set(posAttr.array as Float32Array, vertexOffset * 3);

    if (normAttr) {
      normals.set(normAttr.array as Float32Array, vertexOffset * 3);
    }

    if (geometry.index) {
      const indexArray = geometry.index.array;
      for (let i = 0; i < indexArray.length; i++) {
        indices[indexOffset + i] = indexArray[i] + vertexBase;
      }
      indexOffset += indexArray.length;
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        indices[indexOffset + i] = vertexBase + i;
      }
      indexOffset += posAttr.count;
    }

    vertexBase += posAttr.count;
    vertexOffset += posAttr.count;
  }

  const mergedGeometry = new THREE.BufferGeometry();
  mergedGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  mergedGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
  mergedGeometry.computeVertexNormals();

  // Apply rotation and positioning
  mergedGeometry.rotateX(Math.PI / 2);

  const box = new THREE.Box3().setFromBufferAttribute(
    mergedGeometry.attributes.position as THREE.BufferAttribute
  );
  const center = box.getCenter(new THREE.Vector3());
  mergedGeometry.translate(-center.x, -box.min.y, -center.z);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffa726,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(mergedGeometry, material);
}

/**
 * Export layers separately
 */
export async function exportLayersSeparately(
  layers: Layer[],
  params: CookieCutterParams
): Promise<Map<string, THREE.Mesh>> {
  const meshes = new Map<string, THREE.Mesh>();

  for (const layer of layers) {
    if (!layer.enabled) continue;

    const mesh = await generateLayerMesh(layer, params);
    if (mesh) {
      meshes.set(layer.id, mesh);
    }
  }

  return meshes;
}
