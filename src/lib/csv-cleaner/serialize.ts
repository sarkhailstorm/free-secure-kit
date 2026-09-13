/**
 * Turning the cleaned grid back into a file.
 *
 * Both writers build an in-memory Blob and hand it to the browser's own
 * download machinery — nothing is posted anywhere.
 */

import { baseName } from '@/lib/format';
import { safeFilename } from '@/lib/download';
import type { Grid } from './types';

/** sales.csv -> sales-cleaned.csv (and sales-cleaned.csv stays that, not -cleaned-cleaned). */
export function cleanedFilename(original: string, ext: 'csv' | 'xlsx'): string {
  const stem = baseName(original).replace(/[-_\s]*clean(ed)?$/i, '') || 'data';
  // `safeFilename` truncates at 180 characters, which would eat the extension
  // off a very long name and hand the user a file their OS cannot open. Cap
  // the stem instead so "-cleaned.xlsx" always survives.
  const capped = stem.slice(0, 120).trim() || 'data';
  return safeFilename(`${capped}-cleaned.${ext}`, `cleaned.${ext}`);
}

export async function gridToCsvBlob(grid: Grid, delimiter = ','): Promise<Blob> {
  const Papa = await import('papaparse');
  const csv = Papa.unparse([grid.header, ...grid.rows], {
    delimiter,
    newline: '\r\n',
  });
  // The BOM keeps Excel from mangling accented characters on Windows.
  return new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
}

export async function gridToXlsxBlob(grid: Grid, sheetName = 'Cleaned'): Promise<Blob> {
  const XLSX = await import('xlsx');
  // Every value is written as text on purpose: it is the only way leading
  // zeros, long IDs and phone numbers survive a round trip through Excel.
  const sheet = XLSX.utils.aoa_to_sheet([grid.header, ...grid.rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, safeSheetName(sheetName));
  const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Excel rejects these characters and any name over 31 characters. */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, '-').trim();
  return (cleaned || 'Cleaned').slice(0, 31);
}
