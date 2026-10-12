<script lang="ts">
  import { printability } from '../../stores/cookieCutterStore';
</script>

{#if $printability}
  <div class="printability-info">
    {#if $printability.warnings.length > 0}
      <div class="warnings">
        <h4>⚠️ Avertissements</h4>
        <ul>
          {#each $printability.warnings as warning}
            <li>{warning}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if $printability.recommendations.length > 0}
      <div class="recommendations">
        <h4>💡 Conseils d’impression</h4>
        <ul>
          {#each $printability.recommendations as recommendation}
            <li>{recommendation}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if $printability.isValid && $printability.warnings.length === 0}
      <div class="success">
        <h4>✅ Prêt à imprimer</h4>
        <p>Les paramètres de votre emporte-pièce semblent corrects !</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .printability-info {
    margin-top: 0;
    padding: 0.75rem;
    background: var(--surface-muted);
    color: var(--text-primary);
    border-radius: 8px;
  }

  h4 {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .warnings {
    margin-bottom: 0.75rem;
    padding: 0.6rem;
    background: var(--color-error-light);
    border-left: 3px solid var(--color-error);
    border-radius: 4px;
  }

  .warnings h4 {
    color: var(--text-error);
  }

  .recommendations {
    padding: 0.6rem;
    background: var(--surface-success);
    border-left: 3px solid var(--color-success);
    border-radius: 4px;
  }

  .recommendations h4 {
    color: var(--text-success);
  }

  .success {
    padding: 0.6rem;
    background: var(--surface-callout);
    border-left: 3px solid var(--color-primary-500);
    border-radius: 4px;
  }

  .success h4 {
    color: var(--text-primary);
  }

  .success p {
    margin: 0;
    color: var(--text-primary);
    font-size: 0.85rem;
  }

  ul {
    margin: 0;
    padding-left: 1.25rem;
    list-style-type: disc;
  }

  li {
    margin: 0.35rem 0;
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .warnings li {
    color: var(--text-error);
  }

  .recommendations li {
    color: var(--text-success);
  }
</style>
