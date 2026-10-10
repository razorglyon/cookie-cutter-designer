// @vitest-environment happy-dom

import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProjectConfirmDialog from '../ProjectConfirmDialog.svelte';

const saveChoices = [
  { id: 'save', label: 'Save' },
  { id: 'discard', label: 'Discard', destructive: true },
  { id: 'cancel', label: 'Cancel' }
] as const;
const collisionChoices = [
  { id: 'replace', label: 'Replace', destructive: true },
  { id: 'copy', label: 'Open a copy' },
  { id: 'cancel', label: 'Cancel' }
] as const;
const deleteChoices = [
  { id: 'delete', label: 'Delete', destructive: true },
  { id: 'cancel', label: 'Cancel' }
] as const;

type Choice = { id: string; label: string; destructive?: boolean };
let mounted: ReturnType<typeof mount> | null = null;

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

async function render(
  choices: readonly Choice[] = saveChoices,
  text = { title: 'Unsaved project', description: 'Save your changes before opening another project?' }
) {
  const opener = document.createElement('button');
  opener.textContent = 'Open project';
  document.body.append(opener);
  opener.focus();
  const target = document.createElement('div');
  document.body.append(target);
  const onChoose = vi.fn<(id: string) => void>();
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
  mounted = mount(ProjectConfirmDialog, {
    target,
    props: {
      ...text,
      choices,
      onChoose
    }
  });
  await tick();
  const dialog = document.querySelector('dialog');
  if (!dialog) throw new Error('Confirmation dialog not rendered');
  return { dialog, opener, onChoose, showModal };
}

function button(label: string): HTMLButtonElement {
  const result = Array.from(document.querySelectorAll('dialog button')).find(
    (element) => element.textContent?.trim() === label
  );
  if (!(result instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  return result;
}

function key(target: Element, name: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: name, shiftKey, bubbles: true, cancelable: true
  });
  target.dispatchEvent(event);
  return event;
}

describe('ProjectConfirmDialog', () => {
  it('opens a named native modal with described content and initial focus on Cancel', async () => {
    const { dialog, onChoose, showModal } = await render();
    expect(showModal).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')?.textContent)
      .toBe('Unsaved project');
    expect(document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent)
      .toBe('Save your changes before opening another project?');
    expect(document.activeElement).toBe(button('Cancel'));
    expect(onChoose).not.toHaveBeenCalled();
  });

  for (const [scenario, choices] of [
    ['unsaved', saveChoices], ['collision', collisionChoices], ['delete', deleteChoices]
  ] as const) {
    for (const choice of choices) {
      it(`emits only ${choice.id} for a deliberate ${scenario} choice and locks further interaction`, async () => {
        const { dialog, onChoose } = await render(choices);
        expect(onChoose).not.toHaveBeenCalled();
        expect(button(choice.label).type).toBe('button');
        expect(button(choice.label).classList.contains('destructive')).toBe('destructive' in choice && choice.destructive);
        button(choice.label).click();
        // Guard synchronously, even before Svelte flushes the disabled state.
        button('Cancel').click();
        key(dialog, 'Escape');
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        await tick();
        expect(onChoose).toHaveBeenCalledExactlyOnceWith(choice.id);
        expect(Array.from(dialog.querySelectorAll('button')).every((control) => control.disabled))
          .toBe(true);
        expect(dialog.open).toBe(true); // Parent owns closing/unmounting.
      });
    }
  }

  it('maps Escape to cancel without activating a destructive choice or closing independently', async () => {
    const { dialog, onChoose } = await render(deleteChoices);
    button('Delete').focus();
    expect(key(button('Delete'), 'Escape').defaultPrevented).toBe(true);
    await tick();
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('cancel');
    expect(dialog.open).toBe(true);
  });

  it('handles the native cancel event once and prevents implicit dismissal', async () => {
    const { dialog, onChoose } = await render();
    const event = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(event);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(event.defaultPrevented).toBe(true);
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('cancel');
    expect(dialog.open).toBe(true);
  });

  it('wraps Tab and Shift+Tab at modal boundaries without choosing an action', async () => {
    const { onChoose } = await render();
    expect(key(button('Cancel'), 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button('Save'));
    expect(key(button('Save'), 'Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button('Cancel'));
    // Interior navigation is left to the native browser, not simulated by happy-dom.
    button('Discard').focus();
    expect(key(button('Discard'), 'Tab').defaultPrevented).toBe(false);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('restores focus to the opener on unmount after a choice', async () => {
    const { opener, onChoose } = await render();
    button('Cancel').click();
    await unmount(mounted!);
    mounted = null;
    expect(document.activeElement).toBe(opener);
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('cancel');
  });

  it('restores focus on unmount without implicitly choosing anything', async () => {
    const { opener, onChoose } = await render();
    await unmount(mounted!);
    mounted = null;
    expect(document.activeElement).toBe(opener);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('does not try to refocus an opener removed by the parent', async () => {
    const { opener } = await render();
    const focus = vi.spyOn(opener, 'focus');
    opener.remove();
    await unmount(mounted!);
    mounted = null;
    expect(focus).not.toHaveBeenCalled();
  });

  it('renders project-derived strings as text, never HTML', async () => {
    const label = '<img src=x onerror=alert(1)>';
    const { dialog } = await render(
      [{ id: 'delete', label, destructive: true }, { id: 'cancel', label: 'Cancel' }],
      { title: label, description: label }
    );
    expect(button(label).textContent).toBe(label);
    expect(dialog.querySelector('h2')?.textContent).toBe(label);
    expect(dialog.querySelector('p')?.textContent).toBe(label);
    expect(document.querySelector('dialog img')).toBeNull();
  });
});
