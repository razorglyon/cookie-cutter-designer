import { MAX_IMAGE_BYTES, extensionMime, type ImageMime } from './imageImport';

function normalizedMime(value: string): ImageMime | null {
  switch (value.trim().toLowerCase()) {
    case 'image/svg+xml': return 'image/svg+xml';
    case 'image/png': return 'image/png';
    case 'image/jpeg': case 'image/jpg': return 'image/jpeg';
    case 'image/webp': return 'image/webp';
    default: return null;
  }
}

/** MIME is authoritative when present. An image suffix never rescues a refused MIME. */
export function validateImageFile(file: File): ImageMime {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image files must not exceed 10 MiB.');
  const byExtension = extensionMime(file.name);
  const byMime = normalizedMime(file.type);
  if (file.type && !byMime) throw new Error('Supported image formats: SVG, PNG, JPEG and WebP.');
  const mime = byMime ?? byExtension;
  if (!mime) throw new Error('Supported image formats: SVG, PNG, JPEG and WebP.');
  if (byMime && byExtension && byMime !== byExtension) throw new Error('The image MIME type and file extension do not match.');
  return mime;
}
