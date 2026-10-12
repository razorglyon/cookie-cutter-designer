// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ParameterPanel from '../../ui/ParameterPanel.svelte';
import { createDesignDocument } from '../../../projects/createDesignDocument';
import { createProjectSessionIntegration } from '../../../projects/projectSessionIntegration';
import { decodeProject, encodeProject } from '../../../projects/projectCodec';
import { createDesignSessionStore } from '../../../stores/designSessionStore';
import { params, resetParams, setParams } from '../../../stores/cookieCutterStore';
import type { DesignDocument } from '../../../domain/designDocument';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120"><path d="M0 0 L100 0 L100 100 L0 100 Z"/><path d="M35 35 L65 35 L65 65 L35 65 Z"/></svg>';
const bridge = { id: 'bridge-1', from: { x: 0, y: 50 }, to: { x: 35, y: 50 }, widthMm: 2 };
const profiles = [
  { id: 'thin', label: 'Fin', wallThickness: 0.8, taperAngle: 5 },
  { id: 'standard', label: 'Standard', wallThickness: 1, taperAngle: 7 },
  { id: 'robust', label: 'Robuste', wallThickness: 1.5, taperAngle: 10 }
] as const;
let panel: ReturnType<typeof mount> | undefined;
let integration: ReturnType<typeof createProjectSessionIntegration> | undefined;

afterEach(async () => {
  if (panel) await unmount(panel);
  panel = undefined;
  integration?.dispose();
  integration = undefined;
  document.body.innerHTML = '';
  resetParams();
});

function setup(version: 1 | 2 = 1, wallThickness = 1.3) {
  const base = createDesignDocument({ name: 'Wall fixture', kind: 'cutter', source: { type: 'svg', fileName: 'island.svg', svg } });
  if (base.kind !== 'cutter') throw new Error('Expected Cutter fixture');
  const withParameters = {
    ...base,
    parameters: { ...base.parameters, wallThickness, cuttingHeight: 16, totalHeight: 26, handleHeight: 10, targetSize: 90 }
  };
  const initialDocument: DesignDocument = version === 2
    ? { ...withParameters, schemaVersion: 2, bridges: [bridge] }
    : withParameters;
  const session = createDesignSessionStore(initialDocument);
  const schedule = vi.fn();
  integration = createProjectSessionIntegration({ session, generation: { schedule, cancel: vi.fn() }, clearHistory: vi.fn(), invalidateSource: vi.fn(), projectViewport: vi.fn() });
  schedule.mockClear();
  panel = mount(ParameterPanel, { target: document.body.appendChild(document.createElement('div')) });
  return { session, schedule, initial: session.getDocument()! };
}

function profileButton(id: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`button[data-wall-profile="${id}"]`);
  expect(button, `Profil ${id} disponible`).not.toBeNull();
  return button!;
}

