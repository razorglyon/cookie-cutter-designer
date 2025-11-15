<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';

  export let width = 400;
  export let height = 400;
  export let initialPath: { x: number; y: number }[] = [];

  const dispatch = createEventDispatcher<{
    pathChanged: { x: number; y: number }[];
  }>();

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;
  let points: { x: number; y: number }[] = [...initialPath];
  let selectedPointIndex: number | null = null;
  let isDragging = false;
  let mode: 'select' | 'add' | 'delete' = 'select';

  onMount(() => {
    ctx = canvas.getContext('2d');
    if (ctx) {
      draw();
    }
  });

  function draw() {
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= width; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i <= height; i += 20) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // Draw path
    if (points.length > 0) {
      ctx.strokeStyle = '#4299e1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      if (points.length > 2) {
        ctx.closePath();
      }
      ctx.stroke();

      // Fill path
      ctx.fillStyle = 'rgba(66, 153, 225, 0.1)';
      ctx.fill();
    }

    // Draw points
    points.forEach((point, index) => {
      const isSelected = index === selectedPointIndex;

      ctx!.beginPath();
      ctx!.arc(point.x, point.y, isSelected ? 8 : 6, 0, Math.PI * 2);
      ctx!.fillStyle = isSelected ? '#3182ce' : '#4299e1';
      ctx!.fill();
      ctx!.strokeStyle = 'white';
      ctx!.lineWidth = 2;
      ctx!.stroke();

      // Draw point index
      if (isSelected) {
        ctx!.fillStyle = '#2d3748';
        ctx!.font = '12px sans-serif';
        ctx!.fillText(`${index}`, point.x + 12, point.y - 8);
      }
    });
  }

  function handleCanvasClick(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'add') {
      points = [...points, { x, y }];
      dispatchChange();
    } else if (mode === 'delete') {
      const pointIndex = findPointNear(x, y);
      if (pointIndex !== null) {
        points = points.filter((_, i) => i !== pointIndex);
        selectedPointIndex = null;
        dispatchChange();
      }
    } else {
      selectedPointIndex = findPointNear(x, y);
    }

    draw();
  }

  function handleMouseDown(e: MouseEvent) {
    if (mode !== 'select') return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pointIndex = findPointNear(x, y);
    if (pointIndex !== null) {
      selectedPointIndex = pointIndex;
      isDragging = true;
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging || selectedPointIndex === null || mode !== 'select') return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(height, e.clientY - rect.top));

    points[selectedPointIndex] = { x, y };
    draw();
  }

  function handleMouseUp() {
    if (isDragging) {
      isDragging = false;
      dispatchChange();
    }
  }

  function findPointNear(x: number, y: number, threshold = 10): number | null {
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - x;
      const dy = points[i].y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= threshold) {
        return i;
      }
    }
    return null;
  }

  function dispatchChange() {
    dispatch('pathChanged', points);
  }

  function clearPath() {
    if (confirm('Clear all points?')) {
      points = [];
      selectedPointIndex = null;
      draw();
      dispatchChange();
    }
  }

  function setMode(newMode: 'select' | 'add' | 'delete') {
    mode = newMode;
    selectedPointIndex = null;
    isDragging = false;
  }

  $: if (ctx) draw();
</script>

<div class="path-editor">
  <div class="toolbar">
    <button
      class="tool-btn"
      class:active={mode === 'select'}
      on:click={() => setMode('select')}
      title="Select and move points"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      </svg>
      Select
    </button>

    <button
      class="tool-btn"
      class:active={mode === 'add'}
      on:click={() => setMode('add')}
      title="Add points"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      Add
    </button>

    <button
      class="tool-btn"
      class:active={mode === 'delete'}
      on:click={() => setMode('delete')}
      title="Delete points"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
      Delete
    </button>

    <div class="spacer"></div>

    <button class="tool-btn clear" on:click={clearPath} title="Clear all">
      Clear
    </button>

    <div class="point-count">{points.length} points</div>
  </div>

  <canvas
    bind:this={canvas}
    {width}
    {height}
    on:click={handleCanvasClick}
    on:mousedown={handleMouseDown}
    on:mousemove={handleMouseMove}
    on:mouseup={handleMouseUp}
    on:mouseleave={handleMouseUp}
  ></canvas>
</div>

<style>
  .path-editor {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #f7fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    color: #4a5568;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tool-btn:hover {
    border-color: #cbd5e0;
    background: #edf2f7;
  }

  .tool-btn.active {
    border-color: #4299e1;
    background: #ebf8ff;
    color: #2c5282;
  }

  .tool-btn.clear {
    background: #fff5f5;
    border-color: #fc8181;
    color: #c53030;
  }

  .tool-btn.clear:hover {
    background: #fed7d7;
  }

  .spacer {
    flex: 1;
  }

  .point-count {
    padding: 0.5rem 0.75rem;
    background: #edf2f7;
    border-radius: 6px;
    font-size: 0.85rem;
    color: #718096;
    font-weight: 500;
  }

  canvas {
    display: block;
    cursor: crosshair;
    background: white;
  }

  canvas:active {
    cursor: grab;
  }
</style>
