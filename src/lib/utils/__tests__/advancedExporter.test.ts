import * as THREE from 'three';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../../types/CookieCutter';
import { createTestCookieCutter } from '../cookieCutterGenerator';
import { CutterGenerationError } from '../generationValidation';
import { serialize3MF, serializeOBJ } from '../advancedExporter';
import { installSvgLoaderDomParserAdapter } from './svgDomTestSupport';

let restoreDomParser: (() => void) | undefined;

beforeAll(() => {
  restoreDomParser = installSvgLoaderDomParserAdapter();
});

afterAll(() => {
  restoreDomParser?.();
});

describe('serialize3MF', () => {
  it('creates a conforming OPC ZIP package with a millimeter model', async () => {
    const cutter = await createTestCookieCutter({ ...DEFAULT_PARAMS });
    const archive = serialize3MF(cutter, DEFAULT_PARAMS);

    expect(Array.from(archive.slice(0, 2))).toEqual([0x50, 0x4b]);

    const files = unzipSync(archive);
    expect(Object.keys(files).sort()).toEqual([
      '3D/3dmodel.model',
      '[Content_Types].xml',
      '_rels/.rels'
    ]);

    const contentTypes = strFromU8(files['[Content_Types].xml']);
    const relationships = strFromU8(files['_rels/.rels']);
    const model = strFromU8(files['3D/3dmodel.model']);

    expect(contentTypes).toContain(
      'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
    );
    expect(relationships).toContain('Target="/3D/3dmodel.model"');
    expect(model).toContain('<model unit="millimeter"');
    expect(model).toContain('xmlns:ccd="https://cookie-cutter-designer.app/3mf/metadata/2026"');
    expect(model).toContain('<metadata name="ccd:WallThickness"');
    expect(model).toContain('<resources>');
    expect(model).toContain('<build>');
  });

  it('stores Z-up vertices resting on the print bed', async () => {
    const cutter = await createTestCookieCutter({ ...DEFAULT_PARAMS });
    const files = unzipSync(serialize3MF(cutter, DEFAULT_PARAMS));
    const model = strFromU8(files['3D/3dmodel.model']);
    const zValues = Array.from(model.matchAll(/<vertex[^>]+z="([^"]+)"/g), (match) =>
      Number(match[1])
    );

    expect(zValues.length).toBeGreaterThan(0);
    expect(Math.min(...zValues)).toBeCloseTo(0, 5);
    expect(Math.max(...zValues)).toBeCloseTo(DEFAULT_PARAMS.totalHeight, 5);
  });

  it('rejects invalid geometry before packaging', () => {
    expect(() => serialize3MF(new THREE.Group(), DEFAULT_PARAMS)).toThrowError(
      CutterGenerationError
    );
  });
});

describe('serializeOBJ', () => {
  it('uses the same validated Z-up manufacturing coordinates', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8));
    mesh.position.y = 2.5;

    const obj = serializeOBJ(mesh);
    const zValues = obj
      .split('\n')
      .filter((line) => line.startsWith('v '))
      .map((line) => Number(line.trim().split(/\s+/)[3]));

    expect(Math.min(...zValues)).toBeCloseTo(0, 5);
    expect(Math.max(...zValues)).toBeCloseTo(5, 5);
  });
});
