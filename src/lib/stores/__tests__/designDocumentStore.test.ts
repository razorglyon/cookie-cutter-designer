import { get } from 'svelte/store';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { DesignDocumentV1 } from '../../domain/designDocument';
import {
  DEFAULT_STAMP_PARAMETERS_V1,
  createDefaultCutterParameters
} from '../../domain/designParameters';
import { DesignDocumentValidationError } from '../../domain/documentValidation';
import {
  createDesignDocumentStore,
  type DesignDocumentStore
} from '../designDocumentStore';

const SVG = '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>';
const EDITED_SVG = '<svg viewBox="0 0 10 10"><path d="M1 1h8v8z" /></svg>';

function createCutterDocument(): DesignDocumentV1<'cutter'> {
  return {
    schemaVersion: 1,
    id: 'design-cutter',
    name: 'Étoile',
    kind: 'cutter',
    source: { type: 'svg', fileName: 'etoile.svg', svg: SVG },
    sketch: { svg: SVG, revision: 0 },
    parameters: createDefaultCutterParameters(),
    viewport: { showGrid: true, showAxes: false, showWallThickness: false },
    createdAt: '2026-07-24T10:00:00.000Z',
    updatedAt: '2026-07-24T10:00:00.000Z'
  };
}

function createNow(...timestamps: string[]): () => string {
  const values = [...timestamps];
  return () => {
    const value = values.shift();
    if (value === undefined) {
      throw new Error('Aucun horodatage de test restant.');
    }
    return value;
  };
}

function expectPersistentSnapshotFrozen(document: DesignDocumentV1): void {
  expect(Object.isFrozen(document)).toBe(true);
  expect(Object.isFrozen(document.source)).toBe(true);
  expect(Object.isFrozen(document.sketch)).toBe(true);
  expect(Object.isFrozen(document.parameters)).toBe(true);
  expect(Object.isFrozen(document.viewport)).toBe(true);
}

