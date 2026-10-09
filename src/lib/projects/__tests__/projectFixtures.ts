import type { DesignDocument, DesignSource } from '../../domain/designDocument';
import { createDefaultCutterParameters, createDefaultStampParameters } from '../../domain/designParameters';

export const INITIAL_SVG = '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>';
export const EDITED_SVG = '<svg viewBox="0 0 10 10"><path d="M1 1h8v8z" /></svg>';
export const CREATED_AT = '2026-10-09T10:00:00.000Z';
export const UPDATED_AT = '2026-10-09T11:00:00.000Z';
export function svgSource(): DesignSource {
  return { type: 'svg', fileName: 'etoile.svg', svg: INITIAL_SVG };
}
export function rasterSource(): DesignSource {
  return { type: 'raster', fileName: 'etoile.png', mimeType: 'image/png', vectorizedSvg: INITIAL_SVG };
}
export function projectDocument(kind: 'cutter' | 'stamp' = 'cutter'): DesignDocument {
  const base = {
    schemaVersion: 1 as const, id: `project-${kind}`, name: 'Étoile',
    source: svgSource(), sketch: { svg: EDITED_SVG, revision: 2 },
    viewport: { showGrid: true, showAxes: false, showWallThickness: true },
    createdAt: CREATED_AT, updatedAt: UPDATED_AT
  };
  return kind === 'cutter'
    ? { ...base, kind, parameters: createDefaultCutterParameters() }
    : { ...base, kind, parameters: createDefaultStampParameters() };
}
