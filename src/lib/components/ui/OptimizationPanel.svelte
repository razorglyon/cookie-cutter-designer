<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { params } from '../../stores/cookieCutterStore';
  import {
    analyzeParameters,
    autoFixIssues,
    estimatePrintTime,
    estimateFilamentUsage,
    type OptimizationReport
  } from '../../utils/printOptimizer';

  const dispatch = createEventDispatcher<{
    applyFix: Partial<import('../../types/CookieCutter').CookieCutterParams>;
  }>();

  let report: OptimizationReport;
  let showDetails = false;

  $: report = analyzeParameters($params);
  $: printTime = estimatePrintTime($params);
  $: filamentUsage = estimateFilamentUsage($params);

  function applyAutoFix() {
    const fixed = autoFixIssues(report.issues);
    dispatch('applyFix', fixed);
  }

  function getScoreColor(score: number): string {
    if (score >= 90) return '#48bb78';
    if (score >= 70) return '#ed8936';
    return '#f56565';
  }

  function getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'error': return '🔴';
      case 'warning': return '🟡';
      case 'info': return '🔵';
      default: return '⚪';
    }
  }
</script>

<div class="optimization-panel">
  <div class="panel-header">
    <h3>🔧 Optimisation de l’impression</h3>
    <button class="toggle-btn" on:click={() => showDetails = !showDetails}>
      {showDetails ? '▼' : '▶'}
    </button>
  </div>

  <div class="score-section">
    <div class="score-circle" style="border-color: {getScoreColor(report.score)}">
      <div class="score-value" style="color: {getScoreColor(report.score)}">
        {report.score}
      </div>
      <div class="score-label">Score</div>
    </div>

    <div class="status-info">
      <div class="status-badge" class:ready={report.canPrint} class:issues={!report.canPrint}>
        {report.canPrint ? '✓ Prêt à imprimer' : '✗ Problèmes détectés'}
      </div>
      <div class="print-stats">
        <div class="stat">
          <span class="stat-icon">⏱️</span>
          <span class="stat-value">~{printTime}min</span>
        </div>
        <div class="stat">
          <span class="stat-icon">🧵</span>
          <span class="stat-value">~{filamentUsage}g</span>
        </div>
      </div>
    </div>
  </div>

  {#if report.issues.length > 0}
    <div class="issues-summary">
      <div class="summary-counts">
        {#if report.issues.filter(i => i.severity === 'error').length > 0}
          <span class="count error">
            🔴 {report.issues.filter(i => i.severity === 'error').length}
          </span>
        {/if}
        {#if report.issues.filter(i => i.severity === 'warning').length > 0}
          <span class="count warning">
            🟡 {report.issues.filter(i => i.severity === 'warning').length}
          </span>
        {/if}
        {#if report.issues.filter(i => i.severity === 'info').length > 0}
          <span class="count info">
            🔵 {report.issues.filter(i => i.severity === 'info').length}
          </span>
        {/if}
      </div>

      <button class="auto-fix-btn" on:click={applyAutoFix}>
        🔧 Tout corriger automatiquement
      </button>
    </div>

    {#if showDetails}
      <div class="issues-list">
        {#each report.issues as issue}
          <div class="issue-card" class:error={issue.severity === 'error'} class:warning={issue.severity === 'warning'}>
            <div class="issue-header">
              <span class="issue-icon">{getSeverityIcon(issue.severity)}</span>
              <span class="issue-message">{issue.message}</span>
            </div>
            <div class="issue-suggestion">{issue.suggestion}</div>
            <div class="issue-category">{issue.category}</div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="no-issues">
      ✨ Parfait ! Aucun problème d’optimisation détecté.
    </div>
  {/if}
</div>

<style>
  .optimization-panel {
    background: var(--surface-card);
    color: var(--text-primary);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1rem;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary);
    font-weight: 600;
  }

  .toggle-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.8rem;
  }

  .score-section {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-bottom: 1rem;
  }

  .score-circle {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    border: 4px solid;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .score-value {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .score-label {
    font-size: 0.7rem;
    color: var(--text-secondary);
  }

  .status-info {
    flex: 1;
  }

  .status-badge {
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .status-badge.ready {
    background: var(--surface-success);
    color: var(--text-success);
  }

  .status-badge.issues {
    background: var(--color-error-light);
    color: var(--text-error);
  }

  .print-stats {
    display: flex;
    gap: 1rem;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .stat-icon {
    font-size: 1rem;
  }

  .issues-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--surface-muted);
    border-radius: 6px;
    margin-bottom: 0.5rem;
  }

  .summary-counts {
    display: flex;
    gap: 0.75rem;
  }

  .count {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .auto-fix-btn {
    padding: 0.5rem 1rem;
    background: var(--color-primary-700);
    color: var(--text-on-brand);
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .auto-fix-btn:hover {
    background: var(--color-primary-800);
  }

  .issues-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .issue-card {
    padding: 0.75rem;
    border-radius: 6px;
    border-left: 4px solid;
    background: var(--surface-muted);
  }

  .issue-card.error {
    border-left-color: var(--color-error);
    background: var(--color-error-light);
  }

  .issue-card.warning {
    border-left-color: var(--color-warning);
    background: var(--surface-warning);
  }

  .issue-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .issue-message {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .issue-suggestion {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }

  .issue-category {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    font-weight: 600;
  }

  .no-issues {
    padding: 1rem;
    text-align: center;
    color: var(--text-success);
    font-weight: 600;
    background: var(--surface-success);
    border-radius: 6px;
  }
</style>
