import type { DesignKind } from './designKind';
import type { DesignParametersByKind } from './designParameters';

export interface SvgDesignSource {
  readonly type: 'svg';
  readonly fileName: string;
  /** Import initial normalisé, conservé pour restauration ; peut différer de sketch.svg. */
  readonly svg: string;
}

export type RasterMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface RasterDesignSource {
  readonly type: 'raster';
  readonly fileName: string;
  readonly mimeType: RasterMimeType;
  /** Import initial vectorisé et normalisé, conservé pour restauration ; peut différer de sketch.svg. */
  readonly vectorizedSvg: string;
}

export type DesignSource = SvgDesignSource | RasterDesignSource;

export interface SketchDocument {
  /** État SVG courant éditable, remplacé à chaque édition sans modifier la source initiale. */
  readonly svg: string;
  /** Entier positif ou nul. La validation runtime sera ajoutée séparément. */
  readonly revision: number;
}

export interface ViewportPreferences {
  readonly showGrid: boolean;
  readonly showAxes: boolean;
  readonly showWallThickness: boolean;
}

export type DesignDocumentV1<K extends DesignKind = DesignKind> = {
  [Kind in K]: [DesignParametersByKind[Kind]] extends [never]
    ? never
    : {
        readonly schemaVersion: 1;
        readonly id: string;
        readonly name: string;
        readonly kind: Kind;
        readonly source: DesignSource;
        readonly sketch: SketchDocument;
        readonly parameters: DesignParametersByKind[Kind];
        readonly viewport: ViewportPreferences;
        readonly createdAt: string;
        readonly updatedAt: string;
      };
}[K];

export type DesignDocument = DesignDocumentV1;
