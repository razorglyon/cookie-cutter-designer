import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { DesignDocument, DesignDocumentV1 } from '../../domain/designDocument';
import type {
  GeneratedArtifact,
  ImplementedArtifactRolesByKind
} from '../../domain/generatedArtifact';
import type { ImplementedDesignKind } from '../../domain/designKind';
import {
  createDefaultCutterParameters,
  createDefaultStampParameters,
  type CutterDesignParameters,
  type StampDesignParameters
} from '../../domain/designParameters';
import type {
  GenerationContext,
  GenerationRecipe,
  GenerationRecipeLoader,
  RecipeValidationIssue,
  RecipeValidationResult
} from '../generationRecipe';
import {
  RecipeRegistry,
  RecipeRegistryError,
  type ResolvedGenerationRecipe
} from '../recipeRegistry';

const validationIssue: RecipeValidationIssue = {
  path: 'mode',
  code: 'invalid-mode',
  message: 'Le mode ne correspond pas à la recette.'
};

const cutterParameters = createDefaultCutterParameters();
const stampParameters = createDefaultStampParameters();

const cutterDocument: DesignDocumentV1<'cutter'> = {
  schemaVersion: 1,
  id: 'cutter-document',
  name: 'Cutter',
  kind: 'cutter',
  source: {
    type: 'svg',
    fileName: 'cutter.svg',
    svg: '<svg viewBox="0 0 10 10" />'
  },
  sketch: {
    svg: '<svg viewBox="0 0 10 10" />',
    revision: 3
  },
  parameters: cutterParameters,
  viewport: {
    showGrid: true,
    showAxes: false,
    showWallThickness: false
  },
  createdAt: '2026-07-23T10:00:00.000Z',
  updatedAt: '2026-07-23T10:01:00.000Z'
};

function validateCutter(value: unknown): RecipeValidationResult<CutterDesignParameters> {
  return value === cutterParameters
    ? { valid: true, parameters: cutterParameters }
    : { valid: false, issues: [validationIssue] };
}

function validateStamp(value: unknown): RecipeValidationResult<StampDesignParameters> {
  return value === stampParameters
    ? { valid: true, parameters: stampParameters }
    : { valid: false, issues: [validationIssue] };
}

function createCutterRecipe(
  generate: GenerationRecipe<'cutter'>['generate'] = async () => []
): GenerationRecipe<'cutter'> {
  return {
    kind: 'cutter',
    createDefaultParameters: createDefaultCutterParameters,
    validateParameters: validateCutter,
    generate
  };
}

