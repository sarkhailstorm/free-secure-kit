/**
 * Reading the uploaded file.
 *
 * papaparse and SheetJS are both large, so they are imported dynamically inside
 * these functions and never at module scope — the tool page stays small until
 * someone actually drops a file on it.
 *
 * Nothing here touches the network. `File.text()` / `File.arrayBuffer()` read
 * the bytes the browser already has; no request is made and no copy leaves the
 * page.
 */

import { extension } from '@/lib/format';
import type { Grid, ParsedFile, ParsedSheet } from './types';

/** Files above this size are refused rather than freezing the tab. */
export const MAX_BYTES = 60 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = ['csv', 'tsv', 'txt', 'xlsx', 'xls', 'xlsm'] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',');

export class ParseFailure extends Error {}

/**
 * Square off a ragged table so every row has the same number of cells.
 *
 * Also reports how many rows were the wrong length. Papaparse only checks that
 * in header mode, which this tool cannot use — a messy file is exactly the case
 * where the header row is not yet trustworthy.
 */
function toGrid(rows: string[][]): { grid: Grid; ragged: number } {
  let width = 0;
  for (const row of rows) width = Math.max(width, row.length);
  if (width === 0) return { grid: { header: [], rows: [] }, ragged: 0 };

  let ragged = 0;
  const padded = rows.map((row) => {
    if (row.length !== width) ragged += 1;
    const out = new Array<string>(width);
    for (let i = 0; i < width; i += 1) out[i] = row[i] ?? '';
    return out;
  });

  const header = padded.shift() ?? new Array<string>(width).fill('');
  return { grid: { header, rows: padded }, ragged };
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) {
    // SheetJS builds Dates in local time, so read them back in local time.
    const y = String(value.getFullYear()).padStart(4, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    const hasTime =
      value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0;
    if (!hasTime) return `${y}-${m}-${d}`;
    const hh = String(value.getHours()).padStart(2, '0');
    const mm = String(value.getMinutes()).padStart(2, '0');
    const ss = String(value.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }
  return String(value);
}

async function parseDelimited(file: File, kind: 'csv' | 'tsv'): Promise<ParsedFile> {
  const Papa = await import('papaparse');
  const text = (await file.text()).replace(/^﻿/, '');

  if (text.trim() === '') {
    throw new ParseFailure('That file is empty — there are no rows to clean.');
  }

  const result = Papa.parse<string[]>(text, {
    // An empty delimiter lets papaparse sniff it; tabs are stated outright.
    delimiter: kind === 'tsv' ? '\t' : '',
    skipEmptyLines: false,
    header: false,
    dynamicTyping: false,
  });

  const rows = result.data.filter(Array.isArray).map((row) => row.map(cellToString));

  // Almost every CSV ends with a newline, and papaparse turns that final line
  // terminator into one extra row holding a single empty string. It is an
  // artefact of the file ending, not a blank row the user typed, so drop it —
  // otherwise every well-formed file would be reported as ragged and as having
  // had "1 blank row removed", and a clean file could never say it was clean.
  const lastRow = rows[rows.length - 1];
  if (rows.length > 1 && lastRow.length === 1 && lastRow[0] === '' && /[\r\n]$/.test(text)) {
    rows.pop();
  }

  if (rows.length === 0) {
    throw new ParseFailure('Nothing could be read from that file — is it really a CSV?');
  }

  const { grid, ragged } = toGrid(rows);

  // A ragged file is exactly what this tool exists to tidy up, so these are
  // notes rather than failures.
  const notes: string[] = [];
  if (ragged > 0) {
    notes.push(
      `${ragged.toLocaleString()} row${ragged === 1 ? ' has' : 's have'} a different number of columns to the widest row — the short ones were padded with blanks.`,
    );
  }
  const quoteIssues = result.errors.filter((e) => e.code === 'MissingQuotes').length;
  if (quoteIssues > 0) {
    notes.push(
      `${quoteIssues.toLocaleString()} row${quoteIssues === 1 ? ' has' : 's have'} an unclosed quote, so some values may have run together.`,
    );
  }

  return {
    filename: file.name,
    kind,
    sheets: [{ name: kind === 'tsv' ? 'Sheet' : 'CSV', grid }],
    notes,
  };
}

async function parseWorkbook(file: File): Promise<ParsedFile> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();

  let workbook: import('xlsx').WorkBook;
  try {
    workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
  } catch {
    throw new ParseFailure(
      'That workbook could not be opened. It may be password-protected or not really a spreadsheet.',
    );
  }

  const sheets: ParsedSheet[] = [];
  for (const name of workbook.SheetNames) {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) continue;
    const raw = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: true,
      defval: '',
      blankrows: true,
    });
    const rows = raw.filter(Array.isArray).map((row) => row.map(cellToString));
    sheets.push({ name, grid: toGrid(rows).grid });
  }

  if (sheets.length === 0) {
    throw new ParseFailure('That workbook has no sheets in it.');
  }

  if (sheets.every((s) => s.grid.header.length === 0)) {
    throw new ParseFailure('Every sheet in that workbook is empty.');
  }

  const notes: string[] = [];
  const emptySheets = sheets.filter((s) => s.grid.header.length === 0).length;
  if (emptySheets > 0) {
    notes.push(
      `${emptySheets} sheet${emptySheets === 1 ? ' is' : 's are'} empty and cannot be cleaned.`,
    );
  }

  return { filename: file.name, kind: 'excel', sheets, notes };
}

/** Read a dropped file into one or more grids of strings. */
export async function parseFile(file: File): Promise<ParsedFile> {
  if (file.size > MAX_BYTES) {
    throw new ParseFailure(
      'That file is larger than 60 MB. Everything runs in this tab, so very large files would freeze it.',
    );
  }
  if (file.size === 0) {
    throw new ParseFailure('That file is empty.');
  }

  const ext = extension(file.name);
  switch (ext) {
    case 'xlsx':
    case 'xls':
    case 'xlsm':
      return parseWorkbook(file);
    case 'tsv':
      return parseDelimited(file, 'tsv');
    case 'csv':
    case 'txt':
    case '':
      return parseDelimited(file, 'csv');
    default:
      throw new ParseFailure(
        `.${ext} files are not supported — try a .csv, .tsv or .xlsx file instead.`,
      );
  }
}
