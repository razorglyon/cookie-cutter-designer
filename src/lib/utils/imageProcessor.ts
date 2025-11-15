import { ImageTracer } from 'imagetracer';

/**
 * Convert a raster image to SVG using imagetracer
 */
export async function vectorizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;

      // Create an image element
      const img = new Image();
      img.onload = () => {
        try {
          const imageData = getImageData(img);

          // Create ImageTracer instance
          const tracer = new ImageTracer();

          // Vectorize the image with optimized settings for cookie cutters
          const svgString = tracer.imageDataToSVG(
            imageData,
            {
              // Simplified shapes for cleaner cookie cutters
              ltres: 1,          // Line threshold
              qtres: 1,          // Quad threshold
              pathomit: 8,       // Path omit - remove small paths
              colorsampling: 0,  // Disabled for binary
              numberofcolors: 2, // Binary black/white
              mincolorratio: 0,  // Min color ratio
              colorquantcycles: 3,
              // Blur for smoother edges
              blurradius: 0,
              blurdelta: 20,
              // Path optimization
              scale: 1,
              roundcoords: 1,    // Round coordinates for cleaner paths
              // Visual quality
              viewbox: true,
              desc: false,
            }
          );
          resolve(svgString);
        } catch (error) {
          reject(new Error(`Vectorization failed: ${error}`));
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = dataUrl;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Extract ImageData from an Image element
 */
function getImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

/**
 * Read a file as text (for SVG files)
 */
export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      resolve(e.target?.result as string);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Validate and clean SVG string
 */
export function cleanSVG(svgString: string): string {
  // Remove XML declaration if present
  svgString = svgString.replace(/<\?xml[^?]*\?>/g, '');

  // Remove comments
  svgString = svgString.replace(/<!--[\s\S]*?-->/g, '');

  // Ensure it has an SVG root element
  if (!svgString.includes('<svg')) {
    throw new Error('Invalid SVG: No <svg> element found');
  }

  return svgString.trim();
}
