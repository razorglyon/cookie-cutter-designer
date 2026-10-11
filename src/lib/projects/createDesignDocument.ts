import type { DesignDocumentV1, DesignSource } from '../domain/designDocument';
import type { ImplementedDesignKind } from '../domain/designKind';
import { createDefaultCutterParameters, createDefaultStampParameters } from '../domain/designParameters';
import { parseDesignDocumentV1 } from '../domain/documentValidation';

export interface CreateDesignDocumentInput {
  readonly name: string;
  readonly kind: Exclude<ImplementedDesignKind, 'multi-cutter'>;
  /** Source déjà normalisée par le pipeline d'import, jamais un blob raster. */
  readonly source: DesignSource;
}
export interface CreateDesignDocumentOptions {
  readonly now?: () => string;
  readonly createId?: () => string;
}
/** Construit un nouveau projet ; les éditions passent ensuite par le store document. */
export function createDesignDocument(
  input: CreateDesignDocumentInput,
  options: CreateDesignDocumentOptions = {}
): DesignDocumentV1 {
  const timestamp = (options.now ?? (() => new Date().toISOString()))();
  const id = (options.createId ?? (() => crypto.randomUUID()))();
  return parseDesignDocumentV1({
    schemaVersion: 1,
    id,
    name: input.name,
    kind: input.kind,
    source: input.source,
    sketch: {
      svg: input.source.type === 'svg' ? input.source.svg : input.source.vectorizedSvg,
      revision: 0
    },
    parameters: input.kind === 'cutter'
      ? createDefaultCutterParameters()
      : createDefaultStampParameters(),
    viewport: { showGrid: true, showAxes: false, showWallThickness: false },
    createdAt: timestamp,
    updatedAt: timestamp
  });
}
