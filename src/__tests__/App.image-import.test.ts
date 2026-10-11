// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../App.svelte';
import { createDesignSessionStore } from '../lib/stores/designSessionStore';
import { createProjectStorage } from '../lib/projects/projectStorage';
import { createDesignDocument } from '../lib/projects/createDesignDocument';
import { createProjectRecoveryStorage } from '../lib/projects/projectRecoveryStorage';
import { generationState, model, setParams } from '../lib/stores/cookieCutterStore';
import { DEFAULT_PARAMS } from '../lib/types/CookieCutter';
import { encodeProject, decodeProject } from '../lib/projects/projectCodec';
vi.mock('../lib/components/viewer/ThreeViewer.svelte', async () => import('./fixtures/ThreeViewerStub.svelte'));
const photo = vi.hoisted(() => ({ calls: [] as { resolve: (result: import('../lib/import/photoImport').PhotoTraceResult) => void; signal?: AbortSignal }[] }));
vi.mock('../lib/import/photoImport', () => ({ preparePhoto: vi.fn((_file: File, _settings: unknown, signal?: AbortSignal) => new Promise(resolve => photo.calls.push({ resolve, signal }))) }));
const raster = vi.hoisted(() => ({ calls: [] as { resolve: (svg: string) => void; signal?: AbortSignal; preset?: string }[] }));
vi.mock('../lib/utils/imageProcessor', async original => ({
  ...await original<typeof import('../lib/utils/imageProcessor')>(),
  vectorizeImage: vi.fn((_file: File, signal?: AbortSignal, preset?: string) => new Promise<string>(resolve => raster.calls.push({ resolve, signal, preset })))
}));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>';
function photoResult(svg: string, canApply = true): import('../lib/import/photoImport').PhotoTraceResult { return { svg, diagnostics: { width: 100, height: 100, threshold: 128, components: 1, holes: 0, removedComponents: 0, filledHoles: 0, warnings: [], canApply } }; }
let app: ReturnType<typeof mount> | undefined;
function fixture(name = 'Original') { return createDesignDocument({ name, kind: 'cutter', source: { type: 'svg', fileName: `${name}.svg`, svg } }); }
function setup(initial: import('../lib/domain/designDocument').DesignDocument | null = null) {
  const session = createDesignSessionStore(initial);
  const other = fixture('Other');
  const storage = createProjectStorage({ put: async () => {}, get: async () => other, getAll: async () => [other], delete: async () => {}, close: async () => {} });
  const recovery = createProjectRecoveryStorage({ put: async () => {}, get: async () => undefined, getAll: async () => [], deleteExpected: async () => false, close: async () => {} });
  app = mount(App, { target: document.body.appendChild(document.createElement('div')), props: { projectSession: session, projectStorage: storage, projectRecoveryStorage: recovery } });
  return session;
}
function click(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === label || b.textContent?.trim() === label);
  expect(button, label).toBeDefined(); button!.click();
}
async function upload(file: File) {
  await vi.waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeNull());
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
function paste(files: File[], target: EventTarget = document.body, items?: { kind: string; getAsFile: () => File | null }[]) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files, items: items ?? [], getData: () => svg } });
  target.dispatchEvent(event); return event;
}
async function ready() { await vi.waitFor(() => expect(get(generationState).phase).toBe('ready'), { timeout: 10000 }); }
async function settled() { await tick(); await tick(); await new Promise(resolve => setTimeout(resolve, 10)); }
beforeEach(() => {
  raster.calls = [];
  photo.calls = [];
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo-test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(async () => { if (app) await unmount(app); vi.restoreAllMocks(); app = undefined; document.body.innerHTML = ''; setParams({ ...DEFAULT_PARAMS }); });
it('shows an explicit contrast default and photo choice before importing', async () => {
  setup();
  await vi.waitFor(() => expect(document.querySelector('select[aria-label="Vectorization preset"]')).not.toBeNull());
  const select = document.querySelector<HTMLSelectElement>('select[aria-label="Vectorization preset"]')!;
  expect(select.value).toBe('contrast');
  expect([...select.options].map(option => option.textContent)).toEqual(['Dessin contrasté', 'Photo — préparation guidée']);
});

function choosePreset(value: string) {
  const select = document.querySelector<HTMLSelectElement>('select[aria-label="Vectorization preset"]')!;
  for (const option of select.options) option.selected = option.value === value;
  select.dispatchEvent(new Event('change', { bubbles: true }));

}
it('revectorizes explicitly in session, preserving original source/identity/parameters and undo', async () => {
  const session = setup(); await upload(new File(['pixels'], 'original.png', { type: 'image/png' }));
  await vi.waitFor(() => expect(raster.calls).toHaveLength(1));
  expect(raster.calls[0].preset).toBe('contrast'); raster.calls[0].resolve(svg);
  await ready(); const original = session.getDocument()!;
  click('Upload design'); await tick(); choosePreset('photo'); await tick();
  expect(session.getDocument()).toBe(original);
  click('Revectorize current image'); await vi.waitFor(() => expect(photo.calls).toHaveLength(1), { timeout: 10000 });
  expect(raster.calls).toHaveLength(1);
  const changed = svg.replace('r="20"', 'r="25"'); photo.calls[0].resolve(photoResult(changed));
  await vi.waitFor(() => expect([...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Appliquer le contour photo')?.disabled).toBe(false));
  expect(session.getDocument()).toBe(original);
  click('Appliquer le contour photo');
  await vi.waitFor(() => expect(session.getDocument()?.sketch.svg).toBe(changed)); await ready();
  expect(session.getDocument()).toMatchObject({ id: original.id, source: original.source, name: original.name, parameters: original.parameters });
  expect(decodeProject(encodeProject(session.getDocument()!)).document).toEqual(session.getDocument());
  click('Parameters'); await tick(); click('Undo');
  await vi.waitFor(() => expect(session.getDocument()?.sketch.svg).toBe(original.sketch.svg));
});
it.each(['cancel', 'edit', 'replace'])('discards late retracing after %s', async transition => {
  const session = setup(); await upload(new File(['pixels'], 'original.png', { type: 'image/png' }));
  await vi.waitFor(() => expect(raster.calls).toHaveLength(1)); raster.calls[0].resolve(svg); await ready();
  click('Upload design'); await tick(); click('Revectorize current image');
  await vi.waitFor(() => expect(raster.calls).toHaveLength(2)); const pending = raster.calls[1];
  if (transition === 'cancel') click('Cancel image import');
  if (transition === 'edit') session.rename('Edited while tracing');
  if (transition === 'replace') session.replace(fixture('Replacement'));
  const accepted = session.getDocument(); pending.resolve(svg.replace('r="20"', 'r="25"')); await settled();
  expect(session.getDocument()).toBe(accepted);
});
it('requests original raster reimport after restoring a V1 project, never inventing pixels', async () => {
  const initial = createDesignDocument({ name: 'Reloaded', kind: 'cutter', source: { type: 'raster', fileName: 'original.png', mimeType: 'image/png', vectorizedSvg: svg } });
  setup(decodeProject(encodeProject(initial)).document); await tick();
  expect(document.body.textContent).toContain('Réimportez');
  expect([...document.querySelectorAll('button')].some(button => button.textContent === 'Revectorize current image')).toBe(false);
  expect(raster.calls).toHaveLength(0);
});
it('pastes one binary SVG through the canonical session pipeline, never text markup', async () => {
  const session = setup();
  expect(paste([]).defaultPrevented).toBe(false); await settled(); expect(session.getDocument()).toBeNull();
  expect(paste([new File([svg], 'pasted.SVG', { type: 'image/svg+xml' })]).defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(session.getDocument()?.source.type).toBe('svg'));
  expect(session.getDocument()?.source.fileName).toBe('pasted.SVG');
});
it('clipboard items fallback normalizes jpg alias and accepts WebP', async () => {
  const session = setup();
  const file = new File(['raster'], 'photo.jpg', { type: 'image/jpg' });
  paste([], document.body, [{ kind: 'file', getAsFile: () => file }]);
  await vi.waitFor(() => expect(raster.calls).toHaveLength(1)); raster.calls[0].resolve(svg);
  await vi.waitFor(() => expect(session.getDocument()?.source).toMatchObject({ type: 'raster', mimeType: 'image/jpeg' }));
});
it.each(['input', 'textarea', 'editable', 'editable-child'])('does not intercept %s paste', async kind => {
  const session = setup();
  const parent = document.body.appendChild(document.createElement(kind === 'input' || kind === 'textarea' ? kind : 'div'));
  if (kind.startsWith('editable')) parent.setAttribute('contenteditable', 'true');
  const target = kind === 'editable-child' ? parent.appendChild(document.createElement('span')) : parent;
  expect(paste([new File([svg], 'image.svg', { type: 'image/svg+xml' })], target).defaultPrevented).toBe(false);
  await settled(); expect(session.getDocument()).toBeNull(); expect(raster.calls).toHaveLength(0);
});
it.each([
  new File(['x'], 'deceptive.svg', { type: 'application/pdf' }),
  new File(['x'], 'deceptive.png', { type: 'image/gif' }),
  new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })
])('refuses invalid input $name with accessible error, preserving document/mesh/epoch', async file => {
  const session = setup(fixture()); await ready();
  const original = session.getDocument(), mesh = get(model)?.mesh, epoch = session.getSessionEpoch();
  await upload(file);
  await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/supported|10 MiB/i));
  expect(session.getDocument()).toBe(original); expect(session.getSessionEpoch()).toBe(epoch); expect(get(model)?.mesh).toBe(mesh); expect(raster.calls).toHaveLength(0);
});
it('rejects multiple pasted files explicitly rather than silently importing a batch or first file', async () => {
  const session = setup(); paste([new File([svg], 'one.svg'), new File([svg], 'two.svg')]);
  await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/one image/i));
  expect(session.getDocument()).toBeNull();
});
it('leaves a non-image binary clipboard alone', async () => {
  const session = setup();
  expect(paste([new File(['pdf'], 'notes.pdf', { type: 'application/pdf' })]).defaultPrevented).toBe(false);
  await settled(); expect(session.getDocument()).toBeNull();
  expect(document.querySelector('[role="alert"]')).toBeNull();
});
it('file and clipboard raster imports share the canonical sketch and round-trip V1 without original bytes', async () => {
  const session = setup(); const file = new File(['pixels'], 'same.webp', { type: 'image/webp' });
  await upload(file); await vi.waitFor(() => expect(raster.calls).toHaveLength(1)); raster.calls[0].resolve(svg);
  await vi.waitFor(() => expect(session.getDocument()?.source.type).toBe('raster'));
  const first = session.getDocument()!;
  click('Upload design'); await tick(); paste([file]);
  await vi.waitFor(() => expect(raster.calls).toHaveLength(2)); raster.calls[1].resolve(svg);
  await vi.waitFor(() => expect(document.querySelector('dialog[open]')).not.toBeNull()); click('Discard changes');
  await vi.waitFor(() => expect(session.getDocument()?.id).not.toBe(first.id));
  const second = session.getDocument()!;
  expect(second.source).toEqual(first.source); expect(second.sketch).toEqual(first.sketch);
  const encoded = encodeProject(second);
  expect(decodeProject(encoded).document).toEqual(second);
  expect(encoded).not.toContain('pixels'); expect(second.schemaVersion).toBe(1);
});
it('shows cancellable import progress and discards a late raster without touching dirty preview', async () => {
  const session = setup(fixture()); await ready();
  const original = session.getDocument(), mesh = get(model)?.mesh;
  await upload(new File(['r'], 'slow.webp', { type: 'image/webp' }));
  await vi.waitFor(() => expect(raster.calls).toHaveLength(1));
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Importing'); click('Cancel image import');
  expect(raster.calls[0].signal?.aborted).toBe(true); raster.calls[0].resolve(svg); await settled();
  expect(session.getDocument()).toBe(original); expect(get(model)?.mesh).toBe(mesh); expect(document.querySelector('dialog[open]')).toBeNull();
});
it.each(['new-image', 'shape', 'open', 'unmount'])('a late raster is invalidated by %s', async transition => {
  const session = setup(); await upload(new File(['r'], 'slow.png', { type: 'image/png' }));
  await vi.waitFor(() => expect(raster.calls).toHaveLength(1));
  const slow = raster.calls[0];
  if (transition === 'new-image') {
    await upload(new File([svg], 'latest.svg', { type: 'image/svg+xml' }));
    await vi.waitFor(() => expect(session.getDocument()?.source.fileName).toBe('latest.svg'));
  } else if (transition === 'shape') {
    click('Shape Library'); await tick(); click('Use Circle shape');
    await vi.waitFor(() => expect(session.getDocument()?.source.fileName).toBe('circle.svg'));
  } else if (transition === 'open') {
    click('Local projects'); await vi.waitFor(() => expect(document.querySelector('button[aria-label="Open Other"]')).not.toBeNull());
    click('Open Other'); await vi.waitFor(() => expect(session.getDocument()?.name).toBe('Other'));
  } else { await unmount(app!); app = undefined; }
  const accepted = session.getDocument(); slow.resolve(svg); await settled();
  expect(session.getDocument()).toBe(accepted); expect(slow.signal?.aborted).toBe(true);
});
it('opening a project invalidates conversion immediately, even while the dirty discard guard is pending', async () => {
  const session = setup(fixture()); await ready();
  await upload(new File(['r'], 'slow.png', { type: 'image/png' }));
  await vi.waitFor(() => expect(raster.calls).toHaveLength(1)); const slow = raster.calls[0];
  click('Local projects'); await vi.waitFor(() => expect(document.querySelector('button[aria-label="Open Other"]')).not.toBeNull());
  click('Open Other'); await vi.waitFor(() => expect(document.querySelector('dialog[open]')).not.toBeNull());
  expect(slow.signal?.aborted).toBe(true);
  slow.resolve(svg); await settled(); click('Discard changes');
  await vi.waitFor(() => expect(session.getDocument()?.name).toBe('Other'));
  expect(document.querySelector('dialog[open]')).toBeNull();
});
it('start screen routes to the existing shape library and local project library', async () => {
  setup(); await vi.waitFor(() => expect(document.querySelector('.start-screen')).not.toBeNull());
  click('Shapes'); await tick(); expect(document.querySelector('button[aria-label="Use Circle shape"]')).not.toBeNull();
  click('Upload design'); await vi.waitFor(() => expect(document.querySelector('.start-screen')).not.toBeNull()); click('Resume a project');
  await vi.waitFor(() => expect(document.querySelector('button[aria-label="Open Other"]')).not.toBeNull());
});
it('Cancel in the dirty import guard retains exact identity, source, mesh and epoch', async () => {
  const session = setup(fixture()); await ready();
  const original = session.getDocument(), mesh = get(model)?.mesh, epoch = session.getSessionEpoch();
  await upload(new File([svg], 'new.svg', { type: 'image/svg+xml' }));
  await vi.waitFor(() => expect(document.querySelector('dialog[open]')).not.toBeNull()); click('Cancel'); await settled();
  expect(session.getDocument()).toBe(original); expect(session.getDocument()?.source).toBe(original?.source); expect(get(model)?.mesh).toBe(mesh); expect(session.getSessionEpoch()).toBe(epoch);
});

