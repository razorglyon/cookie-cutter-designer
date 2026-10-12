import { describe, expect, it } from 'vitest';
import { parseDesignDocument, DesignDocumentValidationError } from '../../domain/documentValidation';
import { encodeProject, decodeProject, PROJECT_FORMAT, ProjectCodecError } from '../projectCodec';
import { createProjectFile, readProjectFile } from '../projectFiles';
import { createProjectStorage } from '../projectStorage';
import type { DesignDocument } from '../../domain/designDocument';
import { projectDocument } from './projectFixtures';

function stamp(mode: 'raised' | 'recessed' = 'recessed', depth = 2) {
  const base = projectDocument('stamp');
  return { ...base, schemaVersion: 4, kind: 'stamp', bridges: [], imprintMode: mode,
    parameters: { ...base.parameters, mode: 'stamp', stampDepth: depth } };
}

function rejectsAt(value: unknown, path: string) {
  expect(() => parseDesignDocument(value)).toThrowError(DesignDocumentValidationError);
  try { parseDesignDocument(value); } catch (error) {
    expect(error).toMatchObject({ path });
  }
}

describe('strict V4 stamp persistence', () => {
  it.each(['raised', 'recessed'] as const)('round-trips %s without mutating or retaining input', mode => {
    const input = stamp(mode), before = structuredClone(input);
    const parsed = parseDesignDocument(input);
    const encoded = encodeProject(input);
    expect(JSON.parse(encoded)).toEqual({ format: PROJECT_FORMAT, version: 4, document: input });
    expect(decodeProject(encoded)).toEqual({ document: input, warnings: [] });
    expect(input).toEqual(before);
    expect(parsed).not.toBe(input);
    expect(parsed.parameters).not.toBe(input.parameters);
    expect('imprintMode' in parsed.parameters).toBe(false);
    expect(encodeProject(decodeProject(encoded).document)).toBe(encoded);
  });

  it('accepts 3 mm inclusive and keeps raised V4 depths up to historical schema limits', () => {
    expect(parseDesignDocument(stamp('recessed', 3))).toEqual(stamp('recessed', 3));
    expect(parseDesignDocument(stamp('raised', 50))).toEqual(stamp('raised', 50));
  });

  it.each([
    ['imprintMode', { imprintMode: 'inverted' }],
    ['imprintMode', { imprintMode: undefined }],
    ['futureOption', { futureOption: true }],
    ['kind', { kind: 'cutter' }],
    ['bridges', { bridges: [{ id: 'bridge', from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, widthMm: 1 }] }],
    ['layout', { layout: { copies: 2, columns: 2, spacingMm: 5 } }]
  ])('rejects malformed V4 at %s', (path, patch) => rejectsAt({ ...stamp(), ...patch }, path as string));

  it.each([3.0001, 4, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects depth %s at parameters.stampDepth', depth => {
    rejectsAt(stamp('recessed', depth), 'parameters.stampDepth');
  });
  it('rejects a baseless stamp and unknown legacy parameters', () => {
    const input = stamp();
    rejectsAt({ ...input, parameters: { ...input.parameters, stampBase: false } }, 'parameters.stampBase');
    rejectsAt({ ...input, parameters: { ...input.parameters, imprintMode: 'recessed' } }, 'parameters.imprintMode');
  });

  it('keeps V1/V2/V3 shapes and JSON unchanged, without silent promotion', () => {
    const raised = projectDocument('stamp');
    const v1 = { ...raised, parameters: { ...raised.parameters, stampDepth: 5 } };
    const v2 = { ...v1, schemaVersion: 2, bridges: [] };
    const v3 = { ...projectDocument(), schemaVersion: 3, kind: 'multi-cutter', bridges: [], layout: { copies: 4, columns: 2, spacingMm: 5 } };
    for (const input of [v1, v2, v3]) {
      const json = encodeProject(input);
      expect(JSON.parse(json)).toEqual({ format: PROJECT_FORMAT, version: input.schemaVersion, document: input });
      expect(decodeProject(json).document).toEqual(input);
      expect('imprintMode' in decodeProject(json).document).toBe(false);
      rejectsAt({ ...input, imprintMode: 'raised' }, 'imprintMode');
    }
  });

  it('reports future headers before unknown keys and rejects divergent envelopes', () => {
    rejectsAt({ ...stamp(), schemaVersion: 5, futureField: true }, 'schemaVersion');
    expect(() => decodeProject(JSON.stringify({ format: PROJECT_FORMAT, version: 5, futureField: true, document: stamp() }))).toThrow(/future/);
    for (const version of [1, 2, 3]) {
      expect(() => decodeProject(JSON.stringify({ format: PROJECT_FORMAT, version, document: stamp() }))).toThrowError(ProjectCodecError);
      expect(() => decodeProject(JSON.stringify({ format: PROJECT_FORMAT, version, document: stamp() }))).toThrow(/document.schemaVersion/);
    }
    expect(() => decodeProject(JSON.stringify({ format: PROJECT_FORMAT, version: 4, document: projectDocument('stamp') }))).toThrow(/document.schemaVersion/);
  });

  it('exports and reads a real .ccd.json Blob and saves/reopens through the repository', async () => {
    const input = stamp();
    const file = createProjectFile(input);
    expect(file.fileName).toMatch(/\.ccd\.json$/);
    const decoded = await readProjectFile(file.blob);
    expect(decoded.document).toEqual(input);
    const records = new Map<string, DesignDocument>();
    const backend = { put: async (doc: DesignDocument) => { records.set(doc.id, structuredClone(doc)); },
      get: async (id: string) => records.get(id), getAll: async () => [...records.values()],
      delete: async (id: string) => { records.delete(id); } };
    const first = createProjectStorage(backend);
    await first.save(decoded.document);
    const reopened = await createProjectStorage(backend).get(input.id);
    expect(reopened).toEqual(input);
    expect(reopened).not.toBe(records.get(input.id));
    expect(encodeProject(reopened)).toBe(encodeProject(input));
  });
});
