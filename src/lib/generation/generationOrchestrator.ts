import type { Object3D } from 'three';
import type { DesignDocument } from '../domain/designDocument';
import { parseDesignDocument } from '../domain/documentValidation';
import type { GeneratedArtifact } from '../domain/generatedArtifact';
import { disposeObject3D as defaultDisposeObject3D } from '../utils/disposeThree';
import type { GeometryValidationReport } from '../utils/geometryValidation';
import { CutterGenerationError } from '../utils/generationValidation';
import type { GenerationContext } from './generationRecipe';
import {
  RecipeRegistry,
  RecipeRegistryError
} from './recipeRegistry';
import {
  createInitialGenerationState,
  createReadyGenerationState,
  freezeGenerationState,
  type GenerationResult,
  type GenerationState,
  type ImplementedDesignDocument,
  type ImplementedGeneratedArtifact,
  type NonEmptyReadonlyArray,
  type PublicGenerationError
} from './generationState';

export interface GenerationSchedulerHandle {
  cancel(): void;
}

export type GenerationScheduler = (
  callback: () => void,
  delayMs: number
) => GenerationSchedulerHandle;

export type GenerationOrchestratorErrorCode =
  | 'DISPOSED'
  | 'INVALID_DOCUMENT'
  | 'EMPTY_ARTIFACTS'
  | 'ARTIFACT_DISPOSING';

function orchestratorErrorMessage(code: GenerationOrchestratorErrorCode): string {
  switch (code) {
    case 'DISPOSED':
      return 'La génération ne peut plus être planifiée : l’orchestrateur est disposé.';
    case 'INVALID_DOCUMENT':
      return 'Le document de conception est invalide.';
    case 'EMPTY_ARTIFACTS':
      return 'La génération n’a produit aucun artefact.';
    case 'ARTIFACT_DISPOSING':
      return 'La génération a réutilisé un objet 3D dont la disposition est déjà engagée.';
  }
}

/** Erreur structurée locale : elle n’est jamais placée telle quelle dans l’état public. */
export class GenerationOrchestratorError extends Error {
  readonly code: GenerationOrchestratorErrorCode;

  constructor(code: GenerationOrchestratorErrorCode) {
    super(orchestratorErrorMessage(code));
    this.name = 'GenerationOrchestratorError';
    this.code = code;
  }
}

export interface GenerationOrchestratorOptions {
  readonly registry: RecipeRegistry;
  readonly debounceMs?: number;
  readonly scheduler?: GenerationScheduler;
  /** Callback synchrone. Il doit terminer sans lancer d’exception. */
  readonly onStateChange?: (state: GenerationState) => void;
  /** Barrière UI appelée après une modification de result et avant tout nettoyage remplacé. */
  readonly afterResultChange?: () => Promise<void>;
  readonly disposeObject3D?: (object: Object3D) => unknown;
}

const defaultScheduler: GenerationScheduler = (callback, delayMs) => {
  const timeout = globalThis.setTimeout(callback, delayMs);
  return Object.freeze({ cancel: () => globalThis.clearTimeout(timeout) });
};

class InternalAbortError extends Error {
  constructor() {
    super('Opération de génération annulée.');
    this.name = 'AbortError';
  }
}

function freezeDocument(document: ImplementedDesignDocument): ImplementedDesignDocument {
  Object.freeze(document.source);
  Object.freeze(document.sketch);
  Object.freeze(document.parameters);
  Object.freeze(document.viewport);
  if (document.schemaVersion === 2) {
    for (const bridge of document.bridges) {
      Object.freeze(bridge.from);
      Object.freeze(bridge.to);
      Object.freeze(bridge);
    }
    Object.freeze(document.bridges);
  }
  return Object.freeze(document);
}

function cloneValidationReport(
  report: GeometryValidationReport
): GeometryValidationReport {
  const bounds = report.bounds === null
    ? null
    : Object.freeze({
        min: Object.freeze({ ...report.bounds.min }),
        max: Object.freeze({ ...report.bounds.max })
      });

  return Object.freeze({
    ...report,
    errors: Object.freeze([...report.errors]),
    warnings: Object.freeze([...report.warnings]),
    bounds
  });
}

