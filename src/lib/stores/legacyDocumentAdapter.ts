import type { DesignDocument } from '../domain/designDocument';
import type {
  CutterDesignParameters,
  StampDesignParameters
} from '../domain/designParameters';
import { parseDesignDocument } from '../domain/documentValidation';
import type { CookieCutterParams } from '../types/CookieCutter';
import {
  CutterGenerationError,
  validateCookieCutterParams
} from '../utils/generationValidation';

/** Parameters only: this is not a complete document or a kind-change command. */
export type LegacyDocumentParameters =
  | { readonly kind: 'cutter'; readonly parameters: CutterDesignParameters }
  | { readonly kind: 'stamp'; readonly parameters: StampDesignParameters };

/**
 * Validate the document and legacy generation contract before publishing a copy.
 * Domain-valid but legacy-unrepresentable options are rejected, never normalized.
 */
export function documentParametersToLegacy(
  document: DesignDocument
): Readonly<CookieCutterParams> {
  const validated = parseDesignDocument(document);
  return validateCookieCutterParams(validated.parameters);
}

/**
 * Convert complete current legacy parameters without migration, defaults or repair.
 * The legacy validator enforces the V1 parameter ranges and relational rules,
 * plus its stricter generation constraints (notably unavailable embossing).
 */
export function legacyParametersToDocument(value: unknown): LegacyDocumentParameters {
  const validated = validateCookieCutterParams(value);

  // The legacy validator checks enumerable string keys only. Also reject hidden
  // and symbol extras before returning its copy; reuse its schema, not a key list.
  const allowedKeys = new Set<PropertyKey>(Reflect.ownKeys(validated));
  for (const key of Reflect.ownKeys(value as object)) {
    if (!allowedKeys.has(key)) {
      throw new CutterGenerationError(
        'INVALID_PARAMS',
        `The ${String(key)} parameter is not recognized.`,
        { field: String(key) }
      );
    }
  }

  // Explicit literals retain the correlation between kind and parameters.mode.
  return validated.mode === 'cutter'
    ? Object.freeze({
        kind: 'cutter',
        parameters: Object.freeze({ ...validated, mode: 'cutter' })
      })
    : Object.freeze({
        kind: 'stamp',
        parameters: Object.freeze({ ...validated, mode: 'stamp' })
      });
}
