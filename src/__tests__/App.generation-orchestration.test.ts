// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App.svelte';
import {
  error,
  generationState,
  model,
  params,
  setParams
} from '../lib/stores/cookieCutterStore';
import { DEFAULT_PARAMS } from '../lib/types/CookieCutter';
import {
  getLastBatch,
  observeLastBatchDisposal,
  resetBatchFixture,
  wasLastBatchDisposed
} from './fixtures/batchFixtureState';

vi.mock('../lib/components/viewer/ThreeViewer.svelte', async () =>
  import('./fixtures/ThreeViewerStub.svelte')
);
vi.mock('../lib/components/ui/BatchMode.svelte', async () =>
  import('./fixtures/BatchModeStub.svelte')
);

let mountedApp: ReturnType<typeof mount> | null = null;

afterEach(async () => {
  if (mountedApp) await unmount(mountedApp);
  mountedApp = null;
  document.body.innerHTML = '';
  localStorage.clear();
  resetBatchFixture();
  setParams({ ...DEFAULT_PARAMS });
});

async function mountGeneratedCutter(): Promise<void> {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mountedApp = mount(App, { target });
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.includes('Try Test Circle'));
  expect(button).toBeDefined();
  button?.click();
  await vi.waitFor(() => {
    expect(get(generationState).phase).toBe('ready');
    expect(get(model)).not.toBeNull();
  }, { timeout: 10_000 });
}

async function publishBatchFixture(): Promise<void> {
  const category = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Batch production"]'
  );
  expect(category).not.toBeNull();
  category?.click();
  await vi.waitFor(() => {
    expect(document.querySelector('[data-testid="publish-batch"]')).not.toBeNull();
  });
  document.querySelector<HTMLButtonElement>('[data-testid="publish-batch"]')?.click();
}

describe('App generation orchestration boundary', () => {
  it('charge les recettes dynamiquement sans référencer les générateurs legacy', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.svelte'), 'utf8');

    expect(source).toContain("import('./lib/generation/recipes/cutterRecipe')");
    expect(source).toContain("import('./lib/generation/recipes/stampRecipe')");
    expect(source).not.toContain("from './lib/utils/cookieCutterGenerator'");
    expect(source).not.toContain("import('./lib/utils/stampGenerator')");
    expect(source).not.toContain('LatestGenerationGuard');
    expect(source).not.toContain('generateRevision');
  });

  it('génère le modèle test via le vrai orchestrateur', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mountedApp = mount(App, { target });
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate) => candidate.textContent?.includes('Try Test Circle'));

    expect(button).toBeDefined();
    button?.click();

    await vi.waitFor(() => {
      expect(get(generationState).phase).toBe('ready');
      expect(get(model)).not.toBeNull();
    }, { timeout: 10_000 });
    expect(get(error)).toBeNull();
  });

  it('charge et exécute la recette Stamp via le même orchestrateur', async () => {
    setParams({ ...get(params), mode: 'stamp' });
    const target = document.createElement('div');
    document.body.appendChild(target);
    mountedApp = mount(App, { target });
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate) => candidate.textContent?.includes('Try Test Circle'));

    expect(button).toBeDefined();
    button?.click();

    await vi.waitFor(() => {
      const state = get(generationState);
      expect(state.phase).toBe('ready');
      expect(state.result?.document.kind).toBe('stamp');
      expect(state.result?.artifacts[0].object).toBe(get(model)?.mesh);
    }, { timeout: 10_000 });
    expect(get(error)).toBeNull();
  });

  it('détruit un batch devenu obsolète pendant clear au démontage', async () => {
    await mountGeneratedCutter();
    await publishBatchFixture();
    expect(getLastBatch()).not.toBeNull();

    if (mountedApp) await unmount(mountedApp);
    mountedApp = null;

    await vi.waitFor(() => {
      expect(wasLastBatchDisposed()).toBe(true);
    });
    expect(get(model)).toBeNull();
    expect(get(generationState).phase).toBe('disposed');
  });

  it('retire le batch externe du store avant de le disposer au démontage', async () => {
    await mountGeneratedCutter();
    await publishBatchFixture();
    await vi.waitFor(() => {
      expect(get(model)?.mesh).toBe(getLastBatch());
    });

    let modelAtDisposal = get(model);
    observeLastBatchDisposal(() => {
      modelAtDisposal = get(model);
    });

    if (mountedApp) await unmount(mountedApp);
    mountedApp = null;
    await vi.waitFor(() => {
      expect(wasLastBatchDisposed()).toBe(true);
    });

    expect(modelAtDisposal).toBeNull();
    expect(get(model)).toBeNull();
  });
});
