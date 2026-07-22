import * as THREE from 'three';

const METADATA_KEY = 'wallThicknessByTriangle';

export interface WallThicknessRange {
  readonly min: number;
  readonly max: number;
}

export function setTriangleWallThicknesses(
  geometry: THREE.BufferGeometry,
  values: ReadonlyArray<number>
): void {
  const triangleCount = (geometry.getIndex()?.count ?? 0) / 3;
  if (
    !Number.isInteger(triangleCount) ||
    triangleCount <= 0 ||
    values.length !== triangleCount ||
    values.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new Error('Wall-thickness metadata must contain one positive value per triangle.');
  }

  geometry.userData[METADATA_KEY] = Object.freeze([...values]);
}

export function getTriangleWallThicknesses(
  geometry: THREE.BufferGeometry
): readonly number[] | null {
  const values = geometry.userData[METADATA_KEY];
  if (!Array.isArray(values)) return null;

  const triangleCount = (geometry.getIndex()?.count ?? 0) / 3;
  if (
    !Number.isInteger(triangleCount) ||
    values.length !== triangleCount ||
    values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
  ) {
    return null;
  }

  return values as readonly number[];
}

export function measureWallThicknessRange(
  values: ReadonlyArray<number>
): WallThicknessRange {
  if (values.length === 0) {
    throw new Error('Cannot measure an empty wall-thickness collection.');
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Wall-thickness values must be positive and finite.');
    }
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  return Object.freeze({ min, max });
}

const THIN_COLOR = new THREE.Color('#2563eb');
const TARGET_COLOR = new THREE.Color('#22c55e');
const THICK_COLOR = new THREE.Color('#f97316');
const CAP_COLOR = new THREE.Color('#64748b');
const HORIZONTAL_FACE_THRESHOLD = 0.75;

export function wallThicknessColor(
  thickness: number,
  targetThickness: number,
  maximumThickness = targetThickness * 2,
  result = new THREE.Color()
): THREE.Color {
  if (!Number.isFinite(thickness) || thickness <= 0) {
    throw new Error('Wall thickness must be positive and finite.');
  }
  if (!Number.isFinite(targetThickness) || targetThickness <= 0) {
    throw new Error('Target wall thickness must be positive and finite.');
  }
  if (!Number.isFinite(maximumThickness) || maximumThickness < targetThickness) {
    throw new Error('Maximum wall thickness must be finite and at least the target.');
  }

  if (thickness <= targetThickness) {
    const thinThreshold = targetThickness * 0.5;
    const ratio = THREE.MathUtils.clamp(
      (thickness - thinThreshold) / (targetThickness - thinThreshold),
      0,
      1
    );
    return result.copy(THIN_COLOR).lerp(TARGET_COLOR, ratio);
  }

  const span = maximumThickness - targetThickness;
  const ratio = span <= Number.EPSILON
    ? 0
    : THREE.MathUtils.clamp((thickness - targetThickness) / span, 0, 1);
  return result.copy(TARGET_COLOR).lerp(THICK_COLOR, ratio);
}

function isHorizontalTriangle(
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  triangle: number
): boolean {
  const offset = triangle * 3;
  const first = new THREE.Vector3().fromBufferAttribute(positions, offset);
  const second = new THREE.Vector3().fromBufferAttribute(positions, offset + 1);
  const third = new THREE.Vector3().fromBufferAttribute(positions, offset + 2);
  const normal = new THREE.Vector3().crossVectors(
    second.sub(first),
    third.sub(first)
  );
  const length = normal.length();
  return length > Number.EPSILON && Math.abs(normal.y / length) >= HORIZONTAL_FACE_THRESHOLD;
}

function positionKey(
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number
): string {
  return `${positions.getX(index).toFixed(6)}:${positions.getY(index).toFixed(6)}:${positions.getZ(index).toFixed(6)}`;
}

export function createWallThicknessColorAttribute(
  triangleThicknesses: ReadonlyArray<number>,
  targetThickness: number,
  maximumThickness = targetThickness * 2,
  positions?: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
): THREE.Float32BufferAttribute {
  if (positions && positions.count !== triangleThicknesses.length * 3) {
    throw new Error('Non-indexed positions must contain three vertices per thickness value.');
  }
  const colors = new Float32Array(triangleThicknesses.length * 9);
  const color = new THREE.Color();
  const horizontalTriangles = triangleThicknesses.map((_, triangle) =>
    positions ? isHorizontalTriangle(positions, triangle) : false
  );
  const measurementsByPosition = new Map<string, { sum: number; count: number }>();

  if (positions) {
    for (let triangle = 0; triangle < triangleThicknesses.length; triangle += 1) {
      if (horizontalTriangles[triangle]) continue;
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const key = positionKey(positions, triangle * 3 + vertex);
        const current = measurementsByPosition.get(key) ?? { sum: 0, count: 0 };
        current.sum += triangleThicknesses[triangle];
        current.count += 1;
        measurementsByPosition.set(key, current);
      }
    }
  }

  for (let triangle = 0; triangle < triangleThicknesses.length; triangle += 1) {
    for (let vertex = 0; vertex < 3; vertex += 1) {
      if (horizontalTriangles[triangle]) {
        color.copy(CAP_COLOR);
      } else {
        const measurement = positions
          ? measurementsByPosition.get(positionKey(positions, triangle * 3 + vertex))
          : null;
        const thickness = measurement
          ? measurement.sum / measurement.count
          : triangleThicknesses[triangle];
        wallThicknessColor(thickness, targetThickness, maximumThickness, color);
      }
      const offset = triangle * 9 + vertex * 3;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
  }

  return new THREE.Float32BufferAttribute(colors, 3);
}
