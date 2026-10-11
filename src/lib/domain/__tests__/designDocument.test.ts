import * as THREE from 'three';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { GeometryValidationReport } from '../../utils/geometryValidation';
import type {
  DesignDocument,
  DesignDocumentV1,
  DesignDocumentV2,
  DesignSource,
  SketchDocument,
  ViewportPreferences
} from '../designDocument';
import type { GeneratedArtifact } from '../generatedArtifact';
import {
  createDefaultCutterParameters,
  createDefaultStampParameters,
  type CutterDesignParameters,
  type StampDesignParameters
} from '../designParameters';

const commonDocumentFields = {
  schemaVersion: 1 as const,
  name: 'Étoile',
  sketch: {
    svg: '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>',
    revision: 0
  },
  viewport: {
    showGrid: true,
    showAxes: false,
    showWallThickness: true
  },
  createdAt: '2026-07-23T10:00:00.000Z',
  updatedAt: '2026-07-23T10:00:00.000Z'
};

const cutterDocument = {
  ...commonDocumentFields,
  id: 'design-cutter',
  kind: 'cutter',
  source: {
    type: 'svg',
    fileName: 'etoile.svg',
    svg: '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>'
  },
  parameters: createDefaultCutterParameters()
} satisfies DesignDocumentV1<'cutter'>;

const stampDocument = {
  ...commonDocumentFields,
  id: 'design-stamp',
  kind: 'stamp',
  source: {
    type: 'raster',
    fileName: 'etoile.webp',
    mimeType: 'image/webp',
    vectorizedSvg: '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>'
  },
  parameters: createDefaultStampParameters()
} satisfies DesignDocumentV1<'stamp'>;

function verifyParameterNarrowing(document: DesignDocument): void {
  if (document.kind === 'stamp') {
    expectTypeOf(document).toEqualTypeOf<DesignDocument<'stamp'>>();
    expectTypeOf(document.parameters).toEqualTypeOf<StampDesignParameters>();
    expect(document.parameters.mode).toBe('stamp');
    return;
  }

  expectTypeOf(document).toEqualTypeOf<DesignDocument<'cutter'>>();
  expectTypeOf(document.parameters).toEqualTypeOf<CutterDesignParameters>();
  expect(document.parameters.mode).toBe('cutter');
}

describe('DesignDocumentV1', () => {
  it('exclut les recettes dont les paramètres ne sont pas implémentés', () => {
    expectTypeOf<DesignDocumentV1<'imprint-cutter'>>().toEqualTypeOf<never>();
    expectTypeOf<DesignDocument>().toEqualTypeOf<
      DesignDocumentV1<'cutter'> | DesignDocumentV1<'stamp'> | DesignDocumentV2<'cutter'> | DesignDocumentV2<'stamp'>
    >();
  });

  it('rend immuables le document et tous ses sous-objets persistants', () => {
    expectTypeOf<DesignDocumentV1<'cutter'>>().toEqualTypeOf<
      Readonly<DesignDocumentV1<'cutter'>>
    >();
    expectTypeOf<DesignSource>().toEqualTypeOf<Readonly<DesignSource>>();
    expectTypeOf<SketchDocument>().toEqualTypeOf<Readonly<SketchDocument>>();
    expectTypeOf<ViewportPreferences>().toEqualTypeOf<
      Readonly<ViewportPreferences>
    >();
    expectTypeOf<GeneratedArtifact>().toEqualTypeOf<Readonly<GeneratedArtifact>>();
  });

  it('représente un document Cutter sérialisable avec une source SVG', () => {
    expect(cutterDocument.kind).toBe('cutter');
    expect(cutterDocument.schemaVersion).toBe(1);
    expect(cutterDocument.source).toEqual({
      type: 'svg',
      fileName: 'etoile.svg',
      svg: expect.stringContaining('<svg')
    });
    expect(cutterDocument.sketch.revision).toBe(0);
    expect(cutterDocument.viewport.showWallThickness).toBe(true);
    verifyParameterNarrowing(cutterDocument);
  });

  it('représente un document Stamp issu d’un raster normalisé', () => {
    expect(stampDocument.kind).toBe('stamp');
    expect(stampDocument.source).toMatchObject({
      type: 'raster',
      fileName: 'etoile.webp',
      mimeType: 'image/webp'
    });
    expect(stampDocument.parameters.mode).toBe('stamp');
    verifyParameterNarrowing(stampDocument);
  });

  it('préserve séparément la source importée et le sketch édité au round-trip JSON', () => {
    const importedSvg = '<svg><path id="import-initial" d="M0 0h1v1z" /></svg>';
    const editedSvg = '<svg><path id="etat-courant" d="M0 0h2v2z" /></svg>';
    const document: DesignDocumentV1<'cutter'> = {
      ...cutterDocument,
      source: {
        ...cutterDocument.source,
        svg: importedSvg
      },
      sketch: {
        svg: editedSvg,
        revision: 1
      }
    };

    const serialized = JSON.stringify(document);
    const restored = JSON.parse(serialized) as DesignDocument;

    expect(serialized).not.toContain('"object":');
    expect('object' in restored).toBe(false);
    expect(restored.source.type).toBe('svg');
    if (restored.source.type !== 'svg') {
      throw new Error('La source restaurée devrait être SVG.');
    }
    expect(restored.source.svg).toBe(importedSvg);
    expect(restored.sketch.svg).toBe(editedSvg);
    expect(restored.source.svg).not.toBe(restored.sketch.svg);
    expect(restored).toEqual(document);
  });
});

describe('GeneratedArtifact', () => {
  it('accepte un THREE.Group et un rapport de géométrie valide', () => {
    const validation: GeometryValidationReport = {
      valid: true,
      errors: [],
      warnings: [],
      triangles: 12,
      shells: 1,
      meshes: 1,
      volume: 1000,
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 40, y: 30, z: 12 }
      }
    };
    const group = new THREE.Group();
    const artifact: GeneratedArtifact = {
      id: 'artifact-primary',
      role: 'primary',
      object: group,
      dimensionsMm: { width: 40, depth: 30, height: 12 },
      validation
    };

    expect(artifact.object).toBe(group);
    expect(artifact.object).toBeInstanceOf(THREE.Group);
    expect(artifact.dimensionsMm).toEqual({ width: 40, depth: 30, height: 12 });
    expect(artifact.validation.valid).toBe(true);
  });
});
