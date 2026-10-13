import { get, writable, type Readable } from 'svelte/store';
import type { DesignDocument } from '../domain/designDocument';
import { parseDesignDocument } from '../domain/documentValidation';
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
  /** Restaure un snapshot exact dans la même époque, sans commande d'édition. */
  restoreHistory(value: unknown, expectedEpoch: number): void;
  rename: DesignDocumentStore['rename'];
  updateSketch: DesignDocumentStore['updateSketch'];
  updateBridges: DesignDocumentStore['updateBridges'];
  updateSeries: DesignDocumentStore['updateSeries'];
  updateStampImprintMode: DesignDocumentStore['updateStampImprintMode'];
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

    restoreHistory(value: unknown, expectedEpoch: number): void {
      const owner = active;
      const current = get(internal);
      if (owner === null || current === null || epoch !== expectedEpoch) {
        throw new Error('Historique obsolète : la session a changé.');
      }
      // unknown may run getters/Proxy traps. Detach and validate everything before
      // touching the active store, then re-check both lifetime and snapshot identity.
      const snapshot = parseDesignDocument(value);
      if (epoch !== expectedEpoch || active !== owner || get(internal) !== current) {
        throw new Error('La session a changé pendant la validation de l’historique.');
      }
      if (snapshot.id !== current.id || snapshot.createdAt !== current.createdAt
        || JSON.stringify(snapshot.source) !== JSON.stringify(current.source)) {
        throw new Error('Le snapshot historique appartient à un autre document ou source.');
      }
      // The validated snapshot has no user getters. replace preserves updatedAt
      // and sketch revision; subsequent edits use this very same active document.
      owner.replace(snapshot);
      internal.set(get(owner));
    },

    rename: name => mutate(store => store.rename(name)),
    updateSketch: svg => mutate(store => store.updateSketch(svg)),
    updateBridges: bridges => mutate(store => store.updateBridges(bridges)),
    updateSeries: layout => mutate(store => store.updateSeries(layout)),
    updateStampImprintMode: mode => mutate(store => store.updateStampImprintMode(mode)),
    updateViewport: patch => mutate(store => store.updateViewport(patch)),
    updateParameters: (kind, patch) => mutate(store => store.updateParameters(kind, patch)),
    changeKind: kind => mutate(store => store.changeKind(kind))
  };
}
