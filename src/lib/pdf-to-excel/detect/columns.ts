import { NO_SPACE_MAX } from '@/lib/pdf-to-word/constants';
import { classifyGap } from '@/lib/pdf-to-word/layout/lines';
import type { Line, Pt, Span } from '@/lib/pdf-to-word/types';
import { ALIGN_SHARE_MIN, EDGE_TOL, GUTTER_MIN, PROFILE_BUCKET } from '../constants';
import type { ColumnAlign } from '../types';

export interface ProfileColumn {
  x0: Pt;
  x1: Pt;
  align: ColumnAlign;
  /** The edge its values line up on: the right edge for a right-aligned column. */
  anchor: Pt;
  leftShare: number;
  rightShare: number;
  support: number;
}

export interface ColumnProfile {
  cols: ProfileColumn[];
  /** Low-occupancy intervals between columns. */
  gutters: [Pt, Pt][];
  /** [-Infinity, ...boundaries between kept columns, +Infinity]. */
  bounds: Pt[];
  lineCount: number;
}

const isInk = (span: Span): boolean =>
  !span.synthetic && !span.artifact && span.text.trim().length > 0;

/** The clustering unit is the PDF's own text run: fragments fuse date, description and reference. */
export const lineRuns = (line: Line): Span[] => line.spans.filter(isInk).sort((a, b) => a.x - b.x);

const midOf = (span: Span): Pt => span.x + span.w / 2;

function biggestCluster(values: readonly Pt[], tol: Pt): { at: Pt; n: number } {
  const sorted = [...values].sort((a, b) => a - b);
  let best = { at: sorted[0] ?? 0, n: 0 };
  let group: Pt[] = [];
  const close = (): void => {
    if (group.length <= best.n) return;
    best = { at: group.reduce((sum, v) => sum + v, 0) / group.length, n: group.length };
  };
  for (const value of sorted) {
    if (group.length > 0 && value - group[group.length - 1] > tol) {
      close();
      group = [];
    }
    group.push(value);
  }
  close();
  return best;
}

function alignOf(leftShare: number, rightShare: number): ColumnAlign {
  // Ties go to right: the other way round moved an amount column's anchor by 33–43 pt.
  if (rightShare >= leftShare && rightShare >= ALIGN_SHARE_MIN) return 'right';
  if (leftShare > rightShare && leftShare >= ALIGN_SHARE_MIN) return 'left';
  return 'ragged';
}

function gutterIntervals(runs: readonly Span[], budget: number, minWidth: Pt): [Pt, Pt][] {
  const lo = Math.min(...runs.map((run) => run.x));
  const hi = Math.max(...runs.map((run) => run.x + run.w));
  const cover = new Int32Array(Math.ceil((hi - lo) / PROFILE_BUCKET) + 1);
  for (const run of runs) {
    const from = Math.max(0, Math.floor((run.x - lo) / PROFILE_BUCKET));
    const to = Math.min(cover.length - 1, Math.ceil((run.x + run.w - lo) / PROFILE_BUCKET));
    for (let i = from; i <= to; i++) cover[i] += 1;
  }

  const gutters: [Pt, Pt][] = [];
  let start = -1;
  for (let i = 0; i < cover.length; i++) {
    if (cover[i] <= budget) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0 && (i - start) * PROFILE_BUCKET >= minWidth) {
      gutters.push([lo + start * PROFILE_BUCKET, lo + i * PROFILE_BUCKET]);
    }
    start = -1;
  }
  return gutters;
}

/** The x-position column model: occupancy for the gutters, edge clusters for the alignment. */
export function columnProfile(
  lines: readonly Line[],
  bodySize: Pt,
  gutterFrac: number,
): ColumnProfile | null {
  const runs = lines.flatMap(lineRuns);
  if (runs.length === 0) return null;

  const lo = Math.min(...runs.map((run) => run.x));
  const hi = Math.max(...runs.map((run) => run.x + run.w));
  const gutters = gutterIntervals(
    runs,
    Math.floor(gutterFrac * lines.length),
    GUTTER_MIN(bodySize),
  );

  const edges = [lo, ...gutters.flat(), hi];
  const cols: ProfileColumn[] = [];
  for (let i = 0; i < edges.length; i += 2) {
    const x0 = edges[i];
    const x1 = edges[i + 1];
    if (x1 - x0 <= 0.01) continue;
    const mine = runs.filter((run) => midOf(run) >= x0 && midOf(run) <= x1);
    if (mine.length === 0) continue;
    const left = biggestCluster(
      mine.map((run) => run.x),
      EDGE_TOL,
    );
    const right = biggestCluster(
      mine.map((run) => run.x + run.w),
      EDGE_TOL,
    );
    const leftShare = left.n / mine.length;
    const rightShare = right.n / mine.length;
    const align = alignOf(leftShare, rightShare);
    cols.push({
      x0,
      x1,
      align,
      anchor: align === 'right' ? right.at : left.at,
      leftShare,
      rightShare,
      support: mine.length,
    });
  }
  if (cols.length === 0) return null;

  const bounds: Pt[] = [-Infinity];
  for (let i = 0; i + 1 < cols.length; i++) bounds.push((cols[i].x1 + cols[i + 1].x0) / 2);
  bounds.push(Infinity);
  return { cols, gutters, bounds, lineCount: lines.length };
}

/** Which column a run's midpoint falls in. Never the nearest anchor — that splits hyphenated codes. */
export function columnOfMid(profile: ColumnProfile, x: Pt): number {
  for (let i = 0; i + 1 < profile.bounds.length - 1; i++) {
    if (x < profile.bounds[i + 1]) return i;
  }
  return profile.cols.length - 1;
}

/** Right-aligned columns, which is where the amounts are. */
export const rightColumns = (profile: ColumnProfile): number[] =>
  profile.cols.map((col, i) => (col.align === 'right' ? i : -1)).filter((i) => i >= 0);

function joinSpans(spans: readonly Span[], bodySize: Pt): string {
  let text = '';
  for (let i = 0; i < spans.length; i++) {
    if (i > 0) {
      const previous = spans[i - 1];
      const gap =
        Math.max(previous.size, spans[i].size) > 0
          ? classifyGap(previous, spans[i], false) === 'none'
            ? ''
            : ' '
          : spans[i].x - (previous.x + previous.w) < NO_SPACE_MAX * bodySize
            ? ''
            : ' ';
      text += gap;
    }
    text += spans[i].text;
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** One visual line cut into the profile's columns. */
export function cellsOfLine(profile: ColumnProfile, line: Line, bodySize: Pt = line.size): string[] {
  const buckets: Span[][] = profile.cols.map(() => []);
  for (const run of lineRuns(line)) buckets[columnOfMid(profile, midOf(run))].push(run);
  return buckets.map((spans) => joinSpans(spans, bodySize));
}

/** Cross-page confirmation: the share of a page's runs that land inside a gutter. */
export function pageFit(profile: ColumnProfile, lines: readonly Line[]): number {
  let inside = 0;
  let total = 0;
  for (const line of lines) {
    for (const run of lineRuns(line)) {
      const mid = midOf(run);
      total += 1;
      if (
        profile.gutters.some(
          ([from, to]) => mid > from + PROFILE_BUCKET && mid < to - PROFILE_BUCKET,
        )
      ) {
        inside += 1;
      }
    }
  }
  return total === 0 ? 1 : inside / total;
}
