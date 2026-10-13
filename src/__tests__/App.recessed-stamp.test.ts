// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../App.svelte';
import { createDesignDocument } from '../lib/projects/createDesignDocument';
import { createDesignSessionStore } from '../lib/stores/designSessionStore';
import { createProjectStorage } from '../lib/projects/projectStorage';
import { encodeProject } from '../lib/projects/projectCodec';
import { generationState, model, resetParams } from '../lib/stores/cookieCutterStore';
import { historyStore } from '../lib/stores/historyStore';
import { serializeSTL } from '../lib/utils/stlExporter';
import { getShapeById } from '../lib/utils/shapeLibrary';
import type { DesignDocument } from '../lib/domain/designDocument';
import type { GenerationOrchestrator } from '../lib/generation/generationOrchestrator';
vi.mock('../lib/components/viewer/ThreeViewer.svelte', async () => import('./fixtures/ThreeViewerStub.svelte'));
const boundary = vi.hoisted(() => ({ stl: vi.fn(), owner: undefined as GenerationOrchestrator | undefined }));
vi.mock('../lib/utils/stlExporter', async original => ({ ...await original<typeof import('../lib/utils/stlExporter')>(), exportToSTL: boundary.stl }));
vi.mock('../lib/generation/generationOrchestrator', async original => {
  const actual = await original<typeof import('../lib/generation/generationOrchestrator')>();
  return { ...actual, createGenerationOrchestrator: (...args: Parameters<typeof actual.createGenerationOrchestrator>) => {
    boundary.owner = actual.createGenerationOrchestrator(...args); return boundary.owner;
  } };
});
let app: ReturnType<typeof mount> | undefined;
afterEach(async () => { if (app) await unmount(app); app = undefined; document.body.innerHTML = ''; historyStore.clear(); resetParams(); boundary.stl.mockReset(); });
function fixture(depth = 2, shape: 'circle' | 'heart' = 'circle') {
  const svg = shape === 'heart' ? getShapeById('heart')!.svg : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30"/></svg>';
  const base = createDesignDocument({ name: 'Tampon local', kind: 'stamp', source: { type: 'svg', fileName: 'stamp.svg', svg } });
  return { ...base, parameters: { ...base.parameters, mode: 'stamp', stampDepth: depth,
    // The existing raised fixture is qualified at 70 mm / 3 mm without a handle.
    // Do not turn its unrelated historical 75 mm cap-repair refusal into a V4 fix.
    targetSize: shape === 'heart' ? 70 : base.parameters.targetSize,
    enableHandle: false, handleStyle: 'none' } };
}
function setup(initial: unknown, records = new Map<string, DesignDocument>()) {
  const session = createDesignSessionStore(initial);
  const storage = createProjectStorage({ put: async doc => { records.set(doc.id, structuredClone(doc)); }, get: async id => records.get(id), getAll: async () => [...records.values()], delete: async id => { records.delete(id); } });
  app = mount(App, { target: document.body, props: { projectSession: session, projectStorage: storage } });
  return session;
}
function button(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label);
  expect(button, label).toBeDefined(); return button!;
}
async function click(label: string) { button(label).click(); await tick(); }
async function ready(session: ReturnType<typeof setup>) {
  await vi.waitFor(() => { const state = get(generationState); expect(state.phase, state.error?.message).toBe('ready'); expect(state.result?.document).toEqual(session.getDocument()); }, { timeout: 10000 });
}
function bytes() { const data = serializeSTL(get(model)!.mesh, true) as DataView; return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice(); }
async function exportPanel() {
  await click('Exporter le dessin');
  await vi.waitFor(() => expect(document.querySelector('.advanced-export .toggle-btn')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.advanced-export .toggle-btn')!.click(); await tick();
  return document.querySelector<HTMLButtonElement>('.advanced-export .export-btn')!;
}
it.each(['circle', 'heart'] as const)('%s selects a session-owned mode with one Undo step and reopens exact JSON, preview and STL', async shape => {
  const original = fixture(shape === 'heart' ? 3 : 2, shape), records = new Map<string, DesignDocument>();
  let session = setup(original, records); await ready(session); const raised = bytes(), originalJson = encodeProject(session.getDocument());
  await click('Réglages'); const length = historyStore.getLength(), epoch = session.sessionEpoch;
  await click('Creux');
  expect(session.getDocument()).toMatchObject({ schemaVersion: 4, imprintMode: 'recessed', id: original.id, source: original.source, sketch: original.sketch });
  expect(historyStore.getLength()).toBe(length + 1); expect(session.sessionEpoch).toBe(epoch);
  expect(button('Creux').getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector<HTMLInputElement>('#stampDepth')!.max).toBe('3');
  await ready(session); const recessed = bytes(), recessedJson = encodeProject(session.getDocument());
  expect(recessed).not.toEqual(raised);
  expect(get(generationState).result?.document).toMatchObject({ schemaVersion: 4, imprintMode: 'recessed' });
  const report = get(generationState).result!.artifacts[0].validation;
  expect(report.valid).toBe(true); expect(report.shells).toBe(1); expect(report.bounds!.max.y).toBe(4);
  await click('Annuler'); expect(encodeProject(session.getDocument())).toBe(originalJson); await ready(session); expect(bytes()).toEqual(raised);
  await click('Rétablir'); expect(encodeProject(session.getDocument())).toBe(recessedJson); await ready(session); expect(bytes()).toEqual(recessed);
  const depth = document.querySelector<HTMLInputElement>('#stampDepth')!;
  // Exercise an actual depth change even when the Heart starts at the 3 mm boundary.
  for (const value of ['2.5', '3']) {
    depth.value = value; depth.dispatchEvent(new Event('input', { bubbles: true })); await tick(); await ready(session);
  }
  const saved = session.getDocument()!, savedBytes = bytes(), savedJson = encodeProject(saved);
  await click('Projets locaux'); await click('Enregistrer le projet'); await vi.waitFor(() => expect(records.get(saved.id)).toEqual(saved));
  await unmount(app!); app = undefined; document.body.innerHTML = '';
  session = setup(null, records); await click('Projets locaux'); await vi.waitFor(() => expect(document.querySelector('[aria-label="Ouvrir Tampon local"]')).not.toBeNull());
  await click('Ouvrir Tampon local'); await ready(session);
  expect(encodeProject(session.getDocument())).toBe(savedJson); expect(bytes()).toEqual(savedBytes);
  await click('Réglages'); expect(button('Creux').getAttribute('aria-pressed')).toBe('true');
  const action = await exportPanel(); expect(action.disabled).toBe(false); action.click();
  expect(boundary.stl).toHaveBeenCalledTimes(1); expect(boundary.stl.mock.calls[0][0]).toBe(get(model)!.mesh);
}, 40000);
it('refuses deep raised settings without loss and offers an explicit reduction action', async () => {
  const session = setup(fixture(5)); await ready(session); await click('Réglages');
  const before = session.getDocument(), length = historyStore.getLength();
  await click('Creux'); expect(session.getDocument()).toBe(before); expect(historyStore.getLength()).toBe(length);
  expect(button('Relief').getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('#stampImprint-error')?.textContent).toContain('3 mm');
  expect(button('Creux').getAttribute('aria-describedby')).toContain('stampImprint-error');
  await click('Réduire la profondeur à 3 mm'); expect(session.getDocument()?.parameters.stampDepth).toBe(3);
  expect(session.getDocument()?.schemaVersion).toBe(1); await click('Creux'); await ready(session);
  expect(session.getDocument()).toMatchObject({ schemaVersion: 4, imprintMode: 'recessed' });
}, 20000);
it('blocks a retained raised mesh synchronously even if generation is cancelled back to ready', async () => {
  const session = setup(fixture()); await ready(session); const mesh = get(model)!.mesh;
  const action = await exportPanel(); session.updateStampImprintMode('recessed');
  action.click(); expect(boundary.stl).not.toHaveBeenCalled(); expect(get(generationState).phase).toBe('scheduled');
  expect(get(generationState).requestedDocument).toMatchObject({ schemaVersion: 4, imprintMode: 'recessed' });
  boundary.owner!.cancel(); expect(get(generationState).phase).toBe('ready'); expect(get(model)!.mesh).toBe(mesh);
  action.dispatchEvent(new MouseEvent('click', { bubbles: true })); expect(boundary.stl).not.toHaveBeenCalled();
  await tick(); expect(action.disabled).toBe(true);
  await click('Projets locaux'); expect(button('Exporter le projet').disabled).toBe(false);
  session.updateParameters('stamp', { stampDepth: 1.5 }); await ready(session);
  const fresh = await exportPanel(); expect(fresh.disabled).toBe(false); fresh.click();
  expect(boundary.stl.mock.calls[0][0]).toBe(get(model)!.mesh); expect(get(model)!.mesh).not.toBe(mesh);
}, 20000);
