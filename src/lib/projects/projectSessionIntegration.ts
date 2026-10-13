import { get, type Readable } from 'svelte/store';
import type { DesignDocument, ViewportPreferences } from '../domain/designDocument';
import type { DesignSessionStore } from '../stores/designSessionStore';
import { params, setParams } from '../stores/cookieCutterStore';
import { documentParametersToLegacy, legacyParametersToDocument } from '../stores/legacyDocumentAdapter';
import type { CookieCutterParams } from '../types/CookieCutter';
import type { GenerationOrchestrator } from '../generation/generationOrchestrator';

export interface ProjectSessionIntegrationOptions {
  readonly session: DesignSessionStore;
  /** The owner retains result publication, async error handling and artifact disposal. */
  readonly generation: Pick<GenerationOrchestrator, 'schedule' | 'cancel'>;
  /** Explicit injection for isolated owners; omitted means the existing global ParamsStore. */
  readonly legacy?: {
    readonly params: Readable<Readonly<CookieCutterParams>>;
    readonly setParams: (value: unknown) => void;
  };
  readonly clearHistory: () => void;
  readonly invalidateSource: () => void;
  readonly projectViewport: (viewport: ViewportPreferences | null) => void;
  readonly onParameterError?: (error: unknown | null) => void;
  /**
   * Projection/scheduling failures only; generation result errors remain in the orchestrator.
   * A failed epoch-cleanup step stays pending until the next session notification
   * or explicit reconciliation. Completed steps are not repeated; no automatic retry.
   */
  readonly onIntegrationError?: (error: unknown) => void;
}

export interface ProjectSessionIntegration {
  /** Full legacy snapshot, validated before any session command. No active document => false. */
  acceptLegacyParameterChange(value: unknown): boolean;
  /** Unsubscribes both directions and cancels work; does not dispose the owner's orchestrator. */
  dispose(): void;
}

/** Inject into the project workflow's pre-restore hook; no mutation or normalization. */
export function assertRepresentable(document: DesignDocument): void {
  documentParametersToLegacy(document);
}

function sameFields(left: object, right: object): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key =>
    Object.prototype.hasOwnProperty.call(right, key)
    && Reflect.get(left, key) === Reflect.get(right, key));
}

/**
 * A synchronous boundary, not a second document store. Session owns all persistent
 * data. ParamsStore is only its UI projection/input port, and generation receives
 * the exact frozen session snapshot (especially sketch, not initial source SVG).
 * Subscribe to session separately for name/dirty/source UI; no App dependency here.
 */
