import * as THREE from 'three';
import type { Group, Mesh } from 'three';
import type { CookieCutterParams } from '../types/CookieCutter';
import { disposeObject3D } from './disposeThree';
import { generateCookieCutter } from './cookieCutterGenerator';

export interface BatchItem {
  id: string;
  name: string;
  svgData: string;
  params: CookieCutterParams;
  position?: { x: number; y: number };
}

export interface BatchLayout {
  type: 'grid' | 'optimized' | 'custom';
  spacing: number;
  columns?: number;
}

export interface BatchFailure {
  id: string;
  name: string;
  stage: 'generation' | 'layout';
  message: string;
}

export interface BatchResult {
  mesh: THREE.Group;
  items: BatchItem[];
  layout: BatchLayout;
  totalDimensions: { width: number; height: number };
  report: { succeeded: number; failed: 0 };
}

type ModelObject = Mesh | Group;
type GeneratedEntry = {
  item: BatchItem;
  object: ModelObject;
  width: number;
  depth: number;
};

export interface BatchOptions {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, item: BatchItem) => void;
  generateItem?: (item: BatchItem) => Promise<ModelObject>;
}

export class BatchGenerationError extends Error {
  readonly failures: readonly BatchFailure[];
  readonly succeededBeforeRollback: number;

  constructor(message: string, failures: readonly BatchFailure[], succeededBeforeRollback: number) {
    super(message);
    this.name = 'BatchGenerationError';
    this.failures = Object.freeze(failures.map((failure) => Object.freeze({ ...failure })));
    this.succeededBeforeRollback = succeededBeforeRollback;
  }
}

function abortError(): DOMException {
  return new DOMException('Batch generation was cancelled and rolled back.', 'AbortError');
}

async function defaultGenerateItem(item: BatchItem): Promise<ModelObject> {
  if (item.params.mode === 'stamp') {
    const { generateStamp } = await import('./stampGenerator');
    return generateStamp(item.svgData, item.params);
  }
  return generateCookieCutter(item.svgData, item.params);
}

function validateBatchInput(
  items: readonly BatchItem[],
  layout: BatchLayout,
  buildPlateSize: number
): void {
  if (items.length === 0) throw new Error('A batch requires at least one item.');
  if (!Number.isFinite(buildPlateSize) || buildPlateSize <= 0) {
    throw new Error('Build plate size must be a positive finite number.');
  }
  if (!Number.isFinite(layout.spacing) || layout.spacing < 0) {
    throw new Error('Batch spacing must be a non-negative finite number.');
  }
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw new Error('Batch item IDs must be unique.');
}

function cleanup(entries: readonly GeneratedEntry[]): void {
  for (const entry of entries) disposeObject3D(entry.object);
}

function positioned(
  entry: GeneratedEntry,
  x: number,
  y: number
): GeneratedEntry {
  return {
    ...entry,
    item: { ...entry.item, position: { x, y } }
  };
}

function gridLayout(
  entries: readonly GeneratedEntry[],
  layout: BatchLayout,
  plate: number
): GeneratedEntry[] {
  const columns = Math.max(1, Math.min(layout.columns ?? Math.ceil(Math.sqrt(entries.length)), entries.length));
  const rows = Math.ceil(entries.length / columns);
  const columnWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(...entries.filter((_, index) => index % columns === column).map((entry) => entry.width), 0)
  );
  const rowDepths = Array.from({ length: rows }, (_, row) =>
    Math.max(...entries.slice(row * columns, (row + 1) * columns).map((entry) => entry.depth), 0)
  );
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0) + layout.spacing * (columns - 1);
  const totalDepth = rowDepths.reduce((sum, depth) => sum + depth, 0) + layout.spacing * (rows - 1);
  if (totalWidth > plate || totalDepth > plate) {
    throw new Error(`Grid requires ${totalWidth.toFixed(1)} × ${totalDepth.toFixed(1)} mm on a ${plate} mm plate.`);
  }

  const xCenters: number[] = [];
  let cursorX = -totalWidth / 2;
  for (const width of columnWidths) {
    xCenters.push(cursorX + width / 2);
    cursorX += width + layout.spacing;
  }
  const yCenters: number[] = [];
  let cursorY = -totalDepth / 2;
  for (const depth of rowDepths) {
    yCenters.push(cursorY + depth / 2);
    cursorY += depth + layout.spacing;
  }

  return entries.map((entry, index) =>
    positioned(entry, xCenters[index % columns], yCenters[Math.floor(index / columns)])
  );
}

function optimizedLayout(
  entries: readonly GeneratedEntry[],
  layout: BatchLayout,
  plate: number
): GeneratedEntry[] {
  const sorted = [...entries].sort((first, second) => second.depth - first.depth || second.width - first.width);
  const result: GeneratedEntry[] = [];
  let left = -plate / 2;
  let bottom = -plate / 2;
  let rowDepth = 0;

  for (const entry of sorted) {
    if (entry.width > plate || entry.depth > plate) {
      throw new Error(`Item “${entry.item.name}” exceeds the ${plate} mm build plate.`);
    }
    if (left > -plate / 2 && left + entry.width > plate / 2) {
      left = -plate / 2;
      bottom += rowDepth + layout.spacing;
      rowDepth = 0;
    }
    if (bottom + entry.depth > plate / 2) {
      throw new Error(`Optimized layout cannot place “${entry.item.name}” on the ${plate} mm plate.`);
    }
    result.push(positioned(entry, left + entry.width / 2, bottom + entry.depth / 2));
    left += entry.width + layout.spacing;
    rowDepth = Math.max(rowDepth, entry.depth);
  }
  return result;
}

