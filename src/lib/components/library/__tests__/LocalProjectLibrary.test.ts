// @vitest-environment happy-dom
import { mount, unmount, tick } from 'svelte';
import { fromStore, writable } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LocalProjectLibrary from '../LocalProjectLibrary.svelte';
import type { DesignDocument } from '../../../domain/designDocument';
import { createDesignSessionStore } from '../../../stores/designSessionStore';
import { createProjectWorkflow, type ProjectWorkflowOptions } from '../../../projects/projectWorkflow';
import { createProjectStorage, type ProjectRecordBackend } from '../../../projects/projectStorage';
import { projectDocument } from '../../../projects/__tests__/projectFixtures';

let component: ReturnType<typeof mount> | undefined;
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.innerHTML = ''; });
function setup(confirm?: (document: DesignDocument) => Promise<boolean>, options: Partial<ProjectWorkflowOptions> = {}) {
  const doc = { ...projectDocument(), name: '<b>Cookie "A"</b>' };
  const records = new Map<string, DesignDocument>([[doc.id, doc]]);
  const backend: ProjectRecordBackend = {
    put: vi.fn(async doc => { records.set(doc.id, doc); }), get: vi.fn(async id => records.get(id)),
    getAll: vi.fn(async () => [...records.values()]), delete: vi.fn(async id => { records.delete(id); })
  };
  const session = createDesignSessionStore();
  const workflow = createProjectWorkflow({ session, storage: createProjectStorage(backend), ...options });
  const target = document.createElement('div'); document.body.appendChild(target);
  const workflowInput = writable(workflow);
  const workflowOwner = fromStore(workflowInput);
  const props = { get workflow() { return workflowOwner.current; }, ...(confirm ? { onConfirmDelete: confirm } : {}) };
  component = mount(LocalProjectLibrary, { target, props });
  return { backend, session, workflow, workflowInput, doc, records };
}
function button(name: string) {
  const found = [...document.querySelectorAll('button')].find(node => (node.getAttribute('aria-label') ?? node.textContent?.trim()) === name);
  if (!found) throw new Error(`Missing button ${name}`);
  return found;
}
async function loaded() { await vi.waitFor(() => expect(document.querySelectorAll('li').length).toBe(1)); }

