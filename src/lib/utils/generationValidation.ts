import type { CookieCutterParams, HandleStyle } from '../types/CookieCutter';

export type CutterGenerationErrorCode =
  | 'INVALID_PARAMS'
  | 'SVG_TOO_LARGE'
  | 'SVG_PARSE_FAILED'
  | 'NO_VALID_CONTOURS'
  | 'CONTOUR_TOO_COMPLEX'
  | 'OFFSET_FAILED'
  | 'INVALID_GEOMETRY'
  | 'EXPORT_FAILED';

export type CutterGenerationErrorDetails = Readonly<Record<string, unknown>>;

export class CutterGenerationError extends Error {
  readonly code: CutterGenerationErrorCode;
  readonly details?: CutterGenerationErrorDetails;

  constructor(
    code: CutterGenerationErrorCode,
    message: string,
    details?: CutterGenerationErrorDetails
  ) {
    super(message);
    this.name = 'CutterGenerationError';
    this.code = code;

    if (details !== undefined) {
      this.details = Object.freeze({ ...details });
    }
  }
}

export const GENERATION_LIMITS = Object.freeze({
  maxSvgBytes: 2 * 1024 * 1024,
  maxSvgPaths: 256,
  maxContours: 512,
  maxPointsPerContour: 10_000,
  maxTotalPoints: 50_000,
  minContourArea: 1e-4,
  triangleAreaEpsilon: 1e-10,
  minWallThickness: 0.4,
  maxWallThickness: 10,
  minCuttingHeight: 1,
  maxCuttingHeight: 100,
  minTotalHeight: 1,
  maxTotalHeight: 150,
  minTaperAngle: 0,
  maxTaperAngle: 30,
  minScale: 0.01,
  maxScale: 100,
  minHandleHeight: 0,
  maxHandleHeight: 100,
  minBuildPlateSize: 20,
  maxBuildPlateSize: 1000,
  minEmbossDepth: 0,
  maxEmbossDepth: 20,
  minStampDepth: 0.1,
  maxStampDepth: 50
} as const);

const PARAM_KEYS = [
  'wallThickness',
  'cuttingHeight',
  'totalHeight',
  'taperAngle',
  'scale',
  'handleStyle',
  'handleHeight',
  'enableHandle',
  'enableEmbossing',
  'embossDepth',
  'buildPlateSize',
  'mode',
  'stampDepth',
  'stampBase'
] as const satisfies readonly (keyof CookieCutterParams)[];

const PARAM_KEY_SET = new Set<string>(PARAM_KEYS);
const HANDLE_STYLES = [
  'round',
  'chamfered',
  'rectangular',
  'flat',
  'none'
] as const satisfies readonly HandleStyle[];
const MODES = ['cutter', 'stamp'] as const satisfies readonly CookieCutterParams['mode'][];

function invalidParameter(field: string, message: string, value?: unknown): never {
  throw new CutterGenerationError('INVALID_PARAMS', message, { field, value });
}

function requireParamsRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalidParameter(
      'params',
      'Cutter parameters (params) must be provided as a complete object.',
      value
    );
  }

  const record = value as Record<string, unknown>;

  for (const key of PARAM_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      invalidParameter(key, `The required ${key} parameter is missing.`);
    }
  }

  const unknownField = Object.keys(record).find((key) => !PARAM_KEY_SET.has(key));
  if (unknownField !== undefined) {
    invalidParameter(
      unknownField,
      `The ${unknownField} parameter is not recognized.`,
      record[unknownField]
    );
  }

  return record;
}

function readFiniteNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalidParameter(field, `The ${field} parameter must be a finite number.`, value);
  }

  return value;
}

function readBoolean(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  if (typeof value !== 'boolean') {
    invalidParameter(field, `The ${field} parameter must be true or false.`, value);
  }

  return value;
}

function readEnum<T extends string>(
  record: Record<string, unknown>,
  field: string,
  allowedValues: readonly T[]
): T {
  const value = record[field];
  if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
    invalidParameter(
      field,
      `The ${field} parameter must be one of: ${allowedValues.join(', ')}.`,
      value
    );
  }

  return value as T;
}

