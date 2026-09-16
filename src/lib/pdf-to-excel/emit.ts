import type { CellObject, WorkSheet } from 'xlsx';
import { PdfToolsError } from '@/lib/pdf-tools/errors';
import { COL_WIDTH_MAX, COL_WIDTH_MIN, DECIMALS_MAX, SHEET_NAME_MAX } from './constants';
import type { Cell, DateOrder, ExcelOptions, Row, RowFlag, Sheet } from './types';

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_MIME = 'text/csv;charset=utf-8';

/** Days between Excel's epoch and the Unix epoch, with Excel's 1900 leap-year bug. */
const EXCEL_EPOCH_OFFSET = 25_569;
const MS_PER_DAY = 86_400_000;

const FLAG_TEXT: Record<RowFlag, string> = {
  balance: 'Balance doesn’t add up',
  type: 'Something here isn’t a number',
  overflow: 'Text wider than its column',
  sparse: 'Almost nothing on this row',
  pageBreak: 'Split across two pages',
};

const DATE_FORMAT: Record<DateOrder, string> = {
  dmy: 'dd/mm/yyyy',
  mdy: 'mm/dd/yyyy',
  ymd: 'yyyy-mm-dd',
};

/** One spreadsheet's worth of a sheet: the header, the body, and the two extra columns. */
interface Layout {
  header: string[];
  rows: Row[];
  columnCount: number;
  pageColumn: boolean;
  checkColumn: boolean;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PdfToolsError('Cancelled.');
}

/** A date written through a Date object goes via the local timezone and can lose a day. */
function serial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY) + EXCEL_EPOCH_OFFSET;
}

function numberFormat(decimals: number): string {
  const digits = Math.max(0, Math.min(Math.round(decimals), DECIMALS_MAX));
  const base = digits > 0 ? `#,##0.${'0'.repeat(digits)}` : '#,##0';
  return `${base};-${base}`;
}

function rowReasons(row: Row): string {
  return row.flags
    .map((flag) =>
      flag === 'pageBreak' && row.endPage > row.page
        ? `Split across pages ${row.page} and ${row.endPage}`
        : FLAG_TEXT[flag],
    )
    .join('; ');
}

/** The header row is also rows[0]; written once, it must not be written again as a record. */
function bodyRows(sheet: Sheet): Row[] {
  const header = sheet.header;
  const first = sheet.rows[0];
  if (!header || !first) return [...sheet.rows];
  const same =
    first.cells.length === header.length &&
    first.cells.every((cell, i) => cell.raw.trim() === header[i].trim());
  return same ? sheet.rows.slice(1) : [...sheet.rows];
}

function layoutOf(sheet: Sheet, options: ExcelOptions): Layout {
  const rows = bodyRows(sheet);
  const names =
    sheet.header ?? sheet.columns.map((c, i) => c.header.trim() || `Column ${i + 1}`);
  const pageColumn = options.pageColumn !== false && sheet.pages.length > 1;
  const checkColumn = rows.some((row) => row.flags.length > 0);
  const header = [...names];
  if (pageColumn) header.push('Page');
  if (checkColumn) header.push('Check');
  return { header, rows, columnCount: sheet.columns.length, pageColumn, checkColumn };
}

/** What the cell says, as text. Numbers keep their own decimals, dates go ISO. */
function cellText(cell: Cell | undefined): string {
  if (!cell) return '';
  if (cell.offType) return cell.raw;
  const value = cell.value;
  if (value.kind === 'empty') return '';
  if (value.kind === 'number') return value.value.toFixed(value.decimals);
  if (value.kind === 'date') return value.iso;
  return cell.raw;
}

function rowText(layout: Layout, row: Row): string[] {
  const out: string[] = [];
  for (let c = 0; c < layout.columnCount; c++) out.push(cellText(row.cells[c]));
  if (layout.pageColumn) out.push(String(row.page));
  if (layout.checkColumn) out.push(rowReasons(row));
  return out;
}

function widths(header: readonly string[], grid: readonly string[][]): { wch: number }[] {
  return header.map((name, c) => {
    let longest = name.length;
    for (const row of grid) longest = Math.max(longest, (row[c] ?? '').length);
    return { wch: Math.max(COL_WIDTH_MIN, Math.min(longest + 2, COL_WIDTH_MAX)) };
  });
}

function uniqueName(title: string, used: Set<string>): string {
  const cleaned = title.replace(/[\\/?*[\]:]/g, '-').trim() || 'Table';
  let name = cleaned.slice(0, SHEET_NAME_MAX);
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n++})`;
    name = `${cleaned.slice(0, SHEET_NAME_MAX - suffix.length)}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
}

