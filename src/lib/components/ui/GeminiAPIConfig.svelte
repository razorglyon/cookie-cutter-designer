<script lang="ts">
  import { onMount } from 'svelte';
  import { clearAPIKey, getAPIKey, saveAPIKey, validateAPIKey } from '../../utils/geminiAPI';

  let apiKey = $state('');
  let hasSavedKey = $state(false);
  let isValidating = $state(false);
  let isValid = $state(false);
  let errorMessage = $state('');
  let showKey = $state(false);

  onMount(() => {
    hasSavedKey = Boolean(getAPIKey());
    isValid = hasSavedKey;
  });

  async function handleSave(): Promise<void> {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      errorMessage = 'Collez une clé API pour continuer.';
      return;
    }

    isValidating = true;
    errorMessage = '';

    try {
      const valid = await validateAPIKey(trimmedKey);
      if (!valid) {
        errorMessage = 'Cette clé API n’a pas pu être validée. Vérifiez-la et réessayez.';
        isValid = false;
        return;
      }

      saveAPIKey(trimmedKey);
      hasSavedKey = true;
      isValid = true;
      apiKey = '';
      showKey = false;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Impossible de valider la clé API';
      isValid = false;
    } finally {
      isValidating = false;
    }
  }

  function handleClear(): void {
    clearAPIKey();
    apiKey = '';
    hasSavedKey = false;
    isValid = false;
    showKey = false;
    errorMessage = '';
  }
</script>

