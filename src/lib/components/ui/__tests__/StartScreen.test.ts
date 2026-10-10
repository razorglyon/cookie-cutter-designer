// @vitest-environment happy-dom
import { mount, unmount } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import StartScreen from '../StartScreen.svelte';
let app: ReturnType<typeof mount> | undefined;
afterEach(async () => { if (app) await unmount(app); document.body.innerHTML = ''; });
it('isolated start screen offers import, Shapes and Resume a project, not a new Draw mode', () => {
  app = mount(StartScreen, { target: document.body });
  expect(document.querySelector('[role="button"][aria-label="Import image"]')).not.toBeNull();
  const labels = [...document.querySelectorAll('button')].map(b => b.textContent?.trim());
  expect(labels).toContain('Shapes'); expect(labels).toContain('Resume a project'); expect(labels).not.toContain('Draw');
  expect(document.body.textContent).toContain('paste');
});
it('routes native keyboard-focusable buttons using existing category events', () => {
  const shapes = vi.fn(), projects = vi.fn();
  app = mount(StartScreen, { target: document.body, events: { shapes, projects } });
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
  for (const label of ['Shapes', 'Resume a project']) {
    const button = buttons.find(b => b.textContent?.trim() === label)!;
    expect(button).toBeDefined(); expect(button.disabled).toBe(false); button.focus(); expect(document.activeElement).toBe(button); button.click();
  }
  expect(shapes).toHaveBeenCalledTimes(1); expect(projects).toHaveBeenCalledTimes(1);
});
it('forwards the existing upload contract from FileUpload rather than building a second picker', () => {
  const upload = vi.fn(); app = mount(StartScreen, { target: document.body, events: { upload } });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(input).not.toBeNull(); const file = new File(['raster'], 'image.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file] }); input.dispatchEvent(new Event('change'));
  expect(upload.mock.calls[0][0].detail).toBe(file);
});
