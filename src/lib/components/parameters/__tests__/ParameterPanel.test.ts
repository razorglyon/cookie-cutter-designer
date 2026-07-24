// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ParameterPanel from '../../ui/ParameterPanel.svelte';
import {
  parameterError,
  parameterErrorField,
  parameterIssue,
  params,
  setParams
} from '../../../stores/cookieCutterStore';
import { DEFAULT_PARAMS } from '../../../types/CookieCutter';

let mountedPanel: ReturnType<typeof mount> | null = null;

afterEach(async () => {
  if (mountedPanel) await unmount(mountedPanel);
  mountedPanel = null;
  document.body.innerHTML = '';
  setParams({ ...DEFAULT_PARAMS });
});

function renderPanel(): void {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mountedPanel = mount(ParameterPanel, { target });
}

function getControl(field: string): HTMLInputElement | HTMLSelectElement {
  const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[data-field="${field}"]`
  );
  if (!control) throw new Error(`Contrôle ${field} introuvable.`);
  return control;
}

function expectAccessibleField(field: string): void {
  const control = getControl(field);
  expect(control.id).not.toBe('');
  expect(document.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
  const describedBy = control.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
  expect(describedBy).toContain(`${field}-hint`);
  expect(document.getElementById(`${field}-hint`)).not.toBeNull();
}

describe('ParameterPanel découpé par sections', () => {
  it('rend les accordéons Cutter avec des champs nommés, bornés et décrits', () => {
    renderPanel();

    expect(document.querySelector('details[data-section="common"]')).not.toBeNull();
    expect(document.querySelector('details[data-section="cutter"]')).not.toBeNull();
    expect(document.querySelector('details[data-section="stamp"]')).toBeNull();
    expect(document.querySelector('details[data-section="handle"]')).not.toBeNull();
    expect(document.querySelector('details[data-section="advanced"]')).not.toBeNull();

    const modeGroup = document.querySelector('[role="group"][aria-label="Design type"]');
    expect(modeGroup?.getAttribute('aria-describedby')).toBe('mode-hint');
    expect(document.getElementById('mode-hint')).not.toBeNull();

    for (const summary of Array.from(
      document.querySelectorAll<HTMLElement>('summary[aria-controls]')
    )) {
      const contentId = summary.getAttribute('aria-controls');
      expect(contentId).not.toBeNull();
      expect(document.getElementById(contentId ?? '')?.getAttribute('role')).toBe('region');
      expect(document.getElementById(contentId ?? '')?.getAttribute('aria-labelledby')).toBe(
        summary.id
      );
    }

    for (const field of [
      'wallThickness',
      'cuttingHeight',
      'totalHeight',
      'taperAngle',
      'targetSize',
      'sizeMode',
      'buildPlateSize',
      'handleStyle',
      'handleHeight'
    ]) {
      expectAccessibleField(field);
    }

    expect(getControl('wallThickness')).toMatchObject({ min: '0.6', max: '2', step: '0.1' });
    expect(getControl('targetSize')).toMatchObject({ min: '10', max: '200', step: '1' });
    expect(document.querySelector('label[for="wallThickness"]')?.textContent).toContain('mm');
    expect(document.querySelector('label[for="taperAngle"]')?.textContent).toContain('°');
  });

  it('bascule entre les sections Cutter et Stamp sans exposer les contrôles incompatibles', async () => {
    renderPanel();
    const stampButton = document.querySelector<HTMLButtonElement>('button[data-mode="stamp"]');
    expect(stampButton).not.toBeNull();

    stampButton?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('details[data-section="stamp"]')).not.toBeNull();
    });

    expect(document.querySelector('details[data-section="cutter"]')).toBeNull();
    expect(stampButton?.getAttribute('aria-pressed')).toBe('true');
    expectAccessibleField('stampDepth');
    expect(getControl('stampDepth')).toMatchObject({ min: '1', max: '5', step: '0.5' });
  });

  it('expose et synchronise l’état accessible des accordéons natifs', async () => {
    renderPanel();
    const advanced = document.querySelector<HTMLDetailsElement>(
      'details[data-section="advanced"]'
    );
    const summary = advanced?.querySelector<HTMLElement>('summary');

    expect(advanced?.open).toBe(false);
    expect(summary?.getAttribute('aria-expanded')).toBe('false');
    summary?.click();

    await vi.waitFor(() => {
      expect(advanced?.open).toBe(true);
      expect(summary?.getAttribute('aria-expanded')).toBe('true');
    });
  });

  it('associe une erreur au seul champ rejeté et conserve la dernière valeur valide', async () => {
    renderPanel();
    const targetSize = getControl('targetSize') as HTMLInputElement;
    targetSize.value = '2000';
    targetSize.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(get(parameterErrorField)).toBe('targetSize');
    });

    expect(get(parameterError)).toContain('targetSize');
    expect(get(params).targetSize).toBe(DEFAULT_PARAMS.targetSize);
    expect(targetSize.getAttribute('aria-invalid')).toBe('true');
    expect(targetSize.getAttribute('aria-describedby')?.split(/\s+/)).toContain(
      'targetSize-error'
    );
    expect(document.getElementById('targetSize-error')?.getAttribute('role')).toBe('alert');
    expect(document.getElementById('parameter-error-summary')?.getAttribute('role')).toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('targetSize');
    expect(document.getElementById('targetSize-error')?.textContent).toContain('targetSize');
    expect(getControl('buildPlateSize').getAttribute('aria-invalid')).toBe('false');
  });

  it('relie une erreur de mode au sélecteur Cutter ou Stamp', () => {
    parameterIssue.set({ message: 'The mode parameter is invalid.', field: 'mode' });
    renderPanel();

    const modeGroup = document.querySelector('[role="group"][aria-label="Design type"]');
    expect(modeGroup?.classList.contains('invalid')).toBe(true);
    expect(modeGroup?.getAttribute('aria-describedby')?.split(/\s+/)).toEqual([
      'mode-hint',
      'parameter-error-summary'
    ]);
    expect(document.getElementById('parameter-error-summary')?.getAttribute('role')).toBe('alert');
  });

  it('met à jour les paramètres via le bridge legacy après extraction des sections', async () => {
    renderPanel();
    const wallThickness = getControl('wallThickness') as HTMLInputElement;
    wallThickness.value = '1.3';
    wallThickness.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.waitFor(() => {
      expect(get(params).wallThickness).toBe(1.3);
    });
    expect(get(parameterError)).toBeNull();
    expect(get(parameterErrorField)).toBeNull();
  });

  it('conserve des cibles tactiles de 44 px dans la primitive partagée', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/components/parameters/ParameterAccordion.svelte'),
      'utf8'
    );

    expect(source).toMatch(/summary[\s\S]*min-height:\s*44px/);
    expect(source).toMatch(/input\[type="range"\][\s\S]*height:\s*44px/);
    expect(source).toMatch(/input\[type="number"\][\s\S]*min-height:\s*44px/);
    expect(source).toMatch(/select[\s\S]*min-height:\s*44px/);
    expect(source).toMatch(/focus-visible[\s\S]*outline:\s*3px/);
    expect(source).not.toMatch(/outline:\s*none/);
  });
});
