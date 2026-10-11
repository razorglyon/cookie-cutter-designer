// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../App.svelte';
import { createDesignSessionStore } from '../lib/stores/designSessionStore';
import { createDesignDocument } from '../lib/projects/createDesignDocument';
import { createProjectStorage } from '../lib/projects/projectStorage';
import { encodeProject } from '../lib/projects/projectCodec';
import { generationState, params, setParams } from '../lib/stores/cookieCutterStore';
import { historyStore } from '../lib/stores/historyStore';
import { DEFAULT_PARAMS } from '../lib/types/CookieCutter';
vi.mock('../lib/components/viewer/ThreeViewer.svelte', async () => import('./fixtures/ThreeViewerStub.svelte'));
let app: ReturnType<typeof mount> | undefined;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>';
function fixture(id: string) {
  return { ...createDesignDocument({ name: id, kind: 'cutter', source: { type: 'svg', fileName: `${id}.svg`, svg } }),
    id, createdAt: '2026-10-09T10:00:00.000Z', updatedAt: '2026-10-09T10:00:00.000Z' };
}
function setup() {
  const session = createDesignSessionStore(fixture('A'), { now: () => '2026-10-09T12:00:00.000Z' });
  const records = new Map<string, import('../lib/domain/designDocument').DesignDocument>([['B', fixture('B')]]);
  const storage = createProjectStorage({ put: async doc => { records.set(doc.id, doc); }, get: async id => records.get(id), getAll: async () => [...records.values()], delete: async id => { records.delete(id); } });
  app = mount(App, { target: document.body.appendChild(document.createElement('div')), props: { projectSession: session, projectStorage: storage } });
  return { session, records };
}
function button(label: string) {
  const result = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label);
  expect(result, label).toBeDefined();
  return result!;
}
async function click(label: string) { button(label).click(); await tick(); }
async function parameters() {
  await vi.waitFor(() => expect(get(generationState).phase).toBe('ready'), { timeout: 10000 });
  await click('Parameters');
}
async function dirty(expected: boolean) {
  await click('Local projects');
  expect(document.querySelector('.project-manager [role="status"]')?.textContent).toBe(expected ? 'Unsaved changes' : 'Saved locally');
}
async function editSize(value: number) {
  await parameters();
  const input = document.querySelector<HTMLInputElement>('#targetSize')!;
  expect(input).not.toBeNull();
  input.value = String(value); input.dispatchEvent(new Event('change', { bubbles: true })); await tick();
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(async () => { if (app) await unmount(app); app = undefined; document.body.innerHTML = ''; historyStore.clear(); setParams({ ...DEFAULT_PARAMS }); });
it('real Undo/Redo returns to the exact saved codec and clean workflow in the same session', async () => {
  const { session, records } = setup();
  await click('Local projects'); await click('Save project');
  await vi.waitFor(() => expect(document.querySelector('.project-manager [role="status"]')?.textContent).toBe('Saved locally'));
  const saved = session.getDocument()!; const codecA = encodeProject(records.get('A')); const epoch = session.sessionEpoch;
  await editSize(90);
  // Include a sketch revision: history must not issue fresh mutation commands on restore.
  session.updateSketch(svg.replace('r="20"', 'r="25"')); await tick();
  const edited = session.getDocument()!; const codecB = encodeProject(edited);
  await dirty(true); await parameters();
  await click('Undo'); await click('Undo');
  expect(encodeProject(session.getDocument())).toBe(codecA);
  expect(get(params).targetSize).toBe(saved.parameters.targetSize);
  await vi.waitFor(() => expect(get(generationState).result?.document).toEqual(saved), { timeout: 10000 });
  await dirty(false); await parameters(); await click('Redo'); await click('Redo');
  expect(encodeProject(session.getDocument())).toBe(codecB);
  await dirty(true);
  expect(session.sessionEpoch).toBe(epoch);
  expect(session.getDocument()?.id).toBe(saved.id);
  expect(session.getDocument()?.source).toEqual(saved.source);
  expect(session.getDocument()?.createdAt).toBe(saved.createdAt);
});
it('records rename and viewport interleaved with geometry, rather than silently rolling metadata back', async () => {
  const { session } = setup();
  await click('Local projects'); await click('Save project');
  await vi.waitFor(() => expect(document.querySelector('.project-manager [role="status"]')?.textContent).toBe('Saved locally'));
  const saved = session.getDocument()!;
  await editSize(90); const geometry = session.getDocument()!;
  await click('Local projects');
  const name = document.querySelector<HTMLInputElement>('#project-name')!;
  name.value = 'Renamed'; name.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  const renamed = session.getDocument()!;
  session.updateViewport({ showGrid: false, showAxes: true }); await tick(); const viewport = session.getDocument()!;
  await editSize(95); const latest = session.getDocument()!;
  for (const snapshot of [viewport, renamed, geometry, saved]) {
    await parameters(); await click('Undo');
    expect(encodeProject(session.getDocument())).toBe(encodeProject(snapshot));
  }
  await dirty(false);
  for (const snapshot of [geometry, renamed, viewport, latest]) {
    await parameters(); await click('Redo');
    expect(encodeProject(session.getDocument())).toBe(encodeProject(snapshot));
  }
  await dirty(true);
});
it('opening B clears A history and Undo cannot cross project boundaries', async () => {
  const { session } = setup();
  await editSize(90); await click('Local projects'); await click('Save project');
  await vi.waitFor(() => expect(document.querySelector('.project-manager [role="status"]')?.textContent).toBe('Saved locally'));
  await vi.waitFor(() => expect(document.querySelector('button[aria-label="Open B"]')).not.toBeNull());
  await click('Open B');
  await vi.waitFor(() => expect(session.getDocument()?.id).toBe('B'));
  const opened = encodeProject(session.getDocument());
  await parameters();
  expect(button('Undo').disabled).toBe(true);
  await click('Undo'); expect(encodeProject(session.getDocument())).toBe(opened);
  await editSize(95); await parameters(); await click('Undo');
  expect(encodeProject(session.getDocument())).toBe(opened);
  await dirty(false);
});
it('keeps a newer metadata edit made by a restore observer in exact scoped history', async () => {
  const { session } = setup();
  await editSize(90);
  const saved = historyStore.getCurrentState()!;
  let armed = true;
  const unsubscribe = session.subscribe(snapshot => {
    if (armed && snapshot?.parameters.targetSize === 75) {
      armed = false;
      session.rename('Observer rename');
    }
  });
  await parameters(); await click('Undo');
  const renamed = session.getDocument()!;
  expect(renamed.name).toBe('Observer rename');
  expect(historyStore.getCurrentState()?.document).toBe(renamed);
  expect(historyStore.getCurrentState()?.sessionEpoch).toBe(session.sessionEpoch);
  expect(historyStore.canRedo()).toBe(false);
  unsubscribe();
  await parameters(); await click('Undo');
  expect(session.getDocument()?.name).toBe('A');
  await parameters(); await click('Redo');
  expect(encodeProject(session.getDocument())).toBe(encodeProject(renamed));
  expect(encodeProject(session.getDocument())).not.toBe(encodeProject(saved.document));
});

it.each(['same-id', 'other-id', 'clear'])('invalidates exact scoped history after external %s', async action => {
  const { session } = setup();
  await editSize(90);
  const oldEpoch = session.sessionEpoch; const oldSnapshot = session.getDocument()!;
  if (action === 'clear') session.clear();
  else session.replace({ ...fixture('A'), id: action === 'same-id' ? 'A' : 'C' });
  await tick(); const replacement = session.getDocument();
  expect(historyStore.canUndo()).toBe(false);
  expect(historyStore.canRedo()).toBe(false);
  expect(() => session.restoreHistory(oldSnapshot, oldEpoch)).toThrow();
  expect(session.getDocument()).toBe(replacement);
  expect(historyStore.getLength()).toBe(action === 'clear' ? 0 : 1);
});
