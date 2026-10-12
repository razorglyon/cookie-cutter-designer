// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { fromStore, writable } from 'svelte/store';
import BatchMode from '../lib/components/ui/BatchMode.svelte';
import { DEFAULT_PARAMS } from '../lib/types/CookieCutter';
import { createBatch } from '../lib/utils/batchProcessor';
vi.mock('../lib/utils/batchProcessor', async original => ({
  ...await original<typeof import('../lib/utils/batchProcessor')>(), createBatch: vi.fn()
}));
let component: ReturnType<typeof mount> | undefined;
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.innerHTML = ''; vi.resetAllMocks(); });
function artifact() {
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial(), mesh = new Group();
  mesh.add(new Mesh(geometry, material), new Mesh(geometry, material));
  return { mesh, geometry: vi.spyOn(geometry, 'dispose'), material: vi.spyOn(material, 'dispose'), report: { succeeded: 1 }, totalDimensions: { width: 10, height: 10 } };
}
async function start(props: Record<string, unknown> = {}, onCreated = vi.fn()) {
  component = mount(BatchMode, { target: document.body, props: { currentSvg: '<svg/>', currentParams: DEFAULT_PARAMS, buildPlateSize: 200, ...props }, events: { batchCreated: onCreated } });
  await tick(); document.querySelector<HTMLButtonElement>('.toggle-btn')!.click(); await tick();
  document.querySelector<HTMLButtonElement>('.btn')!.click(); await tick();
  document.querySelector<HTMLButtonElement>('.generate-btn')!.click();
  return onCreated;
}
function pending() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise(resolveResult => { resolve = resolveResult; });
  vi.mocked(createBatch).mockReturnValueOnce(promise as ReturnType<typeof createBatch>);
  return resolve;
}
it('captures context before production and disposes an obsolete result without dispatch or progress', async () => {
  const resolve = pending(), result = artifact(); let valid = true;
  const capture = vi.fn(() => () => valid);
  const created = await start({ captureOperationValidity: capture });
  expect(capture).toHaveBeenCalledTimes(1);
  valid = false;
  vi.mocked(createBatch).mock.calls.at(-1)![3]?.onProgress?.(1, 1, { id: 'progress', name: 'Design 1', svgData: '<svg/>', params: DEFAULT_PARAMS });
  await tick(); expect(document.body.textContent).toContain('Annuler (0/1)');
  resolve(result);
  await vi.waitFor(() => expect(result.geometry).toHaveBeenCalledTimes(1));
  expect(result.material).toHaveBeenCalledTimes(1); expect(created).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('1 items');
});
it('aborts on unmount, then disposes a producer ignoring abort exactly once', async () => {
  const resolve = pending(), result = artifact(), created = await start();
  const signal = vi.mocked(createBatch).mock.calls.at(-1)![3]!.signal!;
  await unmount(component!); component = undefined;
  expect(signal.aborted).toBe(true); resolve(result);
  await vi.waitFor(() => expect(result.geometry).toHaveBeenCalledTimes(1));
  expect(result.material).toHaveBeenCalledTimes(1); expect(created).not.toHaveBeenCalled();
});
it('retains Group event compatibility and transfers ownership without disposing on unmount', async () => {
  const resolve = pending(), result = artifact(), created = await start(); resolve(result);
  await vi.waitFor(() => expect(created).toHaveBeenCalledTimes(1));
  expect(created.mock.calls[0][0].detail).toBe(result.mesh);
  await unmount(component!); component = undefined;
  expect(result.geometry).not.toHaveBeenCalled(); expect(result.material).not.toHaveBeenCalled();
});
it.each(['capture', 'predicate'])('fails closed when the injected %s throws', async kind => {
  const resolve = pending(), result = artifact();
  const created = await start({ captureOperationValidity: () => { if (kind === 'capture') throw new Error('capture'); return () => { throw new Error('predicate'); }; } });
  await tick(); expect(createBatch).not.toHaveBeenCalled(); expect(created).not.toHaveBeenCalled();
  resolve(result);
});

