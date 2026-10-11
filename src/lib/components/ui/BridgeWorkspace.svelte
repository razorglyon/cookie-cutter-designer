<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Bridge, DesignDocument } from '../../domain/designDocument';
  import type { DesignSessionStore } from '../../stores/designSessionStore';
  import { inspectSketch } from '../../sketch/sketchCommands';
  import { extractClosedContours } from '../../utils/contourExtraction';
  import { commitBridgeEdit, snapBridgeEndpoint } from '../../sketch/bridgeCommands';

  export let session: DesignSessionStore;
  let canvas: SVGSVGElement;
  let adding = false;
  let start: { point: Bridge['from']; baseline: DesignDocument; epoch: number } | null = null;
  let drag: { id: string; end: 'from' | 'to'; pointer: number; baseline: DesignDocument; epoch: number } | null = null;
  let draft: Bridge | null = null;
  let widthMm = 2;
  let busy = false;
  let message = '';
  let mounted = true;
  onDestroy(() => { mounted = false; });
  $: document = $session;
  $: if ((start && (document !== start.baseline || session.getSessionEpoch() !== start.epoch))
    || (drag && (document !== drag.baseline || session.getSessionEpoch() !== drag.epoch))) cancel();
  $: bridges = document && document.schemaVersion !== 1 ? document.bridges : [];
  $: model = document ? inspectSketch(document.sketch.svg) : null;
  $: svg = document?.sketch.svg ?? '';
  $: outlines = svg ? outlinePaths(svg) : [];
  $: box = model?.viewBox.split(' ').map(Number) ?? [0, 0, 100, 100];
  $: radius = Math.max(box[2], box[3]) / 38;

  function outlinePaths(source: string): string[] {
    try { return extractClosedContours(source).map(contour => contour.map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ') + ' Z'); }
    catch { return []; } // Keep the original SVG visible; preflight still rejects invalid bridges.
  }

  function cancel(): void { start = null; drag = null; draft = null; }
  function coordinates(event: PointerEvent): Bridge['from'] {
    const matrix = canvas.getScreenCTM();
    if (!matrix) throw new Error('Le dessin n’est pas prêt.');
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return snapBridgeEndpoint(document!.sketch.svg, { x: point.x, y: point.y });
  }
  async function publish(baseline: DesignDocument, epoch: number, next: readonly Bridge[]): Promise<void> {
    if (busy) return;
    busy = true; message = '';
    try {
      await commitBridgeEdit(session, baseline, epoch, next, () => mounted, () => {
        if (mounted) message = 'Pont conservé. Des îlots restent isolés : ajoute un autre pont avant d’exporter.';
      });
    }
    catch (cause) { if (mounted) message = cause instanceof Error ? cause.message : 'Pont invalide.'; }
    finally { if (mounted) busy = false; }
  }
  function place(event: PointerEvent): void {
    if (!adding || busy || drag || !document || (document.kind !== 'cutter' && document.kind !== 'multi-cutter') || event.button !== 0) return;
    event.preventDefault();
    try {
      const point = coordinates(event);
      if (!start) { start = { point, baseline: document, epoch: session.getSessionEpoch() }; message = 'Choisis le contour de l’îlot.'; return; }
      const first = start;
      start = null; adding = false;
      if (first.baseline !== session.getDocument() || first.epoch !== session.getSessionEpoch()) return;
      const bridge: Bridge = { id: crypto.randomUUID(), from: first.point, to: point, widthMm };
      void publish(first.baseline, first.epoch, [...bridges, bridge]);
    } catch (cause) { message = cause instanceof Error ? cause.message : 'Choisis un contour.'; }
  }
  function beginDrag(event: PointerEvent, bridge: Bridge, end: 'from' | 'to'): void {
    if (adding || event.button !== 0 || busy || !document) return;
    event.stopPropagation(); event.preventDefault();
    message = '';
    drag = { id: bridge.id, end, pointer: event.pointerId, baseline: document, epoch: session.getSessionEpoch() };
    draft = bridge;
    canvas.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointer || !draft) return;
    try { draft = { ...draft, [drag.end]: coordinates(event) }; }
    catch { /* keep the last valid endpoint until pointer release */ }
  }
  function endDrag(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointer) return;
    const current = drag, original = bridges.find(bridge => bridge.id === current.id);
    let next = draft;
    try { if (next) next = { ...next, [current.end]: coordinates(event) }; }
    catch { /* a release away from all contours cancels the move */ next = null; }
    adding = false;
    cancel();
    if (original && next) void publish(current.baseline, current.epoch, bridges.map(bridge => bridge.id === current.id ? next! : bridge));
  }
  function keyboardMove(event: KeyboardEvent, bridge: Bridge, end: 'from' | 'to'): void {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !document) return;
    event.preventDefault();
    const point = bridge[end], step = event.shiftKey ? 10 : 1;
    try {
      const snapped = snapBridgeEndpoint(document.sketch.svg, {
        x: point.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
        y: point.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)
      });
      void publish(document, session.getSessionEpoch(), bridges.map(item => item.id === bridge.id ? { ...item, [end]: snapped } : item));
    } catch (cause) { message = cause instanceof Error ? cause.message : 'Déplacement impossible.'; }
  }
  function remove(bridge: Bridge): void {
    if (document && !busy) void publish(document, session.getSessionEpoch(), bridges.filter(item => item.id !== bridge.id));
  }
