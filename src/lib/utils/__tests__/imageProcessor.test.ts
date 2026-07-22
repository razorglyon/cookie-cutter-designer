import { describe, expect, it } from 'vitest';
import {
  MAX_RASTER_DIMENSION,
  MAX_RASTER_PIXELS,
  cleanSVG,
  validateRasterDimensions
} from '../imageProcessor';

describe('raster input safety', () => {
  it('accepts practical raster dimensions', () => {
    expect(() => validateRasterDimensions(2048, 2048)).not.toThrow();
  });

  it('rejects non-positive and non-integer dimensions', () => {
    expect(() => validateRasterDimensions(0, 100)).toThrow(/invalid dimensions/i);
    expect(() => validateRasterDimensions(100.5, 100)).toThrow(/invalid dimensions/i);
  });

  it('rejects an oversized side before allocating canvas pixels', () => {
    expect(() => validateRasterDimensions(MAX_RASTER_DIMENSION + 1, 1)).toThrow(/per side/i);
  });

  it('rejects images above the megapixel budget', () => {
    const side = Math.floor(Math.sqrt(MAX_RASTER_PIXELS)) + 1;
    expect(() => validateRasterDimensions(side, side)).toThrow(/16 megapixels/i);
  });
});

describe('cleanSVG', () => {
  it('removes declarations and comments without altering the SVG payload', () => {
    expect(cleanSVG('<?xml version="1.0"?><!--x--><svg><path d="M0 0Z"/></svg>'))
      .toBe('<svg><path d="M0 0Z"/></svg>');
  });

  it('rejects text without an SVG root', () => {
    expect(() => cleanSVG('<div>not svg</div>')).toThrow(/no <svg>/i);
  });
});
