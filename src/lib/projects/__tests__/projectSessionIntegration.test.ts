import { afterEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import { createDesignSessionStore } from '../../stores/designSessionStore';
import { params, setParams, resetParams, updateParams } from '../../stores/cookieCutterStore';
import { documentParametersToLegacy } from '../../stores/legacyDocumentAdapter';
import type { DesignDocument } from '../../domain/designDocument';
import type { CookieCutterParams } from '../../types/CookieCutter';
import { assertRepresentable, createProjectSessionIntegration } from '../projectSessionIntegration';
import { EDITED_SVG, INITIAL_SVG, UPDATED_AT, projectDocument, rasterSource } from './projectFixtures';

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(dispose => dispose()); resetParams(); });

function harness(initial: DesignDocument | null = null, injected = false) {
  resetParams();
  const session = createDesignSessionStore(initial, { now: () => UPDATED_AT });
  const events: string[] = [];
  const schedule = vi.fn((_document: unknown) => { events.push('schedule'); });
  const cancel = vi.fn(() => { events.push('cancel'); });
  const clearHistory = vi.fn(() => { events.push('history'); });
  const invalidateSource = vi.fn(() => { events.push('invalidate'); });
  const projectViewport = vi.fn();
  const onParameterError = vi.fn();
  const onIntegrationError = vi.fn();
  const injectedParams = writable<Readonly<CookieCutterParams>>(get(params));
  const legacyWrite = vi.fn((value: unknown) => injectedParams.set(value as CookieCutterParams));
  const integration = createProjectSessionIntegration({ session, generation: { schedule, cancel },
    clearHistory, invalidateSource, projectViewport, onParameterError, onIntegrationError,
    ...(injected ? { legacy: { params: injectedParams, setParams: legacyWrite } } : {})
  });
  cleanups.push(integration.dispose);
  return { session, events, schedule, cancel, clearHistory, invalidateSource, projectViewport,
    onParameterError, onIntegrationError, integration, injectedParams, legacyWrite };
}

