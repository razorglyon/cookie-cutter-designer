import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateCookieCutter } from '../../utils/cookieCutterGenerator';
import { validatePrintableObject } from '../../utils/geometryValidation';
import { disposeObject3D } from '../../utils/disposeThree';
import { createDesignSessionStore } from '../../stores/designSessionStore';
import { createDefaultCutterParameters } from '../../domain/designParameters';
import type { DesignDocumentV1, Bridge } from '../../domain/designDocument';
import { installSvgLoaderDomParserAdapter } from '../../utils/__tests__/svgDomTestSupport';
const ISLAND_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120"><path d="M0 0 L100 0 L100 100 L0 100 Z"/><path d="M35 35 L65 35 L65 65 L35 65 Z"/></svg>';
const ISLAND_BRIDGE: Bridge = { id: 'bridge-1', from: { x: 0, y: 50 }, to: { x: 35, y: 50 }, widthMm: 2 };
import { commitBridgeEdit, snapBridgeEndpoint } from '../bridgeCommands';

let restore: (() => void) | undefined;
beforeAll(() => { restore = installSvgLoaderDomParserAdapter(); });
afterAll(() => restore?.());
function sample(svgString = ISLAND_SVG): DesignDocumentV1<'cutter'> {
  return { schemaVersion: 1, kind: 'cutter', id: 'sample', name: 'Sample', source: { type: 'svg', fileName: 'island.svg', svg: svgString },
    sketch: { svg: svgString, revision: 0 }, parameters: createDefaultCutterParameters(),
    viewport: { showGrid: true, showAxes: false, showWallThickness: false },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
}

describe('bridge editing command', () => {
  it('snaps near either contour and refuses a click far away', () => {
    expect(snapBridgeEndpoint(ISLAND_SVG, { x: 1, y: 50 })).toEqual({ x: 0, y: 50 });
    expect(snapBridgeEndpoint(ISLAND_SVG, { x: 34, y: 50 })).toEqual({ x: 35, y: 50 });
    expect(() => snapBridgeEndpoint(ISLAND_SVG, { x: -9, y: -9 })).toThrow();
  });
  it('adds and moves with exactly one mutation, rejects invalid moves without losing the original', async () => {
    const session = createDesignSessionStore(sample());
    const original = session.getDocument()!;
    expect(await commitBridgeEdit(session, original, session.getSessionEpoch(), [ISLAND_BRIDGE])).toBe(true);
    expect(session.getDocument()).toMatchObject({ schemaVersion: 2, bridges: [ISLAND_BRIDGE] });
    const current = session.getDocument()!;
    const moved: Bridge = { ...ISLAND_BRIDGE, from: { x: 0, y: 48 }, to: { x: 35, y: 48 } };
    expect(await commitBridgeEdit(session, current, session.getSessionEpoch(), [moved])).toBe(true);
    const latest = session.getDocument()!;
    await expect(commitBridgeEdit(session, latest, session.getSessionEpoch(), [{ ...moved, to: { x: 300, y: 48 } }])).rejects.toThrow();
    expect(session.getDocument()).toBe(latest);
    expect(await commitBridgeEdit(session, latest, session.getSessionEpoch(), [])).toBe(true);
    expect(session.getDocument()).toMatchObject({ schemaVersion: 2, bridges: [] });
  }, 30000);
  it('conserve le premier pont d’une chaîne incomplète sans exporter de géométrie, puis valide le second', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120"><path d="M0 0 L100 0 L100 100 L0 100 Z"/><path d="M25 25 L75 25 L75 75 L25 75 Z"/><path d="M40 40 L60 40 L60 60 L40 60 Z"/></svg>';
    const session = createDesignSessionStore(sample(svg));
    const epoch = session.getSessionEpoch();
    const first: Bridge = { id: 'outer-middle', from: { x: 0, y: 50 }, to: { x: 25, y: 50 }, widthMm: 2 };
    const second: Bridge = { id: 'middle-inner', from: { x: 25, y: 50 }, to: { x: 40, y: 50 }, widthMm: 2 };
    const onIncomplete = vi.fn();
    const baseline = session.getDocument()!;
    expect(await commitBridgeEdit(session, baseline, epoch, [first], () => true, onIncomplete)).toBe(true);
    expect(onIncomplete).toHaveBeenCalledTimes(1);
    const pending = session.getDocument()!;
    expect(pending).toMatchObject({ schemaVersion: 2, bridges: [first] });
    await expect(generateCookieCutter(svg, baseline.parameters, [first])).rejects.toThrow(/disconnected/);
    await expect(commitBridgeEdit(session, pending, epoch, [first, { ...first, id: 'overlap' }])).rejects.toThrow(/intersect/);
    expect(session.getDocument()).toBe(pending);
    expect(await commitBridgeEdit(session, pending, epoch, [first, second])).toBe(true);
    expect(onIncomplete).toHaveBeenCalledTimes(1);
    const complete = session.getDocument()!;
    const model = await generateCookieCutter(svg, baseline.parameters, [first, second]);
    try { expect(validatePrintableObject(model, { requireSingleShell: true }).valid).toBe(true); }
    finally { disposeObject3D(model); }
    session.restoreHistory(pending, epoch);
    expect(session.getDocument()).toEqual(pending);
    session.restoreHistory(complete, epoch);
    expect(session.getDocument()).toEqual(complete);
    // Replacing the sketch can orphan both saved endpoints. Clearing all must
    // still work even when deleting only one leaves the other invalid.
    session.updateSketch('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120"><path d="M0 0 L100 0 L100 100 L0 100 Z"/></svg>');
    const stale = session.getDocument()!;
    await expect(commitBridgeEdit(session, stale, epoch, [first])).rejects.toThrow();
    expect(session.getDocument()).toBe(stale);
    expect(await commitBridgeEdit(session, stale, epoch, [])).toBe(true);
    expect(session.getDocument()).toMatchObject({ schemaVersion: 2, bridges: [] });
  }, 30000);

  it('drops a stale async edit on replacement without contaminating another project', async () => {
    const session = createDesignSessionStore(sample());
    const baseline = session.getDocument()!, epoch = session.getSessionEpoch();
    session.replace({ ...sample(), id: 'new-project' });
    expect(await commitBridgeEdit(session, baseline, epoch, [ISLAND_BRIDGE])).toBe(false);
    expect(session.getDocument()?.id).toBe('new-project');
  });
});
