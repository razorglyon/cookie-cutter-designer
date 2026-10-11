import { describe, expect, it } from 'vitest';
import { createDefaultCutterParameters } from '../../domain/designParameters';
import type { Bridge, DesignDocumentV1 } from '../../domain/designDocument';
import { createDesignSessionStore } from '../../stores/designSessionStore';
import { createProjectStorage, type ProjectRecordBackend } from '../projectStorage';
import { createProjectWorkflow } from '../projectWorkflow';
import { decodeProject, encodeProject } from '../projectCodec';
import { parseProjectRecoveryEnvelope } from '../projectRecoveryStorage';

const svg = '<svg viewBox="0 0 100 100"><path d="M0 0 L100 0 L100 100 L0 100 Z"/><path d="M35 35 L65 35 L65 65 L35 65 Z"/></svg>';
const bridge: Bridge = { id: 'one', from: { x: 0, y: 50 }, to: { x: 35, y: 50 }, widthMm: 2 };
function initial(): DesignDocumentV1<'cutter'> {
  return { schemaVersion: 1, id: 'bridge-project', name: 'With island', kind: 'cutter', source: { type: 'svg', fileName: 'island.svg', svg },
    sketch: { svg, revision: 0 }, parameters: createDefaultCutterParameters(), viewport: { showGrid: true, showAxes: false, showWallThickness: false },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
}

describe('bridge document persistence and history', () => {
  it('saves V2, reopens it, restores V1/V2 with undo-redo, and preserves the bridge in recovery', async () => {
    const records = new Map<string, unknown>();
    const backend: ProjectRecordBackend = {
      put: async value => { records.set(value.id, structuredClone(value)); },
      get: async id => records.get(id), getAll: async () => [...records.values()],
      delete: async id => { records.delete(id); }
    };
    const session = createDesignSessionStore(initial());
    const workflow = createProjectWorkflow({ session, storage: createProjectStorage(backend), confirmDiscard: async () => 'discard' });
    try {
      const before = session.getDocument()!, epoch = session.getSessionEpoch();
      session.updateBridges([bridge]);
      const added = session.getDocument()!;
      expect(added).toMatchObject({ schemaVersion: 2, bridges: [bridge] });
      if (added.schemaVersion !== 2) throw new Error('V2 required');
      expect(Object.isFrozen(added.bridges)).toBe(true);
      expect(Object.isFrozen(added.bridges[0].from)).toBe(true);
      expect(workflow.getState().dirty).toBe(true);
      session.restoreHistory(before, epoch);
      expect(session.getDocument()).toEqual(before);
      session.restoreHistory(added, epoch);
      expect(session.getDocument()).toEqual(added);
      expect(await workflow.save()).toBe(true);
      expect(workflow.getState().dirty).toBe(false);
      const encoded = encodeProject(records.get('bridge-project'));
      expect(decodeProject(encoded).document).toEqual(added);
      expect(JSON.parse(encoded).version).toBe(2);
      session.updateBridges([]);
      expect(workflow.getState().dirty).toBe(true);
      expect(await workflow.open('bridge-project')).toBe(true);
      expect(session.getDocument()).toEqual(added);
      expect(workflow.getState().dirty).toBe(false);
      const recovered = parseProjectRecoveryEnvelope({ format: 'cookie-cutter-designer-recovery', version: 1,
        draftId: 'a0a00000-0000-4000-8000-000000000001', savedAt: '2026-01-01T00:00:00.000Z', document: added });
      expect(recovered.document).toEqual(added);
      expect(Object.isFrozen(recovered.document)).toBe(true);
    } finally { await workflow.dispose(); }
  });
});
