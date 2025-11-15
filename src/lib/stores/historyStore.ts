import { writable, derived, get } from 'svelte/store';
import type { CookieCutterParams } from '../types/CookieCutter';

export interface HistoryState {
  params: CookieCutterParams;
  svgData: string | null;
  timestamp: number;
  description: string;
}

const MAX_HISTORY_SIZE = 50;

function createHistoryStore() {
  const history = writable<HistoryState[]>([]);
  const currentIndex = writable<number>(-1);

  return {
    subscribe: history.subscribe,
    currentIndex: { subscribe: currentIndex.subscribe },

    /**
     * Add a new state to history
     */
    pushState: (state: Omit<HistoryState, 'timestamp'>) => {
      const currentIdx = get(currentIndex);
      const historyList = get(history);

      // Remove any states after current index (when undoing then making new changes)
      const newHistory = historyList.slice(0, currentIdx + 1);

      // Add new state
      newHistory.push({
        ...state,
        timestamp: Date.now()
      });

      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
      } else {
        currentIndex.update(idx => idx + 1);
      }

      history.set(newHistory);
    },

    /**
     * Undo: go back one step
     */
    undo: (): HistoryState | null => {
      const currentIdx = get(currentIndex);

      if (currentIdx > 0) {
        currentIndex.update(idx => idx - 1);
        const historyList = get(history);
        return historyList[currentIdx - 1];
      }

      return null;
    },

    /**
     * Redo: go forward one step
     */
    redo: (): HistoryState | null => {
      const currentIdx = get(currentIndex);
      const historyList = get(history);

      if (currentIdx < historyList.length - 1) {
        currentIndex.update(idx => idx + 1);
        return historyList[currentIdx + 1];
      }

      return null;
    },

    /**
     * Get current state
     */
    getCurrentState: (): HistoryState | null => {
      const currentIdx = get(currentIndex);
      const historyList = get(history);

      if (currentIdx >= 0 && currentIdx < historyList.length) {
        return historyList[currentIdx];
      }

      return null;
    },

    /**
     * Clear all history
     */
    clear: () => {
      history.set([]);
      currentIndex.set(-1);
    },

    /**
     * Get history length
     */
    getLength: (): number => {
      return get(history).length;
    },

    /**
     * Check if can undo
     */
    canUndo: (): boolean => {
      return get(currentIndex) > 0;
    },

    /**
     * Check if can redo
     */
    canRedo: (): boolean => {
      const currentIdx = get(currentIndex);
      const historyList = get(history);
      return currentIdx < historyList.length - 1;
    }
  };
}

export const historyStore = createHistoryStore();

// Derived stores for UI
export const canUndo = derived(
  historyStore.currentIndex,
  ($currentIndex) => $currentIndex > 0
);

export const canRedo = derived(
  [historyStore, historyStore.currentIndex],
  ([$history, $currentIndex]) => $currentIndex < $history.length - 1
);
