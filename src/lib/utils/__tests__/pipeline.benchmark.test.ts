/// <reference types="node" />

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../../types/CookieCutter';
import { serialize3MF, serializeOBJ } from '../advancedExporter';
import { generateCookieCutter } from '../cookieCutterGenerator';
import { disposeObject3D } from '../disposeThree';
import { sliceMesh, disposeSliceLayers } from '../slicer';
import { generateStamp } from '../stampGenerator';
import { serializeSTL } from '../stlExporter';
import { compoundHoleSvg, concaveSvg } from './fixtures';
import { installSvgLoaderDomParserAdapter } from './svgDomTestSupport';

const BENCHMARK_OUTPUT = join(tmpdir(), 'cookie-cutter-pipeline-benchmark.json');

interface Metric {
  iterations: number;
  minimumMs: number;
  averageMs: number;
  p95Ms: number;
  maximumMs: number;
}

function summarize(samples: readonly number[]): Metric {
  const sorted = [...samples].sort((a, b) => a - b);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    iterations: samples.length,
    minimumMs: Number(sorted[0].toFixed(2)),
    averageMs: Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(2)),
    p95Ms: Number(sorted[p95Index].toFixed(2)),
    maximumMs: Number(sorted[sorted.length - 1].toFixed(2))
  };
}

async function measure(iterations: number, operation: () => Promise<void> | void): Promise<Metric> {
  const samples: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const start = performance.now();
    await operation();
    samples.push(performance.now() - start);
  }
  return summarize(samples);
}

let restoreDomParser: (() => void) | undefined;

beforeAll(() => {
  restoreDomParser = installSvgLoaderDomParserAdapter();
});

afterAll(() => {
  restoreDomParser?.();
});

describe('print-ready pipeline benchmark', () => {
  it('records bounded generation, intersection and export timings', async () => {
    const heapBefore = process.memoryUsage().heapUsed;

    const cutter = await measure(5, async () => {
      const object = await generateCookieCutter(concaveSvg, {
        ...DEFAULT_PARAMS,
        enableHandle: false,
        handleStyle: 'none',
        taperAngle: 2
      });
      disposeObject3D(object);
    });

    const stamp = await measure(3, async () => {
      const object = await generateStamp(compoundHoleSvg, {
        ...DEFAULT_PARAMS,
        mode: 'stamp',
        stampBase: true,
        enableHandle: false,
        handleStyle: 'none'
      });
      disposeObject3D(object);
    });

    const reference = await generateCookieCutter(concaveSvg, {
      ...DEFAULT_PARAMS,
      enableHandle: false,
      handleStyle: 'none'
    });

    let slicing: Metric;
    let exportSerialization: Metric;
    try {
      slicing = await measure(10, () => {
        const layers = sliceMesh(reference, {
          layerHeight: 0.2,
          minHeight: 0,
          maxHeight: DEFAULT_PARAMS.cuttingHeight
        });
        disposeSliceLayers(layers);
      });
      exportSerialization = await measure(10, () => {
        serializeSTL(reference, true);
        serializeOBJ(reference);
        serialize3MF(reference, DEFAULT_PARAMS);
      });
    } finally {
      disposeObject3D(reference);
    }

    const heapAfter = process.memoryUsage().heapUsed;
    const report = {
      generatedAt: new Date().toISOString(),
      runtime: process.version,
      heapDeltaMiB: Number(((heapAfter - heapBefore) / 1024 / 1024).toFixed(2)),
      metrics: { cutter, stamp, slicing, exportSerialization },
      notes: [
        'Raster vectorization runs in a browser Worker and is excluded from this Node benchmark.',
        'Timings are regression signals, not printer-time estimates.'
      ]
    };
    writeFileSync(BENCHMARK_OUTPUT, `${JSON.stringify(report, null, 2)}\n`);

    for (const metric of Object.values(report.metrics)) {
      expect(Number.isFinite(metric.averageMs)).toBe(true);
      expect(metric.averageMs).toBeLessThan(10_000);
    }
  }, 60_000);
});
