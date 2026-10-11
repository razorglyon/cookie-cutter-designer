// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import BatchMode from '../BatchMode.svelte';
import { createDesignDocument } from '../../../projects/createDesignDocument';
import { DEFAULT_PARAMS } from '../../../types/CookieCutter';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>';
const initial = createDesignDocument({ name: 'Original', kind: 'cutter', source: { type: 'svg', fileName: 'original.svg', svg } });
let panel: ReturnType<typeof mount> | undefined;
afterEach(async () => { if (panel) await unmount(panel); panel = undefined; document.body.innerHTML = ''; });
function start(document = initial) {
  const update = vi.fn(), single = vi.fn();
  panel = mount(BatchMode, { target: window.document.body, props: { currentSvg: svg, currentParams: DEFAULT_PARAMS, buildPlateSize: 200, currentDocument: document, onUpdateSeries: update, onSingleCutter: single } });
  return { update, single };
}
it('opening the existing batch entry does not promote or change a project', async () => {
  const { update } = start(); await tick();
  expect(update).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Série enregistrable');
  expect(document.querySelector('#series-copies')).not.toBeNull();
});
it('applies one explicit, bounded layout without creating runtime meshes', async () => {
  const { update } = start(); await tick();
  const count = document.querySelector<HTMLInputElement>('#series-copies')!; count.value = '6'; count.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  expect(update).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('[data-apply-series]')!.click(); await tick();
  expect(update).toHaveBeenCalledExactlyOnceWith({ copies: 6, columns: 2, spacingMm: 5 });
});
it('refuses invalid or non-finite values and reports an accessible error', async () => {
  const { update } = start(); await tick();
  const count = document.querySelector<HTMLInputElement>('#series-copies')!; count.value = '25'; count.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  document.querySelector<HTMLButtonElement>('[data-apply-series]')!.click(); await tick();
  expect(update).not.toHaveBeenCalled(); expect(document.querySelector('[role="alert"]')).not.toBeNull();
});
