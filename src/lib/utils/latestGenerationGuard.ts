/**
 * Monotonic guard for async generation. A stale value is disposed immediately.
 */
export class LatestGenerationGuard<T> {
  private revision = 0;

  constructor(private readonly dispose: (value: T) => void) {}

  begin(): number {
    this.revision += 1;
    return this.revision;
  }

  invalidate(): void {
    this.revision += 1;
  }

  isCurrent(revision: number): boolean {
    return revision === this.revision;
  }

  accept(revision: number, value: T): boolean {
    if (this.isCurrent(revision)) return true;

    this.dispose(value);
    return false;
  }
}
