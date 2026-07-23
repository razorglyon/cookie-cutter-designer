import { describe, expect, it } from 'vitest';
import type { DesignDocument } from '../../domain/designDocument';
import { DesignDocumentValidationError } from '../../domain/documentValidation';
import {
  ProjectStorageError,
  createIndexedDbProjectStorage,
  createProjectStorage,
  type ProjectRecordBackend
} from '../projectStorage';

interface DocumentOverrides {
  readonly id?: string;
  readonly name?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

function validDocument(overrides: DocumentOverrides = {}) {
  return {
    schemaVersion: 1,
    id: overrides.id ?? 'project-1',
    name: overrides.name ?? 'Étoile',
    kind: 'cutter',
    source: {
      type: 'svg',
      fileName: 'etoile.svg',
      svg: '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>'
    },
    sketch: {
      svg: '<svg viewBox="0 0 10 10"><path d="M1 1h8v8z" /></svg>',
      revision: 0
    },
    parameters: {
      wallThickness: 1,
      cuttingHeight: 10,
      totalHeight: 10,
      taperAngle: 0,
      targetSize: 100,
      sizeMode: 'longest',
      handleStyle: 'none',
      handleHeight: 0,
      enableHandle: false,
      enableEmbossing: false,
      embossDepth: 0,
      buildPlateSize: 200,
      mode: 'cutter',
      stampDepth: 1,
      stampBase: false
    },
    viewport: {
      showGrid: true,
      showAxes: false,
      showWallThickness: true
    },
    createdAt: overrides.createdAt ?? '2026-01-01T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-02T10:00:00.000Z'
  };
}

class MapProjectRecordBackend implements ProjectRecordBackend {
  readonly records = new Map<string, unknown>();
  closed = false;

  put(record: DesignDocument): Promise<void> {
    this.records.set(record.id, record);
    return Promise.resolve();
  }

  get(id: string): Promise<unknown | undefined> {
    return Promise.resolve(this.records.get(id));
  }

  getAll(): Promise<readonly unknown[]> {
    return Promise.resolve([...this.records.values()]);
  }

