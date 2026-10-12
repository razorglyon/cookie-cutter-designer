<script lang="ts">
  import {
    parameterError,
    parameterErrorField,
    params,
    updateParam,
    updateParams
  } from '../../stores/cookieCutterStore';
  import { WALL_PROFILES, matchingWallProfile } from '../../domain/wallProfiles';

  const activeProfile = $derived(matchingWallProfile($params));
  const describedBy = (field: string) =>
    $parameterErrorField === field ? `${field}-hint ${field}-error` : `${field}-hint`;
</script>

<fieldset class="wall-profiles" aria-describedby="wall-profiles-hint">
  <legend>Profil de paroi</legend>
  <div class="profile-options">
    {#each WALL_PROFILES as profile (profile.id)}
      <button
        type="button"
        data-wall-profile={profile.id}
        aria-pressed={activeProfile?.id === profile.id}
        onclick={() => updateParams(profile.parameters)}
      >
        <strong>{profile.label}</strong>
        <span>{profile.parameters.wallThickness.toFixed(1)} mm · {profile.parameters.taperAngle}°</span>
      </button>
    {/each}
  </div>
  <p class="param-hint" data-wall-profile-status role="status">
    {activeProfile?.label ?? 'Personnalisé'} · épaisseur {$params.wallThickness} mm · angle {$params.taperAngle}°
  </p>
  <p id="wall-profiles-hint" class="param-hint">
    Ces profils règlent uniquement l’épaisseur et l’angle. Les hauteurs, la poignée et les ponts restent inchangés.
    Ajustez librement les valeurs ci-dessous. Réglages indicatifs, sans certification de solidité ou de sécurité alimentaire.
  </p>
</fieldset>

<div class="param-control">
  <label for="wallThickness">Épaisseur de la paroi : {$params.wallThickness} mm</label>
  <input id="wallThickness" data-field="wallThickness" type="range" min="0.6" max="2" step="0.1"
    value={$params.wallThickness} aria-valuetext={`${$params.wallThickness} millimètres`}
    aria-invalid={$parameterErrorField === 'wallThickness'} aria-describedby={describedBy('wallThickness')}
    oninput={(event) => updateParam('wallThickness', Number(event.currentTarget.value))} />
  <p id="wallThickness-hint" class="param-hint">0.6–2 mm · Recommandé : 0.8–1.2 mm.</p>
  {#if $parameterErrorField === 'wallThickness' && $parameterError}<p id="wallThickness-error" class="param-error" role="alert">{$parameterError}</p>{/if}
</div>

<div class="param-control">
  <label for="cuttingHeight">Hauteur de découpe : {$params.cuttingHeight} mm</label>
  <input id="cuttingHeight" data-field="cuttingHeight" type="range" min="8" max="25" step="1"
    value={$params.cuttingHeight} aria-valuetext={`${$params.cuttingHeight} millimètres`}
    aria-invalid={$parameterErrorField === 'cuttingHeight'} aria-describedby={describedBy('cuttingHeight')}
    oninput={(event) => updateParam('cuttingHeight', Number(event.currentTarget.value))} />
  <p id="cuttingHeight-hint" class="param-hint">8–25 mm · Recommandé : 10–15 mm.</p>
  {#if $parameterErrorField === 'cuttingHeight' && $parameterError}<p id="cuttingHeight-error" class="param-error" role="alert">{$parameterError}</p>{/if}
</div>

<div class="param-control">
  <label for="totalHeight">Hauteur totale : {$params.totalHeight} mm</label>
  <input id="totalHeight" data-field="totalHeight" type="range" min="15" max="40" step="1"
    value={$params.totalHeight} aria-valuetext={`${$params.totalHeight} millimètres`}
    aria-invalid={$parameterErrorField === 'totalHeight'} aria-describedby={describedBy('totalHeight')}
    oninput={(event) => updateParam('totalHeight', Number(event.currentTarget.value))} />
  <p id="totalHeight-hint" class="param-hint">15–40 mm · Doit inclure la paroi de découpe et la poignée active.</p>
  {#if $parameterErrorField === 'totalHeight' && $parameterError}<p id="totalHeight-error" class="param-error" role="alert">{$parameterError}</p>{/if}
</div>

<div class="param-control">
  <label for="taperAngle">Angle de dépouille : {$params.taperAngle}°</label>
  <input id="taperAngle" data-field="taperAngle" type="range" min="0" max="15" step="1"
    value={$params.taperAngle} aria-valuetext={`${$params.taperAngle} degrés`}
    aria-invalid={$parameterErrorField === 'taperAngle'} aria-describedby={describedBy('taperAngle')}
    oninput={(event) => updateParam('taperAngle', Number(event.currentTarget.value))} />
  <p id="taperAngle-hint" class="param-hint">0–15° · Recommandé : 5–10° pour faciliter le démoulage.</p>
  {#if $parameterErrorField === 'taperAngle' && $parameterError}<p id="taperAngle-error" class="param-error" role="alert">{$parameterError}</p>{/if}
</div>

<style>
  .wall-profiles {
    min-width: 0;
    margin: 0 0 var(--spacing-4);
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: var(--spacing-2);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  .profile-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 6rem), 1fr));
    gap: var(--spacing-2);
  }

  button {
    display: flex;
    min-width: 0;
    min-height: 44px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-1);
    padding: var(--spacing-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-input);
    color: var(--text-secondary);
  }

  button strong {
    font-size: var(--font-size-sm);
    overflow-wrap: normal;
    word-break: normal;
  }

  button span {
    font-size: var(--font-size-xs);
  }

  button:hover,
  button[aria-pressed='true'] {
    border-color: var(--color-primary-500);
    background: var(--surface-callout);
  }

  button[aria-pressed='true'] {
    color: var(--color-primary-600);
  }

  button:focus-visible {
    outline: 3px solid var(--color-primary-500);
    outline-offset: 2px;
  }
</style>
