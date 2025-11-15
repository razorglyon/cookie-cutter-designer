<script lang="ts">
  import { printability } from '../../stores/cookieCutterStore';
</script>

{#if $printability}
  <div class="printability-info">
    {#if $printability.warnings.length > 0}
      <div class="warnings">
        <h4>⚠️ Warnings</h4>
        <ul>
          {#each $printability.warnings as warning}
            <li>{warning}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if $printability.recommendations.length > 0}
      <div class="recommendations">
        <h4>💡 Print Recommendations</h4>
        <ul>
          {#each $printability.recommendations as recommendation}
            <li>{recommendation}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if $printability.isValid && $printability.warnings.length === 0}
      <div class="success">
        <h4>✅ Ready to Print</h4>
        <p>Your cookie cutter parameters look good!</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .printability-info {
    margin-top: 0;
    padding: 0.75rem;
    background: #f7fafc;
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
    background: #fff5f5;
    border-left: 3px solid #fc8181;
    border-radius: 4px;
  }

  .warnings h4 {
    color: #c53030;
  }

  .recommendations {
    padding: 0.6rem;
    background: #f0fff4;
    border-left: 3px solid #68d391;
    border-radius: 4px;
  }

  .recommendations h4 {
    color: #2f855a;
  }

  .success {
    padding: 0.6rem;
    background: #ebf8ff;
    border-left: 3px solid #4299e1;
    border-radius: 4px;
  }

  .success h4 {
    color: #2c5282;
  }

  .success p {
    margin: 0;
    color: #2d3748;
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
    color: #4a5568;
    line-height: 1.4;
  }

  .warnings li {
    color: #742a2a;
  }

  .recommendations li {
    color: #22543d;
  }
</style>
