import type { Pt } from '@/lib/pdf-to-word/types';

export type ColumnKind = 'text' | 'date' | 'number' | 'money';
export type ColumnAlign = 'left' | 'right' | 'ragged';
export type TablePath = 'tagged' | 'ruled' | 'columns';
export type DateOrder = 'dmy' | 'mdy' | 'ymd';

export interface Column {
  index: number;
  /** Page-space interval this column occupies, left to right. */
  x0: Pt;
  x1: Pt;
  align: ColumnAlign;
  kind: ColumnKind;
  /** Header text, or '' when the table has no header row. */
  header: string;
  /** Decimals to show. number | money only. */
  decimals: number;
  /** How this document writes a numeric date. date only. */
  dateOrder: DateOrder | null;
  /** Its values are read as a running balance. */
  balance: boolean;
  /** How many cells decided `kind`, and how many agreed. */
  sampled: number;
  agreed: number;
}

export type CellValue =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | {
      kind: 'number';
      value: number;
      decimals: number;
      currency: string | null;
      marker: 'CR' | 'DR' | null;
    }
  | { kind: 'date'; iso: string; ambiguous: boolean };

export interface Cell {
  /** Exactly as it reads on the page. Never discarded, never rewritten. */
  raw: string;
  value: CellValue;
  /** raw is not empty but did not match the column's kind. */
  offType: boolean;
}

export type RowFlag =
  | 'balance' // the running balance does not follow from the row's own amounts
  | 'type' // a cell does not match its column's kind
  | 'overflow' // a text run crossed a column boundary
  | 'sparse' // fewer than two cells have anything in them
  | 'pageBreak'; // the record was stitched across a page break

export interface Row {
  cells: Cell[];
  /** 1-based page the record starts on. */
  page: number;
  /** Same as `page` unless the record continued onto the next one. */
  endPage: number;
  flags: RowFlag[];
  /** flags.length === 0 */
  ok: boolean;
}

export interface SheetNote {
  code:
    | 'headerRepeated' // a repeated header row was dropped
    | 'rowsMissing' // more baselines inside the grid than the grid has rows
    | 'ambiguousDates' // a numeric date column was settled by a document-wide vote
    | 'balanceUnchecked' // no running balance could be identified
    | 'balanceBreaks' // n rows do not reconcile
    | 'pageNotRead'; // a page was left out of this sheet
  count?: number;
  pages?: number[];
  detail?: string;
}

export interface Sheet {
  id: string;
  /** 'Table 1', or the file's own name when there is only one. */
  title: string;
  path: TablePath;
  columns: Column[];
  /** Header row text, or null when the table has no header. */
  header: string[] | null;
  rows: Row[];
  /** 1-based pages this sheet drew from, ascending. */
  pages: number[];
  /** rows.filter(ok).length / rows.length, 1 when there are no rows. */
  confidence: number;
  notes: SheetNote[];
}

export interface ExcelWorkbook {
  sheets: Sheet[];
  pageCount: number;
  /** Pages with no text on them at all — nothing can be read from these. */
  imagePages: number[];
  /** Pages with text that produced no table. */
  skippedPages: number[];
  /** Pages that threw while being read. */
  failedPages: number[];
}

export type ExcelFormat = 'xlsx' | 'csv';

export interface ExcelOptions {
  /** Sheet ids to write. Empty or omitted means every sheet. */
  include?: readonly string[];
  format: ExcelFormat;
  /** Add a trailing "Page" column on a sheet that spans more than one page. Default true. */
  pageColumn?: boolean;
  signal?: AbortSignal;
}

export type ExcelStage = 'reading' | 'finding' | 'checking' | 'writing';

export interface ExcelProgress {
  stage: ExcelStage;
  done: number;
  total: number;
  page?: number;
}

export interface ExcelResult {
  bytes: Uint8Array;
  filename: string;
  mime: string;
  written: string[];
}
