import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARAMS } from '../../types/CookieCutter';
import {
  BatchGenerationError,
  checkBuildPlateFit,
  createBatch,
  duplicateItem,
  type BatchItem
} from '../batchProcessor';

function item(id: string, targetSize = 20): BatchItem {
  return {
    id,
    name: `Item ${id}`,
    svgData: '<svg><path d="M0 0H10V10H0Z"/></svg>',
    params: { ...DEFAULT_PARAMS, targetSize }
  };
}

function model(width: number, depth: number) {
  const geometry = new THREE.BoxGeometry(width, 2, depth);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 1;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, geometry, material };
}

describe('createBatch', () => {
  it('publishes one batch only after every measured object is laid out', async () => {
    const dimensions: Record<string, [number, number]> = {
      first: [10, 12],
      second: [20, 8]
    };
    const progress: number[] = [];
    const result = await createBatch(
      [item('first'), item('second')],
      { type: 'grid', spacing: 5, columns: 2 },
      100,
      {
        generateItem: async (batchItem) => {
          const [width, depth] = dimensions[batchItem.id];
          return model(width, depth).group;
        },
        onProgress: (completed) => progress.push(completed)
      }
    );

    expect(result.report).toEqual({ succeeded: 2, failed: 0 });
    expect(result.mesh.children).toHaveLength(2);
    expect(result.totalDimensions.width).toBeCloseTo(35, 5);
    expect(result.totalDimensions.height).toBeCloseTo(12, 5);
    expect(progress).toEqual([1, 2]);
    expect(result.items.every((batchItem) => batchItem.position !== undefined)).toBe(true);
  });

  it('reports all item failures and disposes every successful object', async () => {
    const first = model(10, 10);
    const third = model(10, 10);
    const firstDispose = vi.spyOn(first.geometry, 'dispose');
    const thirdDispose = vi.spyOn(third.geometry, 'dispose');
    let thrown: unknown;

    try {
      await createBatch(
        [item('first'), item('bad'), item('third')],
        { type: 'grid', spacing: 5, columns: 2 },
        100,
        {
          generateItem: async (batchItem) => {
            if (batchItem.id === 'bad') throw new Error('Broken SVG');
            return batchItem.id === 'first' ? first.group : third.group;
          }
        }
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BatchGenerationError);
    expect(thrown).toMatchObject({ succeededBeforeRollback: 2 });
    expect((thrown as BatchGenerationError).failures).toEqual([
      expect.objectContaining({ id: 'bad', stage: 'generation', message: 'Broken SVG' })
    ]);
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(thirdDispose).toHaveBeenCalledOnce();
  });

  it('rolls generated geometry back when the measured layout does not fit', async () => {
    const generated = [model(60, 20), model(60, 20)];
    const disposals = generated.map(({ geometry }) => vi.spyOn(geometry, 'dispose'));

    await expect(createBatch(
      [item('first'), item('second')],
      { type: 'grid', spacing: 10, columns: 2 },
      100,
      { generateItem: async (_item) => generated.shift()!.group }
    )).rejects.toMatchObject({
      name: 'BatchGenerationError',
      failures: [expect.objectContaining({ stage: 'layout' })]
    });

    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });

  it('cancels between items and rolls back completed geometry', async () => {
    const controller = new AbortController();
    const first = model(10, 10);
    const dispose = vi.spyOn(first.geometry, 'dispose');

    await expect(createBatch(
      [item('first'), item('second')],
      { type: 'grid', spacing: 5 },
      100,
      {
        signal: controller.signal,
        generateItem: async () => first.group,
        onProgress: (completed) => {
          if (completed === 1) controller.abort();
        }
      }
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(dispose).toHaveBeenCalledOnce();
  });
});

describe('batch planning helpers', () => {
  it('returns a useful preflight warning instead of silently dropping items', () => {
    const result = checkBuildPlateFit(
      [item('first', 70), item('second', 70)],
      { type: 'grid', spacing: 10, columns: 2 },
      100
    );
    expect(result.fits).toBe(false);
    expect(result.warnings[0]).toMatch(/requires/i);
  });

  it('creates defensive duplicate parameter objects and bounds the count', () => {
    const source = item('source');
    const duplicates = duplicateItem(source, 2);
    expect(duplicates).toHaveLength(2);
    expect(duplicates[0].params).not.toBe(source.params);
    expect(() => duplicateItem(source, 101)).toThrow(/between 0 and 100/i);
  });
});
