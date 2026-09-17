/**
 * Turning cleaned grids back into a file.
 *
 * Everything is built as an in-memory Blob and handed to the browser's own
 * download machinery — nothing is posted anywhere.
 */

import { baseName } from '@/lib/format';
import { safeFilename } from '@/lib/download';
import {
  EXCEL_MAX_COLUMNS,
  EXCEL_MAX_ROWS,
  EXCEL_MAX_SHEET_NAME,
  PLAIN_NUMBER_PATTERN,
  defaultWriteOptions,
} from './types';
import type { Grid, OutputFormat, OutputLimits, OutputSheet, WriteOptions } from './types';

export const CSV_MIME = 'text/csv';
export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const ZIP_MIME = 'application/zip';

/** An `OutputSheet` that still knows which `ParsedSheet` it came from. */
export interface WritableSheet extends OutputSheet {
  /** `ParsedSheet.index`, so `WriteOptions.sheets` can select it. */
  index: number;
}

/**
 * Settings that go with `WriteOptions` but come from the file that was read
 * rather than from anything the user picked.
 */
export interface SourceWriteOptions {
  /**
   * True when the file arrived with a `sep=` line of its own. Excel puts that
   * line at the top when it saves, and needs it back to open the file the same
   * way, so it is written again — naming whatever separator is being used now.
   *
   * Pass `parsed.delimiter?.sepLine !== null`.
   */
  declaredSeparator?: boolean;
}

export interface WriteResult {
  blob: Blob;
  filename: string;
  /** Sheets written, in order, by `ParsedSheet.index`. */
  sheets: number[];
  /** Names as they were written — Excel's own rules shorten and de-clash them. */
  sheetNames: string[];
  /**
   * Values given a leading apostrophe. The apostrophe is visible in the file.
   * Always 0 for an Excel file — see `formulaEscapingApplies`.
   */
  formulasEscaped: number;
  /** Characters the chosen encoding has no byte for. Each was written as `?`. */
  unmappableCharacters: number;
}

/** Thrown instead of writing a file the user's spreadsheet would call corrupt. */
export class OutputTooLargeError extends Error {
  readonly limits: OutputLimits;

  constructor(message: string, limits: OutputLimits) {
    super(message);
    this.name = 'OutputTooLargeError';
    this.limits = limits;
  }
}

// ── Formula escaping ─────────────────────────────────────────────────────

// `=` and `@` always; `+` and `-` only when the whole value is not a plain
// number, so `-42` in an accounts file keeps its own shape. Derived from
// PLAIN_NUMBER_PATTERN rather than restated, so the two cannot drift.
const NUMBER_BODY = PLAIN_NUMBER_PATTERN.source.replace(/^\^|\$$/g, '');

export const FORMULA_ESCAPE_PATTERN = new RegExp(`^(?:[=@]|(?!${NUMBER_BODY}$)[+-])`);

export function needsFormulaEscape(value: string): boolean {
  return FORMULA_ESCAPE_PATTERN.test(value);
}

/**
 * Whether an apostrophe is added at all, for the format being saved.
 *
 * CSV only. A CSV has no cell types, so a spreadsheet opening one decides what
 * each value is from its first character, and `=SUM(A1:A2)` becomes a live sum.
 * In an Excel file every value written here is a text cell with no formula
 * attached to it, which Excel shows as it stands and never runs, so there is
 * nothing to guard against — and an apostrophe added anyway would not be a
 * hint to Excel, it would become part of the value and stay there for good.
 */
export function formulaEscapingApplies(format: OutputFormat): boolean {
  return format === 'csv';
}

/**
 * How many values would gain an apostrophe, so the UI can say so before writing.
 *
 * Pass the format the user has chosen. Without it the answer is the CSV one,
 * which overstates an Excel save — nothing gains an apostrophe there.
 */
export function countFormulaRisks(sheets: readonly OutputSheet[], format: OutputFormat = 'csv'): number {
  if (!formulaEscapingApplies(format)) return 0;
  let count = 0;
  for (const sheet of sheets) {
    for (const cell of sheet.grid.header) if (needsFormulaEscape(cell)) count += 1;
    for (const row of sheet.grid.rows) {
      for (const cell of row) if (needsFormulaEscape(cell)) count += 1;
    }
  }
  return count;
}

