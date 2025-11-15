import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { CookieCutterParams } from '../types/CookieCutter';

/**
 * Generate a stamp (raised relief) instead of a cutter
 */
export async function generateStamp(
  svgString: string,
  params: CookieCutterParams
): Promise<THREE.Group> {
  const loader = new SVGLoader();
  const svgData = loader.parse(svgString);

  if (!svgData.paths || svgData.paths.length === 0) {
    throw new Error('No paths found in SVG');
  }

  const group = new THREE.Group();
  group.name = 'cookieCutter';

  // Create base plate if enabled
  if (params.stampBase) {
    const basePlate = createBasePlate(svgData.paths, params);
    basePlate.name = 'stamp-base';
    group.add(basePlate);
  }

  // Process each path to create raised relief
  let shapeIndex = 0;
  for (const path of svgData.paths) {
    const shapes = SVGLoader.createShapes(path);

    for (const shape of shapes) {
      const reliefMesh = createRaisedRelief(shape, params);
      reliefMesh.name = `stamp-relief-${shapeIndex}`;
      group.add(reliefMesh);

      // Add handle if enabled
      if (params.handleStyle !== 'none' && params.enableHandle) {
        const handle = createStampHandle(params);
        if (handle) {
          handle.name = `handle-${shapeIndex}`;
          group.add(handle);
        }
      }

      shapeIndex++;
    }
  }

  // Auto-scale to fit within build plate
  const buildPlateSize = params.buildPlateSize || 200;
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDimension = Math.max(size.x, size.z);

  if (maxDimension > buildPlateSize * 0.8) {
    const autoScale = (buildPlateSize * 0.8) / maxDimension;
    group.scale.set(autoScale, autoScale, autoScale);

    box.setFromObject(group);
    center.copy(box.getCenter(new THREE.Vector3()));
  }

  // Position centered
  group.position.set(-center.x, 0, -center.z);

  return group;
}

/**
 * Create base plate for the stamp
 */
function createBasePlate(
  paths: any[],
  params: CookieCutterParams
): THREE.Mesh {
  // Calculate bounding box of all paths
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const path of paths) {
    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      const points = shape.getPoints();
      for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
  }

  // Add padding
  const padding = 10;
  const width = (maxX - minX + padding * 2) * params.scale;
  const height = (maxY - minY + padding * 2) * params.scale;

  const geometry = new THREE.BoxGeometry(width, 5, height);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffa726,
    roughness: 0.5,
    metalness: 0.1,
  });

  const basePlate = new THREE.Mesh(geometry, material);
  basePlate.position.y = 2.5; // Half of height

  return basePlate;
}

/**
 * Create raised relief from shape
 */
function createRaisedRelief(
  shape: THREE.Shape,
  params: CookieCutterParams
): THREE.Mesh {
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: params.stampDepth,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.5,
    bevelSegments: 3,
    curveSegments: 24,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Rotate to lie flat
  geometry.rotateX(-Math.PI / 2);

  // Scale
  if (params.scale !== 1.0) {
    geometry.scale(params.scale, params.scale, params.scale);
  }

  // Position on top of base (5mm base + depth)
  geometry.translate(0, 5 + params.stampDepth, 0);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffb74d,
    roughness: 0.5,
    metalness: 0.1,
  });

  return new THREE.Mesh(geometry, material);
}

/**
 * Create handle for stamp (on back/top)
 */
function createStampHandle(params: CookieCutterParams): THREE.Mesh | null {
  let handleGeometry: THREE.BufferGeometry;

  switch (params.handleStyle) {
    case 'round':
      handleGeometry = new THREE.CylinderGeometry(
        8,
        10,
        params.handleHeight,
        16
      );
      break;

    case 'chamfered':
      handleGeometry = new THREE.CylinderGeometry(
        6,
        10,
        params.handleHeight,
        8
      );
      break;

    case 'rectangular':
      handleGeometry = new THREE.BoxGeometry(
        20,
        params.handleHeight,
        20
      );
      break;

    case 'flat':
      const flatShape = new THREE.Shape();
      flatShape.moveTo(-10, -10);
      flatShape.lineTo(10, -10);
      flatShape.lineTo(10, 10);
      flatShape.lineTo(-10, 10);
      flatShape.lineTo(-10, -10);

      handleGeometry = new THREE.ExtrudeGeometry(flatShape, {
        depth: 5,
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 1,
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

  // Position handle on top of stamp
  const totalHeight = 5 + params.stampDepth; // base + relief
  handle.position.set(
    0,
    totalHeight + params.handleHeight / 2,
    0
  );

  return handle;
}