function cloneArtifact<K extends 'cutter' | 'stamp'>(
  artifact: GeneratedArtifact<K>
): GeneratedArtifact<K> {
  return Object.freeze({
    ...artifact,
    dimensionsMm: Object.freeze({ ...artifact.dimensionsMm }),
    validation: cloneValidationReport(artifact.validation)
  });
}

function cloneArtifacts<K extends 'cutter' | 'stamp'>(
  artifacts: readonly GeneratedArtifact<K>[]
): NonEmptyReadonlyArray<GeneratedArtifact<K>> {
  const [first, ...rest] = artifacts;
  if (first === undefined) {
    throw new GenerationOrchestratorError('EMPTY_ARTIFACTS');
  }

  const clones: [GeneratedArtifact<K>, ...GeneratedArtifact<K>[]] = [
    cloneArtifact(first),
    ...rest.map((artifact) => cloneArtifact(artifact))
  ];
  return Object.freeze(clones);
}

function createResult<K extends 'cutter' | 'stamp'>(
  revision: number,
  document: DesignDocument<K>,
  artifacts: readonly GeneratedArtifact<K>[]
): GenerationResult<K> {
  return Object.freeze({
    revision,
    document,
    artifacts: cloneArtifacts(artifacts)
  });
}

function publicError(revision: number, error: unknown): PublicGenerationError {
  let message = 'La génération a échoué.';
  let code: string | undefined;

  if (error instanceof GenerationOrchestratorError) {
    message = error.message;
    code = error.code;
  } else if (error instanceof RecipeRegistryError) {
    message = 'La recette de génération demandée est indisponible.';
    code = error.code;
  } else if (error instanceof CutterGenerationError) {
    message = error.message;
    code = error.code;
  }

  return Object.freeze(
    code === undefined ? { revision, message } : { revision, message, code }
  );
}

interface ReservedResultDisposal {
  readonly promise: Promise<void>;
  readonly release: () => void;
}

export class GenerationOrchestrator {
  private readonly registry: RecipeRegistry;
  private readonly debounceMs: number;
  private readonly scheduler: GenerationScheduler;
  private readonly onStateChange: (state: GenerationState) => void;
  private readonly afterResultChange: () => Promise<void>;
  private readonly disposeObject3D: (object: Object3D) => unknown;
  private readonly disposedObjects = new WeakSet<Object3D>();
  private readonly pendingDisposals = new Set<Promise<void>>();
  private readonly activeExecutions = new Set<Promise<void>>();

  private state = createInitialGenerationState();
  private timer: GenerationSchedulerHandle | null = null;
  private activeController: AbortController | null = null;
  private clearPromise: Promise<void> | null = null;
  private clearRevision: number | null = null;
  private disposePromise: Promise<void> | null = null;
  private lifecycleCallbackDepth = 0;
  private operationSequence = 0;

  constructor(options: GenerationOrchestratorOptions) {
    this.registry = options.registry;
    this.debounceMs = options.debounceMs ?? 300;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.onStateChange = options.onStateChange ?? (() => undefined);
    this.afterResultChange = options.afterResultChange ?? (() => Promise.resolve());
    this.disposeObject3D = options.disposeObject3D ?? defaultDisposeObject3D;
  }

  getState(): GenerationState {
    return this.state;
  }

