import type { Line, Pt } from '@/lib/pdf-to-word/types';
import { cellsOfLine, lineRuns, type ColumnProfile } from './detect/columns';
import type { RowFlag } from './types';

export interface RawRow {
  cells: string[];
  page: number;
  endPage: number;
  flags: RowFlag[];
}

/** A band line with the page it came from: Line itself carries no page number. */
export interface BandLine {
  line: Line;
  page: number;
}

export interface CellRow {
  cells: string[];
  page: number;
  /** Text here was wider than its column. */
  overflow?: boolean;
}

const filled = (cells: readonly string[]): number =>
  cells.filter((cell) => cell.trim() !== '').length;

const startsRecord = (cells: readonly string[], moneyCols: readonly number[]): boolean =>
  (cells[0] ?? '').trim() !== '' || moneyCols.some((c) => (cells[c] ?? '').trim() !== '');

function finish(row: RawRow): RawRow {
  if (row.endPage > row.page) row.flags.push('pageBreak');
  if (filled(row.cells) < 2) row.flags.push('sparse');
  return row;
}

/** A new record starts when the leftmost column is non-empty OR any money column is. */
export function groupCellRows(rows: readonly CellRow[], moneyCols: readonly number[]): RawRow[] {
  const out: RawRow[] = [];
  for (const row of rows) {
    const cells = row.cells.map((cell) => cell.trim());
    if (out.length === 0 || startsRecord(cells, moneyCols)) {
      out.push({
        cells: [...cells],
        page: row.page,
        endPage: row.page,
        flags: row.overflow === true ? ['overflow'] : [],
      });
      continue;
    }
    const last = out[out.length - 1];
    for (let c = 0; c < cells.length; c++) {
      if (cells[c] === '') continue;
      last.cells[c] = last.cells[c] === '' ? cells[c] : `${last.cells[c]} ${cells[c]}`;
    }
    if (row.page > last.endPage) last.endPage = row.page;
    if (row.overflow === true && !last.flags.includes('overflow')) last.flags.push('overflow');
  }
  return out.filter((row) => filled(row.cells) > 0).map(finish);
}

function crossesBoundary(profile: ColumnProfile, line: Line): boolean {
  const inner = profile.bounds.slice(1, -1);
  return lineRuns(line).some((run) => inner.some((at) => run.x < at && run.x + run.w > at));
}

/** Band lines cut into the profile's columns, before any grouping. */
export function cellRowsOfLines(
  lines: readonly BandLine[],
  profile: ColumnProfile,
  bodySize: Pt,
): CellRow[] {
  return lines.map(({ line, page }) => ({
    cells: cellsOfLine(profile, line, bodySize),
    page,
    overflow: crossesBoundary(profile, line),
  }));
}

/** The same rule over visual lines, in page order, so a record split by a page break rejoins. */
export function groupRows(
  lines: readonly BandLine[],
  profile: ColumnProfile,
  moneyCols: readonly number[],
  bodySize: Pt,
): RawRow[] {
  return groupCellRows(cellRowsOfLines(lines, profile, bodySize), moneyCols);
}

const keyOf = (row: RawRow): string =>
  row.cells
    .map((cell) => cell.trim())
    .filter((cell) => cell !== '')
    .join('');

export function dropRepeatedHeader(rows: readonly RawRow[]): { rows: RawRow[]; dropped: number } {
  if (rows.length === 0) return { rows: [], dropped: 0 };
  const header = keyOf(rows[0]);
  const kept = rows.filter((row, i) => i === 0 || keyOf(row) !== header);
  return { rows: kept, dropped: rows.length - kept.length };
}
