import type { CutterDesignParameters } from '../../domain/designParameters';
import { createDefaultCutterParameters } from '../../domain/designParameters';
import type { GeneratedArtifact } from '../../domain/generatedArtifact';
import { generateCookieCutter } from '../../utils/cookieCutterGenerator';
import { disposeObject3D } from '../../utils/disposeThree';
import {
  CutterGenerationError,
  validateCookieCutterParams
} from '../../utils/generationValidation';
import { validatePrintableObject } from '../../utils/geometryValidation';
import type {
  GenerationRecipe,
  RecipeValidationIssue,
  RecipeValidationResult
} from '../generationRecipe';

function invalidResult(
  issue: RecipeValidationIssue
): RecipeValidationResult<CutterDesignParameters> {
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

function reconstructCutterParameters(
  value: unknown
): RecipeValidationResult<CutterDesignParameters> {
  try {
    const validated = validateCookieCutterParams(value);
    if (validated.mode !== 'cutter') {
      throw new CutterGenerationError(
        'INVALID_PARAMS',
        'The mode parameter must be cutter for the Cutter recipe.',
        { field: 'mode', value: validated.mode }
      );
    }

    const parameters: CutterDesignParameters = Object.freeze({
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
      message: 'An unexpected error occurred while validating Cutter parameters.'
    });
  }
}

function assertRuntimeCutterKind(document: { readonly kind: string }): void {
  if (document.kind !== 'cutter') {
    throw new CutterGenerationError(
      'INVALID_PARAMS',
      'The document kind must be cutter for the Cutter recipe.',
      { field: 'kind', value: document.kind }
    );
  }
}

export const cutterRecipe = Object.freeze({
  kind: 'cutter',

  createDefaultParameters(): CutterDesignParameters {
    return createDefaultCutterParameters();
  },

  validateParameters(
    value: unknown
  ): RecipeValidationResult<CutterDesignParameters> {
    return reconstructCutterParameters(value);
  },

  async generate(document, context): Promise<readonly GeneratedArtifact<'cutter'>[]> {
    context.signal.throwIfAborted();
    assertRuntimeCutterKind(document);

    const validation = cutterRecipe.validateParameters(document.parameters);
    if (validation.valid === false) {
      const firstIssue = validation.issues[0] ?? {
        path: 'parameters',
        code: 'INVALID_PARAMS',
        message: 'The Cutter parameters are invalid.'
      };
      throw new CutterGenerationError('INVALID_PARAMS', firstIssue.message, {
        field: firstIssue.path,
        issues: validation.issues
      });
    }

    let ownedObject: Awaited<ReturnType<typeof generateCookieCutter>> | undefined;

    try {
      ownedObject = await generateCookieCutter(
        document.sketch.svg,
        validation.parameters
      );
      context.signal.throwIfAborted();

      const report = validatePrintableObject(ownedObject);
      if (!report.valid || report.bounds === null) {
        throw new CutterGenerationError(
          'INVALID_GEOMETRY',
          'The generated Cutter object is not valid printable geometry.',
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
      const artifact: GeneratedArtifact<'cutter'> = Object.freeze({
        id: `${document.id}:cutter:${context.revision}`,
        role: 'cutter',
        object: ownedObject,
        dimensionsMm,
        validation: report
      });
      const artifacts: readonly GeneratedArtifact<'cutter'>[] = Object.freeze([
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
} satisfies GenerationRecipe<'cutter'>);
