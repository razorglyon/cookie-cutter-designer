import type { DesignDocumentV2 } from '../designDocument';
import { parseDesignDocumentV1, parseDesignDocumentV2 } from '../documentValidation';

/** Explicit promotion on first bridge edit; old files retain their V1 shape until edited. */
export function migrateV1ToV2(value: unknown): DesignDocumentV2 {
  const original = parseDesignDocumentV1(value);
  return parseDesignDocumentV2({ ...original, schemaVersion: 2, bridges: [] });
}
