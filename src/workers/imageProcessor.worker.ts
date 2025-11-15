import { ImageTracer } from 'imagetracer';

// Types for messages
interface VectorizeMessage {
  type: 'vectorize';
  imageData: ImageData;
  options: any;
}

interface WorkerResponse {
  type: 'success' | 'error';
  data?: any;
  error?: string;
}

// Listen for messages from main thread
self.onmessage = async (e: MessageEvent<VectorizeMessage>) => {
  const { type, imageData, options } = e.data;

  try {
    if (type === 'vectorize') {
      // Create ImageTracer instance
      const tracer = new ImageTracer();

      // Perform vectorization in worker thread
      const svgString = tracer.imageDataToSVG(imageData, options);

      // Send result back to main thread
      const response: WorkerResponse = {
        type: 'success',
        data: svgString
      };
      self.postMessage(response);
    }
  } catch (error) {
    // Send error back to main thread
    const response: WorkerResponse = {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    self.postMessage(response);
  }
};

export {};