  schedule(document: unknown): void {
    if (this.hasBeenDisposed()) {
      throw new GenerationOrchestratorError('DISPOSED');
    }

    const operation = this.beginOperation();
    const revision = this.invalidatePendingWork();
    if (!this.isOperationCurrent(operation) || this.hasBeenDisposed()) {
      if (this.hasBeenDisposed()) throw new GenerationOrchestratorError('DISPOSED');
      return;
    }
    let snapshot: ImplementedDesignDocument;

    try {
      snapshot = freezeDocument(parseDesignDocument(document));
    } catch (error: unknown) {
      if (!this.isOperationCurrent(operation) || this.hasBeenDisposed()) {
        if (this.hasBeenDisposed()) throw new GenerationOrchestratorError('DISPOSED');
        return;
      }
      this.publish({
        phase: 'error',
        revision,
        requestedDocument: null,
        result: this.state.result,
        error: publicError(
          revision,
          new GenerationOrchestratorError('INVALID_DOCUMENT')
        )
      });
      return;
    }

    if (!this.isOperationCurrent(operation) || this.hasBeenDisposed()) {
      if (this.hasBeenDisposed()) throw new GenerationOrchestratorError('DISPOSED');
      return;
    }
    this.publish({
      phase: 'scheduled',
      revision,
      requestedDocument: snapshot,
      result: this.state.result,
      error: null
    });
    if (
      !this.isOperationCurrent(operation)
      || this.hasBeenDisposed()
      || this.state.phase !== 'scheduled'
      || this.state.revision !== revision
    ) return;

    let callbackRan = false;
    const handle = this.scheduler(() => {
      callbackRan = true;
      if (
        !this.isOperationCurrent(operation)
        || this.state.revision !== revision
        || this.state.phase === 'disposed'
      ) return;
      this.timer = null;
      this.startExecution(snapshot, revision);
    }, this.debounceMs);
    if (callbackRan) return;
    if (
      !this.isOperationCurrent(operation)
      || this.hasBeenDisposed()
      || this.state.phase !== 'scheduled'
      || this.state.revision !== revision
    ) {
      handle.cancel();
      return;
    }
    this.timer = handle;
  }

  cancel(): void {
    if (this.hasBeenDisposed()) return;

    const operation = this.beginOperation();
    const revision = this.invalidatePendingWork();
    if (!this.isOperationCurrent(operation) || this.hasBeenDisposed()) return;
    const result = this.state.result;
    if (result === null) {
      this.publish({
        phase: 'idle',
        revision,
        requestedDocument: null,
        result: null,
        error: null
      });
      return;
    }

    this.publish(createReadyGenerationState(revision, result));
  }

  clear(): Promise<void> {
    if (this.hasBeenDisposed()) {
      return this.exposeLifecyclePromise(this.disposePromise ?? Promise.resolve());
    }
    if (
      this.clearPromise !== null
      && (
        this.clearRevision === null
        || (
          this.state.phase === 'idle'
          && this.state.revision === this.clearRevision
        )
      )
    ) {
      return this.exposeLifecyclePromise(this.clearPromise);
    }
    if (
      this.state.phase === 'idle'
      && this.state.requestedDocument === null
      && this.state.result === null
      && this.state.error === null
    ) return Promise.resolve();

    const previousResult = this.state.result;
    const disposal = previousResult === null
      ? null
      : this.reserveResultDisposal(previousResult);
    let resolveClear: () => void = () => undefined;
    const clearPromise = new Promise<void>((resolve) => {
      resolveClear = () => resolve();
    });
    this.clearPromise = clearPromise;
    this.clearRevision = null;
    const operation = this.beginOperation();
    const revision = this.invalidatePendingWork();
    this.clearRevision = revision;

    const complete = (): void => {
      if (this.clearPromise === clearPromise) {
        this.clearPromise = null;
        this.clearRevision = null;
      }
      resolveClear();
    };

    if (!this.isOperationCurrent(operation) || this.hasBeenDisposed()) {
      disposal?.release();
      const pending = Promise.allSettled([...this.pendingDisposals]).then(
        () => undefined
      );
      void (this.disposePromise ?? pending).then(complete, complete);
      return this.exposeLifecyclePromise(clearPromise);
    }

    this.publish({
      phase: 'idle',
      revision,
      requestedDocument: null,
      result: null,
      error: null
    });
    disposal?.release();
    const pendingAtClear = [...this.pendingDisposals];
    void Promise.allSettled(pendingAtClear).then(complete, complete);
    return this.exposeLifecyclePromise(clearPromise);
  }

