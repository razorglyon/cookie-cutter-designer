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
  createDefaultStampParameters,
  type StampDesignParameters
} from '../../../domain/designParameters';
import type { GenerationContext } from '../../generationRecipe';
import { disposeObject3D } from '../../../utils/disposeThree';
import {
  CutterGenerationError,
  GENERATION_LIMITS
} from '../../../utils/generationValidation';
import { validatePrintableObject } from '../../../utils/geometryValidation';
import { getShapeById } from '../../../utils/shapeLibrary';
import { generateStamp } from '../../../utils/stampGenerator';
import {
  dimensionsFromBounds,
  inspectSvgTopology,
  LEGACY_HASH_ALGORITHM,
  legacyStampFixture,
  logicalTriangleHash
} from '../../../utils/__tests__/legacyGeometryFixtureSupport';
import { installSvgLoaderDomParserAdapter } from '../../../utils/__tests__/svgDomTestSupport';
import { stampRecipe } from '../stampRecipe';
import { serializeSTL } from '../../../utils/stlExporter';

vi.mock('../../../utils/stampGenerator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/stampGenerator')>();
  return {
    ...actual,
    generateStamp: vi.fn(actual.generateStamp)
  };
});

const generateStampMock = vi.mocked(generateStamp);
let restoreDomParser: (() => void) | undefined;

beforeAll(() => {
  restoreDomParser = installSvgLoaderDomParserAdapter();
});

beforeEach(() => {
  generateStampMock.mockClear();
});

afterAll(() => {
  restoreDomParser?.();
});

