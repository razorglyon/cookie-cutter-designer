// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { inspectSketch, editSketch, commitSketch } from '../sketchCommands';
import { createDesignSessionStore } from '../../stores/designSessionStore';
import { createDesignDocument } from '../../projects/createDesignDocument';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 80"><path id="curve" d="M20 30 c10 0 10 20 20 20 L60 30 Z"/><path d="M25 35 L30 35 L30 40 Z"/><g transform="translate(2 3)"><path d="M0 0 L5 0 L5 5 Z"/></g><circle cx="50" cy="50" r="2"/></svg>';
describe('safe sketch commands', () => {
 it('opening is read-only and identifies preserved unsupported geometry', () => {
  const model = inspectSketch(svg); expect(model.paths).toHaveLength(3);
  expect(model.paths[0].points).toHaveLength(5); expect(model.paths[2].reason).toMatch(/transform/i);
  expect(model.notices.length).toBeGreaterThan(0); expect(svg).toContain('c10 0');
 });
 it('moves one control point preserving curves, holes, transforms and viewBox', () => {
  const next = editSketch(svg, { type: 'move', path: 0, point: 1, x: 32, y: 30 });
  const doc = new DOMParser().parseFromString(next, 'image/svg+xml');
  expect(doc.querySelector('#curve')?.getAttribute('d')).toContain('C32 30 30 50 40 50');
  expect(doc.querySelectorAll('path')[1].getAttribute('d')).toBe('M25 35 L30 35 L30 40 Z');
  expect(doc.querySelector('g')?.getAttribute('transform')).toBe('translate(2 3)');
  expect(doc.documentElement.getAttribute('viewBox')).toBe('10 20 100 80'); expect(doc.querySelector('circle')).not.toBeNull();
 });
 it('adds, deletes, closes and transforms a linear contour without touching siblings', () => {
  const input = '<svg viewBox="0 0 100 100"><path d="M10 10 L90 10 L90 90"/><path d="M1 1 L2 1 L2 2 Z"/></svg>';
  let next = editSketch(input, { type: 'add', path: 0, point: 0 });
  expect(inspectSketch(next).paths[0].points).toHaveLength(4);
  next = editSketch(next, { type: 'delete', path: 0, point: 1 });
  next = editSketch(next, { type: 'close', path: 0 });
  expect(inspectSketch(next).paths[0].closed).toBe(true);
  next = editSketch(next, { type: 'mirror', path: 0 });
  expect(inspectSketch(next).paths[0].points[0].x).toBe(90);
  next = editSketch(next, { type: 'rotate', path: 0 });
  expect(inspectSketch(next).paths[0].points[0]).toMatchObject({ x: 90, y: 90 });
 });
 it('refuses unsupported edits and curve topology changes instead of flattening', () => {
  expect(() => editSketch(svg, { type: 'delete', path: 0, point: 1 })).toThrow();
  expect(() => editSketch(svg, { type: 'move', path: 2, point: 0, x: 1, y: 1 })).toThrow();
  for (const d of ['M0 0 A10 10 0 0 0 20 20', 'M0 0 S1 2 3 4', 'garbage']) {
   expect(inspectSketch(`<svg viewBox="0 0 100 100"><path d="${d}"/></svg>`).paths[0].reason).toBeTruthy();
  }
 });
 it('does not rewrite a no-op and locks stylesheet-dependent geometry', () => {
  expect(editSketch(svg, { type: 'move', path: 0, point: 0, x: 20, y: 30 })).toBe(svg);
  const styled = '<svg viewBox="0 0 100 100"><style>path { transform: translate(10px); }</style><path d="M0 0 L10 0 L10 10 Z"/></svg>';
  expect(inspectSketch(styled).paths[0].reason).toBeTruthy();
 });
 it('commits once to the same session only, preserving source and metadata', () => {
  const original = createDesignDocument({ name: 'Original', kind: 'cutter', source: { type: 'svg', fileName: 'original.svg', svg } });
  const session = createDesignSessionStore(original); const baseline = session.getDocument()!;
  const epoch = session.getSessionEpoch(); const next = editSketch(svg, { type: 'move', path: 0, point: 0, x: 21, y: 31 });
  expect(commitSketch(session, baseline, epoch, next)).toBe(true);
  const current = session.getDocument()!; expect(current.source).toEqual(baseline.source); expect(current.id).toBe(baseline.id);
  expect(current.name).toBe(baseline.name); expect(current.parameters).toEqual(baseline.parameters); expect(current.sketch.revision).toBe(baseline.sketch.revision + 1);
  expect(commitSketch(session, baseline, epoch, next)).toBe(false);
  session.replace(original); expect(commitSketch(session, baseline, epoch, next)).toBe(false);
 });
});
