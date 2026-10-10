import { strToU8, zipSync } from 'fflate';
import * as THREE from 'three';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import type { CookieCutterParams } from '../types/CookieCutter';
import { CutterGenerationError } from './generationValidation';
import { validatePrintableObject } from './geometryValidation';
import { cloneForManufacturing } from './manufacturingCoordinates';

export type ExportFormat = 'stl' | 'obj' | '3mf';

const MODEL_CONTENT_TYPE =
  'application/vnd.ms-package.3dmanufacturing-3dmodel+xml';
const THREE_MF_MIME_TYPE = 'model/3mf';
const CUSTOM_METADATA_NAMESPACE =
  'https://cookie-cutter-designer.app/3mf/metadata/2026';

interface ModelVertex {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface ModelTriangle {
  readonly v1: number;
  readonly v2: number;
  readonly v3: number;
}

interface ModelMesh {
  readonly id: number;
  readonly vertices: readonly ModelVertex[];
  readonly triangles: readonly ModelTriangle[];
}

function exportFailure(
  message: string,
  details: Readonly<Record<string, unknown>>
): never {
  throw new CutterGenerationError('EXPORT_FAILED', message, details);
}

function validatedManufacturingObject(object: THREE.Object3D): THREE.Group {
  const sourceReport = validatePrintableObject(object);
  if (!sourceReport.valid) {
    exportFailure(`Export blocked: ${sourceReport.errors[0]}`, {
      errors: sourceReport.errors,
      triangles: sourceReport.triangles,
      shells: sourceReport.shells,
      meshes: sourceReport.meshes,
      volume: sourceReport.volume
    });
  }

  const manufacturingObject = cloneForManufacturing(object);
  const report = validatePrintableObject(manufacturingObject);

  if (!report.valid) {
    exportFailure(`Export blocked: ${report.errors[0]}`, {
      errors: report.errors,
      triangles: report.triangles,
      shells: report.shells,
      meshes: report.meshes,
      volume: report.volume
    });
  }

  return manufacturingObject;
}

function finiteCoordinate(value: number): number {
  if (!Number.isFinite(value)) {
    exportFailure('The manufacturing model contains a non-finite coordinate.', {
      value
    });
  }

  if (Math.abs(value) < 1e-9) return 0;
  return Number(value.toPrecision(10));
}

function coordinateKey(vertex: ModelVertex): string {
  return `${vertex.x}:${vertex.y}:${vertex.z}`;
}

function collectModelMeshes(object: THREE.Object3D): ModelMesh[] {
  const meshes: ModelMesh[] = [];
  const transformed = new THREE.Vector3();

  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const position = child.geometry.getAttribute('position');
    const index = child.geometry.getIndex();
    if (!position) return;

    const vertices: ModelVertex[] = [];
    const triangles: ModelTriangle[] = [];
    const vertexIndices = new Map<string, number>();
    const elementCount = index ? index.count : position.count;

    const addVertex = (positionIndex: number): number => {
      transformed.fromBufferAttribute(position, positionIndex).applyMatrix4(child.matrixWorld);
      const vertex: ModelVertex = {
        x: finiteCoordinate(transformed.x),
        y: finiteCoordinate(transformed.y),
        z: finiteCoordinate(transformed.z)
      };
      const key = coordinateKey(vertex);
      const existing = vertexIndices.get(key);
      if (existing !== undefined) return existing;

      const created = vertices.length;
      vertices.push(vertex);
      vertexIndices.set(key, created);
      return created;
    };

    for (let item = 0; item < elementCount; item += 3) {
      const first = index ? index.getX(item) : item;
      const second = index ? index.getX(item + 1) : item + 1;
      const third = index ? index.getX(item + 2) : item + 2;
      triangles.push({
        v1: addVertex(first),
        v2: addVertex(second),
        v3: addVertex(third)
      });
    }

    meshes.push({ id: meshes.length + 1, vertices, triangles });
  });

  if (meshes.length === 0) {
    exportFailure('The manufacturing model contains no mesh.', {});
  }

  return meshes;
}

function modelMeshXML(mesh: ModelMesh): string {
  const vertices = mesh.vertices
    .map(
      (vertex) =>
        `          <vertex x="${vertex.x}" y="${vertex.y}" z="${vertex.z}"/>`
    )
    .join('\n');
  const triangles = mesh.triangles
    .map(
      (triangle) =>
        `          <triangle v1="${triangle.v1}" v2="${triangle.v2}" v3="${triangle.v3}"/>`
    )
    .join('\n');

  return `    <object id="${mesh.id}" type="model">
      <mesh>
        <vertices>
${vertices}
        </vertices>
        <triangles>
${triangles}
        </triangles>
      </mesh>
    </object>`;
}

function generate3MFModel(
  meshes: readonly ModelMesh[],
  params?: Readonly<CookieCutterParams>
): string {
  const resources = meshes.map(modelMeshXML).join('\n');
  const buildItems = meshes
    .map((mesh) => `    <item objectid="${mesh.id}"/>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:ccd="${CUSTOM_METADATA_NAMESPACE}">
  <metadata name="Title">Cookie Cutter</metadata>
  <metadata name="Designer">Cookie Cutter Designer</metadata>
  <metadata name="Description">Validated 3D-printable cookie cutter</metadata>
  <metadata name="Application">Cookie Cutter Designer</metadata>
${params ? `  <metadata name="ccd:WallThickness" preserve="1">${params.wallThickness}</metadata>
  <metadata name="ccd:CuttingHeight" preserve="1">${params.cuttingHeight}</metadata>` : ''}
  <resources>
${resources}
  </resources>
  <build>
${buildItems}
  </build>
</model>`;
}

function contentTypesXML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/3D/3dmodel.model" ContentType="${MODEL_CONTENT_TYPE}"/>
</Types>`;
}

function rootRelationshipsXML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
}

/** Serialize a validated object to a minimal 3MF Core OPC package. */
export function serialize3MF(
  object: THREE.Object3D,
  params?: Readonly<CookieCutterParams>
): Uint8Array {
  const manufacturingObject = validatedManufacturingObject(object);
  const model = generate3MFModel(collectModelMeshes(manufacturingObject), params);

  return zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypesXML()),
      '_rels/.rels': strToU8(rootRelationshipsXML()),
      '3D/3dmodel.model': strToU8(model)
    },
    { level: 6 }
  );
}

/** Serialize a validated object to OBJ in Z-up manufacturing coordinates. */
export function serializeOBJ(object: THREE.Object3D): string {
  return new OBJExporter().parse(validatedManufacturingObject(object));
}

export function exportToOBJ(object: THREE.Object3D, filename: string): void {
  downloadBlob(new Blob([serializeOBJ(object)], { type: 'model/obj' }), filename);
}

export function exportTo3MF(
  object: THREE.Object3D,
  filename: string,
  params?: Readonly<CookieCutterParams>
): void {
  const archive = serialize3MF(object, params);
  const ownedArchive = Uint8Array.from(archive);
  downloadBlob(new Blob([ownedArchive], { type: THREE_MF_MIME_TYPE }), filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

/** Estimate output size for display only. */
export function estimateExportSize(
  object: THREE.Object3D,
  format: ExportFormat
): number {
  let triangleCount = 0;

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    if (!position) return;
    triangleCount += child.geometry.index
      ? child.geometry.index.count / 3
      : position.count / 3;
  });

  switch (format) {
    case 'stl':
      return 84 + triangleCount * 50;
    case 'obj':
      return triangleCount * 150;
    case '3mf':
      return 600 + triangleCount * 35;
  }
}
