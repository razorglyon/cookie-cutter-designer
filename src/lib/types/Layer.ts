export type LayerType = 'cutter' | 'stamp' | 'emboss';

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  svgData: string;
  visible: boolean;
  depth: number; // Depth for stamp/emboss layers
  offset: number; // Z-offset from base
  enabled: boolean;
}

export interface MultiLayerDesign {
  layers: Layer[];
  baseHeight: number; // Base cutter height
  combinedMode: boolean; // Export as single STL or separate files
}

export const DEFAULT_LAYER: Omit<Layer, 'id' | 'svgData'> = {
  name: 'New Layer',
  type: 'cutter',
  visible: true,
  depth: 2.5,
  offset: 0,
  enabled: true,
};
