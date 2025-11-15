/**
 * AI-powered image processing for cookie cutter design
 * Enhances images before vectorization for better results
 */

export interface AIProcessingOptions {
  enhanceContrast: boolean;
  removeBackground: boolean;
  edgeDetection: boolean;
  denoise: boolean;
  autoThreshold: boolean;
  simplifyColors: boolean;
  maxColors?: number;
}

export interface ProcessingResult {
  processedCanvas: HTMLCanvasElement;
  originalSize: { width: number; height: number };
  processedSize: { width: number; height: number };
  stats: {
    brightness: number;
    contrast: number;
    colorCount: number;
    edgeStrength: number;
  };
}

/**
 * Process image with AI-enhanced techniques
 */
export async function processImageWithAI(
  file: File,
  options: AIProcessingOptions
): Promise<ProcessingResult> {
  // Load image
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Set canvas size
  canvas.width = img.width;
  canvas.height = img.height;

  // Draw original image
  ctx.drawImage(img, 0, 0);

  // Get image data
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Apply AI processing steps
  if (options.denoise) {
    imageData = applyMedianFilter(imageData);
  }

  if (options.enhanceContrast) {
    imageData = enhanceContrast(imageData);
  }

  if (options.removeBackground) {
    imageData = removeBackground(imageData);
  }

  if (options.simplifyColors && options.maxColors) {
    imageData = simplifyColors(imageData, options.maxColors);
  }

  if (options.edgeDetection) {
    imageData = detectEdges(imageData);
  }

  if (options.autoThreshold) {
    imageData = autoThreshold(imageData);
  }

  // Put processed data back
  ctx.putImageData(imageData, 0, 0);

  // Calculate statistics
  const stats = calculateImageStats(imageData);

  return {
    processedCanvas: canvas,
    originalSize: { width: img.width, height: img.height },
    processedSize: { width: canvas.width, height: canvas.height },
    stats
  };
}

/**
 * Load image from file
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Apply median filter for denoising
 */
function applyMedianFilter(imageData: ImageData): ImageData {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const result = new Uint8ClampedArray(data);

  const radius = 1;

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      for (let c = 0; c < 3; c++) {
        const values: number[] = [];

        // Collect neighborhood values
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4 + c;
            values.push(data[idx]);
          }
        }

        // Get median
        values.sort((a, b) => a - b);
        const median = values[Math.floor(values.length / 2)];

        const idx = (y * width + x) * 4 + c;
        result[idx] = median;
      }
    }
  }

  return new ImageData(result, width, height);
}

/**
 * Enhance contrast using histogram equalization
 */
function enhanceContrast(imageData: ImageData): ImageData {
  const data = imageData.data;
  const histogram = new Array(256).fill(0);
  const cdf = new Array(256).fill(0);

  // Calculate histogram
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    histogram[gray]++;
  }

  // Calculate cumulative distribution
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }

  // Normalize CDF
  const cdfMin = cdf.find(v => v > 0) || 0;
  const totalPixels = imageData.width * imageData.height;

  const equalizationMap = cdf.map(v => {
    return Math.round(((v - cdfMin) / (totalPixels - cdfMin)) * 255);
  });

  // Apply equalization
  const result = new Uint8ClampedArray(data);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    const newGray = equalizationMap[gray];

    result[i] = newGray;
    result[i + 1] = newGray;
    result[i + 2] = newGray;
  }

  return new ImageData(result, imageData.width, imageData.height);
}

/**
 * Remove background using edge-based segmentation
 */
function removeBackground(imageData: ImageData): ImageData {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const result = new Uint8ClampedArray(data);

  // Simple background removal: assume edges are corners
  const threshold = calculateOtsuThreshold(imageData);

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);

    if (gray > threshold) {
      // Background - make white
      result[i] = 255;
      result[i + 1] = 255;
      result[i + 2] = 255;
      result[i + 3] = 255;
    } else {
      // Foreground - keep as is
      result[i] = data[i];
      result[i + 1] = data[i + 1];
      result[i + 2] = data[i + 2];
      result[i + 3] = 255;
    }
  }

  return new ImageData(result, width, height);
}

/**
 * Simplify colors using k-means clustering
 */
function simplifyColors(imageData: ImageData, maxColors: number): ImageData {
  const data = imageData.data;
  const pixels: number[][] = [];

  // Collect all pixels
  for (let i = 0; i < data.length; i += 4) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  // Simple k-means (simplified version)
  const palette = performKMeans(pixels, maxColors);

  // Replace each pixel with nearest palette color
  const result = new Uint8ClampedArray(data);
  for (let i = 0; i < data.length; i += 4) {
    const pixel = [data[i], data[i + 1], data[i + 2]];
    const nearest = findNearestColor(pixel, palette);

    result[i] = nearest[0];
    result[i + 1] = nearest[1];
    result[i + 2] = nearest[2];
  }

  return new ImageData(result, imageData.width, imageData.height);
}

/**
 * Detect edges using Sobel operator
 */
function detectEdges(imageData: ImageData): ImageData {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const result = new Uint8ClampedArray(data.length);

  // Sobel kernels
  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1]
  ];

  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1]
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;

      // Apply Sobel kernels
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const idx = ((y + ky - 1) * width + (x + kx - 1)) * 4;
          const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);

          gx += gray * sobelX[ky][kx];
          gy += gray * sobelY[ky][kx];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const normalized = Math.min(255, magnitude);

      const idx = (y * width + x) * 4;
      result[idx] = normalized;
      result[idx + 1] = normalized;
      result[idx + 2] = normalized;
      result[idx + 3] = 255;
    }
  }

  return new ImageData(result, width, height);
}

