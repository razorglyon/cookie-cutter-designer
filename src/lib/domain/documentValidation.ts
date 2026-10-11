import type {
  DesignDocument,
  DesignDocumentV1,
  DesignDocumentV2,
  Bridge,
  DesignSource,
  RasterMimeType,
  SketchDocument,
  ViewportPreferences
} from './designDocument';
import { CUTTER_SERIES_LIMITS } from './cutterSeries';
import { isDesignKind } from './designKind';
import type {
  CutterDesignParameters,
  DesignHandleStyleV1,
  DesignSizeModeV1,
  StampDesignParameters
} from './designParameters';
import { validateSafeSvg } from './svgSafety';
import { DesignDocumentValidationError } from './validationError';

export { DesignDocumentValidationError };

type UnknownRecord = Record<string, unknown>;

const DOCUMENT_KEYS = [
  'schemaVersion',
  'id',
  'name',
  'kind',
  'source',
  'sketch',
  'parameters',
  'viewport',
  'createdAt',
  'updatedAt'
] as const;
const SVG_SOURCE_KEYS = ['type', 'fileName', 'svg'] as const;
const RASTER_SOURCE_KEYS = [
  'type',
  'fileName',
  'mimeType',
  'vectorizedSvg'
] as const;
const SKETCH_KEYS = ['svg', 'revision'] as const;
const VIEWPORT_KEYS = ['showGrid', 'showAxes', 'showWallThickness'] as const;
const PARAMETER_KEYS = [
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
] as const satisfies readonly (keyof CutterDesignParameters)[];
const SIZE_MODES = [
  'longest',
  'width',
  'height'
] as const satisfies readonly DesignSizeModeV1[];
const HANDLE_STYLES = [
  'round',
  'chamfered',
  'rectangular',
  'flat',
  'none'
] as const satisfies readonly DesignHandleStyleV1[];
const PARAMETER_MODES = ['cutter', 'stamp'] as const;

export const DESIGN_DOCUMENT_V1_LIMITS = Object.freeze({
  wallThickness: Object.freeze({ minimum: 0.4, maximum: 10 }),
  cuttingHeight: Object.freeze({ minimum: 1, maximum: 100 }),
  totalHeight: Object.freeze({ minimum: 1, maximum: 150 }),
  taperAngle: Object.freeze({ minimum: 0, maximum: 30 }),
  targetSize: Object.freeze({ minimum: 10, maximum: 1000 }),
  handleHeight: Object.freeze({ minimum: 0, maximum: 100 }),
  buildPlateSize: Object.freeze({ minimum: 20, maximum: 1000 }),
  embossDepth: Object.freeze({ minimum: 0, maximum: 20 }),
  stampDepth: Object.freeze({ minimum: 0.1, maximum: 50 })
} as const);

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

function invalid(path: string, message: string): never {
  throw new DesignDocumentValidationError(path, message);
}

function childPath(parent: string, key: string): string {
  return parent.length === 0 ? key : `${parent}.${key}`;
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(path, 'doit être un objet.');
  }

  return value as UnknownRecord;
}

function requireExactKeys(
  record: UnknownRecord,
  path: string,
  expectedKeys: readonly string[]
): void {
  const expected = new Set(expectedKeys);

  for (const key of expectedKeys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      invalid(childPath(path, key), 'est requis.');
    }
  }

  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string') {
      invalid(path.length === 0 ? '$' : path, 'contient une propriété symbole inconnue.');
    }
    if (!expected.has(key)) {
      invalid(childPath(path, key), "n'est pas un champ reconnu.");
    }
  }
}

function readNonEmptyString(
  record: UnknownRecord,
  key: string,
  parentPath: string
): string {
  const value = record[key];
  const path = childPath(parentPath, key);

  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(path, 'doit être une chaîne non vide.');
  }

  return value;
}

function readBoolean(
  record: UnknownRecord,
  key: string,
  parentPath: string
): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    invalid(childPath(parentPath, key), 'doit être un booléen.');
  }
  return value;
}

