import { ALIGN_TOL, LINE_TOL, NO_SPACE_MAX, WORD_GAP_MAX } from '../constants';
import type { Fragment, Line, Pt, Span } from '../types';

export type GapKind = 'none' | 'space' | 'fragment';

/** A fragment boundary is a tab stop, a column edge or a cell edge — never a run of spaces. */
const FRAGMENT_SEP = '\t';
/** §4.6: tab-column gap starts agree within 3 pt. */
const TAB_ALIGN: Pt = 3;

const rightEdge = (span: Span): Pt => span.x + span.w;
const isInk = (span: Span): boolean => !span.synthetic && span.text.trim().length > 0;
const weigh = (span: Span): number => Math.max(1, span.text.trim().length);

function gapKind(a: Span, b: Span, justified: boolean, fallbackSize: Pt): GapKind {
  const size = Math.max(a.size, b.size) || fallbackSize;
  const gn = size > 0 ? (b.x - rightEdge(a)) / size : 0;
  if (gn < NO_SPACE_MAX) return 'none';
  if (justified || gn < WORD_GAP_MAX) return 'space';
  return 'fragment';
}

export function classifyGap(a: Span, b: Span, justified: boolean): GapKind {
  return gapKind(a, b, justified, 0);
}

interface Piece {
  spans: Span[];
  /** Parallel to spans: the span's own text plus whatever separator follows it. */
  texts: string[];
}

/** The one separator walk; splitFragments and fragmentRunTexts must agree exactly. */
function walk(spans: readonly Span[], bodySize: Pt, justified: boolean): Piece[] {
  const pieces: Piece[] = [];
  let current: Piece = { spans: [], texts: [] };
  let previous: Span | null = null;
  let pending: Span[] = [];

  const flush = (): void => {
    if (current.spans.length > 0) pieces.push(current);
    current = { spans: [], texts: [] };
  };

  const appendSpace = (): void => {
    const last = current.texts.length - 1;
    if (last < 0 || /\s$/.test(current.texts[last])) return;
    current.texts[last] += ' ';
  };

  for (const span of spans) {
    // pdf.js invents these for a gap it has already judged to be whitespace.
    if (span.synthetic) {
      if (previous) pending.push(span);
      continue;
    }
    if (span.text.length === 0) continue;

    if (previous) {
      const kind = gapKind(previous, span, justified, bodySize);
      if (kind === 'fragment') {
        flush();
      } else {
        const synthetic = pending.length > 0;
        for (const held of pending) {
          current.spans.push(held);
          current.texts.push('');
        }
        if (kind === 'space' || synthetic) appendSpace();
      }
      pending = [];
    }

    current.spans.push(span);
    current.texts.push(span.text);
    previous = span;
  }

  flush();
  return pieces;
}

function toFragment(piece: Piece): Fragment {
  const ink = piece.spans.filter(isInk);
  const measured = ink.length > 0 ? ink : piece.spans;
  return {
    x0: Math.min(...measured.map((span) => span.x)),
    x1: Math.max(...measured.map(rightEdge)),
    spans: piece.spans,
    text: piece.texts.join(''),
  };
}

export function splitFragments(line: Line, bodySize: Pt, justified = false): Fragment[] {
  return walk(line.spans, bodySize, justified)
    .filter((piece) => piece.spans.some(isInk))
    .map(toFragment);
}

/** Per-span text with its trailing separator folded in; join('') === fragment.text. */
export function fragmentRunTexts(fragment: Fragment, bodySize: Pt, justified = false): string[] {
  return walk(fragment.spans, bodySize, justified).flatMap((piece) => piece.texts);
}

function weightedMedian(spans: readonly Span[], pick: (span: Span) => number): number {
  const rows = spans
    .map((span) => ({ value: pick(span), weight: weigh(span) }))
    .sort((a, b) => a.value - b.value);
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  let seen = 0;
  for (const row of rows) {
    seen += row.weight;
    if (seen * 2 >= total) return row.value;
  }
  return rows.length > 0 ? rows[rows.length - 1].value : 0;
}

