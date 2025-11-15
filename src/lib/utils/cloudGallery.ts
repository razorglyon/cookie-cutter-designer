import type { CookieCutterParams } from '../types/CookieCutter';

export interface DesignMetadata {
  id: string;
  name: string;
  description: string;
  author: string;
  createdAt: number;
  updatedAt: number;
  likes: number;
  downloads: number;
  tags: string[];
  thumbnail?: string;
}

export interface SavedDesign {
  metadata: DesignMetadata;
  svgData: string;
  params: CookieCutterParams;
}

export interface GalleryFilter {
  search?: string;
  tags?: string[];
  sortBy: 'recent' | 'popular' | 'downloads';
}

// Simulated cloud storage using localStorage (in production, would use a real backend)
const STORAGE_KEY = 'cookie_cutter_gallery';
const USER_DESIGNS_KEY = 'cookie_cutter_user_designs';

/**
 * Get all designs from the gallery
 */
export function getGalleryDesigns(): SavedDesign[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : getSeedDesigns();
  } catch (error) {
    console.error('Error loading gallery:', error);
    return getSeedDesigns();
  }
}

/**
 * Get user's own designs
 */
export function getUserDesigns(): SavedDesign[] {
  try {
    const data = localStorage.getItem(USER_DESIGNS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading user designs:', error);
    return [];
  }
}

/**
 * Save a design to the gallery
 */
export function saveDesignToGallery(design: Omit<SavedDesign, 'metadata'>, name: string, description: string, tags: string[]): SavedDesign {
  const newDesign: SavedDesign = {
    metadata: {
      id: generateId(),
      name,
      description,
      author: 'You',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      likes: 0,
      downloads: 0,
      tags
    },
    svgData: design.svgData,
    params: design.params
  };

  const userDesigns = getUserDesigns();
  userDesigns.unshift(newDesign);
  localStorage.setItem(USER_DESIGNS_KEY, JSON.stringify(userDesigns));

  return newDesign;
}

/**
 * Publish design to community gallery
 */
export function publishToGallery(design: SavedDesign): void {
  const designs = getGalleryDesigns();
  const existing = designs.findIndex(d => d.metadata.id === design.metadata.id);

  if (existing >= 0) {
    designs[existing] = { ...design, metadata: { ...design.metadata, updatedAt: Date.now() } };
  } else {
    designs.unshift(design);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
}

/**
 * Delete a design
 */
export function deleteDesign(id: string): void {
  const userDesigns = getUserDesigns();
  const filtered = userDesigns.filter(d => d.metadata.id !== id);
  localStorage.setItem(USER_DESIGNS_KEY, JSON.stringify(filtered));
}

/**
 * Like a design
 */
export function likeDesign(id: string): void {
  const designs = getGalleryDesigns();
  const design = designs.find(d => d.metadata.id === id);

  if (design) {
    design.metadata.likes++;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
  }
}

/**
 * Increment download count
 */
export function incrementDownloads(id: string): void {
  const designs = getGalleryDesigns();
  const design = designs.find(d => d.metadata.id === id);

  if (design) {
    design.metadata.downloads++;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
  }
}

/**
 * Filter and sort designs
 */
export function filterDesigns(designs: SavedDesign[], filter: GalleryFilter): SavedDesign[] {
  let filtered = [...designs];

  // Search filter
  if (filter.search) {
    const search = filter.search.toLowerCase();
    filtered = filtered.filter(d =>
      d.metadata.name.toLowerCase().includes(search) ||
      d.metadata.description.toLowerCase().includes(search) ||
      d.metadata.tags.some(tag => tag.toLowerCase().includes(search))
    );
  }

  // Tags filter
  if (filter.tags && filter.tags.length > 0) {
    filtered = filtered.filter(d =>
      filter.tags!.some(tag => d.metadata.tags.includes(tag))
    );
  }

  // Sort
  filtered.sort((a, b) => {
    switch (filter.sortBy) {
      case 'popular':
        return b.metadata.likes - a.metadata.likes;
      case 'downloads':
        return b.metadata.downloads - a.metadata.downloads;
      case 'recent':
      default:
        return b.metadata.createdAt - a.metadata.createdAt;
    }
  });

  return filtered;
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get seed designs for initial gallery
 */
function getSeedDesigns(): SavedDesign[] {
  return [
    {
      metadata: {
        id: 'seed_1',
        name: 'Classic Heart',
        description: 'Perfect for Valentine\'s Day cookies',
        author: 'Cookie Master',
        createdAt: Date.now() - 86400000 * 7,
        updatedAt: Date.now() - 86400000 * 7,
        likes: 142,
        downloads: 89,
        tags: ['valentine', 'love', 'heart', 'romantic']
      },
      svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <path d="M 50,85 C 50,85 20,60 20,45 C 20,30 30,25 40,25 C 45,25 50,30 50,30 C 50,30 55,25 60,25 C 70,25 80,30 80,45 C 80,60 50,85 50,85 Z" fill="black"/>
      </svg>`,
      params: {
        wallThickness: 1.2,
        cuttingHeight: 15,
        totalHeight: 20,
        taperAngle: 5,
        scale: 1.0,
        handleStyle: 'none',
        handleHeight: 8,
        enableHandle: false,
        enableEmbossing: false,
        embossDepth: 1.0,
        buildPlateSize: 200,
        mode: 'cutter',
        stampDepth: 2.5,
        stampBase: true
      }
    },
    {
      metadata: {
        id: 'seed_2',
        name: 'Christmas Star',
        description: 'Festive 5-point star for holiday baking',
        author: 'Winter Baker',
        createdAt: Date.now() - 86400000 * 14,
        updatedAt: Date.now() - 86400000 * 14,
        likes: 98,
        downloads: 67,
        tags: ['christmas', 'holiday', 'star', 'festive']
      },
      svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <path d="M 50,10 L 61,40 L 95,40 L 68,60 L 79,90 L 50,70 L 21,90 L 32,60 L 5,40 L 39,40 Z" fill="black"/>
      </svg>`,
      params: {
        wallThickness: 1.0,
        cuttingHeight: 12,
        totalHeight: 18,
        taperAngle: 7,
        scale: 1.2,
        handleStyle: 'none',
        handleHeight: 8,
        enableHandle: false,
        enableEmbossing: false,
        embossDepth: 1.0,
        buildPlateSize: 200,
        mode: 'cutter',
        stampDepth: 2.5,
        stampBase: true
      }
    },
    {
      metadata: {
        id: 'seed_3',
        name: 'Flower Power',
        description: 'Beautiful flower design for spring celebrations',
        author: 'Flora Designer',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now() - 86400000 * 3,
        likes: 215,
        downloads: 134,
        tags: ['flower', 'spring', 'nature', 'garden']
      },
      svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="8" fill="black"/>
        <circle cx="50" cy="25" r="12" fill="black"/>
        <circle cx="75" cy="50" r="12" fill="black"/>
        <circle cx="50" cy="75" r="12" fill="black"/>
        <circle cx="25" cy="50" r="12" fill="black"/>
        <circle cx="65" cy="35" r="12" fill="black"/>
        <circle cx="65" cy="65" r="12" fill="black"/>
        <circle cx="35" cy="65" r="12" fill="black"/>
        <circle cx="35" cy="35" r="12" fill="black"/>
      </svg>`,
      params: {
        wallThickness: 1.1,
        cuttingHeight: 14,
        totalHeight: 19,
        taperAngle: 6,
        scale: 0.9,
        handleStyle: 'none',
        handleHeight: 8,
        enableHandle: false,
        enableEmbossing: false,
        embossDepth: 1.0,
        buildPlateSize: 200,
        mode: 'cutter',
        stampDepth: 2.5,
        stampBase: true
      }
    }
  ];
}

/**
 * Get popular tags
 */
export function getPopularTags(): string[] {
  const designs = getGalleryDesigns();
  const tagCount = new Map<string, number>();

  designs.forEach(design => {
    design.metadata.tags.forEach(tag => {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    });
  });

  return Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);
}

/**
 * Export design as JSON
 */
export function exportDesignJSON(design: SavedDesign): string {
  return JSON.stringify(design, null, 2);
}

/**
 * Import design from JSON
 */
export function importDesignJSON(json: string): SavedDesign {
  return JSON.parse(json);
}
