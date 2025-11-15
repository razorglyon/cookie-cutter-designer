import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { Mesh, Object3D } from 'three';
import type { Group } from 'three';
import type { ExportOptions } from '../types/CookieCutter';

/**
 * Export a Three.js mesh or group to STL format
 */
export function exportToSTL(object: Mesh | Group, filename: string = 'cookie-cutter.stl', options: ExportOptions = { binary: true, includeMetadata: false }): void {
  const exporter = new STLExporter();

  // Generate STL data
  const result = exporter.parse(object, { binary: options.binary });

  // Create blob
  let blob: Blob;
  if (options.binary) {
    blob = new Blob([result as ArrayBuffer], { type: 'application/octet-stream' });
  } else {
    blob = new Blob([result as string], { type: 'text/plain' });
  }

  // Trigger download
  downloadBlob(blob, filename);
}

/**
 * Helper function to trigger file download
 */
function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Calculate estimated file size before export
 */
export function estimateSTLSize(object: Mesh | Group, binary: boolean = true): number {
  let totalFaces = 0;

  // Traverse all meshes in the object
  object.traverse((child) => {
    if (child instanceof Object3D && 'geometry' in child) {
      const mesh = child as Mesh;
      const geometry = mesh.geometry;
      const faceCount = geometry.index
        ? geometry.index.count / 3
        : geometry.attributes.position.count / 3;
      totalFaces += faceCount;
    }
  });

  if (binary) {
    // Binary STL: 80 byte header + 4 bytes face count + (50 bytes per triangle)
    return 84 + (totalFaces * 50);
  } else {
    // ASCII STL: rough estimate ~200 bytes per triangle
    return totalFaces * 200;
  }
}

/**
 * Format file size to human readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