/**
 * Apply automatic thresholding using Otsu's method
 */
function autoThreshold(imageData: ImageData): ImageData {
  const threshold = calculateOtsuThreshold(imageData);
  const data = imageData.data;
  const result = new Uint8ClampedArray(data);

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    const value = gray < threshold ? 0 : 255;

    result[i] = value;
    result[i + 1] = value;
    result[i + 2] = value;
  }

  return new ImageData(result, imageData.width, imageData.height);
}

/**
 * Calculate Otsu's threshold
 */
function calculateOtsuThreshold(imageData: ImageData): number {
  const data = imageData.data;
  const histogram = new Array(256).fill(0);
  const totalPixels = imageData.width * imageData.height;

  // Build histogram
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    histogram[gray]++;
  }

  // Calculate probabilities
  const probabilities = histogram.map(h => h / totalPixels);

  // Find optimal threshold
  let maxVariance = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    let w0 = 0, w1 = 0;
    let sum0 = 0, sum1 = 0;

    for (let i = 0; i < t; i++) {
      w0 += probabilities[i];
      sum0 += i * probabilities[i];
    }

    for (let i = t; i < 256; i++) {
      w1 += probabilities[i];
      sum1 += i * probabilities[i];
    }

    if (w0 === 0 || w1 === 0) continue;

    const mean0 = sum0 / w0;
    const mean1 = sum1 / w1;
    const variance = w0 * w1 * Math.pow(mean0 - mean1, 2);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Simple k-means clustering for color quantization
 */
function performKMeans(pixels: number[][], k: number, maxIterations: number = 10): number[][] {
  // Initialize random centroids
  const centroids: number[][] = [];
  for (let i = 0; i < k; i++) {
    const randomIdx = Math.floor(Math.random() * pixels.length);
    centroids.push([...pixels[randomIdx]]);
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign pixels to nearest centroid
    const clusters: number[][][] = Array(k).fill(null).map(() => []);

    pixels.forEach(pixel => {
      const nearest = findNearestColorIndex(pixel, centroids);
      clusters[nearest].push(pixel);
    });

    // Update centroids
    for (let i = 0; i < k; i++) {
      if (clusters[i].length > 0) {
        const sum = clusters[i].reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
        centroids[i] = sum.map(v => Math.round(v / clusters[i].length));
      }
    }
  }

  return centroids;
}

/**
 * Find nearest color in palette
 */
function findNearestColor(pixel: number[], palette: number[][]): number[] {
  let minDist = Infinity;
  let nearest = palette[0];

  palette.forEach(color => {
    const dist = Math.sqrt(
      Math.pow(pixel[0] - color[0], 2) +
      Math.pow(pixel[1] - color[1], 2) +
      Math.pow(pixel[2] - color[2], 2)
    );

    if (dist < minDist) {
      minDist = dist;
      nearest = color;
    }
  });

  return nearest;
}

/**
 * Find nearest color index in palette
 */
function findNearestColorIndex(pixel: number[], palette: number[][]): number {
  let minDist = Infinity;
  let nearestIdx = 0;

  palette.forEach((color, idx) => {
    const dist = Math.sqrt(
      Math.pow(pixel[0] - color[0], 2) +
      Math.pow(pixel[1] - color[1], 2) +
      Math.pow(pixel[2] - color[2], 2)
    );

    if (dist < minDist) {
      minDist = dist;
      nearestIdx = idx;
    }
  });

  return nearestIdx;
}

/**
 * Calculate image statistics
 */
function calculateImageStats(imageData: ImageData): {
  brightness: number;
  contrast: number;
  colorCount: number;
  edgeStrength: number;
} {
  const data = imageData.data;
  let totalBrightness = 0;
  const colors = new Set<string>();
  let minGray = 255;
  let maxGray = 0;

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    totalBrightness += gray;
    minGray = Math.min(minGray, gray);
    maxGray = Math.max(maxGray, gray);

    const colorKey = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    colors.add(colorKey);
  }

  const pixelCount = data.length / 4;
  const brightness = totalBrightness / pixelCount / 255;
  const contrast = (maxGray - minGray) / 255;

  return {
    brightness,
    contrast,
    colorCount: colors.size,
    edgeStrength: contrast // Simplified edge strength estimate
  };
}

/**
 * Get preset configurations
 */
export function getAIPresets(): Record<string, AIProcessingOptions> {
  return {
    'simple': {
      enhanceContrast: true,
      removeBackground: false,
      edgeDetection: false,
      denoise: true,
      autoThreshold: true,
      simplifyColors: false
    },
    'detailed': {
      enhanceContrast: true,
      removeBackground: true,
      edgeDetection: false,
      denoise: true,
      autoThreshold: false,
      simplifyColors: true,
      maxColors: 8
    },
    'outline': {
      enhanceContrast: true,
      removeBackground: false,
      edgeDetection: true,
      denoise: true,
      autoThreshold: true,
      simplifyColors: false
    },
    'clean': {
      enhanceContrast: false,
      removeBackground: true,
      edgeDetection: false,
      denoise: true,
      autoThreshold: true,
      simplifyColors: true,
      maxColors: 2
    }
  };
}
