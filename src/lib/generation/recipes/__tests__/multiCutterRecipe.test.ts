import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createDesignDocument } from '../../../projects/createDesignDocument';
import { parseDesignDocument } from '../../../domain/documentValidation';
import { disposeObject3D } from '../../../utils/disposeThree';
import { serializeSTL } from '../../../utils/stlExporter';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80"/></svg>';
function fixture(copies = 4, columns = 2, spacingMm = 5, plate = 200) {
  const base = createDesignDocument({ name: 'Series', kind: 'cutter', source: { type: 'svg', fileName: 'series.svg', svg } });
  return parseDesignDocument({ ...base, schemaVersion: 3, kind: 'multi-cutter', bridges: [], parameters: { ...base.parameters, buildPlateSize: plate }, layout: { copies, columns, spacingMm } });
}
async function generate(input = fixture()) {
  if (input.kind !== 'multi-cutter') throw new Error('fixture');
  const { multiCutterRecipe } = await import('../multiCutterRecipe');
  return multiCutterRecipe.generate(input, { signal: new AbortController().signal, revision: 1 });
}
describe('multi-cutter recipe', () => {
  it('lays out exactly the measured valid copies and exports deterministically', async () => {
    const first = (await generate())[0], second = (await generate())[0];
    try {
      expect(first.object.children).toHaveLength(4);
      expect(first.validation.valid).toBe(true);
      const parts = first.object.children.map(child => new THREE.Box3().setFromObject(child));
      expect(parts[1].min.x - parts[0].max.x).toBeCloseTo(5, 4);
      expect(parts[2].min.z - parts[0].max.z).toBeCloseTo(5, 4);
      expect(first.dimensionsMm.width).toBeCloseTo(parts[0].getSize(new THREE.Vector3()).x * 2 + 5, 4);
      const a = serializeSTL(first.object), b = serializeSTL(second.object);
      expect(a).toBeInstanceOf(DataView); expect(b).toBeInstanceOf(DataView);
      if (typeof a === 'string' || typeof b === 'string') throw new Error('binary expected');
      expect(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).toEqual(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
      const geometries = new Set<THREE.BufferGeometry>();
      first.object.traverse(child => { if (child instanceof THREE.Mesh) { expect(geometries.has(child.geometry)).toBe(false); geometries.add(child.geometry); } });
    } finally { disposeObject3D(first.object); disposeObject3D(second.object); }
  }, 30000);
  it('refuses a small plate without returning a partial series', async () => {
    await expect(generate(fixture(4, 2, 5, 100))).rejects.toThrow(/plate|plateau|layout|Grid/i);
  }, 30000);
  it('preserves a connected island bridge in every generated copy', async () => {
    const base = fixture(2, 2, 5);
    const bridged = parseDesignDocument({ ...base, sketch: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80"/><rect x="40" y="40" width="20" height="20"/></svg>', revision: 1 }, bridges: [{ id: 'join', from: { x: 10, y: 50 }, to: { x: 40, y: 50 }, widthMm: 2 }] });
    const artifact = (await generate(bridged))[0];
    try { expect(artifact.object.children).toHaveLength(2); expect(artifact.validation.valid).toBe(true); expect(artifact.validation.shells).toBe(2); }
    finally { disposeObject3D(artifact.object); }
  }, 30000);
  it('rejects an incomplete cutter rather than disguising it as independent copies', async () => {
    const input = fixture(2, 2);
    const incomplete = parseDesignDocument({ ...input, sketch: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80"/><rect x="40" y="40" width="20" height="20"/></svg>', revision: 1 } });
    await expect(generate(incomplete)).rejects.toThrow();
  }, 30000);
  it('rolls back independently owned copies when cancellation arrives between copies', async () => {
    const { multiCutterRecipe } = await import('../multiCutterRecipe');
    const input = fixture(); if (input.kind !== 'multi-cutter') throw new Error('fixture');
    const controller = new AbortController();
    const clones: THREE.BufferGeometry[] = [];
    const realClone = THREE.BufferGeometry.prototype.clone;
    const cloneSpy = vi.spyOn(THREE.BufferGeometry.prototype, 'clone').mockImplementation(function (this: THREE.BufferGeometry) { const copy = realClone.call(this); clones.push(copy); return copy; });
    const disposeSpy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    let checks = 0;
    const checkSpy = vi.spyOn(controller.signal, 'throwIfAborted').mockImplementation(() => {
      if (++checks === 6) controller.abort();
      AbortSignal.prototype.throwIfAborted.call(controller.signal);
    });
    try {
      await expect(multiCutterRecipe.generate(input, { signal: controller.signal, revision: 1 })).rejects.toThrow();
      expect(clones.length).toBeGreaterThan(0);
      for (const clone of clones) expect(disposeSpy.mock.contexts.filter(value => value === clone)).toHaveLength(1);
    } finally { cloneSpy.mockRestore(); disposeSpy.mockRestore(); checkSpy.mockRestore(); }
  }, 30_000);
  it('honours an already-aborted request' , async () => {
    const { multiCutterRecipe } = await import('../multiCutterRecipe');
    const input = fixture(); if (input.kind !== 'multi-cutter') throw new Error('fixture');
    const controller = new AbortController(); controller.abort();
    await expect(multiCutterRecipe.generate(input, { signal: controller.signal, revision: 1 })).rejects.toThrow();
  });
});
