import type { Object3D } from 'three';
import type { GeometryValidationReport } from '../utils/geometryValidation';

export type ArtifactRole =
  | 'primary'
  | 'cutter'
  | 'stamp'
  | 'handle'
  | 'tray'
  | 'set-item';

export interface ModelDimensions {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/**
 * Artefact strictement runtime contenant un objet Three.js.
 * Ce type ne doit jamais être sérialisé ; seul le document de conception l’est.
 */
export interface GeneratedArtifact {
  readonly id: string;
  readonly role: ArtifactRole;
  readonly object: Object3D;
  readonly dimensionsMm: ModelDimensions;
  readonly validation: GeometryValidationReport;
}
