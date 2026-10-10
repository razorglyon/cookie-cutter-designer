import { get } from 'svelte/store';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { DesignDocument } from '../../domain/designDocument';
import { DEFAULT_STAMP_PARAMETERS_V1 } from '../../domain/designParameters';
import { DesignDocumentValidationError } from '../../domain/documentValidation';
import { CREATED_AT, UPDATED_AT, EDITED_SVG, INITIAL_SVG, projectDocument, rasterSource } from '../../projects/__tests__/projectFixtures';
import { createDesignSessionStore, type DesignSessionStore } from '../designSessionStore';

const NEXT = '2026-10-09T12:00:00.000Z';
describe('createDesignSessionStore history restoration', () => {
  it('restores exact codec snapshots atomically without changing epoch, identity or original raster source', () => {
    const session = createDesignSessionStore({ ...projectDocument(), source: rasterSource() }, { now: () => NEXT });
    const saved = session.getDocument()!;
    const epoch = session.sessionEpoch;
    session.updateSketch(INITIAL_SVG);
    session.updateParameters('cutter', { targetSize: 90 });
    const edited = session.getDocument()!;
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    session.restoreHistory(saved, epoch);
    expect(get(session)).toEqual(saved);
    expect(session.sessionEpoch).toBe(epoch);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(Object.isFrozen(get(session)?.sketch)).toBe(true);
    session.restoreHistory(edited, epoch);
    expect(get(session)).toEqual(edited);
    // The underlying active store, not a concurrent projection, is restored too.
    session.rename('After redo');
    expect(get(session)).toMatchObject({ ...edited, name: 'After redo' });
    unsubscribe();
  });
  it.each([
    { schemaVersion: 2 }, { unexpected: true }, { id: 'other' },
    { createdAt: '2026-10-08T08:00:00.000Z' },
    { source: rasterSource() }, { sketch: { svg: '<svg><script/></svg>', revision: 2 } }
  ])('rejects invalid or foreign snapshots before mutation: %j', patch => {
    const session = createDesignSessionStore(projectDocument());
    const before = session.getDocument()!;
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    expect(() => session.restoreHistory({ ...before, ...patch }, session.sessionEpoch)).toThrow();
    expect(get(session)).toBe(before);
    expect(session.sessionEpoch).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
  it.each(['same-id', 'other-id', 'clear'])('rejects a stale epoch after %s', action => {
    const session = createDesignSessionStore(projectDocument());
    const before = session.getDocument()!;
    const epoch = session.sessionEpoch;
    if (action === 'clear') session.clear();
    else session.replace({ ...before, id: action === 'same-id' ? before.id : 'other' });
    const replacement = session.getDocument();
    expect(() => session.restoreHistory(before, epoch)).toThrow();
    expect(get(session)).toBe(replacement);
    expect(session.sessionEpoch).toBe(epoch + 1);
  });
  it.each(['replace', 'clear'])('rejects reentrant Proxy %s before committing the old snapshot', action => {
    const session = createDesignSessionStore(projectDocument());
    const before = session.getDocument()!;
    let reentered = false;
    const proxy = new Proxy(before, { ownKeys(target) {
      if (!reentered) {
        reentered = true;
        if (action === 'clear') session.clear();
        else session.replace({ ...before, name: 'Newer Proxy session' });
      }
      return Reflect.ownKeys(target);
    } });
    expect(() => session.restoreHistory(proxy, 0)).toThrow();
    expect(reentered).toBe(true);
    expect(session.sessionEpoch).toBe(1);
    expect(get(session)?.name ?? null).toBe(action === 'clear' ? null : 'Newer Proxy session');
  });
  it.each(['replace', 'clear', 'edit', 'throw'])('cannot clobber reentrant %s during unknown validation', action => {
    const session = createDesignSessionStore(projectDocument(), { now: () => NEXT });
    const before = session.getDocument()!;
    let newer: DesignDocument | null = before;
    const candidate = { ...before, get name() {
      if (action === 'clear') session.clear();
      else if (action === 'edit') session.rename('Newer edit');
      else session.replace({ ...before, name: 'Newer session' });
      newer = session.getDocument();
      if (action === 'throw') throw new Error('Hostile getter');
      return before.name;
    } };
    expect(() => session.restoreHistory(candidate, 0)).toThrow();
    expect(get(session)).toBe(newer);
    if (action === 'edit') {
      session.updateViewport({ showGrid: false });
      expect(get(session)?.name).toBe('Newer edit');
    }
  });
});

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
