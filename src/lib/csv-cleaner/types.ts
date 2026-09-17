/**
 * Shared shapes for Spreadsheet Tools.
 *
 * Everything here is plain data — no DOM, no React, no I/O — so the whole
 * transformation is easy to read (and to audit) on its own.
 *
 * Two indexing rules hold everywhere in this contract, and every module must
 * honour them:
 *   • ROW indexes are positions in `ParsedSheet.rows`, i.e. the file as it was
 *     read, counting from 0 and including the header row and anything above it.
 *   • COLUMN indexes are positions in the ORIGINAL sheet width. Changing the
 *     header row moves rows, never columns, so column-keyed choices
 *     (`columnDecisions`, `spellingMerges`, `columnBlankSentinels`) stay valid
 *     across a header change and must NOT be cleared when one happens.
 */

// ─────────────────────────────────────────────────────────────────────────
//  Small shared vocabulary
// ─────────────────────────────────────────────────────────────────────────

/** How sure an automatic choice is. Drives whether the UI asks or just tells. */
export type Confidence = 'high' | 'medium' | 'low';

/** How loudly a finding should be shown. */
export type Severity = 'info' | 'warning' | 'serious';

/** A rectangular sheet of strings. Every row is padded to `header.length`. */
export interface Grid {
  header: string[];
  rows: string[][];
}

/** Row lists carried to the UI are capped at this, so a bad file cannot bloat state. */
export const MAX_LINKED_ROWS = 500;

// ─────────────────────────────────────────────────────────────────────────
//  Reading — text encoding (encoding.ts)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Encodings we will decode. All are TextDecoder labels.
 *
 * Only `utf-8` and `windows-1252` can be written back out: TextEncoder is
 * UTF-8 only by spec (its constructor argument is ignored), so windows-1252
 * output needs a hand-rolled reverse table.
 */
export type EncodingId =
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'windows-1252'
  | 'windows-1251'
  | 'iso-8859-2'
  | 'iso-8859-7'
  | 'iso-8859-15'
  | 'macintosh'
  | 'shift_jis'
  | 'gb18030'
  | 'big5'
  | 'euc-kr';

export type OutputEncoding = 'utf-8' | 'windows-1252';

export type BomKind = 'utf-8' | 'utf-16le' | 'utf-16be';

/** Where the chosen encoding came from. `chosen` means the user picked it. */
export type DecodeSource = 'bom' | 'detected' | 'assumed' | 'chosen';

/** One reading of the same bytes, for the "which of these looks right?" picker. */
export interface EncodingCandidate {
  id: EncodingId;
  /** Plain-English name for the picker, e.g. "Western European (Windows)". */
  label: string;
  /** 0–1. Relative, not absolute — only useful for ordering the list. */
  score: number;
  /** U+FFFD characters produced by this reading. Zero is not proof of correct. */
  replacements: number;
  /** First few hundred characters under this reading, so the user can compare. */
  sample: string;
}

/**
 * Mojibake repair: UTF-8 bytes that were already decoded as windows-1252 once
 * ("CafÃ©"). Self-gating — the inverse re-decode throws on legitimate text that
 * merely contains Ã sequences, so `available` is false unless it round-trips.
 */
export interface MojibakeReport {
  available: boolean;
  applied: boolean;
  /** A handful of before/after pairs so the user can see what would change. */
  examples: Array<{ before: string; after: string }>;
}

export interface DecodeReport {
  encoding: EncodingId;
  source: DecodeSource;
  confidence: Confidence;
  /** The byte-order mark that was found and stripped, if any. */
  bom: BomKind | null;
  /** Always includes the chosen encoding, first. */
  candidates: EncodingCandidate[];
  replacements: number;
  mojibake: MojibakeReport;
}

// ─────────────────────────────────────────────────────────────────────────
//  Reading — delimiter and sheets (parse.ts)
// ─────────────────────────────────────────────────────────────────────────

/** `declared` means the file said so itself, via a `sep=;` first line. */
export type DelimiterSource = 'declared' | 'detected' | 'assumed' | 'chosen';

