import type { DesignDocument } from '../domain/designDocument';
import type { GeneratedArtifact } from '../domain/generatedArtifact';
import type { ImplementedDesignKind } from '../domain/designKind';
import type { ActiveDesignParametersByKind } from '../domain/designParameters';

export interface RecipeValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type RecipeValidationResult<P> =
  | {
      readonly valid: true;
      readonly parameters: P;
    }
  | {
      readonly valid: false;
      readonly issues: readonly RecipeValidationIssue[];
    };

export interface GenerationContext {
  readonly signal: AbortSignal;
  readonly revision: number;
}

export interface GenerationRecipe<K extends ImplementedDesignKind> {
  readonly kind: K;
  createDefaultParameters(): ActiveDesignParametersByKind[K];
  validateParameters(
    value: unknown
  ): RecipeValidationResult<ActiveDesignParametersByKind[K]>;
  generate(
    document: DesignDocument<K>,
    context: GenerationContext
  ): Promise<readonly GeneratedArtifact<K>[]>;
}

export type GenerationRecipeLoader<K extends ImplementedDesignKind> = () => Promise<
  GenerationRecipe<K>
>;
