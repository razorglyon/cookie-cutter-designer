import type { DesignDocument } from '../domain/designDocument';
import { parseDesignDocument } from '../domain/documentValidation';

export interface ProjectRecoveryEnvelope {
  readonly format: 'cookie-cutter-designer-recovery';
  readonly version: 1;
  readonly draftId: string;
  readonly savedAt: string;
  readonly document: DesignDocument;
}
export class ProjectRecoveryValidationError extends Error {
  constructor(readonly path: string, message: string, readonly cause?: unknown) {
    super(`${path}: ${message}`); this.name = 'ProjectRecoveryValidationError';
  }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requireUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ProjectRecoveryValidationError('draftId', 'UUID required');
}
function requireTimestamp(value: unknown): asserts value is string {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value as string))) throw new ProjectRecoveryValidationError('savedAt', 'ISO datetime required');
  const [, y, m, d, h, min, s, oh, om] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const days = new Date(0); days.setUTCFullYear(year, month, 0);
  if (month < 1 || month > 12 || day < 1 || day > days.getUTCDate() || Number(h) > 23 || Number(min) > 59 || Number(s) > 59 || Number(oh ?? 0) > 23 || Number(om ?? 0) > 59) {
    throw new ProjectRecoveryValidationError('savedAt', 'Invalid calendar datetime');
  }
}
function freezeGraph<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeGraph(child);
    Object.freeze(value);
  }
  return value;
}
/** Header-first, fail-closed, reconstructed and deeply frozen. Never freezes caller input. */
export function parseProjectRecoveryEnvelope(value: unknown): ProjectRecoveryEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProjectRecoveryValidationError('$', 'Object required');
  const record = value as Record<string, unknown>;
  if (record.format !== 'cookie-cutter-designer-recovery') throw new ProjectRecoveryValidationError('format', 'Unsupported format');
  if (record.version !== 1) throw new ProjectRecoveryValidationError('version', 'Unsupported version');
  const keys = ['format', 'version', 'draftId', 'savedAt', 'document'];
  if (Reflect.ownKeys(record).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(record, key)) || Reflect.ownKeys(record).some((key) => typeof key !== 'string' || !keys.includes(key))) {
    throw new ProjectRecoveryValidationError('$', 'Exact envelope keys required');
  }
  const draftId = record.draftId, savedAt = record.savedAt;
  requireUuid(draftId); requireTimestamp(savedAt);
  let document: DesignDocument;
  try { document = parseDesignDocument(record.document); }
  catch (cause) { throw new ProjectRecoveryValidationError('document', 'Invalid DesignDocument', cause); }
  return freezeGraph({ format: 'cookie-cutter-designer-recovery', version: 1, draftId, savedAt, document });
}
/** Parser fixes property order throughout the graph, so comparison is independent of input key order. */
export function canonicalProjectRecoverySnapshot(value: unknown): string {
  return JSON.stringify(parseProjectRecoveryEnvelope(value));
}
export type ProjectRecoveryStorageOperation = 'save' | 'get' | 'list' | 'deleteExpected' | 'close';
export class ProjectRecoveryStorageError extends Error {
  constructor(readonly operation: ProjectRecoveryStorageOperation, message: string, readonly cause?: unknown, readonly code: 'failure' | 'conflict' = 'failure') {
    super(`${operation}: ${message}`); this.name = 'ProjectRecoveryStorageError';
  }
}
export interface ProjectRecoveryBackend {
  put(record: ProjectRecoveryEnvelope): Promise<void>;
  get(draftId: string): Promise<unknown | undefined>;
  getAll(): Promise<readonly unknown[]>;
  /** Must compare and delete atomically. false means missing or changed, never unconditional deletion. */
  deleteExpected(expected: ProjectRecoveryEnvelope): Promise<boolean>;
  close?(): Promise<void>;
}
export interface ProjectRecoveryStorage {
  save(value: unknown): Promise<ProjectRecoveryEnvelope>;
  get(draftId: string): Promise<ProjectRecoveryEnvelope | undefined>;
  list(): Promise<readonly ProjectRecoveryEnvelope[]>;
  /** Rejects with code=conflict if the exact expected snapshot is not present. */
  deleteExpected(expected: unknown): Promise<void>;
  close(): Promise<void>;
}
async function operation<T>(op: ProjectRecoveryStorageOperation, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (cause) {
    if (cause instanceof ProjectRecoveryStorageError && cause.operation === op) throw cause;
    throw new ProjectRecoveryStorageError(op, cause instanceof Error ? cause.message : 'Storage failure', cause);
  }
}
export function createProjectRecoveryStorage(backend: ProjectRecoveryBackend): ProjectRecoveryStorage {
  return {
    save: (value) => operation('save', async () => {
      const record = parseProjectRecoveryEnvelope(value); await backend.put(record);
      return parseProjectRecoveryEnvelope(record);
    }),
    get: (id) => operation('get', async () => {
      requireUuid(id); const value = await backend.get(id);
      return value === undefined ? undefined : parseProjectRecoveryEnvelope(value);
    }),
    list: () => operation('list', async () => {
      const records = (await backend.getAll()).map(parseProjectRecoveryEnvelope);
      records.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt) || a.draftId.localeCompare(b.draftId));
      return Object.freeze(records);
    }),
    deleteExpected: (value) => operation('deleteExpected', async () => {
      const record = parseProjectRecoveryEnvelope(value);
      if (!await backend.deleteExpected(record)) throw new ProjectRecoveryStorageError('deleteExpected', 'Recovery snapshot changed or missing', undefined, 'conflict');
    }),
    close: () => operation('close', async () => { await backend.close?.(); })
  };
}
export const PROJECT_RECOVERY_DATABASE_NAME = 'cookie-cutter-designer-recovery';
export const PROJECT_RECOVERY_DATABASE_VERSION = 1;
export const PROJECT_RECOVERY_STORE_NAME = 'drafts';

