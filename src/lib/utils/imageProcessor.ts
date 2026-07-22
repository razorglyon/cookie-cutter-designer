import {
  terminateWorkers,
  vectorizeImageInWorker
} from './workerManager';
import type { VectorizationOptions } from './imageWorkerProtocol';

export const MAX_RASTER_PIXELS = 16_000_000;
export const MAX_RASTER_DIMENSION = 8192;

const COOKIE_CUTTER_TRACE_OPTIONS: VectorizationOptions = Object.freeze({
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
});

function cancellationError(): DOMException {
  return new DOMException('Image vectorization was cancelled.', 'AbortError');
}

export function validateRasterDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('The raster image has invalid dimensions.');
  }
  if (width > MAX_RASTER_DIMENSION || height > MAX_RASTER_DIMENSION) {
    throw new Error(`Raster dimensions must not exceed ${MAX_RASTER_DIMENSION} px per side.`);
  }
  if (width * height > MAX_RASTER_PIXELS) {
    throw new Error('Raster images are limited to 16 megapixels to protect memory and responsiveness.');
  }
}

function extractImageData(
  source: CanvasImageSource,
  width: number,
  height: number
): ImageData {
  validateRasterDimensions(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Failed to create the raster decoding canvas.');
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

async function decodeWithImageBitmap(file: File, signal?: AbortSignal): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  try {
    if (signal?.aborted) throw cancellationError();
    return extractImageData(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

function decodeWithImageElement(file: File, signal?: AbortSignal): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    const cleanup = (): void => {
      URL.revokeObjectURL(objectUrl);
      signal?.removeEventListener('abort', abort);
    };
    const abort = (): void => {
      cleanup();
      image.src = '';
      reject(cancellationError());
    };

    image.onload = () => {
      try {
        const data = extractImageData(image, image.naturalWidth || image.width, image.naturalHeight || image.height);
        cleanup();
        resolve(data);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('Failed to decode the raster image.'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    image.src = objectUrl;
  });
}

/** Decode on the UI thread, then transfer pixels to the vectorization Worker. */
export async function vectorizeImage(file: File, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw cancellationError();
  const imageData = typeof createImageBitmap === 'function'
    ? await decodeWithImageBitmap(file, signal)
    : await decodeWithImageElement(file, signal);
  if (signal?.aborted) throw cancellationError();
  return vectorizeImageInWorker(imageData, COOKIE_CUTTER_TRACE_OPTIONS, signal);
}

export function terminateImageProcessor(): void {
  terminateWorkers();
}

/** Read a file as text (for SVG files). */
export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/** Remove passive wrappers before the strict SVG parser validates the source. */
export function cleanSVG(svgString: string): string {
  svgString = svgString.replace(/<\?xml[^?]*\?>/g, '');
  svgString = svgString.replace(/<!--[\s\S]*?-->/g, '');
  if (!svgString.includes('<svg')) {
    throw new Error('Invalid SVG: No <svg> element found');
  }
  return svgString.trim();
}