/** SheetJS 0.20.3 ignores ws['!freeze'], so the pane is patched into the saved file. */
async function freezeHeaders(bytes: Uint8Array, count: number): Promise<Uint8Array> {
  const pane =
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(bytes);
    for (let i = 0; i < count; i++) {
      const path = `xl/worksheets/sheet${i + 1}.xml`;
      const entry = zip.file(path);
      if (!entry) continue;
      const xml = await entry.async('string');
      zip.file(
        path,
        /<sheetView[^>]*\/>/.test(xml)
          ? xml.replace(/<sheetView([^>]*)\/>/, `<sheetView$1>${pane}</sheetView>`)
          : xml.replace(/(<sheetView[^>]*>)/, `$1${pane}`),
      );
    }
    return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  } catch {
    // A header that does not stay put is a small loss; losing the file is not.
    return bytes;
  }
}

export async function sheetsToXlsxBytes(
  sheets: readonly Sheet[],
  options: ExcelOptions,
): Promise<Uint8Array> {
  if (sheets.length === 0) {
    throw new PdfToolsError('There are no tables to save.');
  }
  throwIfAborted(options.signal);

  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  const used = new Set<string>();

  for (const sheet of sheets) {
    throwIfAborted(options.signal);
    const layout = layoutOf(sheet, options);
    const text = layout.rows.map((row) => rowText(layout, row));

    // Strings, numbers and blanks first; aoa_to_sheet cannot carry a format.
    const grid: (string | number | null)[][] = [[...layout.header]];
    for (let r = 0; r < layout.rows.length; r++) {
      const row = layout.rows[r];
      const line: (string | number | null)[] = [];
      for (let c = 0; c < layout.columnCount; c++) {
        const cell = row.cells[c];
        if (!cell || cell.offType || cell.value.kind === 'empty') {
          line.push(cell && cell.raw !== '' ? cell.raw : null);
        } else if (cell.value.kind === 'number') {
          line.push(cell.value.value);
        } else if (cell.value.kind === 'date') {
          line.push(serial(cell.value.iso));
        } else {
          line.push(cell.raw);
        }
      }
      if (layout.pageColumn) line.push(row.page);
      if (layout.checkColumn) line.push(rowReasons(row) || null);
      grid.push(line);
    }

    const ws: WorkSheet = XLSX.utils.aoa_to_sheet(grid);

    for (let c = 0; c < layout.columnCount; c++) {
      const column = sheet.columns[c];
      if (!column || (column.kind !== 'date' && column.kind !== 'money' && column.kind !== 'number')) {
        continue;
      }
      const format =
        column.kind === 'date'
          ? DATE_FORMAT[column.dateOrder ?? 'ymd']
          : numberFormat(column.decimals);
      for (let r = 0; r < layout.rows.length; r++) {
        const cell = layout.rows[r].cells[c];
        if (!cell || cell.offType) continue;
        if (cell.value.kind !== 'number' && cell.value.kind !== 'date') continue;
        const target = ws[XLSX.utils.encode_cell({ r: r + 1, c })] as CellObject | undefined;
        if (target) target.z = format;
      }
    }

    ws['!cols'] = widths(layout.header, text);
    if (layout.rows.length > 0) {
      const last = XLSX.utils.encode_col(layout.header.length - 1);
      ws['!autofilter'] = { ref: `A1:${last}${layout.rows.length + 1}` };
    }

    XLSX.utils.book_append_sheet(book, ws, uniqueName(sheet.title, used));
  }

  throwIfAborted(options.signal);
  const written = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return freezeHeaders(new Uint8Array(written), sheets.length);
}

export async function sheetsToXlsxBlob(
  sheets: readonly Sheet[],
  options: ExcelOptions,
): Promise<Blob> {
  return new Blob([await sheetsToXlsxBytes(sheets, options)], { type: XLSX_MIME });
}

export async function sheetToCsvText(sheet: Sheet, options: ExcelOptions): Promise<string> {
  throwIfAborted(options.signal);
  const Papa = await import('papaparse');
  const layout = layoutOf(sheet, options);
  const grid = layout.rows.map((row) => rowText(layout, row));
  // The BOM keeps Excel from mangling accented characters on Windows.
  return `﻿${Papa.unparse([layout.header, ...grid], { delimiter: ',', newline: '\r\n' })}`;
}

export async function sheetToCsvBytes(
  sheet: Sheet,
  options: ExcelOptions,
): Promise<Uint8Array> {
  return new TextEncoder().encode(await sheetToCsvText(sheet, options));
}

export async function sheetToCsvBlob(sheet: Sheet, options: ExcelOptions): Promise<Blob> {
  return new Blob([await sheetToCsvText(sheet, options)], { type: CSV_MIME });
}
