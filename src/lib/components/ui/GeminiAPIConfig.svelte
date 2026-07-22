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
      errorMessage = 'Paste an API key to continue.';
      return;
    }

    isValidating = true;
    errorMessage = '';

    try {
      const valid = await validateAPIKey(trimmedKey);
      if (!valid) {
        errorMessage = 'This API key could not be validated. Check it and try again.';
        isValid = false;
        return;
      }

      saveAPIKey(trimmedKey);
      hasSavedKey = true;
      isValid = true;
      apiKey = '';
      showKey = false;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to validate API key';
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
    <h3 id="gemini-config-title">Gemini connection</h3>
    <p class="subtitle">Connect a free Google AI Studio API key.</p>
  </header>

  <div class="privacy-note" id="gemini-key-privacy">
    <strong>How your key is used</strong>
    <p>
      The key is stored in this browser until you remove it. It is sent directly to Google when the key
      is validated or when you use Gemini. Depending on the feature, relevant design or SVG data may also
      be sent. Cookie Cutter Designer has no application server receiving your key.
    </p>
  </div>

  {#if !hasSavedKey}
    <details class="info-box">
      <summary>How to get a free API key</summary>
      <ol>
        <li>
          Open
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
            Google AI Studio <span class="external-hint">(opens in a new tab)</span>
          </a>
        </li>
        <li>Sign in and create an API key.</li>
        <li>Return here and paste the key below.</li>
      </ol>
    </details>
  {/if}

  <div class="input-group">
    <label for="api-key">
      Gemini API key
      {#if hasSavedKey}
        <span class="status-badge">Connected</span>
      {/if}
    </label>

    <div class="input-wrapper">
      <input
        id="api-key"
        type={showKey ? 'text' : 'password'}
        bind:value={apiKey}
        placeholder={hasSavedKey ? 'Paste a replacement key' : 'Paste your Gemini API key'}
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
        aria-label={showKey ? 'Hide API key' : 'Show API key'}
        aria-pressed={showKey}
      >
        {showKey ? 'Hide' : 'Show'}
      </button>
    </div>

    {#if errorMessage}
      <p class="error-message" role="alert">{errorMessage}</p>
    {:else}
      <p class="field-help" id="gemini-key-help">
        {hasSavedKey ? 'Your saved key is never displayed again.' : 'Paste a key to enable the connection button.'}
      </p>
    {/if}
  </div>

  <div class="actions">
    <button
      class="connect-button"
      onclick={handleSave}
      disabled={isValidating || !apiKey.trim()}
    >
      {isValidating ? 'Validating…' : hasSavedKey ? 'Replace key' : 'Connect Gemini'}
    </button>

    {#if hasSavedKey}
      <button class="remove-button" onclick={handleClear}>Remove key</button>
    {/if}
  </div>

  {#if isValid}
    <div class="success-box" role="status">
      <strong>Gemini connected</strong>
      <p>The assistant is ready. Your key remains stored locally in this browser.</p>
    </div>
  {/if}

  <div class="features-list">
    <p class="features-title">Available after connection</p>
    <ul>
      <li>SVG optimization and simplification</li>
      <li>Design improvement suggestions</li>
      <li>Creative design variations</li>
      <li>Smart parameter recommendations</li>
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
