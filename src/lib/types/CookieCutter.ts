// Cookie Cutter Design Parameters
export interface CookieCutterParams {
  wallThickness: number; // in mm (0.8-1.2)
  cuttingHeight: number; // in mm (10-15)
  totalHeight: number; // in mm (15-25)
  taperAngle: number; // in degrees (5-10)
  scale: number; // scaling factor
  handleStyle: HandleStyle;
  handleHeight: number; // in mm (5-10)
  enableHandle: boolean;
  enableEmbossing: boolean;
  embossDepth: number; // in mm (2-5)
  buildPlateSize: number; // in mm (build plate diameter/size)
  mode: 'cutter' | 'stamp'; // Mode: cutter or stamp
  stampDepth: number; // in mm (depth of stamp relief)
  stampBase: boolean; // Add base plate for stamp
}

export type HandleStyle = 'round' | 'chamfered' | 'rectangular' | 'flat' | 'none';

export interface Point2D {
  x: number;
  y: number;
}

export interface Path2D {
  points: Point2D[];
  closed: boolean;
}

export interface CookieCutterModel {
  mesh: any; // Three.js Mesh
  paths: Path2D[];
  params: CookieCutterParams;
}

export interface ExportOptions {
  binary: boolean;
  includeMetadata: boolean;
}

export interface PrintabilityCheck {
  isValid: boolean;
  warnings: string[];
  recommendations: string[];
}

// Default parameters based on research
export const DEFAULT_PARAMS: CookieCutterParams = {
  wallThickness: 1.0,
  cuttingHeight: 12,
  totalHeight: 20,
  taperAngle: 7,
  scale: 1.0,
  handleStyle: 'round',
  handleHeight: 8,
  enableHandle: true,
  enableEmbossing: false,
  embossDepth: 2.5,
  buildPlateSize: 200, // 200mm = 20cm (common for many 3D printers)
  mode: 'cutter',
  stampDepth: 3.0,
  stampBase: true,
};
