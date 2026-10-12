import { describe, expect, it } from 'vitest';
import { createDefaultCutterParameters } from '../designParameters';
import { parseDesignDocument, parseDesignDocumentV2 } from '../documentValidation';
import { migrateV1ToV2 } from '../migrations/v1ToV2';

const svg = '<svg viewBox="0 0 100 100"><path d="M0 0L100 0L100 100L0 100Z"/></svg>';
function legacy() {
  return { schemaVersion: 1, id: 'old', name: 'Old', kind: 'cutter', source: { type: 'svg', fileName: 'old.svg', svg }, sketch: { svg, revision: 2 }, parameters: createDefaultCutterParameters(), viewport: { showGrid: true, showAxes: false, showWallThickness: false }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };
}
const bridge = { id: 'one', from: { x: 0, y: 50 }, to: { x: 40, y: 50 }, widthMm: 2 };

describe('DesignDocument V2 / migration explicite', () => {
  it('garde V1 strict et migre par copie sans modifier identité, SVG, paramètres, dates', () => {
    const old = legacy(); const before = structuredClone(old);
    const migrated = migrateV1ToV2(old);
    expect(old).toEqual(before);
    expect(migrated).toEqual({ ...old, schemaVersion: 2, bridges: [] });
    expect(parseDesignDocument(old)).toEqual(old);
    expect(parseDesignDocumentV2(migrated)).toEqual(migrated);
  });
  it('valide strictement les ponts et retourne une copie profonde sans références d’entrée', () => {
    const input = { ...migrateV1ToV2(legacy()), bridges: [bridge] };
    const parsed = parseDesignDocumentV2(input);
    expect(parsed).toEqual(input);
    expect(parsed.bridges).not.toBe(input.bridges);
    expect(parsed.bridges[0].from).not.toBe(input.bridges[0].from);
    for (const invalid of [
      { ...bridge, widthMm: 0 }, { ...bridge, widthMm: Infinity },
      { ...bridge, to: { x: 0, y: 50 } }, { ...bridge, extra: 'data' },
      { ...bridge, from: { x: NaN, y: 50 } }
    ]) expect(() => parseDesignDocumentV2({ ...input, bridges: [invalid] })).toThrow();
    expect(() => parseDesignDocumentV2({ ...input, bridges: [bridge, bridge] })).toThrow();
    expect(() => parseDesignDocumentV2({ ...input, futureField: true })).toThrow();
    expect(() => parseDesignDocument({ ...input, schemaVersion: 5, futureField: true })).toThrow(/schemaVersion/);
    expect(() => parseDesignDocumentV2({ ...input, kind: 'stamp', parameters: { ...input.parameters, mode: 'stamp', stampBase: true } })).toThrow(/bridges/);
  });
});
