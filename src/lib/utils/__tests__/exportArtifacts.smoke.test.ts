/// <reference types="node" />

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../../types/CookieCutter';
import { serialize3MF, serializeOBJ } from '../advancedExporter';
import { createTestCookieCutter } from '../cookieCutterGenerator';
import { disposeObject3D } from '../disposeThree';
import { serializeSTL } from '../stlExporter';
import { installSvgLoaderDomParserAdapter } from './svgDomTestSupport';

export const SMOKE_OUTPUT_DIR = join(tmpdir(), 'cookie-cutter-export-smoke');

let restoreDomParser: (() => void) | undefined;

beforeAll(async () => {
  restoreDomParser = installSvgLoaderDomParserAdapter();
  rmSync(SMOKE_OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(SMOKE_OUTPUT_DIR, { recursive: true });

  const cutter = await createTestCookieCutter({ ...DEFAULT_PARAMS });
  try {
    const stl = serializeSTL(cutter, true);
    if (!(stl instanceof DataView)) throw new Error('Expected binary STL output.');
    writeFileSync(
      join(SMOKE_OUTPUT_DIR, 'cookie-cutter.stl'),
      new Uint8Array(stl.buffer, stl.byteOffset, stl.byteLength)
    );
    writeFileSync(join(SMOKE_OUTPUT_DIR, 'cookie-cutter.obj'), serializeOBJ(cutter));
    writeFileSync(
      join(SMOKE_OUTPUT_DIR, 'cookie-cutter.3mf'),
      serialize3MF(cutter, DEFAULT_PARAMS)
    );
  } finally {
    disposeObject3D(cutter);
  }
});

afterAll(() => {
  restoreDomParser?.();
});

describe('export artifacts smoke test', () => {
  it('writes a structurally consistent binary STL', () => {
    const bytes = readFileSync(join(SMOKE_OUTPUT_DIR, 'cookie-cutter.stl'));
    const triangleCount = bytes.readUInt32LE(80);

    expect(bytes.byteLength).toBe(84 + triangleCount * 50);
    expect(triangleCount).toBeGreaterThan(0);
  });

  it('writes an OBJ containing finite Z-up vertices and faces', () => {
    const text = readFileSync(join(SMOKE_OUTPUT_DIR, 'cookie-cutter.obj'), 'utf8');
    const vertices = text.split('\n').filter((line) => line.startsWith('v '));
    const faces = text.split('\n').filter((line) => line.startsWith('f '));
    const coordinates = vertices.flatMap((line) => line.trim().split(/\s+/).slice(1).map(Number));

    expect(vertices.length).toBeGreaterThan(0);
    expect(faces.length).toBeGreaterThan(0);
    expect(coordinates.every(Number.isFinite)).toBe(true);
  });

  it('writes a readable OPC/ZIP 3MF package with parseable XML', () => {
    const archive = readFileSync(join(SMOKE_OUTPUT_DIR, 'cookie-cutter.3mf'));
    const entries = unzipSync(archive);
    const model = strFromU8(entries['3D/3dmodel.model']);
    const parsed = new DOMParser().parseFromString(model, 'application/xml');

    expect(Object.keys(entries).sort()).toEqual([
      '3D/3dmodel.model',
      '[Content_Types].xml',
      '_rels/.rels'
    ]);
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(model).toContain('<model unit="millimeter"');
  });
});
