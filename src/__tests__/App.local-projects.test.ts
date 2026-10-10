// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../App.svelte';
import { createDesignSessionStore } from '../lib/stores/designSessionStore';
import { createProjectStorage } from '../lib/projects/projectStorage';
import { createDesignDocument } from '../lib/projects/createDesignDocument';
import { generationState, model, setParams } from '../lib/stores/cookieCutterStore';
import { historyStore } from '../lib/stores/historyStore';
import { encodeProject } from '../lib/projects/projectCodec';
import type { DesignDocument } from '../lib/domain/designDocument';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { SHAPE_LIBRARY } from '../lib/utils/shapeLibrary';
import { DEFAULT_PARAMS } from '../lib/types/CookieCutter';
vi.mock('../lib/components/viewer/ThreeViewer.svelte', async () => import('./fixtures/ThreeViewerStub.svelte'));
const schedules = vi.hoisted(() => ({ documents: [] as unknown[], clearGate: undefined as undefined | (() => Promise<void>) }));
vi.mock('../lib/generation/generationOrchestrator', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/generation/generationOrchestrator')>();
  return { ...actual, createGenerationOrchestrator: (...args: Parameters<typeof actual.createGenerationOrchestrator>) => {
    const owner = actual.createGenerationOrchestrator(...args);
    const schedule = owner.schedule.bind(owner);
    owner.schedule = document => { schedules.documents.push(document); schedule(document); };
    const clear = owner.clear.bind(owner);
    owner.clear = async () => { await clear(); await schedules.clearGate?.(); };
    return owner;
  } };
});
const batch = vi.hoisted(() => ({ mesh: undefined as undefined | import('three').Group, gate: undefined as undefined | (() => Promise<void>) }));
vi.mock('../lib/utils/batchProcessor', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/utils/batchProcessor')>(),
  createBatch: vi.fn(async () => { const mesh = batch.mesh; await batch.gate?.(); return { mesh, report: { succeeded: 1 }, totalDimensions: { width: 10, height: 10 } }; })
}));
const raster = vi.hoisted(() => ({ resolve: undefined as undefined | ((svg: string) => void) }));
vi.mock('../lib/utils/imageProcessor', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/utils/imageProcessor')>(),
  vectorizeImage: vi.fn(() => new Promise<string>(resolve => { raster.resolve = resolve; }))
}));
const ai = vi.hoisted(() => ({ optimize: vi.fn(), generate: vi.fn() }));
vi.mock('../lib/utils/geminiAPI', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/utils/geminiAPI')>(),
  getAPIKey: () => 'test-only', optimizeSVGWithAI: ai.optimize, generateImageWithGemini: ai.generate
}));
let app: ReturnType<typeof mount> | undefined;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>';
function fixture(id = 'B') {
  const doc = createDesignDocument({ name: id, kind: 'cutter', source: { type: 'svg', fileName: 'original.svg', svg } });
  return { ...doc, id, sketch: { svg: svg.replace('r="20"', 'r="25"'), revision: 7 }, parameters: { ...doc.parameters, totalHeight: 29 }, viewport: { showGrid: false, showAxes: true, showWallThickness: true } };
}
function setup(initial: unknown = null, putEffect?: (doc: DesignDocument) => Promise<void>) {
  const session = createDesignSessionStore(initial);
  const records = new Map([[ 'B', fixture() ]]);
  const close = vi.fn(async () => {});
  const put = vi.fn(async (doc: DesignDocument) => { await putEffect?.(doc); records.set(doc.id, doc as ReturnType<typeof fixture>); });
  const storage = createProjectStorage({ put, get: async id => records.get(id), getAll: async () => [...records.values()], delete: async id => { records.delete(id); }, close });
  const target = document.body.appendChild(document.createElement('div'));
  app = mount(App, { target, props: { projectSession: session, projectStorage: storage } });
  return { session, records, close, put };
}
function click(label: string) { const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label); expect(button).toBeDefined(); button!.click(); }
beforeEach(() => {
  ai.optimize.mockReset(); ai.generate.mockReset();
  raster.resolve = undefined; schedules.documents = []; schedules.clearGate = undefined; batch.gate = undefined;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(async () => { if (app) await unmount(app); app = undefined; document.body.innerHTML = ''; setParams({ ...DEFAULT_PARAMS }); });
it('restores the exact session document into the real orchestrator, not source or defaults', async () => {
  const { session } = setup();
  click('Local projects');
  await vi.waitFor(() => expect(document.querySelector('button[aria-label="Open B"]')).not.toBeNull());
  click('Open B');
  await vi.waitFor(() => expect(get(generationState).phase).toBe('ready'), { timeout: 10000 });
  expect(schedules.documents.at(-1)).toBe(session.getDocument());
  expect(get(generationState).result?.document).toEqual(session.getDocument());
  expect(session.getDocument()?.parameters.totalHeight).toBe(29);
  expect(session.getDocument()?.sketch.revision).toBe(7);
  expect(session.getDocument()?.source).toEqual(fixture().source);
  expect(document.body.textContent).toContain('Saved locally');
});
it('ignores slow raster A after opening B without publishing upload state early', async () => {
  const { session } = setup();
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [new File(['a'], 'A.png', { type: 'image/png' })] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(raster.resolve).toBeDefined());
  click('Local projects');
  await vi.waitFor(() => expect(document.querySelector('button[aria-label="Open B"]')).not.toBeNull());
  click('Open B');
  await vi.waitFor(() => expect(session.getDocument()?.id).toBe('B'));
  const restored = session.getDocument();
  raster.resolve!(svg); await tick(); await tick();
  expect(session.getDocument()).toBe(restored);
  await vi.waitFor(() => expect(get(generationState).result?.document).toEqual(restored), { timeout: 10000 });
});
it('cancelling new preserves dirty document and existing preview; destroy cancels pending prompt', async () => {
  const { session, close } = setup(fixture('A'));
  await vi.waitFor(() => expect(get(generationState).phase).toBe('ready'), { timeout: 10000 });
  const snapshot = session.getDocument(); const preview = get(model)?.mesh;
  click('Start a new design');
  await vi.waitFor(() => expect(document.querySelector('dialog[open]')).not.toBeNull());
  expect(document.activeElement?.getAttribute('data-choice')).toBe('cancel');
  click('Cancel'); await tick();
  expect(session.getDocument()).toBe(snapshot); expect(get(model)?.mesh).toBe(preview);
  click('Start a new design'); await tick();
  await unmount(app!); app = undefined;
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(session.getDocument()).toBe(snapshot);
});

it('invalid generated SVG through the real shape library reports async validation failure without losing A', async () => {
  const { session } = setup(fixture('A')); await ready();
  const snapshot = session.getDocument(), mesh = get(model)?.mesh, epoch = session.getSessionEpoch();
  const shape = SHAPE_LIBRARY.find(shape => shape.id === 'circle')!;
  const original = shape.svg;
  try {
    shape.svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script></svg>';
    click('Shape Library'); await tick(); click('Use Circle shape');
    await vi.waitFor(() => expect(document.querySelector('.alert-error')?.textContent).toContain('source.svg'));
    expect(session.getDocument()).toBe(snapshot); expect(session.getSessionEpoch()).toBe(epoch);
    expect(get(model)?.mesh).toBe(mesh); expect(document.querySelector('dialog[open]')).toBeNull();
  } finally { shape.svg = original; }
});

async function ready() { await vi.waitFor(() => expect(get(generationState).phase).toBe('ready'), { timeout: 10000 }); }
async function library() { click('Local projects'); await vi.waitFor(() => expect(document.querySelector('button[aria-label="Open B"]')).not.toBeNull()); }
async function prompt() { await vi.waitFor(() => expect(document.querySelector('dialog[open]')).not.toBeNull()); }
function button(label: string) { return [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label)!; }
function upload(input: HTMLInputElement, file: File) { Object.defineProperty(input, 'files', { configurable: true, value: [file] }); input.dispatchEvent(new Event('change', { bubbles: true })); }
function deferred() { let resolve!: () => void; let reject!: (cause: unknown) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

it.each(['open', 'import'])('dirty %s cancellation preserves exact A, preview and epoch through real controls', async transition => {
  const { session, put } = setup(fixture('A')); await ready(); await library();
  const snapshot = session.getDocument(), mesh = get(model)?.mesh, epoch = session.getSessionEpoch();
  if (transition === 'open') click('Open B');
  else upload(document.querySelector<HTMLInputElement>('input[aria-label="Project file"]')!, new File([encodeProject(fixture('C'))], 'C.ccd.json', { type: 'application/json' }));
  await prompt(); click('Cancel'); await tick(); await tick();
  expect(session.getDocument()).toBe(snapshot); expect(get(model)?.mesh).toBe(mesh);
  expect(session.getSessionEpoch()).toBe(epoch); expect(put).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(button('Save project').disabled).toBe(false));
});

it('failed save-and-continue blocks opening B and preserves A with visible storage error', async () => {
  const { session, put } = setup(fixture('A'), async () => { throw new Error('disk full'); }); await ready(); await library();
  const snapshot = session.getDocument(), mesh = get(model)?.mesh, epoch = session.getSessionEpoch();
  click('Open B'); await prompt(); click('Save and continue');
  await vi.waitFor(() => expect(document.body.textContent).toContain('disk full'));
  expect(put).toHaveBeenCalledTimes(1); expect(session.getDocument()).toBe(snapshot);
  expect(get(model)?.mesh).toBe(mesh); expect(session.getSessionEpoch()).toBe(epoch);
  await vi.waitFor(() => expect(button('Save project').disabled).toBe(false));
});

it('discard opens B and erases every A history snapshot', async () => {
  const { session } = setup(fixture('A')); await ready();
  session.rename('Edited A'); expect(historyStore.getLength()).toBeGreaterThan(1); await library();
  click('Open B'); await prompt(); click('Discard changes');
  await vi.waitFor(() => expect(session.getDocument()?.id).toBe('B')); await ready();
  expect(get(historyStore).map(s => s.document?.id)).toEqual(['B']);
  expect(get(generationState).result?.document).toEqual(session.getDocument());
});

it.each(['resolve', 'reject'] as const)('accepted save drains before close after unmount (%s), without late replacement', async settlement => {
  const pending = deferred();
  const { session, close, put, records } = setup(fixture('A'), () => pending.promise); await ready(); await library();
  const snapshot = session.getDocument(), epoch = session.getSessionEpoch();
  click('Open B'); await prompt(); const lateDiscard = button('Discard changes'); click('Save and continue');
  await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  await unmount(app!); app = undefined; lateDiscard.click(); await tick();
  expect(close).not.toHaveBeenCalled(); expect(session.getDocument()).toBe(snapshot);
  if (settlement === 'resolve') pending.resolve(); else pending.reject(new Error('late write failure'));
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1)); await tick();
  expect(session.getDocument()).toBe(snapshot); expect(session.getSessionEpoch()).toBe(epoch);
  expect(records.has('A')).toBe(settlement === 'resolve'); expect(get(model)).toBeNull();
});

