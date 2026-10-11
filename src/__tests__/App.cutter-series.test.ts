// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../App.svelte';
import { createDesignDocument } from '../lib/projects/createDesignDocument';
import { createDesignSessionStore } from '../lib/stores/designSessionStore';
import { createProjectStorage } from '../lib/projects/projectStorage';
import { encodeProject } from '../lib/projects/projectCodec';
import { parseDesignDocument } from '../lib/domain/documentValidation';
import { generationState, model, resetParams } from '../lib/stores/cookieCutterStore';
import { historyStore } from '../lib/stores/historyStore';
import { serializeSTL } from '../lib/utils/stlExporter';
import type { DesignDocument } from '../lib/domain/designDocument';
// GPU only: real recipe, history, integration, codec and serializers.
vi.mock('../lib/components/viewer/ThreeViewer.svelte', async () => import('./fixtures/ThreeViewerStub.svelte'));
let app: ReturnType<typeof mount> | undefined;
afterEach(async () => { if (app) await unmount(app); app = undefined; document.body.innerHTML = ''; historyStore.clear(); resetParams(); });
function fixture(version: 1 | 2) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120"><path d="M0 0 L100 0 L100 100 L0 100 Z"/>${version === 2 ? '<path d="M35 35 L65 35 L65 65 L35 65 Z"/>' : ''}</svg>`;
  const base = createDesignDocument({ name: `Series V${version}`, kind: 'cutter', source: { type: 'svg', fileName: 'series.svg', svg } });
  return parseDesignDocument({ ...base, parameters: { ...base.parameters, wallThickness: 1.3, taperAngle: 6 }, ...(version === 2 ? { schemaVersion: 2, bridges: [{ id: 'join', from: { x: 0, y: 50 }, to: { x: 35, y: 50 }, widthMm: 2 }] } : {}) });
}
function setup(initial: DesignDocument | null, records = new Map<string, DesignDocument>()) {
  const session = createDesignSessionStore(initial);
  const storage = createProjectStorage({ put: async doc => { records.set(doc.id, structuredClone(doc)); }, get: async id => records.get(id), getAll: async () => [...records.values()], delete: async id => { records.delete(id); } });
  app = mount(App, { target: document.body, props: { projectSession: session, projectStorage: storage } });
  return session;
}
async function click(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label);
  expect(button, label).toBeDefined(); button!.click(); await tick();
}
async function ready(session: ReturnType<typeof setup>) {
  await vi.waitFor(() => { const state = get(generationState); expect(state.phase).toBe('ready'); expect(state.result?.document).toEqual(session.getDocument()); }, { timeout: 10_000 });
}
function stl() { const data = serializeSTL(get(model)!.mesh); if (!(data instanceof DataView)) throw new Error('binary STL'); return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice(); }
it.each([1, 2] as const)('V%s creates one history step, keeps editable profiles/bridges, and reopens the exact series', async version => {
  const original = fixture(version), records = new Map<string, DesignDocument>();
  let session = setup(original, records); await ready(session);
  const originalCodec = encodeProject(session.getDocument()), originalStl = stl();
  await click('Batch production');
  await vi.waitFor(() => expect(document.querySelector('[data-apply-series]')).not.toBeNull());
  expect(encodeProject(session.getDocument())).toBe(originalCodec);
  const length = historyStore.getLength();
  document.querySelector<HTMLButtonElement>('[data-apply-series]')!.click(); await tick();
  const series = session.getDocument()!;
  expect(series).toMatchObject({ schemaVersion: 3, kind: 'multi-cutter', id: original.id, source: original.source, parameters: original.parameters, layout: { copies: 4, columns: 2, spacingMm: 5 } });
  expect(historyStore.getLength()).toBe(length + 1);
  await ready(session); expect(get(generationState).result?.artifacts[0].validation.shells).toBe(4);
  const seriesCodec = encodeProject(series), seriesStl = stl();
  await click('Parameters');
  await click('Undo'); expect(encodeProject(session.getDocument())).toBe(originalCodec); await ready(session); expect(stl()).toEqual(originalStl);
  await click('Redo'); expect(encodeProject(session.getDocument())).toBe(seriesCodec); await ready(session); expect(stl()).toEqual(seriesStl);
  await click('Parameters');
  document.querySelector<HTMLButtonElement>('[data-wall-profile="robust"]')!.click(); await tick(); await ready(session);
  expect(session.getDocument()).toMatchObject({ kind: 'multi-cutter', layout: { copies: 4, columns: 2, spacingMm: 5 }, parameters: { wallThickness: 1.5, taperAngle: 10 } });
  await click('Advanced Creation');
  await vi.waitFor(() => expect(document.querySelector('.bridge-workspace')).not.toBeNull(), { timeout: 10_000 });
  if (version === 2) {
    const endpoint = document.querySelector<SVGElement>('[aria-label="Déplacer la fin du pont join"]')!;
    expect(endpoint).not.toBeNull();
    endpoint.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await vi.waitFor(() => { const doc = session.getDocument(); expect(doc?.schemaVersion).toBe(3); if (doc?.schemaVersion === 3) expect(doc.bridges[0].to.y).toBe(51); });
    await ready(session);
  }
  const saved = session.getDocument()!, binary = stl(), codec = encodeProject(saved);
  await click('Local projects'); await click('Save project');
  await vi.waitFor(() => expect(records.get(saved.id)).toEqual(saved));
  await unmount(app!); app = undefined; document.body.innerHTML = '';
  session = setup(null, records); await click('Local projects');
  await vi.waitFor(() => expect(document.querySelector(`[aria-label="Open Series V${version}"]`)).not.toBeNull());
  await click(`Open Series V${version}`); await ready(session);
  expect(encodeProject(session.getDocument())).toBe(codec); expect(stl()).toEqual(binary);
  await click('Batch production'); await vi.waitFor(() => expect(document.querySelector('[data-single-cutter]')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('[data-single-cutter]')!.click(); await tick(); await ready(session);
  expect(session.getDocument()).toMatchObject({ kind: 'cutter', parameters: saved.parameters, source: saved.source });
}, 40_000);
it('reopens an oversized V3 project without geometry and allows repair through the existing Batch UI', async () => {
  const initial = parseDesignDocument({ ...fixture(1), schemaVersion: 3, kind: 'multi-cutter', bridges: [], layout: { copies: 4, columns: 4, spacingMm: 5 } });
  const session = setup(initial);
  await vi.waitFor(() => expect(get(generationState).phase).toBe('error'), { timeout: 10_000 });
  expect(get(model)).toBeNull();
  const before = encodeProject(session.getDocument());
  await click('Batch production');
  await vi.waitFor(() => expect(document.querySelector('#series-columns')).not.toBeNull());
  expect(encodeProject(session.getDocument())).toBe(before);
  const columns = document.querySelector<HTMLInputElement>('#series-columns')!;
  expect(columns.value).toBe('4'); columns.value = '2'; columns.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  document.querySelector<HTMLButtonElement>('[data-apply-series]')!.click(); await tick(); await ready(session);
  expect(session.getDocument()).toMatchObject({ schemaVersion: 3, layout: { copies: 4, columns: 2, spacingMm: 5 } });
  expect(get(generationState).result?.artifacts[0].validation.shells).toBe(4);
}, 30_000);
it('invalid layout preserves the last series; accepted oversized layout blocks old geometry but remains saveable', async () => {
  const records = new Map<string, DesignDocument>(), session = setup(fixture(1), records); await ready(session);
  await click('Batch production'); await vi.waitFor(() => expect(document.querySelector('[data-apply-series]')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('[data-apply-series]')!.click(); await tick(); await ready(session);
  const before = session.getDocument();
  const count = document.querySelector<HTMLInputElement>('#series-copies')!; count.value = '25'; count.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  document.querySelector<HTMLButtonElement>('[data-apply-series]')!.click(); await tick(); expect(session.getDocument()).toBe(before); expect(document.querySelector('[role="alert"]')).not.toBeNull();
  session.updateSeries({ copies: 4, columns: 4, spacingMm: 5 });
  await click('Export design');
  await vi.waitFor(() => expect(document.querySelector('.advanced-export')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.advanced-export .toggle-btn')!.click(); await tick();
  expect(document.querySelectorAll('.advanced-export .export-btn')).toHaveLength(1);
  expect(document.querySelector<HTMLButtonElement>('.advanced-export .export-btn')!.disabled).toBe(true);
  await vi.waitFor(() => expect(get(generationState).phase).toBe('error'), { timeout: 10_000 });
  expect(document.querySelector('.alert-error')?.textContent).toMatch(/plateau/i);
  expect(document.querySelectorAll('.advanced-export .export-btn')).toHaveLength(1);
  expect(document.querySelector<HTMLButtonElement>('.advanced-export .export-btn')!.disabled).toBe(true);
  await click('Local projects'); await click('Save project'); await vi.waitFor(() => expect(records.get(before!.id)).toEqual(session.getDocument()));
  session.updateSeries({ copies: 2, columns: 2, spacingMm: 5 }); await ready(session);
  expect(get(generationState).result?.artifacts[0].validation.shells).toBe(2);
}, 30_000);
