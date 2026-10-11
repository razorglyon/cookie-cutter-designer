import autoSvg from './fixtures/photos/coin-photo-auto.svg?raw';
import manualSvg from './fixtures/photos/coin-photo-threshold-140.svg?raw';
import oldCapRegressionSvg from './fixtures/photos/coin-photo-pre-fix-frame.svg?raw';
import * as THREE from 'three';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { generateCookieCutter } from '../../utils/cookieCutterGenerator';
import { validatePrintableObject } from '../../utils/geometryValidation';
import { DEFAULT_PARAMS } from '../../types/CookieCutter';
import { installSvgLoaderDomParserAdapter } from '../../utils/__tests__/svgDomTestSupport';

let restoreDomParser: (() => void) | undefined;
beforeAll(() => { restoreDomParser = installSvgLoaderDomParserAdapter(); });
afterAll(() => { restoreDomParser?.(); });

// Current camera contours must be one connected solid, without an invented background frame.
// The pre-fix artifact is retained only to reproduce the collinear-cap failure, not as a desired output.
it.each([
  ['coin-photo-auto', autoSvg, 1],
  ['coin-photo-threshold-140', manualSvg, 1],
  ['pre-fix-frame-cap-regression', oldCapRegressionSvg, 2]
] as const)('validates closure, orientation, volume and expected shells for %s', async (_name, svg, shells) => {
  const group = await generateCookieCutter(svg, { ...DEFAULT_PARAMS });
  try {
    expect(group.children.length).toBeGreaterThan(0);
    const report = validatePrintableObject(group, { requireSingleShell: shells === 1 });
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.shells).toBe(shells);
    expect(group.userData.contourCount).toBe(shells);
    expect(report.volume).toBeGreaterThan(0);
    expect(report.triangles).toBeGreaterThan(0);
  } finally {
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
  }
});