export function createProjectSessionIntegration(
  options: ProjectSessionIntegrationOptions
): ProjectSessionIntegration {
  const { session, generation } = options;
  const legacy = options.legacy ?? { params, setParams };
  let disposed = false;
  let projecting = false;
  let accepting = false;
  let epoch: number | undefined;
  let cleanup: { epoch: number; next: number } | undefined;
  const cleanupSteps = [() => generation.cancel(), options.invalidateSource, options.clearHistory];
  let geometryKey: string | undefined;
  let viewportKey: string | undefined;
  let lastDocument: DesignDocument | null | undefined;
  let projectionToken = 0;
  // Reserve the epoch and semantic inputs before any external callback. Nested
  // same-epoch notifications are reconciled only once the callback has settled.
  let projection: { epoch: number; geometry: string; viewport: string } | undefined;
  let parameterErrorKey: string | undefined;
  let projectionFailed = false;

  function parameterError(error: unknown | null): void {
    if (disposed) return;
    if (error !== null) parameterErrorKey = undefined;
    try { options.onParameterError?.(error); } catch { /* Observers cannot poison Svelte's queue. */ }
  }

  function invoke(callback: () => void): boolean {
    if (disposed) return false;
    try { callback(); return !disposed; } catch (error) {
      if (!disposed) {
        try { options.onIntegrationError?.(error); } catch { /* Isolate error observers too. */ }
      }
      return false;
    }
  }

  function projectParameters(document: DesignDocument, current: () => boolean): boolean {
    const projection = documentParametersToLegacy(document);
    const equal = sameFields(get(legacy.params), projection);
    if (!current()) return false;
    if (equal) return true;
    const wasProjecting = projecting;
    projecting = true;
    try { return invoke(() => legacy.setParams(projection)); }
    finally { projecting = wasProjecting; }
  }

  function project(document: DesignDocument | null, reconcile = false): void {
    if (disposed || accepting || document !== session.getDocument()) return;
    const currentEpoch = session.getSessionEpoch();
    if (projection?.epoch === currentEpoch) return;
    if (!reconcile && lastDocument === document && epoch === currentEpoch) return;
    const reservation = {
      epoch: currentEpoch,
      geometry: JSON.stringify([document?.kind, document?.sketch, document?.parameters, document && document.schemaVersion !== 1 ? document.bridges : [], document?.schemaVersion === 3 ? document.layout : null, document?.schemaVersion === 4 ? document.imprintMode : null]),
      viewport: JSON.stringify(document?.viewport ?? null)
    };
    const previous = projection;
    projection = reservation;
    let succeeded = false;
    try { succeeded = projectSnapshot(document, reconcile, reservation); }
    finally {
      if (projection === reservation) projection = previous;
      if (!disposed && currentEpoch === session.getSessionEpoch()) {
        projectionFailed = !succeeded;
        if (succeeded && document !== session.getDocument()) {
          project(session.getDocument(), true);
        } else if (!succeeded) {
          // An error observer may edit/reconcile while the failed effect is still
          // reserved. Absorb those notifications, not the failure: the next new
          // notification or explicit reconciliation retries the uncommitted key.
          lastDocument = session.getDocument();
        }
      }
    }
  }

  function projectSnapshot(
    document: DesignDocument | null,
    reconcile: boolean,
    reservation: { epoch: number; geometry: string; viewport: string }
  ): boolean {
    const currentEpoch = reservation.epoch;
    const token = ++projectionToken;
    const sameEpoch = () => !disposed && currentEpoch === session.getSessionEpoch();
    const current = () => sameEpoch() && token === projectionToken && document === session.getDocument();
    const epochChanged = epoch !== currentEpoch;
    lastDocument = document;
    if (epochChanged) {
      epoch = currentEpoch;
      geometryKey = undefined;
      viewportKey = undefined;
      parameterErrorKey = undefined;
      cleanup = { epoch: currentEpoch, next: 0 };
    }
    const pending = cleanup!;
    while (pending.next < cleanupSteps.length) {
      // The surrounding epoch reservation also protects cleanup callbacks.
      const succeeded = invoke(cleanupSteps[pending.next]);
      if (!succeeded) return false;
      pending.next++;
      if (!current()) return true;
    }
    if (document !== null) {
      try {
        if (!projectParameters(document, current)) return false;
        if (!current()) return true;
        const nextParameterErrorKey = JSON.stringify([document.kind, document.parameters, document.schemaVersion === 4 ? document.imprintMode : null]);
        if (!reconcile && parameterErrorKey !== nextParameterErrorKey) {
          parameterError(null);
          if (sameEpoch()) parameterErrorKey = nextParameterErrorKey;
        }
        if (!current()) return true;
      } catch (error) {
        if (!current()) return false;
        parameterError(error);
        if (current()) {
          // Invalidate before cancel: its callback may install and schedule a new epoch.
          geometryKey = undefined;
          invoke(() => generation.cancel());
        }
        return false;
      }
    }
    if (viewportKey !== reservation.viewport) {
      // A callback may apply its side effect before failing; the previous key is no longer proven.
      viewportKey = undefined;
      if (!invoke(() => options.projectViewport(document?.viewport ?? null))) return false;
      // Snapshot identity can change for metadata only. Success belongs to this
      // semantic input and epoch, never to a re-entrantly installed session.
      if (sameEpoch()) viewportKey = reservation.viewport;
      if (!current()) return true;
    }
    if (document === null) return true;
    if (geometryKey !== reservation.geometry) {
      // Scheduling may cancel the previous work before throwing. Reserve before re-entry.
      geometryKey = undefined;
      if (!invoke(() => generation.schedule(document))) return false;
      if (sameEpoch()) geometryKey = reservation.geometry;
    }
    return true;
  }

  function acceptLegacyParameterChange(value: unknown): boolean {
    if (disposed || projecting || accepting) return false;
    const document = session.getDocument();
    if (document === null) return false;
    // Capture before parsing unknown: getters/proxies are re-entry boundaries too.
    const acceptedEpoch = session.getSessionEpoch();
    const currentSession = () => !disposed && acceptedEpoch === session.getSessionEpoch();
    let succeeded = false;
    let failure: unknown;
    accepting = true;
    try {
      const candidate = legacyParametersToDocument(value);
      if (!currentSession() || document !== session.getDocument()) {
        throw new Error('La session a changé pendant la validation des paramètres.');
      }
      // Equality also ignores queued restoration notifications without clearing
      // the useful error from the rejected UI edit that caused that restoration.
      const sameKind = candidate.kind === document.kind || (document.kind === 'multi-cutter' && candidate.kind === 'cutter');
      if (sameKind && sameFields(candidate.parameters, document.parameters)) return true;
      if (document.kind === 'multi-cutter' && candidate.kind === 'cutter') {
        // The Cutter UI edits the series source, never demotes the arrangement.
        session.updateParameters('multi-cutter', candidate.parameters);
      } else {
        if (candidate.kind !== document.kind) session.changeKind(candidate.kind);
        if (!currentSession()) {
          throw new Error('La session a changé pendant la modification des paramètres.');
        }
        if (candidate.kind === 'cutter') session.updateParameters('cutter', candidate.parameters);
        else session.updateParameters('stamp', candidate.parameters);
      }
      if (!currentSession()) {
        throw new Error('La session a changé pendant la modification des paramètres.');
      }
      succeeded = true;
    } catch (error) {
      failure = error;
    } finally {
      accepting = false;
      // Suppressed notifications must be reconciled on every exit, including a
      // partially successful kind change or an unchanged snapshot after failure.
      project(session.getDocument(), true);
    }
    // Report after reconciliation so a failed command's useful error survives.
    parameterError(succeeded ? null : failure);
    return succeeded;
  }

  // Session first: mounting with a saved document must overwrite stale legacy UI,
  // never import the UI's defaults over the just-restored project.
  const unsubscribeSession = session.subscribe(project);
  const unsubscribeLegacy = legacy.params.subscribe(value => {
    // Svelte queues nested set notifications. Ignore obsolete snapshots, including
    // the intermediate default snapshot from changeKind before updateParameters.
    if (projectionFailed || projection?.epoch === session.getSessionEpoch()
      || value !== get(legacy.params) || lastDocument !== session.getDocument()
      || epoch !== session.getSessionEpoch() || cleanup?.next !== cleanupSteps.length) return;
    acceptLegacyParameterChange(value);
  });

  return {
    acceptLegacyParameterChange,
    dispose(): void {
      if (disposed) return;
      unsubscribeSession();
      unsubscribeLegacy();
      // Cancel while callbacks are still guarded, then prevent all future effects.
      disposed = true;
      try { generation.cancel(); } catch { /* No callbacks after disposal. */ }
    }
  };
}