function createStampDocument(
  parameters: StampDesignParameters = { ...legacyStampFixture.success.parameters },
  svg = legacyStampFixture.success.svg
): DesignDocumentV1<'stamp'> {
  return {
    schemaVersion: 1,
    id: 'legacy-stamp-document',
    name: 'Fixture Stamp legacy',
    kind: 'stamp',
    source: {
      type: 'svg',
      fileName: 'legacy-stamp.svg',
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

function disposableTwoShellGroup(): {
  readonly object: THREE.Group;
  readonly objectClear: ReturnType<typeof vi.spyOn>;
  readonly geometryDisposes: readonly ReturnType<typeof vi.spyOn>[];
  readonly materialDisposes: readonly ReturnType<typeof vi.spyOn>[];
} {
  const firstGeometry = new THREE.BoxGeometry(2, 2, 2);
  const secondGeometry = new THREE.BoxGeometry(2, 2, 2);
  const firstMaterial = new THREE.MeshBasicMaterial();
  const secondMaterial = new THREE.MeshBasicMaterial();
  const firstMesh = new THREE.Mesh(firstGeometry, firstMaterial);
  const secondMesh = new THREE.Mesh(secondGeometry, secondMaterial);
  firstMesh.position.set(-3, 1, 0);
  secondMesh.position.set(3, 1, 0);

  const object = new THREE.Group();
  object.add(firstMesh, secondMesh);
  return {
    object,
    objectClear: vi.spyOn(object, 'clear'),
    geometryDisposes: [
      vi.spyOn(firstGeometry, 'dispose'),
      vi.spyOn(secondGeometry, 'dispose')
    ],
    materialDisposes: [
      vi.spyOn(firstMaterial, 'dispose'),
      vi.spyOn(secondMaterial, 'dispose')
    ]
  };
}

async function captureFailure(
  document: DesignDocumentV1<'stamp'>,
  context: GenerationContext
): Promise<unknown> {
  let artifacts: readonly GeneratedArtifact<'stamp'>[] | undefined;
  let thrown: unknown;

  try {
    artifacts = await stampRecipe.generate(document, context);
  } catch (error) {
    thrown = error;
  } finally {
    for (const artifact of artifacts ?? []) disposeObject3D(artifact.object);
  }

  return thrown;
}

describe('stampRecipe', () => {
  it.each(['raised', 'recessed'] as const)('reads V4 %s from the document, never from legacy params', async imprintMode => {
    const v1 = createStampDocument({ ...legacyStampFixture.success.parameters, stampDepth: 2 });
    const document = { ...v1, schemaVersion: 4 as const, bridges: [] as const, imprintMode };
    const artifacts = await stampRecipe.generate(document, generationContext(new AbortController().signal));
    try {
      if (imprintMode === 'raised') expect(generateStampMock).toHaveBeenLastCalledWith(v1.sketch.svg, v1.parameters);
      else expect(generateStampMock).toHaveBeenLastCalledWith(v1.sketch.svg, v1.parameters, 'recessed');
      expect(artifacts[0].validation.valid).toBe(true); expect(artifacts[0].validation.shells).toBe(1);
      if (imprintMode === 'recessed') {
        const handleHeight = v1.parameters.enableHandle && v1.parameters.handleStyle !== 'none' ? v1.parameters.handleHeight : 0;
        expect(artifacts[0].dimensionsMm.height).toBeCloseTo(handleHeight + 4, 5);
      }
    } finally { for (const artifact of artifacts) disposeObject3D(artifact.object); }
  });

  it('keeps V2 raised geometry and binary STL identical to the V1 fixture', async () => {
    const v1 = createStampDocument();
    const v2 = { ...v1, schemaVersion: 2 as const, bridges: [] };
    const first = await stampRecipe.generate(v1, generationContext(new AbortController().signal));
    let second: readonly GeneratedArtifact<'stamp'>[] = [];
    try {
      second = await stampRecipe.generate(v2, generationContext(new AbortController().signal));
      expect(generateStampMock).toHaveBeenLastCalledWith(v1.sketch.svg, v1.parameters);
      expect(logicalTriangleHash(second[0].object)).toBe(legacyStampFixture.expected.logicalTriangleHash);
      const a = serializeSTL(first[0].object, true) as DataView;
      const b = serializeSTL(second[0].object, true) as DataView;
      expect(new Uint8Array(b.buffer)).toEqual(new Uint8Array(a.buffer));
    } finally { for (const item of [...first, ...second]) disposeObject3D(item.object); }
  });

  it('expose des paramètres Stamp par défaut frais issus du domaine', () => {
    const first = stampRecipe.createDefaultParameters();
    const second = stampRecipe.createDefaultParameters();

    expect(stampRecipe.kind).toBe('stamp');
    expect(first).toEqual(createDefaultStampParameters());
    expect(second).toEqual(first);
    expect(first).not.toBe(second);
  });

  it('valide et reconstruit une copie gelée sans retenir ni muter l’entrée', () => {
    const input = { ...legacyStampFixture.success.parameters };
    const inputSnapshot = structuredClone(input);
    const result = stampRecipe.validateParameters(input);

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error('Les paramètres Stamp de fixture devraient être valides.');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.parameters)).toBe(true);
    expect(result.parameters).toEqual(input);
    expect(result.parameters).not.toBe(input);
    expect(input).toEqual(inputSnapshot);
  });

  it('retourne des issues gelées pour mode Cutter, stampBase false et champ inconnu', () => {
    const invalidMode = stampRecipe.validateParameters({
      ...legacyStampFixture.success.parameters,
      mode: 'cutter'
    });
    const invalidBase = stampRecipe.validateParameters({
      ...legacyStampFixture.success.parameters,
      stampBase: false
    });
    const unknownInput = {
      ...legacyStampFixture.success.parameters,
      unknownField: { preserved: true }
    };
    const unknownSnapshot = structuredClone(unknownInput);
    const unknownField = stampRecipe.validateParameters(unknownInput);

    expect(invalidMode).toEqual({
      valid: false,
      issues: [expect.objectContaining({ path: 'mode', code: 'INVALID_PARAMS' })]
    });
    expect(invalidBase).toEqual({
      valid: false,
      issues: [expect.objectContaining({ path: 'stampBase', code: 'INVALID_PARAMS' })]
    });
    expect(unknownField).toEqual({
      valid: false,
      issues: [expect.objectContaining({ path: 'unknownField', code: 'INVALID_PARAMS' })]
    });
    expect(unknownInput).toEqual(unknownSnapshot);
    if (invalidBase.valid) throw new Error('stampBase false devrait produire une issue.');
    expect(Object.isFrozen(invalidBase)).toBe(true);
    expect(Object.isFrozen(invalidBase.issues)).toBe(true);
    expect(Object.isFrozen(invalidBase.issues[0])).toBe(true);
  });

  it('convertit une Proxy hostile multi-traps en erreur UI-safe', () => {
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

    const result = stampRecipe.validateParameters(hostileInput);
    expect(result).toEqual({
      valid: false,
      issues: [
        {
          path: 'parameters',
          code: 'UNEXPECTED_VALIDATION_ERROR',
          message: 'An unexpected error occurred while validating Stamp parameters.'
        }
      ]
    });
    if (result.valid) throw new Error('La Proxy hostile devrait être rejetée.');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.issues)).toBe(true);
    expect(Object.isFrozen(result.issues[0])).toBe(true);
  });

  it('rejette les paramètres invalides avant tout appel au générateur', async () => {
    const error = await captureFailure(
      createStampDocument({
        ...legacyStampFixture.success.parameters,
        wallThickness: 0.1
      }),
      generationContext(new AbortController().signal)
    );

    expect(error).toBeInstanceOf(CutterGenerationError);
    expect(error).toMatchObject({
      code: 'INVALID_PARAMS',
      details: expect.objectContaining({ field: 'wallThickness' })
    });
    expect(generateStampMock).not.toHaveBeenCalled();
  });

  it('rejette un kind runtime incohérent avant le générateur', async () => {
    const document = createStampDocument();
    Reflect.set(document, 'kind', 'cutter');
    const error = await captureFailure(
      document,
      generationContext(new AbortController().signal)
    );

    expect(error).toBeInstanceOf(CutterGenerationError);
    expect(error).toMatchObject({
      code: 'INVALID_PARAMS',
      details: expect.objectContaining({ field: 'kind' })
    });
    expect(generateStampMock).not.toHaveBeenCalled();
  });

  it('fait gagner la pré-annulation sur kind, paramètres et SVG invalides', async () => {
    const controller = new AbortController();
    controller.abort();
    const document = createStampDocument(
      {
        ...legacyStampFixture.failure.parameters,
        wallThickness: 0.1,
        stampBase: false
      },
      legacyStampFixture.failure.svg
    );
    Reflect.set(document, 'kind', 'cutter');

    const error = await captureFailure(document, generationContext(controller.signal));
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(generateStampMock).not.toHaveBeenCalled();
  });

  it('rejoue exactement la fixture Stamp legacy via la recette', async () => {
    const document = createStampDocument();
    let artifacts: readonly GeneratedArtifact<'stamp'>[] | undefined;

    try {
      artifacts = await stampRecipe.generate(
        document,
        generationContext(new AbortController().signal, 42)
      );
      expect(artifacts).toHaveLength(1);
      expect(Object.isFrozen(artifacts)).toBe(true);

      const artifact = artifacts[0];
      expect(Object.isFrozen(artifact)).toBe(true);
      expect(Object.isFrozen(artifact.dimensionsMm)).toBe(true);
      expect(Object.isFrozen(artifact.object)).toBe(false);
      expect(artifact.id).toBe('legacy-stamp-document:stamp:42');
      expect(artifact.role).toBe('stamp');
      expect(generateStampMock).toHaveBeenCalledTimes(1);
      expect(generateStampMock).toHaveBeenCalledWith(
        legacyStampFixture.success.svg,
        legacyStampFixture.success.parameters
      );

      expect(artifact.object.userData.params).toEqual(
        legacyStampFixture.success.parameters
      );
      expect(artifact.object.userData.contourCount).toBe(
        legacyStampFixture.topology.contours
      );
      expect(inspectSvgTopology(legacyStampFixture.success.svg)).toEqual(
        legacyStampFixture.topology
      );

      const report = artifact.validation;
      expect(report.valid, report.errors.join('\n')).toBe(true);
      expect(report.triangles).toBe(76);
      expect(report.triangles).toBe(legacyStampFixture.expected.triangles);
      expect(report.shells).toBe(1);
      expect(report.shells).toBe(legacyStampFixture.expected.shells);
      expect(report.volume).toBeGreaterThan(0);
      expectAbsoluteTolerance(
        report.volume,
        legacyStampFixture.expected.signedVolumeMm3,
        legacyStampFixture.tolerance.signedVolumeMm3
      );
      expect(report.bounds).not.toBeNull();
      if (!report.bounds) throw new Error('La recette Stamp doit conserver les bounds monde.');
      expect(report.bounds.min.y).toBeCloseTo(0, 5);
      expect(artifact.dimensionsMm).toEqual(dimensionsFromBounds(report.bounds));
      expectAbsoluteTolerance(
        artifact.dimensionsMm.width,
        legacyStampFixture.expected.dimensionsMm.width,
        legacyStampFixture.tolerance.dimensionsMm
      );
      expectAbsoluteTolerance(
        artifact.dimensionsMm.depth,
        legacyStampFixture.expected.dimensionsMm.depth,
        legacyStampFixture.tolerance.dimensionsMm
      );
      expectAbsoluteTolerance(
        artifact.dimensionsMm.height,
        legacyStampFixture.expected.dimensionsMm.height,
        legacyStampFixture.tolerance.dimensionsMm
      );
      expect(legacyStampFixture.expected.logicalTriangleHashAlgorithm).toBe(
        LEGACY_HASH_ALGORITHM
      );
      expect(logicalTriangleHash(artifact.object)).toBe(
        legacyStampFixture.expected.logicalTriangleHash
      );
    } finally {
      for (const artifact of artifacts ?? []) disposeObject3D(artifact.object);
    }
  });

  it('préserve le code NO_VALID_CONTOURS de la fixture d’échec legacy', async () => {
    const error = await captureFailure(
      createStampDocument(
        { ...legacyStampFixture.failure.parameters },
        legacyStampFixture.failure.svg
      ),
      generationContext(new AbortController().signal)
    );

    expect(error).toBeInstanceOf(CutterGenerationError);
    expect(error).toMatchObject({ code: 'NO_VALID_CONTOURS' });
  });

  it('propage par identité une erreur sentinelle rejetée par le générateur', async () => {
    const sentinel = new CutterGenerationError(
      'INVALID_GEOMETRY',
      'Erreur sentinelle du générateur.',
      { field: 'sentinel' }
    );
    generateStampMock.mockRejectedValueOnce(sentinel);

    const error = await captureFailure(
      createStampDocument(),
      generationContext(new AbortController().signal)
    );
    expect(error).toBe(sentinel);
  });

  it('rejette deux solides fermés disjoints et dispose toutes les ressources une fois', async () => {
    const generated = disposableTwoShellGroup();
    expect(validatePrintableObject(generated.object).valid).toBe(true);
    generateStampMock.mockResolvedValueOnce(generated.object);

    const error = await captureFailure(
      createStampDocument(),
      generationContext(new AbortController().signal)
    );

    expect(error).toBeInstanceOf(CutterGenerationError);
    expect(error).toMatchObject({
      code: 'INVALID_GEOMETRY',
      details: expect.objectContaining({
        errors: expect.arrayContaining([
          'The printable object must contain a single connected shell.'
        ])
      })
    });
    expect(generated.objectClear).toHaveBeenCalledTimes(1);
    for (const dispose of generated.geometryDisposes) {
      expect(dispose).toHaveBeenCalledTimes(1);
    }
    for (const dispose of generated.materialDisposes) {
      expect(dispose).toHaveBeenCalledTimes(1);
    }
  });

  it('dispose une fois l’objet détenu lors d’une annulation post-await', async () => {
    const controller = new AbortController();
    const generated = disposableInvalidGroup();
    generateStampMock.mockImplementationOnce(async () => {
      controller.abort();
      return generated.object;
    });

    const error = await captureFailure(
      createStampDocument(),
      generationContext(controller.signal)
    );

    expect(error).toMatchObject({ name: 'AbortError' });
    expect(generated.objectClear).toHaveBeenCalledTimes(1);
    expect(generated.geometryDispose).toHaveBeenCalledTimes(1);
    expect(generated.materialDispose).toHaveBeenCalledTimes(1);
  });

  it('garde le Heart manifold au stampDepth maximal avec le handle round actif', async () => {
    const heartSvg = getShapeById('heart')?.svg;
    expect(heartSvg).toBeDefined();
    if (heartSvg === undefined) throw new Error('La fixture Heart intégrée est requise.');

    const parameters: StampDesignParameters = {
      ...createDefaultStampParameters(),
      stampDepth: GENERATION_LIMITS.maxStampDepth,
      enableHandle: true,
      handleStyle: 'round'
    };
    let artifacts: readonly GeneratedArtifact<'stamp'>[] | undefined;

    try {
      artifacts = await stampRecipe.generate(
        createStampDocument(parameters, heartSvg),
        generationContext(new AbortController().signal, 99)
      );
      expect(artifacts).toHaveLength(1);
      const report = artifacts[0].validation;
      expect(report.valid, report.errors.join('\n')).toBe(true);
      expect(report.shells).toBe(1);
      expect(report.volume).toBeGreaterThan(0);
      expect(generateStampMock).toHaveBeenCalledWith(heartSvg, parameters);
    } finally {
      for (const artifact of artifacts ?? []) disposeObject3D(artifact.object);
    }
  });
});
