import type { Readable, Subscriber, Unsubscriber } from 'svelte/store';
import type { DesignDocument } from '../domain/designDocument';
import { parseDesignDocumentV1 } from '../domain/documentValidation';
import { parseProjectRecoveryEnvelope, type ProjectRecoveryEnvelope, type ProjectRecoveryStorage } from './projectRecoveryStorage';

export interface ProjectRecoveryError {
  readonly operation: 'observe' | 'save' | 'list';
  readonly message: string;
  readonly cause: unknown;
}
export interface ProjectRecoveryState {
  readonly sessionEpoch: number | null;
  readonly draftId: string | null;
  /** Accepted snapshot waiting for the debounce, not an unobserved last gesture. */
  readonly pending: boolean;
  /** Accepted queued/running writes for the current epoch only. */
  readonly saving: boolean;
  /** Timestamp of the last committed snapshot, never an optimistic confirmation. */
  readonly savedAt: string | null;
  readonly error: ProjectRecoveryError | null;
  readonly drafts: readonly ProjectRecoveryEnvelope[];
  readonly loaded: boolean;
  readonly loading: boolean;
  readonly listError: ProjectRecoveryError | null;
  readonly disposed: boolean;
}
export interface ProjectRecoveryDependencies {
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly debounceMs?: number;
  /** Schedulers must return a cancellation handle; synchronous callbacks are supported. */
  readonly schedule?: (callback: () => void, delayMs: number) => unknown;
  readonly cancel?: (handle: unknown) => void;
}
export interface ProjectRecovery extends Readable<ProjectRecoveryState> {
  getState(): ProjectRecoveryState;
  /** Contains validation/callback errors; never changes the canonical document/session. */
  observe(document: DesignDocument | null, epoch: number, dirty: boolean, available?: boolean): void;
  /** Drains accepted work at call time, including prior epochs, and explicitly retries failed snapshots. */
  flush(): Promise<boolean>;
  list(): Promise<boolean>;
  refresh(): Promise<boolean>;
  /** Terminal, idempotent, cancels debounce and drains all accepted writes. Does not own/close shared storage. */
  dispose(): Promise<boolean>;
}
interface Slot {
  readonly epoch: number;
  readonly id: string;
  latest: number;
  pending: ProjectRecoveryEnvelope | null;
  failed: ProjectRecoveryEnvelope | null;
  active: number;
  savedAt: string | null;
  error: ProjectRecoveryError | null;
}
interface Timer { handle?: unknown; fired: boolean; }
function failure(operation: ProjectRecoveryError['operation'], cause: unknown): ProjectRecoveryError {
  let message = 'Recovery operation failed';
  try {
    const detail = cause instanceof Error ? cause.message : undefined;
    if (typeof detail === 'string') message = detail;
  }
  catch { /* Hostile diagnostics must not escape the observe/Promise contract. */ }
  return Object.freeze({ operation, message, cause });
}
/** V1 safe policy: explicit project save/clean/null/unavailable never delete recovery records.
 * Every instance+epoch gets a new random slot on its first accepted dirty snapshot.
 * savedAt is captured with that immutable snapshot and exposed only after DB commit.
 */
