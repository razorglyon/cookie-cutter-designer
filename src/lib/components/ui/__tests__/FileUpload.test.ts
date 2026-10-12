// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import FileUpload from '../FileUpload.svelte';
let app: ReturnType<typeof mount> | undefined;
afterEach(async () => { if (app) await unmount(app); document.body.innerHTML = ''; });
function setup() {
  // Legacy dispatcher contract is consumed by App; listen to the component API.
  const upload = vi.fn(); const reject = vi.fn();
  app = mount(FileUpload, { target: document.body, events: { upload, reject } });
  return { upload, reject, input: document.querySelector<HTMLInputElement>('input')!, zone: document.querySelector<HTMLElement>('[role="button"]')! };
}
it('advertises all supported MIME types/extensions without multiple selection', () => {
  const { input, zone } = setup();
  expect(input.accept).toContain('image/webp'); expect(input.accept).toContain('.jpeg'); expect(input.multiple).toBe(false);
  expect(zone.getAttribute('aria-label')).toBe('Importer une image');
});
it('passes invalid types through to owner validation, never a browser alert', () => {
  const { input, upload } = setup(); const file = new File(['x'], 'image.png', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file] }); input.dispatchEvent(new Event('change'));
  expect(upload.mock.calls[0][0].detail).toBe(file);
});
it('resets after selection so the same file can be imported again', () => {
  const { input, upload } = setup(); const file = new File(['x'], 'image.webp', { type: 'image/webp' });
  Object.defineProperty(input, 'files', { value: [file] });
  Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'C:\\fakepath\\image.webp' });
  input.dispatchEvent(new Event('change')); expect(input.value).toBe('');
  input.dispatchEvent(new Event('change')); expect(upload).toHaveBeenCalledTimes(2);
});
it('drop forwards one file and explicitly rejects multiple files', async () => {
  const { zone, upload, reject } = setup(); const file = new File(['x'], 'image.webp', { type: 'image/webp' });
  function drop(files: File[]) { const event = new Event('drop', { cancelable: true }); Object.defineProperty(event, 'dataTransfer', { value: { files } }); zone.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); }
  drop([file]); expect(upload.mock.calls[0][0].detail).toBe(file);
  drop([file, file]); await tick(); expect(upload).toHaveBeenCalledTimes(1); expect(reject.mock.calls[0][0].detail).toMatch(/one image/i);
});
it.each(['Enter', ' '])('keyboard %s opens the existing picker', async key => {
  const { zone, input } = setup(); await tick(); const click = vi.spyOn(input, 'click').mockImplementation(() => {});
  zone.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true })); expect(click).toHaveBeenCalledTimes(1);
});