it.each(['open', 'new'])('real BatchMode blocks project save/export and parameter/history regeneration until %s', async transition => {
  const { session, put } = setup(fixture('A')); await ready(); session.rename('Edited A');
  batch.mesh = new Group(); click('Batch production');
  await vi.waitFor(() => expect(document.querySelector('.batch-mode .toggle-btn')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.batch-mode .toggle-btn')!.click(); await tick();
  click('+ Add Current Design'); await tick(); click('Generate Atomic Batch');
  await vi.waitFor(() => expect(get(model)?.mesh).toBe(batch.mesh)); await library();
  expect(document.body.textContent).toContain('Batch previews cannot be saved or exported');
  expect(button('Save project').disabled).toBe(true); expect(button('Export project').disabled).toBe(true);
  button('Save project').click(); button('Export project').click(); expect(put).not.toHaveBeenCalled();
  const snapshot = session.getDocument(), scheduled = schedules.documents.length, index = get(historyStore.currentIndex);
  setParams({ ...get(model)!.params, totalHeight: 31 } as typeof DEFAULT_PARAMS); await tick();
  expect(session.getDocument()).toBe(snapshot); expect(schedules.documents).toHaveLength(scheduled);
  click('Parameters'); await tick(); document.querySelector<HTMLButtonElement>('button[title*="Undo"]')!.click(); await tick();
  expect(get(historyStore.currentIndex)).toBe(index); expect(get(model)?.mesh).toBe(batch.mesh);
  await library(); if (transition === 'open') click('Open B'); else click('Start a new design');
  await prompt(); click('Discard changes');
  if (transition === 'new') {
    await vi.waitFor(() => expect(session.getDocument()).toBeNull());
    expect(get(model)).toBeNull(); await library();
    expect(document.body.textContent).not.toContain('Batch previews cannot be saved or exported');
    expect(button('Save project').disabled).toBe(true);
    click('Open B');
  }
  await vi.waitFor(() => expect(session.getDocument()?.id).toBe('B')); await ready();
  expect(document.body.textContent).not.toContain('Batch previews cannot be saved or exported');
  expect(button('Save project').disabled).toBe(false); expect(button('Export project').disabled).toBe(false);
  expect(get(generationState).result?.document).toEqual(session.getDocument());
});

async function startRealAI() {
  click('AI Tools (Gemini)');
  await vi.waitFor(() => expect(document.querySelector('.ai-toggle')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.ai-toggle')!.click(); await tick();
  button('⚡ Analyze').click(); await tick(); button('Analyze SVG').click();
}
it.each(['open', 'replace'])('real optimization A cannot replace clean B after %s', async transition => {
  let resolve!: (svg: string) => void;
  ai.optimize.mockReturnValue(new Promise<string>(yes => { resolve = yes; }));
  const { session } = setup(fixture('A')); await ready(); await startRealAI();
  expect(ai.optimize).toHaveBeenCalledTimes(1);
  if (transition === 'open') { await library(); click('Open B'); await prompt(); click('Discard changes'); }
  else session.replace(fixture());
  await vi.waitFor(() => expect(session.getDocument()?.id).toBe('B')); await ready();
  const snapshot = session.getDocument(), mesh = get(model)?.mesh, epoch = session.getSessionEpoch();
  resolve(svg); await tick(); await tick();
  expect(session.getDocument()).toBe(snapshot); expect(session.getSessionEpoch()).toBe(epoch); expect(get(model)?.mesh).toBe(mesh);
  expect(document.querySelector('dialog[open]')).toBeNull();
});
it('current real AI handoff survives its own revision reservation and publishes through workflow', async () => {
  ai.optimize.mockResolvedValue(svg);
  const { session } = setup(fixture('A')); await ready(); await startRealAI(); await prompt(); click('Discard changes');
  await vi.waitFor(() => expect(session.getDocument()?.name).toBe('generated-shape')); await ready();
  expect(session.getDocument()?.sketch.svg).toBe(svg); expect(get(generationState).result?.document).toEqual(session.getDocument());
});

async function startRealBatch() {
  click('Batch production');
  await vi.waitFor(() => expect(document.querySelector('.batch-mode .toggle-btn')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('.batch-mode .toggle-btn')!.click(); await tick();
  click('+ Add Current Design'); await tick(); click('Generate Atomic Batch');
}
function ownedBatch() {
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial(), mesh = new Group();
  mesh.add(new Mesh(geometry, material)); batch.mesh = mesh;
  return { mesh, geometry: vi.spyOn(geometry, 'dispose'), material: vi.spyOn(material, 'dispose') };
}
it('late real batch A cannot clear or publish over opened B and is disposed once', async () => {
  const { session } = setup(fixture('A')); await ready();
  const pending = deferred(), owned = ownedBatch(); batch.gate = () => pending.promise;
  await startRealBatch();
  await vi.waitFor(() => expect(document.body.textContent).toContain('Cancel (0/1)'));
  await library(); click('Open B'); await prompt(); click('Discard changes');
  await vi.waitFor(() => expect(session.getDocument()?.id).toBe('B')); await ready();
  const snapshot = session.getDocument(), epoch = session.getSessionEpoch(), preview = get(model)?.mesh;
  pending.resolve();
  await vi.waitFor(() => expect(owned.geometry).toHaveBeenCalledTimes(1));
  expect(owned.material).toHaveBeenCalledTimes(1);
  expect(session.getDocument()).toBe(snapshot); expect(session.getSessionEpoch()).toBe(epoch);
  expect(get(model)?.mesh).toBe(preview); expect(get(generationState).phase).toBe('ready');
  expect(document.body.textContent).not.toContain('Batch previews cannot be saved');
  expect(button('Save project').disabled).toBe(false);
});

it('batch validity is bound to producer start even while BatchMode stays mounted in session B', async () => {
  const { session } = setup(fixture('A')); await ready(); const pending = deferred(), owned = ownedBatch();
  batch.gate = () => pending.promise; await startRealBatch();
  await vi.waitFor(() => expect(document.body.textContent).toContain('Cancel (0/1)'));
  const panel = document.querySelector('.batch-mode'); session.replace(fixture('B')); await tick();
  expect(document.querySelector('.batch-mode')).toBe(panel);
  const snapshot = session.getDocument(), epoch = session.getSessionEpoch(); pending.resolve();
  await vi.waitFor(() => expect(owned.geometry).toHaveBeenCalledTimes(1));
  expect(owned.material).toHaveBeenCalledTimes(1); expect(session.getDocument()).toBe(snapshot); expect(session.getSessionEpoch()).toBe(epoch);
  await ready(); expect(get(generationState).result?.document).toEqual(snapshot); expect(get(model)?.mesh).not.toBe(owned.mesh);
  await library(); expect(button('Save project').disabled).toBe(false);
  expect(document.body.textContent).not.toContain('Batch previews cannot be saved');
});
it('session mutation during batch clear prevents publication and disposes the transferred result', async () => {
  const { session } = setup(fixture('A')); await ready();
  const pending = deferred(), entered = vi.fn(), owned = ownedBatch();
  schedules.clearGate = () => { entered(); return pending.promise; };
  await startRealBatch(); await vi.waitFor(() => expect(entered).toHaveBeenCalledTimes(1));
  session.updateParameters('cutter', { totalHeight: 37 }); const snapshot = session.getDocument();
  schedules.clearGate = undefined; pending.resolve(); await ready();
  await vi.waitFor(() => expect(owned.geometry).toHaveBeenCalledTimes(1));
  expect(owned.material).toHaveBeenCalledTimes(1); expect(session.getDocument()).toBe(snapshot);
  expect(get(model)?.mesh).not.toBe(owned.mesh); await library();
  expect(button('Save project').disabled).toBe(false);
});
it('new session during replacement tick retains filename and save eligibility without leaking the batch', async () => {
  const { session } = setup(fixture('A')); await ready(); const owned = ownedBatch();
  const unsubscribe = model.subscribe(value => { if (value?.mesh === owned.mesh) queueMicrotask(() => session.replace({ ...fixture('B'), source: { type: 'svg', svg, fileName: 'B.svg' } })); });
  try {
    await startRealBatch(); await vi.waitFor(() => expect(session.getDocument()?.id).toBe('B')); await ready();
    await vi.waitFor(() => expect(owned.geometry).toHaveBeenCalledTimes(1));
    expect(owned.material).toHaveBeenCalledTimes(1); expect(get(model)?.mesh).not.toBe(owned.mesh);
    expect(document.querySelector('.current-file')?.textContent).toBe('B.svg'); await library();
    expect(document.body.textContent).not.toContain('Batch previews cannot be saved'); expect(button('Save project').disabled).toBe(false);
  } finally { unsubscribe(); }
});


it('failed batch clear disposes its transferred unpublished result and reports the current error', async () => {
  setup(fixture('A')); await ready(); const owned = ownedBatch();
  schedules.clearGate = async () => { throw new Error('clear failed'); };
  await startRealBatch(); await vi.waitFor(() => expect(document.body.textContent).toContain('clear failed'));
  await vi.waitFor(() => expect(owned.geometry).toHaveBeenCalledTimes(1));
  expect(owned.material).toHaveBeenCalledTimes(1); expect(get(model)?.mesh).not.toBe(owned.mesh);
});
it('destroy during pending batch clear disposes App-owned unpublished mesh exactly once', async () => {
  setup(fixture('A')); await ready(); const pending = deferred(), entered = vi.fn(), owned = ownedBatch();
  schedules.clearGate = () => { entered(); return pending.promise; };
  await startRealBatch(); await vi.waitFor(() => expect(entered).toHaveBeenCalledTimes(1));
  await unmount(app!); app = undefined;
  await vi.waitFor(() => expect(owned.geometry).toHaveBeenCalledTimes(1));
  expect(owned.material).toHaveBeenCalledTimes(1); schedules.clearGate = undefined; pending.resolve(); await tick(); await tick();
  expect(owned.geometry).toHaveBeenCalledTimes(1); expect(owned.material).toHaveBeenCalledTimes(1); expect(get(model)).toBeNull();
});
it('starting raster B while source A awaits confirmation cancels A without clobbering B', async () => {
  const { session } = setup(fixture('original')); await ready();
  const snapshot = session.getDocument(), epoch = session.getSessionEpoch();
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  upload(input, new File(['a'], 'A.png', { type: 'image/png' }));
  await vi.waitFor(() => expect(raster.resolve).toBeDefined()); raster.resolve!(svg); await prompt();
  raster.resolve = undefined; upload(input, new File(['b'], 'B.png', { type: 'image/png' }));
  await vi.waitFor(() => expect(raster.resolve).toBeDefined());
  click('Discard changes'); await tick(); await tick();
  expect(session.getDocument()).toBe(snapshot); expect(session.getSessionEpoch()).toBe(epoch);
  raster.resolve!(svg); await prompt(); click('Discard changes');
  await vi.waitFor(() => expect(session.getDocument()?.source.fileName).toBe('B.png')); await ready();
});

it.each(['source', 'open', 'import'] as const)('pending raster B supersedes %s A during real guard-save without replacing A or aborting B', async transition => {
  const pending = deferred();
  const { session, put, records } = setup(fixture('original'), () => pending.promise); await ready();
  const snapshot = session.getDocument(), epoch = session.getSessionEpoch(), mesh = get(model)?.mesh;
  click('Upload design'); await tick();
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  if (transition === 'source') {
    upload(input, new File(['a'], 'A.png', { type: 'image/png' }));
    await vi.waitFor(() => expect(raster.resolve).toBeDefined()); raster.resolve!(svg);
  } else {
    await library();
    if (transition === 'open') click('Open B');
    else upload(document.querySelector<HTMLInputElement>('input[aria-label="Project file"]')!, new File([encodeProject(fixture('C'))], 'C.ccd.json', { type: 'application/json' }));
  }
  await prompt(); click('Save and continue');
  await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  click('Upload design'); await tick(); raster.resolve = undefined;
  const nextInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  upload(nextInput, new File(['b'], 'latest.png', { type: 'image/png' }));
  await vi.waitFor(() => expect(raster.resolve).toBeDefined());
  const vectorizeImage = (await import('../lib/utils/imageProcessor')).vectorizeImage;
  const signal = vi.mocked(vectorizeImage).mock.calls.at(-1)![1] as AbortSignal;
  pending.resolve();
  await vi.waitFor(() => expect(records.has('original')).toBe(true));
  await library();
  await vi.waitFor(() => expect(button('Save project').disabled).toBe(false));
  expect(session.getDocument()).toBe(snapshot); expect(session.getSessionEpoch()).toBe(epoch);
  expect(get(model)?.mesh).toBe(mesh); expect(signal.aborted).toBe(false);
  raster.resolve!(svg);
  await vi.waitFor(() => expect(session.getDocument()?.source.fileName).toBe('latest.png')); await ready();
  expect(get(generationState).result?.document).toEqual(session.getDocument());
  expect(document.querySelector('dialog[open]')).toBeNull();
});
