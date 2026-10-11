import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createDesignDocument } from '../../../projects/createDesignDocument';
import { parseMultiCutterDocument } from '../../../domain/documentValidation';
import { createBatch } from '../../../utils/batchProcessor';
import { CUTTER_SERIES_LIMITS } from '../../../domain/cutterSeries';
// Only the measured triangle count is injected: the source still uses the real generator
// and geometry validator. This proves the guard, not performance at 500 000 triangles.
vi.mock('../../../utils/geometryValidation', async original => {
  const actual = await original<typeof import('../../../utils/geometryValidation')>();
  return { ...actual, validatePrintableObject: (...args: Parameters<typeof actual.validatePrintableObject>) => ({ ...actual.validatePrintableObject(...args), triangles: 250_001 }) };
});
vi.mock('../../../utils/batchProcessor', async original => {
  const actual = await original<typeof import('../../../utils/batchProcessor')>();
  return { ...actual, createBatch: vi.fn(actual.createBatch) };
});
it('rejects the total triangle budget before allocating copies and releases the source', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80"/></svg>';
  const base = createDesignDocument({ name: 'Budget', kind: 'cutter', source: { type: 'svg', fileName: 'budget.svg', svg } });
  const input = parseMultiCutterDocument({ ...base, schemaVersion: 3, kind: 'multi-cutter', bridges: [], layout: { copies: 2, columns: 2, spacingMm: 5 } });
  const { multiCutterRecipe } = await import('../multiCutterRecipe');
  const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
  try {
    await expect(multiCutterRecipe.generate(input, { signal: new AbortController().signal, revision: 1 })).rejects.toThrow(String(CUTTER_SERIES_LIMITS.maxTriangles));
    expect(createBatch).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalled();
  } finally { dispose.mockRestore(); }
});
