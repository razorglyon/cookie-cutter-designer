import { describe, expect, it } from 'vitest';
import type { DesignDocument } from '../../domain/designDocument';
import type { CookieCutterParams } from '../../types/CookieCutter';
import { documentParametersToLegacy, legacyParametersToDocument } from '../legacyDocumentAdapter';

function parameters(mode: 'cutter' | 'stamp'): CookieCutterParams {
  return {
    wallThickness: 1.7, cuttingHeight: 14.5, totalHeight: 27.25,
    taperAngle: 9.5, targetSize: 123.75, sizeMode: 'height',
    handleStyle: 'chamfered', handleHeight: 6.75, enableHandle: true,
    enableEmbossing: false, embossDepth: 4.25, buildPlateSize: 245.5,
    mode, stampDepth: 5.5, stampBase: true
  };
}

function document(mode: 'cutter' | 'stamp'): DesignDocument {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 0L10 10Z"/></svg>';
  const base = {
    schemaVersion: 1 as const, id: 'adapter-fixture', name: 'Adapter fixture',
    source: { type: 'svg' as const, fileName: 'shape.svg', svg },
    sketch: { svg, revision: 7 },
    viewport: { showGrid: false, showAxes: true, showWallThickness: false },
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z'
  };
  return mode === 'cutter'
    ? { ...base, kind: mode, parameters: { ...parameters(mode), mode } }
    : { ...base, kind: mode, parameters: { ...parameters(mode), mode } };
}

const invalidParameters: [string, (value: CookieCutterParams) => unknown][] = [
  ['missing field', ({ stampDepth: _missing, ...rest }) => rest],
  ['extra field', (value) => ({ ...value, scale: 2 })],
  ['extra symbol', (value) => ({ ...value, [Symbol('extra')]: 2 })],
  ['extra non-enumerable', (value) => Object.defineProperty({ ...value }, 'extra', { value: 2 })],
  ['inherited field', ({ stampDepth, ...rest }) => Object.assign(Object.create({ stampDepth }), rest)],
  ['NaN', (value) => ({ ...value, wallThickness: NaN })],
  ['Infinity', (value) => ({ ...value, targetSize: Infinity })],
  ['numeric string', (value) => ({ ...value, cuttingHeight: '14.5' })],
  ['out of range', (value) => ({ ...value, taperAngle: 31 })],
  ['invalid boolean', (value) => ({ ...value, stampBase: 'true' })],
  ['invalid size mode', (value) => ({ ...value, sizeMode: 'diagonal' })],
  ['invalid handle style', (value) => ({ ...value, handleStyle: 'triangle' })],
  ['unimplemented mode', (value) => ({ ...value, mode: 'imprint-cutter' })],
  ['unknown mode', (value) => ({ ...value, mode: 'unknown' })],
  ['cutter height conflict', (value) => ({ ...value, totalHeight: 1 })],
  ['enabled zero-height handle', (value) => ({ ...value, handleHeight: 0 })],
  ['unsupported embossing', (value) => ({ ...value, enableEmbossing: true })]
];

describe('legacyDocumentAdapter', () => {
  it.each(['cutter', 'stamp'] as const)('preserves every %s parameter, kind and mode in both directions', (mode) => {
    const source = document(mode);
    const before = structuredClone(source);
    const legacy = documentParametersToLegacy(source);
    const converted = legacyParametersToDocument(legacy);
    expect(legacy).toEqual(source.parameters);
    expect(converted).toEqual({ kind: mode, parameters: source.parameters });
    expect(legacy).not.toBe(source.parameters);
    expect(converted.parameters).not.toBe(legacy);
    expect(Object.isFrozen(legacy)).toBe(true);
    expect(Object.isFrozen(converted.parameters)).toBe(true);
    expect(source).toEqual(before);
    expect(Object.isFrozen(source.parameters)).toBe(false);
  });

  it('does not mutate or freeze a mutable legacy input', () => {
    const source = parameters('stamp');
    const before = { ...source };
    const result = legacyParametersToDocument(source);
    source.targetSize = 99;
    expect(result.parameters).toEqual(before);
    expect(Object.isFrozen(source)).toBe(false);
  });

  it.each(invalidParameters)('rejects %s without repair in both directions', (_label, invalidate) => {
    const value = invalidate(parameters('cutter'));
    expect(() => legacyParametersToDocument(value)).toThrow();
    const forged = { ...document('cutter'), parameters: value } as DesignDocument;
    expect(() => documentParametersToLegacy(forged)).toThrow();
  });

  it.each([null, undefined, [], 1, 'params'])('rejects non-record input %s', (value) => {
    expect(() => legacyParametersToDocument(value)).toThrow();
  });

  it.each(['imprint-cutter', 'cutter-and-stamp', 'multi-cutter', 'cutter-set', 'stencil', 'sandwich-cutter', 'cake-topper', 'cake-pop-mold', 'practice-cookie', 'unknown'])('rejects document kind %s', (kind) => {
    expect(() => documentParametersToLegacy({ ...document('cutter'), kind } as DesignDocument)).toThrow();
  });

  it('rejects kind/mode mismatch instead of changing mode', () => {
    const source = { ...document('cutter'), parameters: parameters('stamp') } as DesignDocument;
    const before = structuredClone(source);
    expect(() => documentParametersToLegacy(source)).toThrow();
    expect(source).toEqual(before);
  });

  it('rejects a stamp without its base in both directions', () => {
    const value = { ...parameters('stamp'), stampBase: false };
    expect(() => legacyParametersToDocument(value)).toThrow();
    expect(() => documentParametersToLegacy({ ...document('stamp'), parameters: value } as DesignDocument)).toThrow();
  });

  it('keeps stamp totalHeight independent of cutter heights', () => {
    const source = document('stamp');
    const value = { ...source.parameters, totalHeight: 1 };
    expect(legacyParametersToDocument(value)).toEqual({ kind: 'stamp', parameters: value });
    expect(documentParametersToLegacy({ ...source, schemaVersion: 1, kind: 'stamp', parameters: { ...value, mode: 'stamp' } })).toEqual(value);
  });

  it('accepts inactive cutter options without normalizing their stored values', () => {
    const value = { ...parameters('cutter'), enableHandle: false, handleHeight: 0, totalHeight: 14.5, stampBase: false };
    expect(legacyParametersToDocument(value)).toEqual({ kind: 'cutter', parameters: value });
  });
});
