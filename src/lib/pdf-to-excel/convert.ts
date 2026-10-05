import { PdfToolsError } from '@/lib/pdf-tools/errors';
import { baseName } from '@/lib/format';
import { tick, type LoadedPdf } from '@/lib/pdf-tools/pdf';
import { openDocument } from '@/lib/pdf-to-word/convert';
import { applyBalance, findBalance } from './balance';
import { detectTables } from './detect/tables';
import { CSV_MIME, XLSX_MIME, sheetToCsvBytes, sheetsToXlsxBytes } from './emit';
import { readPages } from './extract/read';
import { buildSheets, sheetConfidence } from './sheet';
import type { ExcelOptions, ExcelProgress, ExcelResult, ExcelWorkbook } from './types';

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PdfToolsError('Cancelled.');
}

export async function findTables(
  source: LoadedPdf,
  options: ExcelOptions,
  onProgress: (progress: ExcelProgress) => void,
): Promise<ExcelWorkbook> {
  const doc = await openDocument(source);

  try {
    const total = doc.numPages;
    const { pages, failed } = await readPages(doc, options, (page) => {
      onProgress({ stage: 'reading', done: page - 1, total, page });
    });

    throwIfAborted(options.signal);
    onProgress({ stage: 'finding', done: total, total });
    await tick();

    const found = detectTables(pages);

    throwIfAborted(options.signal);
    onProgress({ stage: 'checking', done: total, total });
    await tick();

    const sheets = buildSheets(found.tables, baseName(source.name));
    for (const sheet of sheets) {
      applyBalance(sheet, findBalance(sheet));
      // applyBalance only flags, so the confidence has to be taken after it
      sheet.confidence = sheetConfidence(sheet);
    }

    const drawn = new Set(sheets.flatMap((sheet) => sheet.pages));
    return {
      sheets,
      pageCount: total,
      imagePages: pages.filter((page) => page.cls !== 'text').map((page) => page.pageNumber),
      skippedPages: found.skippedPages.filter((page) => !drawn.has(page)),
      failedPages: failed,
    };
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

export async function writeTables(
  workbook: ExcelWorkbook,
  options: ExcelOptions,
  onProgress: (progress: ExcelProgress) => void,
): Promise<ExcelResult> {
  const wanted = options.include;
  const sheets =
    wanted && wanted.length > 0
      ? workbook.sheets.filter((sheet) => wanted.includes(sheet.id))
      : workbook.sheets;
  if (sheets.length === 0) throw new PdfToolsError('There are no tables to save.');

  throwIfAborted(options.signal);
  onProgress({ stage: 'writing', done: 0, total: sheets.length });
  // The spreadsheet is built in one synchronous go, so the label has to land before it starts
  await tick();

  if (options.format === 'csv') {
    const bytes = await sheetToCsvBytes(sheets[0], options);
    onProgress({ stage: 'writing', done: 1, total: 1 });
    return { bytes, filename: 'table.csv', mime: CSV_MIME, written: [sheets[0].id] };
  }

  const bytes = await sheetsToXlsxBytes(sheets, options);
  onProgress({ stage: 'writing', done: sheets.length, total: sheets.length });
  return {
    bytes,
    filename: 'table.xlsx',
    mime: XLSX_MIME,
    written: sheets.map((sheet) => sheet.id),
  };
}
