import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDefaultCutterParameters } from '../../domain/designParameters';
import type { Bridge } from '../../domain/designDocument';
import { generateCookieCutter } from '../../utils/cookieCutterGenerator';
import { validatePrintableObject } from '../../utils/geometryValidation';
import { disposeObject3D } from '../../utils/disposeThree';
import { installSvgLoaderDomParserAdapter } from '../../utils/__tests__/svgDomTestSupport';
import { extractClosedContours } from '../../utils/contourExtraction';
import { validateConnectorLayout } from '../connectors';

export const ISLAND_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120"><path d="M0 0 L100 0 L100 100 L0 100 Z"/><path d="M35 35 L65 35 L65 65 L35 65 Z"/></svg>';
export const ISLAND_BRIDGE: Bridge = { id: 'bridge-1', from: { x: 0, y: 50 }, to: { x: 35, y: 50 }, widthMm: 2 };
let restore: (() => void) | undefined;
beforeAll(() => { restore = installSvgLoaderDomParserAdapter(); });
afterAll(() => restore?.());

describe('ponts manuels / fabrication', () => {
  it.each([
    { taperAngle: 0, enableHandle: false, handleStyle: 'none' as const },
    { taperAngle: 7, enableHandle: true, handleStyle: 'round' as const }
  ])('fusionne un îlot, conserve le trou et une seule coque valide (%o)', async (settings) => {
    const parameters = { ...createDefaultCutterParameters(), ...settings };
    const original = await generateCookieCutter(ISLAND_SVG, parameters);
    try { expect(validatePrintableObject(original).shells).toBe(2); }
    finally { disposeObject3D(original); }
    const bridged = await generateCookieCutter(ISLAND_SVG, parameters, [ISLAND_BRIDGE]);
    try {
      const report = validatePrintableObject(bridged, { requireSingleShell: true });
      expect(report.valid, report.errors.join('\n')).toBe(true);
      expect(report.shells).toBe(1);
      expect(bridged.children).toHaveLength(1);
      // A vertical ray through the island centre must see no cap: the inner
      // opening stays open, not just free of a vertex exactly at its centre.
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(bridged, true)).toHaveLength(0);
      // The inner square's centre remains empty in the uncentred mesh coordinates.
      const positions = (bridged.children[0] as import('three').Mesh).geometry.getAttribute('position');
      const scale = bridged.userData.effectiveScale as number;
      expect(Array.from({ length: positions.count }, (_, i) => [positions.getX(i), positions.getZ(i)])
        .some(([x, z]) => Math.abs(x - 50 * scale) < 3 && Math.abs(z - 50 * scale) < 3)).toBe(false);
    } finally { disposeObject3D(bridged); }
  }, 30000);

  it('accepte des ponts en chaîne partageant un point sur l’îlot intermédiaire', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120"><path d="M0 0 L100 0 L100 100 L0 100 Z"/><path d="M25 25 L75 25 L75 75 L25 75 Z"/><path d="M40 40 L60 40 L60 60 L40 60 Z"/></svg>';
    const bridges: Bridge[] = [
      { id: 'outer-middle', from: { x: 0, y: 50 }, to: { x: 25, y: 50 }, widthMm: 2 },
      { id: 'middle-inner', from: { x: 25, y: 50 }, to: { x: 40, y: 50 }, widthMm: 2 }
    ];
    const params = { ...createDefaultCutterParameters(), taperAngle: 0, enableHandle: false, handleStyle: 'none' as const };
    const model = await generateCookieCutter(svg, params, bridges);
    try {
      const validation = validatePrintableObject(model, { requireSingleShell: true });
      expect(validation.valid, validation.errors.join('\n')).toBe(true);
      expect(validation.shells).toBe(1);
    } finally { disposeObject3D(model); }
  }, 30000);

  it('rejette deux ponts de centreline exactement superposée, même en sens inverse', () => {
    const contours = extractClosedContours(ISLAND_SVG);
    const same = { ...ISLAND_BRIDGE, id: 'duplicate' };
    const reversed = { ...ISLAND_BRIDGE, id: 'reversed', from: ISLAND_BRIDGE.to, to: ISLAND_BRIDGE.from };
    expect(() => validateConnectorLayout(contours, [ISLAND_BRIDGE, same], 0.75, 1)).toThrow(/intersect|overlap/i);
    expect(() => validateConnectorLayout(contours, [ISLAND_BRIDGE, reversed], 0.75, 1)).toThrow(/intersect|overlap/i);
  });

  it('rejette un pont détaché et des segments qui se croisent, sans affaiblir les gardes', async () => {
    const params = { ...createDefaultCutterParameters(), taperAngle: 0, enableHandle: false, handleStyle: 'none' as const };
    await expect(generateCookieCutter(ISLAND_SVG, params, [{ ...ISLAND_BRIDGE, from: { x: -30, y: 50 } }])).rejects.toThrow();
    await expect(generateCookieCutter(ISLAND_SVG, params, [ISLAND_BRIDGE, {
      ...ISLAND_BRIDGE, id: 'cross', from: { x: 0, y: 45 }, to: { x: 35, y: 55 }
    }])).rejects.toThrow();
  });
});
