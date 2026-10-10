// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest';
import { validateRasterDimensions } from '../../utils/imageProcessor';
import { importImage, validateImageFile, MAX_IMAGE_BYTES, selectSingleImage, clipboardImageFiles } from '../imageImport';
const processor = vi.hoisted(() => ({ vectorize: vi.fn(), read: vi.fn() }));
vi.mock('../../utils/imageProcessor', async original => ({
  ...await original<typeof import('../../utils/imageProcessor')>(), vectorizeImage: processor.vectorize, readFileAsText: processor.read
}));
const svg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>';
beforeEach(() => { processor.vectorize.mockReset().mockResolvedValue(svg); processor.read.mockReset().mockResolvedValue(`<?xml version="1.0"?><!--comment-->${svg}`); });
it.each(['svg', 'png', 'jpg', 'jpeg', 'webp'])('accepts a case-insensitive .%s extension only when MIME is absent', extension => {
  expect(validateImageFile(new File(['x'], `image.${extension.toUpperCase()}`))).toMatch(/^image\//);
});
it('does not mistake the entire extensionless filename for an extension', () => {
  expect(() => validateImageFile(new File(['x'], 'png'))).toThrow(/supported/i);
});
it.each(['application/pdf', 'application/octet-stream', 'image/gif', 'text/plain'])('never rescues refused MIME %s with an image extension', type => {
  expect(() => validateImageFile(new File(['x'], 'deceptive.svg', { type }))).toThrow(/supported/i);
});
it('rejects supported but contradictory MIME/extension', () => {
  expect(() => validateImageFile(new File(['x'], 'deceptive.svg', { type: 'image/png' }))).toThrow(/do not match/i);
});
it('accepts the exact 10 MiB boundary, rejects one byte above without conversion', async () => {
  expect(validateImageFile(new File([new Uint8Array(MAX_IMAGE_BYTES)], 'image.png', { type: 'image/png' }))).toBe('image/png');
  await expect(importImage(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'image.png', { type: 'image/png' }))).rejects.toThrow(/10 MiB/);
  expect(processor.vectorize).not.toHaveBeenCalled(); expect(processor.read).not.toHaveBeenCalled();
});
it('cleans binary SVG text and builds a canonical SVG source', async () => {
  const file = new File(['x'], 'image.SVG');
  expect(await importImage(file)).toEqual({ svg, source: { type: 'svg', fileName: 'image.SVG', svg } });
  expect(processor.read).toHaveBeenCalledWith(file); expect(processor.vectorize).not.toHaveBeenCalled();
});
it.each([{ name: 'image.jpg', type: 'image/jpg', mime: 'image/jpeg' }, { name: 'image.WEBP', type: '', mime: 'image/webp' }])('normalizes $name before vectorization and in V1 source', async ({ name, type, mime }) => {
  const file = new File(['pixels'], name, { type }); const controller = new AbortController();
  expect(await importImage(file, controller.signal)).toEqual({ svg, source: { type: 'raster', fileName: name, mimeType: mime, vectorizedSvg: svg } });
  expect(processor.vectorize.mock.calls[0][0].type).toBe(mime); expect(processor.vectorize.mock.calls[0][1]).toBe(controller.signal);
});
it.each(['svg', 'png'])('drops late %s conversion after cancellation even if the processor ignores abort', async extension => {
  let resolve!: (svg: string) => void; const promise = new Promise<string>(yes => { resolve = yes; });
  (extension === 'svg' ? processor.read : processor.vectorize).mockReturnValue(promise);
  const controller = new AbortController(); const result = importImage(new File(['x'], `image.${extension}`), controller.signal);
  await vi.waitFor(() => expect(extension === 'svg' ? processor.read : processor.vectorize).toHaveBeenCalledTimes(1));
  controller.abort(); resolve(svg); await expect(result).rejects.toMatchObject({ name: 'AbortError' });
});
it('a pre-cancelled request never invokes the decoder', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(importImage(new File(['x'], 'image.png'), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(processor.vectorize).not.toHaveBeenCalled();
});
it('preserves the real decoder dimension boundaries before canvas allocation', () => {
  expect(() => validateRasterDimensions(8192, 1)).not.toThrow();
  expect(() => validateRasterDimensions(1, 8192)).not.toThrow();
  expect(() => validateRasterDimensions(8193, 1)).toThrow(/8192/);
  expect(() => validateRasterDimensions(1, 8193)).toThrow(/8192/);
  expect(() => validateRasterDimensions(4000, 4000)).not.toThrow();
  expect(() => validateRasterDimensions(4000, 4001)).toThrow(/16 megapixels/);
});
it('keeps decoder dimension safety errors without constructing any source', async () => {
  processor.vectorize.mockRejectedValue(new Error('Raster dimensions must not exceed 8192 px per side.'));
  await expect(importImage(new File(['x'], 'large.png'))).rejects.toThrow(/8192/);
  processor.vectorize.mockRejectedValue(new Error('Raster images are limited to 16 megapixels'));
  await expect(importImage(new File(['x'], 'large.png'))).rejects.toThrow(/16 megapixels/);
});
it('selects exactly one binary and prefers files to duplicated clipboard items', () => {
  const file = new File(['x'], 'image.png'); expect(selectSingleImage([])).toBeNull(); expect(selectSingleImage([file])).toBe(file);
  expect(() => selectSingleImage([file, file])).toThrow(/one image/i);
  const item = { kind: 'file', getAsFile: vi.fn(() => file) };
  const data = { files: [file], items: [item] } as unknown as DataTransfer;
  expect(clipboardImageFiles(data)).toEqual([file]); expect(item.getAsFile).not.toHaveBeenCalled();
});
