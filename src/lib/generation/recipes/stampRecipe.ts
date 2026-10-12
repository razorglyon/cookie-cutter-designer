import type { StampDesignParameters } from '../../domain/designParameters';
import { createDefaultStampParameters } from '../../domain/designParameters';
import type { GeneratedArtifact } from '../../domain/generatedArtifact';
import { disposeObject3D } from '../../utils/disposeThree';
import {
  CutterGenerationError,
  validateCookieCutterParams
} from '../../utils/generationValidation';
import { validatePrintableObject } from '../../utils/geometryValidation';
import { generateStamp } from '../../utils/stampGenerator';
import type {
  GenerationRecipe,
  RecipeValidationIssue,
  RecipeValidationResult
} from '../generationRecipe';

function invalidResult(
  issue: RecipeValidationIssue
): RecipeValidationResult<StampDesignParameters> {
  return Object.freeze({
    valid: false,
    issues: Object.freeze([Object.freeze(issue)])
  });
}

function issueFromGenerationError(
  error: CutterGenerationError
): RecipeValidationIssue {
  const field = error.details?.field;
  return {
    path: typeof field === 'string' ? field : 'parameters',
    code: error.code,
    message: error.message
  };
}

function reconstructStampParameters(
  value: unknown
): RecipeValidationResult<StampDesignParameters> {
  try {
    const validated = validateCookieCutterParams(value);
    if (validated.mode !== 'stamp') {
      throw new CutterGenerationError(
        'INVALID_PARAMS',
        'The mode parameter must be stamp for the Stamp recipe.',
        { field: 'mode', value: validated.mode }
      );
    }

    const parameters: StampDesignParameters = Object.freeze({
      wallThickness: validated.wallThickness,
      cuttingHeight: validated.cuttingHeight,
      totalHeight: validated.totalHeight,
      taperAngle: validated.taperAngle,
      targetSize: validated.targetSize,
      sizeMode: validated.sizeMode,
      handleStyle: validated.handleStyle,
      handleHeight: validated.handleHeight,
      enableHandle: validated.enableHandle,
      enableEmbossing: validated.enableEmbossing,
      embossDepth: validated.embossDepth,
      buildPlateSize: validated.buildPlateSize,
      mode: validated.mode,
      stampDepth: validated.stampDepth,
      stampBase: validated.stampBase
    });

    return Object.freeze({ valid: true, parameters });
  } catch (error: unknown) {
    if (error instanceof CutterGenerationError) {
      return invalidResult(issueFromGenerationError(error));
    }

    return invalidResult({
      path: 'parameters',
      code: 'UNEXPECTED_VALIDATION_ERROR',
      message: 'An unexpected error occurred while validating Stamp parameters.'
    });
  }
}

function assertRuntimeStampKind(document: { readonly kind: string }): void {
  if (document.kind !== 'stamp') {
    throw new CutterGenerationError(
      'INVALID_PARAMS',
      'The document kind must be stamp for the Stamp recipe.',
      { field: 'kind', value: document.kind }
    );
  }
}

export const stampRecipe = Object.freeze({
  kind: 'stamp',

  createDefaultParameters(): StampDesignParameters {
    return createDefaultStampParameters();
  },

  validateParameters(
    value: unknown
  ): RecipeValidationResult<StampDesignParameters> {
    return reconstructStampParameters(value);
  },

  async generate(document, context): Promise<readonly GeneratedArtifact<'stamp'>[]> {
    context.signal.throwIfAborted();
    assertRuntimeStampKind(document);

    const validation = stampRecipe.validateParameters(document.parameters);
    if (validation.valid === false) {
      const firstIssue = validation.issues[0] ?? {
        path: 'parameters',
        code: 'INVALID_PARAMS',
        message: 'The Stamp parameters are invalid.'
      };
      throw new CutterGenerationError('INVALID_PARAMS', firstIssue.message, {
        field: firstIssue.path,
        issues: validation.issues
      });
    }

    let ownedObject: Awaited<ReturnType<typeof generateStamp>> | undefined;

    try {
      ownedObject = document.schemaVersion === 4 && document.imprintMode === 'recessed'
        ? await generateStamp(document.sketch.svg, validation.parameters, 'recessed')
        : await generateStamp(document.sketch.svg, validation.parameters);
      context.signal.throwIfAborted();

      const report = validatePrintableObject(ownedObject, {
        requireSingleShell: true
      });
      if (!report.valid || report.bounds === null) {
        throw new CutterGenerationError(
          'INVALID_GEOMETRY',
          'The generated Stamp object is not valid single-shell printable geometry.',
          {
            field: 'geometry',
            errors: report.errors,
            bounds: report.bounds
          }
        );
      }

      const dimensionsMm = Object.freeze({
        width: report.bounds.max.x - report.bounds.min.x,
        depth: report.bounds.max.z - report.bounds.min.z,
        height: report.bounds.max.y - report.bounds.min.y
      });
      const artifact: GeneratedArtifact<'stamp'> = Object.freeze({
        id: `${document.id}:stamp:${context.revision}`,
        role: 'stamp',
        object: ownedObject,
        dimensionsMm,
        validation: report
      });
      const artifacts: readonly GeneratedArtifact<'stamp'>[] = Object.freeze([
        artifact
      ]);

      ownedObject = undefined;
      return artifacts;
    } catch (error: unknown) {
      const objectToDispose = ownedObject;
      ownedObject = undefined;
      if (objectToDispose !== undefined) disposeObject3D(objectToDispose);
      throw error;
    }
  }
} satisfies GenerationRecipe<'stamp'>);
