<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import {
    createPresetBezierPath,
    bezierToSVG,
    bezierToSVGPath,
    normalizeBezierPath,
    type BezierPath,
    type BezierPoint,
    type BezierSegment
  } from '../../utils/bezierEditor';

  const dispatch = createEventDispatcher<{
    pathCreated: string; // SVG string
  }>();

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let currentPath: BezierPath | null = null;
  let selectedPoint: { segmentIndex: number; pointType: 'start' | 'cp1' | 'cp2' | 'end' } | null = null;
  let isDragging = false;
  let showControls = true;
  let canvasSize = 400;

  let previewSVG: string = '';

  onMount(() => {
    ctx = canvas.getContext('2d');
    if (ctx) {
      // Start with a preset
      loadPreset('heart');
    }
  });

  function loadPreset(preset: 'heart' | 'star' | 'flower' | 'custom') {
    currentPath = createPresetBezierPath(preset);
    redraw();
    updatePreview();
  }

  function redraw() {
    if (!ctx || !currentPath) return;

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    // Draw the path
    ctx.beginPath();
    const firstSegment = currentPath.segments[0];
    ctx.moveTo(firstSegment.start.x * 4, firstSegment.start.y * 4);

    for (const segment of currentPath.segments) {
      ctx.bezierCurveTo(
        segment.cp1.x * 4,
        segment.cp1.y * 4,
        segment.cp2.x * 4,
        segment.cp2.y * 4,
        segment.end.x * 4,
        segment.end.y * 4
      );
    }

    if (currentPath.closed) {
      ctx.closePath();
    }

    ctx.fillStyle = '#4299e1';
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#2c5282';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw control points and handles if enabled
    if (showControls) {
      for (let i = 0; i < currentPath.segments.length; i++) {
        const segment = currentPath.segments[i];

        // Draw control handles
        ctx.strokeStyle = '#a0aec0';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        ctx.beginPath();
        ctx.moveTo(segment.start.x * 4, segment.start.y * 4);
        ctx.lineTo(segment.cp1.x * 4, segment.cp1.y * 4);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(segment.end.x * 4, segment.end.y * 4);
        ctx.lineTo(segment.cp2.x * 4, segment.cp2.y * 4);
        ctx.stroke();

        ctx.setLineDash([]);

        // Draw anchor points
        drawPoint(segment.start.x * 4, segment.start.y * 4, '#2c5282', 6);
        drawPoint(segment.end.x * 4, segment.end.y * 4, '#2c5282', 6);

        // Draw control points
        drawPoint(segment.cp1.x * 4, segment.cp1.y * 4, '#ed8936', 5);
        drawPoint(segment.cp2.x * 4, segment.cp2.y * 4, '#ed8936', 5);
      }
    }
  }

  function drawPoint(x: number, y: number, color: string, radius: number) {
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function handleMouseDown(e: MouseEvent) {
    if (!currentPath) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / 4;
    const y = (e.clientY - rect.top) / 4;

    // Check if clicking on a point
    for (let i = 0; i < currentPath.segments.length; i++) {
      const segment = currentPath.segments[i];

      if (distance(x, y, segment.start.x, segment.start.y) < 8) {
        selectedPoint = { segmentIndex: i, pointType: 'start' };
        isDragging = true;
        return;
      }
      if (distance(x, y, segment.end.x, segment.end.y) < 8) {
        selectedPoint = { segmentIndex: i, pointType: 'end' };
        isDragging = true;
        return;
      }
      if (showControls && distance(x, y, segment.cp1.x, segment.cp1.y) < 8) {
        selectedPoint = { segmentIndex: i, pointType: 'cp1' };
        isDragging = true;
        return;
      }
      if (showControls && distance(x, y, segment.cp2.x, segment.cp2.y) < 8) {
        selectedPoint = { segmentIndex: i, pointType: 'cp2' };
        isDragging = true;
        return;
      }
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging || !selectedPoint || !currentPath) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, (e.clientX - rect.left) / 4));
    const y = Math.max(0, Math.min(100, (e.clientY - rect.top) / 4));

    const segment = currentPath.segments[selectedPoint.segmentIndex];
    segment[selectedPoint.pointType].x = x;
    segment[selectedPoint.pointType].y = y;

    // If moving an anchor point, update connected segments
    if (selectedPoint.pointType === 'start' && selectedPoint.segmentIndex > 0) {
      const prevSegment = currentPath.segments[selectedPoint.segmentIndex - 1];
      prevSegment.end.x = x;
      prevSegment.end.y = y;
    } else if (selectedPoint.pointType === 'end' && selectedPoint.segmentIndex < currentPath.segments.length - 1) {
      const nextSegment = currentPath.segments[selectedPoint.segmentIndex + 1];
      nextSegment.start.x = x;
      nextSegment.start.y = y;
    }

    redraw();
  }

  function handleMouseUp() {
    isDragging = false;
    selectedPoint = null;
    updatePreview();
  }

  function distance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  function updatePreview() {
    if (!currentPath) return;
    previewSVG = bezierToSVG(currentPath, 100, 100);
  }

  function applyBezierShape() {
    if (!currentPath) return;
    const svg = bezierToSVG(currentPath, 100, 100);
    dispatch('pathCreated', svg);
  }

  function toggleControls() {
    showControls = !showControls;
    redraw();
  }

  function reset() {
    loadPreset('heart');
  }