it('cancelled producer returning success is disposed without handoff', async () => {
  const resolve = pending(), result = artifact(), created = await start();
  await tick(); document.querySelector<HTMLButtonElement>('.generate-btn')!.click(); resolve(result);
  await vi.waitFor(() => expect(result.geometry).toHaveBeenCalledTimes(1));
  expect(result.material).toHaveBeenCalledTimes(1); expect(created).not.toHaveBeenCalled();
});
it('a spontaneous AbortError is reported as an actual error, not proof of cancellation', async () => {
  vi.mocked(createBatch).mockRejectedValueOnce(new DOMException('unexpected abort', 'AbortError'));
  await start(); await vi.waitFor(() => expect(document.body.textContent).toContain('unexpected abort'));
  expect(document.body.textContent).not.toContain('Annulé');
});
it('contextual handoff passes the captured predicate and transfers ownership exactly once', async () => {
  const resolve = pending(), result = artifact(), validity = () => true, receiver = vi.fn();
  const created = await start({ captureOperationValidity: () => validity, onBatchCreated: receiver });
  resolve(result); await vi.waitFor(() => expect(receiver).toHaveBeenCalledExactlyOnceWith(result.mesh, validity, DEFAULT_PARAMS));
  expect(created).not.toHaveBeenCalled(); await unmount(component!); component = undefined;
  expect(result.geometry).not.toHaveBeenCalled(); expect(result.material).not.toHaveBeenCalled();
});

it('stale rejection cannot publish an error or progress into the still-mounted panel', async () => {
  let reject!: (cause: unknown) => void; let valid = true;
  vi.mocked(createBatch).mockReturnValueOnce(new Promise((_, no) => { reject = no; }));
  const created = await start({ captureOperationValidity: () => () => valid });
  valid = false; reject(new Error('obsolete failure'));
  await vi.waitFor(() => expect(document.querySelector('.generate-btn')?.textContent?.trim()).toBe('Générer la série complète'));
  expect(document.body.textContent).not.toContain('obsolete failure'); expect(created).not.toHaveBeenCalled();
});
it('a reentrant capture cannot start production after destroying the component', async () => {
  const created = await start({ captureOperationValidity: () => { void unmount(component!); component = undefined; return () => true; } });
  await tick(); expect(createBatch).not.toHaveBeenCalled(); expect(created).not.toHaveBeenCalled();
});
it('malformed non-boolean validity fails closed', async () => {
  const created = await start({ captureOperationValidity: () => () => 'yes' });
  await tick(); expect(createBatch).not.toHaveBeenCalled(); expect(created).not.toHaveBeenCalled();
});
it('reentrant cancellation during capture prevents invoking the producer', async () => {
  const created = await start({ captureOperationValidity: () => {
    document.querySelector<HTMLButtonElement>('.generate-btn')!.click(); return () => true;
  } });
  await tick(); expect(createBatch).not.toHaveBeenCalled(); expect(created).not.toHaveBeenCalled();
});
it('checks lifetime again after a reentrant validity predicate', async () => {
  const resolve = pending(), result = artifact(); let close = false;
  const created = await start({ captureOperationValidity: () => () => { if (close) { void unmount(component!); component = undefined; } return true; } });
  close = true; resolve(result);
  await vi.waitFor(() => expect(result.geometry).toHaveBeenCalledTimes(1));
  expect(result.material).toHaveBeenCalledTimes(1); expect(created).not.toHaveBeenCalled();
});

it.each([false, true])('hands off detached actual item metadata (heterogeneous: %s), never live params', async heterogeneous => {
  const resolve = pending(), result = artifact(), receiver = vi.fn();
  const a = { ...DEFAULT_PARAMS, wallThickness: 0.9 }, b = { ...DEFAULT_PARAMS, wallThickness: 1.2 };
  const input = writable(a), reactiveInput = fromStore(input);
  const props = { currentSvg: '<svg/>', get currentParams() { return reactiveInput.current; }, buildPlateSize: 200, onBatchCreated: receiver };
  component = mount(BatchMode, { target: document.body, props }); await tick();
  document.querySelector<HTMLButtonElement>('.toggle-btn')!.click(); await tick();
  document.querySelector<HTMLButtonElement>('.btn')!.click(); await tick();
  input.set(heterogeneous ? b : { ...a }); await tick();
  document.querySelector<HTMLButtonElement>('.btn')!.click(); await tick();
  input.set(b); await tick();
  document.querySelector<HTMLButtonElement>('.generate-btn')!.click();
  const items = vi.mocked(createBatch).mock.calls.at(-1)![0];
  expect(items[0].params.wallThickness).toBe(0.9); expect(items[0].params).not.toBe(a);
  expect(Object.isFrozen(items)).toBe(true); expect(Object.isFrozen(items[0].params)).toBe(true);
  a.wallThickness = 3; b.wallThickness = 4; resolve(result);
  await vi.waitFor(() => expect(receiver).toHaveBeenCalledTimes(1));
  expect(receiver.mock.calls[0][2]).toEqual(heterogeneous ? undefined : { ...DEFAULT_PARAMS, wallThickness: 0.9 });
});
