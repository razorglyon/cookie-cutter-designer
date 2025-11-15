import type { ProjectData } from '../types/Project';
import { PROJECT_VERSION } from '../types/Project';
import type { CookieCutterParams } from '../types/CookieCutter';

/**
 * Export project to JSON file
 */
export function exportProject(
  name: string,
  svgData: string,
  parameters: CookieCutterParams,
  thumbnail?: string,
  metadata?: ProjectData['metadata']
): void {
  const project: ProjectData = {
    version: PROJECT_VERSION,
    name,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    svgData,
    parameters,
    thumbnail,
    metadata
  };

  const jsonString = JSON.stringify(project, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^a-z0-9]/gi, '_')}.ccd.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Import project from JSON file
 */
export async function importProject(file: File): Promise<ProjectData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const jsonString = e.target?.result as string;
        const project: ProjectData = JSON.parse(jsonString);

        // Validate project structure
        if (!project.version || !project.svgData || !project.parameters) {
          throw new Error('Invalid project file format');
        }

        // Check version compatibility
        if (project.version !== PROJECT_VERSION) {
          console.warn(`Project version ${project.version} may not be fully compatible with current version ${PROJECT_VERSION}`);
        }

        resolve(project);
      } catch (error) {
        reject(new Error(`Failed to parse project file: ${error}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read project file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Save project to localStorage
 */
export function saveProjectToStorage(projectData: ProjectData): void {
  const key = `ccd_project_${Date.now()}`;
  localStorage.setItem(key, JSON.stringify(projectData));
}

/**
 * Load all projects from localStorage
 */
export function loadProjectsFromStorage(): ProjectData[] {
  const projects: ProjectData[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('ccd_project_')) {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          projects.push(JSON.parse(data));
        }
      } catch (error) {
        console.error(`Failed to load project from key ${key}:`, error);
      }
    }
  }

  // Sort by modified date
  projects.sort((a, b) =>
    new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
  );

  return projects;
}

/**
 * Delete project from localStorage
 */
export function deleteProjectFromStorage(projectData: ProjectData): void {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('ccd_project_')) {
      const data = localStorage.getItem(key);
      if (data) {
        const project = JSON.parse(data);
        if (project.createdAt === projectData.createdAt) {
          localStorage.removeItem(key);
          return;
        }
      }
    }
  }
}

/**
 * Generate thumbnail from canvas
 */
export function generateThumbnail(canvas: HTMLCanvasElement, maxSize: number = 200): string {
  const thumbnailCanvas = document.createElement('canvas');
  const ctx = thumbnailCanvas.getContext('2d');

  if (!ctx) return '';

  // Calculate thumbnail dimensions
  const scale = Math.min(maxSize / canvas.width, maxSize / canvas.height);
  thumbnailCanvas.width = canvas.width * scale;
  thumbnailCanvas.height = canvas.height * scale;

  // Draw scaled image
  ctx.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);

  // Return as base64
  return thumbnailCanvas.toDataURL('image/png');
}
