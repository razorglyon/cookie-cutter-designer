import type { Bridge } from '../domain/designDocument';
import { BRIDGE_LIMITS } from '../domain/documentValidation';
import type { NormalizedContour, NormalizedPoint } from '../utils/contourExtraction';
import { signedArea } from '../utils/contourExtraction';
import { CutterGenerationError } from '../utils/generationValidation';
import { differencePaths, offsetPath, unionPaths } from '../utils/pathOperations';

export interface ConnectedRegion {
  readonly outer: NormalizedContour;
  readonly holes: readonly NormalizedContour[];
}
function invalid(message: string): never {
  throw new CutterGenerationError('INVALID_GEOMETRY', message, { field: 'bridges' });
}
function closestPoint(point: NormalizedPoint, contour: NormalizedContour): { point: NormalizedPoint; distance: number } {
  let result = { point: contour[0], distance: Infinity };
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    const candidate = { x: a.x + dx * t, y: a.y + dy * t };
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (distance < result.distance) result = { point: candidate, distance };
  }
  return result;
}
/** Returns the nearest centreline endpoint for pointer/keyboard placement. */
export function snapToContour(point: NormalizedPoint, contours: readonly NormalizedContour[]): NormalizedPoint {
  if (!contours.length || !Number.isFinite(point.x) || !Number.isFinite(point.y)) invalid('No valid contour to snap to.');
  return contours.map(contour => closestPoint(point, contour)).sort((a, b) => a.distance - b.distance)[0].point;
}
function orientation(a: NormalizedPoint, b: NormalizedPoint, c: NormalizedPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function segmentsCross(a: Bridge, b: Bridge): boolean {
  const a1 = orientation(a.from, a.to, b.from);
  const a2 = orientation(a.from, a.to, b.to);
  const b1 = orientation(b.from, b.to, a.from);
  const b2 = orientation(b.from, b.to, a.to);
  if (a1 * a2 < 0 && b1 * b2 < 0) return true;

  // Proper crossings miss a coincident/collinear bridge (including reversed
  // endpoints). Keep a shared endpoint legal: nested islands can meet there.
  const length = Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
  const alignmentTolerance = 1e-6;
  if (Math.abs(a1) / length > alignmentTolerance || Math.abs(a2) / length > alignmentTolerance) return false;
  const axis = Math.abs(a.to.x - a.from.x) >= Math.abs(a.to.y - a.from.y) ? 'x' : 'y';
  const start = Math.min(a.from[axis], a.to[axis]);
  const end = Math.max(a.from[axis], a.to[axis]);
  return Math.min(end, Math.max(b.from[axis], b.to[axis]))
    - Math.max(start, Math.min(b.from[axis], b.to[axis])) > alignmentTolerance;
}
/** Require a bridge to touch two distinct centreline loops; never guess a detached connection. */
export function validateConnectorLayout(contours: readonly NormalizedContour[], bridges: readonly Bridge[], scale: number, wallWidthMm: number): void {
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(wallWidthMm) || wallWidthMm <= 0) invalid('Invalid physical scale or wall width.');
  if (bridges.length > BRIDGE_LIMITS.maxCount) invalid('Too many bridges.');
  const names = new Set<string>();
  const tolerance = Math.max(0.001, Math.min(wallWidthMm, 1) / scale);
  for (const bridge of bridges) {
    if (typeof bridge.id !== 'string' || !bridge.id.trim() || names.has(bridge.id)
      || !Number.isFinite(bridge.widthMm) || bridge.widthMm < BRIDGE_LIMITS.minWidthMm || bridge.widthMm > BRIDGE_LIMITS.maxWidthMm
      || ![bridge.from.x, bridge.from.y, bridge.to.x, bridge.to.y].every(n => Number.isFinite(n) && Math.abs(n) <= BRIDGE_LIMITS.maxCoordinate)) invalid('Invalid bridge parameters.');
    names.add(bridge.id);
    if (Math.hypot(bridge.from.x - bridge.to.x, bridge.from.y - bridge.to.y) * scale < bridge.widthMm * 1.5) invalid('Bridge is too short for its width.');
    const first = contours.map((contour, i) => ({ i, distance: closestPoint(bridge.from, contour).distance })).sort((a, b) => a.distance - b.distance)[0];
    const second = contours.map((contour, i) => ({ i, distance: closestPoint(bridge.to, contour).distance })).sort((a, b) => a.distance - b.distance)[0];
    if (!first || !second || first.i === second.i || first.distance > tolerance || second.distance > tolerance) invalid('Bridge ends must touch two distinct contour centrelines.');
  }
  for (let i = 0; i < bridges.length; i++) for (let j = i + 1; j < bridges.length; j++) {
    if (segmentsCross(bridges[i], bridges[j])) invalid('Bridge centreline segments intersect.');
  }
}
function inside(point: NormalizedPoint, polygon: NormalizedContour): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
function classify(loops: readonly NormalizedContour[]): readonly ConnectedRegion[] {
  const sorted = [...loops].sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const regions: { outer: NormalizedContour; holes: NormalizedContour[] }[] = [];
  for (const loop of sorted) {
    const parents = sorted.filter(other => Math.abs(signedArea(other)) > Math.abs(signedArea(loop)) && inside(loop[0], other));
    if (parents.length % 2 === 0) regions.push({ outer: loop, holes: [] });
    else {
      const nearest = parents.sort((a, b) => Math.abs(signedArea(a)) - Math.abs(signedArea(b)))[0];
      const owner = regions.find(region => region.outer === nearest);
      if (!owner) invalid('Nested island topology is not supported.');
      owner.holes.push(loop);
    }
  }
  return regions;
}
function ribbon(bridge: Bridge, scale: number, widthMm: number): NormalizedContour {
  const dx = bridge.to.x - bridge.from.x, dy = bridge.to.y - bridge.from.y;
  const length = Math.hypot(dx, dy);
  const half = widthMm / scale / 2;
  const px = -dy / length * half, py = dx / length * half;
  return [
    { x: bridge.from.x - px, y: bridge.from.y - py },
    { x: bridge.to.x - px, y: bridge.to.y - py },
    { x: bridge.to.x + px, y: bridge.to.y + py },
    { x: bridge.from.x + px, y: bridge.from.y + py }
  ];
}
/** Boolean-union the physical wall footprints before triangulation; preserve holes. */
export async function createConnectedRegions(
  contours: readonly NormalizedContour[],
  bridges: readonly Bridge[],
  scale: number,
  wallWidthMm: number,
  bridgeGrowthMm = 0,
  options: Readonly<{ allowDisconnected?: boolean }> = {}
): Promise<readonly ConnectedRegion[]> {
  validateConnectorLayout(contours, bridges, scale, wallWidthMm);
  const bands: NormalizedContour[] = [];
  for (const contour of contours) {
    const scaled = contour.map(point => ({ x: point.x * scale, y: point.y * scale }));
    const outer = await offsetPath(scaled, wallWidthMm / 2, 'miter');
    const inner = await offsetPath(scaled, -wallWidthMm / 2, 'miter');
    if (!outer.length || !inner.length) invalid('Wall offset collapses a contour.');
    const band = await differencePaths(outer, inner);
    for (const part of band) bands.push(part);
  }
  const merged = await unionPaths([
    ...bands,
    ...bridges.map(bridge => ribbon(bridge, scale, bridge.widthMm + bridgeGrowthMm).map(point => ({ x: point.x * scale, y: point.y * scale })))
  ]);
  const regions = classify(merged);
  if (regions.length === 0) invalid('No printable wall regions remain.');
  if (regions.length !== 1 && !options.allowDisconnected) {
    throw new CutterGenerationError('INVALID_GEOMETRY', 'One or more cutter islands remain disconnected.', {
      field: 'bridges', reason: 'disconnected-islands'
    });
  }
  return regions;
}
