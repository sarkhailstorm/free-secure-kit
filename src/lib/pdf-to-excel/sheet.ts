import { parseAmount, typeCell, typeColumns } from './cells';
import type { DetectedTable } from './detect/tables';
import { dropRepeatedHeader, groupCellRows, type RawRow } from './rows';
import type { Cell, Row, Sheet, SheetNote } from './types';

/** A first row with no amount anywhere in it and something in at least two cells. */
function looksLikeHeader(row: RawRow | undefined): boolean {
  if (!row) return false;
  const filled = row.cells.filter((cell) => cell.trim() !== '');
  if (filled.length < 2) return false;
  return filled.every((cell) => parseAmount(cell) === null);
}

const asText = (raw: string): Cell => ({
  raw,
  value: raw.trim() === '' ? { kind: 'empty' } : { kind: 'text', text: raw.trim() },
  offType: false,
});

export const sheetConfidence = (sheet: Sheet): number =>
  sheet.rows.length === 0 ? 1 : sheet.rows.filter((row) => row.ok).length / sheet.rows.length;

function buildOne(table: DetectedTable, id: string, title: string): Sheet {
  // Money columns decide where a record starts; only the column rung knows them from geometry.
  const moneyCols =
    table.moneyCols ??
    typeColumns(table.rows, null, null)
      .map((column, i) => (column.kind === 'money' || column.kind === 'number' ? i : -1))
      .filter((i) => i >= 0);

  const grouped = groupCellRows(table.rows, moneyCols);
  const { rows: kept, dropped } = dropRepeatedHeader(grouped);
  const notes: SheetNote[] = [...table.notes];
  if (dropped > 0) notes.push({ code: 'headerRepeated', count: dropped });

  const header = looksLikeHeader(kept[0]) ? kept[0].cells.map((cell) => cell.trim()) : null;
  const columns = typeColumns(kept, table.profile, header);

  const rows: Row[] = kept.map((raw, index) => {
    const isHeader = header !== null && index === 0;
    const cells = columns.map((column, c) =>
      isHeader ? asText(raw.cells[c] ?? '') : typeCell(raw.cells[c] ?? '', column),
    );
    const flags = [...raw.flags];
    if (cells.some((cell) => cell.offType) && !flags.includes('type')) flags.push('type');
    return { cells, page: raw.page, endPage: raw.endPage, flags, ok: flags.length === 0 };
  });

  const voted = columns.find(
    (column) =>
      column.kind === 'date' &&
      rows.some((row) => {
        const value = row.cells[column.index]?.value;
        return value !== undefined && value.kind === 'date' && value.ambiguous;
      }),
  );
  if (voted) {
    notes.push({
      code: 'ambiguousDates',
      detail:
        voted.dateOrder === 'mdy'
          ? 'Dates here were read as month, day, year.'
          : 'Dates here were read as day, month, year.',
    });
  }

  const sheet: Sheet = {
    id,
    title,
    path: table.path,
    columns,
    header,
    rows,
    pages: [...table.pages].sort((a, b) => a - b),
    confidence: 1,
    notes,
  };
  sheet.confidence = sheetConfidence(sheet);
  return sheet;
}

/** Every detected table as a finished sheet, before the balance check runs over it. */
export function buildSheets(tables: readonly DetectedTable[], documentName: string): Sheet[] {
  const sheets = tables.map((table, i) => buildOne(table, `sheet-${i + 1}`, `Table ${i + 1}`));
  if (sheets.length === 1 && documentName.trim() !== '') sheets[0].title = documentName.trim();
  return sheets.filter((sheet) => sheet.rows.length > 0);
}
