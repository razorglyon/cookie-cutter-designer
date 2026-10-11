import type { Bridge, DesignDocument } from '../domain/designDocument';
import type { DesignSessionStore } from '../stores/designSessionStore';
import { snapToContour, createConnectedRegions } from '../geometry/connectors';
import { extractClosedContours, type NormalizedPoint } from '../utils/contourExtraction';
import { generateCookieCutter, sourceDimension } from '../utils/cookieCutterGenerator';
import { CutterGenerationError } from '../utils/generationValidation';
import { validatePrintableObject } from '../utils/geometryValidation';
import { disposeObject3D } from '../utils/disposeThree';

/** Snap only close clicks, never silently attach an arbitrary point to a distant loop. */
export function snapBridgeEndpoint(svg: string, point: NormalizedPoint): NormalizedPoint {
  const contours = extractClosedContours(svg);
  const snapped = snapToContour(point, contours);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const contour of contours) for (const sample of contour) {
    minX = Math.min(minX, sample.x); maxX = Math.max(maxX, sample.x);
    minY = Math.min(minY, sample.y); maxY = Math.max(maxY, sample.y);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (Math.hypot(point.x - snapped.x, point.y - snapped.y) > span * 0.05) {
    throw new Error('Clique près d’un contour pour placer l’extrémité du pont.');
  }
  return snapped;
}

/** Preflight on the exact snapshot; async generation must not publish to a newer session. */
export async function commitBridgeEdit(
  session: DesignSessionStore,
  baseline: DesignDocument,
  epoch: number,
  bridges: readonly Bridge[],
  active: () => boolean = () => true,
  onIncomplete?: () => void
): Promise<boolean> {
  if (!active() || (baseline.kind !== 'cutter' && baseline.kind !== 'multi-cutter') || session.getSessionEpoch() !== epoch || session.getDocument() !== baseline) return false;
  const previous = baseline.schemaVersion !== 1 ? baseline.bridges : [];
  if (JSON.stringify(previous) === JSON.stringify(bridges)) return false;
  let incomplete = false;
  if (bridges.length > 0) {
    try {
      const result = await generateCookieCutter(baseline.sketch.svg, baseline.parameters, bridges);
      try {
        const report = validatePrintableObject(result, { requireSingleShell: true });
        if (!report.valid) throw new Error(`Pont non imprimable : ${report.errors.join('; ')}`);
      } finally { disposeObject3D(result); }
    } catch (cause) {
      if (!(cause instanceof CutterGenerationError) || cause.details?.reason !== 'disconnected-islands') throw cause;
      if (!active() || session.getSessionEpoch() !== epoch || session.getDocument() !== baseline) return false;
      // A first bridge in a chain is a draft, not a printable model. Validate
      // both physical layers and every bridge before storing it; generation
      // keeps the STL disabled until the final connector closes the layout.
      const contours = extractClosedContours(baseline.sketch.svg);
      const parameters = baseline.parameters;
      const scale = parameters.targetSize / sourceDimension(contours, parameters.sizeMode);
      const taper = Math.tan(parameters.taperAngle * Math.PI / 180) * parameters.cuttingHeight;
      const regions = await Promise.all([
        createConnectedRegions(contours, bridges, scale, parameters.wallThickness, 0, { allowDisconnected: true }),
        createConnectedRegions(contours, bridges, scale, parameters.wallThickness + 2 * taper, 2 * taper, { allowDisconnected: true })
      ]);
      if (regions.every(layer => layer.length === 1)) throw cause;
      incomplete = true;
    }
  }
  if (!active() || session.getSessionEpoch() !== epoch || session.getDocument() !== baseline) return false;
  session.updateBridges(bridges);
  if (incomplete) onIncomplete?.();
  return true;
}
