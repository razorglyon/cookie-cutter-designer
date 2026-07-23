import type { DesignDocumentV1 } from '../domain/designDocument';
import type { GeneratedArtifact } from '../domain/generatedArtifact';
import type { ImplementedDesignKind } from '../domain/designKind';

export type ImplementedDesignDocument<K extends ImplementedDesignKind = ImplementedDesignKind> = {
  [Kind in K]: DesignDocumentV1<Kind>;
}[K];

export type ImplementedGeneratedArtifact<
  K extends ImplementedDesignKind = ImplementedDesignKind
> = {
  [Kind in K]: GeneratedArtifact<Kind>;
}[K];

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type GenerationResult<K extends ImplementedDesignKind = ImplementedDesignKind> = {
  [Kind in K]: Readonly<{
    revision: number;
    document: DesignDocumentV1<Kind>;
    artifacts: NonEmptyReadonlyArray<GeneratedArtifact<Kind>>;
  }>;
}[K];

export type GenerationPhase =
  | 'idle'
  | 'scheduled'
  | 'generating'
  | 'ready'
  | 'error'
  | 'disposed';

export interface PublicGenerationError {
  readonly revision: number;
  readonly message: string;
  readonly code?: string;
}

interface IdleGenerationState {
  readonly phase: 'idle';
  readonly revision: number;
  readonly requestedDocument: null;
  readonly result: null;
  readonly error: null;
}

interface PendingGenerationState {
  readonly phase: 'scheduled' | 'generating';
  readonly revision: number;
  readonly requestedDocument: ImplementedDesignDocument;
  /** Dernier résultat valide, conservé pendant une nouvelle tentative. */
  readonly result: GenerationResult | null;
  readonly error: null;
}

export type ReadyGenerationState<
  K extends ImplementedDesignKind = ImplementedDesignKind
> = {
  [Kind in K]: Readonly<{
    phase: 'ready';
    revision: number;
    requestedDocument: DesignDocumentV1<Kind>;
    result: GenerationResult<Kind>;
    error: null;
  }>;
}[K];

interface ErrorGenerationState {
  readonly phase: 'error';
  readonly revision: number;
  readonly requestedDocument: ImplementedDesignDocument | null;
  /** Dernier résultat valide, conservé après l’échec courant. */
  readonly result: GenerationResult | null;
  readonly error: PublicGenerationError;
}

interface DisposedGenerationState {
  readonly phase: 'disposed';
  readonly revision: number;
  readonly requestedDocument: null;
  readonly result: null;
  readonly error: null;
}

export type GenerationState =
  | IdleGenerationState
  | PendingGenerationState
  | ReadyGenerationState
  | ErrorGenerationState
  | DisposedGenerationState;

function cloneDocument(document: ImplementedDesignDocument): ImplementedDesignDocument {
  const source = document.source.type === 'svg'
    ? Object.freeze({ ...document.source })
    : Object.freeze({ ...document.source });
  const common = {
    schemaVersion: 1 as const,
    id: document.id,
    name: document.name,
    source,
    sketch: Object.freeze({ ...document.sketch }),
    viewport: Object.freeze({ ...document.viewport }),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };

  return document.kind === 'cutter'
    ? Object.freeze({
        ...common,
        kind: 'cutter' as const,
        parameters: Object.freeze({ ...document.parameters })
      })
    : Object.freeze({
        ...common,
        kind: 'stamp' as const,
        parameters: Object.freeze({ ...document.parameters })
      });
}

function cloneArtifact(
  artifact: ImplementedGeneratedArtifact
): ImplementedGeneratedArtifact {
  const bounds = artifact.validation.bounds === null
    ? null
    : Object.freeze({
        min: Object.freeze({ ...artifact.validation.bounds.min }),
        max: Object.freeze({ ...artifact.validation.bounds.max })
      });

  return Object.freeze({
    id: artifact.id,
    role: artifact.role,
    object: artifact.object,
    dimensionsMm: Object.freeze({ ...artifact.dimensionsMm }),
    validation: Object.freeze({
      ...artifact.validation,
      errors: Object.freeze([...artifact.validation.errors]),
      warnings: Object.freeze([...artifact.validation.warnings]),
      bounds
    })
  });
}

function cloneResult(
  result: GenerationResult,
  requestedSource: ImplementedDesignDocument | null,
  requestedClone: ImplementedDesignDocument | null
): GenerationResult {
  const document = requestedSource !== null
    && requestedClone !== null
    && result.document === requestedSource
    ? requestedClone
    : cloneDocument(result.document);
  const [first, ...rest] = result.artifacts;
  const artifacts = Object.freeze([
    cloneArtifact(first),
    ...rest.map(cloneArtifact)
  ]) as NonEmptyReadonlyArray<ImplementedGeneratedArtifact>;

  return Object.freeze({
    revision: result.revision,
    document,
    artifacts
  }) as GenerationResult;
}

function cloneError(error: PublicGenerationError): PublicGenerationError {
  return error.code === undefined
    ? Object.freeze({ revision: error.revision, message: error.message })
    : Object.freeze({ revision: error.revision, message: error.message, code: error.code });
}

function isCutterResult(
  result: GenerationResult
): result is GenerationResult<'cutter'> {
  return result.document.kind === 'cutter';
}

export function createReadyGenerationState(
  revision: number,
  result: GenerationResult
): ReadyGenerationState {
  if (isCutterResult(result)) {
    return Object.freeze({
      phase: 'ready',
      revision,
      requestedDocument: result.document,
      result,
      error: null
    });
  }

  return Object.freeze({
    phase: 'ready',
    revision,
    requestedDocument: result.document,
    result,
    error: null
  });
}

export function freezeGenerationState(state: GenerationState): GenerationState {
  switch (state.phase) {
    case 'idle':
      return Object.freeze({ ...state });
    case 'scheduled':
    case 'generating': {
      const requestedDocument = cloneDocument(state.requestedDocument);
      const result = state.result === null
        ? null
        : cloneResult(state.result, state.requestedDocument, requestedDocument);
      return Object.freeze({ ...state, requestedDocument, result });
    }
    case 'ready': {
      const requestedDocument = cloneDocument(state.requestedDocument);
      const result = cloneResult(state.result, state.requestedDocument, requestedDocument);
      return createReadyGenerationState(state.revision, result);
    }
    case 'error': {
      const requestedDocument = state.requestedDocument === null
        ? null
        : cloneDocument(state.requestedDocument);
      const result = state.result === null
        ? null
        : cloneResult(state.result, state.requestedDocument, requestedDocument);
      return Object.freeze({
        ...state,
        requestedDocument,
        result,
        error: cloneError(state.error)
      });
    }
    case 'disposed':
      return Object.freeze({ ...state });
  }
}

export function createInitialGenerationState(): GenerationState {
  return freezeGenerationState({
    phase: 'idle',
    revision: 0,
    requestedDocument: null,
    result: null,
    error: null
  });
}

export function isGenerationPending(state: GenerationState): boolean {
  return state.phase === 'scheduled' || state.phase === 'generating';
}
