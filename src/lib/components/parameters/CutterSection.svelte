<script lang="ts">
  import {
    parameterError,
    parameterErrorField,
    params,
    updateParam
  } from '../../stores/cookieCutterStore';

  const describedBy = (field: string) =>
    $parameterErrorField === field ? `${field}-hint ${field}-error` : `${field}-hint`;
</script>

<div class="param-control">
  <label for="wallThickness">Wall Thickness: {$params.wallThickness.toFixed(1)} mm</label>
  <input id="wallThickness" data-field="wallThickness" type="range" min="0.6" max="2" step="0.1"
    value={$params.wallThickness} aria-valuetext={`${$params.wallThickness.toFixed(1)} millimeters`}
    aria-invalid={$parameterErrorField === 'wallThickness'} aria-describedby={describedBy('wallThickness')}
    on:input={(event) => updateParam('wallThickness', Number(event.currentTarget.value))} />
  <p id="wallThickness-hint" class="param-hint">0.6–2 mm · Recommended: 0.8–1.2 mm.</p>
  {#if $parameterErrorField === 'wallThickness' && $parameterError}<p id="wallThickness-error" class="param-error" role="alert">{$parameterError}</p>{/if}
</div>

<div class="param-control">
  <label for="cuttingHeight">Cutting Height: {$params.cuttingHeight.toFixed(0)} mm</label>
  <input id="cuttingHeight" data-field="cuttingHeight" type="range" min="8" max="25" step="1"
    value={$params.cuttingHeight} aria-valuetext={`${$params.cuttingHeight.toFixed(0)} millimeters`}
    aria-invalid={$parameterErrorField === 'cuttingHeight'} aria-describedby={describedBy('cuttingHeight')}
    on:input={(event) => updateParam('cuttingHeight', Number(event.currentTarget.value))} />
  <p id="cuttingHeight-hint" class="param-hint">8–25 mm · Recommended: 10–15 mm.</p>
  {#if $parameterErrorField === 'cuttingHeight' && $parameterError}<p id="cuttingHeight-error" class="param-error" role="alert">{$parameterError}</p>{/if}
</div>

<div class="param-control">
  <label for="totalHeight">Total Height: {$params.totalHeight.toFixed(0)} mm</label>
  <input id="totalHeight" data-field="totalHeight" type="range" min="15" max="40" step="1"
    value={$params.totalHeight} aria-valuetext={`${$params.totalHeight.toFixed(0)} millimeters`}
    aria-invalid={$parameterErrorField === 'totalHeight'} aria-describedby={describedBy('totalHeight')}
    on:input={(event) => updateParam('totalHeight', Number(event.currentTarget.value))} />
  <p id="totalHeight-hint" class="param-hint">15–40 mm · Must include the cutting wall and active handle.</p>
  {#if $parameterErrorField === 'totalHeight' && $parameterError}<p id="totalHeight-error" class="param-error" role="alert">{$parameterError}</p>{/if}
</div>

<div class="param-control">
  <label for="taperAngle">Taper Angle: {$params.taperAngle.toFixed(0)}°</label>
  <input id="taperAngle" data-field="taperAngle" type="range" min="0" max="15" step="1"
    value={$params.taperAngle} aria-valuetext={`${$params.taperAngle.toFixed(0)} degrees`}
    aria-invalid={$parameterErrorField === 'taperAngle'} aria-describedby={describedBy('taperAngle')}
    on:input={(event) => updateParam('taperAngle', Number(event.currentTarget.value))} />
  <p id="taperAngle-hint" class="param-hint">0–15° · Recommended: 5–10° for easier release.</p>
  {#if $parameterErrorField === 'taperAngle' && $parameterError}<p id="taperAngle-error" class="param-error" role="alert">{$parameterError}</p>{/if}
</div>