function readFiniteNumber(
  record: UnknownRecord,
  key: string,
  parentPath: string
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(childPath(parentPath, key), 'doit être un nombre fini.');
  }
  return value;
}


function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidIsoTimestamp(value: string): boolean {
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  const daysByMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];
  const daysInMonth = daysByMonth[month - 1];

  return (
    month >= 1 &&
    month <= 12 &&
    daysInMonth !== undefined &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 14 &&
    offsetMinute <= 59 &&
    (offsetHour < 14 || offsetMinute === 0) &&
    Number.isFinite(Date.parse(value))
  );
}

function readIsoTimestamp(
  record: UnknownRecord,
  key: 'createdAt' | 'updatedAt'
): { value: string; epochMilliseconds: number } {
  const value = record[key];
  if (typeof value !== 'string' || !isValidIsoTimestamp(value)) {
    invalid(key, 'doit être un horodatage ISO 8601 valide avec fuseau horaire.');
  }

  return { value, epochMilliseconds: Date.parse(value) };
}

function readRasterMimeType(record: UnknownRecord): RasterMimeType {
  const value = record.mimeType;
  if (
    value !== 'image/png' &&
    value !== 'image/jpeg' &&
    value !== 'image/webp'
  ) {
    invalid('source.mimeType', 'doit être image/png, image/jpeg ou image/webp.');
  }
  return value;
}

function parseSource(value: unknown): DesignSource {
  const record = requireRecord(value, 'source');
  const type = record.type;

  if (type === 'svg') {
    requireExactKeys(record, 'source', SVG_SOURCE_KEYS);
    return {
      type: 'svg',
      fileName: readNonEmptyString(record, 'fileName', 'source'),
      svg: validateSafeSvg(
        readNonEmptyString(record, 'svg', 'source'),
        'source.svg'
      )
    };
  }

  if (type === 'raster') {
    requireExactKeys(record, 'source', RASTER_SOURCE_KEYS);
    return {
      type: 'raster',
      fileName: readNonEmptyString(record, 'fileName', 'source'),
      mimeType: readRasterMimeType(record),
      vectorizedSvg: validateSafeSvg(
        readNonEmptyString(record, 'vectorizedSvg', 'source'),
        'source.vectorizedSvg'
      )
    };
  }

  invalid('source.type', 'doit être svg ou raster.');
}

function parseSketch(value: unknown): SketchDocument {
  const record = requireRecord(value, 'sketch');
  requireExactKeys(record, 'sketch', SKETCH_KEYS);
  const revision = readFiniteNumber(record, 'revision', 'sketch');

  if (!Number.isSafeInteger(revision) || revision < 0) {
    invalid('sketch.revision', 'doit être un entier positif ou nul.');
  }

  return {
    svg: validateSafeSvg(readNonEmptyString(record, 'svg', 'sketch'), 'sketch.svg'),
    revision
  };
}

function parseViewport(value: unknown): ViewportPreferences {
  const record = requireRecord(value, 'viewport');
  requireExactKeys(record, 'viewport', VIEWPORT_KEYS);

  return {
    showGrid: readBoolean(record, 'showGrid', 'viewport'),
    showAxes: readBoolean(record, 'showAxes', 'viewport'),
    showWallThickness: readBoolean(record, 'showWallThickness', 'viewport')
  };
}

function readParameterEnum<TValue extends string>(
  record: UnknownRecord,
  key: string,
  allowedValues: readonly TValue[]
): TValue {
  const value = record[key];
  if (
    typeof value !== 'string' ||
    !allowedValues.some((allowedValue) => allowedValue === value)
  ) {
    invalid(
      childPath('parameters', key),
      `doit être une des valeurs suivantes : ${allowedValues.join(', ')}.`
    );
  }
  return value as TValue;
}

function requireParameterRange(
  key: string,
  value: number,
  limits: Readonly<{ minimum: number; maximum: number }>
): void {
  if (value < limits.minimum || value > limits.maximum) {
    invalid(
      childPath('parameters', key),
      `doit être compris entre ${limits.minimum} et ${limits.maximum}, bornes incluses.`
    );
  }
}

