import type { MigrationV0ToV1Options } from '../domain/migrations/v0ToV1';
import {
  decodeProject,
  encodeProject,
  type DecodedProject,
  type ProjectEnvelopeV1
} from './projectCodec';

export const MAX_PROJECT_FILE_BYTES = 10 * 1024 * 1024;

export interface ProjectFile {
  readonly blob: Blob;
  readonly fileName: string;
}

/** Le nom et le MIME du fichier ne sont pas des preuves de validité. */
export async function readProjectFile(
  file: Pick<Blob, 'size' | 'text'>,
  options: MigrationV0ToV1Options = {}
): Promise<DecodedProject> {
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    throw new RangeError('La taille du fichier projet dépasse la limite de 10 Mio.');
  }
  return decodeProject(await file.text(), options);
}

/** Basename ASCII borné, sans chemins, caractères de contrôle ou noms Windows réservés. */
export function projectFileName(name: string): string {
  let stem = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.ccd\.json$/i, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');

  if (stem.length === 0) {
    stem = 'projet';
  }
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem)) {
    stem = `projet-${stem}`;
  }
  return `${stem}.ccd.json`;
}

/** Préparation validée et sans effets DOM ; aucun SVG n’est interprété comme HTML. */
export function createProjectFile(document: unknown): ProjectFile {
  const json = encodeProject(document);
  // Le JSON vient exclusivement du codec : prendre le nom de ce snapshot validé.
  const envelope = JSON.parse(json) as ProjectEnvelopeV1;
  return {
    blob: new Blob([json], { type: 'application/json' }),
    fileName: projectFileName(envelope.document.name)
  };
}

/** Le contrôleur reste propriétaire de la confirmation et des collisions d’ID. */
export function downloadProjectFile(value: unknown): void {
  const file = createProjectFile(value);
  const url = URL.createObjectURL(file.blob);
  let anchor: HTMLAnchorElement | undefined;
  try {
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.fileName;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    try {
      anchor?.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
