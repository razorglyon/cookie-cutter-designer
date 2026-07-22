import type {
  ImageWorkerRequest,
  ImageWorkerResponse,
  VectorizationOptions
} from './imageWorkerProtocol';

interface WorkerPort {
  onmessage: ((event: MessageEvent<ImageWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: ImageWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

interface PendingRequest {
  resolve(svg: string): void;
  reject(error: Error): void;
  signal?: AbortSignal;
  abortListener?: () => void;
}

export class ImageWorkerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ImageWorkerError';
    this.code = code;
  }
}

function cancellationError(message = 'Image vectorization was cancelled.'): DOMException {
  return new DOMException(message, 'AbortError');
}

export class ImageWorkerClient {
  private worker: WorkerPort | null = null;
  private requestCounter = 0;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly createWorker: () => WorkerPort) {}

  vectorize(
    imageData: ImageData,
    options: VectorizationOptions,
    signal?: AbortSignal
  ): Promise<string> {
    if (signal?.aborted) return Promise.reject(cancellationError());

    const worker = this.getWorker();
    const requestId = `image-${++this.requestCounter}`;
    const pixels = new Uint8ClampedArray(imageData.data).buffer;

    return new Promise((resolve, reject) => {
      const pending: PendingRequest = { resolve, reject, signal };
      if (signal) {
        pending.abortListener = () => {
          if (!this.pending.delete(requestId)) return;
          worker.postMessage({ type: 'cancel', requestId });
          reject(cancellationError());
        };
        signal.addEventListener('abort', pending.abortListener, { once: true });
      }

      this.pending.set(requestId, pending);
      worker.postMessage(
        {
          type: 'process',
          requestId,
          width: imageData.width,
          height: imageData.height,
          pixels,
          options
        },
        [pixels]
      );
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const [requestId, pending] of this.pending) {
      this.cleanup(requestId, pending);
      pending.reject(cancellationError('Image worker was terminated.'));
    }
    this.pending.clear();
  }

  private getWorker(): WorkerPort {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      const message = event.message || 'The image worker stopped unexpectedly.';
      this.failAll(new ImageWorkerError('WORKER_FAILED', message));
      worker.terminate();
      if (this.worker === worker) this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private handleMessage(response: ImageWorkerResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    this.cleanup(response.requestId, pending);

    if (response.type === 'success') {
      pending.resolve(response.svg);
      return;
    }
    if (response.type === 'cancelled') {
      pending.reject(cancellationError());
      return;
    }
    pending.reject(new ImageWorkerError(response.error.code, response.error.message));
  }

  private cleanup(_requestId: string, pending: PendingRequest): void {
    if (pending.signal && pending.abortListener) {
      pending.signal.removeEventListener('abort', pending.abortListener);
    }
  }

  private failAll(error: Error): void {
    for (const [requestId, pending] of this.pending) {
      this.cleanup(requestId, pending);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

const imageWorkerClient = new ImageWorkerClient(
  () => new Worker(
    new URL('../../workers/imageProcessor.worker.ts', import.meta.url),
    { type: 'module' }
  )
);

export function vectorizeImageInWorker(
  imageData: ImageData,
  options: VectorizationOptions,
  signal?: AbortSignal
): Promise<string> {
  return imageWorkerClient.vectorize(imageData, options, signal);
}

export function terminateWorkers(): void {
  imageWorkerClient.terminate();
}
