import { afterEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import { createDesignSessionStore } from '../../stores/designSessionStore';
import { createProjectSessionIntegration } from '../projectSessionIntegration';
import { freezeGenerationState } from '../../generation/generationState';
import { parseProjectRecoveryEnvelope } from '../projectRecoveryStorage';
import { encodeProject, decodeProject } from '../projectCodec';
import type { StampImprintMode } from '../../domain/designDocument';
import type { CookieCutterParams } from '../../types/CookieCutter';
import { validateCookieCutterParams } from '../../utils/generationValidation';
import { projectDocument, UPDATED_AT } from './projectFixtures';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));
function initial(depth = 2) {
  const document = projectDocument('stamp');
  return { ...document, parameters: { ...document.parameters, mode: 'stamp', stampDepth: depth } };
}
function harness(depth = 2) {
  const session = createDesignSessionStore(initial(depth), { now: () => UPDATED_AT });
  const legacy = writable<Readonly<CookieCutterParams>>(validateCookieCutterParams(initial(depth).parameters));
  const schedule = vi.fn(), error = vi.fn();
  const integration = createProjectSessionIntegration({ session, generation: { schedule, cancel: vi.fn() },
    legacy: { params: legacy, setParams: value => legacy.set(validateCookieCutterParams(value)) },
    clearHistory: vi.fn(), invalidateSource: vi.fn(), projectViewport: vi.fn(), onParameterError: error });
  cleanups.push(integration.dispose);
  return { session, legacy, schedule, error, integration };
}

describe('canonical stamp imprint command', () => {
  it('promotes atomically with one notification, preserving identity/source/sketch and epoch', () => {
    const { session } = harness();
    const before = session.getDocument()!, epoch = session.sessionEpoch;
    const notify = vi.fn(); const unsubscribe = session.subscribe(notify); notify.mockClear();
    session.updateStampImprintMode('recessed');
    expect(notify).toHaveBeenCalledTimes(1);
    const after = session.getDocument()!;
    expect(after).toMatchObject({ schemaVersion: 4, imprintMode: 'recessed', bridges: [],
      id: before.id, source: before.source, sketch: before.sketch, parameters: before.parameters });
    expect(session.sessionEpoch).toBe(epoch);
    expect(Object.isFrozen(after)).toBe(true);
    if (after.schemaVersion !== 4) throw new Error('V4 expected');
    expect(Object.isFrozen(after.bridges)).toBe(true);
    session.updateStampImprintMode('recessed'); expect(notify).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
  it('leaves legacy raised V1/V2 untouched until recessed is explicitly selected', () => {
    for (const version of [1, 2]) {
      const session = createDesignSessionStore({ ...initial(), schemaVersion: version, ...(version === 2 ? { bridges: [] } : {}) });
      const before = session.getDocument(); session.updateStampImprintMode('raised');
      expect(session.getDocument()).toBe(before);
    }
  });
  it('refuses excessive depth and invalid modes without publishing or clamping', () => {
    const { session, schedule } = harness(5); const before = session.getDocument();
    expect(() => session.updateStampImprintMode('recessed')).toThrow(/parameters.stampDepth/);
    expect(session.getDocument()).toBe(before); expect(session.getDocument()?.parameters.stampDepth).toBe(5);
    expect(() => session.updateStampImprintMode('wrong' as StampImprintMode)).toThrow(/imprintMode/);
    expect(session.getDocument()).toBe(before); expect(schedule).toHaveBeenCalledTimes(1);
  });
  it('keeps mode through edits, round-trip, history and recovery; removes it on kind change', () => {
    const { session } = harness(); const raised = session.getDocument()!, epoch = session.sessionEpoch;
    session.updateStampImprintMode('recessed'); session.updateParameters('stamp', { stampDepth: 3 });
    const recessed = session.getDocument()!;
    session.restoreHistory(raised, epoch); expect(session.getDocument()).toEqual(raised);
    session.restoreHistory(recessed, epoch); expect(session.getDocument()).toEqual(recessed);
    expect(decodeProject(encodeProject(recessed)).document).toEqual(recessed);
    const recovery = parseProjectRecoveryEnvelope({ format: 'cookie-cutter-designer-recovery', version: 1,
      draftId: '35d9a380-ec26-4137-8d8b-6fa91e7cd780', savedAt: UPDATED_AT, document: recessed });
    expect(recovery.document).toEqual(recessed);
    session.updateStampImprintMode('raised'); expect(session.getDocument()).toMatchObject({ schemaVersion: 4, imprintMode: 'raised' });
    session.updateParameters('stamp', { stampDepth: 5 });
    session.changeKind('cutter');
    expect(session.getDocument()).toMatchObject({ kind: 'cutter', schemaVersion: 1 });
    expect('imprintMode' in session.getDocument()!).toBe(false); expect('bridges' in session.getDocument()!).toBe(false);
    session.changeKind('stamp'); expect(session.getDocument()?.schemaVersion).toBe(1);
  });
  it('rejects mode edits without an active stamp', () => {
    expect(() => createDesignSessionStore().updateStampImprintMode('recessed')).toThrow();
    const session = createDesignSessionStore(projectDocument()); const before = session.getDocument();
    expect(() => session.updateStampImprintMode('recessed')).toThrow(); expect(session.getDocument()).toBe(before);
  });
  it('reschedules mode-only changes; legacy edits retain V4 and rejected depth restores the port', () => {
    const h = harness();
    h.session.updateStampImprintMode('recessed');
    expect(h.schedule).toHaveBeenCalledTimes(2);
    expect(h.schedule).toHaveBeenLastCalledWith(h.session.getDocument());
    expect('imprintMode' in get(h.legacy)).toBe(false);
    const current = h.session.getDocument()!;
    h.legacy.set({ ...get(h.legacy), stampDepth: 4 });
    expect(h.session.getDocument()).toBe(current); expect(get(h.legacy).stampDepth).toBe(2);
    expect(h.error.mock.calls.at(-1)?.[0]).toMatchObject({ path: 'parameters.stampDepth' });
    h.legacy.set({ ...get(h.legacy), stampDepth: 1.5 });
    expect(h.session.getDocument()).toMatchObject({ schemaVersion: 4, imprintMode: 'recessed', parameters: { stampDepth: 1.5 } });
    h.session.updateStampImprintMode('raised'); expect(h.schedule).toHaveBeenCalledTimes(4);
    h.session.rename('metadata'); expect(h.schedule).toHaveBeenCalledTimes(4);
    h.legacy.set({ ...get(h.legacy), mode: 'cutter' });
    expect(h.session.getDocument()?.kind).toBe('cutter'); expect('imprintMode' in h.session.getDocument()!).toBe(false);
  });
  it('carries and freezes V4 in pending and ready generation snapshots', () => {
    const h = harness(); h.session.updateStampImprintMode('recessed');
    const document = h.session.getDocument()!;
    const frozen = freezeGenerationState({ phase: 'scheduled', revision: 2, requestedDocument: document, result: null, error: null });
    expect(frozen.requestedDocument).toMatchObject({ schemaVersion: 4, imprintMode: 'recessed' });
    expect(frozen.requestedDocument).not.toBe(document);
    expect(Object.isFrozen(frozen.requestedDocument)).toBe(true);
    expect(Object.isFrozen(frozen.requestedDocument?.parameters)).toBe(true);
  });
});
