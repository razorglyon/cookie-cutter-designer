import { writable, type Readable } from 'svelte/store';
import type { DesignDocument } from '../domain/designDocument';
import { parseDesignDocumentV1 } from '../domain/documentValidation';
import type { DesignSessionStore } from '../stores/designSessionStore';
import type { MigrationV0ToV1Options } from '../domain/migrations/v0ToV1';
import { encodeProject } from './projectCodec';
import { readProjectFile, downloadProjectFile } from './projectFiles';
import type { ProjectStorage } from './projectStorage';

export type WorkflowOperation = 'save' | 'open' | 'import' | 'startNew' | 'delete' | 'export' | 'dispose';
export interface WorkflowError {
  readonly operation: WorkflowOperation | 'list';
  readonly message: string;
  readonly cause: unknown;
}
export interface ProjectWorkflowState {
  readonly dirty: boolean;
  /** Epoch of the injected session; unrelated to mesh generation state. */
  readonly sessionEpoch: number;
  /** Latest foreground operation only; not an indicator of outstanding saves. */
  readonly pending: WorkflowOperation | null;
  /** True while any accepted save for this session is queued or running. */
  readonly saving: boolean;
  /** Save failure in completion order; cleared by retry, success or session replacement, never export. */
  readonly saveError: WorkflowError | null;
  /** Latest foreground failure, falling back to saveError (library errors stay separate). */
  readonly error: WorkflowError | null;
  readonly warnings: readonly string[];
  /** Deterministic codec output of the last explicit storage save/open. */
  readonly savedSnapshot: string | null;
  readonly library: {
    readonly documents: readonly DesignDocument[];
    readonly loaded: boolean;
    readonly loading: boolean;
    readonly listError: WorkflowError | null;
  };
  readonly disposed: boolean;
}
export interface ProjectWorkflowOptions {
  readonly session: DesignSessionStore;
  readonly storage: ProjectStorage;
  readonly confirmDiscard?: (document: DesignDocument) => Promise<'save' | 'discard' | 'cancel'>;
  readonly confirmCollision?: (incoming: DesignDocument, existing: DesignDocument) => Promise<'replace' | 'copy' | 'cancel'>;
  /** Capture once per open/import/startNew, before foreground publication.
   * The synchronous predicate must return true through the final replacement.
   * Throws and malformed runtime callbacks fail closed; accepted saves still drain.
   * Omit to retain the session-only transition contract. */
  readonly captureTransitionValidity?: () => () => boolean;
  readonly createId?: () => string;
  readonly assertRepresentable?: (document: DesignDocument) => void;
  readonly migrationOptions?: MigrationV0ToV1Options;
  /** Default delegates to projectFiles; inject for DOM-free environments. */
  readonly download?: (document: DesignDocument) => void | Promise<void>;
}
export interface ProjectWorkflow extends Readable<ProjectWorkflowState> {
  getState(): ProjectWorkflowState;
  save(): Promise<boolean>;
  open(id: string): Promise<boolean>;
  list(): Promise<boolean>;
  delete(id: string, confirmed: boolean): Promise<boolean>;
  import(file: Pick<Blob, 'size' | 'text'>): Promise<boolean>;
  /** null starts an empty session; non-null must already be a V1 document. */
  startNew(document?: unknown): Promise<boolean>;
  export(): Promise<boolean>;
  dispose(): Promise<boolean>;
}

