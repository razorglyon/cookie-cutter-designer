<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    getAPIKey,
    suggestDesignImprovements,
    optimizeSVGWithAI,
    generateDesignVariations,
  } from '../../utils/geminiAPI';
  import { pathData } from '../../stores/cookieCutterStore';
  import type { CookieCutterParams } from '../../types/CookieCutter';

  interface Props {
    params: CookieCutterParams;
    svgContent: string | null;
  }

  let { params, svgContent }: Props = $props();

  const dispatch = createEventDispatcher<{
    optimizedSVG: string;
    applyVariation: string;
  }>();

  let showPanel = $state(false);
  let activeTab = $state<'suggestions' | 'optimize' | 'variations'>('suggestions');
  let isProcessing = $state(false);
  let suggestions = $state<string[]>([]);
  let variations = $state<string[]>([]);
  let error = $state('');
  let apiKey = $state<string | null>(null);

  // Check for API key on mount
  $effect(() => {
    apiKey = getAPIKey();

    // Listen for API key changes
    function handleAPIKeyChange() {
      apiKey = getAPIKey();
      if (showPanel && !apiKey) {
        error = 'Please configure your Gemini API key first';
      } else if (apiKey) {
        error = '';
      }
    }

    window.addEventListener('gemini-api-key-changed', handleAPIKeyChange);

    return () => {
      window.removeEventListener('gemini-api-key-changed', handleAPIKeyChange);
    };
  });

  // Refresh API key when panel opens
  function togglePanel() {
    showPanel = !showPanel;
    if (showPanel) {
      apiKey = getAPIKey();
      if (!apiKey) {
        error = 'Please configure your Gemini API key first';
      }
    }
  }

  async function getSuggestions() {
    if (!apiKey) {
      error = 'API key required';
      return;
    }

    if (!svgContent && !$pathData) {
      error = 'Please upload a design first';
      return;
    }

    isProcessing = true;
    error = '';
    suggestions = [];

    try {
      const dataToUse = svgContent || $pathData || '';
      suggestions = await suggestDesignImprovements(dataToUse, params, apiKey);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to get suggestions';
    } finally {
      isProcessing = false;
    }
  }

  async function optimizeSVG() {
    if (!apiKey || !svgContent) {
      error = 'API key and SVG content required';
      return;
    }

    isProcessing = true;
    error = '';

    try {
      const optimized = await optimizeSVGWithAI(svgContent, apiKey);
      dispatch('optimizedSVG', optimized);
      // Show success message briefly
      error = '✅ SVG optimized successfully! The design has been updated.';
      setTimeout(() => {
        if (error.startsWith('✅')) error = '';
      }, 3000);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to optimize SVG';
      console.error('SVG Optimization error:', err);
    } finally {
      isProcessing = false;
    }
  }

  async function getVariations() {
    if (!apiKey) {
      error = 'API key required';
      return;
    }

    const description = prompt('Describe the design you want variations of:');
    if (!description) return;

    isProcessing = true;
    error = '';
    variations = [];

    try {
      variations = await generateDesignVariations(description, apiKey);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to generate variations';
    } finally {
      isProcessing = false;
    }
  }

</script>

