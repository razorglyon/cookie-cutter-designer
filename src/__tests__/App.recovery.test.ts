// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import App from '../App.svelte';
import { createDesignSessionStore } from '../lib/stores/designSessionStore';
import { createDesignDocument } from '../lib/projects/createDesignDocument';
import { createProjectStorage } from '../lib/projects/projectStorage';
import { createProjectRecoveryStorage, canonicalProjectRecoverySnapshot, parseProjectRecoveryEnvelope, type ProjectRecoveryEnvelope } from '../lib/projects/projectRecoveryStorage';
import { generationState, model, setParams } from '../lib/stores/cookieCutterStore';
import { historyStore } from '../lib/stores/historyStore';
import { DEFAULT_PARAMS } from '../lib/types/CookieCutter';
import { Group } from 'three';
vi.mock('../lib/components/viewer/ThreeViewer.svelte', async () => import('./fixtures/ThreeViewerStub.svelte'));
const raster = vi.hoisted(() => ({ started: vi.fn() }));
vi.mock('../lib/utils/imageProcessor', async original => ({ ...await original<typeof import('../lib/utils/imageProcessor')>(), vectorizeImage: vi.fn(() => { raster.started(); return new Promise<string>(() => {}); }) }));
const batch = vi.hoisted(() => ({ mesh: undefined as import('three').Group | undefined }));
vi.mock('../lib/utils/batchProcessor', async original => ({ ...await original<typeof import('../lib/utils/batchProcessor')>(), createBatch: vi.fn(async () => ({ mesh: batch.mesh, report: { succeeded: 1 }, totalDimensions: { width: 10, height: 10 } })) }));
let app: ReturnType<typeof mount> | undefined;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>';
function fixture(name = 'Recovered A') {
  const doc = createDesignDocument({ name, kind: 'cutter', source: { type: 'svg', fileName: 'original.svg', svg } });
  if (doc.kind !== 'cutter') throw new Error('Expected a Cutter fixture');
  return { ...doc, sketch: { svg: svg.replace('r="20"', 'r="25"'), revision: 7 }, parameters: { ...doc.parameters, totalHeight: 29 }, viewport: { showGrid: false, showAxes: true, showWallThickness: true } };
}
function envelope(): ProjectRecoveryEnvelope { return parseProjectRecoveryEnvelope({ format: 'cookie-cutter-designer-recovery', version: 1, draftId: '11111111-1111-4111-8111-111111111111', savedAt: '2026-10-09T12:00:00.000Z', document: fixture() }); }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }
function setup(initial: unknown = null, options: { empty?: boolean; read?: () => Promise<void>; put?: () => Promise<void>; list?: () => Promise<void>; projectPut?: () => Promise<void> } = {}) {
  const session = createDesignSessionStore(initial), expected = envelope();
  const drafts = new Map<string, ProjectRecoveryEnvelope>(options.empty ? [] : [[expected.draftId, expected]]);
  const saved = new Map<string, import('../lib/domain/designDocument').DesignDocument>([['B', { ...fixture('Library B'), id: 'B' }]]);
  const put = vi.fn(async (record: ProjectRecoveryEnvelope) => { await options.put?.(); drafts.set(record.draftId, record); });
  const read = vi.fn(async (id: string) => { await options.read?.(); return drafts.get(id); });
  const close = vi.fn(async () => {});
  const deletion = vi.fn(async (record: ProjectRecoveryEnvelope) => {
    const current = drafts.get(record.draftId);
    if (!current || canonicalProjectRecoverySnapshot(current) !== canonicalProjectRecoverySnapshot(record)) return false;
    drafts.delete(record.draftId); return true;
  });
  const storage = createProjectRecoveryStorage({ put, get: read, getAll: async () => { await options.list?.(); return [...drafts.values()]; }, deleteExpected: deletion, close });
  const projectPut = vi.fn(async (doc: import('../lib/domain/designDocument').DesignDocument) => { await options.projectPut?.(); saved.set(doc.id, doc); });
  const projectStorage = createProjectStorage({ put: projectPut, get: async id => saved.get(id), getAll: async () => [...saved.values()], delete: async id => { saved.delete(id); } });
  app = mount(App, { target: document.body.appendChild(document.createElement('div')), props: { projectSession: session, projectStorage, projectRecoveryStorage: storage } });
  return { session, expected, drafts, saved, put, read, close, deletion, projectPut };
}
function button(label: string) { const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === label || b.textContent?.trim() === label); expect(found, label).toBeDefined(); return found!; }
function click(label: string) { button(label).click(); }
function resume() { return document.querySelector<HTMLButtonElement>('button[data-recovery-resume]')!; }
function remove() { return document.querySelector<HTMLButtonElement>('button[data-recovery-delete]')!; }
async function listed() { await vi.waitFor(() => expect(resume()).not.toBeNull()); }
async function prompt() { await vi.waitFor(() => expect(document.querySelector('dialog[open]')).not.toBeNull()); }
async function ready() { await vi.waitFor(() => expect(get(generationState).phase).toBe('ready'), { timeout: 10000 }); }
beforeEach(() => {
  raster.started.mockClear();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(async () => { if (app) await unmount(app); app = undefined; document.body.innerHTML = ''; setParams({ ...DEFAULT_PARAMS }); });
it('lists recovery on startup without auto-restoring or writing', async () => {
  const { session, put, expected } = setup(); await listed();
  expect(document.body.textContent).toContain(expected.document.name);
  expect(session.getDocument()).toBeNull(); expect(put).not.toHaveBeenCalled();
  expect(document.querySelectorAll('[aria-label="Brouillons de récupération"]')).toHaveLength(1);
});
it('keeps empty startup unobstructed and exposes the empty recovery list from Local projects', async () => {
  const { session, put } = setup(null, { empty: true }); await tick(); await tick();
  expect(document.querySelector('[aria-label="Brouillons de récupération"]')).toBeNull(); expect(session.getDocument()).toBeNull(); expect(put).not.toHaveBeenCalled();
  click('Projets locaux'); await vi.waitFor(() => expect(document.body.textContent).toContain('Aucun brouillon de récupération dans ce navigateur'));
  expect(button('Actualiser les brouillons de récupération').disabled).toBe(false);
});
it('resumes the exact stored document through the real orchestrator as dirty, retaining library and source draft', async () => {
  const { session, expected, saved, drafts, projectPut } = setup(); const libraryBefore = JSON.stringify([...saved]); await listed(); resume().click();
  await vi.waitFor(() => expect(session.getDocument()).toEqual(expected.document)); await ready();
  expect(get(generationState).result?.document).toEqual(expected.document);
  expect(drafts.get(expected.draftId)).toEqual(expected); expect(JSON.stringify([...saved])).toBe(libraryBefore); expect(projectPut).not.toHaveBeenCalled();
  click('Projets locaux'); await tick(); expect(document.body.textContent).toContain('Modifications non enregistrées');
});
it('cancel resume retains document, epoch, history, generation and drafts', async () => {
  const { session, drafts, expected } = setup(fixture('Current')); await ready(); await listed();
  const doc = session.getDocument(), epoch = session.getSessionEpoch(), mesh = get(model)?.mesh, history = get(historyStore);
  resume().click(); await prompt(); expect(document.activeElement?.getAttribute('data-choice')).toBe('cancel'); click('Annuler');
  await vi.waitFor(() => expect(resume().disabled).toBe(false));
  expect(session.getDocument()).toBe(doc); expect(session.getSessionEpoch()).toBe(epoch); expect(get(historyStore)).toEqual(history); expect(get(model)?.mesh).toBe(mesh); expect(drafts.get(expected.draftId)).toEqual(expected);
});
it.each(['rename', 'viewport', 'params', 'replace', 'raster', 'open'] as const)('rejects delayed recovery after %s supersedes its captured context', async change => {
  const gate = deferred(); const { session, read } = setup(fixture('Current'), { read: () => gate.promise }); await listed(); resume().click();
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  if (change === 'rename') session.rename('Latest');
  else if (change === 'viewport') session.updateViewport({ showGrid: true, showAxes: false, showWallThickness: false });
  else if (change === 'params') session.updateParameters('cutter', { totalHeight: 37 });
  else if (change === 'replace') session.replace(fixture('B'));
  else if (change === 'open') { click('Projets locaux'); await vi.waitFor(() => expect(document.querySelector('button[aria-label="Ouvrir Library B"]')).not.toBeNull()); click('Ouvrir Library B'); await prompt(); click('Ignorer les modifications'); await vi.waitFor(() => expect(session.getDocument()?.id).toBe('B')); }
  else { const input = document.querySelector<HTMLInputElement>('input[type="file"]')!; Object.defineProperty(input, 'files', { value: [new File(['x'], 'new.png', { type: 'image/png' })] }); input.dispatchEvent(new Event('change', { bubbles: true })); await vi.waitFor(() => expect(raster.started).toHaveBeenCalledTimes(1)); }
  const latest = session.getDocument(), epoch = session.getSessionEpoch(); gate.resolve();
  await vi.waitFor(() => expect(resume().disabled).toBe(false));
  expect(session.getDocument()).toBe(latest); expect(session.getSessionEpoch()).toBe(epoch); expect(document.querySelector('dialog[open]')).toBeNull();
});
it('refuses a changed record rather than restoring a newer undisplayed version and refreshes', async () => {
  const { session, expected, drafts } = setup(); await listed();
  drafts.set(expected.draftId, parseProjectRecoveryEnvelope({ ...expected, savedAt: '2026-10-10T12:00:00Z', document: fixture('Changed draft') })); resume().click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('a changé')); expect(session.getDocument()).toBeNull();
  await vi.waitFor(() => expect(resume().getAttribute('aria-label')).toContain('Changed draft'));
});
it('locks resume before the next Svelte tick', async () => {
  const gate = deferred(); const { read } = setup(null, { read: () => gate.promise }); await listed(); const control = resume(); control.click(); control.click(); expect(read).toHaveBeenCalledTimes(1); gate.resolve();
  await vi.waitFor(() => expect(resume().disabled).toBe(false));
});
it('the synchronous handler rejects a stale enabled resume button once the workflow is busy', async () => {
  const { read } = setup(fixture('Current')); await listed(); const stale = resume(); click('Créer un nouveau dessin'); stale.click();
  expect(read).not.toHaveBeenCalled(); await prompt(); expect(resume().disabled).toBe(true); click('Annuler'); await vi.waitFor(() => expect(resume().disabled).toBe(false));
});
it('delete cancellation performs no mutation; confirmation deletes and focuses refresh', async () => {
  const { drafts, deletion } = setup(); await listed(); remove().click(); await prompt(); click('Annuler');
  await vi.waitFor(() => expect(remove().disabled).toBe(false)); expect(deletion).not.toHaveBeenCalled(); expect(drafts.size).toBe(1);
  remove().focus(); remove().click(); await prompt(); click('Supprimer le brouillon');
  await vi.waitFor(() => expect(drafts.size).toBe(0)); await vi.waitFor(() => expect(document.activeElement).toBe(button('Actualiser les brouillons de récupération')));
});
it('delete binds the displayed version through the prompt and guards double click', async () => {
  const { expected, drafts, deletion } = setup(); await listed(); const control = remove(); control.click(); control.click(); await prompt();
  drafts.set(expected.draftId, parseProjectRecoveryEnvelope({ ...expected, document: fixture('Changed draft') })); click('Supprimer le brouillon');
  await vi.waitFor(() => expect(deletion).toHaveBeenCalledTimes(1)); expect(drafts.get(expected.draftId)?.document.name).toBe('Changed draft');
  await vi.waitFor(() => expect(document.body.textContent).toContain('Recovery snapshot changed or missing')); await vi.waitFor(() => expect(resume().getAttribute('aria-label')).toContain('Changed draft'));
});
it('unmount drains a pending accepted snapshot before storage close, without waiting 750ms', async () => {
  const gate = deferred(); const { session, put, close, drafts } = setup(null, { put: () => gate.promise }); await listed();
  session.replace(fixture('Last gesture')); const expected = JSON.parse(JSON.stringify(session.getDocument()));
  await tick(); expect(document.body.textContent).toContain('Récupération en attente'); expect(put).not.toHaveBeenCalled();
  await unmount(app!); app = undefined; await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1)); expect(close).not.toHaveBeenCalled(); gate.resolve();
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect([...drafts.values()].some(d => JSON.stringify(d.document) === JSON.stringify(expected))).toBe(true);
});
it('same-turn last gesture is accepted synchronously before teardown', async () => {
  const { session, put, close } = setup(); await listed(); session.replace(fixture('Last gesture')); await unmount(app!); app = undefined;
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(put).toHaveBeenCalledTimes(1); expect(put.mock.calls[0][0].document.name).toBe('Last gesture');
});
it.each(['get', 'dialog'] as const)('unmount cancels late %s without replacing or deleting', async pending => {
  const gate = deferred(); const { session, read, deletion, drafts } = setup(null, { read: () => gate.promise }); await listed();
  if (pending === 'get') { resume().click(); await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1)); }
  else { remove().click(); await prompt(); }
  await unmount(app!); app = undefined; gate.resolve(); await tick(); await tick();
  expect(session.getDocument()).toBeNull(); expect(deletion).not.toHaveBeenCalled(); expect(drafts.size).toBe(1); expect(document.querySelector('dialog')).toBeNull();
});
it('explicit save retains recovery drafts and independent saved-local status', async () => {
  const { expected, drafts } = setup(); await listed(); resume().click(); await ready();
  window.dispatchEvent(new Event('pagehide')); await vi.waitFor(() => expect(drafts.size).toBe(2));
  click('Projets locaux'); await tick(); click('Enregistrer le projet'); await vi.waitFor(() => expect(document.body.textContent).toContain('Enregistré localement'));
  expect(drafts.get(expected.draftId)).toEqual(expected); expect(drafts.size).toBe(2); expect(document.body.textContent).toContain('Récupération enregistrée');
});
it('recovery storage failure keeps project export backup available and retry works', async () => {
  let fail = true; const { drafts } = setup(fixture('Current'), { put: async () => { if (fail) throw new Error('recovery disk full'); } }); await listed();
  click('Réessayer l’enregistrement de récupération'); await vi.waitFor(() => expect(document.body.textContent).toContain('recovery disk full')); click('Projets locaux'); await tick();
  expect(button('Exporter le projet').disabled).toBe(false); const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); click('Exporter le projet');
  await vi.waitFor(() => expect(anchor).toHaveBeenCalledTimes(1)); fail = false; click('Réessayer l’enregistrement de récupération'); await vi.waitFor(() => expect(drafts.size).toBe(2)); anchor.mockRestore();
});
it.each(['rename', 'raster'] as const)('rejects edits and source starts during the unsaved-changes resume prompt (%s)', async change => {
  const { session, expected, drafts } = setup(fixture('Current')); await listed(); resume().click(); await prompt();
  if (change === 'rename') session.rename('Latest while prompting');
  else {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'latest.png', { type: 'image/png' })] });
    input.dispatchEvent(new Event('change', { bubbles: true })); await vi.waitFor(() => expect(raster.started).toHaveBeenCalledTimes(1));
  }
  const latest = session.getDocument(), epoch = session.getSessionEpoch(); click('Ignorer les modifications');
  await vi.waitFor(() => expect(resume().disabled).toBe(false)); expect(session.getDocument()).toBe(latest); expect(session.getSessionEpoch()).toBe(epoch); expect(drafts.get(expected.draftId)).toEqual(expected);
});
it('failed save-and-resume keeps the workflow error visible on startup and never replaces the session', async () => {
  const { session, expected, drafts } = setup(fixture('Current'), { projectPut: async () => { throw new Error('project write blocked'); } }); await listed();
  const latest = session.getDocument(), epoch = session.getSessionEpoch(); resume().click(); await prompt(); click('Enregistrer et continuer');
  await vi.waitFor(() => expect(resume().disabled).toBe(false)); expect(document.querySelector('[role="alert"]')?.textContent).toContain('project write blocked'); expect(session.getDocument()).toBe(latest); expect(session.getSessionEpoch()).toBe(epoch); expect(drafts.get(expected.draftId)).toEqual(expected);
});
it('read failure is local to the recovery action and refresh allows an explicit retry', async () => {
  let fail = true; const { session } = setup(null, { read: async () => { if (fail) throw new Error('recovery read blocked'); } }); await listed(); resume().click();
  await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain('recovery read blocked')); expect(session.getDocument()).toBeNull(); expect(document.querySelector('.alert-error')).toBeNull();
  fail = false; click('Actualiser les brouillons de récupération'); await vi.waitFor(() => expect(resume().disabled).toBe(false)); resume().click(); await vi.waitFor(() => expect(session.getDocument()?.name).toBe('Recovered A'));
});
it('hidden/pagehide flush accepted writes best-effort and removes both listeners on unmount', async () => {
  const { session, put, close } = setup(); await listed();
  const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  try {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); session.replace(fixture('Hidden A')); document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1)); session.rename('Pagehide B'); window.dispatchEvent(new Event('pagehide')); await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    await unmount(app!); app = undefined; await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1)); const writes = put.mock.calls.length;
    session.rename('After destroy'); window.dispatchEvent(new Event('pagehide')); document.dispatchEvent(new Event('visibilitychange')); await tick(); expect(put).toHaveBeenCalledTimes(writes);
  } finally { if (visibility) Object.defineProperty(document, 'visibilityState', visibility); else Reflect.deleteProperty(document, 'visibilityState'); }
});
it('observes the latest canonical snapshot after a reentrant same-epoch edit, never a queued stale value', async () => {
  const { session, put } = setup(); await listed();
  const unsubscribe = session.subscribe(doc => { if (doc?.name === 'Intermediate') session.rename('Reentrant latest'); });
  try { session.replace(fixture('Intermediate')); window.dispatchEvent(new Event('pagehide')); await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1)); expect(put.mock.calls[0][0].document).toEqual(session.getDocument()); expect(put.mock.calls[0][0].document.name).toBe('Reentrant latest'); }
  finally { unsubscribe(); }
});
it('a nonrepresentable batch suspends new captures without losing the last accepted canonical draft', async () => {
  const { session, put, close } = setup(fixture('Current')); await ready(); session.rename('Accepted before batch'); const expected = JSON.parse(JSON.stringify(session.getDocument())); batch.mesh = new Group(); click('Production en série');
  await vi.waitFor(() => expect(document.querySelector('.batch-mode .toggle-btn')).not.toBeNull()); document.querySelector<HTMLButtonElement>('.batch-mode .toggle-btn')!.click(); await tick(); click('+ Ajouter le dessin actuel'); await tick(); click('Générer la série complète');
  await vi.waitFor(() => expect(get(model)?.mesh).toBe(batch.mesh)); session.rename('Not representable now'); await tick();
  await unmount(app!); app = undefined; await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(put.mock.calls.at(-1)?.[0].document).toEqual(expected);
});