<section class="gemini-config" aria-labelledby="gemini-config-title">
  <header class="header">
    <h3 id="gemini-config-title">Connexion à Gemini</h3>
    <p class="subtitle">Connectez une clé API gratuite de Google AI Studio.</p>
  </header>

  <div class="privacy-note" id="gemini-key-privacy">
    <strong>Utilisation de votre clé</strong>
    <p>
      La clé est conservée dans ce navigateur jusqu’à sa suppression. Elle est envoyée directement à Google
      lors de sa validation ou de l’utilisation de Gemini. Selon la fonctionnalité, des données pertinentes
      du dessin ou du SVG peuvent aussi être envoyées. Aucun serveur applicatif de Cookie Cutter Designer ne reçoit votre clé.
    </p>
  </div>

  {#if !hasSavedKey}
    <details class="info-box">
      <summary>Obtenir une clé API gratuite</summary>
      <ol>
        <li>
          Ouvrez
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
            Google AI Studio <span class="external-hint">(s’ouvre dans un nouvel onglet)</span>
          </a>
        </li>
        <li>Connectez-vous et créez une clé API.</li>
        <li>Revenez ici et collez la clé ci-dessous.</li>
      </ol>
    </details>
  {/if}

  <div class="input-group">
    <label for="api-key">
      Clé API Gemini
      {#if hasSavedKey}
        <span class="status-badge">Connecté</span>
      {/if}
    </label>

    <div class="input-wrapper">
      <input
        id="api-key"
        type={showKey ? 'text' : 'password'}
        bind:value={apiKey}
        placeholder={hasSavedKey ? 'Collez une nouvelle clé' : 'Collez votre clé API Gemini'}
        disabled={isValidating}
        aria-describedby="gemini-key-privacy gemini-key-help"
        aria-invalid={Boolean(errorMessage)}
        autocomplete="off"
        spellcheck="false"
        class:error={errorMessage}
      />
      <button
        type="button"
        class="toggle-visibility"
        onclick={() => showKey = !showKey}
        aria-label={showKey ? 'Masquer la clé API' : 'Afficher la clé API'}
        aria-pressed={showKey}
      >
        {showKey ? 'Masquer' : 'Afficher'}
      </button>
    </div>

    {#if errorMessage}
      <p class="error-message" role="alert">{errorMessage}</p>
    {:else}
      <p class="field-help" id="gemini-key-help">
        {hasSavedKey ? 'Votre clé enregistrée ne sera plus affichée.' : 'Collez une clé pour activer le bouton de connexion.'}
      </p>
    {/if}
  </div>

  <div class="actions">
    <button
      class="connect-button"
      onclick={handleSave}
      disabled={isValidating || !apiKey.trim()}
    >
      {isValidating ? 'Validation…' : hasSavedKey ? 'Remplacer la clé' : 'Connecter Gemini'}
    </button>

    {#if hasSavedKey}
      <button class="remove-button" onclick={handleClear}>Supprimer la clé</button>
    {/if}
  </div>

  {#if isValid}
    <div class="success-box" role="status">
      <strong>Gemini connecté</strong>
      <p>L’assistant est prêt. Votre clé reste enregistrée localement dans ce navigateur.</p>
    </div>
  {/if}

  <div class="features-list">
    <p class="features-title">Disponible après connexion</p>
    <ul>
      <li>Optimisation et simplification des SVG</li>
      <li>Suggestions pour améliorer le dessin</li>
      <li>Variantes créatives du dessin</li>
      <li>Recommandations intelligentes de paramètres</li>
    </ul>
  </div>
</section>

<style>
  .gemini-config {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    padding: var(--spacing-4);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: var(--surface-card);
    color: var(--text-secondary);
    box-shadow: var(--shadow-sm);
  }

  .header h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-size-lg);
  }

  .subtitle,
  .field-help {
    margin: var(--spacing-1) 0 0;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .privacy-note,
  .info-box,
  .features-list,
  .success-box {
    padding: var(--spacing-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--surface-muted);
    font-size: var(--font-size-sm);
  }

  .privacy-note {
    border-color: var(--color-primary-400);
    background: var(--surface-callout);
  }

  .privacy-note p,
  .success-box p {
    margin: var(--spacing-1) 0 0;
  }

  .info-box ol {
    margin: var(--spacing-2) 0 0;
    padding-left: var(--spacing-5);
  }

  .info-box summary {
    color: var(--text-primary);
    cursor: pointer;
    font-weight: var(--font-weight-semibold);
  }

  .info-box li + li {
    margin-top: var(--spacing-1);
  }

  .external-hint {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }

  .input-group label {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    margin-bottom: var(--spacing-2);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  .status-badge {
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-full);
    background: var(--color-secondary-100);
    color: var(--color-secondary-800);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
  }

  .input-wrapper {
    display: flex;
    gap: var(--spacing-2);
  }

  .input-wrapper input {
    min-width: 0;
    flex: 1;
    height: var(--input-height);
    padding: 0 var(--spacing-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-input);
    color: var(--text-primary);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
  }

  .input-wrapper input:focus {
    border-color: var(--color-primary-500);
    outline: 3px solid var(--focus-ring);
    outline-offset: 0;
  }

  .input-wrapper input.error {
    border-color: var(--color-error);
  }

  .toggle-visibility,
  .connect-button,
  .remove-button {
    min-height: var(--button-height);
    padding: 0 var(--spacing-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  .toggle-visibility,
  .remove-button {
    background: var(--surface-muted);
    color: var(--text-secondary);
  }

  .actions {
    display: flex;
    gap: var(--spacing-2);
  }

  .connect-button {
    flex: 1;
    background: var(--color-primary-600);
    border-color: var(--color-primary-600);
    color: white;
  }

  .connect-button:hover:not(:disabled) {
    background: var(--color-primary-700);
  }

  .connect-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-message {
    margin: var(--spacing-2) 0 0;
    color: var(--color-error);
    font-size: var(--font-size-sm);
  }

  .success-box {
    border-color: var(--color-secondary-500);
    background: var(--color-secondary-50);
    color: var(--color-secondary-800);
  }

  .features-title {
    margin: 0 0 var(--spacing-2);
    color: var(--text-primary);
    font-weight: var(--font-weight-semibold);
  }

  .features-list ul {
    margin: 0;
    padding-left: var(--spacing-5);
  }

  .features-list li + li {
    margin-top: var(--spacing-1);
  }
</style>
