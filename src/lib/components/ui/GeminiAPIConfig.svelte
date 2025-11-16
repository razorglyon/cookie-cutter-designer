<script lang="ts">
  import { onMount } from 'svelte';
  import { getAPIKey, saveAPIKey, clearAPIKey, validateAPIKey } from '$lib/utils/geminiAPI';

  let apiKey = $state('');
  let savedKey = $state<string | null>(null);
  let isValidating = $state(false);
  let isValid = $state(false);
  let errorMessage = $state('');
  let showKey = $state(false);

  onMount(() => {
    savedKey = getAPIKey();
    if (savedKey) {
      apiKey = savedKey;
      isValid = true;
    }
  });

  async function handleSave() {
    if (!apiKey || apiKey.trim() === '') {
      errorMessage = 'Please enter an API key';
      return;
    }

    isValidating = true;
    errorMessage = '';

    try {
      const valid = await validateAPIKey(apiKey);
      if (valid) {
        saveAPIKey(apiKey);
        savedKey = apiKey;
        isValid = true;
        errorMessage = '';
      } else {
        errorMessage = 'Invalid API key. Please check and try again.';
        isValid = false;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to validate API key';
      isValid = false;
    } finally {
      isValidating = false;
    }
  }

  function handleClear() {
    clearAPIKey();
    apiKey = '';
    savedKey = null;
    isValid = false;
    errorMessage = '';
  }

  function toggleShowKey() {
    showKey = !showKey;
  }
</script>

<div class="gemini-config">
  <div class="header">
    <h3>🤖 Gemini AI Configuration</h3>
    <p class="subtitle">Free API key from Google AI Studio</p>
  </div>

  {#if !savedKey}
    <div class="info-box">
      <p><strong>Get your free API key:</strong></p>
      <ol>
        <li>Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio</a></li>
        <li>Sign in with your Google account</li>
        <li>Click "Create API Key"</li>
        <li>Copy and paste the key below</li>
      </ol>
    </div>
  {/if}

  <div class="input-group">
    <label for="api-key">
      Gemini API Key
      {#if savedKey}
        <span class="status-badge valid">✓ Configured</span>
      {/if}
    </label>

    <div class="input-wrapper">
      <input
        id="api-key"
        type={showKey ? 'text' : 'password'}
        bind:value={apiKey}
        placeholder="AIzaSy..."
        disabled={isValidating}
        class:error={errorMessage}
      />
      <button
        type="button"
        class="toggle-visibility"
        onclick={toggleShowKey}
        title={showKey ? 'Hide key' : 'Show key'}
      >
        {showKey ? '👁️' : '👁️‍🗨️'}
      </button>
    </div>

    {#if errorMessage}
      <p class="error-message">{errorMessage}</p>
    {/if}
  </div>

  <div class="actions">
    <button
      class="btn-primary"
      onclick={handleSave}
      disabled={isValidating || !apiKey}
    >
      {#if isValidating}
        Validating...
      {:else if savedKey}
        Update Key
      {:else}
        Save & Validate
      {/if}
    </button>

    {#if savedKey}
      <button class="btn-secondary" onclick={handleClear}>
        Clear Key
      </button>
    {/if}
  </div>

  {#if isValid}
    <div class="success-box">
      <p>✅ API key is valid and ready to use!</p>
      <p class="small">Your key is stored locally in your browser.</p>
    </div>
  {/if}

  <div class="features-list">
    <p class="features-title">AI Features (requires API key):</p>
    <ul>
      <li>🎨 SVG optimization and simplification</li>
      <li>💡 Design improvement suggestions</li>
      <li>🔄 Creative design variations</li>
      <li>🤖 Smart parameter recommendations</li>
    </ul>
  </div>
</div>

<style>
  .gemini-config {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.5rem;
    margin: 1rem 0;
  }

  .header {
    margin-bottom: 1rem;
  }

  .header h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1.25rem;
    color: #1a1a1a;
  }

  .subtitle {
    margin: 0;
    font-size: 0.875rem;
    color: #666;
  }

  .info-box {
    background: #f5f7ff;
    border: 1px solid #d0d7ff;
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .info-box p {
    margin: 0 0 0.5rem 0;
  }

  .info-box ol {
    margin: 0.5rem 0 0 0;
    padding-left: 1.5rem;
  }

  .info-box li {
    margin: 0.25rem 0;
  }

  .info-box a {
    color: #4285f4;
    text-decoration: none;
  }

  .info-box a:hover {
    text-decoration: underline;
  }

  .input-group {
    margin-bottom: 1rem;
  }

  .input-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #333;
  }

  .status-badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-weight: normal;
  }

  .status-badge.valid {
    background: #d4edda;
    color: #155724;
  }

  .input-wrapper {
    display: flex;
    gap: 0.5rem;
  }

  .input-wrapper input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
  }

  .input-wrapper input:focus {
    outline: none;
    border-color: #4285f4;
  }

  .input-wrapper input.error {
    border-color: #dc3545;
  }

  .input-wrapper input:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }

  .toggle-visibility {
    padding: 0.5rem 0.75rem;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
  }

  .toggle-visibility:hover {
    background: #e9e9e9;
  }

  .error-message {
    margin: 0.5rem 0 0 0;
    color: #dc3545;
    font-size: 0.875rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.2s;
  }

  .btn-primary {
    background: #4285f4;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #3367d6;
  }

  .btn-primary:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #f5f5f5;
    color: #333;
    border: 1px solid #ddd;
  }

  .btn-secondary:hover {
    background: #e9e9e9;
  }

  .success-box {
    background: #d4edda;
    border: 1px solid #c3e6cb;
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .success-box p {
    margin: 0;
    color: #155724;
  }

  .success-box .small {
    margin-top: 0.25rem;
    font-size: 0.875rem;
    opacity: 0.8;
  }

  .features-list {
    background: #f9f9f9;
    border-radius: 6px;
    padding: 1rem;
  }

  .features-title {
    margin: 0 0 0.5rem 0;
    font-weight: 500;
    color: #333;
  }

  .features-list ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .features-list li {
    margin: 0.25rem 0;
    color: #666;
  }
</style>
