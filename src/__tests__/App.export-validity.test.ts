// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../App.svelte';
import { createDesignSessionStore } from '../lib/stores/designSessionStore';
import { createProjectStorage } from '../lib/projects/projectStorage';
import { createDesignDocument } from '../lib/projects/createDesignDocument';
import { generationState, model, setParams } from '../lib/stores/cookieCutterStore';
import { DEFAULT_PARAMS } from '../lib/types/CookieCutter';
import * as THREE from 'three';
import { unzipSync, strFromU8 } from 'fflate';
import { serialize3MF } from '../lib/utils/advancedExporter';
import { historyStore } from '../lib/stores/historyStore';
const viewerEvents = vi.hoisted(() => ({ dispatchers: [] as ((name: string, detail: unknown) => void)[] }));
vi.mock('svelte', async original => {
  const actual = await original<typeof import('svelte')>();
  return { ...actual, createEventDispatcher: () => {
    const dispatch = actual.createEventDispatcher(); viewerEvents.dispatchers.push(dispatch); return dispatch;
  } };
});
vi.mock('three', async original => {
  const actual = await original<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    domElement = document.createElement('canvas'); renderLists = { dispose() {} };
    setSize() {} setPixelRatio() {} dispose() {} forceContextLoss() {} render() {}
  } };
});
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({ OrbitControls: class { target = new THREE.Vector3(); update() {} dispose() {} } }));
const downloads = vi.hoisted(() => ({ stl: vi.fn(), obj: vi.fn(), mf: vi.fn(), fail: false }));
vi.mock('../lib/utils/stlExporter', async original => ({ ...await original<typeof import('../lib/utils/stlExporter')>(), exportToSTL: downloads.stl }));
vi.mock('../lib/utils/advancedExporter', async original => ({ ...await original<typeof import('../lib/utils/advancedExporter')>(), exportToOBJ: downloads.obj, exportTo3MF: downloads.mf }));
vi.mock('../lib/utils/cookieCutterGenerator', async original => {
  const actual = await original<typeof import('../lib/utils/cookieCutterGenerator')>();
  return { ...actual, generateCookieCutter: (...args: Parameters<typeof actual.generateCookieCutter>) => {
    if (downloads.fail) throw new Error('controlled recipe failure');
    return actual.generateCookieCutter(...args);
  } };
});
const generation = vi.hoisted(() => ({ owner: undefined as import('../lib/generation/generationOrchestrator').GenerationOrchestrator | undefined }));
vi.mock('../lib/generation/generationOrchestrator', async original => {
  const actual = await original<typeof import('../lib/generation/generationOrchestrator')>();
  return { ...actual, createGenerationOrchestrator: (...args: Parameters<typeof actual.createGenerationOrchestrator>) => {
    generation.owner = actual.createGenerationOrchestrator(...args); return generation.owner;
  } };
});
let app: ReturnType<typeof mount> | undefined;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>';
function setup() {
  const initial = createDesignDocument({ name: 'A', kind: 'cutter', source: { type: 'svg', fileName: 'A.svg', svg } });
  const session = createDesignSessionStore(initial);
  const storage = createProjectStorage({ put: async () => {}, get: async () => undefined, getAll: async () => [], delete: async () => {}, close: async () => {} });
  app = mount(App, { target: document.body.appendChild(document.createElement('div')), props: { projectSession: session, projectStorage: storage } });
  return session;
}
function button(label: string) {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label);
  expect(found, label).toBeDefined(); return found!;
}
async function ready() { await vi.waitFor(() => expect(get(generationState).phase).toBe('ready'), { timeout: 10000 }); }
async function exportPanel(format = 'stl') {
  button('Export design').click();
  await vi.waitFor(() => expect(document.querySelector('.advanced-export .toggle-btn')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.advanced-export .toggle-btn')!.click(); await tick();
  if (format !== 'stl') {
    [...document.querySelectorAll<HTMLButtonElement>('.format-card')].find(b => b.textContent?.includes(format.toUpperCase()))!.click(); await tick();
  }
  return document.querySelector<HTMLButtonElement>('.advanced-export .export-btn')!;
}
beforeEach(() => { viewerEvents.dispatchers = []; downloads.fail = false; downloads.stl.mockReset(); downloads.obj.mockReset(); downloads.mf.mockReset(); });
afterEach(async () => { if (app) await unmount(app); app = undefined; document.body.innerHTML = ''; setParams({ ...DEFAULT_PARAMS }); });
it('collision auto-fix cannot move canonical contours, even through a forced click', async () => {
  const session = setup();
  session.updateSketch('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="35" cy="50" r="15"/><circle cx="66" cy="50" r="15"/></svg>');
  await ready();
  const mesh = get(model)!.mesh as THREE.Group;
  expect(mesh.children).toHaveLength(2);
  const snapshot = session.getDocument(), epoch = session.getSessionEpoch();
  const positions = mesh.children.map(child => child.position.toArray());
  button('Local projects').click(); await tick(); button('Save project').click();
  await vi.waitFor(() => expect(document.querySelector('.project-manager [role="status"]')?.textContent).toBe('Saved locally'));
  const history = get(historyStore), historyIndex = get(historyStore.currentIndex);
  button('Materials and optimization').click();
  await vi.waitFor(() => expect(document.querySelector('.collision-detector .toggle-btn')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.collision-detector .toggle-btn')!.click();
  await tick();
  const action = document.querySelector<HTMLButtonElement>('.collision-detector .fix-btn');
  expect(action).not.toBeNull();
  action!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(mesh.children.map(child => child.position.toArray())).toEqual(positions);
  expect(action!.disabled).toBe(true);
  expect(action!.getAttribute('aria-describedby')).toBeTruthy();
  expect(session.getDocument()).toBe(snapshot);
  expect(session.getSessionEpoch()).toBe(epoch);
  expect(get(model)!.mesh).toBe(mesh);
  expect(get(historyStore)).toBe(history);
  expect(get(historyStore.currentIndex)).toBe(historyIndex);
  button('Local projects').click(); await tick();
  expect(document.querySelector('.project-manager [role="status"]')?.textContent).toBe('Saved locally');
  const exportAction = await exportPanel();
  exportAction.click();
  expect(downloads.stl.mock.calls[0][0]).toBe(mesh);
  expect(mesh.children.map(child => child.position.toArray())).toEqual(positions);
});

it.each(['stl', 'obj', '3mf'])('guards %s synchronously before a Svelte flush and while new geometry is pending', async format => {
  const session = setup(); await ready(); const meshA = get(model)!.mesh;
  const download = format === 'stl' ? downloads.stl : format === 'obj' ? downloads.obj : downloads.mf;
  const action = await exportPanel(format); expect(action.disabled).toBe(false);
  session.updateParameters('cutter', { totalHeight: 31 });
  action.click(); // deliberately no tick: old component props and enabled DOM
  expect(download).not.toHaveBeenCalled();
  expect(get(model)!.mesh).toBe(meshA); expect(get(generationState).phase).toBe('scheduled');
  await tick(); expect(action.disabled).toBe(true);
  expect(action.getAttribute('aria-describedby')).toBeTruthy();
  expect(document.querySelector('[role="status"]')?.textContent).toContain('current design');
  await ready(); await tick(); expect(action.disabled).toBe(false); action.click();
  expect(download).toHaveBeenCalledTimes(1); expect(download.mock.calls[0][0]).toBe(get(model)!.mesh);
  expect(download.mock.calls[0][0]).not.toBe(meshA);
  if (format === '3mf') expect(download.mock.calls[0][2].totalHeight).toBe(31);
});
it('keeps old A visible but unexportable after B fails, then exports freshly regenerated restored A', async () => {
  const session = setup(); await ready(); const original = session.getDocument()!, epoch = session.getSessionEpoch(), meshA = get(model)!.mesh;
  const action = await exportPanel(); downloads.fail = true;
  session.updateParameters('cutter', { totalHeight: 32 });
  await vi.waitFor(() => expect(get(generationState).phase).toBe('error'));
  await tick(); expect(get(model)!.mesh).toBe(meshA); expect(action.disabled).toBe(true);
  action.dispatchEvent(new MouseEvent('click', { bubbles: true })); expect(downloads.stl).not.toHaveBeenCalled();
  downloads.fail = false; session.restoreHistory(original, epoch);
  action.dispatchEvent(new MouseEvent('click', { bubbles: true })); expect(downloads.stl).not.toHaveBeenCalled();
  await ready(); await tick(); action.click(); expect(downloads.stl.mock.calls[0][0]).toBe(get(model)!.mesh); expect(get(model)!.mesh).not.toBe(meshA);
});
it.each(['different-id', 'same-id'])('replacing with identical geometry (%s) blocks old ownership until publication', async identity => {
  const session = setup(); await ready(); const meshA = get(model)!.mesh, snapshot = session.getDocument()!;
  const action = await exportPanel();
  session.replace({ ...snapshot, id: identity === 'same-id' ? snapshot.id : 'B', name: 'B' });
  action.click(); expect(downloads.stl).not.toHaveBeenCalled(); await tick(); expect(action.disabled).toBe(true);
  await ready(); await tick(); action.click(); expect(downloads.stl.mock.calls[0][0]).toBe(get(model)!.mesh); expect(get(model)!.mesh).not.toBe(meshA);
});
it('rename and viewport edits retain eligible geometry and current 3MF parameters without rebuilding', async () => {
  const session = setup(); await ready(); const meshA = get(model)!.mesh, revision = get(generationState).revision;
  const action = await exportPanel('3mf'); session.rename('Renamed'); session.updateViewport({ showGrid: false });
  action.click(); expect(downloads.mf.mock.calls[0][0]).toBe(meshA); expect(downloads.mf.mock.calls[0][2]).toEqual(session.getDocument()!.parameters);
  await tick(); expect(action.disabled).toBe(false); expect(get(generationState).revision).toBe(revision); expect(get(model)!.mesh).toBe(meshA);
});
it('unrepresentable canonical parameters block even a retained mesh, and clearing rejects an immediate click', async () => {
  const session = setup(); await ready(); const action = await exportPanel();
  session.updateParameters('cutter', { enableEmbossing: true }); action.click(); expect(downloads.stl).not.toHaveBeenCalled();
  await tick(); expect(action.disabled).toBe(true);
  session.clear(); action.dispatchEvent(new MouseEvent('click', { bubbles: true })); expect(downloads.stl).not.toHaveBeenCalled();
});
it('cancelling B cannot turn retained A into an eligible result merely by returning to ready', async () => {
  const session = setup(); await ready(); const meshA = get(model)!.mesh, action = await exportPanel('obj');
  session.updateParameters('cutter', { totalHeight: 34 }); generation.owner!.cancel();
  expect(get(generationState).phase).toBe('ready'); expect(get(model)!.mesh).toBe(meshA);
  action.click(); expect(downloads.obj).not.toHaveBeenCalled(); await tick(); expect(action.disabled).toBe(true);
});
it('project JSON export stays enabled independently while geometry generation is pending', async () => {
  const session = setup(); await ready(); session.updateParameters('cutter', { totalHeight: 33 });
  button('Local projects').click(); await tick(); expect(get(generationState).phase).toBe('scheduled');
  expect(button('Export project').disabled).toBe(false);
});
it('a current real batch remains exportable with captured metadata, not later legacy edits', async () => {
  const session = setup(); await ready(); button('Batch production').click();
  await vi.waitFor(() => expect(document.querySelector('.batch-mode .toggle-btn')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.batch-mode .toggle-btn')!.click(); await tick();
  button('+ Add Current Design').click(); await tick(); setParams({ ...DEFAULT_PARAMS, wallThickness: 1.2 }); await tick(); button('Generate Atomic Batch').click();
  await vi.waitFor(() => expect(document.querySelector('.current-file')?.textContent).toBe('batch-production.stl'), { timeout: 10000 });
  const batchMesh = get(model)!.mesh, captured = { ...DEFAULT_PARAMS };
  const action = await exportPanel('3mf'); setParams({ ...DEFAULT_PARAMS, totalHeight: 39 }); action.click();
  expect(downloads.mf.mock.calls[0][0]).toBe(batchMesh); expect(downloads.mf.mock.calls[0][2]).toEqual(captured);
  button('Local projects').click(); await tick(); expect(button('Export project').disabled).toBe(true);
  session.updateSketch(svg.replace('r="20"', 'r="25"')); await tick();
  const stale = await exportPanel(); stale.dispatchEvent(new MouseEvent('click', { bubbles: true })); expect(downloads.stl).not.toHaveBeenCalled(); expect(stale.disabled).toBe(true);
});
it('rejects forged viewer deletion without changing document, ownership or exported contour count', async () => {
  const session = setup();
  session.updateSketch('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="25" cy="50" r="15"/><circle cx="75" cy="50" r="15"/></svg>');
  await ready(); const mesh = get(model)!.mesh as THREE.Group;
  expect(mesh.children).toHaveLength(2);
  const intersect = vi.spyOn(THREE.Raycaster.prototype, 'intersectObject').mockReturnValue([{ object: mesh.children[0], distance: 1, point: new THREE.Vector3() }]);
  button('Enter selection mode').click(); await tick();
  document.querySelector('canvas')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick();
  expect(button('Delete selected element').disabled).toBe(true); intersect.mockRestore();
  const original = session.getDocument(), epoch = session.getSessionEpoch(), state = get(generationState);
  const geometry = (mesh.children[0] as THREE.Mesh).geometry, disposed = vi.spyOn(geometry, 'dispose');
  for (const dispatch of viewerEvents.dispatchers) dispatch('deleteObject', mesh.children[0]);
  await tick(); expect(disposed).not.toHaveBeenCalled(); expect(mesh.children).toHaveLength(2);
  expect(session.getDocument()).toBe(original); expect(session.getSessionEpoch()).toBe(epoch); expect(get(generationState)).toBe(state);
  const action = await exportPanel(); action.click(); expect(downloads.stl.mock.calls[0][0].children).toHaveLength(2);
  session.replace(original!); await ready(); expect((get(model)!.mesh as THREE.Group).children).toHaveLength(2);
});

it.each(['heterogeneous', 'legacy-unknown'])('omits global geometry claims for %s batches without blocking mesh export', async kind => {
  setup(); await ready(); button('Batch production').click();
  await vi.waitFor(() => expect(document.querySelector('.batch-mode .toggle-btn')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.batch-mode .toggle-btn')!.click(); await tick();
  if (kind === 'heterogeneous') {
    button('+ Add Current Design').click(); await tick();
    setParams({ ...DEFAULT_PARAMS, wallThickness: 1.2 }); await tick();
    button('+ Add Current Design').click(); await tick(); button('Generate Atomic Batch').click();
  } else {
    const group = new THREE.Group(); group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    for (const dispatch of viewerEvents.dispatchers) dispatch('batchCreated', group);
  }
  await vi.waitFor(() => expect(document.querySelector('.current-file')?.textContent).toBe('batch-production.stl'), { timeout: 10000 });
  const batch = get(model)!.mesh;
  const part = batch.children[0] instanceof THREE.Mesh ? batch.children[0] : batch.children[0].children[0];
  const intersect = vi.spyOn(THREE.Raycaster.prototype, 'intersectObject').mockReturnValue([{ object: part, distance: 1, point: new THREE.Vector3() }]);
  button('Enter selection mode').click(); await tick();
  document.querySelector('canvas')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick();
  expect(button('Delete selected element').disabled).toBe(true); intersect.mockRestore();
  const action = await exportPanel('3mf');
  expect(action.disabled).toBe(false); action.click();
  expect(downloads.mf).toHaveBeenCalledTimes(1); expect(downloads.mf.mock.calls[0][0]).toBe(batch);
  const metadata = downloads.mf.mock.calls[0][2]; expect(metadata).toBeUndefined();
  const xml = strFromU8(unzipSync(serialize3MF(batch, metadata))['3D/3dmodel.model']);
  expect(xml).not.toContain('ccd:WallThickness'); expect(xml).not.toContain('ccd:CuttingHeight'); expect(xml).toContain('unit="millimeter"');
  for (const format of ['obj', 'stl']) {
    button('Local projects').click(); await tick();
    const meshExport = await exportPanel(format); expect(meshExport.disabled).toBe(false); meshExport.click();
  }
  expect(downloads.obj.mock.calls[0][0]).toBe(batch); expect(downloads.stl.mock.calls[0][0]).toBe(batch);
});
