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

export interface WritableSheet extends OutputSheet {
  /** `ParsedSheet.index`, so `WriteOptions.sheets` can select it. */
  index: number;
}

/** Settings that come from the file that was read, not from anything the user picked. */
export interface SourceWriteOptions {
  /** Pass `parsed.delimiter?.sepLine !== null`; Excel needs its own `sep=` line back. */
  declaredSeparator?: boolean;
}

export interface WriteResult {
  blob: Blob;
  filename: string;
  /** Sheets written, in order, by `ParsedSheet.index`. */
  sheets: number[];
  /** Names as they were written — Excel's own rules shorten and de-clash them. */
  sheetNames: string[];
  /** Values given a visible leading apostrophe; always 0 for an Excel file. */
  formulasEscaped: number;
  /** Characters the chosen encoding has no byte for. Each was written as `?`. */
  unmappableCharacters: number;
}

export class OutputTooLargeError extends Error {
  readonly limits: OutputLimits;

  constructor(message: string, limits: OutputLimits) {
    super(message);
    this.name = 'OutputTooLargeError';
    this.limits = limits;
  }
}

// = and @ always; + and - only when the value is not a plain number, so -42 keeps its shape.
const NUMBER_BODY = PLAIN_NUMBER_PATTERN.source.replace(/^\^|\$$/g, '');

export const FORMULA_ESCAPE_PATTERN = new RegExp(`^(?:[=@]|(?!${NUMBER_BODY}$)[+-])`);

export function needsFormulaEscape(value: string): boolean {
  return FORMULA_ESCAPE_PATTERN.test(value);
}

/** CSV only: an Excel text cell never runs, and an apostrophe there would stay in the value. */
export function formulaEscapingApplies(format: OutputFormat): boolean {
  return format === 'csv';
}

/** Pass the format the user chose; the default overstates an Excel save. */
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

function widthOf(grid: Grid): number {
  let width = grid.header.length;
  for (const row of grid.rows) if (row.length > width) width = row.length;
  return width;
}

/** The largest sheet measured against Excel's limits; a CSV has no limits of its own. */
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

/** The only part of windows-1252 that is not the first 256 code points. */
const CP1252_HIGH = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

const CP1252_REVERSE = new Map<number, number>();
for (let i = 0; i < CP1252_HIGH.length; i += 1) {
  CP1252_REVERSE.set(CP1252_HIGH.codePointAt(i)!, 0x80 + i);
}

// TextEncoder is UTF-8 only by spec, so the reverse table is hand-rolled; anything with no byte becomes ?.
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

/** sales.csv -> sales-cleaned.csv (and sales-cleaned.csv stays that, not -cleaned-cleaned). */
export function cleanedFilename(original: string, ext: 'csv' | 'xlsx' | 'zip'): string {
  const stem = baseName(original).replace(/[-_\s]*clean(ed)?$/i, '') || 'data';
  // safeFilename truncates at 180, which would eat the extension, so cap the stem instead.
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

type CsvSettings = WriteOptions & SourceWriteOptions;

async function csvText(grid: Grid, options: CsvSettings): Promise<string> {
  const Papa = await import('papaparse');
  const delimiter = options.delimiter || ',';
  // papaparse 5.4.1 treats escapeFormulae: false like true, so the key must be left out entirely.
  const body = Papa.unparse([grid.header, ...grid.rows], {
    delimiter,
    newline: options.newline,
    ...(options.escapeFormulas ? { escapeFormulae: FORMULA_ESCAPE_PATTERN } : {}),
  });
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
    // Every value is written as text on purpose, so leading zeros and long IDs survive Excel.
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

/** Throws `OutputTooLargeError` for an xlsx that would break Excel's own limits. */
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

/** `reason` is non-null only when this format is the one being refused. */
export function canWrite(
  sheets: readonly OutputSheet[],
  format: OutputFormat,
): { ok: boolean; reason: string | null; limits: OutputLimits } {
  const limits = measureOutput(sheets);
  const ok = format === 'csv' || !(limits.rowsExceeded || limits.columnsExceeded);
  return { ok, reason: ok ? null : refusalMessage(limits), limits };
}

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