function createStampRecipe(): GenerationRecipe<'stamp'> {
  return {
    kind: 'stamp',
    createDefaultParameters: createDefaultStampParameters,
    validateParameters: validateStamp,
    generate: async () => []
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => {
    throw new Error('La promesse différée n’est pas initialisée.');
  };
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

async function rejectedValue(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }

  throw new Error('La promesse aurait dû être rejetée.');
}

function expectRegistryError(
  error: unknown,
  code:
    | 'UNKNOWN_KIND'
    | 'UNIMPLEMENTED_KIND'
    | 'DUPLICATE_REGISTRATION'
    | 'LOAD_FAILED'
    | 'KIND_MISMATCH'
    | 'INVALID_RECIPE',
  kind: string
): asserts error is RecipeRegistryError {
  expect(error).toBeInstanceOf(RecipeRegistryError);
  if (!(error instanceof RecipeRegistryError)) {
    throw new Error('Une RecipeRegistryError était attendue.');
  }
  expect(error).toMatchObject({ name: 'RecipeRegistryError', code, kind });
  expect(error).toHaveProperty('cause');
}

describe('GenerationRecipe', () => {
  it('corrèle strictement le kind, les paramètres, le document et les artefacts', () => {
    expectTypeOf<GenerationRecipe<'cutter'>['kind']>().toEqualTypeOf<'cutter'>();
    expectTypeOf<GenerationRecipe<'stamp'>['kind']>().toEqualTypeOf<'stamp'>();
    expectTypeOf<ReturnType<GenerationRecipe<'cutter'>['createDefaultParameters']>>()
      .toEqualTypeOf<CutterDesignParameters>();
    expectTypeOf<ReturnType<GenerationRecipe<'stamp'>['createDefaultParameters']>>()
      .toEqualTypeOf<StampDesignParameters>();
    expectTypeOf<ReturnType<GenerationRecipe<'cutter'>['validateParameters']>>()
      .toEqualTypeOf<RecipeValidationResult<CutterDesignParameters>>();
    expectTypeOf<ReturnType<GenerationRecipe<'stamp'>['validateParameters']>>()
      .toEqualTypeOf<RecipeValidationResult<StampDesignParameters>>();
    expectTypeOf<Parameters<GenerationRecipe<'cutter'>['generate']>[0]>()
      .toEqualTypeOf<DesignDocument<'cutter'>>();
    expectTypeOf<Parameters<GenerationRecipe<'stamp'>['generate']>[0]>()
      .toEqualTypeOf<DesignDocument<'stamp'>>();
    expectTypeOf<Parameters<GenerationRecipe<'cutter'>['generate']>[1]>()
      .toEqualTypeOf<GenerationContext>();
    expectTypeOf<ReturnType<GenerationRecipe<'cutter'>['generate']>>()
      .toEqualTypeOf<Promise<readonly GeneratedArtifact<'cutter'>[]>>();
    expectTypeOf<ReturnType<GenerationRecipe<'stamp'>['generate']>>()
      .toEqualTypeOf<Promise<readonly GeneratedArtifact<'stamp'>[]>>();
    expectTypeOf<ReturnType<GenerationRecipeLoader<'stamp'>>>()
      .toEqualTypeOf<Promise<GenerationRecipe<'stamp'>>>();
  });

  it('borne explicitement les rôles d’artefact à chaque kind implémenté', () => {
    expectTypeOf<ImplementedArtifactRolesByKind>().toEqualTypeOf<{
      readonly cutter: 'primary' | 'cutter' | 'handle';
      readonly stamp: 'primary' | 'stamp' | 'handle';
      readonly 'multi-cutter': 'primary' | 'set-item';
    }>();
    expectTypeOf<GeneratedArtifact<'cutter'>['role']>()
      .toEqualTypeOf<'primary' | 'cutter' | 'handle'>();
    expectTypeOf<GeneratedArtifact<'stamp'>['role']>()
      .toEqualTypeOf<'primary' | 'stamp' | 'handle'>();
    expectTypeOf<Extract<GeneratedArtifact<'cutter'>['role'], 'stamp'>>()
      .toBeNever();
    expectTypeOf<Extract<GeneratedArtifact<'stamp'>['role'], 'cutter'>>()
      .toBeNever();
    expectTypeOf<GeneratedArtifact<'cutter'>>()
      .not.toMatchTypeOf<GeneratedArtifact<'stamp'>>();
    expectTypeOf<GeneratedArtifact<'stamp'>>()
      .not.toMatchTypeOf<GeneratedArtifact<'cutter'>>();
  });

  it('discrimine le résultat de validation sans perdre le type des paramètres', () => {
    const recipe = createCutterRecipe();
    const valid = recipe.validateParameters(cutterParameters);
    if (!valid.valid) {
      throw new Error('Les paramètres Cutter devraient être valides.');
    }
    expectTypeOf(valid.parameters).toEqualTypeOf<CutterDesignParameters>();
    expect(valid.parameters).toBe(cutterParameters);

    const invalid = recipe.validateParameters({ mode: 'stamp' });
    if (invalid.valid) {
      throw new Error('Les paramètres Stamp ne devraient pas valider une recette Cutter.');
    }
    expectTypeOf(invalid.issues).toEqualTypeOf<readonly RecipeValidationIssue[]>();
    expect(invalid.issues).toEqual([validationIssue]);
  });
});

describe('RecipeRegistry', () => {
  it('expose un type de résolution distributif et précis', () => {
    const resolveCutter = (registry: RecipeRegistry) => registry.resolve('cutter');
    const resolveMixed = (
      registry: RecipeRegistry,
      kind: 'cutter' | 'inconnu'
    ) => registry.resolve(kind);
    const resolveFuture = (registry: RecipeRegistry) =>
      registry.resolve('imprint-cutter');
    const resolveDynamic = (registry: RecipeRegistry, kind: string) =>
      registry.resolve(kind);

    expectTypeOf<ReturnType<typeof resolveCutter>>()
      .toEqualTypeOf<Promise<GenerationRecipe<'cutter'>>>();
    expectTypeOf<ReturnType<typeof resolveMixed>>()
      .toEqualTypeOf<Promise<GenerationRecipe<'cutter'>>>();
    expectTypeOf<ReturnType<typeof resolveFuture>>()
      .toEqualTypeOf<Promise<never>>();
    expectTypeOf<ReturnType<typeof resolveDynamic>>()
      .toEqualTypeOf<
        Promise<GenerationRecipe<'cutter'> | GenerationRecipe<'stamp'> | GenerationRecipe<'multi-cutter'>>
      >();
    expectTypeOf<ResolvedGenerationRecipe<'cutter' | 'inconnu'>>()
      .toEqualTypeOf<GenerationRecipe<'cutter'>>();
    expectTypeOf<ResolvedGenerationRecipe<'imprint-cutter'>>().toBeNever();
    expectTypeOf<ResolvedGenerationRecipe<string>>()
      .toEqualTypeOf<GenerationRecipe<'cutter'> | GenerationRecipe<'stamp'> | GenerationRecipe<'multi-cutter'>>();
  });

  it('reste local, lazy, déterministe et refuse un doublon avant tout chargement', () => {
    const registry = new RecipeRegistry();
    const cutterLoader = vi.fn<GenerationRecipeLoader<'cutter'>>(async () =>
      createCutterRecipe()
    );
    const stampLoader = vi.fn<GenerationRecipeLoader<'stamp'>>(async () =>
      createStampRecipe()
    );

    registry.register('stamp', stampLoader);
    registry.register('cutter', cutterLoader);

    expect(cutterLoader).not.toHaveBeenCalled();
    expect(stampLoader).not.toHaveBeenCalled();
    expect(registry.has('cutter')).toBe(true);
    expect(registry.has('stamp')).toBe(true);
    expect(registry.has('imprint-cutter')).toBe(false);
    expect(registry.has('inconnu')).toBe(false);

    const firstList = registry.registeredKinds();
    expectTypeOf(firstList).toEqualTypeOf<readonly ImplementedDesignKind[]>();
    expect(firstList).toEqual(['stamp', 'cutter']);
    (firstList as ImplementedDesignKind[]).pop();
    expect(registry.registeredKinds()).toEqual(['stamp', 'cutter']);

    let duplicateError: unknown;
    try {
      registry.register('cutter', async () => createCutterRecipe());
    } catch (error: unknown) {
      duplicateError = error;
    }
    expectRegistryError(duplicateError, 'DUPLICATE_REGISTRATION', 'cutter');
    expect(cutterLoader).not.toHaveBeenCalled();
  });

  it('refuse au runtime les kinds inconnus et non implémentés avant le doublon', () => {
    const registry = new RecipeRegistry();
    const loader = vi.fn<GenerationRecipeLoader<'cutter'>>(async () =>
      createCutterRecipe()
    );
    const unknownKind = 'inconnu' as unknown as 'cutter';
    const futureKind = 'imprint-cutter' as unknown as 'cutter';

    let unknownError: unknown;
    try {
      registry.register(unknownKind, loader);
    } catch (error: unknown) {
      unknownError = error;
    }
    expectRegistryError(unknownError, 'UNKNOWN_KIND', 'inconnu');

    let futureError: unknown;
    try {
      registry.register(futureKind, loader);
    } catch (error: unknown) {
      futureError = error;
    }
    expectRegistryError(futureError, 'UNIMPLEMENTED_KIND', 'imprint-cutter');
    expect(registry.registeredKinds()).toEqual([]);
    expect(loader).not.toHaveBeenCalled();
  });

  it('distingue une chaîne inconnue d’un kind futur connu mais non implémenté', async () => {
    const registry = new RecipeRegistry();

    const unknownError = await rejectedValue(registry.resolve('inconnu'));
    expectRegistryError(unknownError, 'UNKNOWN_KIND', 'inconnu');

    const futureError = await rejectedValue(registry.resolve('imprint-cutter'));
    expectRegistryError(futureError, 'UNIMPLEMENTED_KIND', 'imprint-cutter');
  });

  it('partage exactement la promesse concurrente puis met le succès en cache', async () => {
    const registry = new RecipeRegistry();
    const recipe = createCutterRecipe();
    const pendingRecipe = deferred<GenerationRecipe<'cutter'>>();
    const loader = vi.fn<GenerationRecipeLoader<'cutter'>>(() => pendingRecipe.promise);
    registry.register('cutter', loader);

    const first = registry.resolve('cutter');
    const concurrent = registry.resolve('cutter');
    expectTypeOf(first).toEqualTypeOf<Promise<GenerationRecipe<'cutter'>>>();
    expect(concurrent).toBe(first);

    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
    pendingRecipe.resolve(recipe);
    await expect(first).resolves.toBe(recipe);

    const cached = registry.resolve('cutter');
    expect(cached).toBe(first);
    await expect(cached).resolves.toBe(recipe);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('retire un chargement rejeté du cache, conserve sa cause et autorise un retry', async () => {
    const registry = new RecipeRegistry();
    const recipe = createCutterRecipe();
    const loaderCause = new Error('échec distinct du loader');
    let attempt = 0;
    const loader: GenerationRecipeLoader<'cutter'> = () => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(loaderCause) : Promise.resolve(recipe);
    };
    registry.register('cutter', loader);

    const failedPromise = registry.resolve('cutter');
    const loadError = await rejectedValue(failedPromise);
    expectRegistryError(loadError, 'LOAD_FAILED', 'cutter');
    expect(loadError.cause).toBe(loaderCause);

    const retryPromise = registry.resolve('cutter');
    expect(retryPromise).not.toBe(failedPromise);
    await expect(retryPromise).resolves.toBe(recipe);
    expect(attempt).toBe(2);
  });

  it('rejette une recette incomplète puis rappelle le loader au retry', async () => {
    const registry = new RecipeRegistry();
    const recipe = createCutterRecipe();
    const incompleteRecipe = {
      kind: 'cutter',
      createDefaultParameters: createDefaultCutterParameters,
      validateParameters: validateCutter
    };
    let attempt = 0;
    const loader: GenerationRecipeLoader<'cutter'> = async () => {
      attempt += 1;
      return attempt === 1
        ? (incompleteRecipe as unknown as GenerationRecipe<'cutter'>)
        : recipe;
    };
    registry.register('cutter', loader);

    const invalidError = await rejectedValue(registry.resolve('cutter'));
    expectRegistryError(invalidError, 'INVALID_RECIPE', 'cutter');
    expect(invalidError.cause).toBe(incompleteRecipe);

    await expect(registry.resolve('cutter')).resolves.toBe(recipe);
    expect(attempt).toBe(2);
  });

  it('rejette une recette null comme structure invalide', async () => {
    const registry = new RecipeRegistry();
    const loader = vi.fn<GenerationRecipeLoader<'cutter'>>(async () =>
      (null as unknown as GenerationRecipe<'cutter'>)
    );
    registry.register('cutter', loader);

    const invalidError = await rejectedValue(registry.resolve('cutter'));
    expectRegistryError(invalidError, 'INVALID_RECIPE', 'cutter');
    expect(invalidError.cause).toBeNull();
    expect(loader).toHaveBeenCalledOnce();
  });

  it('encapsule un getter kind fautif, préserve sa cause et permet un retry', async () => {
    const registry = new RecipeRegistry();
    const recipe = createCutterRecipe();
    const getterCause = new Error('getter kind fautif');
    const invalidRecipe = Object.defineProperty({}, 'kind', {
      get(): never {
        throw getterCause;
      }
    });
    let attempt = 0;
    const loader: GenerationRecipeLoader<'cutter'> = async () => {
      attempt += 1;
      return attempt === 1
        ? (invalidRecipe as unknown as GenerationRecipe<'cutter'>)
        : recipe;
    };
    registry.register('cutter', loader);

    const invalidError = await rejectedValue(registry.resolve('cutter'));
    expectRegistryError(invalidError, 'INVALID_RECIPE', 'cutter');
    expect(invalidError.cause).toBe(getterCause);

    await expect(registry.resolve('cutter')).resolves.toBe(recipe);
    expect(attempt).toBe(2);
  });

  it('inspecte les méthodes sans les appeler et encapsule un getter fautif', async () => {
    const registry = new RecipeRegistry();
    const getterCause = new Error('getter generate fautif');
    const createDefaults = vi.fn(createDefaultCutterParameters);
    const validate = vi.fn(validateCutter);
    const invalidRecipe = {
      kind: 'cutter',
      createDefaultParameters: createDefaults,
      validateParameters: validate,
      get generate(): GenerationRecipe<'cutter'>['generate'] {
        throw getterCause;
      }
    };
    registry.register(
      'cutter',
      async () => invalidRecipe as unknown as GenerationRecipe<'cutter'>
    );

    const invalidError = await rejectedValue(registry.resolve('cutter'));
    expectRegistryError(invalidError, 'INVALID_RECIPE', 'cutter');
    expect(invalidError.cause).toBe(getterCause);
    expect(createDefaults).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });

  it('rejette une recette chargée sous le mauvais kind puis permet un retry', async () => {
    const registry = new RecipeRegistry();
    const cutterRecipe = createCutterRecipe();
    const stampRecipe = createStampRecipe();
    let attempt = 0;
    const loader: GenerationRecipeLoader<'cutter'> = () => {
      attempt += 1;
      if (attempt === 1) {
        return Promise.resolve(stampRecipe) as unknown as Promise<
          GenerationRecipe<'cutter'>
        >;
      }
      return Promise.resolve(cutterRecipe);
    };
    registry.register('cutter', loader);

    const mismatchError = await rejectedValue(registry.resolve('cutter'));
    expectRegistryError(mismatchError, 'KIND_MISMATCH', 'cutter');

    await expect(registry.resolve('cutter')).resolves.toBe(cutterRecipe);
    expect(attempt).toBe(2);
  });

  it('expose directement defaults, validation et génération sans interpréter le contexte', async () => {
    const registry = new RecipeRegistry();
    const generate = vi.fn<GenerationRecipe<'cutter'>['generate']>(async () => []);
    const recipe = createCutterRecipe(generate);
    registry.register('cutter', async () => recipe);
    const context: GenerationContext = {
      signal: new AbortController().signal,
      revision: 17
    };

    const resolved = await registry.resolve('cutter');
    expect(resolved).toBe(recipe);
    expect(generate).not.toHaveBeenCalled();
    expect(resolved.createDefaultParameters()).toEqual(cutterParameters);
    expect(resolved.validateParameters(cutterParameters)).toEqual({
      valid: true,
      parameters: cutterParameters
    });

    await expect(resolved.generate(cutterDocument, context)).resolves.toEqual([]);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledWith(cutterDocument, context);
  });
});
