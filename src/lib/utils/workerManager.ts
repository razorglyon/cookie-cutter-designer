/**
 * Worker Manager for handling Web Worker operations
 */

let imageWorker: Worker | null = null;

/**
 * Initialize image processing worker
 */
function getImageWorker(): Worker {
  if (!imageWorker) {
    imageWorker = new Worker(
      new URL('../../workers/imageProcessor.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }
  return imageWorker;
}

/**
 * Vectorize image using Web Worker
 */
export function vectorizeImageInWorker(
  imageData: ImageData,
  options: any
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = getImageWorker();

    const messageHandler = (e: MessageEvent) => {
      const { type, data, error } = e.data;

      if (type === 'success') {
        resolve(data);
      } else if (type === 'error') {
        reject(new Error(error));
      }

      // Remove listener after handling
      worker.removeEventListener('message', messageHandler);
    };

    worker.addEventListener('message', messageHandler);

    // Send message to worker
    worker.postMessage({
      type: 'vectorize',
      imageData,
      options
    });
  });
}

/**
 * Cleanup workers
 */
export function terminateWorkers() {
  if (imageWorker) {
    imageWorker.terminate();
    imageWorker = null;
  }
}
