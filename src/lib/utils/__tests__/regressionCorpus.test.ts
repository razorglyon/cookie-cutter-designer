import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../../types/CookieCutter';
import { generateCookieCutter } from '../cookieCutterGenerator';
import { disposeObject3D } from '../disposeThree';
import { CutterGenerationError } from '../generationValidation';
import { validatePrintableObject } from '../geometryValidation';
import { generateStamp } from '../stampGenerator';
import {
  compoundHoleSvg,
  concaveSvg,
  degenerateSvg,
  extremeAspectSvg,
  multipleContoursSvg,
  rectangleSvg,
  selfIntersectingSvg,
  tinyDetailsSvg
} from './fixtures';
import { installSvgLoaderDomParserAdapter } from './svgDomTestSupport';

let restoreDomParser: (() => void) | undefined;

beforeAll(() => {
  restoreDomParser = installSvgLoaderDomParserAdapter();
});

afterAll(() => {
  restoreDomParser?.();
});

const cutterParams = {
  ...DEFAULT_PARAMS,
  enableHandle: false,
  handleStyle: 'none' as const,
  taperAngle: 2
};

describe('manufacturing regression corpus', () => {
  it.each([
    ['rectangle', rectangleSvg],
    ['concavity', concaveSvg],
    ['compound hole', compoundHoleSvg],
    ['multiple contours', multipleContoursSvg]
  ])('produces finite validated cutter geometry for %s', async (_name, svg) => {
    const object = await generateCookieCutter(svg, cutterParams);
    const report = validatePrintableObject(object);

    expect(report.valid, report.errors.join('\n')).toBe(true);
    expect(report.triangles).toBeGreaterThan(0);
    expect(report.volume).toBeGreaterThan(0);
    disposeObject3D(object);
  });

  it('handles an extreme aspect ratio without losing the requested longest dimension', async () => {
    const object = await generateCookieCutter(extremeAspectSvg, {
      ...cutterParams,
      wallThickness: 0.6,
      targetSize: 100,
      taperAngle: 0
    });
    const dimensions = object.userData.dimensions as { width: number; depth: number };

    expect(Math.max(dimensions.width, dimensions.depth)).toBeCloseTo(100, 1);
    expect(validatePrintableObject(object).valid).toBe(true);
    disposeObject3D(object);
  });

  it.each([
    ['self-intersection', selfIntersectingSvg],
    ['degenerate contour', degenerateSvg],
    ['sub-resolution detail that changes offset topology', tinyDetailsSvg]
  ])('rejects %s instead of exporting plausible-looking geometry', async (_name, svg) => {
    await expect(generateCookieCutter(svg, cutterParams)).rejects.toBeInstanceOf(
      CutterGenerationError
    );
  });

  it.each([
    ['compound hole', compoundHoleSvg],
    ['disconnected relief islands', multipleContoursSvg]
  ])('turns %s into one connected Stamp shell', async (_name, svg) => {
    const object = await generateStamp(svg, {
      ...DEFAULT_PARAMS,
      mode: 'stamp',
      stampBase: true,
      enableHandle: false,
      handleStyle: 'none'
    });
    const report = validatePrintableObject(object, { requireSingleShell: true });

    expect(report.valid, report.errors.join('\n')).toBe(true);
    expect(report.shells).toBe(1);
    disposeObject3D(object);
  });
});