function parseParameters(
  value: unknown
): CutterDesignParameters | StampDesignParameters {
  const record = requireRecord(value, 'parameters');
  requireExactKeys(record, 'parameters', PARAMETER_KEYS);

  const wallThickness = readFiniteNumber(record, 'wallThickness', 'parameters');
  const cuttingHeight = readFiniteNumber(record, 'cuttingHeight', 'parameters');
  const totalHeight = readFiniteNumber(record, 'totalHeight', 'parameters');
  const taperAngle = readFiniteNumber(record, 'taperAngle', 'parameters');
  const targetSize = readFiniteNumber(record, 'targetSize', 'parameters');
  const sizeMode = readParameterEnum(record, 'sizeMode', SIZE_MODES);
  const handleStyle = readParameterEnum(record, 'handleStyle', HANDLE_STYLES);
  const handleHeight = readFiniteNumber(record, 'handleHeight', 'parameters');
  const enableHandle = readBoolean(record, 'enableHandle', 'parameters');
  const enableEmbossing = readBoolean(record, 'enableEmbossing', 'parameters');
  const embossDepth = readFiniteNumber(record, 'embossDepth', 'parameters');
  const buildPlateSize = readFiniteNumber(record, 'buildPlateSize', 'parameters');
  const mode = readParameterEnum(record, 'mode', PARAMETER_MODES);
  const stampDepth = readFiniteNumber(record, 'stampDepth', 'parameters');
  const stampBase = readBoolean(record, 'stampBase', 'parameters');

  requireParameterRange(
    'wallThickness',
    wallThickness,
    DESIGN_DOCUMENT_V1_LIMITS.wallThickness
  );
  requireParameterRange(
    'cuttingHeight',
    cuttingHeight,
    DESIGN_DOCUMENT_V1_LIMITS.cuttingHeight
  );
  requireParameterRange(
    'totalHeight',
    totalHeight,
    DESIGN_DOCUMENT_V1_LIMITS.totalHeight
  );
  requireParameterRange(
    'taperAngle',
    taperAngle,
    DESIGN_DOCUMENT_V1_LIMITS.taperAngle
  );
  requireParameterRange('targetSize', targetSize, DESIGN_DOCUMENT_V1_LIMITS.targetSize);
  requireParameterRange(
    'handleHeight',
    handleHeight,
    DESIGN_DOCUMENT_V1_LIMITS.handleHeight
  );
  requireParameterRange(
    'buildPlateSize',
    buildPlateSize,
    DESIGN_DOCUMENT_V1_LIMITS.buildPlateSize
  );
  requireParameterRange(
    'embossDepth',
    embossDepth,
    DESIGN_DOCUMENT_V1_LIMITS.embossDepth
  );
  requireParameterRange('stampDepth', stampDepth, DESIGN_DOCUMENT_V1_LIMITS.stampDepth);

  const parameters = {
    wallThickness,
    cuttingHeight,
    totalHeight,
    taperAngle,
    targetSize,
    sizeMode,
    handleStyle,
    handleHeight,
    enableHandle,
    enableEmbossing,
    embossDepth,
    buildPlateSize,
    stampDepth,
    stampBase
  };

  return mode === 'cutter'
    ? { ...parameters, mode }
    : { ...parameters, mode };
}

function parseCutterParameters(value: unknown): CutterDesignParameters {
  const parameters = parseParameters(value);
  if (parameters.mode !== 'cutter') {
    invalid('parameters.mode', 'doit être cutter lorsque kind vaut cutter.');
  }
  if (parameters.totalHeight < parameters.cuttingHeight) {
    invalid(
      'parameters.totalHeight',
      'doit être supérieur ou égal à parameters.cuttingHeight pour un Cutter.'
    );
  }
  if (
    parameters.enableHandle &&
    parameters.handleStyle !== 'none' &&
    parameters.totalHeight <
      parameters.cuttingHeight + parameters.handleHeight
  ) {
    invalid(
      'parameters.totalHeight',
      'doit être supérieur ou égal à parameters.cuttingHeight + parameters.handleHeight lorsque la poignée est active.'
    );
  }
  return parameters;
}

