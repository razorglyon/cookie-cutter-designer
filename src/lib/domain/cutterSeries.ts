import type { CutterSeriesLayout } from './designDocument';

/** Explicit resource and manufacturing bounds for the first series tranche. */
export const CUTTER_SERIES_LIMITS = Object.freeze({ maxCopies: 24, minSpacingMm: 0.5, maxSpacingMm: 40, maxTriangles: 500_000 });
export const DEFAULT_CUTTER_SERIES_LAYOUT: CutterSeriesLayout = Object.freeze({ copies: 4, columns: 2, spacingMm: 5 });
