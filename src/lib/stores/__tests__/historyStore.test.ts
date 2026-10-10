import { get } from 'svelte/store';
import { afterEach, expect, it } from 'vitest';
import { historyStore, canUndo, canRedo } from '../historyStore';
import { createDesignSessionStore } from '../designSessionStore';
import { documentParametersToLegacy } from '../legacyDocumentAdapter';
import { projectDocument } from '../../projects/__tests__/projectFixtures';
import { DEFAULT_PARAMS } from '../../types/CookieCutter';
const legacy = (description: string) => ({ params: { ...DEFAULT_PARAMS }, svgData: null, description });
afterEach(() => historyStore.clear());
it('retains legacy params/SVG entries and derived undo/redo behaviour without a document or epoch', () => {
  historyStore.pushState(legacy('A'));
  historyStore.pushState({ ...legacy('B'), svgData: '<svg/>' });
  expect(get(canUndo)).toBe(true); expect(get(canRedo)).toBe(false);
  expect(historyStore.undo()).toMatchObject({ description: 'A', params: DEFAULT_PARAMS, svgData: null });
  expect(get(canUndo)).toBe(false); expect(get(canRedo)).toBe(true);
  expect(historyStore.redo()).toMatchObject({ description: 'B', svgData: '<svg/>' });
  expect(historyStore.getCurrentState()?.document).toBeUndefined();
  expect(historyStore.getCurrentState()?.sessionEpoch).toBeUndefined();
});
it('retains the exact frozen canonical snapshot and epoch through undo and redo', () => {
  const session = createDesignSessionStore(projectDocument(), { now: () => '2026-10-09T12:00:00.000Z' });
  const a = session.getDocument()!;
  historyStore.pushState({ params: documentParametersToLegacy(a), svgData: a.sketch.svg, description: 'A', document: a, sessionEpoch: session.sessionEpoch });
  session.updateSketch(a.source.type === 'svg' ? a.source.svg : a.source.vectorizedSvg);
  const b = session.getDocument()!;
  historyStore.pushState({ params: documentParametersToLegacy(b), svgData: b.sketch.svg, description: 'B', document: b, sessionEpoch: session.sessionEpoch });
  expect(historyStore.undo()?.document).toBe(a);
  expect(historyStore.redo()?.document).toBe(b);
  expect(historyStore.getCurrentState()?.sessionEpoch).toBe(0);
  expect(a.sketch.revision).not.toBe(b.sketch.revision);
  expect(a.updatedAt).not.toBe(b.updatedAt);
});
it('truncates redo after a new edit and clears both entries and cursor', () => {
  for (const name of ['A', 'B', 'C']) historyStore.pushState(legacy(name));
  historyStore.undo(); historyStore.pushState(legacy('D'));
  expect(historyStore.redo()).toBeNull();
  expect(get(historyStore).map(entry => entry.description)).toEqual(['A', 'B', 'D']);
  historyStore.clear();
  expect(historyStore.getLength()).toBe(0); expect(historyStore.getCurrentState()).toBeNull();
  expect(get(canUndo)).toBe(false); expect(get(canRedo)).toBe(false);
});
it('keeps the cursor on the newest entry when the bounded history fills', () => {
  for (let index = 0; index < 55; index++) historyStore.pushState(legacy(String(index)));
  expect(historyStore.getLength()).toBe(50);
  expect(historyStore.getCurrentState()?.description).toBe('54');
  expect(historyStore.undo()?.description).toBe('53');
  expect(historyStore.redo()?.description).toBe('54');
});
