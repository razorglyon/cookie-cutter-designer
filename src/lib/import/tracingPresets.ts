import type { VectorizationOptions } from '../utils/imageWorkerProtocol';

export type TracingPresetId = 'contrast' | 'photo';
export const DEFAULT_TRACING_PRESET: TracingPresetId = 'contrast';
export const TRACING_PRESETS = Object.freeze([
  Object.freeze({ id: 'contrast' as const, label: 'Dessin contrasté', description: 'Réglages historiques : détails conservés, sans lissage.' }),
  Object.freeze({ id: 'photo' as const, label: 'Photo — préparation guidée', description: 'Recadrage, seuil et aperçu à confirmer. Les trous sont conservés ; leur remplissage reste un choix explicite.' })
]);
const contrast: VectorizationOptions = Object.freeze({
  ltres: 1, qtres: 1, pathomit: 8, colorsampling: 0, numberofcolors: 2,
  mincolorratio: 0, colorquantcycles: 3, blurradius: 0, blurdelta: 20,
  scale: 1, roundcoords: 1, viewbox: true, desc: false
});
// Photo masks are preprocessed explicitly; never erase holes via blur/path omission.
const photo: VectorizationOptions = Object.freeze({ ...contrast, blurradius: 0, pathomit: 0 });
/** Fixed palettes (no random sampling) make each choice reproducible. */
export function tracingOptions(preset: TracingPresetId = DEFAULT_TRACING_PRESET): VectorizationOptions {
  switch (preset) {
    case 'contrast': return contrast;
    case 'photo': return photo;
    default: throw new Error('Unknown vectorization preset.');
  }
}
