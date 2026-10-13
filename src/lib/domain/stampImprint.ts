import type { DesignDocument } from './designDocument';

/** Frozen V4 product constraint, not a universal guarantee of printability. */
export const STAMP_IMPRINT_LIMITS = Object.freeze({
  baseThicknessMm: 4,
  minimumRemainingThicknessMm: 1,
  maximumRecessDepthMm: 3
});

export function stampImprintMode(document: DesignDocument | null): 'raised' | 'recessed' {
  return document?.schemaVersion === 4 ? document.imprintMode : 'raised';
}
