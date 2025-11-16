<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { generateImageWithGemini, getAPIKey } from '../../utils/geminiAPI';
  import { vectorizeImage } from '../../utils/imageProcessor';

  const dispatch = createEventDispatcher<{
    imageGenerated: string; // SVG string
  }>();

  let prompt = $state('');
  let isGenerating = $state(false);
  let error = $state('');
  let apiKey = $state<string | null>(null);
  let generatedImageUrl = $state<string | null>(null);

  // Check for API key on mount
  $effect(() => {
    apiKey = getAPIKey();

    // Listen for API key changes
    function handleAPIKeyChange() {
      apiKey = getAPIKey();
    }

    window.addEventListener('gemini-api-key-changed', handleAPIKeyChange);

    return () => {
      window.removeEventListener('gemini-api-key-changed', handleAPIKeyChange);
    };
  });

  async function generateImage() {
    if (!apiKey) {
      error = 'Please configure your Gemini API key first';
      return;
    }

    if (!prompt || prompt.trim() === '') {
      error = 'Please enter a description for the cookie cutter';
      return;
    }

    isGenerating = true;
    error = '';
    generatedImageUrl = null;

    try {
      // Step 1: Generate image with Gemini
      const imageBlob = await generateImageWithGemini(prompt, apiKey);

      // Create object URL for preview
      generatedImageUrl = URL.createObjectURL(imageBlob);

      // Step 2: Convert to file and vectorize
      const file = new File([imageBlob], 'ai-generated.png', { type: 'image/png' });
      const svgString = await vectorizeImage(file);

      // Step 3: Dispatch SVG to parent
      dispatch('imageGenerated', svgString);

      error = '✅ Image generated and vectorized successfully!';
      setTimeout(() => {
        if (error.startsWith('✅')) error = '';
      }, 5000);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to generate image';
      console.error('Image generation error:', err);
    } finally {
      isGenerating = false;
    }
  }

  function clearPrompt() {
    prompt = '';
    generatedImageUrl = null;
    error = '';
  }

  // Example prompts
  const examples = [
    'Christmas tree with star on top',
    'Cute cat sitting',
    'Simple heart shape',
    'Snowflake with 6 points',
    'Smiling sun',
    'Moon and stars',
  ];

  function useExample(example: string) {
    prompt = example;
  }
</script>

<div class="image-generator">
  <div class="header">
    <h3>🎨 AI Image Generator</h3>
    <p class="subtitle">Generate cookie cutter designs with AI</p>
  </div>

  {#if !apiKey}
    <div class="warning-box">
      <p><strong>⚠️ API Key Required</strong></p>
      <p>Please configure your Gemini API key in the settings to use this feature.</p>
    </div>
  {:else}
    <div class="content">
      <div class="input-section">
        <label for="prompt">Describe your cookie cutter design:</label>
        <textarea
          id="prompt"
          bind:value={prompt}
          placeholder="Example: A cute cartoon dinosaur with simple outline"
          rows="3"
          disabled={isGenerating}
        ></textarea>

        <div class="actions">
          <button
            class="btn-primary"
            onclick={generateImage}
            disabled={isGenerating || !prompt.trim()}
          >
            {#if isGenerating}
              <span class="spinner"></span>
              Generating...
            {:else}
              ✨ Generate Image
            {/if}
          </button>

          {#if prompt}
            <button class="btn-secondary" onclick={clearPrompt} disabled={isGenerating}>
              Clear
            </button>
          {/if}
        </div>
      </div>

      <div class="examples">
        <p class="examples-title">Quick examples:</p>
        <div class="example-chips">
          {#each examples as example}
            <button class="chip" onclick={() => useExample(example)} disabled={isGenerating}>
              {example}
            </button>
          {/each}
        </div>
      </div>

      {#if generatedImageUrl}
        <div class="preview">
          <p class="preview-title">Generated Image:</p>
          <img src={generatedImageUrl} alt="AI generated cookie cutter design" />
          <p class="hint">Image has been automatically vectorized and loaded as your design!</p>
        </div>
      {/if}

      {#if error}
        <div class="message-box" class:success={error.startsWith('✅')}>
          <p>{error}</p>
        </div>
      {/if}

      <div class="info-box">
        <p><strong>How it works:</strong></p>
        <ol>
          <li>Describe the design you want (simple shapes work best)</li>
          <li>AI generates a black & white silhouette image</li>
          <li>Image is automatically converted to SVG paths</li>
          <li>Your 3D cookie cutter is created!</li>
        </ol>
      </div>
    </div>
  {/if}
</div>

<style>
  .image-generator {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1rem;
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

  .warning-box {
    padding: 1rem;
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 6px;
  }

  .warning-box p {
    margin: 0.25rem 0;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .input-section label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #333;
  }

  textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-family: inherit;
    font-size: 0.875rem;
    resize: vertical;
    box-sizing: border-box;
  }

  textarea:focus {
    outline: none;
    border-color: #667eea;
  }

  textarea:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    flex: 1;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .btn-primary:disabled {
    background: #ccc;
    cursor: not-allowed;
    transform: none;
  }

  .btn-secondary {
    background: #f5f5f5;
    color: #333;
    border: 1px solid #ddd;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e9e9e9;
  }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .examples {
    padding: 1rem;
    background: #f9f9f9;
    border-radius: 6px;
  }

  .examples-title {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 500;
    color: #666;
  }

  .example-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .chip {
    padding: 0.5rem 0.75rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 20px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .chip:hover:not(:disabled) {
    background: #667eea;
    color: white;
    border-color: #667eea;
  }

  .chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .preview {
    padding: 1rem;
    background: #f9f9f9;
    border-radius: 6px;
    text-align: center;
  }

  .preview-title {
    margin: 0 0 1rem 0;
    font-weight: 500;
    color: #333;
  }

  .preview img {
    max-width: 100%;
    max-height: 300px;
    border-radius: 6px;
    border: 2px solid #e0e0e0;
  }

  .hint {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
    color: #666;
    font-style: italic;
  }

  .message-box {
    padding: 1rem;
    border-radius: 6px;
    background: #f8d7da;
    border: 1px solid #f5c2c7;
  }

  .message-box.success {
    background: #d4edda;
    border: 1px solid #c3e6cb;
  }

  .message-box p {
    margin: 0;
    color: #842029;
  }

  .message-box.success p {
    color: #155724;
  }

  .info-box {
    padding: 1rem;
    background: #e0f2fe;
    border: 1px solid #0284c7;
    border-radius: 6px;
  }

  .info-box p {
    margin: 0 0 0.5rem 0;
    color: #0c4a6e;
  }

  .info-box ol {
    margin: 0.5rem 0 0 0;
    padding-left: 1.5rem;
    color: #0c4a6e;
  }

  .info-box li {
    margin: 0.25rem 0;
  }
</style>