/** Resolves only on transaction completion, never on request success. */
function transaction<T>(database: IDBDatabase, mode: IDBTransactionMode, start: (store: IDBObjectStore, result: (value: T) => void, fail: (cause: unknown) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction | undefined, ready = false, value: T, failed = false;
    const fail = (cause: unknown): void => {
      if (failed) return;
      failed = true; reject(cause ?? new Error('IndexedDB transaction failed'));
      try { tx?.abort(); } catch { /* Preserve original cause. */ }
    };
    try {
      tx = database.transaction(PROJECT_RECOVERY_STORE_NAME, mode);
      tx.onerror = () => fail(tx?.error);
      tx.onabort = () => fail(tx?.error ?? new Error('IndexedDB transaction aborted'));
      tx.oncomplete = () => {
        if (failed) return;
        if (!ready) { fail(new Error('IndexedDB transaction completed without result')); return; }
        resolve(value);
      };
      start(tx.objectStore(PROJECT_RECOVERY_STORE_NAME), (result) => { value = result; ready = true; }, fail);
    } catch (cause) { fail(cause); }
  });
}
function request<T>(req: IDBRequest<T>, result: (value: T) => void, fail: (cause: unknown) => void): void {
  req.onerror = () => fail(req.error);
  req.onsuccess = () => { try { result(req.result); } catch (cause) { fail(cause); } };
}
export class IndexedDbProjectRecoveryBackend implements ProjectRecoveryBackend {
  #opening: Promise<IDBDatabase> | undefined;
  readonly indexedDB: IDBFactory | undefined;
  constructor(indexedDB?: IDBFactory) {
    this.indexedDB = arguments.length === 0 ? globalThis.indexedDB : indexedDB;
  }
  private database(): Promise<IDBDatabase> {
    if (this.#opening) return this.#opening;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      let req: IDBOpenDBRequest, settled = false;
      const fail = (cause: unknown): void => { if (!settled) { settled = true; reject(cause ?? new Error('IndexedDB open failed')); } };
      try { req = this.indexedDB.open(PROJECT_RECOVERY_DATABASE_NAME, PROJECT_RECOVERY_DATABASE_VERSION); }
      catch (cause) { fail(cause); return; }
      req.onerror = () => fail(req.error);
      req.onblocked = () => fail(new Error('IndexedDB open blocked'));
      req.onupgradeneeded = () => {
        try {
          if (!req.result.objectStoreNames.contains(PROJECT_RECOVERY_STORE_NAME)) req.result.createObjectStore(PROJECT_RECOVERY_STORE_NAME, { keyPath: 'draftId' });
        } catch (cause) { try { req.transaction?.abort(); } catch { /* Original cause wins. */ } fail(cause); }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (settled) { db.close(); return; }
        settled = true;
        const invalidate = (): void => { if (this.#opening === opening) this.#opening = undefined; };
        db.onclose = invalidate;
        db.onversionchange = () => { invalidate(); db.close(); };
        resolve(db);
      };
    });
    this.#opening = opening;
    void opening.catch(() => { if (this.#opening === opening) this.#opening = undefined; });
    return opening;
  }
  async put(value: ProjectRecoveryEnvelope): Promise<void> {
    const record = parseProjectRecoveryEnvelope(value);
    const db = await this.database();
    await transaction<IDBValidKey>(db, 'readwrite', (store, result, fail) => request(store.put(record), result, fail));
  }
  async get(id: string): Promise<unknown | undefined> {
    requireUuid(id); const db = await this.database();
    return transaction<unknown>(db, 'readonly', (store, result, fail) => request(store.get(id), result, fail));
  }
  async getAll(): Promise<readonly unknown[]> {
    const db = await this.database();
    return transaction<unknown[]>(db, 'readonly', (store, result, fail) => request(store.getAll(), result, fail));
  }
  async deleteExpected(value: ProjectRecoveryEnvelope): Promise<boolean> {
    const expected = parseProjectRecoveryEnvelope(value), snapshot = canonicalProjectRecoverySnapshot(expected);
    const db = await this.database();
    return transaction<boolean>(db, 'readwrite', (store, result, fail) => {
      request<unknown>(store.get(expected.draftId), (current) => {
        if (current === undefined || canonicalProjectRecoverySnapshot(current) !== snapshot) { result(false); return; }
        request(store.delete(expected.draftId), () => result(true), fail);
      }, fail);
    });
  }
  async close(): Promise<void> {
    const opening = this.#opening; this.#opening = undefined;
    if (opening) (await opening).close();
  }
}
export interface IndexedDbProjectRecoveryStorageOptions { readonly indexedDB?: IDBFactory; }
export function createIndexedDbProjectRecoveryStorage(options?: IndexedDbProjectRecoveryStorageOptions): ProjectRecoveryStorage {
  const factory = options && 'indexedDB' in options ? options.indexedDB : globalThis.indexedDB;
  return createProjectRecoveryStorage(new IndexedDbProjectRecoveryBackend(factory));
}