export interface DelimiterCandidate {
  /** The literal character, e.g. ',' or a tab. */
  delimiter: string;
  /** Plain-English name for the picker, e.g. "Semicolon". */
  label: string;
  /** Columns the first rows would have under this delimiter. */
  columns: number;
  /** 0–1: how many rows agree on that column count. */
  consistency: number;
}

export interface DelimiterReport {
  delimiter: string;
  source: DelimiterSource;
  confidence: Confidence;
  candidates: DelimiterCandidate[];
  /** The `sep=;` line that was found and removed, verbatim, or null. */
  sepLine: string | null;
}

export type SheetVisibility = 'visible' | 'hidden' | 'very-hidden';

/** Non-fatal things found while reading. Structured so the UI can link to rows. */
export type ReadIssueKind =
  | 'ragged-rows'
  | 'unclosed-quote'
  | 'replacement-characters'
  | 'sep-line-removed'
  | 'empty-sheet'
  | 'hidden-sheet'
  | 'merged-cells'
  | 'excel-error-cells'
  | 'time-only-cells'
  | 'percentage-cells'
  | 'formula-cells';

export interface ReadIssue {
  kind: ReadIssueKind;
  severity: Severity;
  /** How many rows/cells/sheets are affected — the number the UI quotes. */
  count: number;
  /** ORIGINAL row indexes, capped at MAX_LINKED_ROWS. Empty when not row-bound. */
  rowIndexes: number[];
  /** Original column index when the issue belongs to one column. */
  columnIndex?: number;
  /** Sheet index when the issue belongs to one sheet. */
  sheetIndex?: number;
  /** A few offending values, verbatim, for the UI to show. */
  samples: string[];
}

/**
 * One sheet as it was read.
 *
 * `rows` holds EVERY row — nothing is split off as a header. Which row is the
 * header is a reversible option (`CleanOptions.headerRowIndex`), so cleaning
 * can always restart from the untouched original.
 */
export interface ParsedSheet {
  name: string;
  /** Position in the workbook, used to key output selection. */
  index: number;
  visibility: SheetVisibility;
  rows: string[][];
  /** Every row in `rows` is padded to this width. */
  columnCount: number;
  rowCount: number;
  /** True when the sheet was larger than we were willing to read. */
  truncated: boolean;
  issues: ReadIssue[];
}

/** Delimited text, or a workbook. Replaces the old 'csv' | 'tsv' | 'excel'. */
export type SourceKind = 'delimited' | 'workbook';

export interface ParsedFile {
  /** Original filename, used to name the download. */
  filename: string;
  kind: SourceKind;
  /** Lower-case, no dot. Kept for wording: 'csv', 'xlsx', 'ods', 'numbers'… */
  extension: string;
  sheets: ParsedSheet[];
  /** Delimited files only; null for workbooks. */
  decode: DecodeReport | null;
  /** Delimited files only; null for workbooks. */
  delimiter: DelimiterReport | null;
  /** File-level issues. Per-sheet ones live on the sheet. Replaces `notes`. */
  issues: ReadIssue[];
}

/** Overrides for a re-read after the user disagrees with a guess. */
export interface ReadOptions {
  encoding?: EncodingId;
  repairMojibake?: boolean;
  delimiter?: string;
}

// ─────────────────────────────────────────────────────────────────────────
//  Structure — where the header and the footer are (structure.ts)
// ─────────────────────────────────────────────────────────────────────────

/** Rows scored for the header picker. */
export const HEADER_SCAN_ROWS = 20;

export type HeaderScoreReason =
  | 'every-cell-filled'
  | 'all-text'
  | 'all-distinct'
  | 'short-values'
  | 'types-settle-below'
  | 'narrower-than-rows'
  | 'mostly-blank'
  | 'repeats-below'
  | 'reads-like-a-title';

export interface HeaderRowScore {
  /** ORIGINAL row index. */
  index: number;
  /** Higher is more header-like. Only meaningful against the other scores. */
  score: number;
  reasons: HeaderScoreReason[];
  /** The row's first few cells, for the picker. */
  preview: string[];
}