describe('project session integration runtime seam', () => {
  it('reschedules the original semantic geometry after a failed scheduling attempt', () => {
    const h = harness(projectDocument());
    const initial = h.session.getDocument();
    if (initial?.kind !== 'cutter') throw new Error('Expected cutter fixture');
    h.schedule.mockImplementationOnce(() => { throw new Error('Scheduler failed after cancelling prior work'); });
    h.session.updateParameters('cutter', { targetSize: initial.parameters.targetSize + 5 });
    expect(h.onIntegrationError).toHaveBeenCalledTimes(1);
    h.session.updateParameters('cutter', { targetSize: initial.parameters.targetSize });
    expect(h.schedule).toHaveBeenCalledTimes(3);
    expect(h.schedule.mock.calls.at(-1)?.[0]).toBe(h.session.getDocument());
    h.session.rename('Recovered schedule');
    expect(h.schedule).toHaveBeenCalledTimes(3);
  });

  it('reprojects original viewport preferences after a partially failed callback', () => {
    const h = harness(projectDocument());
    const initialViewport = h.session.getDocument()!.viewport;
    h.projectViewport.mockImplementationOnce(() => { throw new Error('Viewport projection failed'); });
    h.session.updateViewport({ showGrid: !initialViewport.showGrid });
    expect(h.onIntegrationError).toHaveBeenCalledTimes(1);
    h.session.updateViewport(initialViewport);
    expect(h.projectViewport).toHaveBeenCalledTimes(3);
    expect(h.projectViewport).toHaveBeenLastCalledWith(h.session.getDocument()?.viewport);
    h.session.rename('Recovered viewport');
    expect(h.projectViewport).toHaveBeenCalledTimes(3);
  });

  it('reschedules identical geometry after a representability error cancelled its pending generation', () => {
    const h = harness(projectDocument());
    expect(h.schedule).toHaveBeenCalledTimes(1);
    h.session.updateParameters('cutter', { enableEmbossing: true });
    expect(h.onParameterError.mock.calls.at(-1)?.[0]).toBeInstanceOf(Error);
    expect(h.cancel).toHaveBeenCalledTimes(2);
    h.session.updateParameters('cutter', { enableEmbossing: false });
    expect(h.schedule).toHaveBeenCalledTimes(2);
    expect(h.schedule.mock.calls.at(-1)?.[0]).toBe(h.session.getDocument());
    h.session.rename('Recovered project');
    expect(h.schedule).toHaveBeenCalledTimes(2);
  });

  it('does not invalidate the new epoch geometry when cancellation replaces the errored project', () => {
    const h = harness(projectDocument());
    const next = { ...projectDocument('stamp'), id: 'replacement-after-error', name: 'Replacement' };
    h.cancel.mockImplementationOnce(() => { h.session.replace(next); });
    h.session.updateParameters('cutter', { enableEmbossing: true });
    expect(h.session.getDocument()?.id).toBe(next.id);
    expect(h.schedule).toHaveBeenCalledTimes(2);
    expect(h.schedule.mock.calls.at(-1)?.[0]).toBe(h.session.getDocument());
    h.session.rename('Replacement renamed');
    expect(h.schedule).toHaveBeenCalledTimes(2);
  });

  it('opens an exact saved raster document and projects the authoritative snapshot synchronously', () => {
    const h = harness();
    const saved = { ...projectDocument('stamp'), source: rasterSource(), name: 'Restauré', id: 'exact-id' };
    h.events.length = 0;
    h.session.replace(saved);
    expect(h.events).toEqual(['cancel', 'invalidate', 'history', 'schedule']);
    expect(h.schedule).toHaveBeenCalledTimes(1);
    expect(h.schedule.mock.calls[0][0]).toBe(h.session.getDocument());
    expect(h.schedule.mock.calls[0][0]).toEqual(saved);
    expect(get(params)).toEqual(saved.parameters);
    expect(h.projectViewport).toHaveBeenLastCalledWith(saved.viewport);
    expect(h.session.getSessionEpoch()).toBe(1);
  });

  it('projects session edits and accepts real ParamsStore edits without feedback or duplicate updates', () => {
    const h = harness(projectDocument());
    const changeKind = vi.spyOn(h.session, 'changeKind');
    const update = vi.spyOn(h.session, 'updateParameters');
    expect(h.schedule).toHaveBeenCalledTimes(1);
    h.session.updateParameters('cutter', { targetSize: 85 });
    expect(get(params).targetSize).toBe(85);
    expect(h.schedule).toHaveBeenCalledTimes(2);
    expect(updateParams({ targetSize: 90 })).toBe(true);
    expect(h.session.getDocument()?.parameters.targetSize).toBe(90);
    expect(h.schedule).toHaveBeenCalledTimes(3);
    const snapshot = h.session.getDocument();
    setParams({ ...get(params) });
    expect(h.session.getDocument()).toBe(snapshot);
    expect(h.schedule).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledTimes(2);
    expect(changeKind).not.toHaveBeenCalled();
  });

  it('switches both modes using real legacy full snapshots, not domain reset defaults', () => {
    const h = harness(projectDocument());
    const changes = vi.spyOn(h.session, 'changeKind');
    expect(updateParams({ mode: 'stamp', stampDepth: 3.5, targetSize: 92 })).toBe(true);
    expect(h.session.getDocument()?.kind).toBe('stamp');
    expect(h.session.getDocument()?.parameters).toEqual(get(params));
    expect(h.session.getDocument()?.parameters.targetSize).toBe(92);
    expect(h.schedule).toHaveBeenCalledTimes(2);
    expect(h.schedule.mock.calls[1][0]).toBe(h.session.getDocument());
    expect(updateParams({ mode: 'cutter', wallThickness: 1.1 })).toBe(true);
    expect(h.session.getDocument()?.kind).toBe('cutter');
    expect(h.session.getDocument()?.parameters).toEqual(get(params));
    expect(h.schedule).toHaveBeenCalledTimes(3);
    expect(changes.mock.calls).toEqual([['stamp'], ['cutter']]);
  });

  it('validates a complete legacy candidate before any kind command; errors stay separate', () => {
    const h = harness(projectDocument(), true);
    const snapshot = h.session.getDocument();
    const changes = vi.spyOn(h.session, 'changeKind');
    const invalid = { ...get(h.injectedParams), mode: 'stamp', targetSize: -1 };
    h.injectedParams.set(invalid as CookieCutterParams);
    expect(h.session.getDocument()).toBe(snapshot);
    expect(changes).not.toHaveBeenCalled();
    expect(h.schedule).toHaveBeenCalledTimes(1);
    expect(h.onParameterError.mock.calls.at(-1)?.[0]).toBeInstanceOf(Error);
    expect(h.onIntegrationError).not.toHaveBeenCalled();
    expect(get(h.injectedParams)).toEqual(snapshot?.parameters);
    expect(h.integration.acceptLegacyParameterChange({ ...snapshot?.parameters, targetSize: 95 })).toBe(true);
    expect(h.onParameterError).toHaveBeenLastCalledWith(null);
  });

  it('renames and viewport preferences publish dirty document state but do not regenerate geometry', () => {
    const h = harness(projectDocument());
    h.session.rename('Autre nom');
    h.session.updateViewport({ showGrid: false });
    const current = h.session.getDocument();
    if (current?.kind !== 'cutter') throw new Error('Expected an active cutter document');
    h.session.updateParameters('cutter', { ...current.parameters });
    expect(h.session.getDocument()?.name).toBe('Autre nom');
    expect(h.projectViewport).toHaveBeenLastCalledWith({ ...projectDocument().viewport, showGrid: false });
    expect(h.schedule).toHaveBeenCalledTimes(1);
    expect(h.clearHistory).toHaveBeenCalledTimes(1);
  });

  describe.each(['mount', 'replace'] as const)('semantic projection re-entry on %s', lifecycle => {
    it.each([
      { boundary: 'schedule', edit: 'rename' },
      { boundary: 'schedule', edit: 'viewport' },
      { boundary: 'projectViewport', edit: 'rename' },
      { boundary: 'projectViewport', edit: 'parameters' },
      { boundary: 'legacyWrite', edit: 'rename' },
      { boundary: 'onParameterError', edit: 'rename' }
    ] as const)('deduplicates persistent $boundary callbacks editing $edit', ({ boundary, edit }) => {
      resetParams();
      const session = createDesignSessionStore(projectDocument('stamp'), { now: () => UPDATED_AT });
      const legacyParams = writable<Readonly<CookieCutterParams>>(get(params));
      const callbacks = {
        schedule: vi.fn(), projectViewport: vi.fn(), onParameterError: vi.fn(),
        legacyWrite: vi.fn((value: unknown) => legacyParams.set(value as CookieCutterParams))
      };
      const onIntegrationError = vi.fn();
      let calls = 0;
      const arm = () => callbacks[boundary].mockImplementation((value: unknown) => {
        // Fail closed in RED: never let a synchronous Svelte queue loop hang.
        if (++calls > 4) throw new Error('re-entry safety cap');
        if (boundary === 'legacyWrite') legacyParams.set(value as CookieCutterParams);
        if (edit === 'rename') session.rename(`Callback rename ${calls}`);
        else if (edit === 'viewport') session.updateViewport({ showGrid: calls % 2 === 0 });
        else session.updateParameters('stamp', { targetSize: 90 + calls });
      });
      if (lifecycle === 'mount') arm();
      const integration = createProjectSessionIntegration({ session,
        generation: { schedule: callbacks.schedule, cancel: vi.fn() },
        legacy: { params: legacyParams, setParams: callbacks.legacyWrite },
        clearHistory: vi.fn(), invalidateSource: vi.fn(),
        projectViewport: callbacks.projectViewport, onParameterError: callbacks.onParameterError, onIntegrationError });
      cleanups.push(integration.dispose);
      if (lifecycle === 'replace') {
        Object.values(callbacks).forEach(callback => callback.mockClear());
        arm();
        session.replace({ ...projectDocument('stamp'), id: 'B', parameters: { ...projectDocument('stamp').parameters, targetSize: 83 } });
      }
      expect(calls).toBe(1);
      expect(callbacks[boundary]).toHaveBeenCalledTimes(1);
      expect(callbacks.schedule).toHaveBeenCalledTimes(1);
      expect(get(legacyParams)).toEqual(session.getDocument()?.parameters);
      expect(onIntegrationError).not.toHaveBeenCalled();
      session.rename('Later notification');
      expect(calls).toBe(1);
      expect(callbacks.schedule).toHaveBeenCalledTimes(1);
      callbacks[boundary].mockImplementation((value: unknown) => {
        if (boundary === 'legacyWrite') legacyParams.set(value as CookieCutterParams);
      });
      session.updateSketch(INITIAL_SVG);
      expect(callbacks.schedule).toHaveBeenCalledTimes(2);
      expect(callbacks.schedule).toHaveBeenLastCalledWith(session.getDocument());
    });
  });

  it.each(['schedule', 'projectViewport'] as const)('retains real semantic changes during %s re-entry', boundary => {
    const h = harness(projectDocument(), true);
    h[boundary].mockImplementationOnce(() => {
      if (boundary === 'schedule') h.session.updateSketch(INITIAL_SVG);
      else h.session.updateViewport({ showGrid: false });
    });
    h.session.replace({ ...projectDocument(), id: 'B' });
    expect(h[boundary]).toHaveBeenCalledTimes(3);
    if (boundary === 'schedule') expect(h.schedule).toHaveBeenLastCalledWith(h.session.getDocument());
    else expect(h.projectViewport).toHaveBeenLastCalledWith(h.session.getDocument()?.viewport);
    h.session.rename('No further projection');
    expect(h[boundary]).toHaveBeenCalledTimes(3);
  });

  it.each(['schedule', 'projectViewport', 'legacyWrite'] as const)(
    'does not mark throwing %s successful after same-epoch edits or observer reconciliation', boundary => {
      const h = harness(projectDocument(), true);
      const failure = new Error('projection failed');
      const before = h[boundary].mock.calls.length;
      h[boundary].mockImplementationOnce(() => {
        h.session.rename('Edited before failure');
        throw failure;
      });
      h.onIntegrationError.mockImplementationOnce(() => {
        h.session.rename('Error observer edit');
        h.integration.acceptLegacyParameterChange(documentParametersToLegacy(h.session.getDocument()!));
      });
      h.session.replace({ ...projectDocument('stamp'), id: 'B' });
      expect(h.onIntegrationError).toHaveBeenCalledExactlyOnceWith(failure);
      expect(h[boundary]).toHaveBeenCalledTimes(before + 1);
      h.integration.acceptLegacyParameterChange(documentParametersToLegacy(h.session.getDocument()!));
      expect(h[boundary]).toHaveBeenCalledTimes(before + 2);
      expect(get(h.injectedParams)).toEqual(h.session.getDocument()?.parameters);
      h.session.rename('After successful retry');
      expect(h[boundary]).toHaveBeenCalledTimes(before + 2);
    });

  it.each(['schedule', 'projectViewport', 'legacyWrite', 'onParameterError'] as const)(
    'mount %s replacement retains the new epoch semantic keys', boundary => {
      resetParams();
      const session = createDesignSessionStore(projectDocument('stamp'), { now: () => UPDATED_AT });
      const legacyParams = writable<Readonly<CookieCutterParams>>(get(params));
      const b = { ...projectDocument(), id: 'B', parameters: { ...projectDocument().parameters, targetSize: 94 },
        viewport: { ...projectDocument().viewport, showGrid: false } };
      const callbacks = {
        schedule: vi.fn(), projectViewport: vi.fn(), onParameterError: vi.fn(),
        legacyWrite: vi.fn((value: unknown) => legacyParams.set(value as CookieCutterParams))
      };
      callbacks[boundary].mockImplementationOnce(() => session.replace(b));
      const integration = createProjectSessionIntegration({ session,
        generation: { schedule: callbacks.schedule, cancel: vi.fn() },
        legacy: { params: legacyParams, setParams: callbacks.legacyWrite },
        clearHistory: vi.fn(), invalidateSource: vi.fn(),
        projectViewport: callbacks.projectViewport, onParameterError: callbacks.onParameterError });
      cleanups.push(integration.dispose);
      expect(session.getDocument()).toEqual(b);
      expect(get(legacyParams)).toEqual(b.parameters);
      expect(callbacks.schedule).toHaveBeenLastCalledWith(session.getDocument());
      expect(callbacks.projectViewport).toHaveBeenLastCalledWith(b.viewport);
      const counts = [callbacks.schedule.mock.calls.length, callbacks.projectViewport.mock.calls.length];
      session.rename('B metadata only');
      expect([callbacks.schedule.mock.calls.length, callbacks.projectViewport.mock.calls.length]).toEqual(counts);
    });

  describe.each(['mount', 'replace'] as const)('real semantic changes on %s', lifecycle => {
    it.each(['schedule', 'projectViewport'] as const)('reconciles a real change made during %s', boundary => {
      const session = createDesignSessionStore(projectDocument(), { now: () => UPDATED_AT });
      const schedule = vi.fn();
      const projectViewport = vi.fn();
      const arm = () => ({ schedule, projectViewport })[boundary].mockImplementationOnce(() => {
        if (boundary === 'schedule') session.updateSketch(INITIAL_SVG);
        else session.updateViewport({ showGrid: false });
      });
      if (lifecycle === 'mount') arm();
      const integration = createProjectSessionIntegration({ session,
        generation: { schedule, cancel: vi.fn() }, clearHistory: vi.fn(), invalidateSource: vi.fn(), projectViewport });
      cleanups.push(integration.dispose);
      if (lifecycle === 'replace') {
        schedule.mockClear();
        projectViewport.mockClear();
        arm();
        session.replace({ ...projectDocument(), id: 'B' });
      }
      expect(({ schedule, projectViewport })[boundary]).toHaveBeenCalledTimes(2);
      expect(schedule).toHaveBeenLastCalledWith(session.getDocument());
      expect(projectViewport).toHaveBeenLastCalledWith(session.getDocument()?.viewport);
      session.rename('Metadata preserves committed semantic key');
      expect(({ schedule, projectViewport })[boundary]).toHaveBeenCalledTimes(2);
    });
  });

  describe.each(['mount', 'replace'] as const)('failed callback reservation on %s', lifecycle => {
    it.each(['cancel', 'invalidateSource', 'clearHistory', 'legacyWrite', 'projectViewport', 'schedule'] as const)(
      'does not automatically retry %s when its error observer persistently edits metadata', boundary => {
        resetParams();
        const session = createDesignSessionStore(projectDocument('stamp'), { now: () => UPDATED_AT });
        const legacyParams = writable<Readonly<CookieCutterParams>>(get(params));
        const callbacks = {
          cancel: vi.fn(), invalidateSource: vi.fn(), clearHistory: vi.fn(),
          schedule: vi.fn(), projectViewport: vi.fn(),
          legacyWrite: vi.fn((value: unknown) => legacyParams.set(value as CookieCutterParams))
        };
        const failure = new Error('reserved callback failed');
        let observed = 0;
        const onIntegrationError = vi.fn(() => {
          // Bounded RED even if each failed queued retry publishes another edit.
          if (++observed <= 4) session.rename(`Failure observed ${observed}`);
        });
        const arm = () => callbacks[boundary].mockImplementation(() => { throw failure; });
        if (lifecycle === 'mount') arm();
        const integration = createProjectSessionIntegration({ session,
          generation: { schedule: callbacks.schedule, cancel: callbacks.cancel },
          legacy: { params: legacyParams, setParams: callbacks.legacyWrite },
          invalidateSource: callbacks.invalidateSource, clearHistory: callbacks.clearHistory,
          projectViewport: callbacks.projectViewport, onIntegrationError });
        cleanups.push(integration.dispose);
        if (lifecycle === 'replace') {
          Object.values(callbacks).forEach(callback => callback.mockClear());
          arm();
          session.replace({ ...projectDocument('stamp'), id: 'B', parameters: { ...projectDocument('stamp').parameters, targetSize: 83 } });
        }
        expect(callbacks[boundary]).toHaveBeenCalledTimes(1);
        expect(onIntegrationError).toHaveBeenCalledExactlyOnceWith(failure);
        expect(session.getDocument()?.kind).toBe('stamp');
        session.rename('External retry notification');
        expect(callbacks[boundary]).toHaveBeenCalledTimes(2);
        expect(onIntegrationError).toHaveBeenCalledTimes(2);
        integration.acceptLegacyParameterChange(documentParametersToLegacy(session.getDocument()!));
        expect(callbacks[boundary]).toHaveBeenCalledTimes(3);
        expect(onIntegrationError).toHaveBeenCalledTimes(3);
        callbacks[boundary].mockImplementation((value: unknown) => {
          if (boundary === 'legacyWrite') legacyParams.set(value as CookieCutterParams);
        });
        integration.acceptLegacyParameterChange(documentParametersToLegacy(session.getDocument()!));
        expect(callbacks[boundary]).toHaveBeenCalledTimes(4);
        expect(get(legacyParams)).toEqual(session.getDocument()?.parameters);
        expect(callbacks.schedule).toHaveBeenLastCalledWith(session.getDocument());
        session.rename('No retry after success');
        expect(callbacks[boundary]).toHaveBeenCalledTimes(4);
      });
  });

  it('generates the current edited sketch without reconstructing its source', () => {
    const h = harness(projectDocument());
    const newerSvg = EDITED_SVG.replace('M1 1', 'M2 2');
    h.session.updateSketch(newerSvg);
    const scheduled = h.schedule.mock.calls.at(-1)![0];
    expect(scheduled).toBe(h.session.getDocument());
    expect(scheduled).toMatchObject({ source: { svg: INITIAL_SVG }, sketch: { svg: newerSvg, revision: 3 } });
    expect(h.schedule).toHaveBeenCalledTimes(2);
    expect(h.invalidateSource).toHaveBeenCalledTimes(1);
  });

  it('invalidates even a same-ID same-content replacement before scheduling', () => {
    const h = harness(projectDocument());
    h.events.length = 0;
    h.session.replace(projectDocument());
    expect(h.events).toEqual(['cancel', 'invalidate', 'history', 'schedule']);
    expect(h.schedule).toHaveBeenCalledTimes(2);
  });

  it('empty session cancels without fake SVG or interpreting legacy defaults as a document', () => {
    const h = harness(projectDocument());
    h.events.length = 0;
    h.session.clear();
    expect(h.events).toEqual(['cancel', 'invalidate', 'history']);
    expect(h.projectViewport).toHaveBeenLastCalledWith(null);
    expect(updateParams({ targetSize: 99 })).toBe(true);
    expect(h.session.getDocument()).toBeNull();
    expect(h.schedule).toHaveBeenCalledTimes(1);
  });

  it('cleanup unsubscribes both directions and cancels exactly once with no subsequent callbacks', () => {
    const h = harness(projectDocument());
    const beforeDispose = h.cancel.mock.calls.length;
    h.integration.dispose();
    expect(h.cancel).toHaveBeenCalledTimes(beforeDispose + 1);
    const counts = [h.schedule.mock.calls.length, h.cancel.mock.calls.length,
      h.projectViewport.mock.calls.length, h.clearHistory.mock.calls.length];
    h.integration.dispose();
    h.session.replace(projectDocument('stamp'));
    setParams({ ...get(params), targetSize: 99 });
    expect(h.session.getDocument()?.parameters.targetSize).not.toBe(99);
    expect(h.integration.acceptLegacyParameterChange(get(params))).toBe(false);
    expect([h.schedule.mock.calls.length, h.cancel.mock.calls.length,
      h.projectViewport.mock.calls.length, h.clearHistory.mock.calls.length]).toEqual(counts);
  });

  it('clears an obsolete parameter error when a representable project replaces the session', () => {
    const h = harness(projectDocument(), true);
    h.integration.acceptLegacyParameterChange({ ...get(h.injectedParams), targetSize: -1 });
    expect(h.onParameterError.mock.calls.at(-1)?.[0]).toBeInstanceOf(Error);
    h.session.replace(projectDocument('stamp'));
    expect(h.onParameterError).toHaveBeenLastCalledWith(null);
    expect(h.onIntegrationError).not.toHaveBeenCalled();
  });

  it('routes scheduling failures to integration errors without poisoning the stores', () => {
    const h = harness(projectDocument());
    const failure = new Error('scheduler failed');
    h.schedule.mockImplementationOnce(() => { throw failure; });
    expect(() => h.session.updateSketch(INITIAL_SVG)).not.toThrow();
    expect(h.onIntegrationError).toHaveBeenLastCalledWith(failure);
    expect(h.onParameterError.mock.calls.every(([error]) => error === null)).toBe(true);
    h.session.updateSketch(EDITED_SVG);
    expect(h.schedule).toHaveBeenCalledTimes(3);
  });

  describe.each(['mount', 'replace'] as const)('same-epoch cleanup re-entry on %s', lifecycle => {
    it.each((['cancel', 'invalidateSource', 'clearHistory'] as const).flatMap(boundary =>
      (['kind', 'rename', 'sketch'] as const).map(edit => ({ boundary, edit }))))(
      'finishes cleanup exactly once after $boundary edits $edit', ({ boundary, edit }) => {
        resetParams();
        const session = createDesignSessionStore(projectDocument(), { now: () => UPDATED_AT });
        const history = ['previous sketch'];
        const events: string[] = [];
        const schedule = vi.fn((_document: unknown) => { events.push('schedule'); });
        const cancel = vi.fn(() => { events.push('cancel'); });
        const invalidateSource = vi.fn(() => { events.push('invalidate'); });
        const clearHistory = vi.fn(() => { events.push('history'); history.length = 0; });
        const projectViewport = vi.fn();
        const onIntegrationError = vi.fn();
        const mutate = () => {
          if (edit === 'kind') session.changeKind('stamp');
          else if (edit === 'rename') session.rename('B renommé');
          else session.updateSketch(INITIAL_SVG);
        };
        const callbacks = { cancel, invalidateSource, clearHistory };
        const arm = () => callbacks[boundary].mockImplementation(() => {
          events.push(boundary === 'invalidateSource' ? 'invalidate' : boundary === 'clearHistory' ? 'history' : 'cancel');
          if (boundary === 'clearHistory') history.length = 0;
          mutate();
        });
        if (lifecycle === 'mount') arm();
        const integration = createProjectSessionIntegration({ session, generation: { schedule, cancel },
          clearHistory, invalidateSource, projectViewport, onIntegrationError });
        cleanups.push(integration.dispose);
        if (lifecycle === 'replace') {
          events.length = 0;
          history.push('A sketch');
          Object.values(callbacks).forEach(callback => callback.mockClear());
          schedule.mockClear();
          arm();
          session.replace({ ...projectDocument(), id: 'B' });
        }
        expect(history).toEqual([]);
        expect(events).toEqual(['cancel', 'invalidate', 'history', 'schedule']);
        Object.values(callbacks).forEach(callback => expect(callback).toHaveBeenCalledTimes(1));
        if (edit === 'kind') expect(session.getDocument()?.kind).toBe('stamp');
        else if (edit === 'rename') expect(session.getDocument()?.name).toBe('B renommé');
        else expect(session.getDocument()?.sketch.svg).toBe(INITIAL_SVG);
        expect(get(params)).toEqual(session.getDocument()?.parameters);
        expect(schedule.mock.calls.map(([document]) => document)).toEqual([session.getDocument()]);
        expect(onIntegrationError).not.toHaveBeenCalled();
        session.rename('B encore renommé');
        expect(schedule).toHaveBeenCalledTimes(1);
        Object.values(callbacks).forEach(callback => expect(callback).toHaveBeenCalledTimes(1));
      });
  });

  it.each(['cancel', 'invalidateSource', 'clearHistory'] as const)(
    'keeps a throwing %s pending until another notification without repeating completed steps', boundary => {
      const h = harness(projectDocument(), true);
      const failure = new Error('cleanup failed');
      const callbacks = [h.cancel, h.invalidateSource, h.clearHistory];
      callbacks.forEach(callback => callback.mockClear());
      h.schedule.mockClear();
      h[boundary].mockImplementationOnce(() => { throw failure; });
      h.session.replace({ ...projectDocument(), id: 'B' });
      expect(h.onIntegrationError).toHaveBeenLastCalledWith(failure);
      expect(h.schedule).not.toHaveBeenCalled();
      h.session.rename('B retry');
      const failedIndex = ['cancel', 'invalidateSource', 'clearHistory'].indexOf(boundary);
      callbacks.forEach((callback, index) => expect(callback).toHaveBeenCalledTimes(index === failedIndex ? 2 : 1));
      expect(h.schedule.mock.calls.map(([document]) => document)).toEqual([h.session.getDocument()]);
    });

  it.each(['cancel', 'invalidateSource', 'clearHistory'] as const)(
    'mount keeps failed %s pending through error-observer re-entry and ignores stale legacy defaults', boundary => {
      resetParams();
      const session = createDesignSessionStore(projectDocument('stamp'), { now: () => UPDATED_AT });
      const schedule = vi.fn();
      const callbacks = { cancel: vi.fn(), invalidateSource: vi.fn(), clearHistory: vi.fn() };
      const failure = new Error('mount cleanup failed');
      callbacks[boundary].mockImplementationOnce(() => { throw failure; });
      const onIntegrationError = vi.fn(() => session.rename('B error observed'));
      const integration = createProjectSessionIntegration({ session, generation: { schedule, cancel: callbacks.cancel },
        invalidateSource: callbacks.invalidateSource, clearHistory: callbacks.clearHistory,
        projectViewport: vi.fn(), onIntegrationError });
      cleanups.push(integration.dispose);
      expect(onIntegrationError).toHaveBeenCalledExactlyOnceWith(failure);
      expect(session.getDocument()?.kind).toBe('stamp');
      expect(session.getDocument()?.name).toBe('B error observed');
      expect(schedule).not.toHaveBeenCalled();
      expect(callbacks[boundary]).toHaveBeenCalledTimes(1);
      session.rename('B retry');
      const failedIndex = ['cancel', 'invalidateSource', 'clearHistory'].indexOf(boundary);
      Object.values(callbacks).forEach((callback, index) => expect(callback).toHaveBeenCalledTimes(index === failedIndex ? 2 : 1));
      expect(get(params)).toEqual(session.getDocument()?.parameters);
      expect(schedule.mock.calls.map(([document]) => document)).toEqual([session.getDocument()]);
    });

  it.each(['cancel', 'invalidateSource', 'clearHistory'] as const)('constructor %s re-entry never projects or imports obsolete A into B', boundary => {
    resetParams();
    const a = projectDocument();
    const b = { ...a, id: 'B', sketch: { svg: INITIAL_SVG, revision: 7 },
      parameters: { ...a.parameters, targetSize: boundary === 'cancel' ? a.parameters.targetSize : 93 } };
    const session = createDesignSessionStore(a, { now: () => UPDATED_AT });
    const schedule = vi.fn();
    const cancel = vi.fn();
    const clearHistory = vi.fn();
    const projectViewport = vi.fn();
    const invalidateSource = vi.fn();
    ({ cancel, invalidateSource, clearHistory })[boundary].mockImplementationOnce(() => session.replace(b));
    const integration = createProjectSessionIntegration({ session, generation: { schedule, cancel },
      clearHistory, invalidateSource, projectViewport });
    cleanups.push(integration.dispose);
    expect(session.getDocument()).toEqual(b);
    expect(get(params)).toEqual(b.parameters);
    expect(schedule.mock.calls.map(([document]) => document)).toEqual([session.getDocument()]);
    session.rename('B renamed');
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it.each(['cancel', 'invalidateSource', 'clearHistory', 'legacyWrite', 'projectViewport', 'onParameterError', 'schedule'] as const)(
    'stops obsolete projection after %s replaces the session (including queued notifications)', boundary => {
      const h = harness(projectDocument(), true);
      const b = { ...projectDocument(), id: 'B', parameters: { ...projectDocument().parameters, targetSize: 94 },
        viewport: { ...projectDocument().viewport, showGrid: false } };
      h[boundary].mockImplementationOnce(() => h.session.replace(b));
      h.session.replace(projectDocument('stamp'));
      expect(h.session.getDocument()).toEqual(b);
      expect(get(h.injectedParams)).toEqual(b.parameters);
      expect(h.projectViewport).toHaveBeenLastCalledWith(b.viewport);
      expect(h.schedule).toHaveBeenLastCalledWith(h.session.getDocument());
      if (boundary !== 'schedule') {
        expect(h.schedule.mock.calls.some(([document]) => (document as DesignDocument).kind === 'stamp')).toBe(false);
      }
      const count = h.schedule.mock.calls.length;
      h.session.rename('B renamed');
      expect(h.schedule).toHaveBeenCalledTimes(count);
    });

  it.each(['cancel', 'invalidateSource', 'clearHistory', 'legacyWrite', 'projectViewport', 'onParameterError'] as const)(
    'clear during %s cancels the old document and projects an empty viewport', boundary => {
      const h = harness(projectDocument(), true);
      h[boundary].mockImplementationOnce(() => h.session.clear());
      h.session.replace(projectDocument('stamp'));
      expect(h.session.getDocument()).toBeNull();
      expect(h.projectViewport).toHaveBeenLastCalledWith(null);
      expect(h.schedule).toHaveBeenCalledTimes(1);
      expect(h.cancel).toHaveBeenCalledTimes(3);
    });

  it.each(['cancel', 'invalidateSource', 'clearHistory', 'legacyWrite', 'projectViewport', 'onParameterError'] as const)(
    'dispose during %s prevents every remaining projection callback', boundary => {
      const h = harness(projectDocument(), true);
      const counts = () => [h.cancel.mock.calls.length, h.invalidateSource.mock.calls.length,
        h.clearHistory.mock.calls.length, h.legacyWrite.mock.calls.length,
        h.projectViewport.mock.calls.length, h.onParameterError.mock.calls.length, h.schedule.mock.calls.length];
      let atDispose: number[] = [];
      h[boundary].mockImplementationOnce(() => {
        h.integration.dispose();
        atDispose = counts();
      });
      h.session.replace(projectDocument('stamp'));
      expect(counts()).toEqual(atDispose);
      h.session.replace(projectDocument());
      h.injectedParams.set({ ...get(h.injectedParams), targetSize: 95 });
      expect(counts()).toEqual(atDispose);
    });

  it.each(['clear', 'replace'] as const)('reconciles when a kind observer calls %s during legacy acceptance', action => {
    const h = harness(projectDocument(), true);
    const b = { ...projectDocument('stamp'), id: 'B', parameters: { ...projectDocument('stamp').parameters, targetSize: 94 } };
    let once = true;
    const unsubscribe = h.session.subscribe(document => {
      if (once && document?.kind === 'stamp') {
        once = false;
        if (action === 'clear') h.session.clear();
        else h.session.replace(b);
      }
    });
    cleanups.push(unsubscribe);
    const candidate = { ...get(h.injectedParams), mode: 'stamp', targetSize: 91 };
    expect(h.integration.acceptLegacyParameterChange(candidate)).toBe(false);
    if (action === 'clear') {
      expect(h.session.getDocument()).toBeNull();
      expect(h.projectViewport).toHaveBeenLastCalledWith(null);
      expect(h.cancel).toHaveBeenCalledTimes(2);
      expect(h.schedule).toHaveBeenCalledTimes(1);
    } else {
      expect(h.session.getDocument()).toEqual(b);
      expect(get(h.injectedParams)).toEqual(b.parameters);
      expect(h.schedule).toHaveBeenLastCalledWith(h.session.getDocument());
    }
    expect(h.onParameterError.mock.calls.at(-1)?.[0]).toBeInstanceOf(Error);
  });

  it('restores legacy projection and preserves command error when now predates updatedAt', () => {
    const h = harness({ ...projectDocument(), updatedAt: '2026-10-09T12:00:00.000Z' }, true);
    const before = h.session.getDocument();
    h.injectedParams.set({ ...get(h.injectedParams), targetSize: 93 });
    expect(h.session.getDocument()).toBe(before);
    expect(get(h.injectedParams)).toEqual(before?.parameters);
    expect(h.onParameterError.mock.calls.at(-1)?.[0]).toBeInstanceOf(Error);
    expect(h.schedule).toHaveBeenCalledTimes(1);
  });

  it('reconciles the successful kind command if the second command fails', () => {
    resetParams();
    let calls = 0;
    const session = createDesignSessionStore(projectDocument(), {
      now: () => ++calls === 1 ? UPDATED_AT : '2026-10-09T09:00:00.000Z'
    });
    const legacyParams = writable<Readonly<CookieCutterParams>>(get(params));
    const schedule = vi.fn();
    const onParameterError = vi.fn();
    const integration = createProjectSessionIntegration({ session, generation: { schedule, cancel: vi.fn() },
      legacy: { params: legacyParams, setParams: value => legacyParams.set(value as CookieCutterParams) },
      clearHistory: vi.fn(), invalidateSource: vi.fn(), projectViewport: vi.fn(), onParameterError });
    cleanups.push(integration.dispose);
    expect(integration.acceptLegacyParameterChange({ ...get(legacyParams), mode: 'stamp', targetSize: 93 })).toBe(false);
    expect(session.getDocument()?.kind).toBe('stamp');
    expect(get(legacyParams)).toEqual(session.getDocument()?.parameters);
    expect(schedule).toHaveBeenLastCalledWith(session.getDocument());
    expect(onParameterError.mock.calls.at(-1)?.[0]).toBeInstanceOf(Error);
  });

  it.each([false, true])('does not apply a candidate to a session replaced during validation (throws=%s)', throws => {
    const h = harness(projectDocument(), true);
    const b = { ...projectDocument(), id: 'B', parameters: { ...projectDocument().parameters, targetSize: 94 } };
    let once = true;
    const candidate = new Proxy({ ...get(h.injectedParams), targetSize: 91 }, {
      get(target, key, receiver) {
        if (once) {
          once = false;
          h.session.replace(b);
          if (throws) throw new Error('validation getter failed');
        }
        return Reflect.get(target, key, receiver);
      }
    });
    expect(h.integration.acceptLegacyParameterChange(candidate)).toBe(false);
    expect(h.session.getDocument()).toEqual(b);
    expect(get(h.injectedParams)).toEqual(b.parameters);
    expect(h.schedule).toHaveBeenLastCalledWith(h.session.getDocument());
  });

  it('exposes strict representability preflight before workflow restore', () => {
    const saved = projectDocument();
    expect(() => assertRepresentable(saved)).not.toThrow();
    const unavailable = { ...saved, parameters: { ...saved.parameters, enableEmbossing: true } } as DesignDocument;
    expect(() => documentParametersToLegacy(unavailable)).toThrow();
    expect(() => assertRepresentable(unavailable)).toThrow();
  });
});
