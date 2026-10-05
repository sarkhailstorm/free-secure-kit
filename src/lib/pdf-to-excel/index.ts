import type { LoadedPdf } from '@/lib/pdf-tools/pdf';
import { findTables, writeTables } from './convert';
import type { ExcelOptions, ExcelProgress, ExcelResult } from './types';

export { PAGE_WARN_THRESHOLD } from './constants';
export { findTables, writeTables };

export type {
  Cell,
  CellValue,
  Column,
  ColumnAlign,
  ColumnKind,
  DateOrder,
  ExcelFormat,
  ExcelOptions,
  ExcelProgress,
  ExcelResult,
  ExcelStage,
  ExcelWorkbook,
  Row,
  RowFlag,
  Sheet,
  SheetNote,
  TablePath,
} from './types';

// Both halves in one call, for a caller that does not need the preview
export async function pdfToExcel(
  source: LoadedPdf,
  options: ExcelOptions,
  onProgress: (progress: ExcelProgress) => void,
): Promise<ExcelResult> {
  const workbook = await findTables(source, options, onProgress);
  return writeTables(workbook, options, onProgress);
}