function parseStampParameters(value: unknown): StampDesignParameters {
  const parameters = parseParameters(value);
  if (parameters.mode !== 'stamp') {
    invalid('parameters.mode', 'doit être stamp lorsque kind vaut stamp.');
  }
  if (!parameters.stampBase) {
    invalid(
      'parameters.stampBase',
      'doit valoir true pour relier toutes les zones de relief en mode Stamp.'
    );
  }
  return parameters;
}


function assertUnreachable(value: never): never {
  invalid('kind', `kind non pris en charge: ${String(value)}.`);
}

export function parseDesignDocumentV1(value: unknown): DesignDocumentV1 {
  const record = requireRecord(value, '$');
  requireExactKeys(record, '', DOCUMENT_KEYS);

  if (record.schemaVersion !== 1) {
    invalid('schemaVersion', 'doit être exactement 1.');
  }

  const id = readNonEmptyString(record, 'id', '');
  const name = readNonEmptyString(record, 'name', '');
  if (!isDesignKind(record.kind)) {
    invalid('kind', "n'est pas un type de design reconnu.");
  }
  if (record.kind !== 'cutter' && record.kind !== 'stamp') {
    invalid('kind', 'est un type de design reconnu mais pas encore implémenté.');
  }
  const kind = record.kind;
  const source = parseSource(record.source);
  const sketch = parseSketch(record.sketch);
  const viewport = parseViewport(record.viewport);
  const createdAt = readIsoTimestamp(record, 'createdAt');
  const updatedAt = readIsoTimestamp(record, 'updatedAt');

  if (updatedAt.epochMilliseconds < createdAt.epochMilliseconds) {
    invalid('updatedAt', 'doit être postérieur ou égal à createdAt.');
  }

  const base = {
    schemaVersion: 1 as const,
    id,
    name,
    source,
    sketch,
    viewport,
    createdAt: createdAt.value,
    updatedAt: updatedAt.value
  };

  switch (kind) {
    case 'cutter':
      return {
        ...base,
        kind: 'cutter',
        parameters: parseCutterParameters(record.parameters)
      };
    case 'stamp':
      return {
        ...base,
        kind: 'stamp',
        parameters: parseStampParameters(record.parameters)
      };
    default:
      return assertUnreachable(kind);
  }
}

const V2_DOCUMENT_KEYS = [...DOCUMENT_KEYS, 'bridges'] as const;
const BRIDGE_KEYS = ['id', 'from', 'to', 'widthMm'] as const;
const POINT_KEYS = ['x', 'y'] as const;
export const BRIDGE_LIMITS = Object.freeze({ maxCount: 32, minWidthMm: 0.8, maxWidthMm: 10, maxCoordinate: 1_000_000 });

function parseBridgePoint(value: unknown, path: string): Bridge['from'] {
  const record = requireRecord(value, path);
  requireExactKeys(record, path, POINT_KEYS);
  const x = readFiniteNumber(record, 'x', path);
  const y = readFiniteNumber(record, 'y', path);
  if (Math.abs(x) > BRIDGE_LIMITS.maxCoordinate) invalid(`${path}.x`, 'coordonnée hors limite.');
  if (Math.abs(y) > BRIDGE_LIMITS.maxCoordinate) invalid(`${path}.y`, 'coordonnée hors limite.');
  return { x, y };
}