export function createProjectRecovery(storage: ProjectRecoveryStorage, deps: ProjectRecoveryDependencies = {}): ProjectRecovery {
  const delay = deps.debounceMs ?? 750;
  if (!Number.isFinite(delay) || delay < 0) throw new Error('Invalid recovery debounce');
  const now = deps.now ?? (() => new Date());
  const createId = deps.createId ?? (() => globalThis.crypto.randomUUID());
  const schedule = deps.schedule ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const cancel = deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let closing = false, operation = 0, epoch: number | null = null, listSequence = 0;
  let timer: Timer | null = null, disposal: Promise<boolean> | undefined;
  let writes: Promise<void> = Promise.resolve();
  const running = new Set<Promise<boolean>>(), slots = new Map<number, Slot>();
  const observers = new Set<Subscriber<ProjectRecoveryState>>();
  let state: ProjectRecoveryState = Object.freeze({
    sessionEpoch: null, draftId: null, pending: false, saving: false, savedAt: null, error: null,
    drafts: Object.freeze([]), loaded: false, loading: false, listError: null, disposed: false
  });
  function publish(patch: Partial<ProjectRecoveryState>): void {
    if (closing) return;
    const next = Object.freeze({ ...state, ...patch }); state = next;
    for (const observer of [...observers]) {
      if (closing || state !== next) break;
      if (!observers.has(observer)) continue;
      try { observer(next); } catch { /* Subscriber failure cannot break accepted-write ownership. */ }
    }
  }
  function current(): Slot | undefined { return epoch === null ? undefined : slots.get(epoch); }
  function status(patch: Partial<ProjectRecoveryState> = {}): void {
    const slot = current();
    publish({ sessionEpoch: epoch, draftId: slot?.id ?? null, pending: !!slot?.pending,
      saving: (slot?.active ?? 0) > 0, savedAt: slot?.savedAt ?? null, error: slot?.error ?? null, ...patch });
  }
  function cancelTimer(): void {
    const owned = timer; timer = null;
    if (owned && !owned.fired) {
      const token = operation;
      try { cancel(owned.handle); } catch (cause) {
        const error = failure('observe', cause);
        if (token === operation) publish({ error });
      }
    }
  }
  function enqueue(slot: Slot, snapshot: ProjectRecoveryEnvelope): void {
    // Reserve ownership and the global queue before synchronous state subscribers can re-enter.
    slot.active += 1;
    const revision = slot.latest;
    const work = writes.then(async () => {
      try {
        await storage.save(snapshot);
        slot.savedAt = snapshot.savedAt;
        if (slot.latest === revision) { slot.failed = null; slot.error = null; }
        return true;
      } catch (cause) {
        // Do not resurrect a failed old snapshot over a newer accepted/queued snapshot.
        const error = failure('save', cause);
        if (slot.latest === revision) { slot.failed = snapshot; slot.error = error; }
        return false;
      } finally {
        slot.active -= 1;
        if (epoch === slot.epoch) status();
      }
    });
    running.add(work);
    writes = work.then(() => undefined, () => undefined);
    void work.then(() => running.delete(work), () => running.delete(work));
  }
  function acceptPending(slot: Slot, retry: boolean): void {
    const snapshot = slot.pending ?? (retry && slot.active === 0 ? slot.failed : null);
    if (!snapshot) return;
    slot.pending = null; slot.failed = null; slot.error = null;
    enqueue(slot, snapshot);
  }
  function startTimer(token: number): void {
    if (closing || token !== operation) return;
    const owned: Timer = { fired: false }; timer = owned;
    try {
      owned.handle = schedule(() => {
        owned.fired = true;
        if (closing || token !== operation || timer !== owned) return;
        timer = null;
        const slot = current(); if (slot) acceptPending(slot, false);
        status();
      }, delay);
      if ((closing || token !== operation || timer !== owned) && !owned.fired) cancel(owned.handle);
    } catch (cause) {
      if (timer === owned) timer = null;
      const error = failure('observe', cause);
      if (!closing && token === operation) publish({ error });
    }
  }
  function observe(document: DesignDocument | null, nextEpoch: number, dirty: boolean, available = true): void {
    if (closing) return;
    const token = ++operation;
    // Detach timer before cancellation callback. Every applicability change invalidates it.
    cancelTimer(); if (closing || token !== operation) return;
    if (epoch !== nextEpoch) {
      const old = current(); if (old) acceptPending(old, false);
      epoch = nextEpoch;
    }
    if (document === null || !dirty || !available) {
      status(); if (current()?.pending) startTimer(token); return;
    }
    try {
      if (!Number.isSafeInteger(nextEpoch) || nextEpoch < 0) throw new Error('Invalid session epoch');
      // Treat getters, UUID factory and clock as reentrant boundaries; no state adoption before validation.
      const detached = parseDesignDocumentV1(document);
      if (closing || token !== operation) return;
      const existing = slots.get(nextEpoch);
      const id = existing?.id ?? createId();
      if (closing || token !== operation) return;
      const timestamp = now().toISOString();
      const snapshot = parseProjectRecoveryEnvelope({ format: 'cookie-cutter-designer-recovery', version: 1, draftId: id, savedAt: timestamp, document: detached });
      if (closing || token !== operation) return;
      const slot: Slot = existing ?? { epoch: nextEpoch, id, latest: 0, pending: null, failed: null, active: 0, savedAt: null, error: null };
      slots.set(nextEpoch, slot);
      slot.latest += 1; slot.pending = snapshot; slot.failed = null; slot.error = null;
      status(); startTimer(token);
    } catch (cause) {
      const error = failure('observe', cause);
      if (!closing && token === operation) status({ error });
    }
  }
  function drain(retry: boolean): Promise<boolean> {
    // Snapshot existing work before enqueue to avoid forgetting an in-flight failure.
    const work = new Set(running);
    for (const slot of slots.values()) acceptPending(slot, retry);
    for (const task of running) work.add(task);
    status();
    return Promise.all(work).then((results) => results.every(Boolean));
  }
  function flush(): Promise<boolean> {
    if (closing) return disposal ?? Promise.resolve(false);
    ++operation; cancelTimer();
    return drain(true);
  }
  async function list(): Promise<boolean> {
    if (closing) return false;
    const token = ++listSequence;
    publish({ loading: true, listError: null });
    if (closing || token !== listSequence) return false;
    try {
      const drafts = (await storage.list()).map(parseProjectRecoveryEnvelope);
      if (closing || token !== listSequence) return false;
      publish({ drafts: Object.freeze(drafts), loaded: true, loading: false, listError: null });
      return true;
    } catch (cause) {
      const error = failure('list', cause);
      if (!closing && token === listSequence) publish({ loading: false, listError: error });
      return false;
    }
  }
  function dispose(): Promise<boolean> {
    if (disposal) return disposal;
    closing = true; ++operation; ++listSequence;
    // Install the terminal barrier before invoking cancellation code.
    disposal = Promise.resolve().then(() => drain(true));
    cancelTimer();
    state = Object.freeze({ ...state, pending: false, saving: false, loading: false, disposed: true });
    observers.clear();
    return disposal;
  }
  return {
    getState: () => state,
    subscribe(observer): Unsubscriber {
      observers.add(observer);
      try { observer(state); } catch { /* Initial subscriber notification is isolated too. */ }
      return () => { observers.delete(observer); };
    },
    observe, flush, list, refresh: list, dispose
  };
}
