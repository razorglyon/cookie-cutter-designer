// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_PHOTO_SETTINGS, parsePhotoSettings, type PhotoSettings } from '../photoSettings';
import { getPhotoRasterPlan, processPhotoPixels, MAX_PHOTO_DIMENSION, MAX_PHOTO_PIXELS } from '../photoProcessing';

function pixels(width = 20, height = 20, value: (x: number, y: number) => readonly number[] = () => [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(value(x, y), (y * width + x) * 4);
  return { width, height, data };
}
function ringAndIsland() {
  return pixels(20, 20, (x, y) => {
    const black = (x >= 3 && x <= 12 && y >= 3 && y <= 12 && !(x === 6 && y === 6)) || (x === 16 && y === 16);
    return black ? [0, 0, 0, 255] : [255, 255, 255, 255];
  });
}
const at = (mask: Uint8Array, x: number, y: number, width = 20) => mask[y * width + x];

describe('photo segmentation: explicit choices, no blur or hidden object selection', () => {
  it('preserves the one-pixel hole and the detached one-pixel island by default', () => {
    const source = ringAndIsland(); const before = source.data.slice();
    const result = processPhotoPixels(source, DEFAULT_PHOTO_SETTINGS);
    expect(at(result.mask, 6, 6)).toBe(0); expect(at(result.mask, 16, 16)).toBe(1);
    expect(at(result.mask, 3, 3)).toBe(1); expect(at(result.mask, 2, 3)).toBe(0);
    expect(result.diagnostics).toMatchObject({ width: 20, height: 20, threshold: 0, components: 2, holes: 1, removedComponents: 0, filledHoles: 0, canApply: false });
    expect(result.diagnostics.warnings.join(' ')).toMatch(/composants|components/i);
    expect(source.data).toEqual(before);
    expect(new Set(result.imageData.data)).toEqual(new Set([0, 255]));
  });
  it('removes only foreground components at the explicitly chosen inclusive area, never their holes', () => {
    const result = processPhotoPixels(ringAndIsland(), { ...DEFAULT_PHOTO_SETTINGS, minComponentArea: 1 });
    expect(at(result.mask, 16, 16)).toBe(0); expect(at(result.mask, 6, 6)).toBe(0);
    expect(result.diagnostics).toMatchObject({ components: 1, holes: 1, removedComponents: 1, canApply: true });
    expect(result.diagnostics.warnings.join(' ')).toMatch(/supprim|removed/i);
  });
  it('fills enclosed background only with explicit fillHoles, and reports the destructive choice', () => {
    const result = processPhotoPixels(ringAndIsland(), { ...DEFAULT_PHOTO_SETTINGS, minComponentArea: 1, fillHoles: true });
    expect(at(result.mask, 6, 6)).toBe(1); expect(at(result.mask, 0, 0)).toBe(0);
    expect(result.diagnostics).toMatchObject({ components: 1, holes: 0, filledHoles: 1, canApply: true });
    expect(result.diagnostics.warnings.join(' ')).toMatch(/trous|holes/i);
    expect(processPhotoPixels(ringAndIsland(), DEFAULT_PHOTO_SETTINGS).diagnostics.holes).toBe(1);
  });
  it('composites transparent black onto white before thresholding, and always emits opaque pixels', () => {
    const source = pixels(9, 9, (x, y) => x >= 2 && x <= 6 && y >= 2 && y <= 6 ? [0, 0, 0, 200] : [0, 0, 0, 0]);
    const result = processPhotoPixels(source, { ...DEFAULT_PHOTO_SETTINGS, threshold: 100 });
    expect(at(result.mask, 0, 0, 9)).toBe(0); expect(at(result.mask, 4, 4, 9)).toBe(1);
    expect(result.diagnostics).toMatchObject({ threshold: 100, components: 1, holes: 0, canApply: true });
    expect(Array.from(result.imageData.data).filter((_, i) => i % 4 === 3).every(alpha => alpha === 255)).toBe(true);
  });
  it('uses integer luminance and a literal manual threshold, including 0 and 255', () => {
    const source = pixels(9, 9, (x, y) => x >= 2 && x <= 6 && y >= 2 && y <= 6 ? [0, 255, 0, 255] : [255, 255, 255, 255]);
    expect(at(processPhotoPixels(source, { ...DEFAULT_PHOTO_SETTINGS, threshold: 150 }).mask, 4, 4, 9)).toBe(1);
    expect(at(processPhotoPixels(source, { ...DEFAULT_PHOTO_SETTINGS, threshold: 148 }).mask, 4, 4, 9)).toBe(0);
    expect(processPhotoPixels(source, { ...DEFAULT_PHOTO_SETTINGS, threshold: 255 }).diagnostics.canApply).toBe(false);
    expect(processPhotoPixels(ringAndIsland(), { ...DEFAULT_PHOTO_SETTINGS, threshold: 0 }).mask).toEqual(processPhotoPixels(ringAndIsland(), DEFAULT_PHOTO_SETTINGS).mask);
  });
  it('explicit light polarity is exactly complementary and Otsu is deterministic', () => {
    const source = ringAndIsland();
    const inverse = { ...source, data: source.data.map((v, i) => i % 4 === 3 ? v : 255 - v) };
    const settings = { ...DEFAULT_PHOTO_SETTINGS, foreground: 'light' as const };
    const result = processPhotoPixels(inverse, settings);
    expect(result.mask).toEqual(processPhotoPixels(source, DEFAULT_PHOTO_SETTINGS).mask);
    expect(processPhotoPixels(inverse, settings)).toEqual(result);
  });
  it('uses exactly the requested crop and never auto-crops or upscales', () => {
    const source = pixels(20, 20, (x, y) => x >= 12 && x <= 17 && y >= 3 && y <= 12 ? [0, 0, 0, 255] : [255, 255, 255, 255]);
    expect(processPhotoPixels(source, DEFAULT_PHOTO_SETTINGS).diagnostics.width).toBe(20);
    const result = processPhotoPixels(source, { ...DEFAULT_PHOTO_SETTINGS, crop: { x: 0.5, y: 0, width: 0.5, height: 1 } });
    expect(result.imageData).toMatchObject({ width: 10, height: 20 });
    expect(at(result.mask, 2, 3, 10)).toBe(1); expect(at(result.mask, 1, 3, 10)).toBe(0);
    expect(result.diagnostics.canApply).toBe(true);
  });
  it.each([0, 128, 255])('blocks uniform luminance %s with an actionable warning', gray => {
    const result = processPhotoPixels(pixels(20, 20, () => [gray, gray, gray, 255]), DEFAULT_PHOTO_SETTINGS);
    expect(result.diagnostics.canApply).toBe(false);
    expect(result.diagnostics.warnings.join(' ')).toMatch(/contraste|contrast/i);
  });
  it('blocks low contrast, empty manual masks, clipped contours and noisy masks instead of silently inventing an object', () => {
    const low = pixels(20, 20, (x, y) => { const v = x > 3 && x < 16 && y > 3 && y < 16 ? 123 : 128; return [v, v, v, 255]; });
    expect(processPhotoPixels(low, DEFAULT_PHOTO_SETTINGS).diagnostics.canApply).toBe(false);
    const empty = processPhotoPixels(ringAndIsland(), { ...DEFAULT_PHOTO_SETTINGS, foreground: 'light', threshold: 255 });
    expect(empty.diagnostics).toMatchObject({ components: 0, canApply: false });
    expect(empty.diagnostics.warnings.join(' ')).toMatch(/vide|empty/i);
    const clipped = processPhotoPixels(pixels(20, 20, (x, y) => x < 10 && y > 3 && y < 16 ? [0, 0, 0, 255] : [255, 255, 255, 255]), DEFAULT_PHOTO_SETTINGS);
    expect(clipped.diagnostics.canApply).toBe(false); expect(clipped.diagnostics.warnings.join(' ')).toMatch(/bord|edge/i);
    const noisy = processPhotoPixels(pixels(100, 100, (x, y) => x % 2 && y % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]), DEFAULT_PHOTO_SETTINGS);
    expect(noisy.diagnostics.components).toBe(2500); expect(noisy.traceable).toBe(false); expect(noisy.diagnostics.canApply).toBe(false);
    expect(noisy.diagnostics.warnings.join(' ')).toMatch(/complex|bruit|nois/i);
    expect(noisy.diagnostics.removedComponents).toBe(0);
  });
  it('flags reduction, while enforcing both processing caps after the crop', () => {
    const plan = getPhotoRasterPlan(4000, 4000, DEFAULT_PHOTO_SETTINGS.crop);
    expect(plan.width).toBeLessThanOrEqual(MAX_PHOTO_DIMENSION); expect(plan.height).toBeLessThanOrEqual(MAX_PHOTO_DIMENSION);
    expect(plan.width * plan.height).toBeLessThanOrEqual(MAX_PHOTO_PIXELS);
    const crop = getPhotoRasterPlan(4000, 4000, { x: 0.5, y: 0.5, width: 0.025, height: 0.025 });
    expect(crop).toMatchObject({ width: 100, height: 100, source: { x: 2000, y: 2000, width: 100, height: 100 } });
    const result = processPhotoPixels(pixels(2048, 2, x => x < 1000 ? [0, 0, 0, 255] : [255, 255, 255, 255]), DEFAULT_PHOTO_SETTINGS);
    expect(result.imageData.width).toBe(1024); expect(result.diagnostics.warnings.join(' ')).toMatch(/réduit|reduc/i);
  });
  it('validates original dimensions before crop/downsampling, and validates pixel buffer length', () => {
    expect(() => getPhotoRasterPlan(8192, 1, DEFAULT_PHOTO_SETTINGS.crop)).not.toThrow();
    expect(() => getPhotoRasterPlan(8193, 1, DEFAULT_PHOTO_SETTINGS.crop)).toThrow(/8192/);
    expect(() => getPhotoRasterPlan(4000, 4001, { x: 0, y: 0, width: 0.01, height: 0.01 })).toThrow(/16 megapixels/);
    expect(() => getPhotoRasterPlan(0, 1, DEFAULT_PHOTO_SETTINGS.crop)).toThrow(/dimensions/i);
    expect(() => processPhotoPixels({ width: 2, height: 2, data: new Uint8ClampedArray(3) }, DEFAULT_PHOTO_SETTINGS)).toThrow(/pixels|buffer/i);
  });
});

