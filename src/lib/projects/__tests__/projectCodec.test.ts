import { describe, expect, it, vi } from 'vitest';
import legacyFixture from '../../domain/__fixtures__/document-v0.json';
import { DesignDocumentValidationError } from '../../domain/documentValidation';
import {
  PROJECT_FORMAT,
  PROJECT_VERSION,
  PROJECT_VERSION_V2,
  ProjectCodecError,
  decodeProject,
  encodeProject
} from '../projectCodec';

const SAFE_SVG = '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>';

function parameters(mode: 'cutter' | 'stamp') {
  return {
    wallThickness: 1,
    cuttingHeight: 10,
    totalHeight: 20,
    taperAngle: 0,
    targetSize: 100,
    sizeMode: 'longest',
    handleStyle: 'none',
    handleHeight: 0,
    enableHandle: false,
    enableEmbossing: false,
    embossDepth: 0,
    buildPlateSize: 200,
    mode,
    stampDepth: 1,
    stampBase: mode === 'stamp'
  };
}

function cutterDocument() {
  return {
    schemaVersion: 1,
    id: 'cutter-stable-id',
    name: 'Étoile',
    kind: 'cutter',
    source: { type: 'svg', fileName: 'etoile.svg', svg: SAFE_SVG },
    sketch: { svg: SAFE_SVG, revision: 3 },
    parameters: parameters('cutter'),
    viewport: { showGrid: true, showAxes: false, showWallThickness: true },
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z'
  };
}

function rasterStampDocument() {
  return {
    ...cutterDocument(),
    id: 'stamp-raster-stable-id',
    name: 'Tampon raster',
    kind: 'stamp',
    source: {
      type: 'raster',
      fileName: 'tampon.webp',
      mimeType: 'image/webp',
      vectorizedSvg: SAFE_SVG
    },
    parameters: parameters('stamp')
  };
}

function envelope(document: unknown): string {
  return JSON.stringify(
    { format: PROJECT_FORMAT, version: PROJECT_VERSION, document },
    null,
    2
  );
}

function expectCodecError(json: string, path: string, messageFragment?: string): void {
  try {
    decodeProject(json);
    throw new Error('Le décodage aurait dû échouer.');
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectCodecError);
    if (!(error instanceof ProjectCodecError)) {
      throw error;
    }
    expect(error.path).toBe(path);
    expect(error.message).toContain(path);
    if (messageFragment !== undefined) {
      expect(error.message).toContain(messageFragment);
    }
  }
}

