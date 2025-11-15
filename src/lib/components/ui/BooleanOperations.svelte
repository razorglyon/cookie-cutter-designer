<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    operation: 'union' | 'subtract' | 'intersect';
  }>();

  let selectedOperation: 'union' | 'subtract' | 'intersect' | null = null;

  function handleOperation(op: 'union' | 'subtract' | 'intersect') {
    selectedOperation = op;
    dispatch('operation', op);
  }
</script>

<div class="boolean-operations">
  <h3>Boolean Operations</h3>
  <p class="description">Combine multiple shapes or cut out areas</p>

  <div class="operations-grid">
    <button
      class="operation-btn"
      class:active={selectedOperation === 'union'}
      on:click={() => handleOperation('union')}
      title="Combine shapes together"
    >
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="15" cy="20" r="10" fill="currentColor" opacity="0.5" />
        <circle cx="25" cy="20" r="10" fill="currentColor" opacity="0.5" />
      </svg>
      <span>Union</span>
    </button>

    <button
      class="operation-btn"
      class:active={selectedOperation === 'subtract'}
      on:click={() => handleOperation('subtract')}
      title="Subtract one shape from another"
    >
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="15" cy="20" r="10" fill="currentColor" />
        <circle cx="25" cy="20" r="10" fill="white" stroke="currentColor" stroke-width="1" />
      </svg>
      <span>Subtract</span>
    </button>

    <button
      class="operation-btn"
      class:active={selectedOperation === 'intersect'}
      on:click={() => handleOperation('intersect')}
      title="Keep only overlapping areas"
    >
      <svg width="40" height="40" viewBox="0 0 40 40">
        <defs>
          <clipPath id="intersect-clip">
            <circle cx="25" cy="20" r="10" />
          </clipPath>
        </defs>
        <circle cx="15" cy="20" r="10" fill="currentColor" clip-path="url(#intersect-clip)" />
      </svg>
      <span>Intersect</span>
    </button>
  </div>

  <div class="upload-secondary">
    <p>Upload a second shape to combine</p>
    <input
      type="file"
      accept=".svg,image/svg+xml"
      on:change={(e) => {
        const file = e.currentTarget.files?.[0];
        if (file) {
          // Dispatch file upload event
          dispatch('operation', 'union'); // Placeholder
        }
      }}
    />
  </div>
</div>

<style>
  .boolean-operations {
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

  .operations-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .operation-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #f7fafc;
    border: 2px solid #e2e8f0;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    color: #4a5568;
  }

  .operation-btn:hover {
    border-color: #cbd5e0;
    background: #edf2f7;
  }

  .operation-btn.active {
    border-color: #4299e1;
    background: #ebf8ff;
    color: #2c5282;
  }

  .operation-btn svg {
    color: inherit;
  }

  .operation-btn span {
    font-size: 0.8rem;
    font-weight: 500;
  }

  .upload-secondary {
    padding: 0.75rem;
    background: #f7fafc;
    border-radius: 6px;
    border: 1px dashed #cbd5e0;
  }

  .upload-secondary p {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    color: #4a5568;
  }

  .upload-secondary input[type="file"] {
    width: 100%;
    font-size: 0.85rem;
  }
</style>
