import { parsePhotoSettings, DEFAULT_PHOTO_SETTINGS, type PhotoSettings } from './photoSettings';
import { validateImageFile } from './imageValidation';
import type { PhotoDiagnostics } from './photoProcessing';

export type PhotoTraceResult = { svg: string; diagnostics: PhotoDiagnostics };
export type PhotoWorkerRequest = { type: 'prepare'; file: File; settings: PhotoSettings };
export type PhotoWorkerResponse = { type: 'success'; result: PhotoTraceResult } | { type: 'error'; message: string };
export const PHOTO_PREPARATION_TIMEOUT_MS = 30_000;

function cancellationError(): DOMException {
  return new DOMException('La préparation photo a été annulée.', 'AbortError');
}
function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancellationError();
}

function validResult(value: unknown): value is PhotoTraceResult {
  if (!value || typeof value !== 'object') return false;
  const { svg, diagnostics } = value as Partial<PhotoTraceResult>;
  if (typeof svg !== 'string' || !svg.startsWith('<svg') || !diagnostics || typeof diagnostics !== 'object') return false;
  const { width, height, threshold, components, holes, removedComponents, filledHoles, warnings, canApply } = diagnostics;
  return [width, height].every(n => Number.isInteger(n) && n > 0 && n <= 1024) && width * height <= 1_000_000 &&
    Number.isInteger(threshold) && threshold >= 0 && threshold <= 255 &&
    [components, holes, removedComponents, filledHoles].every(n => Number.isInteger(n) && n >= 0 && n <= 1_000_000) &&
    Array.isArray(warnings) && warnings.every(warning => typeof warning === 'string') && typeof canApply === 'boolean';
}

/** Conversion/review only: never mutates a document or implies Apply. Each request owns its Worker. */
export async function preparePhoto(file: File, requestedSettings: PhotoSettings = DEFAULT_PHOTO_SETTINGS, signal?: AbortSignal): Promise<PhotoTraceResult> {
  checkCancellation(signal);
  const mime = validateImageFile(file);
  if (mime === 'image/svg+xml') throw new Error('La préparation photo accepte PNG, JPEG et WebP ; importez un SVG en mode vectoriel.');
  const settings = parsePhotoSettings(requestedSettings);
  const normalizedFile = file.type === mime ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified });
  checkCancellation(signal);
  if (typeof Worker !== 'function') throw new Error('Ce navigateur ne permet pas la préparation photo en Worker. Utilisez un navigateur récent.');
  let worker: Worker;
  try {
    worker = new Worker(new URL('../../workers/photoProcessor.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    throw new Error('Impossible de démarrer le Worker photo. Rechargez la page ou utilisez un navigateur récent.');
  }
  const result = await new Promise<PhotoTraceResult>((resolve, reject) => {
    let settled = false, timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
      // A cancel message cannot interrupt synchronous tracing; termination actually stops the CPU work.
      worker.terminate();
    };
    const finish = (outcome: PhotoTraceResult | Error): void => {
      if (settled) return;
      settled = true; cleanup();
      if (outcome instanceof Error) reject(outcome); else resolve(outcome);
    };
    const abort = (): void => finish(cancellationError());
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (settled) return;
      if (signal?.aborted) { abort(); return; }
      const response = event.data as Partial<PhotoWorkerResponse> | null;
      if (response?.type === 'success' && validResult(response.result)) finish(response.result);
      else if (response?.type === 'error' && typeof response.message === 'string') finish(new Error(response.message));
      else finish(new Error('Le Worker photo a retourné un résultat invalide. Réessayez avec une autre photo.'));
    };
    worker.onerror = () => finish(new Error('La préparation photo a échoué dans le Worker. Recadrez le sujet ou utilisez une autre photo.'));
    worker.onmessageerror = () => finish(new Error('Impossible de lire la réponse du Worker photo. Réessayez.'));
    signal?.addEventListener('abort', abort, { once: true });
    // Covers cancellation during construction/listener registration without allocating an orphaned timeout.
    if (signal?.aborted) { abort(); return; }
    timer = setTimeout(() => finish(new Error('Délai de préparation photo dépassé (30 s). Recadrez plus près ou utilisez une photo moins complexe.')), PHOTO_PREPARATION_TIMEOUT_MS);
    try {
      const request: PhotoWorkerRequest = { type: 'prepare', file: normalizedFile, settings };
      worker.postMessage(request);
    } catch {
      finish(new Error('Impossible de transmettre la photo au Worker. Réessayez avec un fichier PNG, JPEG ou WebP.'));
    }
  });
  checkCancellation(signal);
  return result;
}
