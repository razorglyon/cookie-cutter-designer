// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AIAssistant from '../lib/components/ui/AIAssistant.svelte';
import AIImageProcessor from '../lib/components/ui/AIImageProcessor.svelte';
import { DEFAULT_PARAMS } from '../lib/types/CookieCutter';
const edges = vi.hoisted(() => ({ optimize: vi.fn(), generate: vi.fn(), vectorize: vi.fn(), process: vi.fn(), suggestions: vi.fn(), variations: vi.fn() }));
vi.mock('../lib/utils/geminiAPI', () => ({ getAPIKey: () => 'test-only', optimizeSVGWithAI: edges.optimize, generateImageWithGemini: edges.generate, suggestDesignImprovements: edges.suggestions, generateDesignVariations: edges.variations }));
vi.mock('../lib/utils/imageProcessor', () => ({ vectorizeImage: edges.vectorize }));
vi.mock('../lib/utils/aiImageProcessor', () => ({ processImageWithAI: edges.process, getAIPresets: () => ({ simple: {} }) }));
let component: ReturnType<typeof mount> | undefined;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function click(text: string) { const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim().includes(text)); expect(button).toBeDefined(); button!.click(); }
async function assistant(capture: () => (() => boolean) = () => () => true, handoff = vi.fn(), legacy = vi.fn()) {
 component = mount(AIAssistant, { target: document.body, props: { params: DEFAULT_PARAMS, svgContent: '<svg>A</svg>', captureOperationValidity: capture, onOptimizedSVG: handoff }, events: { optimizedSVG: legacy } });
 await tick(); click('Assistant IA'); await tick(); return { handoff, legacy };
}
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {}); });
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(['session', 'unmount'])('optimization rejects late %s completion', async mode => {
 const pending = deferred<string>(); edges.optimize.mockReturnValue(pending.promise); let valid = true;
 const { handoff, legacy } = await assistant(() => () => valid); click('Analyser'); await tick(); click('Analyser le SVG');
 expect(edges.optimize).toHaveBeenCalledTimes(1);
 if (mode === 'session') valid = false; else { await unmount(component!); component = undefined; }
 pending.resolve('<svg>late A</svg>'); await tick(); await tick(); expect(handoff).not.toHaveBeenCalled(); expect(legacy).not.toHaveBeenCalled();
});
it('current optimization transfers the exact start predicate without legacy duplicate', async () => {
 const validity = () => true; edges.optimize.mockResolvedValue('<svg>current</svg>'); const { handoff, legacy } = await assistant(() => validity);
 click('Analyser'); await tick(); click('Analyser le SVG'); await vi.waitFor(() => expect(handoff).toHaveBeenCalledWith('<svg>current</svg>', validity)); expect(legacy).not.toHaveBeenCalled();
});
it.each(['throw', 'nonboolean', 'destroy'])('capture %s fails closed before producer', async mode => {
 const capture = () => { if (mode === 'throw') throw new Error('capture'); if (mode === 'destroy') { void unmount(component!); component = undefined; } return () => mode === 'nonboolean' ? 'yes' as unknown as boolean : true; };
 await assistant(capture); click('Analyser'); await tick(); click('Analyser le SVG'); await tick(); expect(edges.optimize).not.toHaveBeenCalled();
});
it.each(['blob', 'vector', 'unmount'])('nested generator rejects stale %s boundary and releases preview', async boundary => {
 let valid = true; const image = deferred<Blob>(), vector = deferred<string>(); edges.generate.mockReturnValue(image.promise); edges.vectorize.mockReturnValue(vector.promise);
 const { handoff, legacy } = await assistant(() => () => valid); click('Joli chat assis'); await tick(); click('Générer une image'); expect(edges.generate).toHaveBeenCalledTimes(1);
 if (boundary === 'blob') valid = false;
 image.resolve(new Blob(['image'])); await tick(); await tick();
 if (boundary === 'blob') expect(edges.vectorize).not.toHaveBeenCalled();
 else { await vi.waitFor(() => expect(edges.vectorize).toHaveBeenCalledTimes(1)); if (boundary === 'unmount') { await unmount(component!); component = undefined; } else valid = false; }
 vector.resolve('<svg>late</svg>'); await tick(); await tick(); expect(handoff).not.toHaveBeenCalled(); expect(legacy).not.toHaveBeenCalled();
 expect(URL.revokeObjectURL).toHaveBeenCalledTimes(boundary === 'blob' ? 0 : 1);
});
async function processor(capture: () => (() => boolean), handoff = vi.fn(), legacy = vi.fn()) {
 component = mount(AIImageProcessor, { target: document.body, props: { captureOperationValidity: capture, onProcessedImage: handoff }, events: { processedImage: legacy } });
 await tick(); click('▶'); await tick(); const input = document.querySelector<HTMLInputElement>('input[type=file]')!; Object.defineProperty(input, 'files', { value: [new File(['a'], 'A.png')] }); input.dispatchEvent(new Event('change')); await tick(); click('Traiter l’image'); return { handoff, legacy };
}
it.each(['suggestions', 'variations'] as const)('late %s does not update a superseded assistant', async mode => {
 const pending = deferred<string[]>(); edges[mode].mockReturnValue(pending.promise);
 let valid = true; vi.stubGlobal('prompt', vi.fn(() => 'shape')); await assistant(() => () => valid);
 click(mode === 'suggestions' ? 'Suggestions' : 'Variations'); await tick();
 click(mode === 'suggestions' ? 'Obtenir des suggestions' : 'Générer des variantes');
 valid = false; pending.resolve(['late']); await tick(); await tick(); vi.unstubAllGlobals();
 expect(document.body.textContent).not.toContain('late');
});
it('current processor retains exact start validity without a duplicate legacy event', async () => {
 const validity = () => true; edges.process.mockResolvedValue(processed()); const { handoff, legacy } = await processor(() => validity);
 await tick(); let callback!: BlobCallback; vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => { callback = cb; });
 click('Utiliser cette image'); const blob = new Blob(['current']); callback(blob); expect(handoff).toHaveBeenCalledWith(blob, validity); expect(legacy).not.toHaveBeenCalled();
});
it('legacy optimization retains the string event payload', async () => {
 edges.optimize.mockResolvedValue('<svg>legacy</svg>'); const legacy = vi.fn();
 // Omit the contextual callback to exercise the existing event contract.
 component = mount(AIAssistant, { target: document.body, props: { params: DEFAULT_PARAMS, svgContent: '<svg>A</svg>' }, events: { optimizedSVG: legacy } });
 await tick(); click('Assistant IA'); await tick(); click('Analyser'); await tick(); click('Analyser le SVG');
 await vi.waitFor(() => expect(legacy).toHaveBeenCalledTimes(1)); expect(legacy.mock.calls[0][0].detail).toBe('<svg>legacy</svg>');
});
it('current nested generation accepts SVG and clear releases preview exactly once', async () => {
 const validity = () => true; edges.generate.mockResolvedValue(new Blob(['image'])); edges.vectorize.mockResolvedValue('<svg>current</svg>');
 const { handoff } = await assistant(() => validity); click('Joli chat assis'); await tick(); click('Générer une image');
 await vi.waitFor(() => expect(handoff).toHaveBeenCalledWith('<svg>current</svg>', validity)); click('Effacer'); await tick(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
 await unmount(component!); component = undefined; expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});
function processed() { return { processedCanvas: document.createElement('canvas'), processedSize: { width: 1, height: 1 }, stats: { brightness: 1, contrast: 1, colorCount: 1, edgeStrength: 1 } }; }
it.each(['processing', 'processing-unmount', 'before-use', 'toBlob', 'unmount'])('processor binds original context through %s', async boundary => {
 let valid = true; const pending = deferred<ReturnType<typeof processed>>(); edges.process.mockReturnValue(pending.promise); let callback: BlobCallback | undefined;
 vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => { callback = cb; }); const { handoff, legacy } = await processor(() => () => valid);
 if (boundary === 'processing') valid = false;
 if (boundary === 'processing-unmount') { await unmount(component!); component = undefined; }
 pending.resolve(processed()); await tick(); await tick();
 if (boundary === 'processing' || boundary === 'processing-unmount') expect(document.body.textContent).not.toContain('Utiliser cette image');
 else { if (boundary === 'before-use') valid = false; click('Utiliser cette image'); await tick(); if (boundary === 'before-use') expect(callback).toBeUndefined(); else { expect(callback).toBeDefined(); if (boundary === 'unmount') { await unmount(component!); component = undefined; } else valid = false; callback!(new Blob(['late'])); } }
 expect(handoff).not.toHaveBeenCalled(); expect(legacy).not.toHaveBeenCalled();
});