describe('codec projet portable V1', () => {
  it('expose le format portable exact et sa version', () => {
    expect(PROJECT_FORMAT).toBe('cookie-cutter-designer-project');
    expect(PROJECT_VERSION).toBe(1);
  });

  it('fait un round-trip exact d’un Cutter avec des warnings vides', () => {
    const input = cutterDocument();
    const encoded = encodeProject(input);
    const decoded = decodeProject(encoded);

    expect(decoded.document).toEqual(input);
    expect(decoded.document).not.toBe(input);
    expect(decoded.warnings).toEqual([]);
    expect(JSON.parse(encoded)).toEqual({
      format: 'cookie-cutter-designer-project',
      version: 1,
      document: input
    });
  });

  it('sérialise V2 sans altérer V1 et refuse une enveloppe qui ne correspond pas au document', () => {
    const v1 = cutterDocument();
    const v2 = { ...v1, schemaVersion: 2, bridges: [{ id: 'bridge-1', from: { x: 0, y: 5 }, to: { x: 3, y: 5 }, widthMm: 2 }] };
    const encoded = encodeProject(v2);
    expect(JSON.parse(encoded).version).toBe(PROJECT_VERSION_V2);
    expect(decodeProject(encoded).document).toEqual(v2);
    expect(decodeProject(encodeProject(v1)).document).toEqual(v1);
    expectCodecError(JSON.stringify({ format: PROJECT_FORMAT, version: 1, document: v2 }), 'document.schemaVersion');
    expectCodecError(JSON.stringify({ format: PROJECT_FORMAT, version: 2, document: v1 }), 'document.schemaVersion');
  });

  it('fait un round-trip Stamp/raster sans inventer blob ni checksum', () => {
    const decoded = decodeProject(encodeProject(rasterStampDocument()));

    expect(decoded.document).toEqual(rasterStampDocument());
    expect(decoded.document.source).toEqual({
      type: 'raster',
      fileName: 'tampon.webp',
      mimeType: 'image/webp',
      vectorizedSvg: SAFE_SVG
    });
    expect('blob' in decoded.document.source).toBe(false);
    expect('checksum' in decoded.document.source).toBe(false);
  });

  it('produit un JSON indenté et déterministe sans régénérer l’ID', () => {
    const input = cutterDocument();
    const first = encodeProject(input);
    const second = encodeProject(structuredClone(input));

    expect(first).toBe(second);
    expect(first).toContain('\n  "format": "cookie-cutter-designer-project",');
    expect(first).toContain('\n    "id": "cutter-stable-id",');
    expect(first.endsWith('\n')).toBe(false);
    expect(decodeProject(first).document.id).toBe('cutter-stable-id');
  });

  it('rejette le JSON invalide et toute enveloppe non objet', () => {
    expectCodecError('{', '$', 'JSON invalide');
    for (const value of [null, [], 'projet', 1, true]) {
      expectCodecError(JSON.stringify(value), '$', 'objet');
    }
  });

  it('conserve le SyntaxError d’origine comme cause d’un JSON invalide', () => {
    const cause = new SyntaxError('JSON de test invalide');
    const parse = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw cause;
    });

    try {
      decodeProject('{');
      throw new Error('Le décodage aurait dû échouer.');
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectCodecError);
      if (!(error instanceof ProjectCodecError)) {
        throw error;
      }
      expect(error.cause).toBe(cause);
    } finally {
      parse.mockRestore();
    }
  });

  it('rejette les clés d’enveloppe manquantes ou inconnues', () => {
    expectCodecError(JSON.stringify({ version: 1, document: cutterDocument() }), 'format');
    expectCodecError(
      JSON.stringify({ format: PROJECT_FORMAT, document: cutterDocument() }),
      'version'
    );
    expectCodecError(
      JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION }),
      'document'
    );
    expectCodecError(
      JSON.stringify({
        format: PROJECT_FORMAT,
        version: PROJECT_VERSION,
        document: cutterDocument(),
        object3D: {}
      }),
      'object3D'
    );
  });

  it('rejette un mauvais format et les versions futures ou inconnues', () => {
    expectCodecError(
      JSON.stringify({ format: 'autre-format', version: 1, document: cutterDocument() }),
      'format'
    );
    expectCodecError(
      JSON.stringify({ format: PROJECT_FORMAT, version: 3, document: cutterDocument() }),
      'version',
      'future'
    );
    expectCodecError(
      JSON.stringify({
        format: PROJECT_FORMAT,
        version: 3,
        document: cutterDocument(),
        futureMetadata: true
      }),
      'version',
      'future'
    );
    expectCodecError(
      JSON.stringify({ format: PROJECT_FORMAT, version: 0, document: cutterDocument() }),
      'version',
      'inconnue'
    );
  });

  it('rejette un champ Object3D au lieu de le sérialiser silencieusement', () => {
    const input = Object.assign(cutterDocument(), { object3D: { type: 'Mesh' } });

    expect(() => encodeProject(input)).toThrow(DesignDocumentValidationError);
  });

  it('laisse la frontière domaine rejeter un SVG actif', () => {
    const input = cutterDocument();
    input.source.svg = '<svg><script>alert(1)</script></svg>';

    expect(() => decodeProject(envelope(input))).toThrow(DesignDocumentValidationError);
  });

  it('migre strictement la vraie fixture legacy avec factory ID et warnings', () => {
    const input = structuredClone(legacyFixture);
    const before = structuredClone(input);
    const createId = vi.fn(() => 'legacy-codec-id');

    const decoded = decodeProject(JSON.stringify(input), { createId });

    expect(createId).toHaveBeenCalledOnce();
    expect(decoded.document).toMatchObject({
      schemaVersion: 1,
      id: 'legacy-codec-id',
      name: legacyFixture.name,
      kind: 'cutter',
      source: { type: 'svg', fileName: 'etoile-classique.svg' }
    });
    expect(decoded.warnings.some((warning) => warning.includes('thumbnail'))).toBe(true);
    expect(decoded.warnings.some((warning) => warning.includes('notes'))).toBe(true);
    expect(input).toEqual(before);
  });

  it('ne mute ni le document encodé ni une enveloppe V1 décodée', () => {
    const document = cutterDocument();
    const documentBefore = structuredClone(document);
    const portable = {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      document: rasterStampDocument()
    };
    const portableBefore = structuredClone(portable);

    encodeProject(document);
    const decoded = decodeProject(JSON.stringify(portable));

    expect(document).toEqual(documentBefore);
    expect(portable).toEqual(portableBefore);
    expect(decoded.document).not.toBe(portable.document);
  });
});