// ── Size ─────────────────────────────────────────────────────────────────

function widthOf(grid: Grid): number {
  let width = grid.header.length;
  for (const row of grid.rows) if (row.length > width) width = row.length;
  return width;
}

/**
 * The largest sheet measured against Excel's limits.
 *
 * A CSV has no limits of its own, so this is a warning there and a refusal for
 * xlsx: `aoa_to_sheet` on 17,000 columns writes a file without complaint that
 * Excel then refuses to open.
 */
export function measureOutput(sheets: readonly OutputSheet[]): OutputLimits {
  const limits: OutputLimits = {
    rows: 0,
    columns: 0,
    rowsExceeded: false,
    columnsExceeded: false,
    firstOffendingSheet: null,
  };

  sheets.forEach((sheet, position) => {
    const rows = sheet.grid.rows.length + 1; // the header occupies a row too
    const columns = widthOf(sheet.grid);
    if (rows > limits.rows) limits.rows = rows;
    if (columns > limits.columns) limits.columns = columns;

    const over = rows > EXCEL_MAX_ROWS || columns > EXCEL_MAX_COLUMNS;
    if (over && limits.firstOffendingSheet === null) {
      const indexed = sheet as Partial<WritableSheet>;
      limits.firstOffendingSheet = indexed.index ?? position;
    }
  });

  limits.rowsExceeded = limits.rows > EXCEL_MAX_ROWS;
  limits.columnsExceeded = limits.columns > EXCEL_MAX_COLUMNS;
  return limits;
}

function refusalMessage(limits: OutputLimits): string {
  const has: string[] = [];
  const allows: string[] = [];
  if (limits.columnsExceeded) {
    has.push(`${limits.columns.toLocaleString()} columns`);
    allows.push(`${EXCEL_MAX_COLUMNS.toLocaleString()} columns`);
  }
  if (limits.rowsExceeded) {
    has.push(`${limits.rows.toLocaleString()} rows`);
    allows.push(`${EXCEL_MAX_ROWS.toLocaleString()} rows`);
  }
  return `This has ${has.join(' and ')}, and an Excel file can only hold ${allows.join(' and ')}. Save it as a CSV instead — a CSV has no limit.`;
}

// ── Text encoding on the way out ─────────────────────────────────────────

/** The only part of windows-1252 that is not the first 256 code points. */
const CP1252_HIGH = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

const CP1252_REVERSE = new Map<number, number>();
for (let i = 0; i < CP1252_HIGH.length; i += 1) {
  CP1252_REVERSE.set(CP1252_HIGH.codePointAt(i)!, 0x80 + i);
}

/**
 * TextEncoder is UTF-8 only — its constructor argument is ignored by spec — so
 * the reverse table is hand-rolled. Anything with no byte becomes `?`.
 */
function encodeWindows1252(text: string): { bytes: Uint8Array; unmappable: number } {
  const bytes = new Uint8Array(text.length);
  let length = 0;
  let unmappable = 0;

  for (const character of text) {
    const code = character.codePointAt(0)!;
    let byte: number | undefined;
    if (code <= 0xff && !(code >= 0x80 && code <= 0x9f)) byte = code;
    else byte = CP1252_REVERSE.get(code) ?? (code >= 0x80 && code <= 0x9f ? code : undefined);

    if (byte === undefined) {
      unmappable += 1;
      byte = 0x3f;
    }
    bytes[length] = byte;
    length += 1;
  }
  return { bytes: bytes.subarray(0, length), unmappable };
}

