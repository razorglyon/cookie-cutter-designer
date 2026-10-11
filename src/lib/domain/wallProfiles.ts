import type { CutterDesignParameters } from './designParameters';

export type WallProfileParameters = Pick<CutterDesignParameters, 'wallThickness' | 'taperAngle'>;

/** Explicit settings only: not a new geometry recipe or a mechanical guarantee. */
export const WALL_PROFILES = Object.freeze([
  Object.freeze({ id: 'thin', label: 'Fin', parameters: Object.freeze({ wallThickness: 0.8, taperAngle: 5 }) }),
  Object.freeze({ id: 'standard', label: 'Standard', parameters: Object.freeze({ wallThickness: 1, taperAngle: 7 }) }),
  Object.freeze({ id: 'robust', label: 'Robuste', parameters: Object.freeze({ wallThickness: 1.5, taperAngle: 10 }) })
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly parameters: WallProfileParameters;
}[]);

/** Derive the label from exact current values; never persist a competing preset ID. */
export function matchingWallProfile(parameters: WallProfileParameters) {
  return WALL_PROFILES.find(profile =>
    profile.parameters.wallThickness === parameters.wallThickness
    && profile.parameters.taperAngle === parameters.taperAngle
  ) ?? null;
}
