import type { DesignDocument } from '../domain/designDocument';
import type { DesignSessionStore } from '../stores/designSessionStore';

type Segment = { command: string; values: number[] };
export type SketchPoint = { x: number; y: number; segment: number; offset: number; control: boolean };
export type SketchPath = { points: SketchPoint[]; closed: boolean; linear: boolean; reason: string | null; segments: Segment[] };
export type SketchCommand = { path: number } & (
  | { type: 'move'; point: number; x: number; y: number }
  | { type: 'add' | 'delete'; point: number }
  | { type: 'close' | 'mirror' | 'rotate' }
);

function parseSvg(svg: string): XMLDocument {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid SVG.');
  return doc;
}

/** Deliberately bounded grammar. Unsupported commands remain in the original SVG,
 * never sampled into polygons. Relative supported coordinates become absolute
 * only when this particular path is edited. */
function parsePath(element: Element): SketchPath {
  const locked = (reason: string): SketchPath => ({ points: [], closed: false, linear: false, reason, segments: [] });
  for (let parent: Element | null = element; parent; parent = parent.parentElement) {
    if (parent.hasAttribute('transform') || parent.hasAttribute('style') || parent.localName === 'defs'
      || (parent.localName === 'svg' && parent !== element.ownerDocument.documentElement)) {
      return locked('Transforms, styles and referenced geometry are preserved; point editing is unavailable.');
    }
  }
  if (element.ownerDocument.querySelector('style') || element.hasAttribute('class')) return locked('Stylesheet-dependent geometry is preserved (read-only).');
  const d = element.getAttribute('d') ?? '';
  const tokenPattern = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
  const tokens = d.match(tokenPattern) ?? [];
  if (d.replace(tokenPattern, '').replace(/[\s,]/g, '') || !tokens.length) return locked('Invalid path preserved.');
  const counts: Record<string, number> = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };
  const segments: Segment[] = []; const points: SketchPoint[] = [];
  let index = 0, command = '', x = 0, y = 0, startX = 0, startY = 0;
  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
    const upper = command.toUpperCase();
    if (!(upper in counts)) return locked('Only M/L/C/Q/Z paths are editable. Other commands are preserved without conversion.');
    if (!segments.length && upper !== 'M') return locked('Path must start with M.');
    const count = counts[upper];
    if (upper === 'Z') {
      segments.push({ command: upper, values: [] }); x = startX; y = startY; command = ''; continue;
    }
    const values = tokens.slice(index, index + count).map(Number);
    if (values.length !== count || values.some(value => !Number.isFinite(value))) return locked('Invalid coordinates preserved.');
    index += count;
    for (let offset = 0; offset < count; offset += 2) {
      if (command !== upper) { values[offset] += x; values[offset + 1] += y; }
      points.push({ x: values[offset], y: values[offset + 1], segment: segments.length, offset, control: offset < count - 2 });
    }
    x = values[count - 2]; y = values[count - 1];
    if (upper === 'M') { startX = x; startY = y; }
    segments.push({ command: upper, values });
    if (upper === 'M') command = command === upper ? 'L' : 'l';
  }
  return { points, segments, closed: segments.at(-1)?.command === 'Z', linear: segments.every(s => ['M', 'L', 'Z'].includes(s.command)), reason: null };
}

export function inspectSketch(svg: string): { paths: SketchPath[]; viewBox: string; notices: string[] } {
  const doc = parseSvg(svg); const root = doc.documentElement;
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const validBox = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0;
  const paths = Array.from(doc.querySelectorAll('path')).map(parsePath);
  if (!validBox) for (const path of paths) path.reason = 'A valid viewBox is required for point editing; SVG preserved.';
  const notices = [...new Set(paths.flatMap(path => path.reason ? [path.reason] : []))];
  if (doc.querySelector('circle,ellipse,rect,polygon,polyline,line,text,use,image')) notices.push('Other SVG shapes remain intact; this workshop edits paths only.');
  return { paths, viewBox: validBox ? box.join(' ') : '0 0 100 100', notices };
}

export function editSketch(svg: string, command: SketchCommand): string {
  const model = inspectSketch(svg); const path = model.paths[command.path];
  if (!path || path.reason) throw new Error(path?.reason ?? 'Select an editable path.');
  const segments = path.segments;
  const point = 'point' in command ? path.points[command.point] : undefined;
  if ('point' in command && !point) throw new Error('Select a point.');
  if (command.type === 'move' && point) {
    if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) throw new Error('Coordinates must be finite.');
    if (point.x === command.x && point.y === command.y) return svg;
    segments[point.segment].values[point.offset] = command.x;
    segments[point.segment].values[point.offset + 1] = command.y;
  } else if (command.type === 'add' || command.type === 'delete' || command.type === 'close') {
    // Topology commands are restricted to a single linear contour; no implicit
    // deletion of Bézier handles or neighbouring holes/subpaths.
    if (!path.linear || segments.filter(s => s.command === 'M').length !== 1) throw new Error('Add/delete/close require a single linear contour. Curves and subpaths are preserved.');
    if (command.type === 'close') {
      if (path.closed) return svg;
      if (path.points.length < 3) throw new Error('A contour needs at least three points.');
      segments.push({ command: 'Z', values: [] });
    } else if (point && command.type === 'delete') {
      if (path.points.length <= 3) throw new Error('Keep at least three points.');
      segments.splice(point.segment, 1); segments[0].command = 'M';
    } else if (point && command.type === 'add') {
      const next = path.points[command.point + 1] ?? (path.closed ? path.points[0] : undefined);
      if (!next) throw new Error('Select a point before a segment, not the open endpoint.');
      segments.splice(point.segment + 1, 0, { command: 'L', values: [(point.x + next.x) / 2, (point.y + next.y) / 2] });
    }
  } else if (command.type === 'mirror' || command.type === 'rotate') {
    const [minX, minY, width, height] = model.viewBox.split(' ').map(Number);
    const cx = minX + width / 2, cy = minY + height / 2;
    for (const segment of segments) for (let i = 0; i < segment.values.length; i += 2) {
      const x = segment.values[i], y = segment.values[i + 1];
      segment.values[i] = command.type === 'mirror' ? 2 * cx - x : cx - (y - cy);
      segment.values[i + 1] = command.type === 'mirror' ? y : cy + (x - cx);
    }
  }
  const doc = parseSvg(svg);
  doc.querySelectorAll('path')[command.path].setAttribute('d', segments.map(s => s.command + s.values.join(' ')).join(' '));
  return new XMLSerializer().serializeToString(doc);
}

/** Exact snapshot + epoch guard prevents a draft gesture from crossing projects,
 * history restoration or another edit. Only one canonical mutation per gesture. */
export function commitSketch(session: DesignSessionStore, baseline: DesignDocument, epoch: number, svg: string): boolean {
  if (session.getSessionEpoch() !== epoch || session.getDocument() !== baseline || baseline.sketch.svg === svg) return false;
  session.updateSketch(svg); return true;
}
