// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AIImageProcessor from '../lib/components/ui/AIImageProcessor.svelte';

const edges = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock('../lib/utils/aiImageProcessor', () => ({
  processImageWithAI: edges.process,
  getAIPresets: () => ({ simple: {} })
}));

let component: ReturnType<typeof mount> | undefined;
let draws: { target: HTMLCanvasElement; source: CanvasImageSource; args: number[]; size: number[] }[];
let previewToBlob: ReturnType<typeof vi.fn<HTMLCanvasElement['toBlob']>>;

// Only the unavailable canvas platform edge is stubbed. Source and preview remain
// distinct real DOM nodes; this proves ownership/draw order, not native PNG pixels.
beforeEach(() => {
  edges.process.mockReset();
  draws = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const target = this;
    return { drawImage(source: CanvasImageSource, ...args: number[]) {
      draws.push({ target, source, args, size: [target.width, target.height] });
    } } as unknown as CanvasRenderingContext2D;
  });
  previewToBlob = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(previewToBlob);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text));
  expect(button).toBeDefined();
  button!.click();
}
function output(width = 7, height = 5) {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  let callback: BlobCallback | undefined;
  const toBlob = vi.fn((cb: BlobCallback) => { callback = cb; });
  Object.defineProperty(source, 'toBlob', { value: toBlob });
  const result = {
    processedCanvas: source,
    processedSize: { width, height },
    stats: { brightness: 1, contrast: 1, colorCount: 1, edgeStrength: 1 }
  };
  return { source, result, toBlob, complete(blob: Blob) { expect(callback).toBeDefined(); callback!(blob); } };
}
async function setup(validity = () => true) {
  const handoff = vi.fn(), legacy = vi.fn();
  component = mount(AIImageProcessor, {
    target: document.body,
    props: { captureOperationValidity: () => validity, onProcessedImage: handoff },
    events: { processedImage: legacy }
  });
  await tick(); click('▶'); await tick();
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [new File(['input'], 'source.png')] });
  input.dispatchEvent(new Event('change'));
  await tick();
  return { handoff, legacy };
}
async function process() {
  click('Traiter l’image');
  await vi.waitFor(() => expect(document.querySelector('canvas')).not.toBeNull());
  await tick();
}

it('preserves the source, draws into a separate correctly-sized preview, and serializes the source', async () => {
  const supplied = output();
  edges.process.mockResolvedValue(supplied.result);
  const validity = () => true;
  const { handoff, legacy } = await setup(validity);
  await process();
  const preview = document.querySelector('canvas')!;
  expect(supplied.result.processedCanvas).toBe(supplied.source);
  expect(preview).not.toBe(supplied.source);
  expect([supplied.source.width, supplied.source.height]).toEqual([7, 5]);
  expect(draws).toEqual([{ target: preview, source: supplied.source, args: [0, 0, 7, 5], size: [7, 5] }]);
  click('Utiliser cette image');
  expect(supplied.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  expect(previewToBlob).not.toHaveBeenCalled();
  const blob = new Blob(['source-output']);
  supplied.complete(blob);
  expect(handoff).toHaveBeenCalledWith(blob, validity);
  expect(legacy).not.toHaveBeenCalled();
});

it('replacement draws and serializes only the latest source without mutating either result', async () => {
  const first = output(), latest = output(11, 3);
  edges.process.mockResolvedValueOnce(first.result).mockResolvedValueOnce(latest.result);
  await setup();
  await process();
  draws.length = 0;
  await process();
  const preview = document.querySelector('canvas')!;
  expect(draws).toEqual([{ target: preview, source: latest.source, args: [0, 0, 11, 3], size: [11, 3] }]);
  expect(first.result.processedCanvas).toBe(first.source);
  expect(latest.result.processedCanvas).toBe(latest.source);
  expect([first.source.width, first.source.height]).toEqual([7, 5]);
  expect([latest.source.width, latest.source.height]).toEqual([11, 3]);
  click('Utiliser cette image');
  expect(first.toBlob).not.toHaveBeenCalled();
  expect(latest.toBlob).toHaveBeenCalledOnce();
  expect(previewToBlob).not.toHaveBeenCalled();
});

it.each(['reset', 'unmount', 'invalid'])('rejects pending serialization after %s and does not redraw the stale preview', async boundary => {
  const supplied = output();
  edges.process.mockResolvedValue(supplied.result);
  let valid = true;
  const { handoff, legacy } = await setup(() => valid);
  await process();
  click('Utiliser cette image');
  draws.length = 0;
  if (boundary === 'reset') click('Recommencer');
  else if (boundary === 'unmount') { await unmount(component!); component = undefined; }
  else valid = false;
  await tick();
  supplied.complete(new Blob(['stale-source-output']));
  await tick();
  expect(draws).toEqual([]);
  expect(handoff).not.toHaveBeenCalled();
  expect(legacy).not.toHaveBeenCalled();
  expect(supplied.result.processedCanvas).toBe(supplied.source);
});

it('reopening the panel redraws the retained current source into a new preview', async () => {
  const supplied = output();
  edges.process.mockResolvedValue(supplied.result);
  await setup(); await process();
  const oldPreview = document.querySelector('canvas');
  click('▼'); await tick();
  expect(document.querySelector('canvas')).toBeNull();
  draws.length = 0;
  click('▶'); await tick(); await tick();
  const preview = document.querySelector('canvas')!;
  expect(preview).not.toBe(oldPreview);
  expect(draws).toEqual([{ target: preview, source: supplied.source, args: [0, 0, 7, 5], size: [7, 5] }]);
});
