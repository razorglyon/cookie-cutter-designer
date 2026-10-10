// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import legacyFixture from '../../domain/__fixtures__/document-v0.json';
import { DesignDocumentValidationError } from '../../domain/documentValidation';
import { decodeProject, encodeProject, PROJECT_FORMAT, ProjectCodecError } from '../projectCodec';
import {
  MAX_PROJECT_FILE_BYTES,
  createProjectFile,
  downloadProjectFile,
  projectFileName,
  readProjectFile
} from '../projectFiles';

const SVG = '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>';

function documentFixture() {
  return {
    schemaVersion: 1,
    id: 'file-stable-id',
    name: 'Étoile',
    kind: 'cutter',
    source: { type: 'svg', fileName: 'etoile.svg', svg: SVG },
    sketch: { svg: SVG, revision: 3 },
    parameters: {
      wallThickness: 1, cuttingHeight: 10, totalHeight: 20, taperAngle: 0,
      targetSize: 100, sizeMode: 'longest', handleStyle: 'none', handleHeight: 0,
      enableHandle: false, enableEmbossing: false, embossDepth: 0,
      buildPlateSize: 200, mode: 'cutter', stampDepth: 1, stampBase: false
    },
    viewport: { showGrid: true, showAxes: false, showWallThickness: true },
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z'
  };
}

function downloadSpies() {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:project-test');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return { create, revoke, click };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('fichiers projet : import strict', () => {
  it('fait un round-trip V1 via un Blob JSON sans mutation ni changement d’ID', async () => {
    const input = documentFixture();
    const before = structuredClone(input);
    const file = createProjectFile(input);
    expect(file.blob).toBeInstanceOf(Blob);
    expect(file.blob.type).toBe('application/json');
    expect(await file.blob.text()).toBe(encodeProject(input));
    expect(await readProjectFile(file.blob)).toEqual({ document: input, warnings: [] });
    expect(input).toEqual(before);
    expect(file.fileName).toBe('Etoile.ccd.json');
  });

  it('importe un vrai File, indépendamment de son nom et de son MIME', async () => {
    const input = documentFixture();
    const file = new File([encodeProject(input)], 'arbitrary.txt', { type: 'text/plain' });
    expect((await readProjectFile(file)).document).toEqual(input);
  });

  it('migre la fixture legacy existante et transmet les warnings et options', async () => {
    const json = JSON.stringify(legacyFixture);
    const createId = vi.fn(() => 'legacy-file-id');
    const decoded = await readProjectFile(new Blob([json]), { createId });
    expect(decoded).toEqual(decodeProject(json, { createId: () => 'legacy-file-id' }));
    expect(createId).toHaveBeenCalledOnce();
    expect(decoded.warnings.some((warning) => warning.includes('thumbnail'))).toBe(true);
    expect(decoded.warnings.some((warning) => warning.includes('notes'))).toBe(true);
  });

  it('rejette le JSON invalide par le codec', async () => {
    await expect(readProjectFile(new Blob(['{']))).rejects.toBeInstanceOf(ProjectCodecError);
    await expect(readProjectFile(new Blob(['{']))).rejects.toThrow('JSON invalide');
  });

  it('rejette une version future', async () => {
    const json = JSON.stringify({ format: PROJECT_FORMAT, version: 2, document: documentFixture() });
    await expect(readProjectFile(new Blob([json]))).rejects.toThrow('version future');
  });

  it('rejette les champs inconnus et un SVG actif sans insertion HTML', async () => {
    const envelope = JSON.parse(encodeProject(documentFixture())) as Record<string, unknown>;
    await expect(readProjectFile(new Blob([JSON.stringify({ ...envelope, object3D: {} })])))
      .rejects.toBeInstanceOf(ProjectCodecError);
    const input = documentFixture();
    input.source.svg = '<svg><script>alert(1)</script></svg>';
    await expect(readProjectFile(new Blob([JSON.stringify({ ...envelope, document: input })])))
      .rejects.toBeInstanceOf(DesignDocumentValidationError);
    expect(document.body.childElementCount).toBe(0);
  });

  it('accepte exactement 10 Mio et lit une seule fois', async () => {
    expect(MAX_PROJECT_FILE_BYTES).toBe(10 * 1024 * 1024);
    const json = encodeProject(documentFixture());
    const base = new Blob([json]);
    const blob = new Blob([json, ' '.repeat(MAX_PROJECT_FILE_BYTES - base.size)]);
    expect(blob.size).toBe(MAX_PROJECT_FILE_BYTES);
    const text = vi.spyOn(blob, 'text');
    expect((await readProjectFile(blob)).document.id).toBe('file-stable-id');
    expect(text).toHaveBeenCalledOnce();
  });

  it('rejette un octet au-dessus de la limite avant text()', async () => {
    const file = new Blob([' '.repeat(MAX_PROJECT_FILE_BYTES + 1)]);
    const text = vi.spyOn(file, 'text').mockRejectedValue(new Error('ne doit pas lire'));
    await expect(readProjectFile(file)).rejects.toThrow(/taille|10 Mio/);
    expect(text).not.toHaveBeenCalled();
  });

  it('propage un échec de lecture sans le masquer', async () => {
    const error = new Error('lecture impossible');
    const text = vi.fn().mockRejectedValue(error);
    await expect(readProjectFile({ size: 12, text })).rejects.toBe(error);
    expect(text).toHaveBeenCalledOnce();
  });
});

