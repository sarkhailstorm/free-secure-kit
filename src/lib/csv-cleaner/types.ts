/** Row indexes count from 0 in `ParsedSheet.rows` (header included); column indexes are ORIGINAL-width, so column-keyed choices survive a header change. */

export type Confidence = 'high' | 'medium' | 'low';

export type Severity = 'info' | 'warning' | 'serious';

/** Every row is padded to `header.length`. */
export interface Grid {
  header: string[];
  rows: string[][];
}

export const MAX_LINKED_ROWS = 500;

/** TextDecoder labels. Only `utf-8` and `windows-1252` can be written back out. */
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

export type DecodeSource = 'bom' | 'detected' | 'assumed' | 'chosen';

export interface EncodingCandidate {
  id: EncodingId;
  label: string;
  /** 0–1. Relative, not absolute — only useful for ordering the list. */
  score: number;
  /** U+FFFD characters produced by this reading. Zero is not proof of correct. */
  replacements: number;
  sample: string;
}

/** `available` is false unless the inverse re-decode round-trips. */
export interface MojibakeReport {
  available: boolean;
  applied: boolean;
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

/** `declared` means the file said so itself, via a `sep=;` first line. */
export type DelimiterSource = 'declared' | 'detected' | 'assumed' | 'chosen';

export interface DelimiterCandidate {
  /** The literal character, e.g. ',' or a tab. */
  delimiter: string;
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
  /** Rows, cells or sheets affected, depending on `kind`. */
  count: number;
  /** ORIGINAL row indexes, capped at MAX_LINKED_ROWS. Empty when not row-bound. */
  rowIndexes: number[];
  columnIndex?: number;
  sheetIndex?: number;
  samples: string[];
}

/** `rows` holds EVERY row; nothing is split off as a header. */
export interface ParsedSheet {
  name: string;
  /** Position in the workbook, used to key output selection. */
  index: number;
  visibility: SheetVisibility;
  rows: string[][];
  /** Every row in `rows` is padded to this width. */
  columnCount: number;
  rowCount: number;
  truncated: boolean;
  issues: ReadIssue[];
}

export type SourceKind = 'delimited' | 'workbook';

export interface ParsedFile {
  filename: string;
  kind: SourceKind;
  /** Lower-case, no dot: 'csv', 'xlsx', 'ods', 'numbers'… */
  extension: string;
  sheets: ParsedSheet[];
  /** Delimited files only; null for workbooks. */
  decode: DecodeReport | null;
  /** Delimited files only; null for workbooks. */
  delimiter: DelimiterReport | null;
  /** File-level issues; per-sheet ones live on the sheet. */
  issues: ReadIssue[];
}

export interface ReadOptions {
  encoding?: EncodingId;
  repairMojibake?: boolean;
  delimiter?: string;
}

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
  /** Null when the sheet appears to have no header. */
  headerRowIndex: number | null;
  confidence: Confidence;
  /** Scores for the first HEADER_SCAN_ROWS rows, in row order. */
  scores: HeaderRowScore[];
  /** Suggestions only — dropping them is off by default. */
  footerCandidates: FooterRowCandidate[];
  /** An unnamed pandas/R index column (blank header, ascending integers), or null. */
  indexColumn: number | null;
}

export type DateFormat = 'iso' | 'us' | 'eu';

export type DateOrder = 'dmy' | 'mdy';

export type ColumnDecision = DateOrder | 'skip';

/** Accepted spelling merges for one column: value seen -> value to write. */
export type MergePlan = Record<string, string>;

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

export const INVISIBLE_CHARACTER_PATTERN =
  // Tab, newline and carriage return are left out: the whitespace options deal with them.
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\uFEFF\uFFF9-\uFFFC]/gu;

/** Spaces that are not the ordinary one. Replaced by a plain space, not deleted. */
export const ODD_SPACE_PATTERN = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/gu;

export interface CleanOptions {
  /** ORIGINAL row index of the header row; `null` means every row is data. */
  headerRowIndex: number | null;
  dropFooterRows: boolean;
  /** ORIGINAL row indexes to drop when `dropFooterRows` is on. */
  footerRowIndexes: readonly number[];

  dedupeRows: boolean;
  removeBlankRows: boolean;
  removeBlankColumns: boolean;
  /** Only applies when `removeBlankRows` is on and structure found an index column. */
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

  /** Keyed by ORIGINAL column index; plan keys are values AFTER whitespace and sentinel handling. */
  spellingMerges: Record<number, MergePlan>;
}

export interface LegacyCleanOptions extends Partial<CleanOptions> {
  /** @deprecated Use `collapseSpaces` and `flattenNewlines`. */
  collapseWhitespace?: boolean;
}

export const defaultOptions: CleanOptions = {
  // Replaced per file by StructureReport.headerRowIndex.
  headerRowIndex: 0,
  dropFooterRows: false,
  footerRowIndexes: [],

  dedupeRows: true,
  removeBlankRows: true,
  removeBlankColumns: true,
  ignoreIndexColumnInBlankRows: false,

  trimCells: true,
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

/** Always use this rather than spreading `defaultOptions`, whose record fields are shared. */
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
  /** Data rows once the header choice is applied. */
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

/** The array IS the wire format: a reason is stored as its index, so only ever append. */
export const REMOVAL_REASONS = [
  'duplicate',
  'blank',
  'preamble',
  'footer',
  'index-only',
  'header',
] as const;

export type RemovalReason = (typeof REMOVAL_REASONS)[number];

export interface RemovedRows {
  /** ORIGINAL row indexes, ascending. */
  indexes: Int32Array;
  /** Parallel to `indexes`: an index into REMOVAL_REASONS. */
  reasons: Uint8Array;
  /** Parallel to `indexes`: the row this duplicates, or -1. */
  duplicateOf: Int32Array;
  counts: Record<RemovalReason, number>;
}

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
  removedBecause: RemovalReason | null;
}

/** Rows the user asked to keep, by ORIGINAL row index, ascending. */
export type RescuePlan = readonly number[];

export type RescuedResult = CleanResult;

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
  /** Rows or cells affected, depending on `kind`. */
  count: number;
  /** ORIGINAL row indexes, capped at MAX_LINKED_ROWS. */
  rowIndexes: number[];
  /** True when `rowIndexes` was capped and `count` is the honest total. */
  truncated: boolean;
  columnIndex?: number;
  /** Header text at the time of the check. */
  columnName?: string;
  samples: string[];
}

export interface ChecksReport {
  findings: CheckFinding[];
  /** Rows actually scanned; large files are sampled. */
  rowsScanned: number;
  sampled: boolean;
}

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

export type OutputFormat = 'csv' | 'xlsx';

export const EXCEL_MAX_ROWS = 1_048_576;
export const EXCEL_MAX_COLUMNS = 16_384;
export const EXCEL_MAX_SHEET_NAME = 31;

/** A first character that could make a spreadsheet run the value. */
export const FORMULA_LEAD_PATTERN = /^[=@+-]/;
export const PLAIN_NUMBER_PATTERN = /^[+-]?(?:\d{1,3}(?:,\d{3})*|\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

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
  /** `ParsedSheet.index` values to write, in order; several sheets go out as a zip. */
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

export interface OutputLimits {
  rows: number;
  columns: number;
  rowsExceeded: boolean;
  columnsExceeded: boolean;
  /** The sheet that breaks a limit first, by `ParsedSheet.index`. */
  firstOffendingSheet: number | null;
}
