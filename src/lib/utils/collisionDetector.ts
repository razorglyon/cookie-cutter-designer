import * as THREE from 'three';

export interface CollisionResult {
  hasCollisions: boolean;
  collisions: CollisionPair[];
  warnings: string[];
}

export interface CollisionPair {
  object1: string;
  object2: string;
  distance: number;
  overlap: number;
}

export interface BoundingBox {
  name: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
  center: THREE.Vector3;
  size: THREE.Vector3;
}

/**
 * Detect collisions between objects in a scene
 */
export function detectCollisions(
  objects: THREE.Object3D[],
  minSeparation: number = 2
): CollisionResult {
  const warnings: string[] = [];
  const collisions: CollisionPair[] = [];

  if (objects.length < 2) {
    return { hasCollisions: false, collisions, warnings };
  }

  // Get bounding boxes for all objects
  const boundingBoxes = objects.map(obj => calculateBoundingBox(obj));

  // Check each pair of objects
  for (let i = 0; i < boundingBoxes.length; i++) {
    for (let j = i + 1; j < boundingBoxes.length; j++) {
      const box1 = boundingBoxes[i];
      const box2 = boundingBoxes[j];

      const collision = checkBoxCollision(box1, box2, minSeparation);
      if (collision) {
        collisions.push(collision);
      }
    }
  }

  // Generate warnings
  if (collisions.length > 0) {
    warnings.push(`Found ${collisions.length} collision(s) between objects`);
    collisions.forEach(c => {
      if (c.overlap > 0) {
        warnings.push(`${c.object1} and ${c.object2} overlap by ${c.overlap.toFixed(2)}mm`);
      } else {
        warnings.push(`${c.object1} and ${c.object2} are too close (${c.distance.toFixed(2)}mm separation)`);
      }
    });
  }

  return {
    hasCollisions: collisions.length > 0,
    collisions,
    warnings
  };
}

/**
 * Calculate bounding box for an object
 */
function calculateBoundingBox(object: THREE.Object3D): BoundingBox {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  return {
    name: object.name || 'Unnamed',
    min: box.min,
    max: box.max,
    center,
    size
  };
}

/**
 * Check if two bounding boxes collide (AABB collision detection)
 */
function checkBoxCollision(
  box1: BoundingBox,
  box2: BoundingBox,
  minSeparation: number
): CollisionPair | null {
  // Check for overlap on all axes (2D check on XZ plane for build plate)
  const overlapX = checkAxisOverlap(
    box1.min.x,
    box1.max.x,
    box2.min.x,
    box2.max.x
  );
  const overlapZ = checkAxisOverlap(
    box1.min.z,
    box1.max.z,
    box2.min.z,
    box2.max.z
  );

  if (overlapX && overlapZ) {
    // Boxes are overlapping
    const overlapAmount = Math.min(
      Math.abs(overlapX),
      Math.abs(overlapZ)
    );

    return {
      object1: box1.name,
      object2: box2.name,
      distance: 0,
      overlap: overlapAmount
    };
  }

  // Check if boxes are too close (within minSeparation)
  const distance = calculateDistance2D(box1.center, box2.center);
  const requiredDistance = (box1.size.x + box2.size.x) / 2 + minSeparation;

  if (distance < requiredDistance) {
    return {
      object1: box1.name,
      object2: box2.name,
      distance: distance - ((box1.size.x + box2.size.x) / 2),
      overlap: 0
    };
  }

  return null;
}

/**
 * Check overlap on a single axis
 */
function checkAxisOverlap(
  min1: number,
  max1: number,
  min2: number,
  max2: number
): number | null {
  // Check if ranges overlap
  if (max1 < min2 || max2 < min1) {
    return null; // No overlap
  }

  // Calculate overlap amount
  const overlap1 = max1 - min2;
  const overlap2 = max2 - min1;

  return Math.min(overlap1, overlap2);
}

/**
 * Calculate 2D distance between centers (ignoring Y axis)
 */
function calculateDistance2D(p1: THREE.Vector3, p2: THREE.Vector3): number {
  const dx = p1.x - p2.x;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Check if object is within build plate bounds
 */
export function checkBuildPlateBounds(
  object: THREE.Object3D,
  buildPlateSize: number
): { inBounds: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const box = new THREE.Box3().setFromObject(object);
  const halfSize = buildPlateSize / 2;

  let inBounds = true;

  if (box.min.x < -halfSize) {
    warnings.push(`Object extends ${Math.abs(box.min.x + halfSize).toFixed(1)}mm beyond left edge`);
    inBounds = false;
  }
  if (box.max.x > halfSize) {
    warnings.push(`Object extends ${(box.max.x - halfSize).toFixed(1)}mm beyond right edge`);
    inBounds = false;
  }
  if (box.min.z < -halfSize) {
    warnings.push(`Object extends ${Math.abs(box.min.z + halfSize).toFixed(1)}mm beyond front edge`);
    inBounds = false;
  }
  if (box.max.z > halfSize) {
    warnings.push(`Object extends ${(box.max.z - halfSize).toFixed(1)}mm beyond back edge`);
    inBounds = false;
  }

  return { inBounds, warnings };
}

/**
 * Get suggested positions to resolve collisions
 */
export function getSuggestedPositions(
  objects: THREE.Object3D[],
  buildPlateSize: number,
  spacing: number = 5
): Map<string, THREE.Vector3> {
  const suggestions = new Map<string, THREE.Vector3>();

  if (objects.length === 0) return suggestions;

  // Simple grid layout suggestion
  const columns = Math.ceil(Math.sqrt(objects.length));
  const rows = Math.ceil(objects.length / columns);

  const cellWidth = buildPlateSize / columns;
  const cellHeight = buildPlateSize / rows;

  objects.forEach((obj, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;

    const x = (col - (columns - 1) / 2) * cellWidth;
    const z = (row - (rows - 1) / 2) * cellHeight;

    suggestions.set(obj.name, new THREE.Vector3(x, obj.position.y, z));
  });

  return suggestions;
}

/**
 * Auto-fix collisions by repositioning objects
 */
export function autoFixCollisions(
  group: THREE.Group,
  buildPlateSize: number,
  spacing: number = 5
): { fixed: boolean; movedObjects: string[] } {
  const objects: THREE.Object3D[] = [];
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child !== group) {
      objects.push(child);
    }
  });

  const suggestions = getSuggestedPositions(objects, buildPlateSize, spacing);
  const movedObjects: string[] = [];

  objects.forEach(obj => {
    const newPos = suggestions.get(obj.name);
    if (newPos) {
      obj.position.set(newPos.x, newPos.y, newPos.z);
      movedObjects.push(obj.name);
    }
  });

  return {
    fixed: movedObjects.length > 0,
    movedObjects
  };
}

/**
 * Visualize collision zones (returns debug geometry)
 */
export function createCollisionVisualization(
  collisions: CollisionPair[],
  objects: THREE.Object3D[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'collision-visualization';

  collisions.forEach(collision => {
    const obj1 = objects.find(o => o.name === collision.object1);
    const obj2 = objects.find(o => o.name === collision.object2);

    if (obj1 && obj2) {
      // Create line connecting colliding objects
      const points = [obj1.position, obj2.position];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0xff0000,
        linewidth: 2
      });
      const line = new THREE.Line(geometry, material);
      group.add(line);

      // Add warning marker at midpoint
      const midpoint = new THREE.Vector3()
        .addVectors(obj1.position, obj2.position)
        .multiplyScalar(0.5);

      const markerGeometry = new THREE.SphereGeometry(2, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.7
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(midpoint);
      group.add(marker);
    }
  });

  return group;
}
