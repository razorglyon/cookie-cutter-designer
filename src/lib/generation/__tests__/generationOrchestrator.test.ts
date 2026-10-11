import * as THREE from 'three';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { DesignDocument, DesignDocumentV1 } from '../../domain/designDocument';
import type { GeneratedArtifact } from '../../domain/generatedArtifact';
import type { ImplementedDesignKind } from '../../domain/designKind';
import {
  createDefaultCutterParameters,
  createDefaultStampParameters
} from '../../domain/designParameters';
import type { GeometryValidationReport } from '../../utils/geometryValidation';
import type { GenerationRecipe } from '../generationRecipe';
import { RecipeRegistry } from '../recipeRegistry';
import {
  createGenerationOrchestrator,
  GenerationOrchestratorError,
  type GenerationScheduler
} from '../generationOrchestrator';
import type {
  GenerationResult,
  GenerationState,
  ImplementedDesignDocument,
  ImplementedGeneratedArtifact
} from '../generationState';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: Deferred<T>['resolve'] = () => {
    throw new Error('La promesse différée n’est pas initialisée.');
  };
  let rejectPromise: Deferred<T>['reject'] = () => {
    throw new Error('La promesse différée n’est pas initialisée.');
  };
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

interface FakeTask {
  readonly callback: () => void;
  cancelled: boolean;
}

class FakeScheduler {
  readonly delays: number[] = [];
  private readonly tasks: FakeTask[] = [];

  readonly schedule: GenerationScheduler = (callback, delayMs) => {
    const task: FakeTask = { callback, cancelled: false };
    this.tasks.push(task);
    this.delays.push(delayMs);
    return Object.freeze({
      cancel: () => {
        task.cancelled = true;
      }
    });
  };

  get pendingCount(): number {
    return this.tasks.filter((task) => !task.cancelled).length;
  }

