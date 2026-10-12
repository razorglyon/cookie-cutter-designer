import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function styles(component: string): string {
  const source = readFileSync(resolve(process.cwd(), 'src/lib/components', `${component}.svelte`), 'utf8');
  return source.split('<style>')[1]?.split('</style>')[0] ?? '';
}

describe('Project and Export panels inherit the shared light and dark palettes', () => {
  it.each([
    'ui/ProjectManager',
    'library/LocalProjectLibrary',
    'ui/RecoveryPanel',
    'ui/AdvancedExport'
  ])('%s uses theme surfaces and foregrounds rather than light-only colors', component => {
    const css = styles(component);
    expect(css).toMatch(/background:\s*var\(--surface-card\)/);
    expect(css).toMatch(/color:\s*var\(--text-primary\)/);
    expect(css).toMatch(/background:\s*var\(--surface-muted\)/);
    expect(css).toMatch(/border[^;]*var\(--border-(?:default|strong)\)/);
    expect(css).not.toMatch(/(?:background(?:-color)?|color):\s*(?:white|#[0-9a-f]{3,8})\b/i);
  });

  it('keeps project names legible in the native input for both themes', () => {
    const css = styles('ui/ProjectManager');
    expect(css).toMatch(/input\[type='text'\]\s*\{[^}]*background:\s*var\(--surface-input\)/s);
    expect(css).toMatch(/input\[type='text'\]\s*\{[^}]*color:\s*var\(--text-primary\)/s);
  });

  it('themes Export format choices, selected states, summary and filename', () => {
    const css = styles('ui/AdvancedExport');
    expect(css).toMatch(/\.format-card\.selected\s*\{[^}]*background:\s*var\(--surface-callout\)/s);
    expect(css).toMatch(/\.checkbox-option\s*\{[^}]*background:\s*var\(--surface-input\)/s);
    expect(css).toMatch(/\.export-info\s*\{[^}]*background:\s*var\(--surface-muted\)/s);
    expect(css).toMatch(/\.filename-preview\s*\{[^}]*background:\s*var\(--surface-input\)/s);
  });
});

describe('Secondary creation and printing surfaces keep the same theme', () => {
  it.each([
    ['ui/MaterialManager', '.material-manager'],
    ['ui/OptimizationPanel', '.optimization-panel'],
    ['ui/CollisionDetector', '.collision-detector'],
    ['ui/SlicePreview', '.slice-preview'],
    ['ui/PrintabilityInfo', '.printability-info'],
    ['ui/CloudGallery', '.cloud-gallery']
  ])('%s gives %s a theme-aware background and text', (component, selector) => {
    const css = styles(component);
    const escaped = selector.replace('.', '\\.');
    expect(css).toMatch(new RegExp(`${escaped}\\s*\\{[^}]*background:\\s*var\\(--surface-(?:card|muted)\\)`, 's'));
    expect(css).toMatch(new RegExp(`${escaped}\\s*\\{[^}]*color:\\s*var\\(--text-primary\\)`, 's'));
  });

  it('keeps material names readable on black and white swatches', () => {
    const css = styles('ui/MaterialManager');
    expect(css).toMatch(/\.swatch-name\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.82\)/s);
    expect(css).toMatch(/\.swatch-name\s*\{[^}]*color:\s*var\(--text-on-brand\)/s);
    expect(css).toMatch(/\.swatch-name\s*\{[^}]*overflow-wrap:\s*anywhere/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*600px\)\s*\{\s*\.material-group\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  });

  it('keeps semantic print statuses distinct while using dark-capable tokens', () => {
    const css = styles('ui/PrintabilityInfo');
    expect(css).toMatch(/\.warnings\s*\{[^}]*background:\s*var\(--color-error-light\)/s);
    expect(css).toMatch(/\.recommendations\s*\{[^}]*background:\s*var\(--surface-success\)/s);
    expect(css).toMatch(/\.success\s*\{[^}]*background:\s*var\(--surface-callout\)/s);
  });
});