function customLayout(entries: readonly GeneratedEntry[], plate: number): GeneratedEntry[] {
  return entries.map((entry) => {
    if (!entry.item.position) throw new Error(`Item “${entry.item.name}” has no custom position.`);
    const { x, y } = entry.item.position;
    if (
      Math.abs(x) + entry.width / 2 > plate / 2 ||
      Math.abs(y) + entry.depth / 2 > plate / 2
    ) {
      throw new Error(`Item “${entry.item.name}” exceeds the build plate at its custom position.`);
    }
    return positioned(entry, x, y);
  });
}

function calculateLayout(
  entries: readonly GeneratedEntry[],
  layout: BatchLayout,
  plate: number
): GeneratedEntry[] {
  if (layout.type === 'grid') return gridLayout(entries, layout, plate);
  if (layout.type === 'optimized') return optimizedLayout(entries, layout, plate);
  return customLayout(entries, plate);
}

/** Generate all items, then publish the group only if every item and layout succeeds. */
export async function createBatch(
  items: readonly BatchItem[],
  layout: BatchLayout,
  buildPlateSize: number,
  options: BatchOptions = {}
): Promise<BatchResult> {
  validateBatchInput(items, layout, buildPlateSize);
  const generateItem = options.generateItem ?? defaultGenerateItem;
  const generated: GeneratedEntry[] = [];
  const failures: BatchFailure[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (options.signal?.aborted) {
      cleanup(generated);
      throw abortError();
    }
    try {
      const object = await generateItem({ ...item, params: { ...item.params } });
      if (options.signal?.aborted) {
        disposeObject3D(object);
        throw abortError();
      }
      object.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
      generated.push({ item: { ...item, params: { ...item.params } }, object, width: size.x, depth: size.z });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        cleanup(generated);
        throw error;
      }
      failures.push({
        id: item.id,
        name: item.name,
        stage: 'generation',
        message: error instanceof Error ? error.message : 'Unknown generation error.'
      });
    } finally {
      options.onProgress?.(index + 1, items.length, item);
    }
  }

  if (failures.length > 0) {
    cleanup(generated);
    throw new BatchGenerationError(
      `${failures.length} batch item(s) failed; no batch was created.`,
      failures,
      generated.length
    );
  }

  let laidOut: GeneratedEntry[];
  try {
    laidOut = calculateLayout(generated, layout, buildPlateSize);
  } catch (error) {
    cleanup(generated);
    throw new BatchGenerationError(
      'Batch layout failed; every generated item was rolled back.',
      [{
        id: 'batch',
        name: 'Batch layout',
        stage: 'layout',
        message: error instanceof Error ? error.message : 'Unknown layout error.'
      }],
      generated.length
    );
  }

  const batchGroup = new THREE.Group();
  batchGroup.name = 'batch';
  for (const entry of laidOut) {
    const position = entry.item.position!;
    entry.object.position.set(position.x, 0, position.y);
    entry.object.name = entry.item.id;
    batchGroup.add(entry.object);
  }
  batchGroup.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(batchGroup).getSize(new THREE.Vector3());

  return {
    mesh: batchGroup,
    items: laidOut.map((entry) => entry.item),
    layout: { ...layout },
    totalDimensions: { width: size.x, height: size.z },
    report: { succeeded: laidOut.length, failed: 0 }
  };
}

export function checkBuildPlateFit(
  items: readonly BatchItem[],
  layout: BatchLayout,
  buildPlateSize: number
): { fits: boolean; warnings: string[] } {
  if (items.length === 0) return { fits: true, warnings: [] };
  const estimates: GeneratedEntry[] = items.map((item) => ({
    item: { ...item },
    object: new THREE.Group(),
    width: item.params.targetSize,
    depth: item.params.targetSize
  }));
  try {
    calculateLayout(estimates, layout, buildPlateSize);
    return {
      fits: true,
      warnings: items.length > 20 ? ['Large batch may take longer to process.'] : []
    };
  } catch (error) {
    return {
      fits: false,
      warnings: [error instanceof Error ? error.message : 'Estimated layout does not fit.']
    };
  }
}

export function estimateBatchPrintTime(items: readonly BatchItem[]): number {
  return Math.round(items.reduce((total, item) =>
    total + item.params.wallThickness * item.params.cuttingHeight * 10 * (item.params.targetSize / 75), 0
  ));
}

export function estimateBatchFilament(items: readonly BatchItem[]): number {
  return Math.round(estimateBatchPrintTime(items) * 0.124);
}

export function generateBatchSummary(result: BatchResult): string {
  return [
    '=== Batch Geometry Summary ===',
    `Generated: ${result.report.succeeded}`,
    `Failed: ${result.report.failed}`,
    `Layout: ${result.layout.type}`,
    `Spacing: ${result.layout.spacing} mm`,
    `Measured size: ${result.totalDimensions.width.toFixed(1)} × ${result.totalDimensions.height.toFixed(1)} mm`,
    ...result.items.map((item, index) =>
      `${index + 1}. ${item.name} at (${item.position?.x.toFixed(1)}, ${item.position?.y.toFixed(1)}) mm`
    )
  ].join('\n');
}

export function duplicateItem(item: BatchItem, count: number): BatchItem[] {
  if (!Number.isInteger(count) || count < 0 || count > 100) {
    throw new Error('Duplicate count must be an integer between 0 and 100.');
  }
  return Array.from({ length: count }, (_, index) => ({
    ...item,
    params: { ...item.params },
    id: `${item.id}_copy_${index}`,
    name: `${item.name} (Copy ${index + 1})`,
    position: undefined
  }));
}
