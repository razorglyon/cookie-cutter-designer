// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import paper from 'paper';
import { DEFAULT_PHOTO_SETTINGS } from '../photoSettings';
import { processPhotoPixels } from '../photoProcessing';
import { preparePhotoInWorker, traceProcessedPhoto, photoTraceOptions } from '../../../workers/photoProcessor.worker';
import { ImageTracer } from 'imagetracer';

function source(width = 20, height = 20) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const black = (x >= 3 && x <= 12 && y >= 3 && y <= 12 && !(x === 6 && y === 6)) || (x === 16 && y === 16);
    const v = black ? 0 : 255; data.set([v, v, v, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}
const bitmap = { width: 20, height: 20, close: vi.fn() };
const context = { imageSmoothingEnabled: true, drawImage: vi.fn(), getImageData: vi.fn(() => source()) };
class Canvas {
  static instances: Canvas[] = [];
  constructor(public width: number, public height: number) { Canvas.instances.push(this); }
  getContext = vi.fn(() => context);
}
beforeEach(() => { bitmap.width = 20; bitmap.height = 20; bitmap.close.mockClear(); context.drawImage.mockClear(); context.getImageData.mockReset().mockImplementation(() => source()); Canvas.instances = []; vi.stubGlobal('OffscreenCanvas', Canvas); vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap)); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const file = () => new File(['photo'], 'photo.png', { type: 'image/png' });
function blackGeometry(svg: string) {
  const scope = new paper.PaperScope(); scope.setup(new scope.Size(30, 30));
  const paths = [...svg.matchAll(/<path[^>]*fill="rgb\(0,0,0\)"[^>]*d="([^"]*)"/g)];
  return { scope, paths: paths.map(path => new scope.CompoundPath({ pathData: path[1], insert: false })) };
}

describe('real installed ImageTracer, topology and deterministic black/white SVG', () => {
  it('uses the installed class API with a fixed palette and no omission/blur/requantization', () => {
    const options = new ImageTracer().checkOptions(photoTraceOptions());
    expect(options).toMatchObject({ colorsampling: 0, numberofcolors: 2, colorquantcycles: 1, pathomit: 0, blurradius: 0, strokewidth: 0, linefilter: false, roundcoords: -1, layering: 0, scale: 1 });
    expect(options.pal).toEqual([{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }]);
  });
  it('preserves a one-pixel hole and island geometrically in the actual SVG, reproducibly', () => {
    const pixels = processPhotoPixels(source(), DEFAULT_PHOTO_SETTINGS), result = traceProcessedPhoto(pixels);
    expect(result.diagnostics).toMatchObject({ components: 2, holes: 1, removedComponents: 0 });
    expect(result.svg).not.toMatch(/NaN|undefined/);
    // Every SVG subpath becomes cutting geometry: a white background path would invent a frame.
    expect(result.svg).not.toContain('fill="rgb(255,255,255)"');
    const geometry = blackGeometry(result.svg);
    try {
      expect(geometry.paths).toHaveLength(2);
      expect(geometry.paths.some(path => path.contains(new geometry.scope.Point(6.5, 6.5)))).toBe(false);
      expect(geometry.paths.some(path => path.contains(new geometry.scope.Point(5.5, 5.5)))).toBe(true);
      expect(geometry.paths.some(path => path.contains(new geometry.scope.Point(16.5, 16.5)))).toBe(true);
      expect(geometry.paths.reduce((sum, path) => sum + path.children.length, 0)).toBe(3);
    } finally { geometry.scope.project.remove(); }
    expect(traceProcessedPhoto(processPhotoPixels(source(), DEFAULT_PHOTO_SETTINGS))).toEqual(result);
  });
  it('preserves the tiny SVG hole under cleanup and fills it only for the requested silhouette', () => {
    const base = { ...DEFAULT_PHOTO_SETTINGS, minComponentArea: 1 };
    const preserved = blackGeometry(traceProcessedPhoto(processPhotoPixels(source(), base)).svg);
    const filled = traceProcessedPhoto(processPhotoPixels(source(), { ...base, fillHoles: true }));
    const silhouette = blackGeometry(filled.svg);
    try {
      expect(preserved.paths).toHaveLength(1); expect(preserved.paths[0].contains(new preserved.scope.Point(6.5, 6.5))).toBe(false);
      expect(silhouette.paths).toHaveLength(1); expect(silhouette.paths[0].contains(new silhouette.scope.Point(6.5, 6.5))).toBe(true);
      expect(filled.diagnostics).toMatchObject({ holes: 0, filledHoles: 1, canApply: true });
    } finally { preserved.scope.project.remove(); silhouette.scope.project.remove(); }
  });
  it('refuses to trace complexity beyond the budget, retaining an actionable blocked review', () => {
    const pixels = processPhotoPixels(source(), DEFAULT_PHOTO_SETTINGS);
    const tracer = vi.spyOn(ImageTracer.prototype, 'imageDataToTracedata');
    const result = traceProcessedPhoto({ ...pixels, traceable: false, diagnostics: { ...pixels.diagnostics, canApply: false } });
    expect(tracer).not.toHaveBeenCalled(); expect(result.diagnostics.canApply).toBe(false);
    expect(result.diagnostics.warnings.join(' ')).toMatch(/traçage|trace/i);
  });
  it('blocks publication if the tracer unexpectedly drops holes instead of trusting a plausible SVG', () => {
    const pixels = processPhotoPixels(source(), { ...DEFAULT_PHOTO_SETTINGS, minComponentArea: 1 });
    const original = ImageTracer.prototype.imageDataToTracedata;
    vi.spyOn(ImageTracer.prototype, 'imageDataToTracedata').mockImplementation(function (this: ImageTracer, image, options) {
      const traced = original.call(this, image, options);
      traced.layers[0] = traced.layers[0].filter((path: { isholepath: boolean }) => !path.isholepath);
      for (const path of traced.layers[0]) path.holechildren = [];
      return traced;
    });
    const result = traceProcessedPhoto(pixels); expect(result.diagnostics.canApply).toBe(false);
    expect(result.diagnostics.warnings.join(' ')).toMatch(/topolog|trou|hole/i);
  });
});

describe('worker-side decode and bounded canvas ownership', () => {
  it('closes the bitmap after success and does not allocate object URLs', async () => {
    const urls = vi.spyOn(URL, 'createObjectURL');
    const result = await preparePhotoInWorker(file(), DEFAULT_PHOTO_SETTINGS);
    expect(result.diagnostics).toMatchObject({ width: 20, height: 20, holes: 1 });
    expect(bitmap.close).toHaveBeenCalledTimes(1); expect(urls).not.toHaveBeenCalled();
    expect(context.imageSmoothingEnabled).toBe(false);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 20, 20, 0, 0, 20, 20);
    expect(Canvas.instances[0]).toMatchObject({ width: 0, height: 0 });
  });
  it('checks original dimensions before allocating any canvas even with a tiny crop', async () => {
    bitmap.width = 4000; bitmap.height = 4001;
    await expect(preparePhotoInWorker(file(), { ...DEFAULT_PHOTO_SETTINGS, crop: { x: 0, y: 0, width: 0.01, height: 0.01 } })).rejects.toThrow(/16 megapixels/);
    expect(Canvas.instances).toHaveLength(0); expect(bitmap.close).toHaveBeenCalledTimes(1);
    bitmap.width = 8193; bitmap.height = 1; await expect(preparePhotoInWorker(file(), DEFAULT_PHOTO_SETTINGS)).rejects.toThrow(/8192/);
    expect(Canvas.instances).toHaveLength(0); expect(bitmap.close).toHaveBeenCalledTimes(2);
  });
  it('draws only the explicit crop into the bounded processing canvas, without cropping twice', async () => {
    bitmap.width = 4000; bitmap.height = 4000;
    const result = await preparePhotoInWorker(file(), { ...DEFAULT_PHOTO_SETTINGS, crop: { x: 0.5, y: 0.5, width: 0.005, height: 0.005 } });
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 2000, 2000, 20, 20, 0, 0, 20, 20);
    expect(result.diagnostics).toMatchObject({ width: 20, height: 20 });
  });
  it('warns about reduction after the worker has already rasterized to the caps', async () => {
    bitmap.width = 4000; bitmap.height = 4000;
    context.getImageData.mockImplementation(() => source(1000, 1000));
    const result = await preparePhotoInWorker(file(), DEFAULT_PHOTO_SETTINGS);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 4000, 4000, 0, 0, 1000, 1000);
    expect(result.diagnostics.warnings.join(' ')).toMatch(/réduit|reduc/i);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
  it('closes the bitmap and releases canvas memory after pixel extraction failure', async () => {
    context.getImageData.mockImplementation(() => { throw new Error('Cannot read pixels'); });
    await expect(preparePhotoInWorker(file(), DEFAULT_PHOTO_SETTINGS)).rejects.toThrow(/pixels/i);
    expect(bitmap.close).toHaveBeenCalledTimes(1); expect(Canvas.instances[0]).toMatchObject({ width: 0, height: 0 });
  });
  it('cancels a late decoded bitmap before canvas allocation and closes it', async () => {
    let release!: (bitmap: unknown) => void; vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise(resolve => { release = resolve; })));
    const controller = new AbortController(), promise = preparePhotoInWorker(file(), DEFAULT_PHOTO_SETTINGS, controller.signal);
    controller.abort(); release(bitmap); await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(bitmap.close).toHaveBeenCalledTimes(1); expect(Canvas.instances).toHaveLength(0);
  });
  it('validates MIME/size/settings before the worker decoder and rejects missing browser capabilities actionably', async () => {
    const decode = vi.mocked(createImageBitmap);
    await expect(preparePhotoInWorker(new File(['x'], 'x.png', { type: 'text/plain' }), DEFAULT_PHOTO_SETTINGS)).rejects.toThrow();
    await expect(preparePhotoInWorker(file(), { ...DEFAULT_PHOTO_SETTINGS, threshold: -1 })).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
    vi.stubGlobal('OffscreenCanvas', undefined);
    await expect(preparePhotoInWorker(file(), DEFAULT_PHOTO_SETTINGS)).rejects.toThrow(/navigateur|browser/i);
    expect(decode).not.toHaveBeenCalled();
  });
});