export type FooterReason = 'total-word' | 'mostly-blank' | 'fewer-values' | 'trailing-note';

export interface FooterRowCandidate {
  /** ORIGINAL row index. */
  index: number;
  reason: FooterReason;
  preview: string[];
}

export interface StructureReport {
  /** Suggested header row, or null when the sheet appears to have no header. */
  headerRowIndex: number | null;
  confidence: Confidence;
  /** Scores for the first HEADER_SCAN_ROWS rows, in row order. */
  scores: HeaderRowScore[];
  /** Suggestions only — dropping them is off by default. */
  footerCandidates: FooterRowCandidate[];
  /**
   * An unnamed pandas/R index column (blank header, ascending integers), which
   * otherwise keeps every `47,,,,` row looking non-blank.
   */
  indexColumn: number | null;
}

// ─────────────────────────────────────────────────────────────────────────
//  Cleaning (clean.ts)
// ─────────────────────────────────────────────────────────────────────────

/** Output style for normalised dates. */
export type DateFormat = 'iso' | 'us' | 'eu';

/** Which of the first two numeric components is the day. */
export type DateOrder = 'dmy' | 'mdy';

/** What the user decided about a column we could not resolve on our own. */
export type ColumnDecision = DateOrder | 'skip';

/** Accepted spelling merges for one column: value seen -> value to write. */
export type MergePlan = Record<string, string>;

/** Values commonly typed to mean "nothing here". Opt-in — blanking is lossy. */
export const DEFAULT_BLANK_SENTINELS: readonly string[] = [
  'N/A',
  '#N/A',
  'NA',
  'NULL',
  'None',
  'nil',
  'NaN',
  '-',
  '--',
  '?',
];

/** Characters that take up no space but break matching and sorting. */
export const INVISIBLE_CHARACTER_PATTERN =
  // Tab, newline and carriage return are left out: they are structure, and
  // the whitespace options deal with them.
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\uFEFF\uFFF9-\uFFFC]/gu;

/** Spaces that are not the ordinary one. Replaced by a plain space, not deleted. */
export const ODD_SPACE_PATTERN = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/gu;

export interface CleanOptions {
  /**
   * ORIGINAL row index of the header row. Rows above it are dropped as
   * preamble. `null` means the sheet has no header: every row is data and the
   * columns are named Column 1…N.
   */
  headerRowIndex: number | null;
  /** Off by default: dropping trailing rows loses data. */
  dropFooterRows: boolean;
  /** ORIGINAL row indexes to drop when `dropFooterRows` is on. */
  footerRowIndexes: readonly number[];

  dedupeRows: boolean;
  removeBlankRows: boolean;
  removeBlankColumns: boolean;
  /**
   * Let a row count as blank even though its unnamed index cell holds a number.
   * Only applies when `removeBlankRows` is on and structure found an index
   * column. Off by default — it removes rows nothing else would.
   */
  ignoreIndexColumnInBlankRows: boolean;

  trimCells: boolean;
  /** Runs of spaces and tabs become one space. Newlines inside a cell survive. */
  collapseSpaces: boolean;
  /** Newlines inside a cell become a single space. */
  flattenNewlines: boolean;
  /** Strips zero-width characters and turns odd spaces into ordinary ones. */
  removeInvisibleCharacters: boolean;

  /** Master switch for the sentinel lists below. */
  blankSentinels: boolean;
  /** Applied to every column that has no list of its own. */
  defaultBlankSentinels: readonly string[];
  /** Keyed by ORIGINAL column index; overrides the default for that column. */
  columnBlankSentinels: Record<number, readonly string[]>;

  standardiseHeaders: boolean;
  lowercaseHeaders: boolean;
  snakeCaseHeaders: boolean;

  normaliseDates: boolean;
  dateFormat: DateFormat;
  /** Keyed by ORIGINAL column index. */
  columnDecisions: Record<number, ColumnDecision>;

