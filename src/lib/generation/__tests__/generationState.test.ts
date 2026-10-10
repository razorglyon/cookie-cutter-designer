import * as THREE from 'three';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { DesignDocumentV1 } from '../../domain/designDocument';
import { createDefaultCutterParameters } from '../../domain/designParameters';
import type { GenerationResult, GenerationState } from '../generationState';
import { freezeGenerationState } from '../generationState';

function mutableReadyState(object: THREE.Object3D): {
  readonly state: GenerationState;
  readonly document: { name: string };
  readonly dimensions: { width: number; depth: number; height: number };
  readonly errors: string[];
} {
  const svg = '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>';
  const document = {
    schemaVersion: 1 as const,
    id: 'snapshot',
    name: 'Snapshot initial',
    kind: 'cutter' as const,
    source: { type: 'svg' as const, fileName: 'snapshot.svg', svg },
    sketch: { svg, revision: 1 },
    parameters: createDefaultCutterParameters(),
    viewport: { showGrid: true, showAxes: false, showWallThickness: false },
    createdAt: '2026-07-23T10:00:00.000Z',
    updatedAt: '2026-07-23T10:01:00.000Z'
  };
  const dimensions = { width: 1, depth: 2, height: 3 };
  const errors: string[] = [];
  const artifact = {
    id: 'artifact',
    role: 'cutter' as const,
    object,
    dimensionsMm: dimensions,
    validation: {
      valid: true,
      errors,
      warnings: [] as string[],
      triangles: 1,
      shells: 1,
      meshes: 1,
      volume: 1,
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 2, z: 3 }
      }
    }
  };
  const state: GenerationState = {
    phase: 'ready',
    revision: 1,
    requestedDocument: document,
    result: {
      revision: 1,
      document,
      artifacts: [artifact]
    },
    error: null
  };

  return { state, document, dimensions, errors };
}

describe('GenerationState', () => {
  it('corrèle le kind du document ready avec celui du résultat', () => {
    type InvalidReadyState = {
      readonly phase: 'ready';
      readonly revision: number;
      readonly requestedDocument: DesignDocumentV1<'cutter'>;
      readonly result: GenerationResult<'stamp'>;
      readonly error: null;
    };

    expectTypeOf<InvalidReadyState>().not.toMatchTypeOf<GenerationState>();
  });

  it('détache et gèle profondément le snapshot sans geler Object3D', () => {
    const object = new THREE.Group();
    const source = mutableReadyState(object);
    const snapshot = freezeGenerationState(source.state);

    source.document.name = 'Mutation hostile';
    source.dimensions.width = 99;
    source.errors.push('Mutation hostile');

    expect(snapshot.phase).toBe('ready');
    if (snapshot.phase !== 'ready') {
      throw new Error('Le snapshot de test devait rester dans la phase ready.');
    }
    expect(snapshot.requestedDocument.name).toBe('Snapshot initial');
    expect(snapshot.result.document.name).toBe('Snapshot initial');
    expect(snapshot.result.artifacts[0].dimensionsMm.width).toBe(1);
    expect(snapshot.result.artifacts[0].validation.errors).toEqual([]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.requestedDocument)).toBe(true);
    expect(Object.isFrozen(snapshot.result)).toBe(true);
    expect(Object.isFrozen(snapshot.result.artifacts)).toBe(true);
    expect(Object.isFrozen(snapshot.result.artifacts[0].validation.bounds?.min)).toBe(true);
    expect(snapshot.result.artifacts[0].object).toBe(object);
    expect(Object.isFrozen(object)).toBe(false);
  });
});
