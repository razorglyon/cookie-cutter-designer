export class DesignDocumentValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'DesignDocumentValidationError';
    this.path = path;
  }
}