  dispose(): Promise<void> {
    if (this.disposePromise !== null) {
      return this.exposeLifecyclePromise(this.disposePromise);
    }
    if (this.state.phase === 'disposed') return Promise.resolve();

    const previousResult = this.state.result;
    const disposal = previousResult === null
      ? null
      : this.reserveResultDisposal(previousResult);
    let resolveDisposal: () => void = () => undefined;
    const disposePromise = new Promise<void>((resolve) => {
      resolveDisposal = () => resolve();
    });
    this.disposePromise = disposePromise;
    this.beginOperation();
    const revision = this.invalidatePendingWork();
    this.publish({
      phase: 'disposed',
      revision,
      requestedDocument: null,
      result: null,
      error: null
    });
    disposal?.release();

    void (async () => {
      await this.waitForActiveExecutions();
      await this.waitForPendingDisposals();
    })().then(resolveDisposal, resolveDisposal);
    return this.exposeLifecyclePromise(disposePromise);
  }

  private startExecution(
    document: ImplementedDesignDocument,
    revision: number
  ): void {
    const execution = Promise.resolve().then(() => this.execute(document, revision));
    this.activeExecutions.add(execution);
    void execution.then(
      () => this.activeExecutions.delete(execution),
      () => this.activeExecutions.delete(execution)
    );
  }

  private async execute(
    document: ImplementedDesignDocument,
    revision: number
  ): Promise<void> {
    if (this.state.revision !== revision || this.state.phase === 'disposed') return;

    const controller = new AbortController();
    this.activeController = controller;
    let generatedArtifacts: readonly ImplementedGeneratedArtifact[] | null = null;

    this.publish({
      phase: 'generating',
      revision,
      requestedDocument: document,
      result: this.state.result,
      error: null
    });

    try {
      let result: GenerationResult;
      const context: GenerationContext = Object.freeze({
        signal: controller.signal,
        revision
      });

      switch (document.kind) {
        case 'cutter': {
          this.assertCurrent(revision, controller);
          const recipe = await this.registry.resolve('cutter');
          this.assertCurrent(revision, controller);
          const artifacts = await recipe.generate(document, context);
          generatedArtifacts = artifacts;
          if (!this.isCurrent(revision, controller)) {
            await this.disposeArtifacts(artifacts);
            generatedArtifacts = null;
            return;
          }
          this.assertArtifactsPublishable(artifacts);
          result = createResult(revision, document, artifacts);
          break;
        }
        case 'stamp': {
          this.assertCurrent(revision, controller);
          const recipe = await this.registry.resolve('stamp');
          this.assertCurrent(revision, controller);
          const artifacts = await recipe.generate(document, context);
          generatedArtifacts = artifacts;
          if (!this.isCurrent(revision, controller)) {
            await this.disposeArtifacts(artifacts);
            generatedArtifacts = null;
            return;
          }
          this.assertArtifactsPublishable(artifacts);
          result = createResult(revision, document, artifacts);
          break;
        }
      }

      this.assertCurrent(revision, controller);
      const previousResult = this.state.result;
      const disposal = previousResult === null
        ? null
        : this.reserveResultDisposal(previousResult);
      this.publish(createReadyGenerationState(revision, result));
      disposal?.release();
      generatedArtifacts = null;

      if (disposal !== null) {
        await disposal.promise;
      } else {
        await this.waitAfterResultChange();
      }
    } catch (error: unknown) {
      if (generatedArtifacts !== null) {
        await this.disposeArtifacts(generatedArtifacts);
        generatedArtifacts = null;
      }
      if (!this.isCurrent(revision, controller)) return;

      this.publish({
        phase: 'error',
        revision,
        requestedDocument: document,
        result: this.state.result,
        error: publicError(revision, error)
      });
    } finally {
      if (this.activeController === controller) this.activeController = null;
    }
  }

  private invalidatePendingWork(): number {
    const timer = this.timer;
    this.timer = null;
    timer?.cancel();
    const controller = this.activeController;
    this.activeController = null;
    controller?.abort();
    return this.state.revision + 1;
  }

