/**
 * What the clean pass changed, and what it removed.
 *
 * A before/after record per CELL measures 627 MB on a 60 MB file, so the pass
 * keeps one byte per row plus the removed row indexes. Every cell transform is
 * a pure function of the original cell, so the detail is recomputed on demand
 * for the hundred rows actually on screen — see `rowDiffs`.
 */

import type { CleanOutcome } from './clean';
import {
  MAX_LINKED_ROWS,
  REMOVAL_REASONS,
  type CellChange,
  type CellChangeReason,
  type RemovalReason,
  type RemovedRows,
  type RescuePlan,
  type RowDiff,
} from './types';

/** A growable Int32Array, so a million removals cost four bytes each. */
class IntBuffer {
  private data: Int32Array;
  private used = 0;

  constructor(capacity = 256) {
    this.data = new Int32Array(capacity);
  }

  push(value: number): void {
    if (this.used === this.data.length) {
      const grown = new Int32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data[this.used] = value;
    this.used += 1;
  }

  get length(): number {
    return this.used;
  }

  toInt32(): Int32Array {
    return this.data.slice(0, this.used);
  }

  toUint8(): Uint8Array {
    return Uint8Array.from(this.data.subarray(0, this.used));
  }
}

function zeroCounts(): Record<RemovalReason, number> {
  const counts = {} as Record<RemovalReason, number>;
  for (const reason of REMOVAL_REASONS) counts[reason] = 0;
  return counts;
}

/**
 * Collects removed rows during a pass.
 *
 * Rows must be recorded in ascending order — every consumer relies on that and
 * on nothing else.
 */
export class RemovalRecorder {
  private readonly indexes = new IntBuffer();
  private readonly reasons = new IntBuffer();
  private readonly duplicates = new IntBuffer();
  private readonly counts = zeroCounts();

  record(index: number, reason: RemovalReason, duplicateOf = -1): void {
    this.indexes.push(index);
    this.reasons.push(REMOVAL_REASONS.indexOf(reason));
    this.duplicates.push(duplicateOf);
    this.counts[reason] += 1;
  }