</script>

<svelte:window on:keydown={event => { if (event.key === 'Escape') { cancel(); adding = false; } }} />
{#if (document?.kind === 'cutter' || document?.kind === 'multi-cutter') && model}
<section class="bridge-workspace" aria-label="Éditeur de ponts pour les îlots">
  <h2>Ponts pour les îlots</h2>
  <p>Relie deux contours distincts pour n’obtenir qu’un emporte-pièce. Les extrémités s’aimantent aux contours. Si d’autres îlots restent isolés, sauvegarde le projet et ajoute leurs ponts avant l’export STL.</p>
  <div class="tools">
    <label>Largeur du prochain pont (mm) <input type="number" min="0.8" max="10" step="0.1" bind:value={widthMm} /></label>
    <button type="button" disabled={busy} aria-pressed={adding} on:click={() => { adding = !adding; start = null; message = ''; }}>{adding ? 'Annuler l’ajout' : 'Ajouter un pont'}</button>
  </div>
  {#if adding}<p role="status">{start ? 'Clique sur le second contour.' : 'Clique près du premier contour, puis du second.'}</p>{/if}
  <svg bind:this={canvas} class:placing={adding} viewBox={model.viewBox} role="group" aria-label="Contours et ponts éditables"
    on:pointerdown={place}
    on:pointermove={move} on:pointerup={endDrag} on:pointercancel={cancel} on:lostpointercapture={() => { drag = null; draft = null; }}>
    <image href={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(document.sketch.svg)} x={box[0]} y={box[1]} width={box[2]} height={box[3]} opacity="0.12" pointer-events="none" />
    {#each outlines as outline}<path d={outline} class="contour" pointer-events="none" />{/each}
    {#if start}<circle cx={start.point.x} cy={start.point.y} r={radius} class="pending" pointer-events="none" />{/if}
    {#each bridges as bridge (bridge.id)}
      {@const shown = draft?.id === bridge.id ? draft : bridge}
      <line x1={shown.from.x} y1={shown.from.y} x2={shown.to.x} y2={shown.to.y} stroke-width={Math.max(radius / 2, 1)} class="bridge-line" pointer-events="none" />
      <circle cx={shown.from.x} cy={shown.from.y} r={radius} class="endpoint" role="button" tabindex="0" aria-label={`Déplacer le début du pont ${bridge.id}`}
        on:pointerdown={event => beginDrag(event, bridge, 'from')} on:keydown={event => keyboardMove(event, bridge, 'from')} />
      <circle cx={shown.to.x} cy={shown.to.y} r={radius} class="endpoint" role="button" tabindex="0" aria-label={`Déplacer la fin du pont ${bridge.id}`}
        on:pointerdown={event => beginDrag(event, bridge, 'to')} on:keydown={event => keyboardMove(event, bridge, 'to')} />
    {/each}
  </svg>
  {#each bridges as bridge, index (bridge.id)}
    <div class="bridge-row"><span>Pont {index + 1} — {bridge.widthMm} mm</span><button type="button" disabled={busy} on:click={() => remove(bridge)}>Supprimer le pont {index + 1}</button></div>
  {/each}
  {#if bridges.length > 1}
    <button type="button" disabled={busy} on:click={() => { if (document) void publish(document, session.getSessionEpoch(), []); }}>Supprimer tous les ponts</button>
  {/if}
  <p class="notice">Glisse une extrémité pour la déplacer, ou utilise les flèches au clavier. Les boutons Undo/Redo au-dessus annulent chaque modification.</p>
  {#if busy}<p role="status">Vérification de l’impression du pont…</p>{/if}
  {#if message && !start}<p role="alert">{message}</p>{/if}
</section>
{/if}
<style>
  .bridge-workspace { display: grid; gap: .75rem; min-width: 0; }
  h2, p { margin: 0; } p { font-size: .875rem; line-height: 1.5; }
  .tools, .bridge-row { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
  .tools label { display: grid; gap: .25rem; }
  input, button { font: inherit; min-height: 44px; max-width: 100%; border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px; padding: .5rem; }
  button { cursor: pointer; } button:disabled { opacity: .5; cursor: not-allowed; }
  svg { width: 100%; aspect-ratio: 1; background: #fff; border: 1px solid #64748b; touch-action: none; }
  svg.placing { cursor: crosshair; }
  .contour { fill: none; stroke: #0f766e; stroke-width: 1; }
  .bridge-line { stroke: #ea580c; stroke-linecap: round; }
  .endpoint, .pending { fill: #fff; stroke: #c2410c; stroke-width: 1; cursor: grab; }
  .pending { fill: #fb923c; }
  .endpoint:focus { outline: none; stroke: #1d4ed8; stroke-width: 2; }
  .notice { font-size: .8rem; }
  :focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
</style>
