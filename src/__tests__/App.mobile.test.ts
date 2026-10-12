// @vitest-environment happy-dom
import { mount, tick, unmount } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../App.svelte';
import { createDesignSessionStore } from '../lib/stores/designSessionStore';
import { createDesignDocument } from '../lib/projects/createDesignDocument';
import { createProjectStorage } from '../lib/projects/projectStorage';
import { createProjectRecoveryStorage } from '../lib/projects/projectRecoveryStorage';
import { generationState, setParams } from '../lib/stores/cookieCutterStore';
import { DEFAULT_PARAMS } from '../lib/types/CookieCutter';
import { get } from 'svelte/store';

vi.mock('../lib/components/viewer/ThreeViewer.svelte', async () => import('./fixtures/ThreeViewerStub.svelte'));

let app: ReturnType<typeof mount> | undefined;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10 L90 10 L90 90 L10 90 Z"/></svg>';
function setup(withDocument = false) {
  const initial = withDocument ? createDesignDocument({ name: 'Test', kind: 'cutter', source: { type: 'svg', fileName: 'test.svg', svg } }) : null;
  const session = createDesignSessionStore(initial);
  const storage = createProjectStorage({ put: async () => {}, get: async () => undefined, getAll: async () => [], delete: async () => {} });
  const recovery = createProjectRecoveryStorage({ put: async () => {}, get: async () => undefined, getAll: async () => [], deleteExpected: async () => false, close: async () => {} });
  app = mount(App, { target: document.body.appendChild(document.createElement('div')), props: { projectSession: session, projectStorage: storage, projectRecoveryStorage: recovery } });
  return session;
}
function mobileButton(name: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Sections mobiles"] button')]
    .find(candidate => candidate.textContent?.trim() === name);
  expect(button, name).toBeDefined();
  return button!;
}
function click(name: string): void {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(candidate => candidate.textContent?.trim() === name);
  expect(button, name).toBeDefined(); button!.click();
}
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined; document.body.innerHTML = ''; setParams({ ...DEFAULT_PARAMS });
});

it('offers five stable named mobile destinations and a full-height create entry without a model', async () => {
  setup();
  expect([...document.querySelectorAll('nav[aria-label="Sections mobiles"] button')].map(button => button.textContent?.trim()))
    .toEqual(['Projet', 'Créer', 'Régler', '3D', 'Export']);
  expect(document.querySelector('.app-layout')?.classList.contains('mobile-viewing')).toBe(false);
  mobileButton('3D').click(); await tick();
  expect(document.querySelector('.app-layout')?.classList.contains('mobile-viewing')).toBe(true);
  expect(mobileButton('3D').getAttribute('aria-current')).toBe('page');
  mobileButton('Export').click(); await tick();
  expect(document.querySelector('.app-layout')?.classList.contains('mobile-viewing')).toBe(false);
  expect(document.querySelector('.panel-content')?.textContent).toMatch(/import|dessin/i);
  mobileButton('Créer').click(); await tick();
  expect(document.querySelector('[aria-label="Outils de création"]')).not.toBeNull();
  click('Importer une image'); await tick();
  expect(document.querySelector('.app-layout')?.classList.contains('mobile-choosing')).toBe(false);
  await vi.waitFor(() => expect(document.querySelector('.start-screen')).not.toBeNull());
});

it('separates sketch, bridges and batch in the mobile creation flow without changing the document', async () => {
  const session = setup(true);
  await vi.waitFor(() => expect(get(generationState).phase).toBe('ready'), { timeout: 10000 });
  const initial = session.getDocument();
  mobileButton('Créer').click(); await tick();
  click('Atelier 2D et ponts');
  await vi.waitFor(() => expect(document.querySelector('.sketch-workspace')).not.toBeNull(), { timeout: 10000 });
  expect(document.querySelector('.app-layout')?.classList.contains('mobile-workshop-sketch')).toBe(true);
  click('Ponts'); await tick();
  expect(document.querySelector('.app-layout')?.classList.contains('mobile-workshop-bridges')).toBe(true);
  mobileButton('Créer').click(); await tick();
  click('Série de Cutters'); await tick();
  expect(document.querySelector('.panel-content')?.textContent).toMatch(/série|copies/i);
  expect(session.getDocument()).toBe(initial);
  mobileButton('Régler').click(); await tick();
  expect(document.querySelector('.history-controls button[title^="Annuler"]')).not.toBeNull();
  mobileButton('Projet').click(); await tick();
  expect(document.querySelector('.panel-content')?.textContent).toMatch(/projet/i);
});

it('returns to the sketch instead of leaving an empty bridge tab after changing to Stamp', async () => {
  const session = setup(true);
  await vi.waitFor(() => expect(get(generationState).phase).toBe('ready'), { timeout: 10000 });
  mobileButton('Créer').click(); await tick(); click('Atelier 2D et ponts'); await tick();
  click('Ponts'); await tick();
  expect(document.querySelector('.app-layout')?.classList.contains('mobile-workshop-bridges')).toBe(true);
  session.changeKind('stamp'); await tick();
  expect(document.querySelector('.app-layout')?.classList.contains('mobile-workshop-sketch')).toBe(true);
  expect(document.querySelector('nav[aria-label="Atelier mobile"] button[aria-current="page"]')?.textContent).toBe('Atelier 2D');
});