it('photo import is a reviewed draft, not a silent replacement', async () => {
  const session = setup(); await tick(); choosePreset('photo'); await tick();
  await upload(new File(['photo'], 'camera.jpg', { type: 'image/jpeg' }));
  await vi.waitFor(() => expect(photo.calls).toHaveLength(1), { timeout: 10000 });
  expect(session.getDocument()).toBeNull(); expect(raster.calls).toHaveLength(0);
  photo.calls[0].resolve(photoResult(svg));
  await vi.waitFor(() => expect([...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Appliquer le contour photo')?.disabled).toBe(false));
  expect(session.getDocument()).toBeNull();
  click('Appliquer le contour photo');
  await vi.waitFor(() => expect(session.getDocument()?.source).toMatchObject({ type: 'raster', fileName: 'camera.jpg', mimeType: 'image/jpeg', vectorizedSvg: svg }));
  await ready(); expect(session.getDocument()?.sketch.svg).toBe(svg);
});

it('blocked photo and edited controls cannot apply an unreviewed contour', async () => {
  const session = setup(fixture()); await ready(); const original = session.getDocument();
  choosePreset('photo'); await tick(); await upload(new File(['photo'], 'camera.png', { type: 'image/png' }));
  await vi.waitFor(() => expect(photo.calls).toHaveLength(1), { timeout: 10000 });
  photo.calls[0].resolve(photoResult(svg, false)); await settled();
  const apply = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Appliquer le contour photo')!;
  expect(apply.disabled).toBe(true); apply.click(); expect(session.getDocument()).toBe(original);
  click('Recalculer l’aperçu photo'); await vi.waitFor(() => expect(photo.calls).toHaveLength(2));
  photo.calls[1].resolve(photoResult(svg)); await settled(); expect(apply.disabled).toBe(false);
  const noise = document.querySelector<HTMLInputElement>('[aria-label="Photo noise area"]')!;
  noise.value = '4'; noise.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  expect(apply.disabled).toBe(true); expect(session.getDocument()).toBe(original);
});

it.each(['cancel', 'edit', 'replace', 'unmount'])('photo review discards late output after %s', async transition => {
  const session = setup(fixture()); await ready(); choosePreset('photo'); await tick();
  await upload(new File(['photo'], 'camera.jpg', { type: 'image/jpeg' }));
  await vi.waitFor(() => expect(photo.calls).toHaveLength(1), { timeout: 10000 });
  const pending = photo.calls[0];
  if (transition === 'cancel') click('Annuler la préparation photo');
  if (transition === 'edit') session.rename('Edited while preparing');
  if (transition === 'replace') session.replace(fixture('Replacement'));
  if (transition === 'unmount') { await unmount(app!); app = undefined; }
  const accepted = session.getDocument(); await settled();
  expect(pending.signal?.aborted).toBe(true);
  pending.resolve(photoResult(svg.replace('r="20"', 'r="25"'))); await settled();
  expect(session.getDocument()).toBe(accepted);
});

it('photo setting changes cancel in-flight computation and ignore its reply', async () => {
  const session = setup(); await tick(); choosePreset('photo'); await tick();
  await upload(new File(['photo'], 'camera.jpg', { type: 'image/jpeg' }));
  await vi.waitFor(() => expect(photo.calls).toHaveLength(1), { timeout: 10000 });
  const pending = photo.calls[0];
  const noise = document.querySelector<HTMLInputElement>('[aria-label="Photo noise area"]')!;
  noise.value = '4'; noise.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  expect(pending.signal?.aborted).toBe(true);
  pending.resolve(photoResult(svg)); await settled();
  const apply = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Appliquer le contour photo')!;
  expect(apply.disabled).toBe(true); expect(session.getDocument()).toBeNull();
});
