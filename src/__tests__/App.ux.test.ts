// @vitest-environment happy-dom

import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App.svelte';

let mountedApp: ReturnType<typeof mount> | null = null;

afterEach(async () => {
  if (mountedApp) await unmount(mountedApp);
  mountedApp = null;
  document.body.innerHTML = '';
  document.documentElement.classList.remove('dark-mode');
  localStorage.clear();
});

function renderApp(): void {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mountedApp = mount(App, { target });
}

describe('App UX states', () => {
  it('restores, exposes and persists the selected theme', async () => {
    localStorage.setItem('cookie-cutter-theme', 'dark');
    renderApp();

    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
    });

    const themeButton = document.querySelector<HTMLButtonElement>('button[aria-label="Use light mode"]');
    expect(themeButton?.getAttribute('aria-pressed')).toBe('true');
    themeButton?.click();

    expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
    expect(localStorage.getItem('cookie-cutter-theme')).toBe('light');
  });

  it('opens Shape Library directly and exposes its active navigation state', async () => {
    renderApp();

    const navigationButton = document.querySelector<HTMLButtonElement>('button[title="Shape Library"]');
    navigationButton?.click();

    await vi.waitFor(() => {
      expect(document.getElementById('shape-library-title')?.textContent).toBe('Shape Library');
    });

    expect(navigationButton?.getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('button[aria-label^="Use "][aria-label$=" shape"]')).not.toBeNull();

    const seasonalFilter = Array.from(document.querySelectorAll<HTMLButtonElement>('.category-filter'))
      .find((button) => button.textContent?.trim() === 'Seasonal');
    seasonalFilter?.click();
    await vi.waitFor(() => {
      expect(seasonalFilter?.getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('explains Gemini data handling before enabling the connection action', async () => {
    renderApp();

    document.querySelector<HTMLButtonElement>('button[title="AI Tools (Gemini)"]')?.click();

    await vi.waitFor(() => {
      expect(document.querySelector('summary')?.textContent).toContain('How to get a free API key');
    });

    const guide = document.querySelector<HTMLDetailsElement>('details.info-box');
    const connectButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Connect Gemini');

    expect(guide?.open).toBe(false);
    expect(document.getElementById('gemini-key-privacy')?.textContent).toContain('design or SVG data');
    expect(connectButton?.disabled).toBe(true);
  });
});
