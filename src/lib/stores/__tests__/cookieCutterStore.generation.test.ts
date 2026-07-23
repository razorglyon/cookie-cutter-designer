import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInitialGenerationState,
  type GenerationState
} from '../../generation/generationState';
import {
  generationState,
  publishGenerationState
} from '../cookieCutterStore';

afterEach(() => {
  publishGenerationState(createInitialGenerationState());
});

describe('cookieCutterStore generationState', () => {
  it('publie chaque transition comme un snapshot unique', () => {
    const snapshots = vi.fn();
    const unsubscribe = generationState.subscribe(snapshots);
    const mutableError = {
      revision: 4,
      message: 'La génération a échoué.'
    };
    const next: GenerationState = {
      phase: 'error',
      revision: 4,
      requestedDocument: null,
      result: null,
      error: mutableError
    };

    publishGenerationState(next);
    const published = get(generationState);
    mutableError.message = 'Mutation après publication';

    expect(published).not.toBe(next);
    expect(published.error?.message).toBe('La génération a échoué.');
    expect(Object.isFrozen(published)).toBe(true);
    expect(Object.isFrozen(published.error)).toBe(true);
    expect(snapshots).toHaveBeenCalledTimes(2);
    expect(snapshots).toHaveBeenLastCalledWith(published);
    unsubscribe();
  });
});