function input(field: string, value: number) {
  const control = document.querySelector<HTMLInputElement>(`#${field}`)!;
  control.value = String(value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('wall profiles use current document values, not a saved profile name', () => {
  it.each(profiles.flatMap(profile => [1, 2].map(version => ({ profile, version: version as 1 | 2 }))))('applies $profile.label atomically to V$version and preserves the other fields', async ({ profile, version }) => {
    const { session, schedule, initial } = setup(version);
    profileButton(profile.id).click();
    await tick();
    const current = session.getDocument()!;
    expect(current).toEqual({
      ...initial,
      updatedAt: current.updatedAt,
      parameters: { ...initial.parameters, wallThickness: profile.wallThickness, taperAngle: profile.taperAngle }
    });
    expect(current.schemaVersion).toBe(version);
    expect('wallProfile' in current.parameters).toBe(false);
    expect(get(params)).toEqual(current.parameters);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenLastCalledWith(current);
    expect(profileButton(profile.id).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('label[for="wallThickness"]')?.textContent).toContain(`${profile.wallThickness} mm`);
    expect(document.querySelector('label[for="taperAngle"]')?.textContent).toContain(`${profile.taperAngle}°`);
    expect(decodeProject(encodeProject(current)).document).toEqual(current);
  });

  it('does not apply a preset at mount and derives restored/custom states from exact values', async () => {
    const { session, schedule, initial } = setup();
    expect(session.getDocument()).toBe(initial);
    expect(schedule).not.toHaveBeenCalled();
    expect(document.querySelector('[data-wall-profile-status]')?.textContent).toContain('Personnalisé');
    expect(profiles.map(p => profileButton(p.id).getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
    session.updateParameters('cutter', { wallThickness: 0.8, taperAngle: 5 });
    await tick();
    expect(profileButton('thin').getAttribute('aria-pressed')).toBe('true');
    input('wallThickness', 0.9);
    await tick();
    expect(session.getDocument()?.parameters.wallThickness).toBe(0.9);
    expect(profileButton('thin').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-wall-profile-status]')?.textContent).toContain('Personnalisé');
    input('wallThickness', 0.8);
    await tick();
    expect(profileButton('thin').getAttribute('aria-pressed')).toBe('true');
    input('taperAngle', 6);
    await tick();
    expect(profileButton('thin').getAttribute('aria-pressed')).toBe('false');
    input('taperAngle', 5);
    input('cuttingHeight', 17);
    await tick();
    expect(profileButton('thin').getAttribute('aria-pressed')).toBe('true');
    expect(session.getDocument()?.parameters.cuttingHeight).toBe(17);
  });

  it('keeps an existing Standard document unchanged when the already active profile is clicked', async () => {
    const { session, schedule } = setup(1, 1);
    const before = session.getDocument();
    profileButton('standard').click();
    await tick();
    expect(session.getDocument()).toBe(before);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('exposes all values, a named group, and a non-certification notice', () => {
    setup();
    expect(document.querySelector('fieldset[aria-describedby="wall-profiles-hint"] legend')?.textContent).toContain('Profil de paroi');
    for (const profile of profiles) {
      const button = profileButton(profile.id);
      expect(button.type).toBe('button');
      expect(button.textContent).toContain(profile.label);
      expect(button.textContent).toContain(`${profile.wallThickness.toFixed(1)} mm`);
      expect(button.textContent).toContain(`${profile.taperAngle}°`);
    }
    expect(document.getElementById('wall-profiles-hint')?.textContent).toMatch(/hauteurs.*poignée.*ponts/i);
    expect(document.getElementById('wall-profiles-hint')?.textContent).toMatch(/sans certification.*solidité.*sécurité alimentaire/i);
  });

  it('shows exact custom physical values from older projects without rounding their labels or ARIA', async () => {
    const { session } = setup();
    session.updateParameters('cutter', { wallThickness: 0.85, cuttingHeight: 12.5, totalHeight: 24.75, taperAngle: 7.25 });
    await tick();
    for (const [field, value, unit, accessibleUnit] of [
      ['wallThickness', '0.85', 'mm', 'millimètres'],
      ['cuttingHeight', '12.5', 'mm', 'millimètres'],
      ['totalHeight', '24.75', 'mm', 'millimètres'],
      ['taperAngle', '7.25', '°', 'degrés']
    ]) {
      expect(document.querySelector(`label[for="${field}"]`)?.textContent).toContain(`${value}${unit === 'mm' ? ' ' : ''}${unit}`);
      expect(document.getElementById(field)?.getAttribute('aria-valuetext')).toBe(`${value} ${accessibleUnit}`);
    }
    expect(document.querySelector('[data-wall-profile-status]')?.textContent).toContain('Personnalisé');
  });

  it('does not expose cutter wall profiles in Stamp mode', async () => {
    const { session } = setup();
    setParams({ ...get(params), mode: 'stamp' });
    await tick();
    expect(session.getDocument()?.kind).toBe('stamp');
    expect(document.querySelector('[data-wall-profile]')).toBeNull();
  });
});
