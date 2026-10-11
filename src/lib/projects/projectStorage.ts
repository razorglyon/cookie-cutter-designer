import type { DesignDocument } from '../domain/designDocument';
import { parseDesignDocument } from '../domain/documentValidation';

export type ProjectStorageOperation =
  | 'save'
  | 'get'
  | 'list'
  | 'delete'
  | 'close';

export class ProjectStorageError extends Error {
  readonly operation: ProjectStorageOperation;
  readonly cause: unknown;

  constructor(
    operation: ProjectStorageOperation,
    message: string,
    cause?: unknown
  ) {
    super(`${operation}: ${message}`);
    this.name = 'ProjectStorageError';
    this.operation = operation;
    this.cause = cause;
  }
}

export interface ProjectRecordBackend {
  put(record: DesignDocument): Promise<void>;
  get(id: string): Promise<unknown | undefined>;
  getAll(): Promise<readonly unknown[]>;
  delete(id: string): Promise<void>;
  close?(): Promise<void>;
}

export interface ProjectStorage {
  save(value: unknown): Promise<DesignDocument>;
  get(id: string): Promise<DesignDocument | undefined>;
  list(): Promise<readonly DesignDocument[]>;
  delete(id: string): Promise<void>;
  close(): Promise<void>;
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim().length > 0) {
    return ` ${cause.message}`;
  }
  return '';
}

async function runStorageOperation<TResult>(
  operation: ProjectStorageOperation,
  action: () => Promise<TResult>
): Promise<TResult> {
  try {
    return await action();
  } catch (cause) {
    if (
      cause instanceof ProjectStorageError &&
      cause.operation === operation
    ) {
      throw cause;
    }

    throw new ProjectStorageError(
      operation,
      `échec de l’opération.${describeCause(cause)}`,
      cause
    );
  }
}

function requireNonEmptyId(
  id: string,
  operation: Extract<ProjectStorageOperation, 'get' | 'delete'>
): void {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new ProjectStorageError(
      operation,
      'l’identifiant du projet doit être une chaîne non vide.'
    );
  }
}

export function createProjectStorage(
  backend: ProjectRecordBackend
): ProjectStorage {
  return {
    save(value: unknown): Promise<DesignDocument> {
      return runStorageOperation('save', async () => {
        const record = parseDesignDocument(value);
        await backend.put(record);
        return parseDesignDocument(record);
      });
    },

    get(id: string): Promise<DesignDocument | undefined> {
      return runStorageOperation('get', async () => {
        requireNonEmptyId(id, 'get');
        const value = await backend.get(id);
        return value === undefined
          ? undefined
          : parseDesignDocument(value);
      });
    },

    list(): Promise<readonly DesignDocument[]> {
      return runStorageOperation('list', async () => {
        const values = await backend.getAll();
        const records = values.map((value) => parseDesignDocument(value));
        records.sort(
          (left, right) =>
            Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        );
        return records;
      });
    },

    delete(id: string): Promise<void> {
      return runStorageOperation('delete', async () => {
        requireNonEmptyId(id, 'delete');
        await backend.delete(id);
      });
    },

    close(): Promise<void> {
      return runStorageOperation('close', async () => {
        await backend.close?.();
      });
    }
  };
}

const DATABASE_NAME = 'cookie-cutter-designer';
const DATABASE_VERSION = 1;
const PROJECT_STORE_NAME = 'projects';

function errorOrFallback(cause: unknown, fallbackMessage: string): unknown {
  return cause ?? new Error(fallbackMessage);
}

function openProjectDatabase(indexedDB: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (cause) {
      reject(cause);
      return;
    }

    let settled = false;
    const fail = (cause: unknown, fallbackMessage: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(errorOrFallback(cause, fallbackMessage));
    };

    request.onupgradeneeded = () => {
      try {
        const database = request.result;
        if (!database.objectStoreNames.contains(PROJECT_STORE_NAME)) {
          database.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id' });
        }
      } catch (cause) {
        try {
          request.transaction?.abort();
        } catch {
          // L’échec d’upgrade initial reste la cause utile.
        }
        fail(cause, 'La création du stockage IndexedDB a échoué.');
      }
    };

    request.onerror = () => {
      fail(request.error, 'L’ouverture de la base IndexedDB a échoué.');
    };

    request.onblocked = () => {
      fail(undefined, 'L’ouverture de la base IndexedDB est bloquée.');
    };

    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }

      settled = true;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

