import * as THREE from 'three';
import type { CookieCutterParams } from '../types/CookieCutter';
import { generateCookieCutter } from './cookieCutterGenerator';
import { generateStamp } from './stampGenerator';

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

export interface BatchResult {
  mesh: THREE.Group;
  items: BatchItem[];
  layout: BatchLayout;
  totalDimensions: { width: number; height: number };
}

/**
 * Create a batch of cookie cutters arranged on the build plate
 */
export async function createBatch(
  items: BatchItem[],
  layout: BatchLayout,
  buildPlateSize: number
): Promise<BatchResult> {
  const batchGroup = new THREE.Group();
  batchGroup.name = 'batch';

  // Calculate layout positions
  const positionedItems = calculateLayout(items, layout, buildPlateSize);

  // Generate each item
  for (const item of positionedItems) {
    try {
      const mesh = item.params.mode === 'stamp'
        ? await generateStamp(item.svgData, item.params)
        : await generateCookieCutter(item.svgData, item.params);

      // Position the mesh
      if (item.position) {
        mesh.position.set(item.position.x, 0, item.position.y);
      }

      mesh.name = item.id;
      batchGroup.add(mesh);
    } catch (error) {
      console.error(`Error generating item ${item.id}:`, error);
    }
  }

  // Calculate total dimensions
  const box = new THREE.Box3().setFromObject(batchGroup);
  const size = box.getSize(new THREE.Vector3());

  return {
    mesh: batchGroup,
    items: positionedItems,
    layout,
    totalDimensions: { width: size.x, height: size.z }
  };
}

/**
 * Calculate positions for items based on layout type
 */
function calculateLayout(
  items: BatchItem[],
  layout: BatchLayout,
  buildPlateSize: number
): BatchItem[] {
  switch (layout.type) {
    case 'grid':
      return calculateGridLayout(items, layout, buildPlateSize);
    case 'optimized':
      return calculateOptimizedLayout(items, layout, buildPlateSize);
    case 'custom':
      return items; // User has already set positions
    default:
      return items;
  }
}

/**
 * Calculate grid layout
 */
function calculateGridLayout(
  items: BatchItem[],
  layout: BatchLayout,
  buildPlateSize: number
): BatchItem[] {
  const columns = layout.columns || Math.ceil(Math.sqrt(items.length));
  const spacing = layout.spacing;

  const positionedItems: BatchItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const row = Math.floor(i / columns);
    const col = i % columns;

    const x = (col - (columns - 1) / 2) * spacing;
    const y = (row - Math.floor(items.length / columns) / 2) * spacing;

    positionedItems.push({
      ...items[i],
      position: { x, y }
    });
  }

  return positionedItems;
}

/**
 * Calculate optimized layout (bin packing algorithm)
 */
function calculateOptimizedLayout(
  items: BatchItem[],
  layout: BatchLayout,
  buildPlateSize: number
): BatchItem[] {
  const spacing = layout.spacing;
  const positions: Array<{ x: number; y: number; width: number; height: number }> = [];
  const positionedItems: BatchItem[] = [];

  // Simple bin packing - first fit decreasing height
  // Sort items by estimated size (descending)
  const sortedItems = [...items].sort((a, b) => {
    const sizeA = a.params.scale;
    const sizeB = b.params.scale;
    return sizeB - sizeA;
  });

  let currentRow = 0;
  let currentX = -buildPlateSize / 2 + spacing;
  let currentY = -buildPlateSize / 2 + spacing;
  let rowHeight = 0;

  for (const item of sortedItems) {
    const estimatedSize = 50 * item.params.scale; // Rough estimate

    // Check if fits in current row
    if (currentX + estimatedSize + spacing > buildPlateSize / 2) {
      // Move to next row
      currentX = -buildPlateSize / 2 + spacing;
      currentY += rowHeight + spacing;
      rowHeight = 0;
      currentRow++;
    }

    // Check if still fits on plate
    if (currentY + estimatedSize + spacing > buildPlateSize / 2) {
      console.warn(`Item ${item.id} does not fit on build plate`);
      continue;
    }

    positionedItems.push({
      ...item,
      position: { x: currentX + estimatedSize / 2, y: currentY + estimatedSize / 2 }
    });

    positions.push({
      x: currentX,
      y: currentY,
      width: estimatedSize,
      height: estimatedSize
    });

    currentX += estimatedSize + spacing;
    rowHeight = Math.max(rowHeight, estimatedSize);
  }

  return positionedItems;
}

/**
 * Check if all items fit on build plate
 */
export function checkBuildPlateFit(
  items: BatchItem[],
  layout: BatchLayout,
  buildPlateSize: number
): { fits: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const positionedItems = calculateLayout(items, layout, buildPlateSize);

  let fits = true;

  for (const item of positionedItems) {
    if (!item.position) continue;

    const estimatedSize = 50 * item.params.scale;
    const x = Math.abs(item.position.x);
    const y = Math.abs(item.position.y);

    if (x + estimatedSize / 2 > buildPlateSize / 2 || y + estimatedSize / 2 > buildPlateSize / 2) {
      fits = false;
      warnings.push(`Item "${item.name}" may not fit on build plate`);
    }
  }

  if (items.length > 20) {
    warnings.push('Large batch may take longer to process');
  }

  return { fits, warnings };
}

/**
 * Estimate total print time for batch
 */
export function estimateBatchPrintTime(items: BatchItem[]): number {
  // Simplified estimation
  let totalTime = 0;

  for (const item of items) {
    const volume = item.params.wallThickness * item.params.cuttingHeight * 100 * item.params.scale;
    totalTime += volume / 10; // Rough estimate
  }

  return Math.round(totalTime);
}

/**
 * Estimate total filament usage for batch
 */
export function estimateBatchFilament(items: BatchItem[]): number {
  let totalFilament = 0;

  for (const item of items) {
    const volume = item.params.wallThickness * item.params.cuttingHeight * 100 * item.params.scale;
    totalFilament += (volume / 1000) * 1.24; // PLA density
  }

  return Math.round(totalFilament);
}

/**
 * Generate batch summary
 */
export function generateBatchSummary(result: BatchResult): string {
  const { items, layout, totalDimensions } = result;

  const summary = [
    '=== Batch Print Summary ===',
    '',
    `Total Items: ${items.length}`,
    `Layout: ${layout.type}`,
    `Spacing: ${layout.spacing}mm`,
    `Total Size: ${totalDimensions.width.toFixed(1)}mm × ${totalDimensions.height.toFixed(1)}mm`,
    '',
    '=== Items ===',
    ...items.map((item, i) => `${i + 1}. ${item.name} at (${item.position?.x.toFixed(1)}, ${item.position?.y.toFixed(1)})`),
    '',
    `Estimated Print Time: ${estimateBatchPrintTime(items)} minutes`,
    `Estimated Filament: ${estimateBatchFilament(items)}g`
  ];

  return summary.join('\n');
}

/**
 * Clone an item multiple times
 */
export function duplicateItem(item: BatchItem, count: number): BatchItem[] {
  const duplicates: BatchItem[] = [];

  for (let i = 0; i < count; i++) {
    duplicates.push({
      ...item,
      id: `${item.id}_copy_${i}`,
      name: `${item.name} (Copy ${i + 1})`
    });
  }

  return duplicates;
}
