import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../../types/CookieCutter';
import { generateStamp } from '../stampGenerator';
import { GENERATION_LIMITS } from '../generationValidation';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { getShapeById } from '../shapeLibrary';
import { validatePrintableObject } from '../geometryValidation';
import { serializeSTL } from '../stlExporter';
import { disposeObject3D } from '../disposeThree';
import { installSvgLoaderDomParserAdapter } from './svgDomTestSupport';
let restore: (() => void) | undefined;
beforeAll(() => { restore = installSvgLoaderDomParserAdapter(); });
afterAll(() => restore?.());
describe('raised heart qualification', () => {
  it('generates the previously refused 75 mm, 2 mm, no-handle heart without changing its artwork', async () => {
    const params = { ...DEFAULT_PARAMS, mode: 'stamp' as const, targetSize: 75, stampDepth: 2,
      stampBase: true, enableHandle: false, handleStyle: 'none' as const };
    const group = await generateStamp(getShapeById('heart')!.svg, params);
    try {
      const report = validatePrintableObject(group, { requireSingleShell: true });
      expect(report.valid, report.errors.join('\n')).toBe(true);
      expect(report.shells).toBe(1); expect(report.volume).toBeGreaterThan(0);
      expect(report.bounds!.min.y).toBeCloseTo(0, 5);
      expect(report.bounds!.max.y).toBeCloseTo(6, 3);
      const ray = (x: number, z: number) => new THREE.Raycaster(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0)).intersectObject(group, true)[0]?.point.y;
      expect(ray(0, 0)).toBeCloseTo(6, 3);
      expect(ray(34, 34)).toBeCloseTo(4, 3);
      const binary = serializeSTL(group, true) as DataView;
      expect(binary.getUint32(80, true)).toBe(report.triangles);
      expect(binary.byteLength).toBe(84 + 50 * report.triangles);
    } finally { disposeObject3D(group); }
  });
});

const artifactDirectory = process.env.STAMP_QUALIFICATION_OUTPUT;
const artifactRecords: Array<Record<string, unknown>> = [];
function recordExport(name: string, group: THREE.Group) {
  if (!artifactDirectory) return;
  if (!artifactDirectory.startsWith('/workspace/reports/stamp-qualification-')) throw new Error('Unexpected qualification output root');
  mkdirSync(artifactDirectory, { recursive: true });
  const stl = serializeSTL(group, true) as DataView;
  const bytes = Buffer.from(stl.buffer, stl.byteOffset, stl.byteLength);
  const path = join(artifactDirectory, name + '.stl');
  writeFileSync(path, bytes);
  const report = validatePrintableObject(group, { requireSingleShell: true });
  artifactRecords.push({ name, path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    triangles: report.triangles, shells: report.shells, volume: report.volume, dimensions: group.userData.dimensions });
}
afterAll(() => { if (artifactDirectory) writeFileSync(join(artifactDirectory, 'corpus.json'), JSON.stringify(artifactRecords, null, 2) + '\n'); });
function radialSvg(points: number, wavy = false) {
  const d = Array.from({ length: points }, (_, i) => {
    const angle = i * 2 * Math.PI / points;
    const radius = wavy ? 38 + 4 * Math.cos(12 * angle) : 40;
    return `${i ? 'L' : 'M'}${(50 + radius * Math.cos(angle)).toFixed(6)} ${(50 + radius * Math.sin(angle)).toFixed(6)}`;
  }).join(' ') + 'Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}"/></svg>`;
}
const manyHolesSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M0 0H100V100H0Z ${Array.from({ length: 25 }, (_, i) => {
  const x = 10 + (i % 5) * 16, y = 10 + Math.floor(i / 5) * 16;
  return `M${x} ${y}V${y + 6}H${x + 6}V${y}Z`;
}).join(' ')}"/></svg>`;
const modes = ['raised', 'recessed'] as const;
describe('stamp boundary corpus', () => {
  it.each([10, 200, 1000].flatMap(targetSize => modes.flatMap(mode => ['circle', 'heart'].map(shape => ({ targetSize, mode, shape })))))(
    '$shape $mode at $targetSize mm with no handle', async ({ targetSize, mode, shape }) => {
      const params = { ...DEFAULT_PARAMS, mode: 'stamp' as const, targetSize, buildPlateSize: 1000,
        stampDepth: mode === 'recessed' ? 3 : 2, stampBase: true, enableHandle: false, handleStyle: 'none' as const };
      const group = await generateStamp(shape === 'heart' ? getShapeById('heart')!.svg : radialSvg(96), params, mode).catch(error => { throw new Error(JSON.stringify({ message: error.message, details: error.details })); });
      try {
        const report = validatePrintableObject(group, { requireSingleShell: true });
        expect(report.valid, report.errors.join('\n')).toBe(true); expect(report.shells).toBe(1);
        const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
        expect(Math.max(size.x, size.z)).toBeCloseTo(targetSize, 2);
        expect(size.y).toBeCloseTo(mode === 'recessed' ? 4 : 6, 2);
        const ray = new THREE.Raycaster(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -1, 0));
        expect(ray.intersectObject(group, true)[0]?.point.y).toBeCloseTo(mode === 'recessed' ? 1 : 6, 2);
        recordExport(`${shape}-${mode}-${targetSize}`, group);
      } finally { disposeObject3D(group); }
    }, 30000
  );
  it.each(modes.flatMap(mode => [
    { name: 'wavy-512-points', svg: radialSvg(512, true) },
    { name: 'convex-1000-points', svg: radialSvg(1000) },
    { name: '25-holes', svg: manyHolesSvg }
  ].map(fixture => ({ mode, ...fixture }))))('$name remains a single valid $mode tool', async ({ name, svg, mode }) => {
    const group = await generateStamp(svg, { ...DEFAULT_PARAMS, mode: 'stamp', targetSize: 100, stampDepth: 3,
      enableHandle: false, handleStyle: 'none' }, mode);
    try {
      const report = validatePrintableObject(group, { requireSingleShell: true });
      expect(report.valid, report.errors.join('\n')).toBe(true); expect(report.shells).toBe(1); expect(report.volume).toBeGreaterThan(0);
      recordExport(`${name}-${mode}`, group);
    } finally { disposeObject3D(group); }
  }, 30000);
  it('keeps the exact SVG byte, path and point guards in both routes', async () => {
    const oversized = '<svg>' + ' '.repeat(GENERATION_LIMITS.maxSvgBytes) + '</svg>';
    const paths = `<svg xmlns="http://www.w3.org/2000/svg">${'<path d="M0 0H10V10H0Z"/>'.repeat(GENERATION_LIMITS.maxSvgPaths + 1)}</svg>`;
    for (const mode of modes) {
      const params = { ...DEFAULT_PARAMS, mode: 'stamp' as const, stampDepth: 3, enableHandle: false, handleStyle: 'none' as const };
      await expect(generateStamp(oversized, params, mode)).rejects.toMatchObject({ code: 'SVG_TOO_LARGE' });
      await expect(generateStamp(paths, params, mode)).rejects.toMatchObject({ code: 'CONTOUR_TOO_COMPLEX' });
      await expect(generateStamp(radialSvg(GENERATION_LIMITS.maxPointsPerContour + 1), params, mode)).rejects.toMatchObject({ code: 'CONTOUR_TOO_COMPLEX' });
    }
  }, 30000);
});