/** Kept as separate parts: joining them would copy the whole file again. */
function encodeText(
  text: string,
  options: WriteOptions,
): { parts: Uint8Array[]; charset: string; unmappable: number } {
  if (options.encoding === 'windows-1252') {
    // There is no byte-order mark for a single-byte encoding, so `bom` is moot.
    const { bytes, unmappable } = encodeWindows1252(text);
    return { parts: [bytes], charset: 'windows-1252', unmappable };
  }
  const body = new TextEncoder().encode(text);
  const parts = options.bom ? [new Uint8Array([0xef, 0xbb, 0xbf]), body] : [body];
  return { parts, charset: 'utf-8', unmappable: 0 };
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ── Names ────────────────────────────────────────────────────────────────

/** sales.csv -> sales-cleaned.csv (and sales-cleaned.csv stays that, not -cleaned-cleaned). */
export function cleanedFilename(original: string, ext: 'csv' | 'xlsx' | 'zip'): string {
  const stem = baseName(original).replace(/[-_\s]*clean(ed)?$/i, '') || 'data';
  // `safeFilename` truncates at 180 characters, which would eat the extension
  // off a very long name and hand the user a file their OS cannot open. Cap
  // the stem instead so "-cleaned.xlsx" always survives.
  const capped = stem.slice(0, 120).trim() || 'data';
  return safeFilename(`${capped}-cleaned.${ext}`, `cleaned.${ext}`);
}

/** Excel rejects these characters, any name over 31 characters, and any repeat. */
function uniqueSheetName(name: string, used: Set<string>): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, '-').trim() || 'Sheet';
  let candidate = cleaned.slice(0, EXCEL_MAX_SHEET_NAME);
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    n += 1;
    candidate = `${cleaned.slice(0, EXCEL_MAX_SHEET_NAME - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function uniqueEntryName(name: string, used: Set<string>): string {
  const stem = safeFilename(name.replace(/[\\/]/g, '-').trim(), 'sheet').slice(0, 120) || 'sheet';
  let candidate = `${stem}.csv`;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem} (${n}).csv`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

// ── Writing ──────────────────────────────────────────────────────────────

function selectSheets(
  available: readonly WritableSheet[],
  wanted: readonly number[],
): WritableSheet[] {
  if (wanted.length === 0) return [...available];
  const byIndex = new Map(available.map((sheet) => [sheet.index, sheet]));
  const picked: WritableSheet[] = [];
  for (const index of wanted) {
    const sheet = byIndex.get(index);
    if (sheet) picked.push(sheet);
  }
  return picked.length > 0 ? picked : [...available];
}

/** `WriteOptions` once the reader's own settings are folded in. */
type CsvSettings = WriteOptions & SourceWriteOptions;

async function csvText(grid: Grid, options: CsvSettings): Promise<string> {
  const Papa = await import('papaparse');
  const delimiter = options.delimiter || ',';
  // papaparse 5.4.1 treats `escapeFormulae: false` exactly like `true`, so the
  // key has to be left out entirely when escaping is off.
  const body = Papa.unparse([grid.header, ...grid.rows], {
    delimiter,
    newline: options.newline,
    ...(options.escapeFormulas ? { escapeFormulae: FORMULA_ESCAPE_PATTERN } : {}),
  });
  // The file told us which separator it used; it gets to keep saying so.
  return options.declaredSeparator ? `sep=${delimiter}${options.newline}${body}` : body;
}

async function writeCsv(
  sheets: readonly WritableSheet[],
  options: CsvSettings,
  filename: string,
): Promise<WriteResult> {
  const escaped = options.escapeFormulas ? countFormulaRisks(sheets, 'csv') : 0;

  if (sheets.length === 1) {
    const text = await csvText(sheets[0].grid, options);
    const { parts, charset, unmappable } = encodeText(text, options);
    return {
      blob: new Blob(parts, { type: `${CSV_MIME};charset=${charset}` }),
      filename,
      sheets: [sheets[0].index],
      sheetNames: [sheets[0].name],
      formulasEscaped: escaped,
      unmappableCharacters: unmappable,
    };
  }

  // One CSV holds one sheet, so several sheets go out as a zip of one each.
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const usedNames = new Set<string>();
  const names: string[] = [];
  let unmappable = 0;

  for (const sheet of sheets) {
    const text = await csvText(sheet.grid, options);
    const encoded = encodeText(text, options);
    unmappable += encoded.unmappable;
    const entry = uniqueEntryName(sheet.name, usedNames);
    names.push(entry);
    zip.file(entry, concat(encoded.parts));
  }

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return {
    blob: new Blob([bytes], { type: ZIP_MIME }),
    filename: filename.replace(/\.csv$/i, '.zip'),
    sheets: sheets.map((sheet) => sheet.index),
    sheetNames: names,
    formulasEscaped: escaped,
    unmappableCharacters: unmappable,
  };
}

