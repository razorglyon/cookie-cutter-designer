import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectDocument } from './projectFixtures';
import { createProjectRecovery } from '../projectRecovery';
import { createProjectRecoveryStorage, type ProjectRecoveryEnvelope } from '../projectRecoveryStorage';
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const records = new Map<string, ProjectRecoveryEnvelope>();
  const storage = createProjectRecoveryStorage({
    put: async (record) => { records.set(record.draftId, structuredClone(record)); },
    get: async (id) => records.get(id), getAll: async () => [...records.values()], deleteExpected: async () => false
  });
  const save = vi.spyOn(storage, 'save');
  let ids = 0;
  const recovery = createProjectRecovery(storage, {
    createId: () => `12345678-1234-4234-8234-${String(++ids).padStart(12, '0')}`,
    now: () => new Date('2026-10-10T12:00:00.000Z')
  });
  return { recovery, storage, save, records };
}
describe('recovery controller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('coalesces at 750ms and captures a detached snapshot at observe', async () => {
    const { recovery, save } = setup();
    recovery.observe(projectDocument(), 1, true);
    const latest = { ...projectDocument(), name: 'latest' };
    recovery.observe(latest, 1, true);
    latest.name = 'later mutation';
    await vi.advanceTimersByTimeAsync(749); expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await recovery.flush();
    expect(save).toHaveBeenCalledOnce(); expect(save.mock.calls[0][0]).toMatchObject({ document: { name: 'latest' } });
    expect(recovery.getState()).toMatchObject({ pending: false, saving: false, savedAt: '2026-10-10T12:00:00.000Z' });
    await recovery.dispose();
  });
  it('serializes A1/A2 and flush waits for committed completion', async () => {
    const { recovery, save } = setup(), first = deferred<ProjectRecoveryEnvelope>();
    save.mockImplementationOnce(() => first.promise);
    recovery.observe(projectDocument(), 1, true);
    const flush1 = recovery.flush(); await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    recovery.observe({ ...projectDocument(), name: 'A2' }, 1, true);
    let settled = false; const flush2 = recovery.flush().then((result) => { settled = true; return result; });
    expect(save).toHaveBeenCalledTimes(1); expect(settled).toBe(false);
    first.resolve(save.mock.calls[0][0] as ProjectRecoveryEnvelope);
    expect(await flush1).toBe(true); expect(await flush2).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect((save.mock.calls[1][0] as ProjectRecoveryEnvelope).draftId).toBe((save.mock.calls[0][0] as ProjectRecoveryEnvelope).draftId);
    await recovery.dispose();
  });
  it('retains A before its timer when switching to B, with fresh epoch slot', async () => {
    const { recovery, save, records } = setup();
    recovery.observe(projectDocument(), 1, true);
    recovery.observe({ ...projectDocument(), name: 'B' }, 2, true);
    await recovery.flush(); expect(save).toHaveBeenCalledTimes(2);
    const written = [...records.values()]; expect(written.map((r) => r.document.name)).toEqual(['Étoile', 'B']);
    expect(written[0].draftId).not.toBe(written[1].draftId);
    await recovery.dispose();
  });
  it.each(['success', 'failure'])('stale A %s does not publish over B', async (outcome) => {
    const { recovery, save } = setup(), first = deferred<ProjectRecoveryEnvelope>();
    save.mockImplementationOnce(() => first.promise);
    recovery.observe(projectDocument(), 1, true); const pendingA = recovery.flush();
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    recovery.observe({ ...projectDocument(), name: 'B' }, 2, false);
    if (outcome === 'success') first.resolve(save.mock.calls[0][0] as ProjectRecoveryEnvelope);
    else first.reject(new Error('stale A error'));
    await pendingA;
    expect(recovery.getState()).toMatchObject({ sessionEpoch: 2, savedAt: null, error: null, saving: false });
    await recovery.dispose();
  });
  it('two controllers sharing the same project use separate random writer slots', async () => {
    const { storage, records } = setup();
    const a = createProjectRecovery(storage), b = createProjectRecovery(storage);
    a.observe(projectDocument(), 1, true); b.observe(projectDocument(), 1, true);
    await Promise.all([a.flush(), b.flush()]); expect(records.size).toBe(2);
    await a.dispose(); await b.dispose();
  });
  it('clean, null and unavailable initial observations do not allocate or write', async () => {
    const { storage, save } = setup(), createId = vi.fn();
    const recovery = createProjectRecovery(storage, { createId });
    recovery.observe(projectDocument(), 1, false);
    recovery.observe(null, 1, true);
    recovery.observe(projectDocument(), 1, true, false);
    expect(await recovery.flush()).toBe(true); expect(save).not.toHaveBeenCalled(); expect(createId).not.toHaveBeenCalled();
    await recovery.dispose();
  });
  it.each(['clean', 'null', 'unavailable'])('suspends %s captures without losing accepted dirty data or deleting', async (mode) => {
    const { recovery, save, records } = setup();
    recovery.observe(projectDocument(), 1, true);
    recovery.observe(mode === 'null' ? null : { ...projectDocument(), name: 'not accepted' }, 1, mode !== 'clean', mode !== 'unavailable');
    await recovery.flush(); expect(save).toHaveBeenCalledOnce(); expect(records.size).toBe(1);
    recovery.observe(projectDocument(), 1, false); await recovery.flush(); expect(records.size).toBe(1);
    await recovery.dispose();
  });
  it('a clean observation suspends new captures but still debounces the accepted snapshot', async () => {
    const { recovery, save } = setup();
    recovery.observe(projectDocument(), 1, true);
    recovery.observe(projectDocument(), 1, false);
    await vi.advanceTimersByTimeAsync(750);
    expect(save).toHaveBeenCalledOnce();
    await recovery.dispose();
  });
  it('an invalid new epoch reports errors on that epoch, not the old session', async () => {
    const { recovery } = setup();
    recovery.observe(projectDocument(), 1, true);
    recovery.observe({ ...projectDocument(), schemaVersion: 9 } as never, 2, true);
    expect(recovery.getState()).toMatchObject({ sessionEpoch: 2, draftId: null, savedAt: null, error: { operation: 'observe' } });
    await recovery.dispose();
  });
  it('surfaces failure and explicit flush retries the exact snapshot', async () => {
    const { recovery, save } = setup(); save.mockRejectedValueOnce(new Error('quota'));
    recovery.observe(projectDocument(), 1, true);
    expect(await recovery.flush()).toBe(false); expect(recovery.getState().error?.operation).toBe('save');
    expect(await recovery.flush()).toBe(true); expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0][0]).toEqual(save.mock.calls[1][0]); expect(recovery.getState().error).toBeNull();
    await recovery.dispose();
  });
  it('disposal cancels timers, drains accepted last snapshot and suppresses late callbacks', async () => {
    const { recovery, save } = setup(), gate = deferred<ProjectRecoveryEnvelope>();
    const notifications = vi.fn(); recovery.subscribe(notifications);
    save.mockImplementationOnce(() => gate.promise);
    recovery.observe(projectDocument(), 1, true);
    let settled = false; const disposal = recovery.dispose().then((value) => { settled = true; return value; });
    const count = notifications.mock.calls.length;
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce()); expect(settled).toBe(false);
    recovery.observe({ ...projectDocument(), name: 'ignored' }, 2, true);
    gate.resolve(save.mock.calls[0][0] as ProjectRecoveryEnvelope);
    expect(await disposal).toBe(true); await vi.advanceTimersByTimeAsync(1000);
    expect(notifications).toHaveBeenCalledTimes(count); expect(save).toHaveBeenCalledOnce();
  });
  it('repeated empty flushes do not write and parse failure is contained', async () => {
    const { recovery, save } = setup();
    expect(await recovery.flush()).toBe(true); expect(await recovery.flush()).toBe(true);
    expect(() => recovery.observe({ ...projectDocument(), schemaVersion: 9 } as never, 1, true)).not.toThrow();
    expect(recovery.getState().error?.operation).toBe('observe'); expect(save).not.toHaveBeenCalled();
    await recovery.dispose();
  });
  it('list errors are explicit and latest refresh wins over old loads', async () => {
    const { recovery, storage } = setup(), first = deferred<readonly ProjectRecoveryEnvelope[]>();
    const list = vi.spyOn(storage, 'list').mockImplementationOnce(() => first.promise);
    const old = recovery.list(); await recovery.refresh(); first.reject(new Error('old read'));
    await old; expect(recovery.getState()).toMatchObject({ loading: false, listError: null, drafts: [] });
    list.mockRejectedValueOnce(new Error('list failed'));
    expect(await recovery.refresh()).toBe(false); expect(recovery.getState().listError?.operation).toBe('list');
    expect(await recovery.refresh()).toBe(true); await recovery.dispose();
  });
  it('keeps B saving while stale A fails during the serialized B write', async () => {
    const { recovery, save } = setup(), a = deferred<ProjectRecoveryEnvelope>(), b = deferred<ProjectRecoveryEnvelope>();
    save.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
    recovery.observe(projectDocument(), 1, true); const flushA = recovery.flush();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    recovery.observe({ ...projectDocument(), name: 'B' }, 2, true); const flushB = recovery.flush();
    a.reject(new Error('A failed')); expect(await flushA).toBe(false);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(recovery.getState()).toMatchObject({ sessionEpoch: 2, saving: true, savedAt: null, error: null });
    expect((save.mock.calls[0][0] as ProjectRecoveryEnvelope).draftId).not.toBe((save.mock.calls[1][0] as ProjectRecoveryEnvelope).draftId);
    b.resolve(save.mock.calls[1][0] as ProjectRecoveryEnvelope);
    expect(await flushB).toBe(false); // Barrier includes failed A, even though B itself committed.
    expect(recovery.getState()).toMatchObject({ saving: false, savedAt: '2026-10-10T12:00:00.000Z', error: null });
    await recovery.dispose();
  });
  it('a newer accepted snapshot supersedes a failed one and empty flush does not rewrite', async () => {
    const { recovery, save } = setup(); save.mockRejectedValueOnce(new Error('quota'));
    recovery.observe(projectDocument(), 1, true); expect(await recovery.flush()).toBe(false);
    recovery.observe({ ...projectDocument(), name: 'newer' }, 1, true);
    expect(await recovery.flush()).toBe(true); expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({ document: { name: 'newer' } });
    expect(await recovery.flush()).toBe(true); expect(save).toHaveBeenCalledTimes(2); await recovery.dispose();
  });
  it('disposal drains the in-flight write and the newer debounced snapshot', async () => {
    const { recovery, save } = setup(), gate = deferred<ProjectRecoveryEnvelope>();
    save.mockImplementationOnce(() => gate.promise);
    recovery.observe(projectDocument(), 1, true); const flush = recovery.flush();
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    recovery.observe({ ...projectDocument(), name: 'last' }, 1, true);
    const disposal = recovery.dispose(); expect(recovery.dispose()).toBe(disposal);
    gate.resolve(save.mock.calls[0][0] as ProjectRecoveryEnvelope);
    expect(await flush).toBe(true); expect(await disposal).toBe(true);
    expect(save).toHaveBeenCalledTimes(2); expect(save.mock.calls[1][0]).toMatchObject({ document: { name: 'last' } });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('outstanding library loads cannot notify after disposal', async () => {
    const { recovery, storage } = setup(), gate = deferred<readonly ProjectRecoveryEnvelope[]>();
    vi.spyOn(storage, 'list').mockImplementationOnce(() => gate.promise);
    const observer = vi.fn(); recovery.subscribe(observer); const load = recovery.list();
    await recovery.dispose(); const count = observer.mock.calls.length;
    gate.resolve([]); expect(await load).toBe(false); expect(observer).toHaveBeenCalledTimes(count);
  });
  it('stale timer callbacks cannot erase the newer timer; disposal empties the scheduler ledger', async () => {
    const { storage, save } = setup(), callbacks: (() => void)[] = [], ledger = new Set<number>();
    const recovery = createProjectRecovery(storage, {
      schedule: (callback) => { const handle = callbacks.push(callback); ledger.add(handle); return handle; },
      cancel: (handle) => { ledger.delete(handle as number); }
    });
    recovery.observe(projectDocument(), 1, true);
    recovery.observe({ ...projectDocument(), name: 'newer' }, 1, true);
    callbacks[0](); expect(ledger.size).toBe(1); expect(save).not.toHaveBeenCalled();
    await recovery.dispose(); expect(ledger.size).toBe(0); expect(save).toHaveBeenCalledOnce();
    callbacks[1](); expect(save).toHaveBeenCalledOnce();
  });
  it('supports synchronous scheduler callbacks without leaving untracked handles', async () => {
    const { storage, save } = setup();
    const recovery = createProjectRecovery(storage, { schedule: (callback) => { callback(); return 1; }, cancel: vi.fn() });
    recovery.observe(projectDocument(), 1, true); await recovery.flush(); expect(save).toHaveBeenCalledOnce(); await recovery.dispose();
  });
  it('a document getter reentering observe cannot publish the superseded input', async () => {
    const { recovery, save } = setup();
    const input = { ...projectDocument(), get name() {
      recovery.observe({ ...projectDocument(), name: 'reentrant' }, 2, true); return 'stale';
    } };
    recovery.observe(input, 1, true); await recovery.flush();
    expect(recovery.getState().sessionEpoch).toBe(2); expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).toMatchObject({ document: { name: 'reentrant' } }); await recovery.dispose();
  });
  it('contains hostile validation causes without throwing from observe', async () => {
    const { recovery, save } = setup();
    const cause = new Error('hostile');
    Object.defineProperty(cause, 'message', { get() { throw new Error('message getter'); } });
    const input = { ...projectDocument(), get name(): string { throw cause; } };
    expect(() => recovery.observe(input, 1, true)).not.toThrow();
    expect(recovery.getState().error).toMatchObject({ operation: 'observe', cause });
    expect(save).not.toHaveBeenCalled(); await recovery.dispose();
  });
  it('error diagnostics reentering observe cannot overwrite the newer session', async () => {
    const { recovery, save } = setup(), cause = new Error('hostile');
    Object.defineProperty(cause, 'message', { get() {
      recovery.observe({ ...projectDocument(), name: 'new session' }, 2, true); return 'old validation';
    } });
    const input = { ...projectDocument(), get name(): string { throw cause; } };
    recovery.observe(input, 1, true);
    expect(recovery.getState()).toMatchObject({ sessionEpoch: 2, error: null });
    await recovery.flush(); expect(save).toHaveBeenCalledOnce(); await recovery.dispose();
  });
  it('isolates throwing subscribers and reentrant disposal before installing a timer', async () => {
    const { recovery, save } = setup();
    recovery.subscribe(() => { throw new Error('observer'); });
    let disposal: Promise<boolean> | undefined;
    recovery.subscribe((state) => { if (state.pending) disposal = recovery.dispose(); });
    recovery.observe(projectDocument(), 1, true);
    expect(await disposal).toBe(true); await vi.advanceTimersByTimeAsync(1000); expect(save).toHaveBeenCalledOnce();
  });
});
