import {
  isDesignKind,
  isImplementedDesignKind,
  type ImplementedDesignKind
} from '../domain/designKind';
import type {
  GenerationRecipe,
  GenerationRecipeLoader
} from './generationRecipe';

export type RecipeRegistryErrorCode =
  | 'UNKNOWN_KIND'
  | 'UNIMPLEMENTED_KIND'
  | 'DUPLICATE_REGISTRATION'
  | 'LOAD_FAILED'
  | 'KIND_MISMATCH'
  | 'INVALID_RECIPE';

type AnyResolvedGenerationRecipe = {
  [K in ImplementedDesignKind]: GenerationRecipe<K>;
}[ImplementedDesignKind];

export type ResolvedGenerationRecipe<K extends string> = string extends K
  ? AnyResolvedGenerationRecipe
  : K extends ImplementedDesignKind
    ? GenerationRecipe<K>
    : never;

function registryErrorMessage(code: RecipeRegistryErrorCode, kind: string): string {
  switch (code) {
    case 'UNKNOWN_KIND':
      return `Kind de conception inconnu : ${kind}.`;
    case 'UNIMPLEMENTED_KIND':
      return `Aucune recette implémentée n’est disponible pour le kind : ${kind}.`;
    case 'DUPLICATE_REGISTRATION':
      return `Une recette est déjà enregistrée pour le kind : ${kind}.`;
    case 'LOAD_FAILED':
      return `Le chargement de la recette a échoué pour le kind : ${kind}.`;
    case 'KIND_MISMATCH':
      return `La recette chargée ne correspond pas au kind demandé : ${kind}.`;
    case 'INVALID_RECIPE':
      return `La recette chargée est structurellement invalide pour le kind : ${kind}.`;
  }
}

export class RecipeRegistryError extends Error {
  readonly code: RecipeRegistryErrorCode;
  readonly kind: string;
  override readonly cause: unknown;

  constructor(
    code: RecipeRegistryErrorCode,
    kind: string,
    cause: unknown = undefined
  ) {
    super(registryErrorMessage(code, kind));
    this.name = 'RecipeRegistryError';
    this.code = code;
    this.kind = kind;
    this.cause = cause;
  }
}

function readRecipeProperty(
  recipe: object,
  property: 'kind' | 'createDefaultParameters' | 'validateParameters' | 'generate',
  kind: ImplementedDesignKind
): unknown {
  try {
    return Reflect.get(recipe, property);
  } catch (cause: unknown) {
    throw new RecipeRegistryError('INVALID_RECIPE', kind, cause);
  }
}

function assertValidRecipe(
  recipe: unknown,
  kind: ImplementedDesignKind
): asserts recipe is AnyResolvedGenerationRecipe {
  if (typeof recipe !== 'object' || recipe === null) {
    throw new RecipeRegistryError('INVALID_RECIPE', kind, recipe);
  }

  const loadedKind = readRecipeProperty(recipe, 'kind', kind);
  if (typeof loadedKind !== 'string') {
    throw new RecipeRegistryError('INVALID_RECIPE', kind, recipe);
  }
  if (loadedKind !== kind) {
    throw new RecipeRegistryError('KIND_MISMATCH', kind, recipe);
  }

  const methodNames = [
    'createDefaultParameters',
    'validateParameters',
    'generate'
  ] as const;
  for (const methodName of methodNames) {
    if (typeof readRecipeProperty(recipe, methodName, kind) !== 'function') {
      throw new RecipeRegistryError('INVALID_RECIPE', kind, recipe);
    }
  }
}

export class RecipeRegistry {
  private readonly loaders = new Map<
    ImplementedDesignKind,
    () => Promise<unknown>
  >();

  private readonly resolvedRecipes = new Map<
    ImplementedDesignKind,
    Promise<AnyResolvedGenerationRecipe>
  >();

  register<K extends ImplementedDesignKind>(
    kind: K,
    loader: GenerationRecipeLoader<K>
  ): void {
    if (!isDesignKind(kind)) {
      throw new RecipeRegistryError('UNKNOWN_KIND', kind);
    }

    if (!isImplementedDesignKind(kind)) {
      throw new RecipeRegistryError('UNIMPLEMENTED_KIND', kind);
    }

    if (this.loaders.has(kind)) {
      throw new RecipeRegistryError('DUPLICATE_REGISTRATION', kind);
    }

    this.loaders.set(kind, loader);
  }

  has(kind: string): boolean {
    return isImplementedDesignKind(kind) && this.loaders.has(kind);
  }

  registeredKinds(): readonly ImplementedDesignKind[] {
    return [...this.loaders.keys()];
  }

  resolve<K extends string>(kind: K): Promise<ResolvedGenerationRecipe<K>>;
  resolve(kind: string): Promise<AnyResolvedGenerationRecipe> {
    if (!isDesignKind(kind)) {
      return Promise.reject(new RecipeRegistryError('UNKNOWN_KIND', kind));
    }

    if (!isImplementedDesignKind(kind)) {
      return Promise.reject(new RecipeRegistryError('UNIMPLEMENTED_KIND', kind));
    }

    const cached = this.resolvedRecipes.get(kind);
    if (cached !== undefined) {
      return cached;
    }

    const loader = this.loaders.get(kind);
    if (loader === undefined) {
      return Promise.reject(new RecipeRegistryError('UNIMPLEMENTED_KIND', kind));
    }

    const loadingPromise = this.loadAndInspect(kind, loader);
    this.resolvedRecipes.set(kind, loadingPromise);
    void loadingPromise.catch(() => {
      this.deleteIfCurrent(kind, loadingPromise);
    });
    return loadingPromise;
  }

  private async loadAndInspect(
    kind: ImplementedDesignKind,
    loader: () => Promise<unknown>
  ): Promise<AnyResolvedGenerationRecipe> {
    await Promise.resolve();

    let recipe: unknown;
    try {
      recipe = await loader();
    } catch (cause: unknown) {
      throw new RecipeRegistryError('LOAD_FAILED', kind, cause);
    }

    assertValidRecipe(recipe, kind);
    return recipe;
  }

  private deleteIfCurrent(
    kind: ImplementedDesignKind,
    loadingPromise: Promise<AnyResolvedGenerationRecipe>
  ): void {
    if (this.resolvedRecipes.get(kind) === loadingPromise) {
      this.resolvedRecipes.delete(kind);
    }
  }
}