  finish(): RemovedRows {
    return {
      indexes: this.indexes.toInt32(),
      reasons: this.reasons.toUint8(),
      duplicateOf: this.duplicates.toInt32(),
      counts: this.counts,
    };
  }
}

/**
 * Removals the user may overturn. The heading row and the preamble above it are
 * not on the list: the way to keep those is to pick a different heading row.
 */
export const RESCUABLE_REASONS: ReadonlySet<RemovalReason> = new Set<RemovalReason>([
  'duplicate',
  'blank',
  'footer',
  'index-only',
]);

/** Position of `index` in the ascending removal list, or -1. */
function findRemoval(removed: RemovedRows, index: number): number {
  let low = 0;
  let high = removed.indexes.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const at = removed.indexes[mid];
    if (at === index) return mid;
    if (at < index) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

export function removalReasonOf(removed: RemovedRows, index: number): RemovalReason | null {
  const at = findRemoval(removed, index);
  return at === -1 ? null : REMOVAL_REASONS[removed.reasons[at]];
}

// ─────────────────────────────────────────────────────────────────────────
//  Choosing which rows to show
// ─────────────────────────────────────────────────────────────────────────

export type RowFilter = 'all' | 'changed' | 'removed' | 'touched';

export interface RowSelection {
  /** ORIGINAL row indexes in this window, ascending. */
  indexes: number[];
  /** Rows the filter matched across the WHOLE sheet, not just this window. */
  total: number;
  offset: number;
}

/**
 * Apply a filter to every row in the sheet and hand back one window of it.
 *
 * `total` is the honest count, so the UI can say "showing 100 of 4,312".
 * Filtering only the rows already on screen would be a lie with a progress bar.
 */
export function selectRows(
  outcome: CleanOutcome,
  filter: RowFilter,
  offset = 0,
  limit = 100,
): RowSelection {
  const { rowChanged, removed } = outcome.changes;
  const sourceRows = rowChanged.length;
  const indexes: number[] = [];
  let total = 0;
  let removalAt = 0;

  for (let row = 0; row < sourceRows; row += 1) {
    while (removalAt < removed.indexes.length && removed.indexes[removalAt] < row) removalAt += 1;
    const wasRemoved =
      removalAt < removed.indexes.length && removed.indexes[removalAt] === row;

    let matches: boolean;
    switch (filter) {
      case 'changed':
        matches = rowChanged[row] === 1;
        break;
      case 'removed':
        matches = wasRemoved;
        break;
      case 'touched':
        matches = wasRemoved || rowChanged[row] === 1;
        break;
      default:
        matches = true;
    }
    if (!matches) continue;

    total += 1;
    if (total > offset && indexes.length < limit) indexes.push(row);
  }

  return { indexes, total, offset };
}

// ─────────────────────────────────────────────────────────────────────────
//  Recomputing the detail
// ─────────────────────────────────────────────────────────────────────────

/**
 * Work out cell by cell what happened to these rows.
 *
 * Only ever called for the rows on screen: it re-runs the same pure transform
 * the pass used, so the answer is identical to what the pass did without the
 * pass having had to remember any of it.
 */
export function rowDiffs(outcome: CleanOutcome, indexes: readonly number[]): RowDiff[] {
  const { plan } = outcome;
  const out: RowDiff[] = [];
  const reasons: CellChangeReason[] = [];

  for (const index of indexes) {
    const removedBecause = removalReasonOf(outcome.changes.removed, index);
    const source = plan.source[index];
    const cells: CellChange[] = [];

    // Nothing is applied to the preamble or the heading row, so there is no
    // cell detail to show for them — only the reason they are not data.
    if (source && index >= plan.firstDataRow) {
      for (let column = 0; column < plan.columnCount; column += 1) {
        const before = source[column] ?? '';
        reasons.length = 0;
        const after = plan.cellFor(before, column, reasons);
        if (after === before) continue;
        cells.push({ column, before, after, reasons: reasons.slice() });
      }
    }

    out.push({ index, cells, removedBecause });
  }

  return out;
}

/** Plain-English reasons, so every screen words a removal the same way. */
export const removalReasonLabels: Record<RemovalReason, string> = {
  duplicate: 'The same as an earlier row',
  blank: 'Empty row',
  preamble: 'Above the heading row',
  footer: 'Footer row',
  'index-only': 'Empty apart from a row number',
  header: 'This is the heading row',
};

export const cellChangeReasonLabels: Record<CellChangeReason, string> = {
  trim: 'Spaces at the start or end removed',
  'collapse-spaces': 'Repeated spaces squeezed to one',
  'flatten-newlines': 'Line breaks turned into spaces',
  invisible: 'Invisible characters removed',
  'sentinel-blank': 'Placeholder emptied',
  'spelling-merge': 'Spelling matched to the rest of the column',
  date: 'Date written the same way as the rest',
};

// ─────────────────────────────────────────────────────────────────────────
//  Keeping a row the pass removed
// ─────────────────────────────────────────────────────────────────────────

/**
 * Put rows the user asked to keep back into a finished result.
 *
 * This is a step after the pass, never an option inside it: the pass takes a
 * couple of seconds on a large file, and running it again on every "keep this
 * one" click would freeze the tab. Only the rescued rows are worked on.
 *
 * Always apply the whole plan to the pass's own result, not to the result of an
 * earlier rescue — although doing the latter is harmless, since a row that is
 * already back cannot be rescued twice.
 */
export function applyRescues(outcome: CleanOutcome, plan: RescuePlan): CleanOutcome {
  const removed = outcome.changes.removed;
  if (plan.length === 0 || removed.indexes.length === 0) return outcome;

  const wanted = new Set(plan);
  const rescued: number[] = [];
  const keptIndexes = new IntBuffer();
  const keptReasons = new IntBuffer();
  const keptDuplicates = new IntBuffer();
  const counts = { ...removed.counts };

  for (let at = 0; at < removed.indexes.length; at += 1) {
    const index = removed.indexes[at];
    const reason = REMOVAL_REASONS[removed.reasons[at]];
    if (wanted.has(index) && RESCUABLE_REASONS.has(reason)) {
      rescued.push(index);
      counts[reason] -= 1;
      continue;
    }
    keptIndexes.push(index);
    keptReasons.push(removed.reasons[at]);
    keptDuplicates.push(removed.duplicateOf[at]);
  }

  if (rescued.length === 0) return outcome;

  const rowChanged = outcome.changes.rowChanged.slice();
  let changedRows = outcome.changes.changedRows;

  const built = new Map<number, string[]>();
  for (const index of rescued) {
    const source = outcome.plan.source[index] ?? [];
    const row = new Array<string>(outcome.columnSources.length);
    let changed = false;
    for (let c = 0; c < outcome.columnSources.length; c += 1) {
      const before = source[outcome.columnSources[c]] ?? '';
      const after = outcome.plan.cellFor(before, outcome.columnSources[c]);
      if (after !== before) changed = true;
      row[c] = after;
    }
    built.set(index, row);
    if (changed && rowChanged[index] === 0) {
      rowChanged[index] = 1;
      changedRows += 1;
    }
  }

  // Splice each rescued row back in at its original position, so the result
  // reads in file order like any other.
  const total = outcome.rows.length + rescued.length;
  const rows = new Array<string[]>(total);
  const rowSources = new Int32Array(total);
  let from = 0;
  let back = 0;
  for (let at = 0; at < total; at += 1) {
    const nextKept = from < outcome.rows.length ? outcome.rowSources[from] : Infinity;
    const nextBack = back < rescued.length ? rescued[back] : Infinity;
    if (nextBack < nextKept) {
      rows[at] = built.get(rescued[back]) ?? [];
      rowSources[at] = rescued[back];
      back += 1;
    } else {
      rows[at] = outcome.rows[from];
      rowSources[at] = outcome.rowSources[from];
      from += 1;
    }
  }

  return {
    ...outcome,
    rows,
    rowSources,
    stats: {
      ...outcome.stats,
      rowsAfter: rows.length,
      // The removal counters still say what the pass did; this is the correction.
      rescuedRows: outcome.stats.rescuedRows + rescued.length,
    },
    changes: {
      rowChanged,
      changedRows,
      removed: {
        indexes: keptIndexes.toInt32(),
        reasons: keptReasons.toUint8(),
        duplicateOf: keptDuplicates.toInt32(),
        counts,
      },
    },
  };
}

/** Removed rows for one panel, capped so a bad file cannot bloat UI state. */
export function removedRowIndexes(
  removed: RemovedRows,
  reason: RemovalReason,
  limit = MAX_LINKED_ROWS,
): number[] {
  const wanted = REMOVAL_REASONS.indexOf(reason);
  const out: number[] = [];
  for (let at = 0; at < removed.indexes.length && out.length < limit; at += 1) {
    if (removed.reasons[at] === wanted) out.push(removed.indexes[at]);
  }
  return out;
}