function requireRange(field: string, value: number, minimum: number, maximum: number): void {
  if (value < minimum || value > maximum) {
    invalidParameter(
      field,
      `The ${field} parameter must be between ${minimum} and ${maximum}.`,
      value
    );
  }
}

export function validateCookieCutterParams(value: unknown): Readonly<CookieCutterParams> {
  const record = requireParamsRecord(value);

  const wallThickness = readFiniteNumber(record, 'wallThickness');
  const cuttingHeight = readFiniteNumber(record, 'cuttingHeight');
  const totalHeight = readFiniteNumber(record, 'totalHeight');
  const taperAngle = readFiniteNumber(record, 'taperAngle');
  const scale = readFiniteNumber(record, 'scale');
  const handleStyle = readEnum(record, 'handleStyle', HANDLE_STYLES);
  const handleHeight = readFiniteNumber(record, 'handleHeight');
  const enableHandle = readBoolean(record, 'enableHandle');
  const enableEmbossing = readBoolean(record, 'enableEmbossing');
  const embossDepth = readFiniteNumber(record, 'embossDepth');
  const buildPlateSize = readFiniteNumber(record, 'buildPlateSize');
  const mode = readEnum(record, 'mode', MODES);
  const stampDepth = readFiniteNumber(record, 'stampDepth');
  const stampBase = readBoolean(record, 'stampBase');

  requireRange(
    'wallThickness',
    wallThickness,
    GENERATION_LIMITS.minWallThickness,
    GENERATION_LIMITS.maxWallThickness
  );
  requireRange(
    'cuttingHeight',
    cuttingHeight,
    GENERATION_LIMITS.minCuttingHeight,
    GENERATION_LIMITS.maxCuttingHeight
  );
  requireRange(
    'totalHeight',
    totalHeight,
    GENERATION_LIMITS.minTotalHeight,
    GENERATION_LIMITS.maxTotalHeight
  );
  requireRange(
    'taperAngle',
    taperAngle,
    GENERATION_LIMITS.minTaperAngle,
    GENERATION_LIMITS.maxTaperAngle
  );
  requireRange('scale', scale, GENERATION_LIMITS.minScale, GENERATION_LIMITS.maxScale);
  requireRange(
    'handleHeight',
    handleHeight,
    GENERATION_LIMITS.minHandleHeight,
    GENERATION_LIMITS.maxHandleHeight
  );
  requireRange(
    'buildPlateSize',
    buildPlateSize,
    GENERATION_LIMITS.minBuildPlateSize,
    GENERATION_LIMITS.maxBuildPlateSize
  );
  requireRange(
    'embossDepth',
    embossDepth,
    GENERATION_LIMITS.minEmbossDepth,
    GENERATION_LIMITS.maxEmbossDepth
  );
  requireRange(
    'stampDepth',
    stampDepth,
    GENERATION_LIMITS.minStampDepth,
    GENERATION_LIMITS.maxStampDepth
  );

  if (totalHeight < cuttingHeight) {
    invalidParameter(
      'totalHeight',
      'The totalHeight parameter must be greater than or equal to cuttingHeight.',
      totalHeight
    );
  }

  if (
    enableHandle &&
    handleStyle !== 'none' &&
    totalHeight < cuttingHeight + handleHeight
  ) {
    invalidParameter(
      'totalHeight',
      'The totalHeight parameter must be greater than or equal to cuttingHeight + handleHeight when the handle is active.',
      totalHeight
    );
  }

  if (enableHandle && handleHeight <= 0) {
    invalidParameter(
      'handleHeight',
      'The handleHeight parameter must be greater than zero when the handle is enabled.',
      handleHeight
    );
  }

  if (enableEmbossing) {
    invalidParameter(
      'enableEmbossing',
      'The enableEmbossing option is not available. Use Stamp mode for raised relief.',
      enableEmbossing
    );
  }

  const validated: CookieCutterParams = {
    wallThickness,
    cuttingHeight,
    totalHeight,
    taperAngle,
    scale,
    handleStyle,
    handleHeight,
    enableHandle,
    enableEmbossing,
    embossDepth,
    buildPlateSize,
    mode,
    stampDepth,
    stampBase
  };

  return Object.freeze(validated);
}
