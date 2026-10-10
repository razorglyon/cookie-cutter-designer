<script context="module" lang="ts">
  let nextDialogId = 0;
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  export let title: string;
  export let description: string;
  // Include a safe choice with id "cancel". IDs must be unique within this dialog.
  export let choices: readonly { id: string; label: string; destructive?: boolean }[];
  // Emits once per mount; the parent owns resolving the request and unmounting.
  export let onChoose: (id: string) => void;

  const dialogId = `project-confirm-${++nextDialogId}`;
  let dialog: HTMLDialogElement;
  let chosen = false;

  function choose(id: string): void {
    if (chosen) return;
    chosen = true;
    onChoose(id);
  }

  function cancel(event: Event): void {
    // Keep the modal open until the parent handles the result.
    event.preventDefault();
    choose('cancel');
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      cancel(event);
      event.stopPropagation();
      return;
    }
    if (event.key !== 'Tab') return;

    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    // Native modal behavior handles interior navigation and background inertness.
    // Explicit boundary wrapping also keeps focus inside after the final control.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    const cancelChoice = choices.find((choice) => choice.id === 'cancel');
    if (!cancelChoice || cancelChoice.destructive) {
      throw new Error('ProjectConfirmDialog requires a non-destructive "cancel" choice.');
    }
    const initiator = document.activeElement;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[data-choice="cancel"]')?.focus();

    return () => {
      dialog.close();
      if (initiator instanceof HTMLElement && initiator.isConnected) initiator.focus();
    };
  });
</script>

<dialog
  bind:this={dialog}
  aria-modal="true"
  aria-labelledby={`${dialogId}-title`}
  aria-describedby={`${dialogId}-description`}
  on:cancel={cancel}
  on:keydown={handleKeydown}
>
  <h2 id={`${dialogId}-title`}>{title}</h2>
  <p id={`${dialogId}-description`}>{description}</p>
  <div class="choices">
    {#each choices as choice (choice.id)}
      <button
        type="button"
        data-choice={choice.id}
        class:destructive={choice.destructive}
        disabled={chosen}
        on:click={() => choose(choice.id)}
      >{choice.label}</button>
    {/each}
  </div>
</dialog>

<style>
  dialog {
    box-sizing: border-box;
    width: min(30rem, calc(100% - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow-y: auto;
    padding: var(--spacing-6, 1.5rem);
    border: 1px solid var(--border-strong, #cbd5e1);
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--surface-card, #fff);
    color: var(--text-primary, #0f172a);
    box-shadow: var(--shadow-xl, 0 20px 25px rgb(0 0 0 / 0.1));
  }

  dialog::backdrop {
    background: rgb(15 23 42 / 0.6);
  }

  h2 {
    margin: 0 0 var(--spacing-3, 0.75rem);
    font-size: var(--font-size-xl, 1.25rem);
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0 0 var(--spacing-5, 1.25rem);
    color: var(--text-secondary, #334155);
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--spacing-2, 0.5rem);
  }

  button {
    min-height: 44px;
    padding: 0.65rem 1rem;
    border: 1px solid var(--border-strong, #cbd5e1);
    border-radius: var(--radius-md, 0.5rem);
    background: var(--surface-card, #fff);
    color: var(--text-primary, #0f172a);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  button.destructive {
    border-color: var(--color-error, #ef4444);
    background: var(--color-error-light, #fef2f2);
  }

  button:focus-visible {
    outline: 3px solid var(--color-primary-600, #2563eb);
    outline-offset: 3px;
  }

  button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  @media (max-width: 480px) {
    .choices {
      flex-direction: column;
    }
  }
</style>
