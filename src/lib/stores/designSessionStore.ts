import { get, writable, type Readable } from 'svelte/store';
import type { DesignDocument } from '../domain/designDocument';
import {
  createDesignDocumentStore,
  type DesignDocumentStore,
  type DesignDocumentStoreOptions
} from './designDocumentStore';

export interface DesignSessionStore extends Readable<DesignDocument | null> {
  getDocument(): DesignDocument | null;
  /** Valide avant remplacement ; null n'est pas un document, utiliser clear(). */
  replace(value: unknown): void;
  clear(): void;
  rename: DesignDocumentStore['rename'];
  updateSketch: DesignDocumentStore['updateSketch'];
  updateViewport: DesignDocumentStore['updateViewport'];
  updateParameters: DesignDocumentStore['updateParameters'];
  changeKind: DesignDocumentStore['changeKind'];
  /** Jeton à capturer puis comparer avant une publication asynchrone. */
  readonly sessionEpoch: number;
  getSessionEpoch(): number;
}

/**
 * Session nullable ; toutes les mutations et snapshots gelés appartiennent au
 * store document. Les commandes d'édition sans document actif lèvent une erreur.
 * Epoch initial = 0, incrémenté avant publication pour chaque replace/clear
 * (même ID ou session déjà vide), jamais pour une édition.
 */
export function createDesignSessionStore(
  initialDocument: unknown = null,
  options: DesignDocumentStoreOptions = {}
): DesignSessionStore {
  let active = initialDocument === null
    ? null
    : createDesignDocumentStore(initialDocument, options);
  const internal = writable<DesignDocument | null>(active === null ? null : get(active));
  let epoch = 0;

  function mutate(command: (store: DesignDocumentStore) => void): void {
    if (active === null) {
      throw new Error('Aucun document actif dans la session.');
    }
    command(active);
    const snapshot = get(active);
    // Un changeKind identique ne constitue pas une mutation.
    if (snapshot !== get(internal)) internal.set(snapshot);
  }

  return {
    subscribe: internal.subscribe,
    getDocument: () => get(internal),
    get sessionEpoch() { return epoch; },
    getSessionEpoch: () => epoch,

    replace(value: unknown): void {
      // Toute validation doit réussir avant de toucher à l'état ou au jeton.
      const replacement = createDesignDocumentStore(value, options);
      const snapshot = get(replacement);
      active = replacement;
      epoch += 1;
      internal.set(snapshot);
    },

    clear(): void {
      active = null;
      epoch += 1;
      internal.set(null);
    },

    rename: name => mutate(store => store.rename(name)),
    updateSketch: svg => mutate(store => store.updateSketch(svg)),
    updateViewport: patch => mutate(store => store.updateViewport(patch)),
    updateParameters: (kind, patch) => mutate(store => store.updateParameters(kind, patch)),
    changeKind: kind => mutate(store => store.changeKind(kind))
  };
}
