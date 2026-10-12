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
import type { DesignDocument } from '../lib/domain/designDocument';

// Only GPU rendering is stubbed; the document, history, recipe and serializers are real.
vi.mock('../lib/components/viewer/ThreeViewer.svelte', async () => import('./fixtures/ThreeViewerStub.svelte'));
let app: ReturnType<typeof mount> | undefined;
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  document.body.innerHTML = '';
  historyStore.clear();
  resetParams();
});

const outer = '<path d="M0 0 L100 0 L100 100 L0 100 Z"/>';
const island = '<path d="M35 35 L65 35 L65 65 L35 65 Z"/>';
function fixture(version: 1 | 2): DesignDocument {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120">${outer}${version === 2 ? island : ''}</svg>`;
  const base = createDesignDocument({ name: `Wall V${version}`, kind: 'cutter', source: { type: 'svg', fileName: 'wall.svg', svg } });
  if (base.kind !== 'cutter') throw new Error('Expected Cutter');
  const initial = { ...base, parameters: { ...base.parameters, wallThickness: 1.3, taperAngle: 6 } };
  return version === 2 ? { ...initial, schemaVersion: 2, bridges: [{ id: 'bridge-1', from: { x: 0, y: 50 }, to: { x: 35, y: 50 }, widthMm: 2 }] } : initial;
}
function setup(initial: DesignDocument | null, records: Map<string, DesignDocument>) {
  const session = createDesignSessionStore(initial);
  const storage = createProjectStorage({
    put: async doc => { records.set(doc.id, structuredClone(doc)); },
    get: async id => records.get(id), getAll: async () => [...records.values()],
    delete: async id => { records.delete(id); }
  });
  app = mount(App, { target: document.body.appendChild(document.createElement('div')), props: { projectSession: session, projectStorage: storage } });
  return session;
}
function button(label: string) {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    ?? [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label);
  expect(found, label).toBeDefined();
  return found!;
}
async function click(label: string) { button(label).click(); await tick(); }
async function ready(session: ReturnType<typeof createDesignSessionStore>) {
  await vi.waitFor(() => {
    const state = get(generationState);
    expect(state.phase).toBe('ready');
    // The orchestrator validates/clones its input; content equality is the contract.
    expect(state.result?.document).toEqual(session.getDocument());
  }, { timeout: 10000 });
}
function stl() {
  const result = serializeSTL(get(model)!.mesh, true);
  if (!(result instanceof DataView)) throw new Error('Expected binary STL');
  return new Uint8Array(result.buffer, result.byteOffset, result.byteLength).slice();
}

it.each([1, 2] as const)('V%s profiles use one history step and the same document for actual geometry, codec, save and reopen', async version => {
  const records = new Map<string, DesignDocument>();
  let session = setup(fixture(version), records);
  await ready(session);
  await click('Réglages');
  for (const profile of [
    { id: 'thin', wallThickness: 0.8, taperAngle: 5 },
    { id: 'standard', wallThickness: 1, taperAngle: 7 },
    { id: 'robust', wallThickness: 1.5, taperAngle: 10 }
  ]) {
    const before = session.getDocument()!;
    const previousCodec = encodeProject(before);
    const length = historyStore.getLength();
    const control = document.querySelector<HTMLButtonElement>(`[data-wall-profile="${profile.id}"]`);
    expect(control).not.toBeNull();
    control!.click();
    await tick();
    const current = session.getDocument()!;
    expect(current.parameters).toEqual({ ...before.parameters, wallThickness: profile.wallThickness, taperAngle: profile.taperAngle });
    expect(current.source).toEqual(before.source);
    expect(current.sketch).toEqual(before.sketch);
    expect(current.schemaVersion).toBe(version);
    if (current.schemaVersion === 2 && before.schemaVersion === 2) expect(current.bridges).toEqual(before.bridges);
    expect(historyStore.getLength()).toBe(length + 1);
    await ready(session);
    expect(get(model)?.params).toEqual(current.parameters);
    expect(get(model)?.mesh.userData.params).toEqual(current.parameters);
    const artifact = get(generationState).result!.artifacts[0];
    expect(artifact.validation.valid).toBe(true);
    expect(artifact.validation.shells).toBe(1);
    expect(artifact.dimensionsMm.height).toBeCloseTo(current.parameters.totalHeight, 5);
    const binary = stl();
    expect(binary.byteLength).toBe(84 + 50 * new DataView(binary.buffer).getUint32(80, true));
    const codec = encodeProject(current);
    await click('Annuler');
    expect(encodeProject(session.getDocument())).toBe(previousCodec);
    await ready(session);
    await click('Rétablir');
    expect(encodeProject(session.getDocument())).toBe(codec);
    await ready(session);
    expect(stl()).toEqual(binary);
  }
  const saved = session.getDocument()!;
  const savedStl = stl();
  await click('Projets locaux');
  await click('Enregistrer le projet');
  await vi.waitFor(() => expect(document.querySelector('.project-manager [role="status"]')?.textContent).toBe('Enregistré localement'));
  expect(records.get(saved.id)).toEqual(saved);
  await unmount(app!);
  app = undefined;
  document.body.innerHTML = '';
  session = setup(null, records);
  await click('Projets locaux');
  await vi.waitFor(() => expect(document.querySelector(`button[aria-label="Ouvrir Wall V${version}"]`)).not.toBeNull());
  await click(`Ouvrir Wall V${version}`);
  await ready(session);
  expect(encodeProject(session.getDocument())).toBe(encodeProject(saved));
  expect(stl()).toEqual(savedStl);
  await click('Réglages');
  expect(document.querySelector('[data-wall-profile="robust"]')?.getAttribute('aria-pressed')).toBe('true');
}, 30_000);