type ProjectTransactionMode = Extract<IDBTransactionMode, 'readonly' | 'readwrite'>;

type RequestOutcome<TResult> =
  | { readonly ready: false }
  | { readonly ready: true; readonly value: TResult };

function runRequestTransaction<TResult>(
  database: IDBDatabase,
  mode: ProjectTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<TResult>
): Promise<TResult> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    let request: IDBRequest<TResult>;

    try {
      transaction = database.transaction(PROJECT_STORE_NAME, mode);
      request = createRequest(transaction.objectStore(PROJECT_STORE_NAME));
    } catch (cause) {
      reject(cause);
      return;
    }

    let settled = false;
    let outcome: RequestOutcome<TResult> = { ready: false };
    const fail = (cause: unknown, fallbackMessage: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(errorOrFallback(cause, fallbackMessage));
    };

    request.onsuccess = () => {
      outcome = { ready: true, value: request.result };
    };

    request.onerror = () => {
      fail(request.error, 'La requête IndexedDB a échoué.');
    };

    transaction.onerror = () => {
      fail(transaction.error, 'La transaction IndexedDB a échoué.');
    };

    transaction.onabort = () => {
      fail(transaction.error, 'La transaction IndexedDB a été annulée.');
    };

    transaction.oncomplete = () => {
      if (settled) {
        return;
      }
      if (!outcome.ready) {
        fail(undefined, 'La transaction IndexedDB est terminée sans résultat.');
        return;
      }

      settled = true;
      resolve(outcome.value);
    };
  });
}

function globalIndexedDbFactory(): IDBFactory | undefined {
  return typeof globalThis.indexedDB === 'undefined'
    ? undefined
    : globalThis.indexedDB;
}

export class IndexedDbProjectRecordBackend implements ProjectRecordBackend {
  readonly #indexedDB: IDBFactory | undefined;
  #databasePromise: Promise<IDBDatabase> | undefined;

  constructor(indexedDB: IDBFactory | undefined = globalIndexedDbFactory()) {
    this.#indexedDB = indexedDB;
  }

  async put(record: DesignDocument): Promise<void> {
    const database = await this.getDatabase();
    await runRequestTransaction(
      database,
      'readwrite',
      (store) => store.put(record)
    );
  }

  async get(id: string): Promise<unknown | undefined> {
    const database = await this.getDatabase();
    return runRequestTransaction<unknown>(
      database,
      'readonly',
      (store) => store.get(id)
    );
  }

  async getAll(): Promise<readonly unknown[]> {
    const database = await this.getDatabase();
    return runRequestTransaction<unknown[]>(
      database,
      'readonly',
      (store) => store.getAll()
    );
  }

  async delete(id: string): Promise<void> {
    const database = await this.getDatabase();
    await runRequestTransaction(
      database,
      'readwrite',
      (store) => store.delete(id)
    );
  }

  async close(): Promise<void> {
    const databasePromise = this.#databasePromise;
    this.#databasePromise = undefined;
    if (databasePromise !== undefined) {
      const database = await databasePromise;
      database.close();
    }
  }

  private getDatabase(): Promise<IDBDatabase> {
    if (this.#indexedDB === undefined) {
      return Promise.reject(
        new Error(
          'IndexedDB est indisponible dans cet environnement ; aucun stockage projet natif ne peut être ouvert.'
        )
      );
    }

    const cachedDatabase = this.#databasePromise;
    if (cachedDatabase !== undefined) {
      return cachedDatabase;
    }

    const databasePromise = openProjectDatabase(this.#indexedDB);
    this.#databasePromise = databasePromise;
    void databasePromise.catch(() => {
      if (this.#databasePromise === databasePromise) {
        this.#databasePromise = undefined;
      }
    });
    return databasePromise;
  }
}

export interface IndexedDbProjectStorageOptions {
  readonly indexedDB?: IDBFactory;
}

function selectIndexedDbFactory(
  options: IndexedDbProjectStorageOptions | undefined
): IDBFactory | undefined {
  if (options !== undefined && 'indexedDB' in options) {
    return options.indexedDB;
  }
  return globalIndexedDbFactory();
}

export function createIndexedDbProjectStorage(
  options?: IndexedDbProjectStorageOptions
): ProjectStorage {
  return createProjectStorage(
    new IndexedDbProjectRecordBackend(selectIndexedDbFactory(options))
  );
}
