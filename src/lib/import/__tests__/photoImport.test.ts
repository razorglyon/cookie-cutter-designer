// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preparePhoto, PHOTO_PREPARATION_TIMEOUT_MS, type PhotoTraceResult, type PhotoWorkerResponse, type PhotoWorkerRequest } from '../photoImport';
import { DEFAULT_PHOTO_SETTINGS } from '../photoSettings';
import { MAX_IMAGE_BYTES } from '../imageImport';

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  static failSend = false;
  onmessage: ((event: MessageEvent<PhotoWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn((_request: PhotoWorkerRequest) => { if (ControlledWorker.failSend) throw new Error('Cannot send'); }); terminate = vi.fn();
  constructor(readonly url: URL, readonly options: WorkerOptions) { ControlledWorker.instances.push(this); }
  emit(data: PhotoWorkerResponse) { this.onmessage?.({ data } as MessageEvent<PhotoWorkerResponse>); }
}
const file = () => new File(['photo'], 'photo.png', { type: 'image/png' });
const result: PhotoTraceResult = { svg: '<svg viewBox="0 0 20 20"><path d="M2 2L18 2L18 18L2 18Z"/></svg>', diagnostics: { width: 20, height: 20, threshold: 90, components: 1, holes: 0, removedComponents: 0, filledHoles: 0, warnings: [], canApply: true } };
beforeEach(() => { vi.useFakeTimers(); ControlledWorker.instances = []; ControlledWorker.failSend = false; vi.stubGlobal('Worker', ControlledWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('independent photo worker ownership', () => {
  it('hands a validated detached snapshot and file to a fresh module Worker without decoding on the UI thread', async () => {
    const decode = vi.fn(); vi.stubGlobal('createImageBitmap', decode);
    const canvas = vi.spyOn(document, 'createElement');
    const settings = { ...DEFAULT_PHOTO_SETTINGS, crop: { ...DEFAULT_PHOTO_SETTINGS.crop } };
    const source = file(), promise = preparePhoto(source, settings), worker = ControlledWorker.instances[0];
    expect(worker.url.pathname).toMatch(/\/workers\/photoProcessor\.worker\.ts$/); expect(worker.options).toEqual({ type: 'module' });
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'prepare', file: source, settings: DEFAULT_PHOTO_SETTINGS });
    settings.crop.x = 0.5; expect(worker.postMessage.mock.calls[0][0].settings.crop.x).toBe(0);
    worker.emit({ type: 'success', result }); expect(await promise).toEqual(result);
    expect(decode).not.toHaveBeenCalled(); expect(canvas).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledTimes(1); expect(worker.onmessage).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    () => new File(['x'], 'x.png', { type: 'application/pdf' }),
    () => new File(['x'], 'x.png', { type: 'image/jpeg' }),
    () => new File(['x'], 'x.svg', { type: 'image/svg+xml' }),
    () => new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'x.png', { type: 'image/png' })
  ])('rejects unsupported, mismatched, SVG or oversize input before constructing a Worker', async bad => {
    await expect(preparePhoto(bad(), DEFAULT_PHOTO_SETTINGS)).rejects.toThrow(); expect(ControlledWorker.instances).toHaveLength(0);
  });
  it('normalizes extension-only MIME before sending the binary to the Worker', async () => {
    const promise = preparePhoto(new File(['x'], 'photo.JPG'), DEFAULT_PHOTO_SETTINGS), worker = ControlledWorker.instances[0];
    expect(worker.postMessage.mock.calls[0][0].file.type).toBe('image/jpeg'); worker.emit({ type: 'success', result }); await promise;
  });
  it('rejects malformed settings and pre-aborted requests without creating resources', async () => {
    await expect(preparePhoto(file(), { ...DEFAULT_PHOTO_SETTINGS, threshold: NaN })).rejects.toThrow(/seuil|threshold/i);
    const controller = new AbortController(); controller.abort();
    await expect(preparePhoto(file(), DEFAULT_PHOTO_SETTINGS, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(ControlledWorker.instances).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('terminates real CPU work on abort, releases the promise/listener/timer, and ignores a captured late reply', async () => {
    const controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener');
    const promise = preparePhoto(file(), DEFAULT_PHOTO_SETTINGS, controller.signal), rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    const worker = ControlledWorker.instances[0], late = worker.onmessage!;
    controller.abort(); await rejection;
    expect(worker.terminate).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledWith('abort', expect.any(Function)); expect(vi.getTimerCount()).toBe(0);
    late({ data: { type: 'success', result } } as MessageEvent<PhotoWorkerResponse>);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    const second = preparePhoto(file(), DEFAULT_PHOTO_SETTINGS), fresh = ControlledWorker.instances[1];
    expect(fresh).not.toBe(worker); fresh.emit({ type: 'success', result }); expect(await second).toEqual(result);
  });
  it('times out stalled decode/trace, terminates the Worker and leaves no pending timer', async () => {
    const promise = preparePhoto(file(), DEFAULT_PHOTO_SETTINGS), rejection = expect(promise).rejects.toThrow(/délai|timeout|30/i);
    const worker = ControlledWorker.instances[0];
    await vi.advanceTimersByTimeAsync(PHOTO_PREPARATION_TIMEOUT_MS); await rejection;
    expect(worker.terminate).toHaveBeenCalledTimes(1); expect(worker.onmessage).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['worker', 'message', 'response', 'malformed', 'send'])('settles and cleans up on %s error', async kind => {
    if (kind === 'send') ControlledWorker.failSend = true;
    const promise = preparePhoto(file(), DEFAULT_PHOTO_SETTINGS), rejection = expect(promise).rejects.toThrow();
    const worker = ControlledWorker.instances[0];
    if (kind === 'worker') worker.onerror?.({ message: 'crash' } as ErrorEvent);
    if (kind === 'message') worker.onmessageerror?.({} as MessageEvent);
    if (kind === 'response') worker.emit({ type: 'error', message: 'Photo illisible : réessayez.' });
    if (kind === 'malformed') worker.emit({ type: 'success', result: { ...result, diagnostics: { ...result.diagnostics, width: 1_000_000 } } });
    await rejection; expect(worker.terminate).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('guards cancellation between a success message and asynchronous return', async () => {
    const controller = new AbortController(), promise = preparePhoto(file(), DEFAULT_PHOTO_SETTINGS, controller.signal);
    ControlledWorker.instances[0].emit({ type: 'success', result }); controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(ControlledWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
  });
});
