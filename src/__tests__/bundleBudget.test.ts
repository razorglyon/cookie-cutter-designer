import { describe, expect, it } from 'vitest';
import config from '../../vite.config';
import type { Plugin } from 'vite';

const plugins = config.plugins as Plugin[];
const budget = plugins.find(plugin => plugin.name === 'bundle-budget')!;
const hook = budget.generateBundle as { order: string; handler: Function };

function check(code: string, isEntry: boolean) {
  hook.handler.call({ error(message: string) { throw new Error(message); } }, {}, {
    'test.js': { type: 'chunk', fileName: 'test.js', code, isEntry }
  });
}

describe('final bundle budgets', () => {
  it('checks after preload rewriting', () => {
    expect(hook.order).toBe('post');
  });
  it('preserves the 200 KiB entry and 600 KiB chunk limits', () => {
    expect(() => check('x'.repeat(200 * 1024), true)).not.toThrow();
    expect(() => check('x'.repeat(200 * 1024 + 1), true)).toThrow('budget is 200 KiB');
    expect(() => check('x'.repeat(600 * 1024), false)).not.toThrow();
    expect(() => check('x'.repeat(600 * 1024 + 1), false)).toThrow('budget is 600 KiB');
  });
  it('counts UTF-8 bytes rather than string length', () => {
    expect(() => check('é'.repeat(110 * 1024), true)).toThrow('budget is 200 KiB');
  });
});