async function writeXlsx(
  sheets: readonly WritableSheet[],
  filename: string,
): Promise<WriteResult> {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  const used = new Set<string>();
  const names: string[] = [];

  for (const sheet of sheets) {
    // Every value is written as text on purpose: it is the only way leading
    // zeros, long IDs and phone numbers survive a round trip through Excel.
    // Text cells are also inert, so no apostrophe is added — see
    // `formulaEscapingApplies` for why, and for what the UI must not claim.
    const ws = XLSX.utils.aoa_to_sheet([sheet.grid.header, ...sheet.grid.rows]);
    const name = uniqueSheetName(sheet.name, used);
    names.push(name);
    XLSX.utils.book_append_sheet(book, ws, name);
  }

  const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return {
    blob: new Blob([bytes], { type: XLSX_MIME }),
    filename,
    sheets: sheets.map((sheet) => sheet.index),
    sheetNames: names,
    formulasEscaped: 0,
    unmappableCharacters: 0,
  };
}

/**
 * Write the chosen sheets.
 *
 * Throws `OutputTooLargeError` for an Excel file that would break Excel's own
 * limits, rather than handing back something it calls corrupt.
 */
export async function writeOutput(
  available: readonly WritableSheet[],
  options: Partial<WriteOptions> & SourceWriteOptions = {},
  originalFilename = 'data.csv',
): Promise<WriteResult> {
  const settings: CsvSettings = { ...defaultWriteOptions, ...options };
  const sheets = selectSheets(available, settings.sheets);
  if (sheets.length === 0) throw new Error('There is nothing to save.');

  if (settings.format === 'xlsx') {
    const limits = measureOutput(sheets);
    if (limits.rowsExceeded || limits.columnsExceeded) {
      throw new OutputTooLargeError(refusalMessage(limits), limits);
    }
    return writeXlsx(sheets, cleanedFilename(originalFilename, 'xlsx'));
  }
  return writeCsv(sheets, settings, cleanedFilename(originalFilename, 'csv'));
}

/**
 * Whether `writeOutput` would refuse this format.
 *
 * `reason` is set only when this format is the one being refused. A CSV has no
 * limit, so a sheet too big for Excel is still a perfectly good CSV and there
 * is nothing to warn about — the UI shows `reason` and stops the save.
 */
export function canWrite(
  sheets: readonly OutputSheet[],
  format: OutputFormat,
): { ok: boolean; reason: string | null; limits: OutputLimits } {
  const limits = measureOutput(sheets);
  const ok = format === 'csv' || !(limits.rowsExceeded || limits.columnsExceeded);
  return { ok, reason: ok ? null : refusalMessage(limits), limits };
}

// ── The two older helpers, kept so single-sheet callers need not change ───

export async function gridToCsvBlob(
  grid: Grid,
  delimiter = ',',
  options: Partial<WriteOptions> & SourceWriteOptions = {},
): Promise<Blob> {
  const result = await writeCsv([{ index: 0, name: 'Cleaned', grid }], {
    ...defaultWriteOptions,
    ...options,
    delimiter,
  }, 'data.csv');
  return result.blob;
}

export async function gridToXlsxBlob(grid: Grid, sheetName = 'Cleaned'): Promise<Blob> {
  const sheets: WritableSheet[] = [{ index: 0, name: sheetName, grid }];
  const limits = measureOutput(sheets);
  if (limits.rowsExceeded || limits.columnsExceeded) {
    throw new OutputTooLargeError(refusalMessage(limits), limits);
  }
  return (await writeXlsx(sheets, 'data.xlsx')).blob;
}