  runPending(): void {
    const pending = this.tasks.splice(0);
    for (const task of pending) {
      if (!task.cancelled) task.callback();
    }
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function cutterDocument(id: string): DesignDocumentV1<'cutter'> {
  const svg = '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>';
  return {
    schemaVersion: 1,
    id,
    name: `Cutter ${id}`,
    kind: 'cutter',
    source: { type: 'svg', fileName: `${id}.svg`, svg },
    sketch: { svg, revision: 1 },
    parameters: createDefaultCutterParameters(),
    viewport: { showGrid: true, showAxes: false, showWallThickness: false },
    createdAt: '2026-07-23T10:00:00.000Z',
    updatedAt: '2026-07-23T10:01:00.000Z'
  };
}

function stampDocument(id: string): DesignDocumentV1<'stamp'> {
  const svg = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>';
  return {
    schemaVersion: 1,
    id,
    name: `Stamp ${id}`,
    kind: 'stamp',
    source: { type: 'svg', fileName: `${id}.svg`, svg },
    sketch: { svg, revision: 2 },
    parameters: createDefaultStampParameters(),
    viewport: { showGrid: false, showAxes: true, showWallThickness: false },
    createdAt: '2026-07-23T10:00:00.000Z',
    updatedAt: '2026-07-23T10:02:00.000Z'
  };
}

const validation: GeometryValidationReport = Object.freeze({
  valid: true,
  errors: Object.freeze([]),
  warnings: Object.freeze([]),
  triangles: 1,
  shells: 1,
  meshes: 1,
  volume: 1,
  bounds: null
});

function artifact<K extends ImplementedDesignKind>(
  kind: K,
  id: string,
  object = new THREE.Group(),
  report: GeometryValidationReport = validation
): GeneratedArtifact<K> {
  const role = (kind === 'cutter' ? 'cutter' : 'stamp') as GeneratedArtifact<K>['role'];
  return {
    id,
    role,
    object,
    dimensionsMm: { width: 1, depth: 1, height: 1 },
    validation: report
  };
}

function cutterRecipe(
  generate: GenerationRecipe<'cutter'>['generate']
): GenerationRecipe<'cutter'> {
  return {
    kind: 'cutter',
    createDefaultParameters: createDefaultCutterParameters,
    validateParameters: (value) => ({
      valid: true,
      parameters: value as ReturnType<typeof createDefaultCutterParameters>
    }),
    generate
  };
}

function stampRecipe(
  generate: GenerationRecipe<'stamp'>['generate']
): GenerationRecipe<'stamp'> {
  return {
    kind: 'stamp',
    createDefaultParameters: createDefaultStampParameters,
    validateParameters: (value) => ({
      valid: true,
      parameters: value as ReturnType<typeof createDefaultStampParameters>
    }),
    generate
  };
}

function registerCutter(
  registry: RecipeRegistry,
  generate: GenerationRecipe<'cutter'>['generate']
): void {
  registry.register('cutter', async () => cutterRecipe(generate));
}

function registerStamp(
  registry: RecipeRegistry,
  generate: GenerationRecipe<'stamp'>['generate']
): void {
  registry.register('stamp', async () => stampRecipe(generate));
}

describe('GenerationState', () => {
  it('expose des unions document/artefact/résultat corrélées aux seuls kinds implémentés', () => {
    expectTypeOf<ImplementedDesignDocument>().toEqualTypeOf<
      DesignDocument<'cutter'> | DesignDocument<'stamp'>
    >();
    expectTypeOf<ImplementedGeneratedArtifact>().toEqualTypeOf<
      GeneratedArtifact<'cutter'> | GeneratedArtifact<'stamp'>
    >();
    expectTypeOf<GenerationResult['artifacts'][number]>().toEqualTypeOf<
      ImplementedGeneratedArtifact
    >();
  });
});

describe('GenerationOrchestrator', () => {
  it('debounce les demandes, annule le timer précédent et ne génère que la dernière révision', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const generate = vi.fn<GenerationRecipe<'cutter'>['generate']>(async (document, context) => [
      artifact('cutter', `${document.id}:${context.revision}`)
    ]);
    registerCutter(registry, generate);
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule
    });

    orchestrator.schedule(cutterDocument('premier'));
    expect(orchestrator.getState()).toMatchObject({ phase: 'scheduled', revision: 1 });
    orchestrator.schedule(cutterDocument('dernier'));

    expect(orchestrator.getState()).toMatchObject({
      phase: 'scheduled',
      revision: 2,
      requestedDocument: { id: 'dernier' }
    });
    expect(scheduler.delays).toEqual([300, 300]);
    expect(scheduler.pendingCount).toBe(1);

    scheduler.runPending();
    await flushMicrotasks();

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0].id).toBe('dernier');
    expect(generate.mock.calls[0]?.[1].revision).toBe(2);
    expect(orchestrator.getState()).toMatchObject({
      phase: 'ready',
      revision: 2,
      result: { revision: 2, document: { id: 'dernier' } }
    });
  });

  it('dispose une réponse obsolète même si la recette ignore AbortSignal et publie la plus récente', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const first = deferred<readonly GeneratedArtifact<'cutter'>[]>();
    const second = deferred<readonly GeneratedArtifact<'cutter'>[]>();
    const staleObject = new THREE.Group();
    const latestObject = new THREE.Group();
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => void>();
    registerCutter(registry, (document) =>
      document.id === 'ancien' ? first.promise : second.promise
    );
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D
    });

    orchestrator.schedule(cutterDocument('ancien'));
    scheduler.runPending();
    await flushMicrotasks();
    orchestrator.schedule(cutterDocument('récent'));
    scheduler.runPending();
    await flushMicrotasks();

    second.resolve([artifact('cutter', 'latest', latestObject)]);
    await flushMicrotasks();
    expect(orchestrator.getState().result?.document.id).toBe('récent');

    first.resolve([artifact('cutter', 'stale', staleObject)]);
    await flushMicrotasks();

    expect(disposeObject3D).toHaveBeenCalledTimes(1);
    expect(disposeObject3D).toHaveBeenCalledWith(staleObject);
    expect(disposeObject3D).not.toHaveBeenCalledWith(latestObject);
    expect(orchestrator.getState()).toMatchObject({ phase: 'ready', revision: 2 });
    expect(orchestrator.getState().result?.document.id).toBe('récent');
  });

  it('cancel avorte le signal actif, invalide la révision et ne publie pas d’erreur utilisateur', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const pending = deferred<readonly GeneratedArtifact<'cutter'>[]>();
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => void>();
    let observedSignal: AbortSignal | undefined;
    registerCutter(registry, (_document, context) => {
      observedSignal = context.signal;
      return pending.promise;
    });
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D
    });

    orchestrator.schedule(cutterDocument('annulé'));
    scheduler.runPending();
    await flushMicrotasks();
    expect(orchestrator.getState().phase).toBe('generating');

    orchestrator.cancel();

    expect(observedSignal?.aborted).toBe(true);
    expect(orchestrator.getState()).toMatchObject({
      phase: 'idle',
      revision: 2,
      result: null,
      error: null
    });

    const lateObject = new THREE.Group();
    pending.resolve([artifact('cutter', 'late', lateObject)]);
    await flushMicrotasks();
    expect(disposeObject3D).toHaveBeenCalledOnce();
    expect(disposeObject3D).toHaveBeenCalledWith(lateObject);
    expect(orchestrator.getState().error).toBeNull();
  });

  it('publie une erreur lorsqu’une recette courante lance AbortError sans signal avorté', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    let observedSignal: AbortSignal | undefined;
    registerCutter(registry, async (_document, context) => {
      observedSignal = context.signal;
      const failure = new Error('détail interne');
      failure.name = 'AbortError';
      throw failure;
    });
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule
    });

    orchestrator.schedule(cutterDocument('abort-spontané'));
    scheduler.runPending();
    await flushMicrotasks();

    expect(observedSignal?.aborted).toBe(false);
    expect(orchestrator.getState()).toMatchObject({
      phase: 'error',
      result: null,
      error: { revision: 1, message: 'La génération a échoué.' }
    });
  });

  it('conserve le dernier résultat valide sans le disposer après rejet recette, rejet registry et tableau vide', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const validObject = new THREE.Group();
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => void>();
    registerCutter(registry, async (document) => {
      if (document.id === 'erreur') throw new Error('secret-interne-recette');
      if (document.id === 'vide') return [];
      return [artifact('cutter', 'valid', validObject)];
    });
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D
    });

    orchestrator.schedule(cutterDocument('valide'));
    scheduler.runPending();
    await flushMicrotasks();
    const validResult = orchestrator.getState().result;
    expect(validResult).not.toBeNull();

    orchestrator.schedule(cutterDocument('erreur'));
    scheduler.runPending();
    await flushMicrotasks();
    expect(orchestrator.getState()).toMatchObject({ phase: 'error', result: validResult });
    expect(disposeObject3D).not.toHaveBeenCalled();

    orchestrator.schedule(stampDocument('registry-manquant'));
    scheduler.runPending();
    await flushMicrotasks();
    expect(orchestrator.getState()).toMatchObject({ phase: 'error', result: validResult });
    expect(disposeObject3D).not.toHaveBeenCalled();

    orchestrator.schedule(cutterDocument('vide'));
    scheduler.runPending();
    await flushMicrotasks();
    expect(orchestrator.getState()).toMatchObject({
      phase: 'error',
      result: validResult,
      error: { code: 'EMPTY_ARTIFACTS' }
    });
    expect(disposeObject3D).not.toHaveBeenCalled();
  });

  it('publie atomiquement le nouveau résultat puis attend la barrière avant de disposer l’ancien', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const barrier = deferred<void>();
    const oldObject = new THREE.Group();
    const newObject = new THREE.Group();
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => void>();
    const readyStates: GenerationState[] = [];
    let barrierCalls = 0;
    registerCutter(registry, async (document) => [
      artifact('cutter', document.id, document.id === 'ancien' ? oldObject : newObject)
    ]);
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D,
      onStateChange: (state) => {
        if (state.phase === 'ready') readyStates.push(state);
      },
      afterResultChange: () => {
        barrierCalls += 1;
        return barrierCalls === 2 ? barrier.promise : Promise.resolve();
      }
    });

    orchestrator.schedule(cutterDocument('ancien'));
    scheduler.runPending();
    await flushMicrotasks();
    orchestrator.schedule(cutterDocument('nouveau'));
    scheduler.runPending();
    await flushMicrotasks();

    const current = orchestrator.getState();
    expect(current.phase).toBe('ready');
    expect(current.result).toMatchObject({
      revision: 2,
      document: { id: 'nouveau' },
      artifacts: [{ id: 'nouveau', object: newObject }]
    });
    expect(readyStates.at(-1)?.result).toBe(current.result);
    expect(disposeObject3D).not.toHaveBeenCalled();

    barrier.resolve();
    await flushMicrotasks();
    expect(disposeObject3D).toHaveBeenCalledTimes(1);
    expect(disposeObject3D).toHaveBeenCalledWith(oldObject);
    expect(disposeObject3D).not.toHaveBeenCalledWith(newObject);
  });

  it('rend clear/dispose idempotents et déduplique un Object3D partagé par plusieurs artefacts', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const sharedObject = new THREE.Group();
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => void>(() => {
      throw new Error('échec de nettoyage toléré');
    });
    registerCutter(registry, async () => [
      artifact('cutter', 'a', sharedObject),
      artifact('cutter', 'b', sharedObject)
    ]);
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D
    });

    orchestrator.schedule(cutterDocument('dupliqué'));
    scheduler.runPending();
    await flushMicrotasks();

    const firstClear = orchestrator.clear();
    const secondClear = orchestrator.clear();
    expect(secondClear).toBe(firstClear);
    await Promise.all([firstClear, secondClear]);
    expect(orchestrator.getState()).toMatchObject({ phase: 'idle', result: null, error: null });
    expect(orchestrator.getState().revision).toBe(2);
    expect(disposeObject3D).toHaveBeenCalledTimes(1);

    const idleState = orchestrator.getState();
    await orchestrator.clear();
    expect(orchestrator.getState()).toBe(idleState);

    await Promise.all([orchestrator.dispose(), orchestrator.dispose()]);
    expect(orchestrator.getState()).toMatchObject({ phase: 'disposed', result: null });
    expect(disposeObject3D).toHaveBeenCalledTimes(1);

    expect(() => orchestrator.schedule(cutterDocument('interdit'))).toThrowError(
      expect.objectContaining<Partial<GenerationOrchestratorError>>({
        name: 'GenerationOrchestratorError',
        code: 'DISPOSED'
      })
    );
  });

  it('fait attendre dispose tant qu’un nettoyage lancé par clear attend sa barrière', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const clearBarrier = deferred<void>();
    const ownedObject = new THREE.Group();
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => void>();
    let barrierCalls = 0;
    registerCutter(registry, async () => [artifact('cutter', 'owned', ownedObject)]);
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D,
      afterResultChange: () => {
        barrierCalls += 1;
        return barrierCalls === 2 ? clearBarrier.promise : Promise.resolve();
      }
    });

    orchestrator.schedule(cutterDocument('nettoyage-pendant-clear'));
    scheduler.runPending();
    await flushMicrotasks();

    const clearPromise = orchestrator.clear();
    let disposeResolved = false;
    const disposePromise = orchestrator.dispose().then(() => {
      disposeResolved = true;
    });
    await flushMicrotasks();

    expect(orchestrator.getState().phase).toBe('disposed');
    expect(disposeResolved).toBe(false);
    expect(disposeObject3D).not.toHaveBeenCalled();

    clearBarrier.resolve();
    await Promise.all([clearPromise, disposePromise]);
    expect(disposeResolved).toBe(true);
    expect(disposeObject3D).toHaveBeenCalledOnce();
    expect(disposeObject3D).toHaveBeenCalledWith(ownedObject);
  });

  it('attend un disposer asynchrone et contient son rejet avant de résoudre clear', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const firstDisposal = deferred<void>();
    const firstObject = new THREE.Group();
    const secondObject = new THREE.Group();
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => Promise<void>>((object) => {
      if (object === firstObject) return firstDisposal.promise;
      return Promise.reject(new Error('nettoyage asynchrone refusé'));
    });
    registerCutter(registry, async () => [
      artifact('cutter', 'async-1', firstObject),
      artifact('cutter', 'async-2', secondObject)
    ]);
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D
    });

    orchestrator.schedule(cutterDocument('disposer-async'));
    scheduler.runPending();
    await flushMicrotasks();

    let clearResolved = false;
    const clearPromise = orchestrator.clear().then(() => {
      clearResolved = true;
    });
    await flushMicrotasks();
    expect(clearResolved).toBe(false);
    expect(disposeObject3D).toHaveBeenCalledTimes(1);

    firstDisposal.resolve();
    await expect(clearPromise).resolves.toBeUndefined();
    expect(clearResolved).toBe(true);
    expect(disposeObject3D).toHaveBeenCalledTimes(2);
    expect(disposeObject3D).toHaveBeenNthCalledWith(2, secondObject);
  });

  it('rend deux dispose concurrents idempotents sur un résultat encore ready', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const disposeBarrier = deferred<void>();
    const ownedObject = new THREE.Group();
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => void>();
    let barrierCalls = 0;
    registerCutter(registry, async () => [artifact('cutter', 'ready', ownedObject)]);
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D,
      afterResultChange: () => {
        barrierCalls += 1;
        return barrierCalls === 2 ? disposeBarrier.promise : Promise.resolve();
      }
    });

    orchestrator.schedule(cutterDocument('dispose-ready'));
    scheduler.runPending();
    await flushMicrotasks();

    const firstDispose = orchestrator.dispose();
    const secondDispose = orchestrator.dispose();
    expect(secondDispose).toBe(firstDispose);
    expect(disposeObject3D).not.toHaveBeenCalled();

    disposeBarrier.resolve();
    await Promise.all([firstDispose, secondDispose]);
    expect(disposeObject3D).toHaveBeenCalledOnce();
    expect(disposeObject3D).toHaveBeenCalledWith(ownedObject);
  });

  it('contient les exceptions de l’observateur sans bloquer génération ni nettoyage', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const ownedObject = new THREE.Group();
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => void>();
    const onStateChange = vi.fn<(state: GenerationState) => void>(() => {
      throw new Error('observer indisponible');
    });
    registerCutter(registry, async () => [artifact('cutter', 'observé', ownedObject)]);
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D,
      onStateChange
    });

    expect(() => orchestrator.schedule(cutterDocument('observer'))).not.toThrow();
    scheduler.runPending();
    await flushMicrotasks();

    expect(orchestrator.getState().phase).toBe('ready');
    await expect(orchestrator.clear()).resolves.toBeUndefined();
    expect(orchestrator.getState().phase).toBe('idle');
    expect(disposeObject3D).toHaveBeenCalledOnce();
  });

  it('enregistre le cleanup avant une publication clear réentrante vers dispose', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const clearBarrier = deferred<void>();
    const ownedObject = new THREE.Group();
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => void>();
    let barrierCalls = 0;
    let reentrantDispose: Promise<void> | null = null;
    let disposeResolved = false;
    let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
    registerCutter(registry, async () => [artifact('cutter', 'réentrant', ownedObject)]);
    orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D,
      afterResultChange: () => {
        barrierCalls += 1;
        return barrierCalls === 2 ? clearBarrier.promise : Promise.resolve();
      },
      onStateChange: (state) => {
        if (state.phase === 'idle' && state.revision > 1) {
          reentrantDispose = orchestrator.dispose();
          void reentrantDispose.then(() => {
            disposeResolved = true;
          });
        }
      }
    });

    orchestrator.schedule(cutterDocument('publication-réentrante'));
    scheduler.runPending();
    await flushMicrotasks();

    const clearPromise = orchestrator.clear();
    await flushMicrotasks();

    expect(reentrantDispose).not.toBeNull();
    expect(disposeResolved).toBe(false);
    expect(disposeObject3D).not.toHaveBeenCalled();

    clearBarrier.resolve();
    await Promise.all([clearPromise, reentrantDispose]);
    expect(disposeObject3D).toHaveBeenCalledOnce();
    expect(orchestrator.getState().phase).toBe('disposed');
  });

  it('évite une attente circulaire si le disposer rappelle dispose synchroniquement', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const ownedObject = new THREE.Group();
    let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => Promise<void>>(() =>
      orchestrator.dispose()
    );
    registerCutter(registry, async () => [artifact('cutter', 'cycle', ownedObject)]);
    orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D
    });

    orchestrator.schedule(cutterDocument('disposer-réentrant'));
    scheduler.runPending();
    await flushMicrotasks();

    let disposeResolved = false;
    void orchestrator.dispose().then(() => {
      disposeResolved = true;
    });
    await flushMicrotasks();

    expect(disposeResolved).toBe(true);
    expect(disposeObject3D).toHaveBeenCalledOnce();
  });

  it('accepte un scheduler synchrone sans référence temporelle ni timer fantôme', async () => {
    const registry = new RecipeRegistry();
    const generate = vi.fn<GenerationRecipe<'cutter'>['generate']>(async (document) => [
      artifact('cutter', document.id)
    ]);
    registerCutter(registry, generate);
    const synchronousScheduler: GenerationScheduler = (callback) => {
      callback();
      return Object.freeze({ cancel: vi.fn() });
    };
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: synchronousScheduler
    });

    expect(() => orchestrator.schedule(cutterDocument('synchrone-1'))).not.toThrow();
    await flushMicrotasks();
    expect(orchestrator.getState().phase).toBe('ready');

    expect(() => orchestrator.schedule(cutterDocument('synchrone-2'))).not.toThrow();
    await flushMicrotasks();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(orchestrator.getState().result?.document.id).toBe('synchrone-2');
  });

  it('dispose exactement une fois un résultat tardif après dispose sans quitter disposed', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const pending = deferred<readonly GeneratedArtifact<'cutter'>[]>();
    const lateObject = new THREE.Group();
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => void>();
    registerCutter(registry, () => pending.promise);
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D
    });

    orchestrator.schedule(cutterDocument('en-vol'));
    scheduler.runPending();
    await flushMicrotasks();
    let disposeResolved = false;
    const disposePromise = orchestrator.dispose().then(() => {
      disposeResolved = true;
    });
    const disposedRevision = orchestrator.getState().revision;
    await flushMicrotasks();

    expect(disposeResolved).toBe(false);
    expect(disposeObject3D).not.toHaveBeenCalled();

    pending.resolve([artifact('cutter', 'tardif', lateObject)]);
    await disposePromise;

    expect(disposeObject3D).toHaveBeenCalledTimes(1);
    expect(disposeObject3D).toHaveBeenCalledWith(lateObject);
    expect(orchestrator.getState()).toMatchObject({
      phase: 'disposed',
      revision: disposedRevision,
      result: null,
      error: null
    });
  });

  it('rejette un document invalide sans génération et détache le snapshot des mutations d’entrée', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const seenNames: string[] = [];
    const seenSketches: string[] = [];
    registerCutter(registry, async (document) => {
      seenNames.push(document.name);
      seenSketches.push(document.sketch.svg);
      return [artifact('cutter', document.id)];
    });
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule
    });

    orchestrator.schedule({ schemaVersion: 1, kind: 'cutter', rawSecret: 'ne pas exposer' });
    expect(orchestrator.getState()).toMatchObject({
      phase: 'error',
      revision: 1,
      requestedDocument: null,
      result: null,
      error: { code: 'INVALID_DOCUMENT' }
    });
    expect(scheduler.pendingCount).toBe(0);

    const input = cutterDocument('snapshot');
    const originalName = input.name;
    const originalSketch = input.sketch.svg;
    orchestrator.schedule(input);
    expect(orchestrator.getState().requestedDocument).not.toBe(input);
    Reflect.set(input, 'name', 'MUTÉ');
    Reflect.set(input.sketch, 'svg', '<svg><script>hostile()</script></svg>');
    scheduler.runPending();
    await flushMicrotasks();

    expect(seenNames).toEqual([originalName]);
    expect(seenSketches).toEqual([originalSketch]);
    expect(orchestrator.getState().result?.document.name).toBe(originalName);
  });

  it('résout les branches cutter et stamp avec leurs documents et artefacts corrélés', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const cutterGenerate = vi.fn<GenerationRecipe<'cutter'>['generate']>(async (document) => [
      artifact('cutter', document.id)
    ]);
    const stampGenerate = vi.fn<GenerationRecipe<'stamp'>['generate']>(async (document) => [
      artifact('stamp', document.id)
    ]);
    registerCutter(registry, cutterGenerate);
    registerStamp(registry, stampGenerate);
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule
    });

    orchestrator.schedule(cutterDocument('c'));
    scheduler.runPending();
    await flushMicrotasks();
    expect(cutterGenerate.mock.calls[0]?.[0].kind).toBe('cutter');
    expect(orchestrator.getState().result?.artifacts[0].role).toBe('cutter');

    orchestrator.schedule(stampDocument('s'));
    scheduler.runPending();
    await flushMicrotasks();
    expect(stampGenerate.mock.calls[0]?.[0].kind).toBe('stamp');
    expect(orchestrator.getState().result).toMatchObject({
      document: { kind: 'stamp' },
      artifacts: [{ role: 'stamp' }]
    });
  });

  it('gèle tous les wrappers publics et ne publie ni cause ni message brut secret', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    registerCutter(registry, async (document) => {
      if (document.id === 'secret') {
        throw Object.assign(new Error('mot-de-passe-base-de-données'), {
          cause: { token: 'jeton-secret' },
          code: 'SECRET_TOKEN'
        });
      }
      const mutableReport: GeometryValidationReport = {
        valid: true,
        errors: [],
        warnings: [],
        triangles: 12,
        shells: 1,
        meshes: 1,
        volume: 42,
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 1, y: 2, z: 3 }
        }
      };
      return [artifact('cutter', 'frozen', new THREE.Group(), mutableReport)];
    });
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule
    });

    expect(Object.isFrozen(orchestrator.getState())).toBe(true);
    orchestrator.schedule(cutterDocument('gelé'));
    expect(Object.isFrozen(orchestrator.getState())).toBe(true);
    expect(Object.isFrozen(orchestrator.getState().requestedDocument)).toBe(true);
    scheduler.runPending();
    await flushMicrotasks();

    const result = orchestrator.getState().result;
    expect(result).not.toBeNull();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.artifacts)).toBe(true);
    expect(Object.isFrozen(result?.artifacts[0])).toBe(true);
    expect(Object.isFrozen(result?.artifacts[0].dimensionsMm)).toBe(true);
    expect(Object.isFrozen(result?.artifacts[0].validation)).toBe(true);
    expect(Object.isFrozen(result?.artifacts[0].validation.errors)).toBe(true);
    expect(Object.isFrozen(result?.artifacts[0].validation.warnings)).toBe(true);
    expect(Object.isFrozen(result?.artifacts[0].validation.bounds)).toBe(true);
    expect(Object.isFrozen(result?.artifacts[0].validation.bounds?.min)).toBe(true);
    expect(Object.isFrozen(result?.artifacts[0].validation.bounds?.max)).toBe(true);
    expect(Object.isFrozen(result?.artifacts[0].object)).toBe(false);

    orchestrator.schedule(cutterDocument('secret'));
    scheduler.runPending();
    await flushMicrotasks();
    const error = orchestrator.getState().error;
    expect(Object.isFrozen(orchestrator.getState())).toBe(true);
    expect(Object.isFrozen(error)).toBe(true);
    expect(error).toEqual({ revision: 2, message: 'La génération a échoué.' });
    expect(error).not.toHaveProperty('code');
    expect(error).not.toHaveProperty('cause');
    expect(error).not.toHaveProperty('raw');
    expect(error?.message).not.toContain('mot-de-passe');
    expect(JSON.stringify(error)).not.toContain('jeton-secret');
  });

  it('partage la barrière de dispose avec clear pendant tout le drainage', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const disposalBarrier = deferred<void>();
    const ownedObject = new THREE.Group();
    let barrierCalls = 0;
    registerCutter(registry, async () => [artifact('cutter', 'drainage', ownedObject)]);
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      afterResultChange: () => {
        barrierCalls += 1;
        return barrierCalls === 2 ? disposalBarrier.promise : Promise.resolve();
      }
    });

    orchestrator.schedule(cutterDocument('drainage-croisé'));
    scheduler.runPending();
    await flushMicrotasks();

    const disposePromise = orchestrator.dispose();
    const clearDuringDispose = orchestrator.clear();
    expect(clearDuringDispose).toBe(disposePromise);

    let clearResolved = false;
    void clearDuringDispose.then(() => {
      clearResolved = true;
    });
    await flushMicrotasks();
    expect(clearResolved).toBe(false);

    disposalBarrier.resolve();
    await Promise.all([disposePromise, clearDuringDispose]);
    expect(clearResolved).toBe(true);
  });

  it('ne ressuscite pas schedule si un auditeur AbortSignal appelle dispose', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const pending = deferred<readonly GeneratedArtifact<'cutter'>[]>();
    let disposal: Promise<void> | null = null;
    let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
    registerCutter(registry, (_document, context) => {
      context.signal.addEventListener('abort', () => {
        disposal = orchestrator.dispose();
      }, { once: true });
      return pending.promise;
    });
    orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule
    });

    orchestrator.schedule(cutterDocument('abort-schedule-1'));
    scheduler.runPending();
    await flushMicrotasks();

    expect(() => orchestrator.schedule(cutterDocument('abort-schedule-2'))).toThrow(
      GenerationOrchestratorError
    );
    expect(orchestrator.getState().phase).toBe('disposed');
    expect(scheduler.pendingCount).toBe(0);

    pending.resolve([artifact('cutter', 'abort-schedule-tardif')]);
    await disposal;
    expect(orchestrator.getState().phase).toBe('disposed');
  });

  it('ne ressuscite pas cancel si un auditeur AbortSignal appelle dispose', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const pending = deferred<readonly GeneratedArtifact<'cutter'>[]>();
    let disposal: Promise<void> | null = null;
    let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
    registerCutter(registry, (_document, context) => {
      context.signal.addEventListener('abort', () => {
        disposal = orchestrator.dispose();
      }, { once: true });
      return pending.promise;
    });
    orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule
    });

    orchestrator.schedule(cutterDocument('abort-cancel'));
    scheduler.runPending();
    await flushMicrotasks();
    orchestrator.cancel();

    expect(orchestrator.getState().phase).toBe('disposed');
    pending.resolve([artifact('cutter', 'abort-cancel-tardif')]);
    await disposal;
    expect(orchestrator.getState().phase).toBe('disposed');
  });

  it('revérifie l’ownership entre deux disposeurs asynchrones', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const firstDisposal = deferred<void>();
    const first = new THREE.Group();
    const shared = new THREE.Group();
    const middle = new THREE.Group();
    let generation = 0;
    registerCutter(registry, async () => {
      generation += 1;
      if (generation === 1) {
        return [
          artifact('cutter', 'premier', first),
          artifact('cutter', 'partagé', shared)
        ];
      }
      if (generation === 2) return [artifact('cutter', 'milieu', middle)];
      return [artifact('cutter', 'repris', shared)];
    });
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => void | Promise<void>>(
      (object) => object === first ? firstDisposal.promise : undefined
    );
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D
    });

    orchestrator.schedule(cutterDocument('ownership-1'));
    scheduler.runPending();
    await flushMicrotasks();
    orchestrator.schedule(cutterDocument('ownership-2'));
    scheduler.runPending();
    await flushMicrotasks();
    expect(disposeObject3D).toHaveBeenCalledWith(first);

    orchestrator.schedule(cutterDocument('ownership-3'));
    scheduler.runPending();
    await flushMicrotasks();
    expect(orchestrator.getState().result?.artifacts[0].object).toBe(shared);

    firstDisposal.resolve();
    await flushMicrotasks();
    expect(disposeObject3D).not.toHaveBeenCalledWith(shared);
  });

  it('refuse de republier un objet dont la disposition est déjà engagée', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const disposalBarrier = deferred<void>();
    const reused = new THREE.Group();
    const retained = new THREE.Group();
    let generation = 0;
    registerCutter(registry, async () => {
      generation += 1;
      if (generation === 1) return [artifact('cutter', 'initial', reused)];
      if (generation === 2) return [artifact('cutter', 'retenu', retained)];
      return [artifact('cutter', 'réutilisé', reused)];
    });
    const disposeObject3D = vi.fn<(object: THREE.Object3D) => void | Promise<void>>(
      (object) => object === reused ? disposalBarrier.promise : undefined
    );
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D
    });

    orchestrator.schedule(cutterDocument('réutilisation-1'));
    scheduler.runPending();
    await flushMicrotasks();
    orchestrator.schedule(cutterDocument('réutilisation-2'));
    scheduler.runPending();
    await flushMicrotasks();
    orchestrator.schedule(cutterDocument('réutilisation-3'));
    scheduler.runPending();
    await flushMicrotasks();

    expect(orchestrator.getState().phase).toBe('error');
    expect(orchestrator.getState().result?.artifacts[0].object).toBe(retained);
    expect(disposeObject3D).toHaveBeenCalledTimes(1);

    disposalBarrier.resolve();
    await flushMicrotasks();
  });

  it('relance clear si une nouvelle génération apparaît pendant le drainage précédent', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const barrier = deferred<void>();
    let barrierCalls = 0;
    registerCutter(registry, async () => [artifact('cutter', 'clear-révision')]);
    const orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      afterResultChange: () => {
        barrierCalls += 1;
        return barrierCalls === 2 ? barrier.promise : Promise.resolve();
      }
    });

    orchestrator.schedule(cutterDocument('clear-révision-1'));
    scheduler.runPending();
    await flushMicrotasks();
    const firstClear = orchestrator.clear();
    await flushMicrotasks();

    orchestrator.schedule(cutterDocument('clear-révision-2'));
    expect(orchestrator.getState().phase).toBe('scheduled');
    const secondClear = orchestrator.clear();

    expect(secondClear).not.toBe(firstClear);
    expect(orchestrator.getState().phase).toBe('idle');
    expect(scheduler.pendingCount).toBe(0);

    barrier.resolve();
    await Promise.all([firstClear, secondClear]);
  });

  it('ne se bloque pas si un disposer retourne clear pendant dispose', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
    registerCutter(registry, async () => [artifact('cutter', 'dispose-clear')]);
    orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      disposeObject3D: () => orchestrator.clear()
    });

    orchestrator.schedule(cutterDocument('dispose-clear'));
    scheduler.runPending();
    await flushMicrotasks();
    const disposal = orchestrator.dispose();
    let settled = false;
    void disposal.then(() => {
      settled = true;
    });

    await flushMicrotasks();
    expect(settled).toBe(true);
    expect(orchestrator.getState().phase).toBe('disposed');
  });

  it('ne se bloque pas si la barrière de publication retourne dispose', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
    const disposals: Promise<void>[] = [];
    registerCutter(registry, async () => [artifact('cutter', 'barrière-dispose')]);
    orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      afterResultChange: () => {
        const disposal = orchestrator.dispose();
        disposals.push(disposal);
        return disposal;
      }
    });

    orchestrator.schedule(cutterDocument('barrière-dispose'));
    scheduler.runPending();
    await flushMicrotasks();
    expect(orchestrator.getState().phase).toBe('disposed');
    const disposal = disposals[0];
    if (disposal === undefined) throw new Error('La barrière devait déclencher dispose.');
    let settled = false;
    void disposal.then(() => {
      settled = true;
    });

    await flushMicrotasks();
    expect(settled).toBe(true);
  });

  it('ne crée pas de timer après un clear réentrant depuis la publication scheduled', () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
    registerCutter(registry, async () => [artifact('cutter', 'scheduled-clear')]);
    orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule,
      onStateChange: (state) => {
        if (state.phase === 'scheduled') void orchestrator.clear();
      }
    });

    orchestrator.schedule(cutterDocument('scheduled-clear'));

    expect(orchestrator.getState().phase).toBe('idle');
    expect(scheduler.pendingCount).toBe(0);
  });

  it('bloque un schedule réentrant depuis abort dès le début de dispose', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const pending = deferred<readonly GeneratedArtifact<'cutter'>[]>();
    let scheduleRejected = false;
    let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
    registerCutter(registry, (_document, context) => {
      context.signal.addEventListener('abort', () => {
        try {
          orchestrator.schedule(cutterDocument('abort-during-dispose-2'));
        } catch (error: unknown) {
          scheduleRejected = error instanceof GenerationOrchestratorError;
        }
      }, { once: true });
      return pending.promise;
    });
    orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule
    });

    orchestrator.schedule(cutterDocument('abort-during-dispose-1'));
    scheduler.runPending();
    await flushMicrotasks();
    const disposal = orchestrator.dispose();

    expect(scheduleRejected).toBe(true);
    expect(scheduler.pendingCount).toBe(0);
    expect(orchestrator.getState().phase).toBe('disposed');

    pending.resolve([artifact('cutter', 'abort-during-dispose-tardif')]);
    await disposal;
  });

  it('reste disposed si le parsing valide déclenche dispose via un getter', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const disposals: Promise<void>[] = [];
    let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
    let triggered = false;
    registerCutter(registry, async () => [artifact('cutter', 'proxy-valide')]);
    orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule
    });
    const source = cutterDocument('proxy-valide');
    const hostileDocument = new Proxy(source, {
      get(target, property, receiver) {
        if (!triggered) {
          triggered = true;
          disposals.push(orchestrator.dispose());
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(() => orchestrator.schedule(hostileDocument)).toThrow(
      GenerationOrchestratorError
    );
    expect(orchestrator.getState().phase).toBe('disposed');
    expect(scheduler.pendingCount).toBe(0);
    await Promise.all(disposals);
  });

  it('reste disposed si le parsing en échec déclenche dispose via un getter', async () => {
    const scheduler = new FakeScheduler();
    const registry = new RecipeRegistry();
    const disposals: Promise<void>[] = [];
    let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
    orchestrator = createGenerationOrchestrator({
      registry,
      scheduler: scheduler.schedule
    });
    const source = cutterDocument('proxy-invalide');
    let triggered = false;
    const hostileDocument = new Proxy(source, {
      get(target, property, receiver) {
        if (!triggered) {
          triggered = true;
          disposals.push(orchestrator.dispose());
          throw new Error('Getter hostile');
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(() => orchestrator.schedule(hostileDocument)).toThrow(
      GenerationOrchestratorError
    );
    expect(orchestrator.getState().phase).toBe('disposed');
    expect(scheduler.pendingCount).toBe(0);
    await Promise.all(disposals);
  });

  it('détache le timer avant un cancel réentrant du scheduler', () => {
    const registry = new RecipeRegistry();
    let cancelCalls = 0;
    let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
    const scheduler: GenerationScheduler = () => Object.freeze({
      cancel: () => {
        cancelCalls += 1;
        if (cancelCalls > 1) throw new Error('Le même timer a été annulé récursivement.');
        orchestrator.cancel();
      }
    });
    registerCutter(registry, async () => [artifact('cutter', 'cancel-réentrant')]);
    orchestrator = createGenerationOrchestrator({ registry, scheduler });
    orchestrator.schedule(cutterDocument('cancel-réentrant'));

    expect(() => orchestrator.cancel()).not.toThrow();
    expect(cancelCalls).toBe(1);
    expect(orchestrator.getState().phase).toBe('idle');
  });

  it('conserve le timer d’un schedule réentrant créé pendant cancel', async () => {
    const registry = new RecipeRegistry();
    const tasks: Array<{ cancelled: boolean }> = [];
    let reentered = false;
    let orchestrator: ReturnType<typeof createGenerationOrchestrator>;
    const scheduler: GenerationScheduler = () => {
      const task = { cancelled: false };
      tasks.push(task);
      const isFirstTask = tasks.length === 1;
      return Object.freeze({
        cancel: () => {
          task.cancelled = true;
          if (isFirstTask && !reentered) {
            reentered = true;
            orchestrator.schedule(cutterDocument('timer-réentrant-3'));
          }
        }
      });
    };
    registerCutter(registry, async () => [artifact('cutter', 'timer-réentrant')]);
    orchestrator = createGenerationOrchestrator({ registry, scheduler });

    orchestrator.schedule(cutterDocument('timer-réentrant-1'));
    orchestrator.schedule(cutterDocument('timer-réentrant-2'));

    expect(orchestrator.getState().requestedDocument?.id).toBe('timer-réentrant-3');
    expect(tasks.filter((task) => !task.cancelled)).toHaveLength(1);

    await orchestrator.dispose();
    expect(tasks.filter((task) => !task.cancelled)).toHaveLength(0);
  });
});
