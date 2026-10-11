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

  it('préserve le schéma V2 et ses ponts dans les snapshots publics de génération', () => {
    const source = mutableReadyState(new THREE.Group());
    if (source.state.phase !== 'ready' || source.state.requestedDocument.kind !== 'cutter' || source.state.result.artifacts[0].role !== 'cutter') throw new Error('Fixture cutter ready attendue.');
    const bridge = { id: 'b', from: { x: 0, y: 50 }, to: { x: 35, y: 50 }, widthMm: 2 };
    const v2 = { ...source.state.requestedDocument, schemaVersion: 2 as const, bridges: [bridge] };
    const snapshot = freezeGenerationState({ ...source.state, requestedDocument: v2, result: { ...source.state.result, document: v2, artifacts: [source.state.result.artifacts[0]] } });
    bridge.from.y = 99;
    expect(snapshot.phase).toBe('ready');
    if (snapshot.phase !== 'ready') throw new Error('Snapshot ready attendu.');
    expect(snapshot.result.document.schemaVersion).toBe(2);
    expect(snapshot.requestedDocument.schemaVersion).toBe(2);
    if (snapshot.result.document.schemaVersion !== 2) throw new Error('V2 attendu.');
    expect(snapshot.result.document.bridges[0].from.y).toBe(50);
    expect(Object.isFrozen(snapshot.result.document.bridges[0].from)).toBe(true);
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
