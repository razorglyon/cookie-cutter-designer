import type { Point2D } from '../../types/CookieCutter';

export const circleSvg: string = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" />
</svg>`;

export const squarePoints: Point2D[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 }
];

export const starPoints: Point2D[] = [
  { x: 0, y: -50 },
  { x: 14, y: -20 },
  { x: 47, y: -15 },
  { x: 23, y: 7 },
  { x: 29, y: 40 },
  { x: 0, y: 25 },
  { x: -29, y: 40 },
  { x: -23, y: 7 },
  { x: -47, y: -15 },
  { x: -14, y: -20 }
];

export const concavePoints: Point2D[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 15 },
  { x: 15, y: 15 },
  { x: 15, y: 40 },
  { x: 0, y: 40 }
];

export const duplicatePoints: Point2D[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
  { x: 0, y: 0 }
];

export const tinyFeaturePoints: Point2D[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 20.1, y: 40 },
  { x: 20, y: 39.9 },
  { x: 19.9, y: 40 },
  { x: 0, y: 40 }
];

export const emptySvg: string = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>`;

export const openPathSvg: string = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 10 10 L 90 10 L 50 90" fill="none" stroke="black" />
</svg>`;
