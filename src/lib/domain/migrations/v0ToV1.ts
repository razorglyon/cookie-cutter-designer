import type { DesignDocument, DesignSource } from '../designDocument';
import { DEFAULT_CUTTER_PARAMETERS_V1 } from '../designParameters';
import {
  DesignDocumentValidationError,
  parseDesignDocumentV1
} from '../documentValidation';

type UnknownRecord = Record<string, unknown>;
type LegacyFileType = 'svg' | 'png' | 'jpg';

interface LegacyMetadata {
  readonly originalFileName?: string;
  readonly fileType?: LegacyFileType;
  readonly hasNotes: boolean;
}

export interface MigrationV0ToV1Options {
  readonly createId?: () => string;
}

const LEGACY_DOCUMENT_REQUIRED_KEYS = [
  'version',
  'name',
  'createdAt',
  'modifiedAt',
  'svgData',
  'parameters'
] as const;
const LEGACY_DOCUMENT_OPTIONAL_KEYS = ['thumbnail', 'metadata'] as const;
const LEGACY_METADATA_KEYS = ['originalFileName', 'fileType', 'notes'] as const;
const CURRENT_PARAMETER_KEYS = [
  'wallThickness',
  'cuttingHeight',
  'totalHeight',
  'taperAngle',
  'targetSize',
  'sizeMode',
  'handleStyle',
  'handleHeight',
  'enableHandle',
  'enableEmbossing',
  'embossDepth',
  'buildPlateSize',
  'mode',
  'stampDepth',
  'stampBase'
] as const;
const PRE_MM_PARAMETER_KEYS = [
  'wallThickness',
  'cuttingHeight',
  'totalHeight',
  'taperAngle',
  'scale',
  'handleStyle',
  'handleHeight',
  'enableHandle',
  'enableEmbossing',
  'embossDepth',
  'buildPlateSize',
  'mode',
  'stampDepth',
  'stampBase'
] as const;

function invalid(path: string, message: string): never {
  throw new DesignDocumentValidationError(path, message);
}

function childPath(parent: string, key: string): string {
  return parent.length === 0 ? key : `${parent}.${key}`;
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(path, 'doit être un objet legacy.');
  }
  return value as UnknownRecord;
}

function requireExactKeys(
  record: UnknownRecord,
  path: string,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): void {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of requiredKeys) {
    if (!hasOwn(record, key)) {
      invalid(childPath(path, key), 'est requis.');
    }
  }

  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string') {
      invalid(path.length === 0 ? '$' : path, 'contient une propriété symbole inconnue.');
    }
    if (!allowedKeys.has(key)) {
      invalid(childPath(path, key), "n'est pas un champ legacy reconnu.");
    }
  }
}

function readString(
  record: UnknownRecord,
  key: string,
  parentPath: string,
  requireNonEmpty: boolean
): string {
  const value = record[key];
  const path = childPath(parentPath, key);
  if (
    typeof value !== 'string' ||
    (requireNonEmpty && value.trim().length === 0)
  ) {
    invalid(path, requireNonEmpty ? 'doit être une chaîne non vide.' : 'doit être une chaîne.');
  }
  return value;
}

function copyKnownKeys(
  record: UnknownRecord,
  keys: readonly string[]
): UnknownRecord {
  const copy: UnknownRecord = {};
  for (const key of keys) {
    copy[key] = record[key];
  }
  return copy;
}

function normalizeParameters(value: unknown): UnknownRecord {
  const parameters = requireRecord(value, 'parameters');
  const hasScale = hasOwn(parameters, 'scale');
  const hasTargetSize = hasOwn(parameters, 'targetSize');
  const hasSizeMode = hasOwn(parameters, 'sizeMode');

  if (hasScale && !hasTargetSize && !hasSizeMode) {
    requireExactKeys(parameters, 'parameters', PRE_MM_PARAMETER_KEYS);
    const scale = parameters.scale;
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
      invalid('parameters.scale', 'doit être un nombre fini strictement positif.');
    }

    const normalized = copyKnownKeys(
      parameters,
      PRE_MM_PARAMETER_KEYS.filter((key) => key !== 'scale')
    );
    normalized.targetSize = DEFAULT_CUTTER_PARAMETERS_V1.targetSize * scale;
    normalized.sizeMode = 'longest';
    return normalized;
  }

  requireExactKeys(parameters, 'parameters', CURRENT_PARAMETER_KEYS);
  return copyKnownKeys(parameters, CURRENT_PARAMETER_KEYS);
}