describe('LocalProjectLibrary', () => {
  it('loads on mount and renders escaped names, kind, dates and contextual native buttons', async () => {
    const { backend, doc, session } = setup(); await loaded();
    expect(backend.getAll).toHaveBeenCalledTimes(1);
    const row = document.querySelector('li')!;
    expect(row.textContent).toContain(doc.name); expect(row.querySelector('b')).toBeNull();
    expect(row.textContent).toContain('cutter');
    expect(row.querySelector('time')?.getAttribute('datetime')).toBe(doc.updatedAt);
    const open = button(`Ouvrir ${doc.name}`); expect(open.type).toBe('button'); open.focus();
    expect(document.activeElement).toBe(open); open.click();
    await vi.waitFor(() => expect(session.getDocument()?.name).toBe(doc.name));
  });
  it('never bypasses workflow discard or representability guards', async () => {
    const confirmDiscard = vi.fn(async () => 'cancel' as const);
    const { session, doc } = setup(undefined, { confirmDiscard }); await loaded();
    session.replace(projectDocument('stamp')); await tick(); button(`Ouvrir ${doc.name}`).click();
    await vi.waitFor(() => expect(confirmDiscard).toHaveBeenCalledTimes(1));
    expect(session.getDocument()?.kind).toBe('stamp');
  });
  it('reports open representability failures without replacing the session', async () => {
    const { doc, session } = setup(undefined, { assertRepresentable: () => { throw new Error('Unsupported model'); } });
    await loaded(); button(`Ouvrir ${doc.name}`).click();
    await vi.waitFor(() => expect(document.querySelector('[role=alert]')?.textContent).toContain('Unsupported model'));
    expect(session.getDocument()).toBeNull();
  });
  it('distinguishes list failure from an empty library and supports an explicit retry', async () => {
    const { backend, records } = setup();
    vi.mocked(backend.getAll).mockRejectedValueOnce(new Error('library unavailable'));
    await vi.waitFor(() => expect(document.querySelector('[role=alert]')?.textContent).toContain('library unavailable'));
    expect(document.body.textContent).not.toContain('Aucun projet local');
    records.clear(); button('Actualiser les projets locaux').click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Aucun projet local'));
    expect(document.querySelector('[role=alert]')).toBeNull();
  });
  it('defaults deletion to cancellation without native dialogs', async () => {
    const { backend, doc } = setup(); await loaded(); button(`Supprimer ${doc.name}`).click(); await tick();
    expect(backend.delete).not.toHaveBeenCalled(); expect(document.querySelectorAll('li')).toHaveLength(1);
  });
  it('awaits injected confirmation, locks actions while pending and preserves cancellation', async () => {
    let confirm!: (value: boolean) => void;
    const onConfirmDelete = vi.fn(() => new Promise<boolean>(resolve => { confirm = resolve; }));
    const { backend, doc } = setup(onConfirmDelete); await loaded();
    button(`Supprimer ${doc.name}`).click(); await tick();
    expect(onConfirmDelete).toHaveBeenCalledWith(doc);
    expect(button(`Ouvrir ${doc.name}`).disabled).toBe(true); expect(button(`Supprimer ${doc.name}`).disabled).toBe(true);
    confirm(false); await vi.waitFor(() => expect(button(`Supprimer ${doc.name}`).disabled).toBe(false));
    expect(backend.delete).not.toHaveBeenCalled();
    button(`Supprimer ${doc.name}`).click(); await tick(); confirm(true);
    await vi.waitFor(() => expect(document.body.textContent).toContain('Aucun projet local'));
    expect(backend.delete).toHaveBeenCalledWith(doc.id);
    expect(document.activeElement).toBe(button('Actualiser les projets locaux'));
  });
  it('reports delete failures, retains rows and recovers from callback rejection', async () => {
    const onConfirmDelete = vi.fn(async () => true);
    const { backend, doc } = setup(onConfirmDelete); await loaded();
    onConfirmDelete.mockRejectedValueOnce(new Error('Dialog failed'));
    button(`Supprimer ${doc.name}`).click();
    await vi.waitFor(() => expect(document.querySelector('[role=alert]')?.textContent).toContain('Dialog failed'));
    expect(button(`Supprimer ${doc.name}`).disabled).toBe(false);
    vi.mocked(backend.delete).mockRejectedValueOnce(new Error('delete denied')); button(`Supprimer ${doc.name}`).click();
    await vi.waitFor(() => expect(document.querySelector('[role=alert]')?.textContent).toContain('delete denied'));
    expect(document.querySelectorAll('li')).toHaveLength(1);
  });
  for (const mode of ['double click', 'callback reentry'] as const) {
    it(`starts only one confirmation during synchronous ${mode}`, async () => {
      let resolve!: (confirmed: boolean) => void;
      const confirmation = new Promise<boolean>(done => { resolve = done; });
      let reentered = false;
      let trigger: HTMLButtonElement;
      const confirm = vi.fn(() => {
        if (mode === 'callback reentry' && !reentered) {
          reentered = true;
          trigger.click();
        }
        return confirmation;
      });
      const { backend, doc } = setup(confirm);
      await loaded();
      trigger = button(`Supprimer ${doc.name}`);
      trigger.click();
      if (mode === 'double click') trigger.click();
      resolve(false);
      await confirmation;
      await vi.waitFor(() => expect(trigger.disabled).toBe(false));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(backend.delete).not.toHaveBeenCalled();
    });
  }
  it('ignores a confirmed deletion after unmount without disposing the shared workflow', async () => {
    let resolve!: (confirmed: boolean) => void;
    const confirmation = new Promise<boolean>(done => { resolve = done; });
    const { workflow, backend, doc } = setup(() => confirmation);
    await loaded();
    const deletion = vi.spyOn(workflow, 'delete');
    button(`Supprimer ${doc.name}`).click();
    await tick();
    await unmount(component!);
    component = undefined;
    resolve(true);
    await confirmation;
    await tick();
    expect(deletion).not.toHaveBeenCalled();
    expect(backend.delete).not.toHaveBeenCalled();
    expect(workflow.getState().disposed).toBe(false);
  });
  for (const outcome of ['confirm', 'reject'] as const) {
    it(`ignores an old ${outcome} after workflow replacement and unlocks the current library`, async () => {
      let resolve!: (confirmed: boolean) => void;
      let reject!: (error: Error) => void;
      const confirmation = new Promise<boolean>((yes, no) => { resolve = yes; reject = no; });
      const h = setup(() => confirmation);
      await loaded();
      const deletion = vi.spyOn(h.workflow, 'delete');
      button(`Supprimer ${h.doc.name}`).click();
      await tick();
      const next = createProjectWorkflow({ session: createDesignSessionStore(), storage: createProjectStorage(h.backend) });
      await next.list();
      h.workflowInput.set(next);
      await tick();
      const unlockedAfterReplacement = !button(`Supprimer ${h.doc.name}`).disabled;
      if (outcome === 'confirm') resolve(true);
      else reject(new Error('Obsolete dialog failure'));
      await confirmation.catch(() => undefined);
      await tick();
      expect(deletion).not.toHaveBeenCalled();
      expect(h.backend.delete).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain('Obsolete dialog failure');
      expect(unlockedAfterReplacement).toBe(true);
      expect(button(`Supprimer ${h.doc.name}`).disabled).toBe(false);
    });
  }
  it('disables row actions during workflow pending operations and shows initial loading', async () => {
    const { workflow, doc } = setup();
    expect(document.body.textContent).not.toContain('Aucun projet local'); await loaded();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const importing = workflow.import({ size: 1, text: async () => { await gate; return 'invalid'; } }); await tick();
    expect(button(`Ouvrir ${doc.name}`).disabled).toBe(true); expect(button(`Supprimer ${doc.name}`).disabled).toBe(true);
    release(); await importing; await tick(); expect(button(`Ouvrir ${doc.name}`).disabled).toBe(false);
  });
  it('exposes explicit refresh without reacting in a list/subscription loop', async () => {
    const { backend, workflow, session } = setup(); await loaded();
    session.replace(projectDocument('stamp')); await workflow.save(); await tick();
    expect(backend.getAll).toHaveBeenCalledTimes(1);
    button('Actualiser les projets locaux').click();
    await vi.waitFor(() => expect(document.querySelectorAll('li')).toHaveLength(2));
    expect(backend.getAll).toHaveBeenCalledTimes(2);
  });
});