describe('photo settings runtime validation and immutable defaults', () => {
  it('defaults to auto, dark foreground, full crop and no destructive operation', () => {
    expect(DEFAULT_PHOTO_SETTINGS).toEqual({ threshold: null, foreground: 'dark', crop: { x: 0, y: 0, width: 1, height: 1 }, minComponentArea: 0, fillHoles: false });
    expect(Object.isFrozen(DEFAULT_PHOTO_SETTINGS)).toBe(true); expect(Object.isFrozen(DEFAULT_PHOTO_SETTINGS.crop)).toBe(true);
    const input = { ...DEFAULT_PHOTO_SETTINGS, crop: { ...DEFAULT_PHOTO_SETTINGS.crop } };
    const snapshot = parsePhotoSettings(input); input.crop.x = 0.5; expect(snapshot.crop.x).toBe(0);
  });
  it.each([NaN, Infinity, -1, 256, 1.5, '120', undefined])('rejects malformed threshold %s', threshold => {
    expect(() => parsePhotoSettings({ ...DEFAULT_PHOTO_SETTINGS, threshold })).toThrow(/seuil|threshold/i);
  });
  it.each([
    { x: -0.1, y: 0, width: 1, height: 1 }, { x: 0.6, y: 0, width: 0.5, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 }, { x: 0, y: NaN, width: 1, height: 1 },
    { x: 0, y: 0, width: 1, height: 2 }, null
  ])('rejects malformed crop %j', crop => {
    expect(() => parsePhotoSettings({ ...DEFAULT_PHOTO_SETTINGS, crop })).toThrow(/recadr|crop/i);
  });
  it.each([{ foreground: 'auto' }, { minComponentArea: -1 }, { minComponentArea: 1.2 }, { fillHoles: 'true' }])('rejects malformed explicit controls %j', invalid => {
    expect(() => parsePhotoSettings({ ...DEFAULT_PHOTO_SETTINGS, ...invalid })).toThrow();
  });
  it('validates controls again at the pure pixel entry point', () => {
    expect(() => processPhotoPixels(ringAndIsland(), { ...DEFAULT_PHOTO_SETTINGS, threshold: -1 } as PhotoSettings)).toThrow(/seuil|threshold/i);
  });
});
