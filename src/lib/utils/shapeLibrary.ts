/**
 * Predefined shapes library for quick cookie cutter design
 */

export interface ShapeDefinition {
  id: string;
  name: string;
  category: 'basic' | 'seasonal' | 'animals' | 'letters' | 'numbers';
  svg: string;
  icon: string;
}

export const SHAPE_LIBRARY: ShapeDefinition[] = [
  // Basic shapes
  {
    id: 'circle',
    name: 'Circle',
    category: 'basic',
    icon: '⚪',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="40" fill="black"/>
    </svg>`
  },
  {
    id: 'square',
    name: 'Square',
    category: 'basic',
    icon: '⬛',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect x="15" y="15" width="70" height="70" fill="black"/>
    </svg>`
  },
  {
    id: 'heart',
    name: 'Heart',
    category: 'basic',
    icon: '❤️',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M50,90 C50,90 10,60 10,35 C10,20 20,10 30,10 C40,10 50,20 50,20 C50,20 60,10 70,10 C80,10 90,20 90,35 C90,60 50,90 50,90 Z" fill="black"/>
    </svg>`
  },
  {
    id: 'star',
    name: 'Star',
    category: 'basic',
    icon: '⭐',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M50,10 L61,41 L95,41 L68,61 L79,92 L50,72 L21,92 L32,61 L5,41 L39,41 Z" fill="black"/>
    </svg>`
  },
  {
    id: 'flower',
    name: 'Flower',
    category: 'basic',
    icon: '🌸',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="25" r="15" fill="black"/>
      <circle cx="75" cy="50" r="15" fill="black"/>
      <circle cx="50" cy="75" r="15" fill="black"/>
      <circle cx="25" cy="50" r="15" fill="black"/>
      <circle cx="50" cy="50" r="12" fill="black"/>
    </svg>`
  },

  // Seasonal
  {
    id: 'snowflake',
    name: 'Snowflake',
    category: 'seasonal',
    icon: '❄️',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <line x1="50" y1="10" x2="50" y2="90" stroke="black" stroke-width="4"/>
      <line x1="10" y1="50" x2="90" y2="50" stroke="black" stroke-width="4"/>
      <line x1="22" y1="22" x2="78" y2="78" stroke="black" stroke-width="4"/>
      <line x1="78" y1="22" x2="22" y2="78" stroke="black" stroke-width="4"/>
      <circle cx="50" cy="50" r="10" fill="black"/>
    </svg>`
  },
  {
    id: 'tree',
    name: 'Christmas Tree',
    category: 'seasonal',
    icon: '🎄',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M50,10 L70,40 L65,40 L80,60 L75,60 L85,80 L15,80 L25,60 L20,60 L35,40 L30,40 Z" fill="black"/>
      <rect x="45" y="80" width="10" height="10" fill="black"/>
    </svg>`
  },
  {
    id: 'pumpkin',
    name: 'Pumpkin',
    category: 'seasonal',
    icon: '🎃',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <ellipse cx="50" cy="55" rx="35" ry="30" fill="black"/>
      <rect x="48" y="25" width="4" height="10" fill="black"/>
      <path d="M45,25 Q35,15 40,10" stroke="black" stroke-width="3" fill="none"/>
    </svg>`
  },
  {
    id: 'egg',
    name: 'Easter Egg',
    category: 'seasonal',
    icon: '🥚',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M50,20 C30,20 20,35 20,55 C20,75 30,85 50,85 C70,85 80,75 80,55 C80,35 70,20 50,20 Z" fill="black"/>
    </svg>`
  },

  // Animals
  {
    id: 'cat',
    name: 'Cat',
    category: 'animals',
    icon: '🐱',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="60" r="25" fill="black"/>
      <path d="M30,35 L20,10 L35,40 Z" fill="black"/>
      <path d="M70,35 L80,10 L65,40 Z" fill="black"/>
    </svg>`
  },
  {
    id: 'dog',
    name: 'Dog',
    category: 'animals',
    icon: '🐶',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="55" r="28" fill="black"/>
      <ellipse cx="30" cy="40" rx="12" ry="20" fill="black"/>
      <ellipse cx="70" cy="40" rx="12" ry="20" fill="black"/>
    </svg>`
  },
  {
    id: 'butterfly',
    name: 'Butterfly',
    category: 'animals',
    icon: '🦋',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <ellipse cx="30" cy="35" rx="20" ry="25" fill="black"/>
      <ellipse cx="70" cy="35" rx="20" ry="25" fill="black"/>
      <ellipse cx="30" cy="65" rx="18" ry="20" fill="black"/>
      <ellipse cx="70" cy="65" rx="18" ry="20" fill="black"/>
      <rect x="48" y="20" width="4" height="60" fill="black"/>
    </svg>`
  },
  {
    id: 'fish',
    name: 'Fish',
    category: 'animals',
    icon: '🐠',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <ellipse cx="45" cy="50" rx="30" ry="20" fill="black"/>
      <path d="M75,50 L95,35 L95,65 Z" fill="black"/>
      <circle cx="35" cy="45" r="3" fill="white"/>
    </svg>`
  },

  // Letters (just a few examples)
  {
    id: 'letter-a',
    name: 'Letter A',
    category: 'letters',
    icon: 'A',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M50,20 L20,80 L35,80 L40,65 L60,65 L65,80 L80,80 Z M45,55 L50,35 L55,55 Z" fill="black"/>
    </svg>`
  },
  {
    id: 'letter-b',
    name: 'Letter B',
    category: 'letters',
    icon: 'B',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M25,20 L25,80 L60,80 C75,80 80,70 80,65 C80,58 75,53 70,52 C75,51 78,46 78,40 C78,30 70,20 60,20 Z M40,35 L55,35 C60,35 63,38 63,42 C63,46 60,49 55,49 L40,49 Z M40,62 L58,62 C63,62 65,65 65,68 C65,71 63,74 58,74 L40,74 Z" fill="black"/>
    </svg>`
  },

  // Numbers
  {
    id: 'number-0',
    name: 'Number 0',
    category: 'numbers',
    icon: '0',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M50,20 C35,20 25,30 25,50 C25,70 35,80 50,80 C65,80 75,70 75,50 C75,30 65,20 50,20 Z M50,35 C57,35 60,40 60,50 C60,60 57,65 50,65 C43,65 40,60 40,50 C40,40 43,35 50,35 Z" fill="black"/>
    </svg>`
  },
  {
    id: 'number-1',
    name: 'Number 1',
    category: 'numbers',
    icon: '1',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M45,30 L55,30 L55,75 L65,75 L65,85 L35,85 L35,75 L45,75 Z M45,30 L40,35 L35,30 L45,20 Z" fill="black"/>
    </svg>`
  },
];

/**
 * Get shapes by category
 */
export function getShapesByCategory(category: ShapeDefinition['category']): ShapeDefinition[] {
  return SHAPE_LIBRARY.filter(shape => shape.category === category);
}

/**
 * Get all categories
 */
export function getAllCategories(): ShapeDefinition['category'][] {
  return ['basic', 'seasonal', 'animals', 'letters', 'numbers'];
}

/**
 * Get shape by ID
 */
export function getShapeById(id: string): ShapeDefinition | undefined {
  return SHAPE_LIBRARY.find(shape => shape.id === id);
}
