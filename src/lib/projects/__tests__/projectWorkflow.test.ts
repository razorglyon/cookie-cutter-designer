import { describe, expect, it, vi } from 'vitest';
import { createDesignSessionStore } from '../../stores/designSessionStore';
import { createProjectStorage, type ProjectRecordBackend } from '../projectStorage';
import { encodeProject, PROJECT_FORMAT } from '../projectCodec';
import { createProjectWorkflow, type ProjectWorkflowOptions } from '../projectWorkflow';
import { projectDocument, UPDATED_AT } from './projectFixtures';
import legacy from '../../domain/__fixtures__/document-v0.json';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(options: Partial<ProjectWorkflowOptions> = {}) {
  const records = new Map<string, unknown>();
  const backend: ProjectRecordBackend = {
    put: vi.fn(async doc => { records.set(doc.id, doc); }),
    get: vi.fn(async id => records.get(id)),
    getAll: vi.fn(async () => [...records.values()]),
    delete: vi.fn(async id => { records.delete(id); }), close: vi.fn(async () => {})
  };
  const session = createDesignSessionStore(projectDocument(), { now: () => UPDATED_AT });
  const storage = createProjectStorage(backend);
  const workflow = createProjectWorkflow({ session, storage, createId: () => 'copy-id', ...options });
  return { workflow, session, backend, records, storage };
}
const blob = (doc: unknown) => new Blob([encodeProject(doc)]);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe('project workflow', () => {
  it.each([null, projectDocument()])('finishes repeated clears even when the session is already empty (%j)', async initial => {
    const session = createDesignSessionStore(initial);
    const { workflow } = setup({ session, confirmDiscard: async () => 'discard' });
    try {
      for (const _ of [0, 1]) {
        const previousEpoch = session.getSessionEpoch();
        expect(await workflow.startNew(null)).toBe(true);
        expect(session.getDocument()).toBeNull();
        expect(session.getSessionEpoch()).toBe(previousEpoch + 1);
        expect(workflow.getState().sessionEpoch).toBe(session.getSessionEpoch());
        expect(workflow.getState().pending).toBeNull();
        expect(workflow.getState().dirty).toBe(false);
        expect(workflow.getState().savedSnapshot).toBeNull();
        expect(workflow.getState().error).toBeNull();
      }
    } finally {
      await workflow.dispose();
    }
  });

  it('compares the full persistent document with fixed timestamps; save does not replace session', async () => {
    const { workflow, session, records } = setup();
    expect(workflow.getState().dirty).toBe(true);
    expect(await workflow.save()).toBe(true);
    expect(workflow.getState().dirty).toBe(false);
    expect(session.sessionEpoch).toBe(0);
    session.rename('Changed');
    expect(workflow.getState().dirty).toBe(true);
    expect((records.get('project-cutter') as { name: string }).name).toBe('Étoile');
    session.rename('Étoile');
    expect(workflow.getState().dirty).toBe(false);
  });

  it('captures immutable A before save while edit B remains dirty', async () => {
    const { workflow, session, backend } = setup();
    const gate = deferred<void>();
    vi.mocked(backend.put).mockImplementationOnce(() => gate.promise);
    const saving = workflow.save();
    await flush();
    session.rename('B'); gate.resolve();
    expect(await saving).toBe(true);
    expect(workflow.getState().dirty).toBe(true);
    expect(workflow.getState().savedSnapshot).toBe(encodeProject(projectDocument()));
    expect(vi.mocked(backend.put).mock.calls[0][0].name).toBe('Étoile');
  });

  it('serializes writes and keeps latest result; failed writes remain dirty', async () => {
    const { workflow, session, backend, records } = setup();
    const gate = deferred<void>();
    vi.mocked(backend.put).mockImplementationOnce(async doc => { await gate.promise; records.set(doc.id, doc); });
    const first = workflow.save(); await flush(); session.rename('B');
    const second = workflow.save(); await flush();
    expect(backend.put).toHaveBeenCalledTimes(1);
    gate.resolve(); await first; expect(await second).toBe(true);
    expect(workflow.getState().dirty).toBe(false);
    expect((records.get('project-cutter') as { name: string }).name).toBe('B');
    session.rename('C'); vi.mocked(backend.put).mockRejectedValueOnce(new Error('quota'));
    expect(await workflow.save()).toBe(false);
    expect(workflow.getState().error?.operation).toBe('save');
    expect(workflow.getState().dirty).toBe(true);
  });

  it('keeps an active save and its failure visible when export supersedes foreground', async () => {
    const { workflow, backend } = setup({ download: vi.fn() });
    const gate = deferred<void>();
    vi.mocked(backend.put).mockReturnValueOnce(gate.promise);
    const saving = workflow.save();
    await flush();
    expect(await workflow.export()).toBe(true);
    expect(workflow.getState().pending).toBeNull();
    const activeSaving = workflow.getState().saving;
    gate.reject(new Error('quota'));
    expect(await saving).toBe(false);
    expect(workflow.getState().error?.message).toBe('save: échec de l’opération. quota');
    expect(activeSaving).toBe(true);
    expect(workflow.getState().saving).toBe(false);
    expect(workflow.getState().saveError?.message).toBe('save: échec de l’opération. quota');
    expect(workflow.getState().error).toBe(workflow.getState().saveError);
    expect(await workflow.export()).toBe(true);
    expect(workflow.getState().saveError?.message).toBe('save: échec de l’opération. quota');
    expect(workflow.getState().error).toBe(workflow.getState().saveError);

    const retry = deferred<void>();
    vi.mocked(backend.put).mockReturnValueOnce(retry.promise);
    const retried = workflow.save();
    expect(workflow.getState().saving).toBe(true);
    expect(workflow.getState().saveError).toBeNull();
    expect(workflow.getState().error).toBeNull();
    retry.resolve();
    expect(await retried).toBe(true);
    expect(workflow.getState().saving).toBe(false);
  });

  it.each([true, false])('tracks all queued saves and final success=%s in completion order', async lastSucceeds => {
    const { workflow, backend, session } = setup({ download: vi.fn() });
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();
    vi.mocked(backend.put).mockReturnValueOnce(firstGate.promise).mockReturnValueOnce(secondGate.promise);
    const first = workflow.save();
    await flush(); session.rename('B');
    const second = workflow.save();
    expect(await workflow.export()).toBe(true);
    if (lastSucceeds) firstGate.reject(new Error('first failure'));
    else firstGate.resolve();
    expect(await first).toBe(!lastSucceeds);
    expect(workflow.getState().saving).toBe(true);
    expect(workflow.getState().saveError?.message ?? null).toBe(lastSucceeds ? 'save: échec de l’opération. first failure' : null);
    if (lastSucceeds) secondGate.resolve();
    else secondGate.reject(new Error('second failure'));
    expect(await second).toBe(lastSucceeds);
    expect(workflow.getState().saving).toBe(false);
    expect(workflow.getState().saveError?.message ?? null).toBe(lastSucceeds ? null : 'save: échec de l’opération. second failure');
    expect(workflow.getState().error).toBe(workflow.getState().saveError);
    expect(workflow.getState().dirty).toBe(!lastSucceeds);
  });

  it('ignores old-session save failure without clearing a new-session active save', async () => {
    const { workflow, backend, session } = setup({ download: vi.fn() });
    const oldGate = deferred<void>();
    const newGate = deferred<void>();
    vi.mocked(backend.put).mockReturnValueOnce(oldGate.promise).mockReturnValueOnce(newGate.promise);
    const oldSave = workflow.save(); await flush();
    session.replace(projectDocument('stamp'));
    expect(workflow.getState().saving).toBe(false);
    expect(workflow.getState().saveError).toBeNull();
    const newSave = workflow.save();
    expect(await workflow.export()).toBe(true);
    oldGate.reject(new Error('old quota'));
    expect(await oldSave).toBe(false);
    expect(workflow.getState().saving).toBe(true);
    expect(workflow.getState().saveError).toBeNull();
    expect(workflow.getState().error).toBeNull();
    expect(workflow.getState().savedSnapshot).toBeNull();
    newGate.resolve(); expect(await newSave).toBe(true);
    expect(workflow.getState().saving).toBe(false);
    expect(workflow.getState().savedSnapshot).toBe(encodeProject(projectDocument('stamp')));
  });

  it('keeps saveError distinct when export fails and restores it after export retry', async () => {
    const download = vi.fn();
    const { workflow, backend } = setup({ download });
    vi.mocked(backend.put).mockRejectedValueOnce(new Error('quota'));
    expect(await workflow.save()).toBe(false);
    download.mockRejectedValueOnce(new Error('download'));
    expect(await workflow.export()).toBe(false);
    expect(workflow.getState().error?.operation).toBe('export');
    expect(workflow.getState().saveError?.message).toBe('save: échec de l’opération. quota');
    expect(await workflow.export()).toBe(true);
    expect(workflow.getState().error).toBe(workflow.getState().saveError);
  });

  it('list failure preserves loaded library and uses distinct error', async () => {
    const { workflow, records, backend } = setup(); records.set('project-cutter', projectDocument());
    expect(await workflow.list()).toBe(true);
    vi.mocked(backend.getAll).mockRejectedValueOnce(new Error('offline'));
    expect(await workflow.list()).toBe(false);
    expect(workflow.getState().library.loaded).toBe(true);
    expect(workflow.getState().library.documents).toHaveLength(1);
    expect(workflow.getState().library.listError).not.toBeNull();
    expect(workflow.getState().error).toBeNull();
  });

  it('missing/invalid/unrepresentable opens preserve active session without guard', async () => {
    const confirmDiscard = vi.fn(async () => 'discard' as const);
    const assertRepresentable = vi.fn((doc: { name: string }) => { if (doc.name === 'unsupported') throw new Error('unsupported'); });
    const { workflow, records, session } = setup({ confirmDiscard, assertRepresentable });
    expect(await workflow.open('missing')).toBe(false);
    records.set('invalid', {}); expect(await workflow.open('invalid')).toBe(false);
    records.set('other', { ...projectDocument(), name: 'unsupported' });
    expect(await workflow.open('other')).toBe(false);
    expect(session.getDocument()?.name).toBe('Étoile'); expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it('cancel and save failure abort guarded switches; absent guard fails closed', async () => {
    const { workflow, session } = setup(); expect(await workflow.startNew(null)).toBe(false);
    expect(session.getDocument()).not.toBeNull();
    const cancel = setup({ confirmDiscard: async () => 'cancel' });
    expect(await cancel.workflow.startNew(null)).toBe(false);
    const fail = setup({ confirmDiscard: async () => 'save' });
    vi.mocked(fail.backend.put).mockRejectedValue(new Error('quota'));
    expect(await fail.workflow.startNew(null)).toBe(false);
    expect(fail.session.getDocument()).not.toBeNull();
  });

  it.each(['open', 'import', 'startNew', 'clear'] as const)('external context invalidation during guard-save blocks %s but commits the save', async operation => {
    let revision = 0;
    const captureTransitionValidity = vi.fn(() => { const captured = revision; return () => captured === revision; });
    const { workflow, session, backend, records } = setup({ captureTransitionValidity, confirmDiscard: async () => 'save' });
    const incoming = { ...projectDocument('stamp'), id: 'incoming' };
    if (operation === 'open') records.set(incoming.id, incoming);
    const gate = deferred<void>();
    vi.mocked(backend.put).mockImplementationOnce(async doc => { await gate.promise; records.set(doc.id, doc); });
    const original = session.getDocument();
    const switching = operation === 'open' ? workflow.open(incoming.id) : operation === 'import' ? workflow.import(blob(incoming)) : workflow.startNew(operation === 'clear' ? null : incoming);
    await vi.waitFor(() => expect(backend.put).toHaveBeenCalledOnce());
    revision += 1; gate.resolve();
    expect(await switching).toBe(false);
    expect(session.getDocument()).toBe(original);
    expect(session.sessionEpoch).toBe(0);
    expect(records.has(original!.id)).toBe(true);
    expect(workflow.getState().dirty).toBe(false);
    expect(await workflow.startNew(incoming)).toBe(true);
    expect(captureTransitionValidity).toHaveBeenCalledTimes(2);
    await workflow.dispose();
  });

  it.each(['replace', 'clear', 'new'] as const)('rechecks internal currency after a truthy external validity callback re-enters %s at the final check', async mutation => {
    let checks = 0;
    let newer: Promise<boolean> | undefined;
    const { workflow, session } = setup({ confirmDiscard: async () => 'discard', captureTransitionValidity: () => () => {
      // The second begin publication arms the callback at the final replacement boundary.
      if (armed && ++checks === 1) {
        if (mutation === 'replace') session.replace({ ...projectDocument(), name: 'newer' });
        else if (mutation === 'clear') session.clear();
        else newer = workflow.startNew({ ...projectDocument(), name: 'newer' });
      }
      return true;
    } });
    let armed = false, publications = 0;
    const unsubscribe = workflow.subscribe(state => { if (state.pending === 'startNew' && ++publications === 2) armed = true; });
    expect(await workflow.startNew({ ...projectDocument(), name: 'obsolete' })).toBe(false);
    if (newer) expect(await newer).toBe(true);
    expect(session.getDocument()?.name ?? null).toBe(mutation === 'clear' ? null : 'newer');
    unsubscribe(); await workflow.dispose();
  });

  it.each(['getter', 'capture', 'validity', 'non-function', 'non-boolean'] as const)('external validity %s fails closed without rejecting', async fault => {
    const options: Partial<ProjectWorkflowOptions> = { confirmDiscard: async () => 'discard' };
    Object.defineProperty(options, 'captureTransitionValidity', { enumerable: true, get: () => {
      // setup spreads options; install the hostile getter on the actual factory options below instead.
      return () => { if (fault === 'capture') throw new Error('capture'); return fault === 'non-function' ? null : () => { if (fault === 'validity') throw new Error('validity'); return fault === 'non-boolean' ? 'yes' : true; }; };
    } });
    const { session, storage } = setup();
    const injected = { session, storage, confirmDiscard: options.confirmDiscard } as ProjectWorkflowOptions;
    Object.defineProperty(injected, 'captureTransitionValidity', { get: () => { if (fault === 'getter') throw new Error('getter'); return options.captureTransitionValidity; } });
    const workflow = createProjectWorkflow(injected);
    expect(await workflow.startNew(null)).toBe(false);
    expect(session.sessionEpoch).toBe(0);
    await workflow.dispose();
  });

  it('captures external context before begin observers can start a newer transition', async () => {
    let revision = 0;
    const captures: number[] = [];
    const { workflow, session } = setup({ confirmDiscard: async () => 'discard', captureTransitionValidity: () => {
      const captured = revision; captures.push(captured); return () => captured === revision;
    } });
    let newer: Promise<boolean> | undefined;
    let entered = false;
    const unsubscribe = workflow.subscribe(state => {
      if (state.pending === 'startNew' && !entered) { entered = true; revision++; newer = workflow.startNew({ ...projectDocument(), name: 'newer' }); }
    });
    expect(await workflow.startNew({ ...projectDocument(), name: 'obsolete' })).toBe(false);
    expect(await newer).toBe(true);
    expect(captures).toEqual([0, 1]);
    expect(session.getDocument()?.name).toBe('newer');
    unsubscribe(); await workflow.dispose();
  });

  it('a rejected external capture does not finish another foreground save', async () => {
    const { workflow, backend } = setup({ captureTransitionValidity: () => () => false });
    const gate = deferred<void>();
    vi.mocked(backend.put).mockReturnValueOnce(gate.promise);
    const saving = workflow.save();
    await vi.waitFor(() => expect(backend.put).toHaveBeenCalledOnce());
    expect(await workflow.startNew(null)).toBe(false);
    expect(workflow.getState().pending).toBe('save');
    expect(workflow.getState().saving).toBe(true);
    gate.resolve(); expect(await saving).toBe(true);
    await workflow.dispose();
  });

  it('external invalidation and dispose still drain the guard-save before closing storage', async () => {
    let contextValid = true;
    const { workflow, backend, records, session } = setup({ captureTransitionValidity: () => () => contextValid, confirmDiscard: async () => 'save' });
    const gate = deferred<void>();
    vi.mocked(backend.put).mockImplementationOnce(async doc => { await gate.promise; records.set(doc.id, doc); });
    const original = session.getDocument();
    const switching = workflow.startNew(null);
    await vi.waitFor(() => expect(backend.put).toHaveBeenCalledOnce());
    contextValid = false;
    const disposing = workflow.dispose();
    expect(backend.close).not.toHaveBeenCalled();
    gate.resolve();
    expect(await switching).toBe(false); expect(await disposing).toBe(true);
    expect(records.has(original!.id)).toBe(true);
    expect(session.getDocument()).toBe(original); expect(backend.close).toHaveBeenCalledOnce();
  });

  it.each(['getter', 'capture'] as const)('a reentrant %s cannot publish the older transition even if it throws', async boundary => {
    const { session, storage } = setup();
    let entered = false, newer: Promise<boolean> | undefined;
    let workflow!: ReturnType<typeof createProjectWorkflow>;
    const reenter = () => { if (!entered) { entered = true; newer = workflow.startNew({ ...projectDocument(), name: 'newer' }); throw new Error('obsolete callback'); } };
    const options: ProjectWorkflowOptions = { session, storage, confirmDiscard: async () => 'discard' };
    Object.defineProperty(options, 'captureTransitionValidity', { get: () => {
      if (boundary === 'getter') reenter();
      return () => { if (boundary === 'capture') reenter(); return () => true; };
    } });
    workflow = createProjectWorkflow(options);
    expect(await workflow.startNew(null)).toBe(false);
    expect(await newer).toBe(true);
    expect(session.getDocument()?.name).toBe('newer'); expect(workflow.getState().error).toBeNull();
    await workflow.dispose();
  });

  it('guard save cannot discard edits made during the save', async () => {
    const { workflow, session, backend } = setup({ confirmDiscard: async () => 'save' });
    const gate = deferred<void>(); vi.mocked(backend.put).mockImplementationOnce(() => gate.promise);
    const switching = workflow.startNew(null); await flush(); session.rename('new work'); gate.resolve();
    expect(await switching).toBe(false); expect(session.getDocument()?.name).toBe('new work');
  });

  it('open is clean, imported/new dirty and external same-ID replacement clears baseline', async () => {
    const { workflow, records, session } = setup({ confirmDiscard: async () => 'discard' });
    records.set('project-cutter', projectDocument()); expect(await workflow.open('project-cutter')).toBe(true);
    expect(workflow.getState().dirty).toBe(false);
    session.replace(projectDocument()); expect(workflow.getState().savedSnapshot).toBeNull();
    expect(workflow.getState().dirty).toBe(true);
    expect(await workflow.startNew(projectDocument('stamp'))).toBe(true); expect(workflow.getState().dirty).toBe(true);
  });

  it.each(['rename', 'kind', 'geometry'] as const)('retains the opened baseline after a synchronous observer %s edit', async edit => {
    const incoming = { ...projectDocument(), id: 'incoming', name: 'B' };
    const { workflow, session, records } = setup({ confirmDiscard: async () => 'discard' });
    records.set(incoming.id, incoming);
    let entered = false;
    const unsubscribe = session.subscribe(doc => {
      if (doc?.id !== incoming.id || entered) return;
      entered = true;
      if (edit === 'rename') session.rename('edited B');
      else if (edit === 'kind') session.changeKind('stamp');
      else session.updateSketch('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L20 0L20 20Z"/></svg>');
    });
    expect(await workflow.open(incoming.id)).toBe(true);
    expect(workflow.getState().savedSnapshot).toBe(encodeProject(incoming));
    expect(workflow.getState().dirty).toBe(true);
    expect(workflow.getState().sessionEpoch).toBe(session.sessionEpoch);
    unsubscribe(); await workflow.dispose();
  });

  it.each(['different-ID', 'same-ID', 'clear'] as const)('does not publish an opened baseline after observer replacement %s', async change => {
    const incoming = { ...projectDocument(), id: 'incoming', name: 'B' };
    const replacement = { ...projectDocument('stamp'), id: change === 'same-ID' ? incoming.id : 'C', name: 'C' };
    const { workflow, session, records } = setup({ confirmDiscard: async () => 'discard' });
    records.set(incoming.id, incoming);
    let entered = false;
    const unsubscribe = session.subscribe(doc => {
      if (doc?.id !== incoming.id || entered) return;
      entered = true;
      if (change === 'clear') session.clear(); else session.replace(replacement);
    });
    expect(await workflow.open(incoming.id)).toBe(false);
    expect(session.getDocument()).toEqual(change === 'clear' ? null : replacement);
    expect(workflow.getState().savedSnapshot).toBeNull();
    expect(workflow.getState().dirty).toBe(change !== 'clear');
    expect(workflow.getState().sessionEpoch).toBe(2);
    expect(workflow.getState().pending).toBeNull();
    expect(workflow.getState().error).toBeNull();
    unsubscribe(); await workflow.dispose();
  });

  it('does not clear the saved baseline of a document created by a clear observer', async () => {
    const { workflow, session } = setup({ confirmDiscard: async () => 'discard' });
    const replacement = { ...projectDocument('stamp'), id: 'C' };
    let saving: Promise<boolean> | undefined;
    const unsubscribe = session.subscribe(doc => {
      if (doc !== null) return;
      session.replace(replacement);
      saving = workflow.save();
    });
    expect(await workflow.startNew(null)).toBe(false);
    expect(workflow.getState().pending).toBe('save');
    expect(await saving).toBe(true);
    expect(session.getDocument()).toEqual(replacement);
    expect(workflow.getState().savedSnapshot).toBe(encodeProject(replacement));
    expect(workflow.getState().dirty).toBe(false);
    unsubscribe(); await workflow.dispose();
  });

  it('preserves a newer workflow ticket started from replacement notification', async () => {
    const incoming = { ...projectDocument(), id: 'incoming', name: 'B' };
    const decision = deferred<'discard'>();
    const { workflow, session, records } = setup({ confirmDiscard: vi.fn().mockResolvedValueOnce('discard').mockReturnValueOnce(decision.promise) });
    records.set(incoming.id, incoming);
    let newer: Promise<boolean> | undefined;
    let entered = false;
    const unsubscribe = session.subscribe(doc => {
      if (doc?.id !== incoming.id || entered) return;
      entered = true;
      session.rename('edited B');
      newer = workflow.startNew({ ...projectDocument('stamp'), id: 'C' });
    });
    expect(await workflow.open(incoming.id)).toBe(false);
    expect(workflow.getState().pending).toBe('startNew');
    expect(workflow.getState().dirty).toBe(true);
    decision.resolve('discard');
    expect(await newer).toBe(true);
    expect(session.getDocument()?.id).toBe('C');
    expect(workflow.getState().savedSnapshot).toBeNull();
    unsubscribe(); await workflow.dispose();
  });

  it.each(['before', 'after'] as const)('preserves an observer save ticket and exact baseline (%s workflow subscription)', async order => {
    const incoming = { ...projectDocument(), id: 'incoming', name: 'B' };
    const session = createDesignSessionStore(projectDocument(), { now: () => UPDATED_AT });
    const { storage, backend, records } = setup();
    records.set(incoming.id, incoming);
    const gate = deferred<void>();
    vi.mocked(backend.put).mockImplementationOnce(async doc => { await gate.promise; records.set(doc.id, doc); });
    let workflow!: ReturnType<typeof createProjectWorkflow>;
    let saving: Promise<boolean> | undefined;
    let entered = false;
    const observe = () => session.subscribe(doc => {
      if (doc?.id !== incoming.id || entered) return;
      entered = true;
      session.rename('saved edit B');
      saving = workflow.save();
    });
    const early = order === 'before' ? observe() : undefined;
    workflow = createProjectWorkflow({ session, storage, confirmDiscard: async () => 'discard' });
    const late = order === 'after' ? observe() : undefined;
    expect(await workflow.open(incoming.id)).toBe(true);
    expect(workflow.getState().pending).toBe('save');
    expect(workflow.getState().saving).toBe(true);
    expect(workflow.getState().savedSnapshot).toBe(encodeProject(incoming));
    expect(workflow.getState().dirty).toBe(true);
    gate.resolve();
    expect(await saving).toBe(true);
    expect(workflow.getState().savedSnapshot).toBe(encodeProject(session.getDocument()));
    expect(workflow.getState().dirty).toBe(false);
    expect(workflow.getState().saving).toBe(false);
    early?.(); late?.(); await workflow.dispose();
  });

  it('accepts the intended replacement without reusing an external guard bound to the old epoch', async () => {
    const { session, storage, records } = setup();
    const incoming = { ...projectDocument(), id: 'incoming' };
    records.set(incoming.id, incoming);
    const workflow = createProjectWorkflow({ session, storage, confirmDiscard: async () => 'discard', captureTransitionValidity: () => {
      const captured = session.sessionEpoch;
      return () => session.sessionEpoch === captured;
    } });
    expect(await workflow.open(incoming.id)).toBe(true);
    expect(session.getDocument()).toEqual(incoming);
    expect(workflow.getState().savedSnapshot).toBe(encodeProject(incoming));
    expect(workflow.getState().dirty).toBe(false);
    await workflow.dispose();
  });

  it('a workflow publication observer can supersede the replacement without losing its ticket', async () => {
    const { workflow, session, records } = setup({ confirmDiscard: async () => 'discard' });
    const incoming = { ...projectDocument(), id: 'incoming' };
    records.set(incoming.id, incoming);
    let newer: Promise<boolean> | undefined;
    let entered = false;
    const unsubscribe = workflow.subscribe(state => {
      if (state.sessionEpoch !== 1 || entered) return;
      entered = true;
      newer = workflow.startNew({ ...projectDocument('stamp'), id: 'C' });
    });
    expect(await workflow.open(incoming.id)).toBe(false);
    expect(await newer).toBe(true);
    expect(session.getDocument()?.id).toBe('C');
    expect(workflow.getState().savedSnapshot).toBeNull();
    expect(workflow.getState().dirty).toBe(true);
    expect(workflow.getState().pending).toBeNull();
    expect(workflow.getState().error).toBeNull();
    unsubscribe(); await workflow.dispose();
  });

  it('reopens the committed same-ID document after guard-save without a stale subsequent save', async () => {
    const { workflow, session, storage, backend, records } = setup({ confirmDiscard: async () => 'save' });
    expect(await workflow.save()).toBe(true);
    session.rename('B');
    const gate = deferred<void>();
    vi.mocked(backend.put).mockImplementationOnce(async doc => { await gate.promise; records.set(doc.id, doc); });
    const opening = workflow.open('project-cutter');
    await flush();
    expect(session.getDocument()?.name).toBe('B');
    gate.resolve();
    expect(await opening).toBe(true);
    expect((await storage.get('project-cutter'))?.name).toBe('B');
    expect(session.getDocument()?.name).toBe('B');
    expect(workflow.getState().savedSnapshot).toBe(encodeProject(session.getDocument()));
    expect(workflow.getState().dirty).toBe(false);
    expect(await workflow.save()).toBe(true);
    expect((await storage.get('project-cutter'))?.name).toBe('B');
  });

  it('open waits an accepted blocked save before reading or replacing the same ID', async () => {
    const confirmDiscard = vi.fn(async () => 'discard' as const);
    const { workflow, session, storage, backend, records } = setup({ confirmDiscard });
    expect(await workflow.save()).toBe(true);
    session.rename('B');
    const gate = deferred<void>();
    vi.mocked(backend.put).mockImplementationOnce(async doc => { await gate.promise; records.set(doc.id, doc); });
    const saving = workflow.save();
    await flush();
    const opening = workflow.open('project-cutter');
    await flush();
    expect(backend.get).not.toHaveBeenCalled();
    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(session.getDocument()?.name).toBe('B');
    gate.resolve();
    expect(await saving).toBe(true);
    expect(await opening).toBe(true);
    expect((await storage.get('project-cutter'))?.name).toBe('B');
    expect(session.getDocument()?.name).toBe('B');
    expect(workflow.getState().dirty).toBe(false);
    expect(workflow.getState().savedSnapshot).toBe(encodeProject(session.getDocument()));
    expect(await workflow.save()).toBe(true);
    expect((await storage.get('project-cutter'))?.name).toBe('B');
  });

  it('rechecks writes accepted during the discard prompt before opening', async () => {
    const decision = deferred<'discard'>();
    const confirmDiscard = vi.fn(() => decision.promise);
    const { workflow, session, storage } = setup({ confirmDiscard });
    await workflow.save(); session.rename('B');
    const opening = workflow.open('project-cutter'); await flush();
    expect(confirmDiscard).toHaveBeenCalledOnce();
    expect(await workflow.save()).toBe(true);
    decision.resolve('discard');
    expect(await opening).toBe(true);
    expect(session.getDocument()?.name).toBe('B');
    expect((await storage.get('project-cutter'))?.name).toBe('B');
    expect(workflow.getState().dirty).toBe(false);
  });

  it('waits a save accepted in the final helper-resolution microtask before replacing', async () => {
    const decision = deferred<'discard'>();
    const { workflow, session, backend, records, storage } = setup({ confirmDiscard: () => decision.promise });
    await workflow.save(); session.rename('B');
    const write = deferred<void>();
    vi.mocked(backend.put).mockImplementationOnce(async doc => { await write.promise; records.set(doc.id, doc); });
    let openingSettled = false;
    let saving: Promise<boolean> | undefined;
    let postGuardPublications = 0;
    const opening = workflow.open('project-cutter');
    await flush();
    const unsubscribe = workflow.subscribe(state => {
      if (state.pending === 'open') postGuardPublications += 1;
    });
    // guard's continuation resolves before this external subscriber. Its queued
    // microtask runs after switchSession calls the async afterGuard helper, but
    // before switchSession resumes from awaiting the helper's resolved promise.
    decision.promise.then(() => queueMicrotask(() => {
      // Initial subscription plus begin('open') after guard: the helper has run.
      expect(postGuardPublications).toBe(2);
      expect(session.sessionEpoch).toBe(0);
      saving = workflow.save();
    }));
    void opening.then(() => { openingSettled = true; });
    decision.resolve('discard');
    await flush();
    expect(saving).toBeDefined();
    expect(backend.put).toHaveBeenCalledTimes(2);
    expect(openingSettled).toBe(false);
    expect(session.sessionEpoch).toBe(0);
    expect(session.getDocument()?.name).toBe('B');
    write.resolve();
    expect(await saving).toBe(true);
    expect(await opening).toBe(true);
    expect(backend.get).toHaveBeenCalledTimes(2);
    expect(session.getDocument()?.name).toBe('B');
    expect((await storage.get('project-cutter'))?.name).toBe('B');
    expect(workflow.getState().savedSnapshot).toBe(encodeProject(session.getDocument()));
    expect(workflow.getState().dirty).toBe(false);
    unsubscribe();
  });

  it('obsolete open confirmation preserves newer session edits and does not guard-save', async () => {
    const decision = deferred<'save'>();
    const { workflow, session, backend } = setup({ confirmDiscard: () => decision.promise });
    await workflow.save(); session.rename('B');
    const opening = workflow.open('project-cutter'); await flush();
    session.rename('C'); decision.resolve('save');
    expect(await opening).toBe(false);
    expect(session.getDocument()?.name).toBe('C');
    expect(workflow.getState().dirty).toBe(true);
    expect(backend.put).toHaveBeenCalledTimes(1);
  });

  it.each(['edit', 'replace'] as const)('rejects a stale post-guard read after session %s', async change => {
    const { workflow, session, backend, records, storage } = setup({ confirmDiscard: async () => 'save' });
    await workflow.save(); session.rename('B');
    const reread = deferred<unknown>();
    vi.mocked(backend.get).mockImplementationOnce(async id => records.get(id)).mockReturnValueOnce(reread.promise);
    const opening = workflow.open('project-cutter');
    await vi.waitFor(() => expect(backend.get).toHaveBeenCalledTimes(2));
    if (change === 'edit') session.rename('C');
    else session.replace({ ...projectDocument(), name: 'C' });
    reread.resolve(records.get('project-cutter'));
    expect(await opening).toBe(false);
    expect(session.getDocument()?.name).toBe('C');
    expect((await storage.get('project-cutter'))?.name).toBe('B');
    expect(workflow.getState().dirty).toBe(true);
  });

  it('late open and failed save after replacement cannot publish stale status', async () => {
    const { workflow, session, backend } = setup({ confirmDiscard: async () => 'discard' });
    const read = deferred<unknown>(); vi.mocked(backend.get).mockReturnValueOnce(read.promise);
    const opening = workflow.open('old'); await flush(); expect(backend.get).toHaveBeenCalledOnce();
    session.replace(projectDocument('stamp')); read.resolve(projectDocument());
    expect(await opening).toBe(false); expect(session.getDocument()?.kind).toBe('stamp');
    const write = deferred<void>(); vi.mocked(backend.put).mockReturnValueOnce(write.promise);
    const saving = workflow.save(); await flush(); session.replace(projectDocument()); write.reject(new Error('late'));
    expect(await saving).toBe(false); expect(workflow.getState().error).toBeNull(); expect(workflow.getState().pending).toBeNull();
    expect(workflow.getState().saveError).toBeNull(); expect(workflow.getState().saving).toBe(false);
  });

  it('newer switch wins over late import and late discard callback', async () => {
    const confirm = deferred<'discard'>();
    const { workflow, session } = setup({ confirmDiscard: () => confirm.promise });
    const text = deferred<string>(); const importing = workflow.import({ size: 1, text: () => text.promise });
    session.replace(projectDocument('stamp')); text.resolve(encodeProject(projectDocument()));
    expect(await importing).toBe(false); expect(session.getDocument()?.kind).toBe('stamp');
    const switching = workflow.startNew(null); await flush(); session.rename('edit during prompt'); confirm.resolve('discard');
    expect(await switching).toBe(false); expect(session.getDocument()?.name).toBe('edit during prompt');
  });

  it.each(['{', JSON.stringify({ format: PROJECT_FORMAT, version: 2, document: projectDocument() })])('invalid import %s validates before guard', async json => {
    const confirmDiscard = vi.fn(async () => 'discard' as const); const { workflow, session } = setup({ confirmDiscard });
    expect(await workflow.import(new Blob([json]))).toBe(false); expect(confirmDiscard).not.toHaveBeenCalled();
    expect(session.getDocument()?.name).toBe('Étoile'); expect(workflow.getState().error?.operation).toBe('import');
  });

  it('legacy import exposes warnings and is not persisted', async () => {
    const { workflow, backend } = setup({ confirmDiscard: async () => 'discard' });
    expect(await workflow.import(new Blob([JSON.stringify(legacy)]))).toBe(true);
    expect(workflow.getState().warnings.some(w => w.includes('thumbnail'))).toBe(true);
    expect(workflow.getState().dirty).toBe(true); expect(backend.put).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'copy', 'replace'] as const)('collision %s requires explicit choice and never auto-writes', async choice => {
    const confirmCollision = vi.fn(async () => choice);
    const { workflow, session, records, backend } = setup({ confirmDiscard: async () => 'discard', confirmCollision });
    records.set('project-cutter', projectDocument());
    expect(await workflow.import(blob(projectDocument()))).toBe(choice !== 'cancel');
    expect(confirmCollision).toHaveBeenCalledOnce(); expect(backend.put).not.toHaveBeenCalled();
    if (choice !== 'cancel') {
      expect(session.getDocument()?.id).toBe(choice === 'copy' ? 'copy-id' : 'project-cutter');
      expect(session.getDocument()?.source).toEqual(projectDocument().source);
      expect(session.getDocument()?.parameters).toEqual(projectDocument().parameters);
      expect(workflow.getState().dirty).toBe(true); expect(await workflow.save()).toBe(true);
    }
  });

  it('checks import collision after guard save creates the same ID', async () => {
    const confirmCollision = vi.fn(async () => 'cancel' as const);
    const { workflow, session, records } = setup({ confirmDiscard: async () => 'save', confirmCollision });
    expect(await workflow.import(blob({ ...projectDocument(), name: 'incoming' }))).toBe(false);
    expect(confirmCollision).toHaveBeenCalledOnce(); expect(session.getDocument()?.name).toBe('Étoile');
    expect(records.has('project-cutter')).toBe(true);
  });

  it('rechecks import collision when a save enters the final helper-resolution gap', async () => {
    const decision = deferred<'replace'>();
    const confirmCollision = vi.fn().mockReturnValueOnce(decision.promise).mockResolvedValueOnce('cancel');
    const { workflow, session, backend, records } = setup({ confirmDiscard: async () => 'discard', confirmCollision });
    await workflow.save(); session.rename('B');
    const write = deferred<void>();
    vi.mocked(backend.put).mockImplementationOnce(async doc => { await write.promise; records.set(doc.id, doc); });
    let importingSettled = false;
    let saving: Promise<boolean> | undefined;
    const importing = workflow.import(blob({ ...projectDocument(), name: 'incoming' }));
    await vi.waitFor(() => expect(confirmCollision).toHaveBeenCalledOnce());
    // The helper's await continuation precedes this subscriber; the caller's
    // await continuation follows it. No production-only test hook is involved.
    decision.promise.then(() => { saving = workflow.save(); });
    void importing.then(() => { importingSettled = true; });
    decision.resolve('replace');
    await flush();
    expect(saving).toBeDefined();
    expect(importingSettled).toBe(false);
    expect(session.sessionEpoch).toBe(0);
    expect(confirmCollision).toHaveBeenCalledOnce();
    write.resolve();
    expect(await saving).toBe(true);
    expect(await importing).toBe(false);
    expect(confirmCollision).toHaveBeenCalledTimes(2);
    expect(confirmCollision.mock.calls[0][1].name).toBe('Étoile');
    expect(confirmCollision.mock.calls[1][1].name).toBe('B');
    expect(session.getDocument()?.name).toBe('B');
    expect((records.get('project-cutter') as { name: string }).name).toBe('B');
  });

  it.each(['edit', 'replace'] as const)('rejects session %s in the final collision-helper gap', async change => {
    const decision = deferred<'replace'>();
    const confirmCollision = vi.fn(() => decision.promise);
    const { workflow, session, records } = setup({ confirmDiscard: async () => 'discard', confirmCollision });
    records.set('project-cutter', projectDocument());
    const importing = workflow.import(blob({ ...projectDocument(), name: 'incoming' }));
    await vi.waitFor(() => expect(confirmCollision).toHaveBeenCalledOnce());
    decision.promise.then(() => {
      if (change === 'edit') session.rename('C');
      else session.replace({ ...projectDocument(), name: 'C' });
    });
    decision.resolve('replace');
    expect(await importing).toBe(false);
    expect(session.getDocument()?.name).toBe('C');
    expect(workflow.getState().dirty).toBe(true);
  });

  it('copy rejects an ID that already exists or equals source ID', async () => {
    const { workflow, records, session } = setup({ confirmDiscard: async () => 'discard', confirmCollision: async () => 'copy', createId: () => 'project-cutter' });
    records.set('project-cutter', projectDocument()); expect(await workflow.import(blob(projectDocument()))).toBe(false);
    expect(session.sessionEpoch).toBe(0);
  });

  it('requires confirmed delete, updates library and invalidates current saved baseline', async () => {
    const { workflow, backend, records, session } = setup(); await workflow.save(); await workflow.list();
    expect(await workflow.delete('project-cutter', false)).toBe(false); expect(backend.delete).not.toHaveBeenCalled();
    expect(await workflow.delete('project-cutter', true)).toBe(true); expect(records.has('project-cutter')).toBe(false);
    expect(workflow.getState().library.documents).toHaveLength(0); expect(workflow.getState().dirty).toBe(true);
    expect(session.getDocument()).not.toBeNull();
  });

  it('export delegates snapshot, leaves dirty baseline alone, captures errors', async () => {
    const download = vi.fn(); const { workflow } = setup({ download });
    expect(await workflow.export()).toBe(true); expect(download).toHaveBeenCalledWith(projectDocument());
    expect(workflow.getState().dirty).toBe(true);
    download.mockImplementationOnce(() => { throw new Error('download'); });
    expect(await workflow.export()).toBe(false); expect(workflow.getState().error?.operation).toBe('export');
  });

  it('retains last successful snapshot when a later queued save fails', async () => {
    const { workflow, session, backend } = setup(); const gate = deferred<void>();
    vi.mocked(backend.put).mockReturnValueOnce(gate.promise).mockRejectedValueOnce(new Error('quota'));
    const first = workflow.save(); await flush(); session.rename('B'); const second = workflow.save();
    gate.resolve(); expect(await first).toBe(true); expect(await second).toBe(false);
    expect(workflow.getState().savedSnapshot).toBe(encodeProject(projectDocument()));
    expect(workflow.getState().dirty).toBe(true);
  });

  it('late confirmation after dispose cannot replace session or write', async () => {
    const decision = deferred<'discard'>(); const { workflow, session, backend } = setup({ confirmDiscard: () => decision.promise });
    const switching = workflow.startNew(null); await flush(); await workflow.dispose(); decision.resolve('discard');
    expect(await switching).toBe(false); expect(session.getDocument()).not.toBeNull(); expect(backend.put).not.toHaveBeenCalled();
  });

  it('dispose retains close failure and late read cannot reopen storage', async () => {
    const { workflow, backend, session } = setup(); const gate = deferred<unknown>();
    vi.mocked(backend.get).mockReturnValueOnce(gate.promise); vi.mocked(backend.close!).mockRejectedValueOnce(new Error('close failed'));
    const opening = workflow.open('later'); await flush(); expect(backend.get).toHaveBeenCalledOnce();
    const disposing = workflow.dispose(); await flush(); expect(backend.close).not.toHaveBeenCalled();
    gate.resolve(projectDocument('stamp')); expect(await opening).toBe(false); expect(await disposing).toBe(false);
    expect(workflow.getState().error?.operation).toBe('dispose'); expect(session.getDocument()?.kind).toBe('cutter');
  });

  it('dispose waits queued writes, closes once, unsubscribes and prevents late callbacks', async () => {
    const { workflow, session, backend } = setup(); const gate = deferred<void>();
    vi.mocked(backend.put).mockReturnValueOnce(gate.promise);
    const first = workflow.save(); await flush(); session.rename('B'); const second = workflow.save();
    const listener = vi.fn(); workflow.subscribe(listener);
    const disposing = workflow.dispose(); const calls = listener.mock.calls.length;
    expect(workflow.getState().saving).toBe(false);
    session.rename('C'); expect(listener).toHaveBeenCalledTimes(calls); expect(backend.close).not.toHaveBeenCalled();
    gate.resolve(); await first; await second; expect(await disposing).toBe(true);
    expect(backend.put).toHaveBeenCalledTimes(2); expect(backend.close).toHaveBeenCalledOnce();
    expect(await workflow.save()).toBe(false); expect(await workflow.dispose()).toBe(true);
  });
});
