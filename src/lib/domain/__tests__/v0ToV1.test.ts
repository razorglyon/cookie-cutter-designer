import { describe, expect, it, vi } from 'vitest';
import legacyFixture from '../__fixtures__/document-v0.json';
import { DEFAULT_CUTTER_PARAMETERS_V1 } from '../designParameters';
import {
  DesignDocumentValidationError,
  parseDesignDocumentV1
} from '../documentValidation';
import {
  migrateV0ToV1,
  type MigrationV0ToV1Options
} from '../migrations/v0ToV1';

function currentParameters(mode: 'cutter' | 'stamp') {
  return {
    wallThickness: 1,
    cuttingHeight: 12,
    totalHeight: 20,
    taperAngle: 7,
    targetSize: 82,
    sizeMode: 'width',
    handleStyle: 'round',
    handleHeight: 8,
    enableHandle: true,
    enableEmbossing: false,
    embossDepth: 2.5,
    buildPlateSize: 200,
    mode,
    stampDepth: 3,
    stampBase: true
  };
}

function inlineStamp(fileType: 'png' | 'jpg') {
  return {
    version: '1.0.0',
    name: `Tampon raster ${fileType}`,
    createdAt: '2025-01-02T03:04:05.000Z',
    modifiedAt: '2025-01-02T04:05:06.000Z',
    svgData: '<svg viewBox="0 0 20 20"><path d="M2 2h16v16H2z"/></svg>',
    parameters: currentParameters('stamp'),
    metadata: {
      originalFileName: `monogramme.${fileType}`,
      fileType
    }
  };
}

function expectMigrationError(
  value: unknown,
  path: string,
  options?: MigrationV0ToV1Options
): void {
  try {
    migrateV0ToV1(value, options);
    throw new Error('La migration aurait dû échouer.');
  } catch (error) {
    expect(error).toBeInstanceOf(DesignDocumentValidationError);
    if (!(error instanceof DesignDocumentValidationError)) {
      throw error;
    }
    expect(error.path).toBe(path);
    expect(error.message).toContain(path);
  }
}

describe('migrateV0ToV1', () => {
  it('migre la vraie fixture Cutter pre-mm sans muter l’entrée ni perdre silencieusement des données', () => {
    const input = structuredClone(legacyFixture);
    const before = structuredClone(input);
    const createId = vi.fn(() => '  import-legacy-stable  ');

    const first = migrateV0ToV1(input, { createId });

    expect(input).toEqual(before);
    expect(createId).toHaveBeenCalledOnce();
    expect(first.document.id).toBe('  import-legacy-stable  ');
    expect(first.document).toMatchObject({
      schemaVersion: 1,
      name: legacyFixture.name,
      kind: 'cutter',
      source: {
        type: 'svg',
        fileName: 'etoile-classique.svg',
        svg: legacyFixture.svgData
      },
      sketch: { svg: legacyFixture.svgData, revision: 0 },
      viewport: {
        showGrid: true,
        showAxes: false,
        showWallThickness: false
      },
      createdAt: legacyFixture.createdAt,
      updatedAt: legacyFixture.modifiedAt
    });
    expect(first.document.parameters.targetSize).toBe(
      DEFAULT_CUTTER_PARAMETERS_V1.targetSize * legacyFixture.parameters.scale
    );
    expect(first.document.parameters.sizeMode).toBe('longest');
    expect('scale' in first.document.parameters).toBe(false);
    expect(first.warnings.some((warning) => warning.includes('thumbnail'))).toBe(true);
    expect(first.warnings.some((warning) => warning.includes('notes'))).toBe(true);
  });

  it('génère par défaut des UUID distincts pour deux imports du même projet', () => {
    const uuidV4 =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const firstId = migrateV0ToV1(structuredClone(legacyFixture)).document.id;
    const secondId = migrateV0ToV1(structuredClone(legacyFixture)).document.id;

    expect(firstId).toMatch(uuidV4);
    expect(secondId).toMatch(uuidV4);
    expect(secondId).not.toBe(firstId);
  });

  it('rejette au chemin id une valeur vide retournée par la factory', () => {
    const createId = vi.fn(() => ' \t ');

    expectMigrationError(structuredClone(legacyFixture), 'id', { createId });
    expect(createId).toHaveBeenCalledOnce();
  });

  it('rejette au chemin id quand crypto.randomUUID est indisponible', () => {
    vi.stubGlobal('crypto', {});
    try {
      expectMigrationError(structuredClone(legacyFixture), 'id');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ['png', 'image/png'],
    ['jpg', 'image/jpeg']
  ] as const)(
    'migre un projet Stamp raster inline %s avec le MIME exact et conserve ses paramètres',
    (fileType, mimeType) => {
      const input = inlineStamp(fileType);
      const { document, warnings } = migrateV0ToV1(input);

      expect(document.kind).toBe('stamp');
      expect(document.source).toEqual({
        type: 'raster',
        fileName: `monogramme.${fileType}`,
        mimeType,
        vectorizedSvg: input.svgData
      });
      expect(document.parameters).toEqual(input.parameters);
      expect(warnings).toEqual([]);
    }
  );

  it('traite fileType absent comme une source SVG', () => {
    const input = {
      ...inlineStamp('png'),
      parameters: currentParameters('cutter'),
      metadata: { originalFileName: 'dessin-sans-type.svg' }
    };

    expect(migrateV0ToV1(input).document.source).toEqual({
      type: 'svg',
      fileName: 'dessin-sans-type.svg',
      svg: input.svgData
    });
  });

  it('rejette strictement les champs inconnus et les corruptions avec un chemin', () => {
    const unknownRoot = structuredClone(legacyFixture);
    Object.assign(unknownRoot, { futureField: true });
    expectMigrationError(unknownRoot, 'futureField');

    const unknownMetadata = structuredClone(legacyFixture);
    Object.assign(unknownMetadata.metadata, { futureField: true });
    expectMigrationError(unknownMetadata, 'metadata.futureField');

    const invalidScale = structuredClone(legacyFixture);
    invalidScale.parameters.scale = 0;
    expectMigrationError(invalidScale, 'parameters.scale');
  });

  it('retourne exactement un document accepté et recopié par le parseur V1', () => {
    const { document } = migrateV0ToV1(structuredClone(legacyFixture));
    const reparsed = parseDesignDocumentV1(document);

    expect(reparsed).toEqual(document);
    expect(reparsed).not.toBe(document);
  });
});