function parseMetadata(value: unknown): LegacyMetadata {
  const metadata = requireRecord(value, 'metadata');
  requireExactKeys(metadata, 'metadata', [], LEGACY_METADATA_KEYS);

  const originalFileName = hasOwn(metadata, 'originalFileName')
    ? readString(metadata, 'originalFileName', 'metadata', true)
    : undefined;

  let fileType: LegacyFileType | undefined;
  if (hasOwn(metadata, 'fileType')) {
    const candidate = metadata.fileType;
    if (candidate !== 'svg' && candidate !== 'png' && candidate !== 'jpg') {
      invalid('metadata.fileType', 'doit être svg, png ou jpg.');
    }
    fileType = candidate;
  }

  if (hasOwn(metadata, 'notes')) {
    readString(metadata, 'notes', 'metadata', false);
  }

  return {
    ...(originalFileName === undefined ? {} : { originalFileName }),
    ...(fileType === undefined ? {} : { fileType }),
    hasNotes: hasOwn(metadata, 'notes')
  };
}

function createDefaultId(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID !== 'function') {
    invalid('id', 'ne peut pas être généré : crypto.randomUUID est indisponible.');
  }
  return crypto.randomUUID();
}

function createMigrationId(createId: () => string): string {
  const id: unknown = createId();
  if (typeof id !== 'string' || id.trim().length === 0) {
    invalid('id', 'doit être une chaîne non vide.');
  }
  return id;
}

function createSource(
  name: string,
  svgData: string,
  metadata: LegacyMetadata | undefined
): DesignSource {
  const fileType = metadata?.fileType ?? 'svg';
  const fileName = metadata?.originalFileName ?? `${name}.${fileType}`;

  if (fileType === 'png' || fileType === 'jpg') {
    return {
      type: 'raster',
      fileName,
      mimeType: fileType === 'png' ? 'image/png' : 'image/jpeg',
      vectorizedSvg: svgData
    };
  }

  return { type: 'svg', fileName, svg: svgData };
}

export function migrateV0ToV1(
  value: unknown,
  options: MigrationV0ToV1Options = {}
): {
  readonly document: DesignDocument;
  readonly warnings: readonly string[];
} {
  const legacy = requireRecord(value, '$');
  requireExactKeys(
    legacy,
    '',
    LEGACY_DOCUMENT_REQUIRED_KEYS,
    LEGACY_DOCUMENT_OPTIONAL_KEYS
  );

  const version = readString(legacy, 'version', '', true);
  if (version !== '1.0.0') {
    invalid('version', 'doit être exactement 1.0.0 pour cette migration.');
  }

  const name = readString(legacy, 'name', '', true);
  const createdAt = readString(legacy, 'createdAt', '', true);
  const modifiedAt = readString(legacy, 'modifiedAt', '', true);
  const svgData = readString(legacy, 'svgData', '', true);
  const parameters = normalizeParameters(legacy.parameters);
  const mode = parameters.mode;
  if (mode !== 'cutter' && mode !== 'stamp') {
    invalid('parameters.mode', 'doit être cutter ou stamp.');
  }

  if (hasOwn(legacy, 'thumbnail')) {
    readString(legacy, 'thumbnail', '', false);
  }
  const metadata = hasOwn(legacy, 'metadata')
    ? parseMetadata(legacy.metadata)
    : undefined;

  const warnings: string[] = [];
  if (hasOwn(legacy, 'thumbnail')) {
    warnings.push(
      'thumbnail: aperçu dérivé non représentable dans DesignDocumentV1, abandonné pendant la migration.'
    );
  }
  if (metadata?.hasNotes === true) {
    warnings.push(
      'metadata.notes: notes legacy non représentables dans DesignDocumentV1, abandonnées pendant la migration.'
    );
  }

  const document = parseDesignDocumentV1({
    schemaVersion: 1,
    id: createMigrationId(options.createId ?? createDefaultId),
    name,
    kind: mode,
    source: createSource(name, svgData, metadata),
    sketch: { svg: svgData, revision: 0 },
    parameters,
    viewport: {
      showGrid: true,
      showAxes: false,
      showWallThickness: false
    },
    createdAt,
    updatedAt: modifiedAt
  });

  return { document, warnings: Object.freeze(warnings) };
}
