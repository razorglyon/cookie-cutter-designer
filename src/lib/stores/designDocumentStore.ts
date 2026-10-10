import { get, writable, type Readable } from 'svelte/store';
import type {
  DesignDocument,
  ViewportPreferences
} from '../domain/designDocument';
import type { ImplementedDesignKind } from '../domain/designKind';
import {
  createDefaultCutterParameters,
  createDefaultStampParameters,
  type DesignParametersByKind
} from '../domain/designParameters';
import { parseDesignDocumentV1 } from '../domain/documentValidation';

export interface DesignDocumentStoreOptions {
  readonly now?: () => string;
}

export interface DesignDocumentStore extends Readable<DesignDocument> {
  /** Remplace le document uniquement après validation complète depuis unknown. */
  replace(value: unknown): void;
  rename(name: string): void;
  updateSketch(svg: string): void;
  updateViewport(patch: Partial<ViewportPreferences>): void;
  updateParameters<K extends ImplementedDesignKind>(
    kind: K,
    patch: Partial<DesignParametersByKind[K]>
  ): void;
  changeKind(kind: ImplementedDesignKind): void;
}

function freezePersistentSnapshot(document: DesignDocument): DesignDocument {
  Object.freeze(document.source);
  Object.freeze(document.sketch);
  Object.freeze(document.parameters);
  Object.freeze(document.viewport);
  return Object.freeze(document);
}

function createSnapshot(value: unknown): DesignDocument {
  return freezePersistentSnapshot(parseDesignDocumentV1(value));
}

function createDefaultParameters(kind: ImplementedDesignKind) {
  return kind === 'cutter'
    ? createDefaultCutterParameters()
    : createDefaultStampParameters();
}

export function createDesignDocumentStore(
  initialDocument: unknown,
  options: DesignDocumentStoreOptions = {}
): DesignDocumentStore {
  const now = options.now ?? (() => new Date().toISOString());
  const internal = writable<DesignDocument>(createSnapshot(initialDocument));

  function mutationTimestamp(current: DesignDocument): string {
    const timestamp = now();
    const nextEpoch = Date.parse(timestamp);
    const currentEpoch = Date.parse(current.updatedAt);

    if (!Number.isFinite(nextEpoch) || nextEpoch < currentEpoch) {
      throw new RangeError(
        'Le nouvel horodatage updatedAt doit être valide et postérieur ou égal au snapshot courant.'
      );
    }

    return timestamp;
  }

  function publishMutation(
    current: DesignDocument,
    candidate: Record<string, unknown>
  ): void {
    const snapshot = createSnapshot({
      ...candidate,
      updatedAt: mutationTimestamp(current)
    });
    internal.set(snapshot);
  }

  return {
    subscribe: internal.subscribe,

    replace(value: unknown): void {
      internal.set(createSnapshot(value));
    },

    rename(name: string): void {
      const current = get(internal);
      publishMutation(current, { ...current, name });
    },

    updateSketch(svg: string): void {
      const current = get(internal);
      publishMutation(current, {
        ...current,
        sketch: {
          svg,
          revision: current.sketch.revision + 1
        }
      });
    },

    updateViewport(patch: Partial<ViewportPreferences>): void {
      const current = get(internal);
      publishMutation(current, {
        ...current,
        viewport: { ...current.viewport, ...patch }
      });
    },

    updateParameters<K extends ImplementedDesignKind>(
      kind: K,
      patch: Partial<DesignParametersByKind[K]>
    ): void {
      const current = get(internal);
      if (current.kind !== kind) {
        throw new TypeError(
          `Le document courant est ${current.kind}, mais le patch cible ${kind}.`
        );
      }

      publishMutation(current, {
        ...current,
        parameters: { ...current.parameters, ...patch }
      });
    },

    changeKind(kind: ImplementedDesignKind): void {
      const current = get(internal);
      if (current.kind === kind) return;

      publishMutation(current, {
        ...current,
        kind,
        parameters: createDefaultParameters(kind)
      });
    }
  };
}
