/**
 * Shared shapes for the CSV / Excel cleaner.
 *
 * Everything here is plain data — no DOM, no React, no I/O — so the whole
 * transformation is easy to read (and to audit) on its own.
 */

/** A rectangular sheet of strings. Every row is padded to `header.length`. */
export interface Grid {
  header: string[];
  rows: string[][];
}

/** One sheet from the uploaded file. CSV files produce exactly one. */
export interface ParsedSheet {
  name: string;
  grid: Grid;
}

export interface ParsedFile {
  /** Original filename, used to name the download. */
  filename: string;
  /** 'csv' | 'tsv' | 'excel' — only used for wording in the UI. */
  kind: 'csv' | 'tsv' | 'excel';
  sheets: ParsedSheet[];
  /** Non-fatal parser complaints worth mentioning once. */
  notes: string[];
}

/** Output style for normalised dates. */
export type DateFormat = 'iso' | 'us' | 'eu';

/** Which of the first two numeric components is the day. */
export type DateOrder = 'dmy' | 'mdy';

/** What the user decided about a column we could not resolve on our own. */
export type ColumnDecision = DateOrder | 'skip';

export interface CleanOptions {
  dedupeRows: boolean;
  removeBlankRows: boolean;
  removeBlankColumns: boolean;
  trimCells: boolean;
  collapseWhitespace: boolean;
  standardiseHeaders: boolean;
  lowercaseHeaders: boolean;
  snakeCaseHeaders: boolean;
  normaliseDates: boolean;
  dateFormat: DateFormat;
  /** Keyed by ORIGINAL column index so decisions survive column removal. */
  columnDecisions: Record<number, ColumnDecision>;
}

export const defaultOptions: CleanOptions = {
  dedupeRows: true,
  removeBlankRows: true,
  removeBlankColumns: true,
  trimCells: true,
  // Destructive to deliberate formatting, so off unless asked for.
  collapseWhitespace: false,
  standardiseHeaders: true,
  lowercaseHeaders: false,
  snakeCaseHeaders: false,
  normaliseDates: true,
  dateFormat: 'iso',
  columnDecisions: {},
};

export interface CleanStats {
  rowsBefore: number;
  rowsAfter: number;
  columnsBefore: number;
  columnsAfter: number;
  duplicateRows: number;
  blankRows: number;
  blankColumns: number;
  trimmedCells: number;
  collapsedCells: number;
  renamedHeaders: number;
  dedupedHeaders: number;
  datesNormalised: number;
  dateColumns: number;
  /** Date columns left untouched because they are waiting on the user. */
  pendingDateColumns: number;
}

export interface CleanResult extends Grid {
  /** Original column index for each surviving column. */
  columnSources: number[];
  stats: CleanStats;
}

/** True when a clean pass with these stats changed precisely nothing. */
export function changedNothing(s: CleanStats): boolean {
  return (
    s.duplicateRows === 0 &&
    s.blankRows === 0 &&
    s.blankColumns === 0 &&
    s.trimmedCells === 0 &&
    s.collapsedCells === 0 &&
    s.renamedHeaders === 0 &&
    s.dedupedHeaders === 0 &&
    s.datesNormalised === 0
  );
}