describe('fichiers projet : préparation sans DOM', () => {
  it('rejette un document invalide avant de créer un Blob', () => {
    const blob = vi.spyOn(globalThis, 'Blob');
    expect(() => createProjectFile({ ...documentFixture(), object3D: {} }))
      .toThrow(DesignDocumentValidationError);
    expect(blob).not.toHaveBeenCalled();
  });

  it('ne crée aucune URL ni aucun élément pendant la sérialisation', () => {
    const { create, revoke, click } = downloadSpies();
    const element = vi.spyOn(document, 'createElement');
    createProjectFile(documentFixture());
    expect(element).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it.each([
    ['Étoile du matin', 'Etoile-du-matin.ccd.json'],
    ['../../<img src=x onerror=alert(1)>\\evil\u0000', 'img-src-x-onerror-alert-1-evil.ccd.json'],
    ['.. / \\ <> : " | ? * \u202e', 'projet.ccd.json'],
    ['CON', 'projet-CON.ccd.json'],
    ['lpt1', 'projet-lpt1.ccd.json'],
    ['Déjà.ccd.json', 'Deja.ccd.json'],
    ['é'.repeat(200), `${'e'.repeat(100)}.ccd.json`]
  ])('normalise le nom %j en un nom sûr', (name, expected) => {
    expect(projectFileName(name)).toBe(expected);
    expect(projectFileName(name)).toMatch(/^[A-Za-z0-9_-]+\.ccd\.json$/);
  });
});

describe('fichiers projet : téléchargement et cleanup', () => {
  it('déclenche un anchor avec le Blob JSON validé et nettoie URL + DOM', async () => {
    const { create, revoke, click } = downloadSpies();
    let anchor: HTMLAnchorElement | undefined;
    click.mockImplementation(function (this: HTMLAnchorElement) {
      anchor = this;
      expect(this.isConnected).toBe(true);
      expect(this.href).toBe('blob:project-test');
      expect(this.download).toBe('Etoile.ccd.json');
      expect(this.innerHTML).toBe('');
    });
    downloadProjectFile(documentFixture());
    expect(create).toHaveBeenCalledOnce();
    const blob = create.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(await (blob as Blob).text()).toBe(encodeProject(documentFixture()));
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:project-test');
    expect(anchor?.isConnected).toBe(false);
    expect(document.body.childElementCount).toBe(0);
  });

  it('ne touche pas aux effets DOM/URL si la validation échoue', () => {
    const { create, revoke, click } = downloadSpies();
    const element = vi.spyOn(document, 'createElement');
    expect(() => downloadProjectFile({})).toThrow(DesignDocumentValidationError);
    expect(element).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it.each(['click', 'createElement', 'appendChild'] as const)(
    'révoque l’URL même si %s lève une exception', (stage) => {
      const { create, revoke, click } = downloadSpies();
      const error = new Error(`échec ${stage}`);
      if (stage === 'click') click.mockImplementation(() => { throw error; });
      if (stage === 'createElement') vi.spyOn(document, 'createElement').mockImplementation(() => { throw error; });
      if (stage === 'appendChild') vi.spyOn(document.body, 'appendChild').mockImplementation(() => { throw error; });
      expect(() => downloadProjectFile(documentFixture())).toThrow(error);
      expect(create).toHaveBeenCalledOnce();
      expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:project-test');
      expect(document.body.childElementCount).toBe(0);
    }
  );

  it('ne tente pas de révoquer une URL jamais créée', () => {
    const { create, revoke, click } = downloadSpies();
    const error = new Error('URL indisponible');
    create.mockImplementation(() => { throw error; });
    expect(() => downloadProjectFile(documentFixture())).toThrow(error);
    expect(revoke).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(document.body.childElementCount).toBe(0);
  });

  it('révoque même si le retrait de l’anchor échoue', () => {
    const { revoke } = downloadSpies();
    const error = new Error('retrait impossible');
    vi.spyOn(HTMLAnchorElement.prototype, 'remove').mockImplementation(() => { throw error; });
    expect(() => downloadProjectFile(documentFixture())).toThrow(error);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:project-test');
  });
});