  /**
   * Keyed by ORIGINAL column index. Keys inside a plan are values as they stand
   * AFTER whitespace, invisible-character and sentinel handling, so cluster.ts
   * must group those same values. Re-applying a plan is a no-op; clearing it
   * undoes the merge.
   */
  spellingMerges: Record<number, MergePlan>;
}

/**
 * Older callers and stored presets. `collapseWhitespace` is the retired single
 * toggle: it sets both `collapseSpaces` and `flattenNewlines`.
 */
export interface LegacyCleanOptions extends Partial<CleanOptions> {
  /** @deprecated Use `collapseSpaces` and `flattenNewlines`. */
  collapseWhitespace?: boolean;
}

export const defaultOptions: CleanOptions = {
  // Replaced per file by StructureReport.headerRowIndex; 0 is the old behaviour.
  headerRowIndex: 0,
  dropFooterRows: false,
  footerRowIndexes: [],

  dedupeRows: true,
  removeBlankRows: true,
  removeBlankColumns: true,
  ignoreIndexColumnInBlankRows: false,

  trimCells: true,
  // Destructive to deliberate formatting, so off unless asked for.
  collapseSpaces: false,
  flattenNewlines: false,
  removeInvisibleCharacters: false,

  blankSentinels: false,
  defaultBlankSentinels: DEFAULT_BLANK_SENTINELS,
  columnBlankSentinels: {},

  standardiseHeaders: true,
  lowercaseHeaders: false,
  snakeCaseHeaders: false,

  normaliseDates: true,
  dateFormat: 'iso',
  columnDecisions: {},

  spellingMerges: {},
};

/**
 * Fill in defaults and expand the retired `collapseWhitespace` alias.
 *
 * Always use this rather than spreading `defaultOptions`: the record fields on
 * that constant are shared objects, and this hands back fresh ones.
 */
export function withDefaults(input: LegacyCleanOptions = {}): CleanOptions {
  const { collapseWhitespace, ...rest } = input;
  return {
    ...defaultOptions,
    columnBlankSentinels: {},
    columnDecisions: {},
    spellingMerges: {},
    ...(collapseWhitespace === undefined
      ? {}
      : { collapseSpaces: collapseWhitespace, flattenNewlines: collapseWhitespace }),
    ...rest,
  };
}

export interface CleanStats {
  /** Every row in the sheet as read, header and preamble included. */
  sourceRows: number;
  /** Data rows once the header choice is applied — the "before" the UI shows. */
  rowsBefore: number;
  rowsAfter: number;
  columnsBefore: number;
  columnsAfter: number;

  /** Rows above the chosen header row. */
  preambleRows: number;
  footerRows: number;
  duplicateRows: number;
  blankRows: number;
  /** Blank apart from an unnamed index number. */
  indexOnlyRows: number;
  blankColumns: number;
  /** Rows the user asked to keep after the pass had removed them. */
  rescuedRows: number;

  trimmedCells: number;
  /** Replaces the old `collapsedCells`, which folded both of these together. */
  collapsedSpaceCells: number;
  flattenedNewlineCells: number;
  invisibleCharacterCells: number;
  /** Cells emptied because they matched a blank sentinel. */
  sentinelCells: number;
  spellingMergedCells: number;
  spellingMergedColumns: number;

  /** Headers whose text the header options changed. Never counts data rows. */
  renamedHeaders: number;
  dedupedHeaders: number;
  /** Blank headers given a Column N name. Happens with every toggle off. */
  namedBlankHeaders: number;

  datesNormalised: number;
  dateColumns: number;
  /** Date columns left untouched because they are waiting on the user. */
  pendingDateColumns: number;
}

export interface CleanResult extends Grid {
  /** Original column index for each surviving column. */
  columnSources: number[];
  /** ORIGINAL row index for each surviving row. */
  rowSources: Int32Array;
  stats: CleanStats;
  changes: ChangeLog;
}

