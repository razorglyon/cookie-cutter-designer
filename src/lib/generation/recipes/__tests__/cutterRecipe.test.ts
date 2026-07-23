import * as THREE from 'three';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import type { DesignDocumentV1 } from '../../../domain/designDocument';
import type { GeneratedArtifact } from '../../../domain/generatedArtifact';
import {
  createDefaultCutterParameters,
  type CutterDesignParameters
} from '../../../domain/designParameters';
import type { GenerationContext } from '../../generationRecipe';
import { disposeObject3D } from '../../../utils/disposeThree';
import {
  CutterGenerationError
} from '../../../utils/generationValidation';
import { generateCookieCutter } from '../../../utils/cookieCutterGenerator';
import {
  dimensionsFromBounds,
  inspectSvgTopology,
  LEGACY_HASH_ALGORITHM,
  legacyCutterFixture,
  logicalTriangleHash
} from '../../../utils/__tests__/legacyGeometryFixtureSupport';
import { installSvgLoaderDomParserAdapter } from '../../../utils/__tests__/svgDomTestSupport';
import { cutterRecipe } from '../cutterRecipe';

vi.mock('../../../utils/cookieCutterGenerator', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../../utils/cookieCutterGenerator')
  >();
  return {
    ...actual,
    generateCookieCutter: vi.fn(actual.generateCookieCutter)
  };
});

const generateCookieCutterMock = vi.mocked(generateCookieCutter);
let restoreDomParser: (() => void) | undefined;

beforeAll(() => {
  restoreDomParser = installSvgLoaderDomParserAdapter();
});

beforeEach(() => {
  generateCookieCutterMock.mockClear();
});

afterAll(() => {
  restoreDomParser?.();
});

