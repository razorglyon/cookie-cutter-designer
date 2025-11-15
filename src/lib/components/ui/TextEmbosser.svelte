<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    addText: {
      text: string;
      font: string;
      size: number;
      depth: number;
      mirror: boolean;
    };
  }>();

  let text = '';
  let selectedFont = 'Arial';
  let fontSize = 12;
  let embossDepth = 2;
  let mirrorText = true;

  const fonts = [
    'Arial',
    'Arial Black',
    'Comic Sans MS',
    'Courier New',
    'Georgia',
    'Impact',
    'Times New Roman',
    'Trebuchet MS',
    'Verdana'
  ];

  function handleAddText() {
    if (!text.trim()) {
      alert('Please enter some text');
      return;
    }

    dispatch('addText', {
      text: text.trim(),
      font: selectedFont,
      size: fontSize,
      depth: embossDepth,
      mirror: mirrorText
    });
  }
</script>

<div class="text-embosser">
  <h3>Text Embossing</h3>
  <p class="description">Add custom text to your cookie cutter</p>

  <div class="form-group">
    <label for="text-input">Text</label>
    <input
      id="text-input"
      type="text"
      bind:value={text}
      placeholder="Enter text here..."
      maxlength="50"
    />
    <span class="char-count">{text.length}/50</span>
  </div>

  <div class="form-group">
    <label for="font-select">Font</label>
    <select id="font-select" bind:value={selectedFont}>
      {#each fonts as font}
        <option value={font} style="font-family: {font}">{font}</option>
      {/each}
    </select>
  </div>

  <div class="form-group">
    <label for="font-size">
      Font Size: {fontSize}mm
    </label>
    <input
      id="font-size"
      type="range"
      min="6"
      max="30"
      step="1"
      bind:value={fontSize}
    />
  </div>

  <div class="form-group">
    <label for="emboss-depth">
      Emboss Depth: {embossDepth.toFixed(1)}mm
    </label>
    <input
      id="emboss-depth"
      type="range"
      min="0.5"
      max="5"
      step="0.5"
      bind:value={embossDepth}
    />
  </div>

  <div class="form-group checkbox">
    <input
      id="mirror-text"
      type="checkbox"
      bind:checked={mirrorText}
    />
    <label for="mirror-text">
      Mirror text (for stamping)
      <span class="hint">Recommended for cookie stamps</span>
    </label>
  </div>

  <div class="preview" style="font-family: {selectedFont}; font-size: {fontSize}px; transform: scaleX({mirrorText ? -1 : 1})">
    {text || 'Preview'}
  </div>

  <button class="add-text-btn" on:click={handleAddText} disabled={!text.trim()}>
    Add Text to Design
  </button>
</div>

<style>
  .text-embosser {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    color: #2d3748;
    font-weight: 600;
  }

  .description {
    margin: 0 0 1rem;
    font-size: 0.85rem;
    color: #718096;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group.checkbox {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .form-group.checkbox input[type="checkbox"] {
    margin-top: 0.2rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: #4a5568;
  }

  .form-group.checkbox label {
    margin: 0;
    display: flex;
    flex-direction: column;
  }

  .hint {
    font-size: 0.75rem;
    color: #a0aec0;
    font-weight: 400;
    margin-top: 0.15rem;
  }

  input[type="text"] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #cbd5e0;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  input[type="text"]:focus {
    outline: none;
    border-color: #4299e1;
    box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
  }

  .char-count {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #a0aec0;
    text-align: right;
  }

  select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #cbd5e0;
    border-radius: 6px;
    background: white;
    font-size: 0.9rem;
  }

  select:focus {
    outline: none;
    border-color: #4299e1;
  }

  input[type="range"] {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: #e2e8f0;
    outline: none;
    -webkit-appearance: none;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #4299e1;
    cursor: pointer;
  }

  input[type="range"]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #4299e1;
    cursor: pointer;
    border: none;
  }

  .preview {
    padding: 1rem;
    background: #f7fafc;
    border: 2px dashed #cbd5e0;
    border-radius: 6px;
    text-align: center;
    margin-bottom: 1rem;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #2d3748;
    font-weight: 600;
  }

  .add-text-btn {
    width: 100%;
    padding: 0.75rem;
    background: #48bb78;
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .add-text-btn:hover:not(:disabled) {
    background: #38a169;
  }

  .add-text-btn:disabled {
    background: #cbd5e0;
    cursor: not-allowed;
  }
</style>
