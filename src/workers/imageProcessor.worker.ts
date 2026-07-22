import { ImageTracer } from 'imagetracer';
import type {
  ImageWorkerRequest,
  ImageWorkerResponse
} from '../lib/utils/imageWorkerProtocol';

const cancelledRequests = new Set<string>();
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ImageWorkerRequest>) => void) | null;
  postMessage(message: ImageWorkerResponse): void;
};

function respond(response: ImageWorkerResponse): void {
  scope.postMessage(response);
}

scope.onmessage = (event: MessageEvent<ImageWorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    cancelledRequests.add(request.requestId);
    return;
  }

  const { requestId } = request;
  if (cancelledRequests.delete(requestId)) {
    respond({ type: 'cancelled', requestId });
    return;
  }

  try {
    const expectedBytes = request.width * request.height * 4;
    if (
      !Number.isInteger(request.width) ||
      !Number.isInteger(request.height) ||
      request.width <= 0 ||
      request.height <= 0 ||
      request.pixels.byteLength !== expectedBytes
    ) {
      respond({
        type: 'error',
        requestId,
        error: {
          code: 'INVALID_PIXELS',
          message: 'Raster pixel dimensions do not match the transferred buffer.'
        }
      });
      return;
    }

    const tracer = new ImageTracer();
    const imageData = {
      width: request.width,
      height: request.height,
      data: new Uint8ClampedArray(request.pixels)
    } as ImageData;
    const svg = tracer.imageDataToSVG(imageData, request.options);

    if (cancelledRequests.delete(requestId)) {
      respond({ type: 'cancelled', requestId });
    } else {
      respond({ type: 'success', requestId, svg });
    }
  } catch (error) {
    respond({
      type: 'error',
      requestId,
      error: {
        code: 'VECTORIZATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown vectorization error.'
      }
    });
  }
};

export {};
