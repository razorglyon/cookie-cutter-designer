import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { createDesignDocument } from '../createDesignDocument';
import { encodeProject, decodeProject } from '../projectCodec';
import { parseDesignDocument } from '../../domain/documentValidation';
import { createDesignSessionStore } from '../../stores/designSessionStore';
import { freezeGenerationState } from '../../generation/generationState';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>';
export function seriesFixture() {
  const base = createDesignDocument({ name: 'Series', kind: 'cutter', source: { type: 'svg', fileName: 'series.svg', svg } });
  return { ...base, schemaVersion: 3, kind: 'multi-cutter', bridges: [{ id: 'bridge', from: { x: 10, y: 20 }, to: { x: 30, y: 40 }, widthMm: 1 }], layout: { copies: 4, columns: 2, spacingMm: 5 } };
}

describe('persistent cutter series', () => {
  it('accepts a detached V3 series without changing its source, parameters or bridges', () => {
    const input = seriesFixture(), expected = structuredClone(input);
    const parsed = parseDesignDocument(input);
    expect(parsed).toEqual(expected);
    expect(parsed).not.toBe(input);
    expect(input).toEqual(expected);
  });
  it('round-trips the V3 envelope and retains legacy V1 exports exactly', () => {
    const input = seriesFixture();
    expect(decodeProject(encodeProject(input)).document).toEqual(input);
    expect(JSON.parse(encodeProject(input)).version).toBe(3);
    const base = createDesignDocument({ name: 'Legacy', kind: 'cutter', source: { type: 'svg', fileName: 'legacy.svg', svg } });
    expect(JSON.parse(encodeProject(base)).version).toBe(1);
    expect(decodeProject(encodeProject(base)).document).toEqual(base);
  });
  it.each([
    { copies: 0, columns: 1, spacingMm: 5 },
    { copies: 25, columns: 1, spacingMm: 5 },
    { copies: 1.5, columns: 1, spacingMm: 5 },
    { copies: 4, columns: 5, spacingMm: 5 },
    { copies: 4, columns: 1.5, spacingMm: 5 },
    { copies: 4, columns: 2, spacingMm: 0 },
    { copies: 4, columns: 2, spacingMm: Infinity },
    { copies: 4, columns: 2, spacingMm: 41 },
    { copies: 4, columns: 2, spacingMm: 5, ignored: true }
  ])('rejects invalid layout %j without mutation', layout => {
    const input = { ...seriesFixture(), layout }, expected = structuredClone(input);
    expect(() => parseDesignDocument(input)).toThrow();
    expect(input).toEqual(expected);
  });
  it('promotes in one edit, preserves identity and bridges, and returns to the original cutter', () => {
    const initial = createDesignDocument({ name: 'Original', kind: 'cutter', source: { type: 'svg', fileName: 'initial.svg', svg } });
    const session = createDesignSessionStore(initial), epoch = session.getSessionEpoch();
    session.updateBridges(seriesFixture().bridges);
    const original = session.getDocument()!;
    session.updateSeries({ copies: 4, columns: 2, spacingMm: 5 });
    expect(session.getSessionEpoch()).toBe(epoch);
    expect(session.getDocument()).toMatchObject({ schemaVersion: 3, kind: 'multi-cutter', id: original.id, source: original.source, parameters: original.parameters, bridges: seriesFixture().bridges });
    const series = session.getDocument()!;
    expect(() => session.updateSeries({ copies: 0, columns: 1, spacingMm: 5 })).toThrow();
    expect(session.getDocument()).toBe(series);
    session.restoreHistory(original, epoch);
    expect(session.getDocument()).toEqual(original);
    session.restoreHistory(series, epoch);
    session.changeKind('cutter');
    expect(session.getDocument()).toMatchObject({ schemaVersion: 2, kind: 'cutter', parameters: original.parameters, bridges: seriesFixture().bridges });
  });
  it('accepts a bridge edit on the single source while preserving the V3 arrangement', async () => {
    const sketch = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120"><path d="M0 0 L100 0 L100 100 L0 100 Z"/><path d="M35 35 L65 35 L65 65 L35 65 Z"/></svg>';
    const base = createDesignDocument({ name: 'Joined', kind: 'cutter', source: { type: 'svg', fileName: 'joined.svg', svg: sketch } });
    const bridge = { id: 'join', from: { x: 0, y: 50 }, to: { x: 35, y: 50 }, widthMm: 2 };
    const session = createDesignSessionStore({ ...base, schemaVersion: 3, kind: 'multi-cutter', bridges: [bridge], layout: { copies: 2, columns: 2, spacingMm: 5 } });
    const before = session.getDocument()!;
    const { commitBridgeEdit } = await import('../../sketch/bridgeCommands');
    expect(await commitBridgeEdit(session, before, session.getSessionEpoch(), [{ ...bridge, to: { x: 35, y: 51 } }])).toBe(true);
    expect(session.getDocument()).toMatchObject({ schemaVersion: 3, kind: 'multi-cutter', layout: { copies: 2, columns: 2, spacingMm: 5 }, bridges: [{ ...bridge, to: { x: 35, y: 51 } }] });
  });
  it('clears a rejected parameter error after a valid series adjustment through the existing UI port', async () => {
    const { writable } = await import('svelte/store');
    const { legacyParametersToDocument } = await import('../../stores/legacyDocumentAdapter');
    const { createProjectSessionIntegration } = await import('../projectSessionIntegration');
    const session = createDesignSessionStore(seriesFixture());
    const values = writable(session.getDocument()!.parameters);
    const errors: unknown[] = [];
    const integration = createProjectSessionIntegration({ session,
      generation: { schedule: () => 1, cancel: () => {} }, legacy: { params: values, setParams: value => values.set(legacyParametersToDocument(value).parameters) },
      clearHistory: () => {}, invalidateSource: () => {}, projectViewport: () => {}, onParameterError: error => errors.push(error) });
    try {
      expect(integration.acceptLegacyParameterChange({ ...session.getDocument()!.parameters, wallThickness: 0 })).toBe(false);
      expect(errors.at(-1)).not.toBeNull();
      expect(integration.acceptLegacyParameterChange({ ...session.getDocument()!.parameters, wallThickness: 1.4 })).toBe(true);
      expect(errors.at(-1)).toBeNull();
      expect(session.getDocument()).toMatchObject({ kind: 'multi-cutter', layout: seriesFixture().layout, parameters: { wallThickness: 1.4 } });
    } finally { integration.dispose(); }
  });
  it('keeps legacy schemas frozen: a multi-cutter cannot masquerade as V1/V2', () => {
    const input = seriesFixture();
    expect(() => parseDesignDocument({ ...input, schemaVersion: 1 })).toThrow();
    expect(() => parseDesignDocument({ ...input, schemaVersion: 2 })).toThrow();
    expect(() => decodeProject(JSON.stringify({ format: 'cookie-cutter-designer-project', version: 4, document: input, future: true }))).toThrow(/future/);
  });
  it('preserves and deeply freezes series fields in session, edits and generation snapshots', () => {
    const input = seriesFixture();
    const session = createDesignSessionStore(input);
    session.rename('Renamed');
    session.updateParameters('multi-cutter', { wallThickness: 1.4 });
    const current = session.getDocument()!;
    const state = freezeGenerationState({ phase: 'scheduled', revision: 1, requestedDocument: current, result: null, error: null });
    expect(state.requestedDocument).toEqual(current);
    const snapshot = state.requestedDocument as unknown as ReturnType<typeof seriesFixture>;
    expect(snapshot.layout).toEqual(input.layout);
    expect(snapshot.bridges).toEqual(input.bridges);
    expect(Object.isFrozen(snapshot.layout)).toBe(true);
    expect(Object.isFrozen(snapshot.bridges[0].from)).toBe(true);
    expect(get(session)?.source).toEqual(input.source);
  });
});
