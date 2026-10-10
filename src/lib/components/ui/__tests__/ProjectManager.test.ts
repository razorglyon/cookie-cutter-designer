// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProjectManager from '../ProjectManager.svelte';
import { createDesignSessionStore } from '../../../stores/designSessionStore';
import { createProjectWorkflow } from '../../../projects/projectWorkflow';
import { createProjectStorage, type ProjectRecordBackend } from '../../../projects/projectStorage';
import { projectDocument, UPDATED_AT } from '../../../projects/__tests__/projectFixtures';
import { encodeProject } from '../../../projects/projectCodec';
import legacy from '../../../domain/__fixtures__/document-v0.json';

let component: ReturnType<typeof mount> | undefined;
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.innerHTML = ''; });
function setup(unavailableReason: string | null = null, empty = false) {
  const backend: ProjectRecordBackend = { put: vi.fn(async () => {}), get: vi.fn(async () => undefined), getAll: vi.fn(async () => []), delete: vi.fn(async () => {}) };
  const session = createDesignSessionStore(empty ? null : projectDocument(), { now: () => UPDATED_AT });
  const download = vi.fn();
  const workflow = createProjectWorkflow({ session, storage: createProjectStorage(backend), download, confirmDiscard: async () => 'discard' });
  const target = document.createElement('div'); document.body.appendChild(target);
  component = mount(ProjectManager, { target, props: { session, workflow, unavailableReason } });
  return { backend, session, workflow, download };
}
function button(name: string) {
  const found = [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === name);
  if (!found) throw new Error(`Missing button ${name}`);
  return found;
}
function nameInput() { return document.querySelector<HTMLInputElement>('input[type=text]')!; }
function edit(value: string) { const input = nameInput(); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }

describe('ProjectManager session UI', () => {
  it('renames the actual document, keeps invalid drafts inline, and follows session replacement', async () => {
    const { session } = setup();
    expect(nameInput().value).toBe('Étoile');
    expect(document.querySelector(`label[for="${nameInput().id}"]`)).not.toBeNull();
    nameInput().focus(); edit('Renamed'); await tick();
    expect(session.getDocument()?.name).toBe('Renamed');
    expect(document.activeElement).toBe(nameInput());
    edit(''); await tick();
    expect(session.getDocument()?.name).toBe('Renamed');
    expect(nameInput().value).toBe('');
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(nameInput().getAttribute('aria-describedby')!)?.getAttribute('role')).toBe('alert');
    session.replace(projectDocument('stamp')); await tick();
    expect(nameInput().value).toBe('Étoile');
    expect(nameInput().getAttribute('aria-invalid')).toBe('false');
  });
  it('saves explicitly, announces dirty/saved and offers portable backup after storage failure', async () => {
    const { workflow, backend, download } = setup();
    expect(document.querySelector('[role=status]')?.textContent).toContain('Unsaved');
    button('Save project').click();
    await vi.waitFor(() => expect(document.querySelector('[role=status]')?.textContent).toContain('Saved'));
    edit('Dirty'); await tick();
    vi.mocked(backend.put).mockRejectedValueOnce(new Error('quota'));
    button('Save project').click();
    await vi.waitFor(() => expect(document.querySelector('[role=alert]')?.textContent).toContain('quota'));
    expect(workflow.getState().dirty).toBe(true);
    expect(button('Export project').disabled).toBe(false);
    button('Export project').click(); await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[role=alert]')?.textContent).toContain('quota');
    expect(document.body.textContent).toContain('same browser'); expect(document.body.textContent).toContain('portable');
  });
  it('disables save while saving but keeps export available even when foreground changes', async () => {
    const { backend, workflow } = setup();
    let release!: () => void;
    vi.mocked(backend.put).mockReturnValueOnce(new Promise<void>(resolve => { release = resolve; }));
    button('Save project').click(); await tick();
    expect(button('Save project').disabled).toBe(true);
    expect(button('Import project file').disabled).toBe(true);
    expect(button('Export project').disabled).toBe(false);
    await workflow.export(); await tick();
    expect(button('Save project').disabled).toBe(true);
    release(); await vi.waitFor(() => expect(button('Save project').disabled).toBe(false));
  });
  it('blocks only save/export for unrepresented models and disables name without a document', () => {
    setup('This model cannot be represented.');
    expect(button('Save project').disabled).toBe(true); expect(button('Export project').disabled).toBe(true);
    expect(button('Import project file').disabled).toBe(false);
    expect(document.body.textContent).toContain('This model cannot be represented.');
  });
  it('has a disabled name and no save/export when the session is empty', () => {
    setup(null, true); expect(nameInput().disabled).toBe(true);
    expect(button('Save project').disabled).toBe(true); expect(button('Export project').disabled).toBe(true);
    expect(button('Import project file').disabled).toBe(false);
  });
  it('imports through the workflow and resets the picker for the same file, including failure', async () => {
    const { session, workflow } = setup(null, true);
    await tick();
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    expect(input.accept).toBe('.ccd.json,.json');
    button('Import project file').focus();
    const click = vi.spyOn(input, 'click'); button('Import project file').click(); expect(click).toHaveBeenCalledTimes(1);
    const imported = { size: 1, text: async () => encodeProject(projectDocument()) };
    Object.defineProperty(input, 'files', { configurable: true, value: [imported] });
    const reset = vi.spyOn(input, 'value', 'set');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(session.getDocument()?.id).toBe('project-cutter'));
    expect(reset).toHaveBeenCalledWith('');
    Object.defineProperty(input, 'files', { configurable: true, value: [{ size: 1, text: async () => 'broken' }] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(workflow.getState().error?.operation).toBe('import'));
    expect(reset.mock.calls.filter(([value]) => value === '').length).toBe(2);
    expect(document.querySelector('[role=alert]')).not.toBeNull();
  });
  it('renders migration warnings from the real workflow', async () => {
    const { workflow } = setup(null, true);
    await workflow.import({ size: 1, text: async () => JSON.stringify(legacy) }); await tick();
    expect(workflow.getState().warnings.length).toBeGreaterThan(0);
    for (const warning of workflow.getState().warnings) expect(document.body.textContent).toContain(warning);
  });
});
