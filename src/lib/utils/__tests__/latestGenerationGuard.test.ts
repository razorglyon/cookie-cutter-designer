import { describe, expect, it, vi } from 'vitest';
import { LatestGenerationGuard } from '../latestGenerationGuard';

describe('LatestGenerationGuard', () => {
  it('accepts only the newest revision and disposes stale values', () => {
    const dispose = vi.fn();
    const guard = new LatestGenerationGuard<object>(dispose);
    const first = guard.begin();
    const second = guard.begin();
    const staleValue = {};
    const currentValue = {};

    expect(guard.accept(second, currentValue)).toBe(true);
    expect(guard.accept(first, staleValue)).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose.mock.calls[0][0]).toBe(staleValue);
    expect(dispose.mock.calls[0][0]).not.toBe(currentValue);
  });

  it('invalidates an in-flight revision without producing a value', () => {
    const guard = new LatestGenerationGuard<object>(vi.fn());
    const revision = guard.begin();

    guard.invalidate();

    expect(guard.isCurrent(revision)).toBe(false);
  });
});
