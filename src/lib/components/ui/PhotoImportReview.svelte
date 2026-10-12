<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { DEFAULT_PHOTO_SETTINGS, type PhotoSettings } from '../../import/photoSettings';
  import type { PhotoTraceResult } from '../../import/photoImport';

  export let file: File;
  const dispatch = createEventDispatcher<{ apply: { file: File; result: PhotoTraceResult }; cancel: void }>();
  let originalUrl = '';
  let foreground: PhotoSettings['foreground'] = 'dark';
  let automatic = true;
  let threshold = 128;
  let cropX = 0;
  let cropY = 0;
  let cropWidth = 100;
  let cropHeight = 100;
  let minComponentArea = 0;
  let fillHoles = false;
  let result: PhotoTraceResult | null = null;
  let error: string | null = null;
  let pending = false;
  let alive = true;
  let revision = 0;
  let controller: AbortController | null = null;
  let preparedSettings = '';
  let reviewHeading: HTMLHeadingElement;

  $: settings = {
    ...DEFAULT_PHOTO_SETTINGS,
    threshold: automatic ? null : threshold,
    foreground,
    crop: { x: cropX / 100, y: cropY / 100, width: cropWidth / 100, height: cropHeight / 100 },
    minComponentArea,
    fillHoles
  } satisfies PhotoSettings;
  $: settingsKey = JSON.stringify(settings);
  $: fresh = result !== null && preparedSettings === settingsKey;
  $: previewUrl = fresh && result ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}` : '';
  // Editing a field invalidates both the visible draft and any in-flight result.
  $: if (pending && pendingSettings !== settingsKey) stop();
  let pendingSettings = '';

  function stop(): void {
    revision += 1;
    controller?.abort();
    controller = null;
    pending = false;
  }
  function cancel(): void { stop(); dispatch('cancel'); }
  async function prepare(): Promise<void> {
    stop();
    const token = revision;
    const snapshot = settings;
    const key = settingsKey;
    const abort = new AbortController();
    controller = abort;
    pendingSettings = key;
    pending = true;
    result = null;
    error = null;
    try {
      const { preparePhoto } = await import('../../import/photoImport');
      if (!alive || abort.signal.aborted || token !== revision) return;
      const candidate = await preparePhoto(file, snapshot, abort.signal);
      if (!alive || abort.signal.aborted || token !== revision) return;
      result = candidate;
      preparedSettings = key;
    } catch (cause) {
      if (alive && !abort.signal.aborted && token === revision) {
        error = cause instanceof Error ? cause.message : 'La préparation a échoué. Essayez un recadrage plus serré.';
      }
    } finally {
      if (controller === abort) { controller = null; pending = false; }
    }
  }
  function apply(): void {
    if (pending || !fresh || !result?.diagnostics.canApply) return;
    dispatch('apply', { file, result });
  }
  onMount(() => {
    originalUrl = URL.createObjectURL(file);
    // The last action sits below the previews; focusing it would jump past the images.
    reviewHeading.focus({ preventScroll: true });
    if (window.matchMedia?.('(max-width: 768px)').matches) {
      const panel = reviewHeading.closest<HTMLElement>('.panel-content');
      if (panel) panel.scrollTop += reviewHeading.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    }
    void prepare();
  });
  onDestroy(() => {
    alive = false;
    stop();
    if (originalUrl) URL.revokeObjectURL(originalUrl);
  });
</script>

<svelte:window on:keydown={event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } }} />
<section class="photo-review" aria-label="Préparation de la photo">
  <h3 bind:this={reviewHeading} tabindex="-1">Préparer la photo</h3>
  <p>Un objet contrasté sur un fond simple donne le meilleur contour. Recadrez autour de la forme voulue, ajustez le seuil puis vérifiez l’aperçu. Rien ne remplace votre dessin avant confirmation.</p>
  <div class="previews">
    <figure>
      {#if originalUrl}<div class="original-crop"><img src={originalUrl} alt="Original à recadrer" /><div class="crop-outline" aria-hidden="true" style:left={`${cropX}%`} style:top={`${cropY}%`} style:width={`${cropWidth}%`} style:height={`${cropHeight}%`}></div></div>{/if}
      <figcaption>Original : {file.name}</figcaption>
    </figure>
    <figure>
      {#if previewUrl}<img src={previewUrl} alt="Contour préparé" />
      {:else}<div class="preview-empty">{pending ? 'Préparation…' : 'Aperçu à recalculer'}</div>{/if}
      <figcaption>Le noir deviendra la forme ; le blanc représente le fond et les trous.</figcaption>
    </figure>
  </div>
  <fieldset>
    <legend>Recadrage (% de l’image originale)</legend>
    <div class="crop-fields">
      <label>Gauche (%)<input aria-label="Recadrage photo : gauche" type="number" min="0" max="99" step="0.1" bind:value={cropX} /></label>
      <label>Haut (%)<input aria-label="Recadrage photo : haut" type="number" min="0" max="99" step="0.1" bind:value={cropY} /></label>
      <label>Largeur (%)<input aria-label="Recadrage photo : largeur" type="number" min="0.1" max="100" step="0.1" bind:value={cropWidth} /></label>
      <label>Hauteur (%)<input aria-label="Recadrage photo : hauteur" type="number" min="0.1" max="100" step="0.1" bind:value={cropHeight} /></label>
    </div>
    <p>Gauche + largeur et haut + hauteur ne doivent pas dépasser 100 %. Laissez un peu de fond autour de l’objet.</p>
  </fieldset>
  <label>Objet à conserver
    <select aria-label="Objet à conserver sur la photo" value={foreground} on:change={event => foreground = event.currentTarget.value as PhotoSettings['foreground']}>
      <option value="dark">Sombre sur fond clair</option><option value="light">Clair sur fond sombre</option>
    </select>
  </label>
  <label class="check"><input type="checkbox" aria-label="Seuil automatique de la photo" bind:checked={automatic} /> Seuil automatique</label>
  <label>Seuil : {automatic ? (fresh ? result?.diagnostics.threshold : 'automatique') : threshold} / 255
    <input aria-label="Seuil de la photo" type="range" min="0" max="255" step="1" disabled={automatic} bind:value={threshold} />
  </label>
  <label>Retirer les îlots de bruit jusqu’à {minComponentArea} pixels (0 = tout conserver)
    <input aria-label="Surface du bruit sur la photo" type="range" min="0" max="64" step="1" bind:value={minComponentArea} />
  </label>
  <label class="check"><input type="checkbox" aria-label="Combler les trous de la photo" bind:checked={fillHoles} /> Silhouette extérieure : combler les trous</label>
  {#if fillHoles}<p>Cette option supprime volontairement tous les trous intérieurs. Décochez-la pour les conserver.</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if fresh && result}
    <p role="status" aria-live="polite">{result.diagnostics.width} × {result.diagnostics.height} px traités ; {result.diagnostics.components} forme(s), {result.diagnostics.holes} trou(s), {result.diagnostics.removedComponents} îlot(s) retiré(s), {result.diagnostics.filledHoles} trou(s) comblé(s).</p>
    {#each result.diagnostics.warnings as warning}<p class="warning">{warning}</p>{/each}
    {#if !result.diagnostics.canApply}<p>Résultat non applicable. Recadrez davantage ou ajustez le seuil et le contraste de la photo.</p>{/if}
  {:else if pending}<p role="status" aria-live="polite">Calcul dans un traitement local…</p>
  {:else}<p role="status">Réglages modifiés : recalculez l’aperçu avant de l’appliquer.</p>{/if}
  <div class="actions">
    <button type="button" class="btn" on:click={prepare}>Recalculer l’aperçu photo</button>
    <button type="button" class="btn btn-primary" disabled={pending || !fresh || !result?.diagnostics.canApply} on:click={apply}>Appliquer le contour photo</button>
    <button type="button" class="btn" on:click={cancel}>Annuler la préparation photo</button>
  </div>
  <p class="privacy">Traitement local uniquement. Les pixels et ces réglages restent en mémoire ; exportez le projet pour conserver le contour validé. L’aperçu 3D vérifiera ensuite sa géométrie.</p>
</section>
<style>
  .photo-review { display: grid; gap: var(--spacing-3, 12px); min-width: 0; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; }
  h3, p { margin: 0; } p, figcaption { font-size: var(--font-size-sm, 14px); line-height: 1.5; color: var(--text-muted); }
  label { display: grid; gap: 6px; font-size: 14px; }
  input:not([type='checkbox']), select { box-sizing: border-box; width: 100%; min-width: 0; min-height: 44px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; }
  input[type='range'] { padding: 0; } input[type='checkbox'] { width: 22px; height: 22px; flex-shrink: 0; accent-color: var(--primary-color, #f59e0b); }
  .check { display: flex; align-items: center; min-height: 44px; gap: 10px; }
  fieldset { min-width: 0; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; }
  .crop-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .previews { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  figure { margin: 0; min-width: 0; } img, .preview-empty { display: block; width: 100%; height: 150px; object-fit: contain; background: #fff; border-radius: 6px; }
  .original-crop { position: relative; overflow: hidden; } .original-crop img { height: auto; border-radius: 0; } .crop-outline { position: absolute; box-sizing: border-box; border: 2px solid #0b8043; background: #ffffff0a; pointer-events: none; }
  .preview-empty { display: grid; place-items: center; color: #444; font-size: 14px; }
  figcaption { overflow-wrap: break-word; margin-top: 6px; } .actions { display: grid; gap: 8px; } button { min-height: 44px; white-space: normal; text-align: center; }
  .warning, [role='alert'] { color: var(--text-primary); border-left: 3px solid var(--primary-color, #f59e0b); padding-left: 8px; }
  :focus-visible { outline: 2px solid var(--primary-color, #f59e0b); outline-offset: 2px; }
  @media (max-width: 768px) {
    .previews { grid-template-columns: minmax(0, 1fr); gap: var(--spacing-3); }
    img, .preview-empty { height: 220px; }
    .original-crop img { height: auto; }
    input[type='number'], select { font-size: max(16px, 1rem); }
  }
</style>