describe('createDesignDocumentStore', () => {
  it('valide, copie et gèle tous les objets persistants du document initial', () => {
    const input = createCutterDocument();
    const store = createDesignDocumentStore(input);
    const snapshot = get(store);

    expectTypeOf(store).toMatchTypeOf<DesignDocumentStore>();
    expect('set' in store).toBe(false);
    expect(snapshot).toEqual(input);
    expect(snapshot).not.toBe(input);
    expect(snapshot.source).not.toBe(input.source);
    expect(snapshot.sketch).not.toBe(input.sketch);
    expect(snapshot.parameters).not.toBe(input.parameters);
    expect(snapshot.viewport).not.toBe(input.viewport);
    expectPersistentSnapshotFrozen(snapshot);

    if (false) {
      // @ts-expect-error Un store Cutter refuse statiquement le mode Stamp.
      store.updateParameters('cutter', { mode: 'stamp' });
      // @ts-expect-error Un store Stamp refuse statiquement le mode Cutter.
      store.updateParameters('stamp', { mode: 'cutter' });
    }
  });

  it('remplace atomiquement le document depuis unknown sans conserver de référence mutable', () => {
    const store = createDesignDocumentStore(createCutterDocument());
    const snapshots = vi.fn();
    const unsubscribe = store.subscribe(snapshots);
    const replacement = {
      ...createCutterDocument(),
      id: 'design-stamp',
      kind: 'stamp',
      parameters: { ...DEFAULT_STAMP_PARAMETERS_V1 }
    };

    store.replace(replacement);
    const snapshot = get(store);
    replacement.name = 'Mutation externe';
    replacement.parameters.stampDepth = 9;

    expect(snapshot).toMatchObject({
      id: 'design-stamp',
      name: 'Étoile',
      kind: 'stamp',
      parameters: { mode: 'stamp', stampDepth: 3 }
    });
    expectPersistentSnapshotFrozen(snapshot);
    expect(snapshots).toHaveBeenCalledTimes(2);

    expect(() =>
      store.replace({ ...snapshot, schemaVersion: 2 })
    ).toThrow(DesignDocumentValidationError);
    expect(get(store)).toBe(snapshot);
    expect(snapshots).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('applique les patches de paramètres corrélés au kind sans muter le snapshot précédent', () => {
    const store = createDesignDocumentStore(createCutterDocument(), {
      now: createNow('2026-07-24T10:01:00.000Z')
    });
    const previous = get(store);

    store.updateParameters('cutter', { wallThickness: 1.4, targetSize: 90 });
    const current = get(store);

    expect(current.kind).toBe('cutter');
    expect(current.parameters).toMatchObject({ wallThickness: 1.4, targetSize: 90 });
    expect(current.updatedAt).toBe('2026-07-24T10:01:00.000Z');
    expect(previous.parameters).toMatchObject({ wallThickness: 1, targetSize: 75 });
    expect(current).not.toBe(previous);
    expect(current.parameters).not.toBe(previous.parameters);
    expectPersistentSnapshotFrozen(current);
  });

  it('refuse un kind de patch incohérent et conserve le document courant', () => {
    const store = createDesignDocumentStore(createCutterDocument());
    const previous = get(store);

    expect(() => store.updateParameters('stamp', { stampDepth: 4 })).toThrow(
      /cutter.*stamp|stamp.*cutter/i
    );
    expect(get(store)).toBe(previous);
  });

  it('valide une mutation complète avant publication et ne publie jamais un état invalide', () => {
    const store = createDesignDocumentStore(createCutterDocument(), {
      now: createNow('2026-07-24T10:01:00.000Z')
    });
    const snapshots = vi.fn();
    const unsubscribe = store.subscribe(snapshots);
    const previous = get(store);

    expect(() => store.updateParameters('cutter', { totalHeight: 2 })).toThrow(
      DesignDocumentValidationError
    );
    expect(get(store)).toBe(previous);
    expect(snapshots).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it.each([
    ['un horodatage invalide', 'date-invalide'],
    ['une régression temporelle', '2026-07-24T09:59:59.000Z']
  ])('refuse %s sans publier de snapshot', (_label, timestamp) => {
    const store = createDesignDocumentStore(createCutterDocument(), {
      now: createNow(timestamp)
    });
    const snapshots = vi.fn();
    const unsubscribe = store.subscribe(snapshots);
    const previous = get(store);

    expect(() => store.rename('Carré')).toThrow(RangeError);
    expect(get(store)).toBe(previous);
    expect(snapshots).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('expose des mutations dédiées pour le nom, le sketch et le viewport', () => {
    const store = createDesignDocumentStore(createCutterDocument(), {
      now: createNow(
        '2026-07-24T10:01:00.000Z',
        '2026-07-24T10:02:00.000Z',
        '2026-07-24T10:03:00.000Z'
      )
    });

    store.rename('Carré');
    const renamed = get(store);
    store.updateSketch(EDITED_SVG);
    const edited = get(store);
    store.updateViewport({ showAxes: true, showGrid: false });
    const viewportUpdated = get(store);

    expect(renamed).toMatchObject({
      name: 'Carré',
      sketch: { svg: SVG, revision: 0 },
      updatedAt: '2026-07-24T10:01:00.000Z'
    });
    expect(edited).toMatchObject({
      name: 'Carré',
      sketch: { svg: EDITED_SVG, revision: 1 },
      updatedAt: '2026-07-24T10:02:00.000Z'
    });
    expect(viewportUpdated).toMatchObject({
      viewport: { showAxes: true, showGrid: false, showWallThickness: false },
      updatedAt: '2026-07-24T10:03:00.000Z'
    });
    expect(renamed.sketch.svg).toBe(SVG);
    expect(edited.viewport.showAxes).toBe(false);
    expectPersistentSnapshotFrozen(viewportUpdated);
  });

  it('change de recette avec les defaults corrélés sans altérer la source ni le sketch', () => {
    const store = createDesignDocumentStore(createCutterDocument(), {
      now: createNow('2026-07-24T10:01:00.000Z')
    });
    const previous = get(store);

    store.changeKind('stamp');
    const current = get(store);

    expect(current).toMatchObject({
      id: previous.id,
      kind: 'stamp',
      source: previous.source,
      sketch: previous.sketch,
      parameters: DEFAULT_STAMP_PARAMETERS_V1,
      updatedAt: '2026-07-24T10:01:00.000Z'
    });
    expect(current.parameters.mode).toBe('stamp');
    expect(previous.kind).toBe('cutter');
    expect(previous.parameters.mode).toBe('cutter');
    expectPersistentSnapshotFrozen(current);
  });
});
