// @vitest-environment node
import { expect, it } from 'vitest';
import { DEFAULT_PHOTO_SETTINGS } from '../photoSettings';
import { processPhotoPixels } from '../photoProcessing';
import { traceProcessedPhoto } from '../../../workers/photoProcessor.worker';
import { decodePhotoFixture } from './fixtures/photos/decodePhotoFixture';

const hashes = {
  coins: 'c039b77334a92460b65f2e0ed8f1aa0b3521ec77a84386b33a11ad7774ca5702',
  coffee: '51564e1c293b9a32de7364dca129d63b005ceaa9ed7ea1357e55cf2f5da8d22d',
  chelsea: '97403c9c171d1aedd2026c7515e20208ef865eaab56d462c3c2eefade9b7d779'
};

it.each(['coins', 'coffee', 'chelsea'] as const)('uses an attributed, pinned camera photograph: %s', name => {
  const source = decodePhotoFixture(name);
  expect(source.sha256).toBe(hashes[name]);
  expect(source.data).toHaveLength(source.width * source.height * 4);
  const original = source.data.slice();
  const result = traceProcessedPhoto(processPhotoPixels(source, DEFAULT_PHOTO_SETTINGS));
  expect(result.diagnostics.canApply).toBe(false);
  expect(result.diagnostics.warnings.length).toBeGreaterThan(0);
  expect(result.diagnostics.removedComponents).toBe(0);
  expect(result.diagnostics.filledHoles).toBe(0);
  expect(result.svg).not.toMatch(/NaN|undefined/);
  expect(Buffer.from(source.data).equals(Buffer.from(original))).toBe(true);
  expect(traceProcessedPhoto(processPhotoPixels(source, DEFAULT_PHOTO_SETTINGS))).toEqual(result);
});

it('extracts a user-selected photographed coin without blur, auto object selection or unstable tracing', () => {
  const source = decodePhotoFixture('coins');
  // User-selected crop/contrast/outer silhouette, also exercised in the real browser.
  const settings = {
    ...DEFAULT_PHOTO_SETTINGS,
    crop: { x: 0.333, y: 0.333, width: 0.141, height: 0.178 },
    foreground: 'light' as const,
    minComponentArea: 9,
    fillHoles: true
  };
  const processed = processPhotoPixels(source, settings);
  const result = traceProcessedPhoto(processed);
  expect(result.diagnostics).toMatchObject({ width: 56, height: 55, components: 1, holes: 0, canApply: true });
  expect(result.diagnostics.filledHoles).toBeGreaterThan(0);
  expect(result.diagnostics.warnings.join(' ')).toContain('comblement');
  expect(result.svg).toContain('fill="rgb(0,0,0)"');
  expect(result.svg).not.toContain('fill="rgb(255,255,255)"');
  expect(result.svg.match(/<path\b/g)).toHaveLength(1);
  expect(traceProcessedPhoto(processPhotoPixels(source, settings))).toEqual(result);
});
