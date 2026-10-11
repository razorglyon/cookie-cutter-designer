import * as THREE from 'three';
import type { DesignDocumentV2 } from '../../domain/designDocument';
import type { GeneratedArtifact } from '../../domain/generatedArtifact';
import { parseMultiCutterDocument } from '../../domain/documentValidation';
import { CUTTER_SERIES_LIMITS } from '../../domain/cutterSeries';
import { cutterRecipe } from './cutterRecipe';
import { createBatch, BatchGenerationError } from '../../utils/batchProcessor';
import { disposeObject3D } from '../../utils/disposeThree';
import { CutterGenerationError } from '../../utils/generationValidation';
import { validatePrintableObject } from '../../utils/geometryValidation';
import type { GenerationRecipe } from '../generationRecipe';

/** Each batch entry owns independent resources: rollback must never dispose a sibling. */
function cloneOwnedObject(source: THREE.Object3D): THREE.Group {
  const copy = source.clone(true);
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  const cloneMaterial = (material: THREE.Material): THREE.Material => {
    let value = materials.get(material);
    if (!value) { value = material.clone(); materials.set(material, value); }
    return value;
  };
  copy.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const original = child.geometry;
    const geometry: THREE.BufferGeometry = geometries.get(original) ?? original.clone();
    geometries.set(original, geometry);
    child.geometry = geometry;
    child.material = Array.isArray(child.material) ? child.material.map(cloneMaterial) : cloneMaterial(child.material);
  });
  const center = new THREE.Box3().setFromObject(copy).getCenter(new THREE.Vector3());
  copy.position.x -= center.x;
  copy.position.z -= center.z;
  const wrapper = new THREE.Group(); wrapper.add(copy);
  return wrapper;
}

export const multiCutterRecipe = Object.freeze({
  kind: 'multi-cutter',
  createDefaultParameters: cutterRecipe.createDefaultParameters,
  validateParameters: cutterRecipe.validateParameters,
  async generate(document, context): Promise<readonly GeneratedArtifact<'multi-cutter'>[]> {
    context.signal.throwIfAborted();
    const input = parseMultiCutterDocument(document);
    const { layout: _layout, ...fields } = input;
    const single: DesignDocumentV2<'cutter'> = { ...fields, schemaVersion: 2, kind: 'cutter' };
    let prototype: THREE.Object3D | undefined;
    let result: THREE.Group | undefined;
    try {
      prototype = (await cutterRecipe.generate(single, context))[0].object;
      context.signal.throwIfAborted();
      const report = validatePrintableObject(prototype, { requireSingleShell: true });
      if (!report.valid) throw new CutterGenerationError('INVALID_GEOMETRY', `Le Cutter source doit être complet et connecté : ${report.errors[0]}`);
      if (report.triangles * input.layout.copies > CUTTER_SERIES_LIMITS.maxTriangles) {
        throw new CutterGenerationError('INVALID_GEOMETRY', `La série dépasse la limite de ${CUTTER_SERIES_LIMITS.maxTriangles} triangles. Réduisez les copies ou simplifiez le dessin.`);
      }
      const source = prototype;
      const items = Array.from({ length: input.layout.copies }, (_, index) => ({
        id: `${input.id}:copy:${index + 1}`, name: `Copy ${index + 1}`, svgData: input.sketch.svg, params: { ...input.parameters }
      }));
      let batch: Awaited<ReturnType<typeof createBatch>>;
      try {
        batch = await createBatch(items, { type: 'grid', columns: input.layout.columns, spacing: input.layout.spacingMm }, input.parameters.buildPlateSize, {
        signal: context.signal,
        generateItem: async () => {
          // Yield between copies so a user cancellation or document switch is observed.
          await new Promise<void>(resolve => setTimeout(resolve, 0));
          context.signal.throwIfAborted();
          return cloneOwnedObject(source);
        }
        });
      } catch (cause) {
        if (cause instanceof BatchGenerationError && cause.failures.some(failure => failure.stage === 'layout')) {
          throw new CutterGenerationError('INVALID_GEOMETRY', `La série dépasse le plateau de ${input.parameters.buildPlateSize} mm. Réduisez les copies ou les colonnes, ou agrandissez le plateau.`, { field: 'layout', reason: 'series-plate-overflow' });
        }
        throw cause;
      }
      result = batch.mesh;
      context.signal.throwIfAborted();
      const validation = validatePrintableObject(result);
      if (!validation.valid || validation.shells !== input.layout.copies || validation.bounds === null) {
        throw new CutterGenerationError('INVALID_GEOMETRY', `Série invalide : ${validation.errors[0] ?? 'nombre de pièces inattendu'}`);
      }
      const artifact: GeneratedArtifact<'multi-cutter'> = Object.freeze({
        id: `${input.id}:series:${context.revision}`, role: 'primary', object: result, validation,
        dimensionsMm: Object.freeze({ width: batch.totalDimensions.width, depth: batch.totalDimensions.height, height: validation.bounds.max.y - validation.bounds.min.y })
      });
      result = undefined;
      return Object.freeze([artifact]);
    } finally {
      if (prototype) disposeObject3D(prototype);
      if (result) disposeObject3D(result);
    }
  }
} satisfies GenerationRecipe<'multi-cutter'>);