function parseBridges(value: unknown, kind: DesignDocument['kind']): readonly Bridge[] {
  if (!Array.isArray(value)) invalid('bridges', 'doit être un tableau.');
  if (value.length > BRIDGE_LIMITS.maxCount) invalid('bridges', 'trop de ponts.');
  if (kind !== 'cutter' && value.length > 0) invalid('bridges', 'réservé aux emporte-pièces.');
  const ids = new Set<string>();
  return value.map((item: unknown, index: number) => {
    const path = `bridges.${index}`;
    const record = requireRecord(item, path);
    requireExactKeys(record, path, BRIDGE_KEYS);
    const id = readNonEmptyString(record, 'id', path);
    if (ids.has(id)) invalid(`${path}.id`, 'identifiant de pont dupliqué.');
    ids.add(id);
    const from = parseBridgePoint(record.from, `${path}.from`);
    const to = parseBridgePoint(record.to, `${path}.to`);
    if (Math.hypot(from.x - to.x, from.y - to.y) < 0.001) invalid(`${path}.to`, 'les extrémités doivent être distinctes.');
    const widthMm = readFiniteNumber(record, 'widthMm', path);
    if (widthMm < BRIDGE_LIMITS.minWidthMm || widthMm > BRIDGE_LIMITS.maxWidthMm) {
      invalid(`${path}.widthMm`, 'largeur physique hors limites.');
    }
    return { id, from, to, widthMm };
  });
}

/** V2 is strict, reconstructs every value, and never mutates the input. */
export function parseDesignDocumentV2(value: unknown): DesignDocumentV2 {
  const record = requireRecord(value, '$');
  if (record.schemaVersion !== 2) invalid('schemaVersion', 'doit être exactement 2.');
  requireExactKeys(record, '', V2_DOCUMENT_KEYS);
  const { bridges: rawBridges, ...legacyFields } = record;
  const base = parseDesignDocumentV1({ ...legacyFields, schemaVersion: 1 });
  // The V1 parser must never see the V2-only field.
  const bridges = parseBridges(rawBridges, base.kind);
  return { ...base, schemaVersion: 2, bridges } as DesignDocumentV2;
}

/** Strict V3 input; reuse frozen V2 Cutter fields rather than loosening legacy parsers. */
export function parseMultiCutterDocument(value: unknown): import('./designDocument').MultiCutterDocument {
  const record = requireRecord(value, '$');
  if (record.schemaVersion !== 3) invalid('schemaVersion', 'doit être exactement 3.');
  if (record.kind !== 'multi-cutter') invalid('kind', 'doit être multi-cutter en V3.');
  requireExactKeys(record, '', [...V2_DOCUMENT_KEYS, 'layout']);
  const { layout: rawLayout, ...fields } = record;
  const base = parseDesignDocumentV2({ ...fields, schemaVersion: 2, kind: 'cutter' });
  if (base.kind !== 'cutter') invalid('kind', 'Cutter requis.');
  const layout = requireRecord(rawLayout, 'layout');
  requireExactKeys(layout, 'layout', ['copies', 'columns', 'spacingMm']);
  const copies = readFiniteNumber(layout, 'copies', 'layout');
  const columns = readFiniteNumber(layout, 'columns', 'layout');
  const spacingMm = readFiniteNumber(layout, 'spacingMm', 'layout');
  if (!Number.isInteger(copies) || copies < 1 || copies > CUTTER_SERIES_LIMITS.maxCopies) invalid('layout.copies', 'entier de 1 à 24 requis.');
  if (!Number.isInteger(columns) || columns < 1 || columns > copies) invalid('layout.columns', 'entier de 1 au nombre de copies requis.');
  if (spacingMm < CUTTER_SERIES_LIMITS.minSpacingMm || spacingMm > CUTTER_SERIES_LIMITS.maxSpacingMm) invalid('layout.spacingMm', 'espacement de 0,5 à 40 mm requis.');
  return { ...base, schemaVersion: 3, kind: 'multi-cutter', layout: { copies, columns, spacingMm } };
}

/** Route by header before checking version-specific fields. V1 remains unchanged. */
export function parseDesignDocument(value: unknown): DesignDocument {
  const record = requireRecord(value, '$');
  if (record.schemaVersion === 1) return parseDesignDocumentV1(value);
  if (record.schemaVersion === 2) return parseDesignDocumentV2(value);
  if (record.schemaVersion === 3) return parseMultiCutterDocument(value);
  invalid('schemaVersion', 'version de document non prise en charge.');
}