import type { CookieCutterParams } from './CookieCutter';

export interface ProjectData {
  version: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  svgData: string;
  parameters: CookieCutterParams;
  thumbnail?: string; // Base64 encoded image
  metadata?: {
    originalFileName?: string;
    fileType?: 'svg' | 'png' | 'jpg';
    notes?: string;
  };
}

export const PROJECT_VERSION = '1.0.0';
