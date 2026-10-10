<script lang="ts">
  import type { DesignSessionStore } from '../../stores/designSessionStore';
  import type { DesignDocument } from '../../domain/designDocument';
  import { inspectSketch, editSketch, commitSketch, type SketchCommand } from '../../sketch/sketchCommands';
  export let session: DesignSessionStore;
  let pathIndex = 0;
  let pointIndex = 0;
  let draft: string | null = null;
  let gesture: { baseline: DesignDocument; epoch: number; pointer: number } | null = null;
  let message = '';
  let canvas: SVGSVGElement;
  let x = 0, y = 0;
  $: document = $session;
  $: if (document && gesture && (document !== gesture.baseline || session.getSessionEpoch() !== gesture.epoch)) cancel();
  $: svg = draft ?? document?.sketch.svg ?? '';
  $: model = svg ? inspectSketch(svg) : null;
  $: path = model?.paths[pathIndex];
  $: selected = path?.points[pointIndex];
  $: if (selected) { x = selected.x; y = selected.y; }
  $: box = model?.viewBox.split(' ').map(Number) ?? [0, 0, 100, 100];
  $: radius = Math.max(box[2], box[3]) / 45;
  $: topology = path && !path.reason && path.linear && path.segments.filter(s => s.command === 'M').length === 1;
  function cancel(): void { gesture = null; draft = null; }
  function apply(command: SketchCommand): void {
    cancel(); message = '';
    const baseline = session.getDocument(); if (!baseline) return;
    try { commitSketch(session, baseline, session.getSessionEpoch(), editSketch(baseline.sketch.svg, command)); }
    catch (cause) { message = cause instanceof Error ? cause.message : 'Could not edit this path.'; }
  }
  function begin(event: PointerEvent, index: number): void {
    if (event.button !== 0 || !document || path?.reason) return;
    event.preventDefault(); pointIndex = index; message = '';
    gesture = { baseline: document, epoch: session.getSessionEpoch(), pointer: event.pointerId };
    draft = document.sketch.svg; canvas.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent): void {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    const matrix = canvas.getScreenCTM(); if (!matrix) return;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    try { draft = editSketch(gesture.baseline.sketch.svg, { type: 'move', path: pathIndex, point: pointIndex, x: local.x, y: local.y }); }
    catch (cause) { message = String(cause); cancel(); }
  }
  function finish(event: PointerEvent): void {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    const current = gesture, next = draft; cancel();
    if (next) commitSketch(session, current.baseline, current.epoch, next);
  }
  function key(event: KeyboardEvent, index: number): void {
    if (event.key === 'Escape') { cancel(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); pointIndex = index;
    const point = path?.points[index]; if (!point) return;
    const step = event.shiftKey ? 10 : 1;
    apply({ type: 'move', path: pathIndex, point: index, x: point.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: point.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) });
  }
</script>

<svelte:window on:keydown={event => { if (event.key === 'Escape') cancel(); }} on:blur={cancel} />
<section class="sketch-workspace" aria-label="2D sketch workshop">
  <h2>2D Sketch Workshop</h2>
  <p>Edit the current project. The original source stays unchanged. Drag a point, use arrow keys, or enter coordinates. Escape cancels a drag.</p>
  {#if model && document}
    <label>Contour
      <select bind:value={pathIndex} on:change={() => { cancel(); pointIndex = 0; }}>
        {#each model.paths as candidate, index}<option value={index}>Path {index + 1}{candidate.reason ? ' — preserved (read-only)' : ''}</option>{/each}
      </select>
    </label>
    <svg bind:this={canvas} class="canvas" viewBox={model.viewBox} role="group" aria-label="Current sketch and editable points"
      on:pointermove={move} on:pointerup={finish} on:pointercancel={cancel} on:lostpointercapture={cancel}>
      <image href={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)} x={box[0]} y={box[1]} width={box[2]} height={box[3]} />
      {#if path && !path.reason}
        {#each path.points as point, index}
          <circle cx={point.x} cy={point.y} r={radius} class:control={point.control} class:selected={pointIndex === index}
            role="button" tabindex="0" aria-label={`${point.control ? 'Control' : 'Anchor'} point ${index + 1}`}
            on:focus={() => pointIndex = index} on:keydown={event => key(event, index)} on:pointerdown={event => begin(event, index)} />
        {/each}
      {/if}
    </svg>
    {#if path?.reason}<p role="status">{path.reason}</p>{/if}
    {#if !model.paths.length}<p role="status">No editable paths. SVG primitives are preserved; this workshop does not convert them.</p>{/if}
    {#each model.notices as notice}<p class="notice">{notice}</p>{/each}
    {#if selected && path && !path.reason}
      <label>Point <select bind:value={pointIndex} on:change={cancel}>{#each path.points as point, index}<option value={index}>{point.control ? 'Control' : 'Anchor'} {index + 1}</option>{/each}</select></label>
      <div class="coordinates">
        <label>X <input type="number" step="any" bind:value={x} /></label>
        <label>Y <input type="number" step="any" bind:value={y} /></label>
        <button on:click={() => apply({ type: 'move', path: pathIndex, point: pointIndex, x, y })}>Move point</button>
      </div>
    {/if}
    <div class="tools">
      <button disabled={!topology || !selected} on:click={() => apply({ type: 'add', path: pathIndex, point: pointIndex })}>Add midpoint</button>
      <button disabled={!topology || !selected || (path?.points.length ?? 0) <= 3} on:click={() => { apply({ type: 'delete', path: pathIndex, point: pointIndex }); pointIndex = 0; }}>Delete point</button>
      <button disabled={!topology || !!path?.closed} on:click={() => apply({ type: 'close', path: pathIndex })}>Close contour</button>
      <button disabled={!path || !!path.reason} on:click={() => apply({ type: 'mirror', path: pathIndex })}>Mirror path</button>
      <button disabled={!path || !!path.reason} on:click={() => apply({ type: 'rotate', path: pathIndex })}>Rotate path 90°</button>
    </div>
    <p class="notice">Add/delete/close: single linear contours only. Mirror/rotation: around the viewBox center. Curves keep their control points; unsupported SVG remains untouched.</p>
  {:else}<p>Import or open a project to edit its sketch.</p>{/if}
  {#if message}<p role="alert">{message}</p>{/if}
</section>

<style>
  .sketch-workspace { display: grid; gap: .75rem; min-width: 0; }
  h2, p { margin: 0; } p { font-size: .875rem; line-height: 1.5; }
  label { display: grid; gap: .25rem; min-width: 0; }
  select, input, button { font: inherit; min-height: 44px; max-width: 100%; border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px; padding: .5rem; }
  button { cursor: pointer; } button:disabled { opacity: .5; cursor: not-allowed; }
  .canvas { width: 100%; aspect-ratio: 1; background: #fff; border: 1px solid #64748b; touch-action: none; }
  circle { fill: #fff; stroke: #2563eb; stroke-width: 1; cursor: grab; }
  circle.control { fill: #fef3c7; } circle.selected { fill: #60a5fa; }
  circle:focus { outline: none; stroke: #111827; stroke-width: 2; }
  .coordinates, .tools { display: flex; flex-wrap: wrap; gap: .5rem; }
  .coordinates label { flex: 1; width: 80px; } .coordinates input { width: 100%; box-sizing: border-box; }
  .notice { font-size: .8rem; } :focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
</style>