  private isCurrent(revision: number, controller: AbortController): boolean {
    return (
      this.state.phase !== 'disposed' &&
      this.state.revision === revision &&
      this.activeController === controller &&
      !controller.signal.aborted
    );
  }

  private beginOperation(): number {
    this.operationSequence += 1;
    return this.operationSequence;
  }

  private isOperationCurrent(operation: number): boolean {
    return this.operationSequence === operation;
  }

  private hasBeenDisposed(): boolean {
    return this.disposePromise !== null || this.state.phase === 'disposed';
  }

  private exposeLifecyclePromise(promise: Promise<void>): Promise<void> {
    return this.lifecycleCallbackDepth > 0 ? Promise.resolve() : promise;
  }

  private invokeLifecycleCallback<T>(callback: () => T): T {
    this.lifecycleCallbackDepth += 1;
    try {
      return callback();
    } finally {
      this.lifecycleCallbackDepth -= 1;
    }
  }

  private assertCurrent(revision: number, controller: AbortController): void {
    if (!this.isCurrent(revision, controller)) throw new InternalAbortError();
  }

  private assertArtifactsPublishable(
    artifacts: readonly ImplementedGeneratedArtifact[]
  ): void {
    for (const artifact of artifacts) {
      if (this.disposedObjects.has(artifact.object)) {
        throw new GenerationOrchestratorError('ARTIFACT_DISPOSING');
      }
    }
  }

  private publish(state: GenerationState): void {
    this.state = freezeGenerationState(state);
    try {
      this.onStateChange(this.state);
    } catch {
      // Un observateur défaillant ne doit jamais bloquer l’ownership interne.
    }
  }

  private async waitAfterResultChange(): Promise<void> {
    try {
      const barrier = this.invokeLifecycleCallback(this.afterResultChange);
      await barrier;
    } catch {
      // La publication est déjà atomique ; une barrière UI défaillante ne doit pas fuir l’ownership.
    }
  }

  private reserveResultDisposal(result: GenerationResult): ReservedResultDisposal {
    let release: () => void = () => undefined;
    const publication = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const cleanup = publication.then(async () => {
      await this.waitAfterResultChange();
      await this.disposeResult(result);
    });
    this.pendingDisposals.add(cleanup);
    void cleanup.then(
      () => this.pendingDisposals.delete(cleanup),
      () => this.pendingDisposals.delete(cleanup)
    );
    return Object.freeze({ promise: cleanup, release });
  }

  private async waitForActiveExecutions(): Promise<void> {
    while (this.activeExecutions.size > 0) {
      await Promise.allSettled([...this.activeExecutions]);
    }
  }

  private async waitForPendingDisposals(): Promise<void> {
    while (this.pendingDisposals.size > 0) {
      await Promise.allSettled([...this.pendingDisposals]);
    }
  }

  private disposeResult(result: GenerationResult): Promise<void> {
    return this.disposeArtifacts(result.artifacts);
  }

  private async disposeArtifacts(
    artifacts: readonly ImplementedGeneratedArtifact[]
  ): Promise<void> {
    for (const artifact of artifacts) {
      const object = artifact.object;
      const currentlyOwned = this.state.result?.artifacts.some(
        (ownedArtifact) => ownedArtifact.object === object
      ) ?? false;
      if (currentlyOwned || this.disposedObjects.has(object)) continue;
      this.disposedObjects.add(object);
      let disposal: unknown;
      try {
        disposal = this.invokeLifecycleCallback(() => this.disposeObject3D(object));
      } catch {
        // Chaque objet est tenté une fois ; les autres objets doivent toujours être nettoyés.
      }
      try {
        await disposal;
      } catch {
        // Un rejet asynchrone ne doit pas interrompre le nettoyage des autres objets.
      }
    }
  }
}

export function createGenerationOrchestrator(
  options: GenerationOrchestratorOptions
): GenerationOrchestrator {
  return new GenerationOrchestrator(options);
}
