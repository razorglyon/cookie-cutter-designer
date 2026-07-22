// @vitest-environment happy-dom

import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App.svelte';

let mountedApp: ReturnType<typeof mount> | null = null;

afterEach(async () => {
  if (mountedApp) await unmount(mountedApp);
  mountedApp = null;
  document.body.innerHTML = '';
  localStorage.clear();
});

async function openCategory(title: string, expectedText: string): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  expect(button).not.toBeNull();
  button?.click();

  await vi.waitFor(() => {
    expect(document.body.textContent).toContain(expectedText);
  });
}

describe('App lazy panels', () => {
  it('loads optional feature panels when their categories are opened', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mountedApp = mount(App, { target });

    await openCategory('Advanced Creation', 'AI Image Processor');
    await openCategory('AI Tools (Gemini)', 'Gemini connection');
    await openCategory('Cloud Gallery', 'Cloud Gallery');
  });
});
