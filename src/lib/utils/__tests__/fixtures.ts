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

export const rectangleSvg: string = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <rect x="5" y="5" width="110" height="50" />
</svg>`;

export const compoundHoleSvg: string = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path fill-rule="evenodd" d="M5 5H95V95H5Z M30 30H70V70H30Z" />
</svg>`;

export const multipleContoursSvg: string = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <rect x="5" y="5" width="45" height="50" />
  <circle cx="90" cy="30" r="25" />
</svg>`;

export const concaveSvg: string = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
  <path d="M5 5H75V30H35V75H5Z" />
</svg>`;

export const tinyDetailsSvg: string = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M5 5H95V95H51V94.7H49V95H5Z" />
</svg>`;

export const selfIntersectingSvg: string = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M10 10L90 90L90 10L10 90Z" />
</svg>`;

export const degenerateSvg: string = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M10 10L10 10L10 10Z" />
</svg>`;

export const extremeAspectSvg: string = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 10">
  <rect x="0" y="0" width="1000" height="10" />
</svg>`;

export function noisyRasterFixture(width = 64, height = 64): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const value = (index * 73 + Math.floor(index / width) * 151) % 256;
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  }
  return { width, height, data } as ImageData;
}
