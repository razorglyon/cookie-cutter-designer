export type DesignSizeModeV1 = 'longest' | 'width' | 'height';

export type DesignHandleStyleV1 =
  | 'round'
  | 'chamfered'
  | 'rectangular'
  | 'flat'
  | 'none';

interface DesignParametersV1Base<TMode extends 'cutter' | 'stamp'> {
  readonly wallThickness: number;
  readonly cuttingHeight: number;
  readonly totalHeight: number;
  readonly taperAngle: number;
  readonly targetSize: number;
  readonly sizeMode: DesignSizeModeV1;
  readonly handleStyle: DesignHandleStyleV1;
  readonly handleHeight: number;
  readonly enableHandle: boolean;
  readonly enableEmbossing: boolean;
  readonly embossDepth: number;
  readonly buildPlateSize: number;
  readonly mode: TMode;
  readonly stampDepth: number;
  readonly stampBase: boolean;
}

export type CutterDesignParameters = DesignParametersV1Base<'cutter'>;
export type StampDesignParameters = DesignParametersV1Base<'stamp'>;

export interface DesignParametersByKind {
  cutter: CutterDesignParameters;
  'imprint-cutter': never;
  stamp: StampDesignParameters;
  'cutter-and-stamp': never;
  'multi-cutter': never;
  'cutter-set': never;
  stencil: never;
  'sandwich-cutter': never;
  'cake-topper': never;
  'cake-pop-mold': never;
  'practice-cookie': never;
}

export const DEFAULT_CUTTER_PARAMETERS_V1: CutterDesignParameters = Object.freeze({
  wallThickness: 1,
  cuttingHeight: 12,
  totalHeight: 20,
  taperAngle: 7,
  targetSize: 75,
  sizeMode: 'longest',
  handleStyle: 'round',
  handleHeight: 8,
  enableHandle: true,
  enableEmbossing: false,
  embossDepth: 2.5,
  buildPlateSize: 200,
  mode: 'cutter',
  stampDepth: 3,
  stampBase: true
});

export const DEFAULT_STAMP_PARAMETERS_V1: StampDesignParameters = Object.freeze({
  wallThickness: 1,
  cuttingHeight: 12,
  totalHeight: 20,
  taperAngle: 7,
  targetSize: 75,
  sizeMode: 'longest',
  handleStyle: 'round',
  handleHeight: 8,
  enableHandle: true,
  enableEmbossing: false,
  embossDepth: 2.5,
  buildPlateSize: 200,
  mode: 'stamp',
  stampDepth: 3,
  stampBase: true
});

export function createDefaultCutterParameters(): CutterDesignParameters {
  return { ...DEFAULT_CUTTER_PARAMETERS_V1 };
}

export function createDefaultStampParameters(): StampDesignParameters {
  return { ...DEFAULT_STAMP_PARAMETERS_V1 };
}