</script>

<div class="bezier-editor">
  <div class="editor-header">
    <h3>✏️ Bézier Curve Editor</h3>
  </div>

  <div class="editor-content">
    <div class="preset-buttons">
      <button class="preset-btn" on:click={() => loadPreset('heart')}>
        ❤️ Heart
      </button>
      <button class="preset-btn" on:click={() => loadPreset('star')}>
        ⭐ Star
      </button>
      <button class="preset-btn" on:click={() => loadPreset('flower')}>
        🌸 Flower
      </button>
      <button class="preset-btn" on:click={() => loadPreset('custom')}>
        ⬜ Square
      </button>
    </div>

    <div class="canvas-container">
      <canvas
        bind:this={canvas}
        width={canvasSize}
        height={canvasSize}
        on:mousedown={handleMouseDown}
        on:mousemove={handleMouseMove}
        on:mouseup={handleMouseUp}
        on:mouseleave={handleMouseUp}
      ></canvas>
    </div>

    <div class="editor-controls">
      <label class="checkbox-control">
        <input type="checkbox" bind:checked={showControls} on:change={redraw} />
        <span>Show Control Points</span>
      </label>

      <div class="action-buttons">
        <button class="action-btn secondary" on:click={reset}>
          Reset
        </button>
        <button class="action-btn primary" on:click={applyBezierShape}>
          Apply Shape
        </button>
      </div>
    </div>

    <div class="help-text">
      <p>💡 Drag the blue anchor points to reshape the path</p>
      <p>💡 Drag the orange control points to adjust curves</p>
    </div>
  </div>
</div>

<style>
  .bezier-editor {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1rem;
  }

  .editor-header {
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    color: #2d3748;
    font-weight: 600;
  }

  .editor-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .preset-buttons {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  .preset-btn {
    padding: 0.75rem 0.5rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .preset-btn:hover {
    border-color: #4299e1;
    background: #ebf8ff;
    transform: translateY(-1px);
  }

  .canvas-container {
    display: flex;
    justify-content: center;
    background: #f7fafc;
    border-radius: 8px;
    padding: 1rem;
  }

  canvas {
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    background: white;
    cursor: crosshair;
  }

  .editor-controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .checkbox-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #4a5568;
    cursor: pointer;
  }

  .checkbox-control input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .action-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn.primary {
    background: #4299e1;
    color: white;
  }

  .action-btn.primary:hover {
    background: #3182ce;
  }

  .action-btn.secondary {
    background: #edf2f7;
    color: #4a5568;
  }

  .action-btn.secondary:hover {
    background: #e2e8f0;
  }

  .help-text {
    padding: 1rem;
    background: #ebf8ff;
    border-radius: 6px;
    border-left: 4px solid #4299e1;
  }

  .help-text p {
    margin: 0.25rem 0;
    font-size: 0.85rem;
    color: #2c5282;
  }
</style>
