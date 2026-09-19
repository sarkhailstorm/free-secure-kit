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

/** Rows must be recorded in ascending order; every consumer relies on it. */
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

export const RESCUABLE_REASONS: ReadonlySet<RemovalReason> = new Set<RemovalReason>([
  'duplicate',
  'blank',
  'footer',
  'index-only',
]);

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

export type RowFilter = 'all' | 'changed' | 'removed' | 'touched';

export interface RowSelection {
  /** ORIGINAL row indexes in this window, ascending. */
  indexes: number[];
  /** Rows the filter matched across the WHOLE sheet, not just this window. */
  total: number;
  offset: number;
}

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

/** Recomputes cell detail; only ever call it for the rows actually on screen. */
export function rowDiffs(outcome: CleanOutcome, indexes: readonly number[]): RowDiff[] {
  const { plan } = outcome;
  const out: RowDiff[] = [];
  const reasons: CellChangeReason[] = [];

  for (const index of indexes) {
    const removedBecause = removalReasonOf(outcome.changes.removed, index);
    const source = plan.source[index];
    const cells: CellChange[] = [];

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

/** Apply the whole plan to the pass's own result, never to an earlier rescue's. */
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
