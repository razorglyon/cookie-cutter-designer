<script lang="ts">
  export let id: string;
  export let title: string;
  export let description = '';
  export let open = true;

  let expanded = open;
</script>

<details class="parameter-accordion" data-section={id} bind:open={expanded}>
  <summary
    id={`${id}-summary`}
    aria-controls={`${id}-content`}
    aria-expanded={expanded}
  >
    <span class="summary-copy">
      <strong>{title}</strong>
      {#if description}<small>{description}</small>{/if}
    </span>
    <span class="chevron" aria-hidden="true">⌄</span>
  </summary>

  <div
    id={`${id}-content`}
    class="accordion-content"
    role="region"
    aria-labelledby={`${id}-summary`}
  >
    <slot />
  </div>
</details>

<style>
  .parameter-accordion {
    margin-bottom: var(--spacing-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--surface-card);
    overflow: clip;
  }

  summary {
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-3);
    padding: var(--spacing-2) var(--spacing-3);
    color: var(--text-primary);
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover {
    background: var(--surface-muted);
  }

  .summary-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .summary-copy strong {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  .summary-copy small {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-normal);
  }

  .chevron {
    flex: 0 0 auto;
    color: var(--text-muted);
    transition: transform var(--transition-fast);
  }

  details[open] .chevron {
    transform: rotate(180deg);
  }

  .accordion-content {
    padding: var(--spacing-3);
    border-top: 1px solid var(--border-default);
  }

  .accordion-content :global(.param-control) {
    min-width: 0;
    margin-bottom: var(--spacing-4);
  }

  .accordion-content :global(.param-control:last-child) {
    margin-bottom: 0;
  }

  .accordion-content :global(label),
  .accordion-content :global(.control-label) {
    display: block;
    margin-bottom: var(--spacing-2);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .accordion-content :global(input[type="range"]) {
    width: 100%;
    height: 44px;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }

  .accordion-content :global(input[type="range"]::-webkit-slider-runnable-track) {
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--text-muted);
  }

  .accordion-content :global(input[type="range"]::-webkit-slider-thumb) {
    width: 24px;
    height: 24px;
    margin-top: -9px;
    border-radius: 50%;
    background: var(--color-primary-600);
    appearance: none;
    -webkit-appearance: none;
  }

  .accordion-content :global(input[type="range"]::-moz-range-track) {
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--text-muted);
  }

  .accordion-content :global(input[type="range"]::-moz-range-thumb) {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 50%;
    background: var(--color-primary-600);
  }

  .accordion-content :global(input[type="number"]),
  .accordion-content :global(select) {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 0 var(--spacing-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-input);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
  }

  .accordion-content :global(.param-hint),
  .accordion-content :global(.param-error) {
    margin-top: var(--spacing-1);
    font-size: var(--font-size-xs);
    line-height: var(--line-height-normal);
  }

  .accordion-content :global(.param-hint) {
    color: var(--text-muted);
  }

  .accordion-content :global(.param-error) {
    color: var(--color-error);
    font-weight: var(--font-weight-medium);
  }

  .accordion-content :global([aria-invalid="true"]) {
    border-color: var(--color-error);
  }

  summary:focus-visible,
  .accordion-content :global(input:focus-visible),
  .accordion-content :global(select:focus-visible) {
    outline: 3px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  @media (max-width: 480px) {
    .accordion-content {
      padding: var(--spacing-2) var(--spacing-3) var(--spacing-3);
    }
  }
</style>
