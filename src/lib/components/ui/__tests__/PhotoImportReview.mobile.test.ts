// @vitest-environment happy-dom
import { mount, tick, unmount } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import PhotoImportReview from '../PhotoImportReview.svelte';

const preparePhoto = vi.hoisted(() => vi.fn());
vi.mock('../../../import/photoImport', () => ({ preparePhoto }));
let app: ReturnType<typeof mount> | undefined;
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined; document.body.innerHTML = ''; vi.restoreAllMocks(); preparePhoto.mockReset();
});

it('opens photo preparation at its heading, before the preview and settings, not at the final action', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo-test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  preparePhoto.mockResolvedValue({ svg: '<svg/>', diagnostics: { width: 100, height: 100, threshold: 128, components: 1, holes: 0, removedComponents: 0, filledHoles: 0, warnings: [], canApply: true } });
  app = mount(PhotoImportReview, { target: document.body, props: { file: new File(['photo'], 'photo.png', { type: 'image/png' }) } });
  await tick();
  const heading = document.querySelector<HTMLHeadingElement>('.photo-review h3');
  expect(heading).not.toBeNull();
  expect(document.activeElement).toBe(heading);
  await vi.waitFor(() => expect(preparePhoto).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(document.querySelector('img[alt="Contour préparé"]')).not.toBeNull());
  expect(document.querySelector('.previews img[alt="Original à recadrer"]')).not.toBeNull();
  expect(document.querySelector<HTMLButtonElement>('.photo-review .actions .btn-primary')?.disabled).toBe(false);
});
