import type { DesignSource } from '../domain/designDocument';
import { cleanSVG, readFileAsText, vectorizeImage } from '../utils/imageProcessor';
import { validateImageFile } from './imageValidation';

/** Validate before reading or decoding; the caller has already checked cancellation. */
export async function convertImage(file: File, signal?: AbortSignal): Promise<{ svg: string; source: DesignSource }> {
  const mime = validateImageFile(file);
  if (mime === 'image/svg+xml') {
    const svg = cleanSVG(await readFileAsText(file));
    return { svg, source: { type: 'svg', fileName: file.name, svg } };
  }
  const normalizedFile = file.type === mime ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified });
  const svg = await vectorizeImage(normalizedFile, signal);
  return { svg, source: { type: 'raster', fileName: file.name, mimeType: mime, vectorizedSvg: svg } };
}