/** True when a clean pass with these stats changed precisely nothing. */
export function changedNothing(s: CleanStats): boolean {
  return (
    s.preambleRows === 0 &&
    s.footerRows === 0 &&
    s.duplicateRows === 0 &&
    s.blankRows === 0 &&
    s.indexOnlyRows === 0 &&
    s.blankColumns === 0 &&
    s.rescuedRows === 0 &&
    s.trimmedCells === 0 &&
    s.collapsedSpaceCells === 0 &&
    s.flattenedNewlineCells === 0 &&
    s.invisibleCharacterCells === 0 &&
    s.sentinelCells === 0 &&
    s.spellingMergedCells === 0 &&
    s.renamedHeaders === 0 &&
    s.dedupedHeaders === 0 &&
    s.namedBlankHeaders === 0 &&
    s.datesNormalised === 0
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Change tracking (changes.ts)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Why a row is not in the result. The array IS the wire format: a reason is
 * stored as its index here, so never reorder it, only append.
 */
export const REMOVAL_REASONS = [
  'duplicate',
  'blank',
  'preamble',
  'footer',
  'index-only',
  'header',
] as const;

export type RemovalReason = (typeof REMOVAL_REASONS)[number];

/**
 * Removed rows, held as parallel typed arrays.
 *
 * A record object per removed row costs tens of megabytes on a large file; nine
 * bytes per row costs almost nothing, so every removal is kept and every one
 * can be rescued.
 */
export interface RemovedRows {
  /** ORIGINAL row indexes, ascending. */
  indexes: Int32Array;
  /** Parallel to `indexes`: an index into REMOVAL_REASONS. */
  reasons: Uint8Array;
  /** Parallel to `indexes`: the row this duplicates, or -1. */
  duplicateOf: Int32Array;
  counts: Record<RemovalReason, number>;
}

/**
 * What the whole pass records.
 *
 * Deliberately one byte per row plus the removals — a before/after record per
 * CELL measures 627 MB on a 60 MB file and is unshippable. Every cell transform
 * is a pure function of the original cell, so the detail is recomputed on
 * demand for the rows on screen (see `RowDiff`).
 */
export interface ChangeLog {
  /** Indexed by ORIGINAL row index, length `ParsedSheet.rowCount`. 1 = changed. */
  rowChanged: Uint8Array;
  changedRows: number;
  removed: RemovedRows;
}

export type CellChangeReason =
  | 'trim'
  | 'collapse-spaces'
  | 'flatten-newlines'
  | 'invisible'
  | 'sentinel-blank'
  | 'spelling-merge'
  | 'date';

export interface CellChange {
  /** Original column index. */
  column: number;
  before: string;
  after: string;
  /** In pipeline order; a cell can be trimmed and then re-dated. */
  reasons: CellChangeReason[];
}

/** Recomputed for the rows on screen only — never held for the whole file. */
export interface RowDiff {
  /** ORIGINAL row index. */
  index: number;
  cells: CellChange[];
  /** Set when this row is not in the result. */
  removedBecause: RemovalReason | null;
}

/** Rows the user asked to keep, by ORIGINAL row index, ascending. */
export type RescuePlan = readonly number[];

/**
 * Rescues are applied as a cheap step AFTER `cleanGrid`, never as a cleaning
 * option: the pass takes seconds on a large file and every "keep this one"
 * click would otherwise freeze the tab. The rescued row is put through the cell
 * transforms on its own and spliced in at its original position, so the result
 * carries the same shape as any other `CleanResult`.
 */
export type RescuedResult = CleanResult;

// ─────────────────────────────────────────────────────────────────────────
//  Things to check (checks.ts)
// ─────────────────────────────────────────────────────────────────────────

export type CheckKind =
  | 'ragged-rows'
  | 'unclosed-quote'
  | 'encoding-damage'
  | 'excel-error-cells'
  | 'formula-in-cell'
  | 'risky-first-character'
  | 'index-only-rows'
  | 'mixed-date-formats'
  | 'future-dates'
  | 'very-old-dates'
  | 'number-stored-as-text'
  | 'mixed-decimal-separator'
  | 'percentage-as-decimal'
  | 'time-without-a-date'
  | 'leading-zeros'
  | 'trailing-whitespace'
  | 'invisible-characters'
  | 'mixed-case-values'
  | 'near-duplicate-values'
  | 'duplicate-headers'
  | 'mostly-empty-column'
  | 'single-value-column'
  | 'very-long-values'
  | 'hidden-sheet';

export interface CheckFinding {
  kind: CheckKind;
  severity: Severity;
  /** Rows or cells affected — the number the UI quotes. */
  count: number;
  /** ORIGINAL row indexes, capped at MAX_LINKED_ROWS, so the UI can link through. */
  rowIndexes: number[];
  /** True when `rowIndexes` was capped and `count` is the honest total. */
  truncated: boolean;
  /** Original column index when the finding belongs to one column. */
  columnIndex?: number;
  /** Header text at the time of the check, for wording. */
  columnName?: string;
  /** A few offending values, verbatim. */
  samples: string[];
}

export interface ChecksReport {
  findings: CheckFinding[];
  /** Rows actually scanned; large files are sampled. */
  rowsScanned: number;
  sampled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
//  Value clustering (cluster.ts)
// ─────────────────────────────────────────────────────────────────────────

/** Why the members of a group were judged to be the same thing. */
export type ClusterReason =
  | 'case'
  | 'whitespace'
  | 'punctuation'
  | 'accents'
  | 'word-order'
  | 'near-spelling';

export interface ClusterMember {
  value: string;
  count: number;
}

export interface ValueCluster {
  /** Stable within one report, so UI state survives a re-render. */
  id: string;
  /** Original column index. */
  columnIndex: number;
  /** Descending by count. Always two or more. */
  members: ClusterMember[];
  /** The member we propose keeping — usually the most common spelling. */
  suggested: string;
  reason: ClusterReason;
  /** Rows the whole group covers. */
  total: number;
}

export interface ClusterReport {
  /** Original column index. */
  columnIndex: number;
  columnName: string;
  distinctValues: number;
  clusters: ValueCluster[];
  /** True when the column had too many distinct values to compare them all. */
  truncated: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
//  Writing (serialize.ts)
// ─────────────────────────────────────────────────────────────────────────

export type OutputFormat = 'csv' | 'xlsx';

export const EXCEL_MAX_ROWS = 1_048_576;
export const EXCEL_MAX_COLUMNS = 16_384;
export const EXCEL_MAX_SHEET_NAME = 31;

/**
 * A value whose first character could make a spreadsheet run it.
 *
 * `=` and `@` are always escaped. `+` and `-` are escaped only when the value
 * is not a plain number — apostrophising every negative in an accounts file is
 * worse than the bug. In a CSV the apostrophe is visible data, so any copy
 * about this must say a character was added.
 */
export const FORMULA_LEAD_PATTERN = /^[=@+-]/;
export const PLAIN_NUMBER_PATTERN = /^[+-]?(?:\d{1,3}(?:,\d{3})*|\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** One sheet on the way out. */
export interface OutputSheet {
  name: string;
  grid: Grid;
}

export interface WriteOptions {
  format: OutputFormat;
  /** CSV only. Defaults to the delimiter the file arrived with. */
  delimiter: string;
  /** CSV only. */
  newline: '\r\n' | '\n';
  /** CSV only. A BOM keeps Excel from mangling accents on Windows. */
  encoding: OutputEncoding;
  bom: boolean;
  escapeFormulas: boolean;
  /**
   * `ParsedSheet.index` values to write, in order. One CSV holds one sheet, so
   * several selected sheets are written as a zip of one file per sheet.
   */
  sheets: readonly number[];
}

export const defaultWriteOptions: WriteOptions = {
  format: 'csv',
  delimiter: ',',
  newline: '\r\n',
  encoding: 'utf-8',
  bom: true,
  escapeFormulas: true,
  sheets: [],
};

/** Whether what we are about to write will fit in a spreadsheet at all. */
export interface OutputLimits {
  rows: number;
  columns: number;
  rowsExceeded: boolean;
  columnsExceeded: boolean;
  /** The sheet that breaks a limit first, by `ParsedSheet.index`. */
  firstOffendingSheet: number | null;
}
