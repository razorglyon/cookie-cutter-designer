// @vitest-environment happy-dom
import { mount, tick, unmount } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import AdvancedExport from '../AdvancedExport.svelte';
let app: ReturnType<typeof mount> | undefined;
afterEach(async () => { if (app) await unmount(app); app = undefined; document.body.innerHTML = ''; vi.unstubAllGlobals(); });
it('opens export choices on a narrow screen without forcing a tiny disclosure target', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  app = mount(AdvancedExport, { target: document.body, props: { mesh: null, filename: 'test.svg' } });
  await tick();
  const toggle = document.querySelector<HTMLButtonElement>('.advanced-export .toggle-btn');
  expect(toggle?.getAttribute('aria-expanded')).toBe('true');
  expect(toggle?.getAttribute('aria-label')).toContain('Masquer');
  expect(document.querySelector('.advanced-export .format-grid')).not.toBeNull();
  expect(document.querySelector<HTMLButtonElement>('.advanced-export .export-btn')?.disabled).toBe(true);
});
