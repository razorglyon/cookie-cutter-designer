import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import type { PhotoPixels } from '../../../photoProcessing';

/** Test-only decoder for our pinned, noninterlaced, 8-bit gray/RGB PNG fixtures. */
export function decodePhotoFixture(name: 'coins' | 'coffee' | 'chelsea'): PhotoPixels & { sha256: string } {
  const bytes = readFileSync(new URL(`./${name}.png`, import.meta.url));
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Not a PNG fixture');
  let width = 0, height = 0, channels = 0;
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0 || ![0, 2, 6].includes(data[9])) throw new Error('Unsupported test PNG format');
      channels = data[9] === 0 ? 1 : data[9] === 2 ? 3 : 4;
    }
    if (type === 'IDAT') compressed.push(data);
    offset += length + 12;
  }
  if (!width || !height || !channels || width * height > 1_000_000) throw new Error('Invalid pinned fixture dimensions');
  const stride = width * channels, raw = inflateSync(Buffer.concat(compressed));
  if (raw.length !== height * (stride + 1)) throw new Error('Invalid fixture scanlines');
  const decoded = new Uint8Array(width * height * channels);
  function paeth(left: number, above: number, upperLeft: number): number {
    const prediction = left + above - upperLeft;
    const a = Math.abs(prediction - left), b = Math.abs(prediction - above), c = Math.abs(prediction - upperLeft);
    return a <= b && a <= c ? left : b <= c ? above : upperLeft;
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error('Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= channels ? decoded[index - channels] : 0;
      const above = y > 0 ? decoded[index - stride] : 0;
      const upperLeft = y > 0 && x >= channels ? decoded[index - stride - channels] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, upperLeft);
      decoded[index] = (raw[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const start = index * channels;
    rgba.set(channels === 1 ? [decoded[start], decoded[start], decoded[start], 255] : [decoded[start], decoded[start + 1], decoded[start + 2], channels === 4 ? decoded[start + 3] : 255], index * 4);
  }
  return { width, height, data: rgba, sha256: createHash('sha256').update(bytes).digest('hex') };
}