  delete(id: string): Promise<void> {
    this.records.delete(id);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

function expectStorageError(
  error: unknown,
  operation: ProjectStorageError['operation'],
  cause?: unknown
): void {
  expect(error).toBeInstanceOf(ProjectStorageError);
  if (!(error instanceof ProjectStorageError)) {
    throw error;
  }
  expect(error.operation).toBe(operation);
  expect(error.message).toContain(operation);
  if (cause !== undefined) {
    expect(error.cause).toBe(cause);
  }
}

describe('createProjectStorage', () => {
  it('valide et copie les documents à la sauvegarde puis à chaque lecture', async () => {
    const backend = new MapProjectRecordBackend();
    const storage = createProjectStorage(backend);
    const input = validDocument();

    const saved = await storage.save(input);
    input.name = 'Mutation après sauvegarde';
    const persisted = backend.records.get('project-1');
    const first = await storage.get('project-1');
    const second = await storage.get('project-1');

    expect(saved.name).toBe('Étoile');
    expect(saved).not.toBe(input);
    expect(persisted).not.toBe(input);
    expect(first).toEqual(saved);
    expect(first).not.toBe(persisted);
    expect(second).not.toBe(first);
    expect(second?.source).not.toBe(first?.source);
  });

  it('écrase le document portant le même identifiant', async () => {
    const backend = new MapProjectRecordBackend();
    const storage = createProjectStorage(backend);

    await storage.save(validDocument());
    await storage.save(
      validDocument({
        name: 'Étoile corrigée',
        updatedAt: '2026-01-03T10:00:00.000Z'
      })
    );

    expect(backend.records.size).toBe(1);
    await expect(storage.get('project-1')).resolves.toMatchObject({
      name: 'Étoile corrigée',
      updatedAt: '2026-01-03T10:00:00.000Z'
    });
  });

  it('retourne des copies triées par updatedAt décroissant', async () => {
    const backend = new MapProjectRecordBackend();
    const storage = createProjectStorage(backend);

    await storage.save(
      validDocument({ id: 'middle', updatedAt: '2026-01-03T10:00:00.000Z' })
    );
    await storage.save(
      validDocument({ id: 'oldest', updatedAt: '2026-01-02T10:00:00.000Z' })
    );
    await storage.save(
      validDocument({ id: 'newest', updatedAt: '2026-01-04T10:00:00.000Z' })
    );

    const first = await storage.list();
    const second = await storage.list();

    expect(first.map(({ id }) => id)).toEqual(['newest', 'middle', 'oldest']);
    expect(first[0]).not.toBe(backend.records.get('newest'));
    expect(second[0]).not.toBe(first[0]);
  });

  it('supprime un projet', async () => {
    const backend = new MapProjectRecordBackend();
    const storage = createProjectStorage(backend);
    await storage.save(validDocument());

    await storage.delete('project-1');

    await expect(storage.get('project-1')).resolves.toBeUndefined();
  });

  it('rejette tous les identifiants vides', async () => {
    const storage = createProjectStorage(new MapProjectRecordBackend());

    await expect(storage.save(validDocument({ id: '   ' }))).rejects.toSatisfy(
      (error: unknown) => {
        expectStorageError(error, 'save');
        return (
          error instanceof ProjectStorageError &&
          error.cause instanceof DesignDocumentValidationError
        );
      }
    );
    await expect(storage.get('\t')).rejects.toSatisfy((error: unknown) => {
      expectStorageError(error, 'get');
      return true;
    });
    await expect(storage.delete('')).rejects.toSatisfy((error: unknown) => {
      expectStorageError(error, 'delete');
      return true;
    });
  });

  it('rejette explicitement un enregistrement corrompu à la lecture et au listing', async () => {
    const backend = new MapProjectRecordBackend();
    const storage = createProjectStorage(backend);
    const corrupted = { id: 'corrupted', name: 'incomplet' };
    backend.records.set('corrupted', corrupted);

    await expect(storage.get('corrupted')).rejects.toSatisfy((error: unknown) => {
      expectStorageError(error, 'get');
      return (
        error instanceof ProjectStorageError &&
        error.cause instanceof DesignDocumentValidationError
      );
    });
    await expect(storage.list()).rejects.toSatisfy((error: unknown) => {
      expectStorageError(error, 'list');
      return (
        error instanceof ProjectStorageError &&
        error.cause instanceof DesignDocumentValidationError
      );
    });
  });

  it('enveloppe les erreurs du backend en conservant leur cause et l’opération', async () => {
    const failure = new Error('backend indisponible');
    const reject = (): Promise<never> => Promise.reject(failure);
    const backend: ProjectRecordBackend = {
      put: reject,
      get: reject,
      getAll: reject,
      delete: reject,
      close: reject
    };
    const storage = createProjectStorage(backend);

    for (const [operation, invoke] of [
      ['save', () => storage.save(validDocument())],
      ['get', () => storage.get('project-1')],
      ['list', () => storage.list()],
      ['delete', () => storage.delete('project-1')],
      ['close', () => storage.close()]
    ] as const) {
      await expect(invoke()).rejects.toSatisfy((error: unknown) => {
        expectStorageError(error, operation, failure);
        return true;
      });
    }
  });

  it('ferme le backend lorsqu’il le permet et accepte un backend sans close', async () => {
    const backend = new MapProjectRecordBackend();
    await createProjectStorage(backend).close();
    expect(backend.closed).toBe(true);

    const withoutClose: ProjectRecordBackend = {
      put: () => Promise.resolve(),
      get: () => Promise.resolve(undefined),
      getAll: () => Promise.resolve([]),
      delete: () => Promise.resolve()
    };
    await expect(createProjectStorage(withoutClose).close()).resolves.toBeUndefined();
  });
});

describe('createIndexedDbProjectStorage', () => {
  it('reste paresseux mais échoue explicitement au premier usage sans IDBFactory', async () => {
    const storage = createIndexedDbProjectStorage({ indexedDB: undefined });

    await expect(storage.list()).rejects.toSatisfy((error: unknown) => {
      expectStorageError(error, 'list');
      return (
        error instanceof ProjectStorageError &&
        error.cause instanceof Error &&
        error.cause.message.includes('IndexedDB')
      );
    });
  });

  it('retente une ouverture après un échec transitoire sans réutiliser son rejet', async () => {
    const firstFailure = new Error('première ouverture impossible');
    const secondFailure = new Error('seconde ouverture impossible');
    let openCalls = 0;
    const indexedDB = {
      open(): IDBOpenDBRequest {
        openCalls += 1;
        throw openCalls === 1 ? firstFailure : secondFailure;
      }
    } as unknown as IDBFactory;
    const storage = createIndexedDbProjectStorage({ indexedDB });

    await expect(storage.list()).rejects.toSatisfy((error: unknown) => {
      expectStorageError(error, 'list', firstFailure);
      return true;
    });
    await expect(storage.list()).rejects.toSatisfy((error: unknown) => {
      expectStorageError(error, 'list', secondFailure);
      return true;
    });
    expect(openCalls).toBe(2);
  });
});
