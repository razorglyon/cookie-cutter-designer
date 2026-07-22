import { describe, expect, it } from 'vitest';
import type {
  ImageWorkerRequest,
  ImageWorkerResponse,
  VectorizationOptions
} from '../imageWorkerProtocol';
import { ImageWorkerClient } from '../workerManager';

const options: VectorizationOptions = {
  ltres: 1,
  qtres: 1,
  pathomit: 8,
  colorsampling: 0,
  numberofcolors: 2,
  mincolorratio: 0,
  colorquantcycles: 3,
  blurradius: 0,
  blurdelta: 20,
  scale: 1,
  roundcoords: 1,
  viewbox: true,
  desc: false
};

function pixels(width = 2, height = 2): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4)
  } as ImageData;
}

class FakeWorker {
  onmessage: ((event: MessageEvent<ImageWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly messages: Array<{ message: ImageWorkerRequest; transfer?: Transferable[] }> = [];
  terminated = false;

  postMessage(message: ImageWorkerRequest, transfer?: Transferable[]): void {
    this.messages.push({ message, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: ImageWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<ImageWorkerResponse>);
  }
}

function processMessages(worker: FakeWorker) {
  return worker.messages
    .map(({ message }) => message)
    .filter((message): message is Extract<ImageWorkerRequest, { type: 'process' }> =>
      message.type === 'process'
    );
}

describe('ImageWorkerClient', () => {
  it('matches concurrent out-of-order responses by requestId', async () => {
    const worker = new FakeWorker();
    const client = new ImageWorkerClient(() => worker);
    const first = client.vectorize(pixels(), options);
    const second = client.vectorize(pixels(), options);
    const [firstRequest, secondRequest] = processMessages(worker);

    worker.respond({ type: 'success', requestId: secondRequest.requestId, svg: '<svg id="second" />' });
    worker.respond({ type: 'success', requestId: firstRequest.requestId, svg: '<svg id="first" />' });

    await expect(first).resolves.toContain('first');
    await expect(second).resolves.toContain('second');
  });

  it('transfers a dedicated pixel buffer instead of cloning it implicitly', async () => {
    const worker = new FakeWorker();
    const client = new ImageWorkerClient(() => worker);
    const promise = client.vectorize(pixels(3, 2), options);
    const sent = worker.messages[0];
    const request = sent.message as Extract<ImageWorkerRequest, { type: 'process' }>;

    expect(request.pixels.byteLength).toBe(24);
    expect(sent.transfer).toEqual([request.pixels]);
    const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    client.terminate();
    await rejection;
  });

  it('cancels one request without consuming another response', async () => {
    const worker = new FakeWorker();
    const client = new ImageWorkerClient(() => worker);
    const controller = new AbortController();
    const cancelled = client.vectorize(pixels(), options, controller.signal);
    const active = client.vectorize(pixels(), options);
    const [cancelledRequest, activeRequest] = processMessages(worker);

    controller.abort();
    worker.respond({ type: 'success', requestId: cancelledRequest.requestId, svg: '<svg id="stale" />' });
    worker.respond({ type: 'success', requestId: activeRequest.requestId, svg: '<svg id="active" />' });

    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    await expect(active).resolves.toContain('active');
    expect(worker.messages).toContainEqual({
      message: { type: 'cancel', requestId: cancelledRequest.requestId },
      transfer: undefined
    });
  });

  it('preserves structured worker errors', async () => {
    const worker = new FakeWorker();
    const client = new ImageWorkerClient(() => worker);
    const promise = client.vectorize(pixels(), options);
    const [request] = processMessages(worker);

    worker.respond({
      type: 'error',
      requestId: request.requestId,
      error: { code: 'INVALID_PIXELS', message: 'Bad pixels' }
    });

    await expect(promise).rejects.toMatchObject({
      name: 'ImageWorkerError',
      code: 'INVALID_PIXELS',
      message: 'Bad pixels'
    });
  });

  it('terminates the worker and rejects every pending request', async () => {
    const worker = new FakeWorker();
    const client = new ImageWorkerClient(() => worker);
    const first = client.vectorize(pixels(), options);
    const second = client.vectorize(pixels(), options);

    client.terminate();

    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminated).toBe(true);
  });
});
