import { GUTTER_CROSS_BUDGET, GUTTER_MIN } from '../constants';
import type { Line, Pt, Span } from '../types';
import { buildLines } from './lines';

export interface ColumnBand {
  x0: Pt;
  x1: Pt;
}

/** One split, then one more per half. */
const MAX_COLUMNS = 3;
const MAX_DEPTH = 2;
const MIN_SPANS = 40;
const MIN_BASELINES = 6;
/** A newsletter column is filled to its measure (0.75/0.76); a table column is not (0.19–0.50). */
const FILL_RATIO_MIN = 0.6;
const FILL_WIDTH = 0.92;
const LEADING_MATCH: Pt = 1;
const LEADING_MAX = 1.8;

const rightEdge = (span: Span): Pt => span.x + span.w;
const isInk = (span: Span): boolean => !span.synthetic && span.text.trim().length > 0;

function bandOf(spans: readonly Span[]): ColumnBand | null {
  if (spans.length === 0) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const span of spans) {
    if (span.x < x0) x0 = span.x;
    if (rightEdge(span) > x1) x1 = rightEdge(span);
  }
  return { x0, x1 };
}

function histogram(spans: readonly Span[], pageWidth: Pt): Int32Array {
  const width = Math.max(1, Math.ceil(pageWidth));
  const buckets = new Int32Array(width);
  for (const span of spans) {
    const from = Math.max(0, Math.min(width - 1, Math.floor(span.x)));
    const to = Math.min(width, Math.max(from + 1, Math.ceil(rightEdge(span))));
    for (let i = from; i < to; i++) buckets[i] += 1;
  }
  return buckets;
}

/** Interior runs of buckets no denser than the crossing budget, widest first. */
function gutters(
  coverage: Int32Array,
  band: ColumnBand,
  budget: number,
  bodySize: Pt,
): ColumnBand[] {
  const minWidth = GUTTER_MIN(bodySize);
  const lo = Math.max(0, Math.floor(band.x0));
  const hi = Math.min(coverage.length, Math.ceil(band.x1));
  let first = -1;
  let last = -1;
  for (let i = lo; i < hi; i++) {
    if (coverage[i] > budget) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return [];

  const found: ColumnBand[] = [];
  let start = -1;
  for (let i = first; i <= last; i++) {
    if (coverage[i] <= budget) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0 && i - start >= minWidth) found.push({ x0: start, x1: i });
    start = -1;
  }

  const centre = (gutter: ColumnBand): Pt => (gutter.x0 + gutter.x1) / 2;
  const mid = (band.x0 + band.x1) / 2;
  found.sort(
    (a, b) =>
      b.x1 - b.x0 - (a.x1 - a.x0) || Math.abs(centre(a) - mid) - Math.abs(centre(b) - mid),
  );
  return found;
}

function fillRatio(lines: readonly Line[]): number {
  let widest = 0;
  for (const line of lines) widest = Math.max(widest, line.x1 - line.x0);
  if (widest <= 0) return 0;
  const filled = lines.filter((line) => line.x1 - line.x0 >= FILL_WIDTH * widest).length;
  return filled / lines.length;
}

function medianLeading(lines: readonly Line[]): Pt | null {
  const gaps: Pt[] = [];
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i].y - lines[i - 1].y;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** All five tests must hold; a miss means one column. */
function accepted(left: readonly Span[], right: readonly Span[], bodySize: Pt): boolean {
  const leftLines = buildLines(left, bodySize);
  const rightLines = buildLines(right, bodySize);
  if (leftLines.length < MIN_BASELINES || rightLines.length < MIN_BASELINES) return false;
  if (fillRatio(leftLines) < FILL_RATIO_MIN || fillRatio(rightLines) < FILL_RATIO_MIN) return false;

  const leftLead = medianLeading(leftLines);
  const rightLead = medianLeading(rightLines);
  if (leftLead === null || rightLead === null) return false;
  if (Math.abs(leftLead - rightLead) > LEADING_MATCH) return false;
  return leftLead <= LEADING_MAX * bodySize;
}

function divide(
  spans: readonly Span[],
  band: ColumnBand,
  coverage: Int32Array,
  budget: number,
  bodySize: Pt,
  depth: number,
): ColumnBand[] {
  if (depth >= MAX_DEPTH || spans.length < MIN_SPANS) return [band];

  for (const gutter of gutters(coverage, band, budget, bodySize)) {
    // A span crossing the gutter is a full-width band and belongs to neither side.
    const left = spans.filter((span) => rightEdge(span) <= gutter.x0);
    const right = spans.filter((span) => span.x >= gutter.x1);
    if (!accepted(left, right, bodySize)) continue;
    const leftBand = bandOf(left);
    const rightBand = bandOf(right);
    if (!leftBand || !rightBand) continue;
    return [
      ...divide(left, leftBand, coverage, budget, bodySize, depth + 1),
      ...divide(right, rightBand, coverage, budget, bodySize, depth + 1),
    ];
  }
  return [band];
}

export function findColumns(
  spans: readonly Span[],
  pageWidth: Pt,
  bodySize: Pt,
): ColumnBand[] {
  const content = spans.filter(isInk);
  const page = bandOf(content) ?? { x0: 0, x1: Math.max(1, pageWidth) };
  if (content.length < MIN_SPANS) return [page];

  const budget = GUTTER_CROSS_BUDGET(content.length);
  const bands = divide(content, page, histogram(content, pageWidth), budget, bodySize, 0);
  return bands.length > MAX_COLUMNS ? [page] : bands;
}