/** Explicit workflow only: no autosave, UI, native dialogs or mesh ownership. */
export function createProjectWorkflow(options: ProjectWorkflowOptions): ProjectWorkflow {
  const { session, storage } = options;
  let epoch = session.getSessionEpoch();
  let disposed = false;
  let transition = 0;
  let foreground = 0;
  let activeSaves = 0;
  let foregroundError: WorkflowError | null = null;
  let listSequence = 0;
  let writes: Promise<unknown> = Promise.resolve();
  const reads = new Set<Promise<unknown>>();
  let disposal: Promise<boolean> | undefined;
  let state: ProjectWorkflowState = {
    dirty: session.getDocument() !== null, sessionEpoch: epoch,
    pending: null, saving: false, saveError: null, error: null, warnings: [], savedSnapshot: null,
    library: { documents: [], loaded: false, loading: false, listError: null }, disposed: false
  };
  const internal = writable(state);
  function publish(patch: Partial<ProjectWorkflowState>): void {
    if ('error' in patch) foregroundError = patch.error ?? null;
    const next = { ...state, ...patch };
    state = Object.freeze({ ...next, error: foregroundError ?? next.saveError });
    internal.set(state);
  }
  function dirty(): boolean {
    const doc = session.getDocument();
    return doc !== null && (state.savedSnapshot === null || encodeProject(doc) !== state.savedSnapshot);
  }
  interface ReplacementPublication {
    readonly epoch: number;
    readonly sequence: number;
    readonly savedSnapshot: string | null;
    readonly warnings: readonly string[];
  }
  // Reserve the incoming baseline before replace/clear can notify observers.
  // Adoption belongs to exactly one resulting epoch, never just a document ID.
  let replacementPublication: ReplacementPublication | undefined;
  function synchronizeSession(): boolean {
    if (disposed) return false;
    const nextEpoch = session.getSessionEpoch();
    if (epoch === nextEpoch) return false;
    const incoming = replacementPublication;
    const owned = incoming?.epoch === nextEpoch && incoming.sequence === transition;
    replacementPublication = undefined;
    epoch = nextEpoch;
    transition += 1; foreground += 1;
    activeSaves = 0;
    const savedSnapshot = owned ? incoming.savedSnapshot : null;
    publish({
      sessionEpoch: epoch, savedSnapshot, error: null, pending: null,
      saving: false, saveError: null, warnings: owned ? incoming.warnings : [],
      dirty: session.getDocument() !== null && (savedSnapshot === null || currentSnapshot() !== savedSnapshot)
    });
    return true;
  }
  const unsubscribe = session.subscribe(() => {
    if (disposed) return;
    if (!synchronizeSession()) publish({ dirty: dirty() });
  });
  function failure(operation: WorkflowError['operation'], cause: unknown): WorkflowError {
    return Object.freeze({ operation, message: cause instanceof Error ? cause.message : String(cause), cause });
  }
  function valid(capturedEpoch: number): boolean {
    return !disposed && capturedEpoch === session.getSessionEpoch();
  }
  function begin(operation: WorkflowOperation): number {
    synchronizeSession();
    const ticket = ++foreground;
    publish({ pending: operation, error: null, ...(operation === 'save' ? { saving: true, saveError: null } : {}) });
    return ticket;
  }
  function finish(ticket: number, capturedEpoch: number, operation: WorkflowOperation, cause?: unknown): void {
    if (valid(capturedEpoch) && ticket === foreground) {
      publish({ pending: null, ...(cause === undefined ? {} : { error: failure(operation, cause) }) });
    }
  }
  function queue<T>(action: () => Promise<T>): Promise<T> {
    const work = writes.then(action);
    writes = work.catch(() => undefined);
    return work;
  }
  async function read<T>(action: () => Promise<T>): Promise<T> {
    const work = action(); reads.add(work);
    try { return await work; } finally { reads.delete(work); }
  }
  function validate(value: unknown): DesignDocument {
    const doc = parseDesignDocumentV1(value);
    options.assertRepresentable?.(doc);
    return doc;
  }
  async function save(): Promise<boolean> {
    if (disposed) return false;
    // An earlier session observer can enter before our subscription is delivered.
    // Adopt that epoch before registering the save, so adoption cannot erase it.
    synchronizeSession();
    if (disposed) return false;
    const capturedEpoch = session.getSessionEpoch();
    activeSaves += 1;
    const ticket = begin('save');
    try {
      const doc = session.getDocument();
      if (doc === null) throw new Error('Aucun document actif à sauvegarder.');
      // Parsing clones the whole persistent graph before entering the write queue.
      const snapshot = parseDesignDocumentV1(doc);
      const encoded = encodeProject(snapshot);
      await queue(() => storage.save(snapshot));
      if (!valid(capturedEpoch)) return false;
      // The queue guarantees completion order. Retain every committed snapshot,
      // even when a later queued write fails. Save status/errors belong to this
      // epoch and completion order, independently of the foreground ticket.
      publish({ savedSnapshot: encoded, saveError: null });
      publish({ dirty: dirty() });
      finish(ticket, capturedEpoch, 'save');
      return true;
    } catch (cause) {
      if (valid(capturedEpoch)) publish({ saveError: failure('save', cause) });
      finish(ticket, capturedEpoch, 'save');
      return false;
    } finally {
      if (valid(capturedEpoch)) {
        activeSaves -= 1;
        publish({ saving: activeSaves > 0 });
      }
    }
  }
  interface TransitionToken { epoch: number; sequence: number; contextValid?: () => boolean }
  function isCurrent(token: TransitionToken): boolean {
    if (!valid(token.epoch) || token.sequence !== transition) return false;
    try {
      if (token.contextValid !== undefined && token.contextValid() !== true) return false;
    } catch { return false; }
    // Injected predicates may synchronously replace/clear or start a newer switch.
    return valid(token.epoch) && token.sequence === transition;
  }
  function currentSnapshot(): string | null {
    const doc = session.getDocument();
    return doc === null ? null : encodeProject(doc);
  }
  async function guard(token: TransitionToken): Promise<{ snapshot: string | null } | null> {
    if (!isCurrent(token)) return null;
    const doc = session.getDocument();
    const snapshot = currentSnapshot();
    if (doc === null || !dirty()) return { snapshot };
    // An unanswered prompt must never silently discard the active work.
    const choice = await options.confirmDiscard?.(doc) ?? 'cancel';
    if (!isCurrent(token) || currentSnapshot() !== snapshot) return null;
    if (choice === 'discard') return { snapshot };
    if (choice !== 'save') return null;
    return await save() && isCurrent(token) && !dirty() ? { snapshot } : null;
  }
  interface IncomingSession {
    document: DesignDocument | null;
    clean: boolean;
    warnings?: readonly string[];
    afterGuard?: () => Promise<{ document: DesignDocument; barrier: Promise<unknown> } | null>;
  }
  async function switchSession(
    operation: 'open' | 'import' | 'startNew',
    prepare: (token: TransitionToken) => Promise<IncomingSession | null>
  ): Promise<boolean> {
    if (disposed) return false;
    synchronizeSession();
    if (disposed) return false;
    const token: TransitionToken = { epoch: session.getSessionEpoch(), sequence: ++transition };
    let ticket: number | undefined;
    try {
      // Reserve before invoking external code; capture before begin observers.
      // Read the optional property inside try too: its getter can throw/re-enter.
      const capture = options.captureTransitionValidity;
      if (capture !== undefined) {
        token.contextValid = capture();
        if (typeof token.contextValid !== 'function') return false;
      }
      if (!isCurrent(token)) return false;
      ticket = begin(operation);
      if (!isCurrent(token)) return false;
      const incoming = await prepare(token);
      if (incoming === null || !isCurrent(token)) return false;
      const permission = await guard(token);
      if (permission === null || !isCurrent(token) || currentSnapshot() !== permission.snapshot) return false;
      ticket = begin(operation);
      while (true) {
        let resolvedBarrier: Promise<unknown> | undefined;
        if (incoming.afterGuard !== undefined) {
          const resolved = await incoming.afterGuard();
          if (resolved === null) return false;
          if (!isCurrent(token) || currentSnapshot() !== permission.snapshot) return false;
          // Check in the caller: resolving the async helper itself yields one
          // last microtask in which another save/delete can enter the queue.
          if (resolved.barrier !== writes) continue;
          incoming.document = resolved.document;
          resolvedBarrier = resolved.barrier;
        }
        if (!isCurrent(token) || currentSnapshot() !== permission.snapshot) return false;
        // A validity callback may itself accept another write.
        if (resolvedBarrier !== undefined && resolvedBarrier !== writes) continue;
        // No await from the final barrier/token/content checks to replacement.
        const publication: ReplacementPublication = {
          epoch: token.epoch + 1, sequence: token.sequence,
          savedSnapshot: incoming.clean && incoming.document !== null ? encodeProject(incoming.document) : null,
          warnings: Object.freeze([...(incoming.warnings ?? [])])
        };
        replacementPublication = publication;
        try {
          if (incoming.document === null) session.clear(); else session.replace(incoming.document);
          // Clearing an already-null Svelte store emits no notification, although
          // the session epoch still advances. Adopt explicitly (idempotently).
          synchronizeSession();
          // The intentional epoch adoption increments transition exactly once.
          // Do not reuse the old external guard: it may depend on the old epoch.
          // Baseline publication already happened at adoption, before callbacks;
          // later saves/foreground tickets must not be cleared by this caller.
          return valid(publication.epoch) && transition === publication.sequence + 1;
        } finally {
          if (replacementPublication === publication) replacementPublication = undefined;
        }
      }
    } catch (cause) {
      if (ticket !== undefined && isCurrent(token)) publish({ error: failure(operation, cause) });
      return false;
    } finally {
      if (ticket !== undefined) finish(ticket, token.epoch, operation);
    }
  }
  return {
    subscribe: internal.subscribe,
    getState: () => state,
    save,
    open: id => switchSession('open', async token => {
      async function load() {
        // Capture the write barrier before each read, never queue the whole switch:
        // the guard may call save(), which must be able to enter and drain the queue.
        while (isCurrent(token)) {
          const barrier = writes;
          await barrier;
          if (!isCurrent(token)) return null;
          const value = await read(() => storage.get(id));
          if (!isCurrent(token)) return null;
          // A write accepted while waiting/reading also belongs before replacement.
          if (barrier !== writes) continue;
          if (value === undefined) throw new Error('Projet introuvable.');
          return { document: validate(value), barrier };
        }
        return null;
      }
      const prepared = await load();
      if (prepared === null) return null;
      return { document: prepared.document, clean: true, afterGuard: async () => {
        // Guard-save (including a save to this same ID) invalidates the preflight
        // document. Return its barrier too: only the caller can check it without
        // another await between that check and session replacement.
        if (!isCurrent(token)) return null;
        if (prepared.barrier === writes) return prepared;
        return load();
      } };
    }),
    startNew: (document: unknown = null) => switchSession('startNew', async () => ({ document: document === null ? null : validate(document), clean: false })),
    import: file => switchSession('import', async token => {
      const decoded = await readProjectFile(file, options.migrationOptions);
      if (!isCurrent(token)) return null;
      const source = validate(decoded.document);
      return { document: source, warnings: decoded.warnings, clean: false, afterGuard: async () => {
        // A write during a read/prompt invalidates the collision decision too.
        // Restart from the source so a stale copy choice is never reused.
        while (isCurrent(token)) {
          const barrier = writes;
          await barrier;
          if (!isCurrent(token)) return null;
          let document = source;
          const existing = await read(() => storage.get(document.id));
          if (!isCurrent(token)) return null;
          if (barrier !== writes) continue;
          if (existing !== undefined) {
            const choice = await options.confirmCollision?.(document, existing) ?? 'cancel';
            if (!isCurrent(token)) return null;
            if (barrier !== writes) continue;
            if (choice === 'copy') {
              if (options.createId === undefined) throw new Error('Un générateur d’identifiant est requis pour copier.');
              const id = options.createId();
              if (id === document.id) throw new Error('La copie doit avoir un nouvel identifiant.');
              // Preserve valid source dates rather than inventing time from a clock.
              document = validate({ ...document, id });
              const copy = await read(() => storage.get(id));
              if (!isCurrent(token)) return null;
              if (barrier !== writes) continue;
              if (copy !== undefined) throw new Error('L’identifiant de copie existe déjà.');
            } else if (choice !== 'replace') return null;
          }
          return { document, barrier };
        }
        return null;
      } };
    }),
    async list(): Promise<boolean> {
      if (disposed) return false;
      const sequence = ++listSequence;
      publish({ library: { ...state.library, loading: true, listError: null } });
      try {
        // Observe all previously queued writes before reading the library.
        await writes;
        if (disposed) return false;
        const documents = await read(() => storage.list());
        if (disposed || sequence !== listSequence) return false;
        publish({ library: { documents: Object.freeze(documents.map(parseDesignDocumentV1)), loaded: true, loading: false, listError: null } });
        return true;
      } catch (cause) {
        if (!disposed && sequence === listSequence) publish({ library: { ...state.library, loading: false, listError: failure('list', cause) } });
        return false;
      }
    },
    async delete(id: string, confirmed: boolean): Promise<boolean> {
      if (disposed || confirmed !== true) return false;
      const capturedEpoch = session.getSessionEpoch();
      const ticket = begin('delete');
      // Invalidate a list captured before this mutation.
      listSequence += 1;
      try {
        await queue(() => storage.delete(id));
        if (disposed) return false;
        publish({ library: { ...state.library, loading: false, documents: Object.freeze(state.library.documents.filter(doc => doc.id !== id)) } });
        if (valid(capturedEpoch) && session.getDocument()?.id === id) {
          publish({ savedSnapshot: null, dirty: true });
        }
        finish(ticket, capturedEpoch, 'delete');
        return true;
      } catch (cause) {
        finish(ticket, capturedEpoch, 'delete', cause);
        if (!disposed) publish({ library: { ...state.library, loading: false } });
        return false;
      }
    },
    async export(): Promise<boolean> {
      if (disposed) return false;
      const capturedEpoch = session.getSessionEpoch();
      const ticket = begin('export');
      try {
        const doc = session.getDocument();
        if (doc === null) throw new Error('Aucun document actif à exporter.');
        await (options.download ?? downloadProjectFile)(parseDesignDocumentV1(doc));
        finish(ticket, capturedEpoch, 'export');
        return valid(capturedEpoch);
      } catch (cause) {
        finish(ticket, capturedEpoch, 'export', cause);
        return false;
      }
    },
    dispose(): Promise<boolean> {
      if (disposal !== undefined) return disposal;
      disposed = true; transition += 1; foreground += 1; listSequence += 1;
      unsubscribe();
      activeSaves = 0;
      publish({ disposed: true, pending: null, saving: false, library: { ...state.library, loading: false } });
      disposal = (async () => {
        // Already queued transactions run to completion; no abort of irreversible writes.
        await writes;
        await Promise.allSettled([...reads]);
        try { await storage.close(); return true; }
        catch (cause) {
          // getState retains cleanup failure without waking disposed UI subscribers.
          state = Object.freeze({ ...state, error: failure('dispose', cause) });
          return false;
        }
      })();
      return disposal;
    }
  };
}
