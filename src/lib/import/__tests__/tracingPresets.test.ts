import { expect, it } from 'vitest';
import { DEFAULT_TRACING_PRESET, TRACING_PRESETS, tracingOptions } from '../tracingPresets';

it('offers exactly two explicit deterministic choices with the legacy contrast default', () => {
  expect(DEFAULT_TRACING_PRESET).toBe('contrast');
  expect(TRACING_PRESETS.map(preset => preset.id)).toEqual(['contrast', 'photo']);
  expect(tracingOptions('contrast')).toEqual({ ltres: 1, qtres: 1, pathomit: 8, colorsampling: 0, numberofcolors: 2, mincolorratio: 0, colorquantcycles: 3, blurradius: 0, blurdelta: 20, scale: 1, roundcoords: 1, viewbox: true, desc: false });
  expect(tracingOptions('photo')).toMatchObject({ colorsampling: 0, numberofcolors: 2, blurradius: 2, pathomit: 16 });
  expect(Object.isFrozen(tracingOptions('contrast'))).toBe(true);
  expect(Object.isFrozen(tracingOptions('photo'))).toBe(true);
});