function modalSize(spans: readonly Span[]): Pt {
  const tally = new Map<number, number>();
  for (const span of spans) {
    const size = Math.round(span.size * 100) / 100;
    tally.set(size, (tally.get(size) ?? 0) + weigh(span));
  }
  let best = 0;
  let bestWeight = -1;
  for (const [size, weight] of tally) {
    if (weight > bestWeight || (weight === bestWeight && size > best)) {
      best = size;
      bestWeight = weight;
    }
  }
  return best;
}

const lineText = (fragments: readonly Fragment[]): string =>
  fragments.map((fragment) => fragment.text).join(FRAGMENT_SEP);

export function buildLines(spans: readonly Span[], bodySize: Pt, column = 0): Line[] {
  const ordered = spans.map((span, index) => ({ span, index }));
  ordered.sort((a, b) => a.span.y - b.span.y || a.span.x - b.span.x || a.index - b.index);

  const tol = LINE_TOL(bodySize);
  const groups: { span: Span; index: number }[][] = [];
  let anchor = 0;
  for (const entry of ordered) {
    const last = groups[groups.length - 1];
    if (!last || Math.abs(entry.span.y - anchor) > tol) {
      groups.push([entry]);
      anchor = entry.span.y;
    } else {
      last.push(entry);
    }
  }

  const lines: Line[] = [];
  for (const group of groups) {
    group.sort((a, b) => a.span.x - b.span.x || a.index - b.index);
    const members = group.map((entry) => entry.span);
    const ink = members.filter(isInk);
    if (ink.length === 0) continue;

    const line: Line = {
      y: weightedMedian(ink, (span) => span.y),
      x0: Math.min(...ink.map((span) => span.x)),
      x1: Math.max(...ink.map(rightEdge)),
      size: modalSize(ink),
      spans: members,
      fragments: [],
      text: '',
      column,
    };
    line.fragments = splitFragments(line, bodySize);
    line.text = lineText(line.fragments);
    lines.push(line);
  }
  return lines;
}

function shareRatio(values: readonly Pt[]): number {
  if (values.length === 0) return 0;
  let best = 0;
  for (const value of values) {
    const shared = values.filter((other) => Math.abs(other - value) <= ALIGN_TOL).length;
    if (shared > best) best = shared;
  }
  return best / values.length;
}

/** §4.3: a justified block's wide gaps are word spaces, so the tab threshold must not apply. */
export function isJustified(lines: readonly Line[]): boolean {
  if (lines.length < 3) return false;
  const body = lines.slice(0, -1);
  return (
    shareRatio(body.map((line) => line.x1)) >= 0.8 &&
    shareRatio(body.map((line) => line.x0)) >= 0.8
  );
}

/** §4.6: the same boundary on 3 consecutive lines is a tab table, whose right edge also aligns. */
export function hasTabColumns(lines: readonly Line[]): boolean {
  let run = 0;
  let shared: Pt[] = [];
  for (const line of lines) {
    const stops = line.fragments.slice(1).map((fragment) => fragment.x0);
    const kept =
      run === 0
        ? stops
        : shared.filter((stop) => stops.some((other) => Math.abs(other - stop) <= TAB_ALIGN));
    if (kept.length === 0) {
      run = 0;
      shared = [];
      continue;
    }
    run += 1;
    shared = kept;
    if (run >= 3) return true;
  }
  return false;
}

/** Re-splits a block's lines as justified when the test fires. Returns whether it did. */
export function applyJustification(lines: Line[], bodySize: Pt): boolean {
  if (!isJustified(lines) || hasTabColumns(lines)) return false;
  for (const line of lines) {
    line.fragments = splitFragments(line, bodySize, true);
    line.text = lineText(line.fragments);
  }
  return true;
}
