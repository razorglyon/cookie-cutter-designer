import { get } from 'svelte/store';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { DesignDocument } from '../../domain/designDocument';
import { DEFAULT_STAMP_PARAMETERS_V1 } from '../../domain/designParameters';
import { DesignDocumentValidationError } from '../../domain/documentValidation';
import { CREATED_AT, UPDATED_AT, EDITED_SVG, INITIAL_SVG, projectDocument, rasterSource } from '../../projects/__tests__/projectFixtures';
import { createDesignSessionStore, type DesignSessionStore } from '../designSessionStore';

const NEXT = '2026-10-09T12:00:00.000Z';
describe('createDesignSessionStore', () => {
  it('démarre vide sans faux SVG et expose un readable nullable', () => {
    const session = createDesignSessionStore();
    expectTypeOf(session).toMatchTypeOf<DesignSessionStore>();
    expectTypeOf(get(session)).toEqualTypeOf<DesignDocument | null>();
    expect(session.getDocument()).toBeNull();
    expect(get(session)).toBeNull();
    expect(session.sessionEpoch).toBe(0);
    expect(session.getSessionEpoch()).toBe(0);
    expect('set' in session).toBe(false);
  });
  it('restaure atomiquement un document complet et invalide les callbacks avant publication', () => {
    const session = createDesignSessionStore();
    const initialEpoch = session.getSessionEpoch();
    const snapshots: Array<{ document: DesignDocument | null; epoch: number }> = [];
    const unsubscribe = session.subscribe(document => snapshots.push({ document, epoch: session.getSessionEpoch() }));
    const input = projectDocument('stamp');
    session.replace(input);
    const snapshot = session.getDocument();
    expect(snapshot).toEqual(input);
    expect(snapshot).not.toBe(input);
    expect(snapshot?.source).not.toBe(input.source);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(session.getSessionEpoch()).toBe(initialEpoch + 1);
    expect(snapshots).toEqual([{ document: null, epoch: 0 }, { document: snapshot, epoch: 1 }]);
    expect(() => session.replace({ ...input, schemaVersion: 2 })).toThrow(DesignDocumentValidationError);
    expect(session.getDocument()).toBe(snapshot);
    expect(session.sessionEpoch).toBe(1);
    expect(snapshots).toHaveLength(2);
    session.replace(input); // Même ID : nouvelle ouverture, donc nouvelle session.
    expect(session.sessionEpoch).toBe(2);
    unsubscribe();
  });
  it('refuse un remplacement invalide même depuis une session vide', () => {
    const session = createDesignSessionStore();
    expect(() => session.replace(null)).toThrow(DesignDocumentValidationError);
    expect(session.getDocument()).toBeNull();
    expect(session.sessionEpoch).toBe(0);
    expect(() => createDesignSessionStore({})).toThrow(DesignDocumentValidationError);
  });
  it('délègue les éditions sans recréer identité, date de création ou source raster', () => {
    const input = { ...projectDocument(), source: rasterSource() };
    const session = createDesignSessionStore(input, { now: () => NEXT });
    session.rename('Renommé');
    session.updateSketch(INITIAL_SVG);
    session.updateViewport({ showAxes: true });
    session.updateParameters('cutter', { wallThickness: 1.5 });
    const edited = session.getDocument();
    expect(edited).toMatchObject({
      id: input.id, createdAt: CREATED_AT, updatedAt: NEXT, name: 'Renommé',
      source: input.source, sketch: { svg: INITIAL_SVG, revision: 3 },
      viewport: { showAxes: true, showWallThickness: true }, parameters: { wallThickness: 1.5 }
    });
    expect(input.sketch.svg).toBe(EDITED_SVG);
    expect(session.sessionEpoch).toBe(0);
    session.changeKind('stamp');
    expect(session.getDocument()).toMatchObject({
      id: input.id, createdAt: CREATED_AT, source: input.source,
      sketch: edited?.sketch, kind: 'stamp', parameters: DEFAULT_STAMP_PARAMETERS_V1
    });
    expect(session.sessionEpoch).toBe(0);
    if (false) {
      // @ts-expect-error Le mode du patch reste corrélé au kind.
      session.updateParameters('cutter', { mode: 'stamp' });
    }
  });
  it.each(['invalid', '2026-10-09T09:00:00.000Z', '2026-02-30T12:00:00.000Z'])('préserve validation temporelle : %s', (timestamp) => {
    const session = createDesignSessionStore(projectDocument(), { now: () => timestamp });
    const before = session.getDocument();
    expect(() => session.rename('Rejected')).toThrow();
    expect(session.getDocument()).toBe(before);
    expect(session.sessionEpoch).toBe(0);
  });
  it('conserve le snapshot et les notifications sur les mutations invalides', () => {
    const session = createDesignSessionStore(projectDocument(), { now: () => NEXT });
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    const before = session.getDocument();
    expect(() => session.rename('')).toThrow(DesignDocumentValidationError);
    expect(() => session.updateSketch('<svg><script/></svg>')).toThrow(DesignDocumentValidationError);
    expect(() => session.updateParameters('stamp', { stampDepth: 4 })).toThrow(TypeError);
    expect(() => session.updateParameters('cutter', { totalHeight: 1 })).toThrow(DesignDocumentValidationError);
    expect(session.getDocument()).toBe(before);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(before?.updatedAt).toBe(UPDATED_AT);
    unsubscribe();
  });
  it('clear publie null, avance epoch et empêche toute édition en session vide', () => {
    const session = createDesignSessionStore(projectDocument());
    session.clear();
    expect(session.getDocument()).toBeNull();
    expect(get(session)).toBeNull();
    expect(session.sessionEpoch).toBe(1);
    const commands = [
      () => session.rename('Empty'), () => session.updateSketch(INITIAL_SVG),
      () => session.updateViewport({ showGrid: false }),
      () => session.updateParameters('cutter', { wallThickness: 2 }),
      () => session.changeKind('stamp')
    ];
    for (const command of commands) expect(command).toThrow(/aucun document/i);
    expect(session.sessionEpoch).toBe(1);
    session.clear();
    expect(session.sessionEpoch).toBe(2);
  });
  it('n’émet pas de mutation pour un changement de kind identique', () => {
    const now = vi.fn(() => NEXT);
    const session = createDesignSessionStore(projectDocument(), { now });
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    const before = session.getDocument();
    session.changeKind('cutter');
    expect(session.getDocument()).toBe(before);
    expect(now).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
