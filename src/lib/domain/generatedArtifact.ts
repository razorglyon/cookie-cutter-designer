import type { Object3D } from 'three';
import type { ImplementedDesignKind } from './designKind';
import type { GeometryValidationReport } from '../utils/geometryValidation';

export type ArtifactRole =
  | 'primary'
  | 'cutter'
  | 'stamp'
  | 'handle'
  | 'tray'
  | 'set-item';

export type ImplementedArtifactRolesByKind = {
  readonly cutter: 'primary' | 'cutter' | 'handle';
  readonly stamp: 'primary' | 'stamp' | 'handle';
  readonly 'multi-cutter': 'primary' | 'set-item';
};

export interface ModelDimensions {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/**
 * Artefact strictement runtime contenant un objet Three.js.
 * Ce type ne doit jamais être sérialisé ; seul le document de conception l’est.
 */
export interface GeneratedArtifact<
  K extends ImplementedDesignKind = ImplementedDesignKind
> {
  readonly id: string;
  readonly role: ImplementedArtifactRolesByKind[K];
  readonly object: Object3D;
  readonly dimensionsMm: ModelDimensions;
  readonly validation: GeometryValidationReport;
}
