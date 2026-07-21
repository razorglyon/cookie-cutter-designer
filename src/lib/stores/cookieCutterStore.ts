import { writable, derived, get, readonly, type Readable } from 'svelte/store';
import type { CookieCutterParams, CookieCutterModel, PrintabilityCheck } from '../types/CookieCutter';
import { DEFAULT_PARAMS } from '../types/CookieCutter';
import {
  CutterGenerationError,
  GENERATION_LIMITS,
  validateCookieCutterParams
} from '../utils/generationValidation';

function createDefaultParams(): Readonly<CookieCutterParams> {
  return Object.freeze({ ...DEFAULT_PARAMS });
}

// Parameters store
const paramsStore = writable<Readonly<CookieCutterParams>>(createDefaultParams());
export const params: Readable<Readonly<CookieCutterParams>> = readonly(paramsStore);

// Uploaded file store
export const uploadedFile = writable<File | null>(null);

// SVG path data store
export const pathData = writable<string | null>(null);

// 3D model store
export const model = writable<CookieCutterModel | null>(null);

// Loading state
export const isProcessing = writable<boolean>(false);

// Error state
export const error = writable<string | null>(null);
export const parameterError = writable<string | null>(null);

// Printability check
export const printability = derived(
  [params],
  ([$params]) => checkPrintability($params)
);

// Check if parameters are valid for 3D printing
export function checkPrintability(value: unknown): PrintabilityCheck {
  let params: Readonly<CookieCutterParams>;

  try {
    params = validateCookieCutterParams(value);
  } catch (validationError) {
    const message =
      validationError instanceof CutterGenerationError
        ? validationError.message
        : 'The cutter parameters are invalid.';

    return {
      isValid: false,
      warnings: [message],
      recommendations: [],
    };
  }

  const warnings: string[] = [];
  const recommendations: string[] = [];
  let isValid = true;

  // Check wall thickness
  if (params.wallThickness < 0.8) {
    warnings.push('Wall thickness is below recommended minimum (0.8mm)');
    isValid = false;
  } else if (params.wallThickness < 1.0) {
    warnings.push('Thin walls may be fragile. Consider increasing to 1.0mm or more.');
  }

  if (params.wallThickness > 1.5) {
    warnings.push('Very thick walls will use more material and take longer to print.');
  }

  // Check cutting height
  if (params.cuttingHeight < 8) {
    warnings.push('Cutting height is quite shallow. May not work well with thick dough.');
  } else if (params.cuttingHeight > 20) {
    warnings.push('Very tall cutting edge. Ensure your dough is thick enough.');
  }

  // Check taper angle
  if (params.taperAngle < 3) {
    warnings.push('Low taper angle may make cookie removal difficult.');
  } else if (params.taperAngle > 15) {
    warnings.push('High taper angle may make the cutter structurally weak.');
  }

  // Add recommendations
  if (params.wallThickness === 0.8) {
    recommendations.push('Using 0.4mm nozzle: Set wall line count to 2 in slicer');
  }

  recommendations.push('Print upside down (cutting edge facing up)');
  recommendations.push('Use PLA or PETG filament');
  recommendations.push('Layer height: 0.2mm recommended');
  recommendations.push('Infill: 20% with 2-3 perimeters');

  if (params.enableEmbossing) {
    recommendations.push('For embossing: Use 0.15-0.2mm layer height');
    recommendations.push('Mirror text in your design for stamps');
  }

  return {
    isValid,
    warnings,
    recommendations,
  };
}

function minimumTotalHeight(value: Readonly<CookieCutterParams>): number {
  const activeHandle = value.enableHandle && value.handleStyle !== 'none';
  return value.cuttingHeight + (activeHandle ? value.handleHeight : 0);
}

const TOTAL_HEIGHT_DEPENDENCIES = [
  'cuttingHeight',
  'handleHeight',
  'enableHandle',
  'handleStyle'
] as const satisfies readonly (keyof CookieCutterParams)[];

function hasOwnParam(
  patch: Partial<CookieCutterParams>,
  key: keyof CookieCutterParams
): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key);
}

function buildParamUpdate(
  current: Readonly<CookieCutterParams>,
  patch: Partial<CookieCutterParams>
): CookieCutterParams {
  const candidate: CookieCutterParams = { ...current, ...patch };

  if (
    patch.enableEmbossing === true &&
    hasOwnParam(patch, 'enableEmbossing') &&
    !hasOwnParam(patch, 'embossDepth') &&
    !current.enableEmbossing &&
    current.embossDepth === 0
  ) {
    candidate.embossDepth = DEFAULT_PARAMS.embossDepth;
  }

  const requiredTotalHeight = minimumTotalHeight(candidate);
  const explicitlyUpdatesTotalHeight = hasOwnParam(patch, 'totalHeight');
  const updatesTotalHeightDependency = TOTAL_HEIGHT_DEPENDENCIES.some((key) =>
    hasOwnParam(patch, key)
  );

  if (candidate.totalHeight < requiredTotalHeight && explicitlyUpdatesTotalHeight) {
    throw new CutterGenerationError(
      'INVALID_PARAMS',
      `The totalHeight parameter must be at least ${requiredTotalHeight} for the current cutting height and handle.`,
      { field: 'totalHeight', value: candidate.totalHeight }
    );
  }

  if (candidate.totalHeight < requiredTotalHeight && updatesTotalHeightDependency) {
    if (requiredTotalHeight > GENERATION_LIMITS.maxTotalHeight) {
      throw new CutterGenerationError(
        'INVALID_PARAMS',
        `The totalHeight required by this parameter update (${requiredTotalHeight}) exceeds the maximum totalHeight of ${GENERATION_LIMITS.maxTotalHeight}.`,
        { field: 'totalHeight', value: requiredTotalHeight }
      );
    }

    candidate.totalHeight = requiredTotalHeight;
  }

  return candidate;
}

// Helper functions to update params
export function updateParam<K extends keyof CookieCutterParams>(
  key: K,
  value: CookieCutterParams[K]
): boolean {
  return updateParams({ [key]: value } as Partial<CookieCutterParams>);
}

export function updateParams(patch: Partial<CookieCutterParams>): boolean {
  const current = get(paramsStore);

  try {
    const candidate = buildParamUpdate(current, patch);
    const validated = validateCookieCutterParams(candidate);
    paramsStore.set(validated);
    parameterError.set(null);
    return true;
  } catch (validationError) {
    if (validationError instanceof CutterGenerationError) {
      parameterError.set(validationError.message);
      return false;
    }

    throw validationError;
  }
}

export function setParams(value: unknown) {
  const validated = validateCookieCutterParams(value);
  paramsStore.set(validated);
  parameterError.set(null);
}

export function resetParams() {
  paramsStore.set(createDefaultParams());
  parameterError.set(null);
}