function createCutterDocument(
  parameters: CutterDesignParameters = { ...legacyCutterFixture.success.parameters },
  svg = legacyCutterFixture.success.svg
): DesignDocumentV1<'cutter'> {
  return {
    schemaVersion: 1,
    id: 'legacy-cutter-document',
    name: 'Fixture Cutter legacy',
    kind: 'cutter',
    source: {
      type: 'svg',
      fileName: 'legacy-cutter.svg',
      svg
    },
    sketch: { svg, revision: 3 },
    parameters,
    viewport: {
      showGrid: true,
      showAxes: true,
      showWallThickness: false
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

function generationContext(signal: AbortSignal, revision = 17): GenerationContext {
  return { signal, revision };
}

function expectAbsoluteTolerance(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function disposableInvalidGroup(): {
  readonly object: THREE.Group;
  readonly objectClear: ReturnType<typeof vi.spyOn>;
  readonly geometryDispose: ReturnType<typeof vi.spyOn>;
  readonly materialDispose: ReturnType<typeof vi.spyOn>;
} {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshBasicMaterial();
  const object = new THREE.Group();
  object.add(new THREE.Mesh(geometry, material));
  return {
    object,
    objectClear: vi.spyOn(object, 'clear'),
    geometryDispose: vi.spyOn(geometry, 'dispose'),
    materialDispose: vi.spyOn(material, 'dispose')
  };
}

async function captureFailure(
  document: DesignDocumentV1<'cutter'>,
  context: GenerationContext
): Promise<unknown> {
  let artifacts: readonly GeneratedArtifact<'cutter'>[] | undefined;
  let thrown: unknown;

  try {
    artifacts = await cutterRecipe.generate(document, context);
  } catch (error) {
    thrown = error;
  } finally {
    for (const artifact of artifacts ?? []) disposeObject3D(artifact.object);
  }

  return thrown;
}

describe('cutterRecipe', () => {
  it('expose des paramètres par défaut frais issus du domaine', () => {
    const first = cutterRecipe.createDefaultParameters();
    const second = cutterRecipe.createDefaultParameters();

    expect(cutterRecipe.kind).toBe('cutter');
    expect(first).toEqual(createDefaultCutterParameters());
    expect(second).toEqual(first);
    expect(first).not.toBe(second);
  });

  it('valide et reconstruit des paramètres Cutter sans retenir ni muter l’entrée', () => {
    const input = { ...legacyCutterFixture.success.parameters };
    const inputSnapshot = structuredClone(input);
    const result = cutterRecipe.validateParameters(input);

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error('Les paramètres de fixture devraient être valides.');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.parameters)).toBe(true);
    expect(result.parameters).toEqual(input);
    expect(result.parameters).not.toBe(input);
    expect(input).toEqual(inputSnapshot);
  });

  it('retourne des issues discriminées et pathées pour un mode ou un champ invalide', () => {
    const invalidMode = cutterRecipe.validateParameters({
      ...legacyCutterFixture.success.parameters,
      mode: 'stamp',
      stampBase: true
    });
    const invalidField = cutterRecipe.validateParameters({
      ...legacyCutterFixture.success.parameters,
      wallThickness: 0.1
    });
    const unknownFieldInput = {
      ...legacyCutterFixture.success.parameters,
      unknownField: { preserved: true }
    };
    const unknownFieldInputSnapshot = structuredClone(unknownFieldInput);
    const unknownField = cutterRecipe.validateParameters(unknownFieldInput);

    expect(invalidMode).toEqual({
      valid: false,
      issues: [
        expect.objectContaining({ path: 'mode', code: 'INVALID_PARAMS' })
      ]
    });
    expect(invalidField).toEqual({
      valid: false,
      issues: [
        expect.objectContaining({ path: 'wallThickness', code: 'INVALID_PARAMS' })
      ]
    });
    expect(unknownField).toEqual({
      valid: false,
      issues: [expect.objectContaining({ code: 'INVALID_PARAMS' })]
    });
    expect(unknownFieldInput).toEqual(unknownFieldInputSnapshot);
    if (invalidField.valid === true) {
      throw new Error('Le champ invalide devrait produire une issue.');
    }
    expect(Object.isFrozen(invalidField)).toBe(true);
    expect(Object.isFrozen(invalidField.issues)).toBe(true);
    expect(Object.isFrozen(invalidField.issues[0])).toBe(true);
  });

  it('structure aussi une erreur de validation inattendue', () => {
    const sentinel = new Error('lecture hostile');
    const throwSentinel = (): never => {
      throw sentinel;
    };
    const hostileInput = new Proxy({}, {
      get: throwSentinel,
      has: throwSentinel,
      ownKeys: throwSentinel,
      getOwnPropertyDescriptor: throwSentinel
    });

    expect(cutterRecipe.validateParameters(hostileInput)).toEqual({
      valid: false,
      issues: [
        {
          path: 'parameters',
          code: 'UNEXPECTED_VALIDATION_ERROR',
          message: 'An unexpected error occurred while validating Cutter parameters.'
        }
      ]
    });
  });

  it('rejette un kind runtime incohérent avant le générateur', async () => {
    const document = createCutterDocument();
    Reflect.set(document, 'kind', 'stamp');
    const error = await captureFailure(
      document,
      generationContext(new AbortController().signal)
    );

    expect(error).toBeInstanceOf(CutterGenerationError);
    expect(error).toMatchObject({
      code: 'INVALID_PARAMS',
      details: expect.objectContaining({ field: 'kind' })
    });
    expect(generateCookieCutterMock).not.toHaveBeenCalled();
  });

  it('fait gagner une pré-annulation même avec le SVG d’échec legacy', async () => {
    const controller = new AbortController();
    controller.abort();
    const document = createCutterDocument(
      {
        ...legacyCutterFixture.failure.parameters,
        wallThickness: 0.1
      },
      legacyCutterFixture.failure.svg
    );
    Reflect.set(document, 'kind', 'stamp');
    const error = await captureFailure(document, generationContext(controller.signal));

    expect(error).toMatchObject({ name: 'AbortError' });
    expect(generateCookieCutterMock).not.toHaveBeenCalled();
  });

  it('rejette wallThickness invalide avant le générateur avec une erreur pathée', async () => {
    const document = createCutterDocument({
      ...legacyCutterFixture.success.parameters,
      wallThickness: 0.1
    });
    const error = await captureFailure(
      document,
      generationContext(new AbortController().signal)
    );

    expect(error).toBeInstanceOf(CutterGenerationError);
    expect(error).toMatchObject({
      code: 'INVALID_PARAMS',
      details: expect.objectContaining({ field: 'wallThickness' })
    });
    expect(generateCookieCutterMock).not.toHaveBeenCalled();
  });

  it('rejoue exactement la fixture Cutter legacy via la recette', async () => {
    const controller = new AbortController();
    const document = createCutterDocument();
    let artifacts: readonly GeneratedArtifact<'cutter'>[] | undefined;

    try {
      artifacts = await cutterRecipe.generate(
        document,
        generationContext(controller.signal, 42)
      );
      expect(artifacts).toHaveLength(1);
      expect(Object.isFrozen(artifacts)).toBe(true);

      const artifact = artifacts[0];
      expect(Object.isFrozen(artifact)).toBe(true);
      expect(Object.isFrozen(artifact.dimensionsMm)).toBe(true);
      expect(Object.isFrozen(artifact.object)).toBe(false);
      expect(artifact.id).toBe('legacy-cutter-document:cutter:42');
      expect(artifact.role).toBe('cutter');
      expect(generateCookieCutterMock).toHaveBeenCalledTimes(1);
      expect(generateCookieCutterMock).toHaveBeenCalledWith(
        legacyCutterFixture.success.svg,
        legacyCutterFixture.success.parameters
      );

      expect(artifact.object.userData.params).toEqual(
        legacyCutterFixture.success.parameters
      );
      expect(artifact.object.userData.contourCount).toBe(
        legacyCutterFixture.topology.contours
      );
      expect(inspectSvgTopology(legacyCutterFixture.success.svg)).toEqual(
        legacyCutterFixture.topology
      );

      const report = artifact.validation;
      expect(report.valid, report.errors.join('\n')).toBe(true);
      expect(report.triangles).toBe(legacyCutterFixture.expected.triangles);
      expect(report.shells).toBe(legacyCutterFixture.expected.shells);
      expect(report.volume).toBeGreaterThan(0);
      expectAbsoluteTolerance(
        report.volume,
        legacyCutterFixture.expected.signedVolumeMm3,
        legacyCutterFixture.tolerance.signedVolumeMm3
      );
      expect(report.bounds).not.toBeNull();
      if (!report.bounds) throw new Error('La recette doit conserver les bounds monde.');
      expect(report.bounds.min.y).toBeCloseTo(0, 5);
      expect(artifact.dimensionsMm).toEqual(dimensionsFromBounds(report.bounds));
      expectAbsoluteTolerance(
        artifact.dimensionsMm.width,
        legacyCutterFixture.expected.dimensionsMm.width,
        legacyCutterFixture.tolerance.dimensionsMm
      );
      expectAbsoluteTolerance(
        artifact.dimensionsMm.depth,
        legacyCutterFixture.expected.dimensionsMm.depth,
        legacyCutterFixture.tolerance.dimensionsMm
      );
      expectAbsoluteTolerance(
        artifact.dimensionsMm.height,
        legacyCutterFixture.expected.dimensionsMm.height,
        legacyCutterFixture.tolerance.dimensionsMm
      );
      expect(legacyCutterFixture.expected.logicalTriangleHashAlgorithm).toBe(
        LEGACY_HASH_ALGORITHM
      );
      expect(logicalTriangleHash(artifact.object)).toBe(
        legacyCutterFixture.expected.logicalTriangleHash
      );
    } finally {
      for (const artifact of artifacts ?? []) disposeObject3D(artifact.object);
    }
  });

  it('propage intact le code d’échec capturé par la fixture legacy', async () => {
    const document = createCutterDocument(
      { ...legacyCutterFixture.failure.parameters },
      legacyCutterFixture.failure.svg
    );
    const error = await captureFailure(
      document,
      generationContext(new AbortController().signal)
    );

    expect(error).toBeInstanceOf(CutterGenerationError);
    expect(error).toMatchObject({ code: legacyCutterFixture.failure.errorCode });
  });

  it('propage par identité une CutterGenerationError du générateur sans wrapping', async () => {
    const sentinel = new CutterGenerationError(
      'INVALID_GEOMETRY',
      'Erreur sentinelle du générateur.',
      { field: 'sentinel' }
    );
    generateCookieCutterMock.mockRejectedValueOnce(sentinel);

    const error = await captureFailure(
      createCutterDocument(),
      generationContext(new AbortController().signal)
    );

    expect(error).toBe(sentinel);
  });

  it('rejette une géométrie finale invalide et dispose ses ressources exactement une fois', async () => {
    const generated = disposableInvalidGroup();
    generateCookieCutterMock.mockResolvedValueOnce(generated.object);

    const error = await captureFailure(
      createCutterDocument(),
      generationContext(new AbortController().signal)
    );

    expect(error).toBeInstanceOf(CutterGenerationError);
    expect(error).toMatchObject({ code: 'INVALID_GEOMETRY' });
    expect(generated.objectClear).toHaveBeenCalledTimes(1);
    expect(generated.geometryDispose).toHaveBeenCalledTimes(1);
    expect(generated.materialDispose).toHaveBeenCalledTimes(1);
  });

  it('dispose exactement une fois un objet produit si le signal est annulé après l’await', async () => {
    const controller = new AbortController();
    const generated = disposableInvalidGroup();
    generateCookieCutterMock.mockImplementationOnce(async () => {
      controller.abort();
      return generated.object;
    });

    const error = await captureFailure(
      createCutterDocument(),
      generationContext(controller.signal)
    );

    expect(error).toMatchObject({ name: 'AbortError' });
    expect(generated.objectClear).toHaveBeenCalledTimes(1);
    expect(generated.geometryDispose).toHaveBeenCalledTimes(1);
    expect(generated.materialDispose).toHaveBeenCalledTimes(1);
  });
});
