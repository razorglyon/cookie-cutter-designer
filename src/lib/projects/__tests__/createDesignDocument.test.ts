import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CUTTER_PARAMETERS_V1, DEFAULT_STAMP_PARAMETERS_V1 } from '../../domain/designParameters';
import { DesignDocumentValidationError, parseDesignDocumentV1 } from '../../domain/documentValidation';
import { createDesignDocument } from '../createDesignDocument';
import { CREATED_AT, INITIAL_SVG, svgSource, rasterSource } from './projectFixtures';

describe('createDesignDocument', () => {
  it.each(['cutter', 'stamp'] as const)('construit %s avec source SVG et defaults corrélés', (kind) => {
    const now = vi.fn(() => CREATED_AT);
    const createId = vi.fn(() => 'new-project');
    const source = svgSource();
    const document = createDesignDocument({ name: 'Étoile', kind, source }, { now, createId });
    expect(document).toEqual({
      schemaVersion: 1, id: 'new-project', name: 'Étoile', kind,
      source, sketch: { svg: INITIAL_SVG, revision: 0 },
      parameters: kind === 'cutter' ? DEFAULT_CUTTER_PARAMETERS_V1 : DEFAULT_STAMP_PARAMETERS_V1,
      viewport: { showGrid: true, showAxes: false, showWallThickness: false },
      createdAt: CREATED_AT, updatedAt: CREATED_AT
    });
    expect(parseDesignDocumentV1(document)).toEqual(document);
    expect(document.source).not.toBe(source);
    expect(document.source).not.toBe(document.sketch);
    expect(now).toHaveBeenCalledTimes(1);
    expect(createId).toHaveBeenCalledTimes(1);
  });
  it.each(['cutter', 'stamp'] as const)('conserve les métadonnées et la vectorisation raster pour %s', (kind) => {
    const source = rasterSource();
    const document = createDesignDocument({ name: 'Raster', kind, source }, {
      now: () => CREATED_AT, createId: () => 'raster-project'
    });
    expect(document.source).toEqual(source);
    expect(document.sketch).toEqual({ svg: INITIAL_SVG, revision: 0 });
    expect(Object.keys(document.source)).toEqual(['type', 'fileName', 'mimeType', 'vectorizedSvg']);
  });
  it.each(['svg', 'raster'] as const)('rejette la source %s dangereuse via le validateur V1', (type) => {
    const unsafe = '<svg><script>alert(1)</script></svg>';
    const source = type === 'svg'
      ? { type, fileName: 'bad.svg', svg: unsafe }
      : { type, fileName: 'bad.png', mimeType: 'image/png' as const, vectorizedSvg: unsafe };
    expect(() => createDesignDocument({ name: 'Bad', kind: 'cutter', source })).toThrow(DesignDocumentValidationError);
  });
  it.each([
    { now: () => 'invalid', createId: () => 'valid-id' },
    { now: () => CREATED_AT, createId: () => '' }
  ])('valide aussi identité et horloge injectées', (options) => {
    expect(() => createDesignDocument({ name: 'Valid', kind: 'cutter', source: svgSource() }, options)).toThrow(DesignDocumentValidationError);
  });
});