<div class="ai-assistant">
  <button class="ai-toggle" onclick={togglePanel} class:active={showPanel}>
    🤖 AI Assistant {#if !apiKey}<span class="badge">Setup Required</span>{/if}
  </button>

  {#if showPanel}
    <div class="ai-panel">
      <div class="panel-header">
        <h3>🤖 AI Design Assistant</h3>
        <button class="close-btn" onclick={() => (showPanel = false)}>×</button>
      </div>

      {#if !apiKey}
        <div class="warning-box">
          <p><strong>⚠️ API Key Required</strong></p>
          <p>Please configure your Gemini API key in the settings to use AI features.</p>
        </div>
      {:else}
        <div class="tabs">
          <button
            class="tab"
            class:active={activeTab === 'suggestions'}
            onclick={() => (activeTab = 'suggestions')}
          >
            💡 Suggestions
          </button>
          <button
            class="tab"
            class:active={activeTab === 'optimize'}
            onclick={() => (activeTab = 'optimize')}
          >
            ⚡ Optimize
          </button>
          <button
            class="tab"
            class:active={activeTab === 'variations'}
            onclick={() => (activeTab = 'variations')}
          >
            🎨 Variations
          </button>
        </div>

        <div class="tab-content">
          {#if activeTab === 'suggestions'}
            <div class="tab-pane">
              <p>Get AI-powered suggestions to improve your design for 3D printing.</p>

              {#if !svgContent && !$pathData}
                <div class="info-message">
                  <p>⚠️ Please upload a design first to get AI suggestions.</p>
                </div>
              {/if}

              <button
                class="btn-primary"
                onclick={getSuggestions}
                disabled={isProcessing || (!svgContent && !$pathData)}
              >
                {isProcessing ? 'Analyzing...' : 'Get Suggestions'}
              </button>

              {#if suggestions.length > 0}
                <div class="results">
                  <h4>Suggestions:</h4>
                  <ol>
                    {#each suggestions as suggestion}
                      <li>{suggestion}</li>
                    {/each}
                  </ol>
                </div>
              {/if}
            </div>
          {:else if activeTab === 'optimize'}
            <div class="tab-pane">
              <p>Use AI to optimize and simplify your SVG paths for better 3D printing.</p>
              <button
                class="btn-primary"
                onclick={optimizeSVG}
                disabled={isProcessing || !svgContent}
              >
                {isProcessing ? 'Optimizing...' : 'Optimize SVG'}
              </button>
              <p class="hint">This will analyze and simplify complex paths while maintaining shape accuracy.</p>
            </div>
          {:else if activeTab === 'variations'}
            <div class="tab-pane">
              <p>Generate creative design variations based on a description.</p>
              <button class="btn-primary" onclick={getVariations} disabled={isProcessing}>
                {isProcessing ? 'Generating...' : 'Generate Variations'}
              </button>

              {#if variations.length > 0}
                <div class="results">
                  <h4>Design Variations:</h4>
                  <ol>
                    {#each variations as variation}
                      <li>{variation}</li>
                    {/each}
                  </ol>
                </div>
              {/if}
            </div>
          {/if}

          {#if error}
            <div class="error-box" class:success={error.startsWith('✅')}>
              <p>{error}</p>
            </div>
          {/if}
        </div>

        <div class="powered-by">
          Powered by <strong>Gemini 2.5 Flash</strong>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .ai-assistant {
    position: relative;
  }

  .ai-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    transition: transform 0.2s, box-shadow 0.2s;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  }

  .ai-toggle:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .ai-toggle.active {
    background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
  }

  .badge {
    font-size: 0.7rem;
    padding: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 12px;
  }

  .ai-panel {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 0.5rem;
    width: 400px;
    max-width: 90vw;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    z-index: 1000;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #e0e0e0;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1.125rem;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    color: #333;
  }

  .warning-box {
    padding: 1rem;
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 6px;
    margin: 1rem;
  }

  .warning-box p {
    margin: 0.25rem 0;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid #e0e0e0;
  }

  .tab {
    flex: 1;
    padding: 0.75rem;
    background: none;
    border: none;
    cursor: pointer;
    font-weight: 500;
    color: #666;
    transition: color 0.2s, background 0.2s;
  }

  .tab:hover {
    background: #f5f5f5;
  }

  .tab.active {
    color: #667eea;
    border-bottom: 2px solid #667eea;
  }

  .tab-content {
    padding: 1rem;
  }

  .tab-pane p {
    margin: 0 0 1rem 0;
    color: #666;
  }

  .btn-primary {
    width: 100%;
    padding: 0.75rem;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    background: #5568d3;
  }

  .btn-primary:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .hint {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #999;
    font-style: italic;
  }

  .info-message {
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: #fffbeb;
    border: 1px solid #fbbf24;
    border-radius: 6px;
    color: #92400e;
  }

  .info-message p {
    margin: 0;
    font-size: 0.875rem;
  }

  .results {
    margin-top: 1rem;
    padding: 1rem;
    background: #f9f9f9;
    border-radius: 6px;
  }

  .results h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
  }

  .results ol {
    margin: 0;
    padding-left: 1.5rem;
  }

  .results li {
    margin: 0.5rem 0;
    color: #333;
  }

  .error-box {
    margin-top: 1rem;
    padding: 1rem;
    background: #f8d7da;
    border: 1px solid #f5c2c7;
    border-radius: 6px;
  }

  .error-box.success {
    background: #d4edda;
    border: 1px solid #c3e6cb;
  }

  .error-box p {
    margin: 0;
    color: #842029;
  }

  .error-box.success p {
    color: #155724;
  }

  .powered-by {
    padding: 0.75rem 1rem;
    border-top: 1px solid #e0e0e0;
    text-align: center;
    font-size: 0.875rem;
    color: #666;
  }

  .powered-by strong {
    color: #667eea;
  }
</style>
