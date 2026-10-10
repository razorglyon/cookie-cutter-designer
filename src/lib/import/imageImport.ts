import type { DesignSource } from '../domain/designDocument';


export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_ACCEPT = '.svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp';
export type ImageMime = 'image/svg+xml' | 'image/png' | 'image/jpeg' | 'image/webp';

export { validateImageFile } from './imageValidation';

export function extensionMime(name: string): ImageMime | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  switch (name.slice(dot + 1).toLowerCase()) {
    case 'svg': return 'image/svg+xml';
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    default: return null;
  }
}
/** No implicit batch and no silent first-file choice. Empty picker cancellation is a no-op. */
export function selectSingleImage(files: ArrayLike<File>): File | null {
  if (files.length > 1) throw new Error('Choose one image at a time; multiple files are not imported.');
  return files[0] ?? null;
}
export function clipboardImageFiles(data: DataTransfer): File[] {
  // Browsers may expose the same binary in both lists; use files, then fallback.
  const files = Array.from(data.files);
  if (!files.length) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  // Leave unrelated binary clipboard actions alone. If an image is present,
  // keep the whole selection so mixed/multiple binaries are explicitly refused.
  return files.some(file => file.type.trim().toLowerCase().startsWith('image/') || extensionMime(file.name) !== null)
    ? files : [];
}
export function isEditablePasteTarget(target: EventTarget | null): boolean {
  let element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  while (element) {
    if (element.matches('input, textarea')) return true;
    // Be conservative even with nested contenteditable=false islands: do not
    // steal a clipboard action from an editor's subtree.
    const editable = element.getAttribute('contenteditable');
    if (editable !== null && editable.toLowerCase() !== 'false') return true;
    element = element.parentElement;
  }
  return false;
}
function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Image import was cancelled.', 'AbortError');
}
/** Conversion only: the caller owns session validity and guarded publication. */
export async function importImage(file: File, signal?: AbortSignal): Promise<{ svg: string; source: DesignSource }> {
  checkCancellation(signal);
  // Keep conversion out of the initial UI bundle without changing its pipeline.
  const { convertImage } = await import('./imageConversion');
  checkCancellation(signal);
  const result = await convertImage(file, signal);
  checkCancellation(signal);
  return result;
}
