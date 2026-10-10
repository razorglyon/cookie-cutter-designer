import { describe, expect, it, vi } from 'vitest';
import { projectDocument } from './projectFixtures';
import {
  parseProjectRecoveryEnvelope, createProjectRecoveryStorage,
  IndexedDbProjectRecoveryBackend, ProjectRecoveryStorageError,
  type ProjectRecoveryEnvelope, type ProjectRecoveryBackend
} from '../projectRecoveryStorage';

export function envelope(): ProjectRecoveryEnvelope {
  return { format: 'cookie-cutter-designer-recovery', version: 1,
    draftId: '12345678-1234-4234-8234-123456789abc', savedAt: '2026-10-10T12:00:00.000Z', document: projectDocument() };
}
function backend(): ProjectRecoveryBackend {
  const records = new Map<string, unknown>();
  return {
    put: vi.fn(async (record) => { records.set(record.draftId, structuredClone(record)); }),
    get: vi.fn(async (id) => records.get(id)), getAll: vi.fn(async () => [...records.values()]),
    deleteExpected: vi.fn(async (expected) => {
      const current = records.get(expected.draftId);
      if (!current || JSON.stringify(parseProjectRecoveryEnvelope(current)) !== JSON.stringify(expected)) return false;
      return records.delete(expected.draftId);
    })
  };
}
describe('strict recovery envelope', () => {
  it('reconstructs the full graph without changing the supplied input', () => {
    const input = envelope(), expected = structuredClone(input);
    const parsed = parseProjectRecoveryEnvelope(input);
    expect(parsed).toEqual(expected); expect(parsed).not.toBe(input);
    expect(parsed.document.parameters).not.toBe(input.document.parameters);
    expect(input).toEqual(expected);
    expect(Object.isFrozen(parsed.document.parameters)).toBe(true);
  });
  it.each([
    ['format', 'other'], ['version', 2], ['draftId', 'writer-1'],
    ['savedAt', '2026-02-30T12:00:00.000Z'], ['savedAt', 'yesterday'],
    ['savedAt', '2026-10-10'], ['document', { schemaVersion: 9 }]
  ])('rejects invalid %s: %s', (key, value) => {
    expect(() => parseProjectRecoveryEnvelope({ ...envelope(), [key]: value })).toThrow();
  });
  it('rejects extra and missing keys; diagnoses header before future keys', () => {
    expect(() => parseProjectRecoveryEnvelope({ ...envelope(), extra: true })).toThrow(/keys/i);
    const { savedAt: _unused, ...missing } = envelope();
    expect(() => parseProjectRecoveryEnvelope(missing)).toThrow();
    expect(() => parseProjectRecoveryEnvelope({ ...envelope(), version: 9, future: 1 })).toThrow(/version/i);
    expect(() => parseProjectRecoveryEnvelope({ ...envelope(), format: 'other', future: 1 })).toThrow(/format/i);
  });
});
describe('recovery repository', () => {
  it('validates writes before persistence and detaches both input and return', async () => {
    const port = backend(), storage = createProjectRecoveryStorage(port);
    const input = envelope(), expected = structuredClone(input);
    const saved = await storage.save(input);
    expect(saved).toEqual(expected); expect(saved).not.toBe(input); expect(input).toEqual(expected);
    await expect(storage.save({ ...input, version: 2 })).rejects.toMatchObject({ operation: 'save' });
    expect(port.put).toHaveBeenCalledTimes(1);
  });
  it('validates read corruption visibly without deleting or skipping records', async () => {
    const port = backend(), storage = createProjectRecoveryStorage(port);
    vi.mocked(port.get).mockResolvedValue({ ...envelope(), version: 9 });
    vi.mocked(port.getAll).mockResolvedValue([envelope(), { bad: true }]);
    await expect(storage.get(envelope().draftId)).rejects.toMatchObject({ operation: 'get' });
    await expect(storage.list()).rejects.toMatchObject({ operation: 'list' });
    expect(port.deleteExpected).not.toHaveBeenCalled();
  });
  it('sorts newest first and leaves independent records detached', async () => {
    const port = backend(), storage = createProjectRecoveryStorage(port);
    const older = { ...envelope(), savedAt: '2026-10-09T12:00:00.000Z' };
    vi.mocked(port.getAll).mockResolvedValue([older, envelope()]);
    expect((await storage.list()).map((x) => x.savedAt)).toEqual([envelope().savedAt, older.savedAt]);
  });
  it('delegates atomic expected deletion and rejects conflict without separate get', async () => {
    const port = backend(), storage = createProjectRecoveryStorage(port);
    const old = envelope(); await storage.save(old);
    await storage.save({ ...old, savedAt: '2026-10-10T13:00:00.000Z' });
    await expect(storage.deleteExpected(old)).rejects.toMatchObject({ operation: 'deleteExpected', code: 'conflict' });
    expect(port.get).not.toHaveBeenCalled();
    expect(await storage.get(old.draftId)).toMatchObject({ savedAt: '2026-10-10T13:00:00.000Z' });
    await storage.deleteExpected({ ...old, savedAt: '2026-10-10T13:00:00.000Z' });
    expect(await storage.get(old.draftId)).toBeUndefined();
  });
  it('preserves cause, retries after failures and validates identifiers', async () => {
    const port = backend(), storage = createProjectRecoveryStorage(port), cause = new Error('quota');
    vi.mocked(port.put).mockRejectedValueOnce(cause);
    await expect(storage.save(envelope())).rejects.toMatchObject({ cause, operation: 'save' });
    await expect(storage.save(envelope())).resolves.toEqual(envelope());
    await expect(storage.get('invalid')).rejects.toBeInstanceOf(ProjectRecoveryStorageError);
  });
});
// Event-driven native seam, not a browser/IndexedDB emulation: commit/abort are explicitly controlled.
function nativeHarness() {
  const opens: IDBOpenDBRequest[] = [], transactions: IDBTransaction[] = [];
  const putRequest = {} as IDBRequest<IDBValidKey>, readRequest = {} as IDBRequest<unknown>;
  const allRequest = {} as IDBRequest<unknown[]>, deleteRequest = {} as IDBRequest<undefined>;
  const store = {
    put: vi.fn(() => putRequest), get: vi.fn(() => readRequest),
    getAll: vi.fn(() => allRequest), delete: vi.fn(() => deleteRequest)
  };
  const db = {
    close: vi.fn(), objectStoreNames: { contains: () => false }, createObjectStore: vi.fn(),
    transaction: vi.fn(() => {
      const tx = { objectStore: vi.fn(() => store), abort: vi.fn() } as unknown as IDBTransaction;
      transactions.push(tx); return tx;
    })
  } as unknown as IDBDatabase;
  const open = vi.fn(() => { const req = {} as IDBOpenDBRequest; opens.push(req); return req; });
  const native = new IndexedDbProjectRecoveryBackend({ open } as unknown as IDBFactory);
  function connect() {
    const req = opens[opens.length - 1]; Object.assign(req, { result: db });
    req.onupgradeneeded?.({} as IDBVersionChangeEvent); req.onsuccess?.({} as Event);
  }
  function success<T>(req: IDBRequest<T>, value: T) { Object.assign(req, { result: value }); req.onsuccess?.({} as Event); }
  return { native, opens, open, connect, success, db, transactions, store, putRequest, readRequest, allRequest, deleteRequest };
}
describe('native transaction lifecycle', () => {
  it('creates only drafts/draftId, and put confirmation waits for transaction completion', async () => {
    const h = nativeHarness(); let settled = false;
    const save = h.native.put(envelope()).then(() => { settled = true; }); h.connect();
    await vi.waitFor(() => expect(h.store.put).toHaveBeenCalledOnce());
    expect(h.db.createObjectStore).toHaveBeenCalledWith('drafts', { keyPath: 'draftId' });
    expect(h.db.transaction).toHaveBeenCalledWith('drafts', 'readwrite');
    h.success(h.putRequest, envelope().draftId); await Promise.resolve(); expect(settled).toBe(false);
    h.transactions[0].oncomplete?.({} as Event); await save; expect(settled).toBe(true);
  });
  it('request success followed by abort is a failure, not a successful write', async () => {
    const h = nativeHarness(), save = h.native.put(envelope()); h.connect();
    await vi.waitFor(() => expect(h.store.put).toHaveBeenCalledOnce());
    h.success(h.putRequest, envelope().draftId);
    const cause = new Error('aborted after request'); Object.assign(h.transactions[0], { error: cause });
    h.transactions[0].onabort?.({} as Event); await expect(save).rejects.toBe(cause);
  });
  it('compares canonical snapshot and deletes in the same readwrite transaction', async () => {
    const h = nativeHarness(), expected = envelope();
    const deletion = h.native.deleteExpected(expected); h.connect();
    await vi.waitFor(() => expect(h.store.get).toHaveBeenCalledOnce());
    const reordered = { document: expected.document, savedAt: expected.savedAt, draftId: expected.draftId, version: 1, format: expected.format };
    h.success(h.readRequest, reordered);
    expect(h.store.delete).toHaveBeenCalledWith(expected.draftId); expect(h.db.transaction).toHaveBeenCalledTimes(1);
    let settled = false; void deletion.then(() => { settled = true; });
    h.success(h.deleteRequest, undefined); await Promise.resolve(); expect(settled).toBe(false);
    h.transactions[0].oncomplete?.({} as Event); expect(await deletion).toBe(true);
  });
  it.each(['changed', 'missing', 'corrupt'])('does not delete a %s record', async (kind) => {
    const h = nativeHarness(), deletion = h.native.deleteExpected(envelope()); h.connect();
    await vi.waitFor(() => expect(h.store.get).toHaveBeenCalledOnce());
    const value = kind === 'missing' ? undefined : kind === 'corrupt' ? { broken: true } : { ...envelope(), savedAt: '2026-10-10T13:00:00.000Z' };
    h.success(h.readRequest, value);
    if (kind === 'corrupt') { await expect(deletion).rejects.toThrow(); expect(h.transactions[0].abort).toHaveBeenCalledOnce(); }
    else { h.transactions[0].oncomplete?.({} as Event); expect(await deletion).toBe(false); }
    expect(h.store.delete).not.toHaveBeenCalled();
  });
  it.each(['versionchange', 'close', 'explicit'])('invalidates %s connections and retries opening', async (kind) => {
    const h = nativeHarness(), load = h.native.getAll(); h.connect();
    await vi.waitFor(() => expect(h.store.getAll).toHaveBeenCalledOnce());
    h.success(h.allRequest, []); h.transactions[0].oncomplete?.({} as Event); await load;
    if (kind === 'versionchange') h.db.onversionchange?.({} as IDBVersionChangeEvent);
    else if (kind === 'close') h.db.onclose?.({} as Event);
    else await h.native.close();
    const retry = h.native.getAll(); expect(h.open).toHaveBeenCalledTimes(2);
    h.opens[1].onerror?.({} as Event); await expect(retry).rejects.toThrow();
  });
});
describe('native recovery opening', () => {
  it('uses the distinct database and resets rejected open cache on each retry', async () => {
    const requests: IDBOpenDBRequest[] = [];
    const open = vi.fn(() => { const r = {} as IDBOpenDBRequest; requests.push(r); return r; });
    const native = new IndexedDbProjectRecoveryBackend({ open } as unknown as IDBFactory);
    for (const message of ['first', 'second']) {
      const attempt = native.getAll(); const cause = new Error(message);
      Object.assign(requests.at(-1)!, { error: cause });
      requests.at(-1)!.onerror?.({} as Event);
      await expect(attempt).rejects.toBe(cause);
    }
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith('cookie-cutter-designer-recovery', 1);
  });
  it('explicitly unavailable factory stays unavailable even if a global factory exists', async () => {
    const open = vi.fn(); vi.stubGlobal('indexedDB', { open });
    try {
      const native = new IndexedDbProjectRecoveryBackend(undefined);
      await expect(native.getAll()).rejects.toThrow(/unavailable/i);
      expect(open).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('closes late success after blocked opening and permits retry', async () => {
    const requests: IDBOpenDBRequest[] = [], close = vi.fn();
    const open = vi.fn(() => { const r = {} as IDBOpenDBRequest; requests.push(r); return r; });
    const native = new IndexedDbProjectRecoveryBackend({ open } as unknown as IDBFactory);
    const first = native.getAll(); requests[0].onblocked?.({} as IDBVersionChangeEvent);
    await expect(first).rejects.toThrow(/blocked/i);
    Object.assign(requests[0], { result: { close } }); requests[0].onsuccess?.({} as Event);
    expect(close).toHaveBeenCalledOnce();
    const second = native.getAll(); requests[1].onerror?.({} as Event);
    await expect(second).rejects.toThrow(); expect(open).toHaveBeenCalledTimes(2);
  });
});
