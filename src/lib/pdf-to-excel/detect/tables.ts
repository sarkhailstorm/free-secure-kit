import type { Line, Pt } from '@/lib/pdf-to-word/types';
import { parseAmount } from '../cells';
import { GUTTER_FRAC_SCOUT, GUTTER_FRAC_STRICT, PAGE_FIT_MAX } from '../constants';
import type { PageRead } from '../extract/read';
import { cellRowsOfLines, type BandLine, type CellRow } from '../rows';
import type { SheetNote, TablePath } from '../types';
import { tableBand } from './band';
import { columnProfile, lineRuns, pageFit, rightColumns, type ColumnProfile } from './columns';
import { pageFurniture, lineShape } from './furniture';
import { ruledTables } from './grid';
import { taggedTables } from './tagged';

export interface DetectedTable {
  path: TablePath;
  key: string;
  pages: number[];
  // One tree row, grid row or visual line each, never grouped
  rows: CellRow[];
  profile: ColumnProfile | null;
  // Right-aligned columns on the column rung; the other rungs decide by typing
  moneyCols: number[] | null;
  notes: SheetNote[];
  firstPage: number;
}

export interface Detection {
  tables: DetectedTable[];
  skippedPages: number[];
}

// A single-page table has no other page to confirm it, so it has to be obviously a table
function singlePageIsSafe(
  rows: readonly CellRow[],
  profile: ColumnProfile,
  moneyCols: readonly number[],
): boolean {
  if (rows.length < 3 || profile.cols.length < 2) return false;
  return moneyCols.some(
    (c) => rows.filter((row) => parseAmount(row.cells[c] ?? '') !== null).length >= 3,
  );
}

function columnTable(pages: readonly PageRead[], all: readonly PageRead[]): Detection {
  const furniture = pageFurniture(all);
  const keptOf = (page: PageRead): Line[] =>
    page.lines.filter((line) => !furniture.has(lineShape(line.text)) && lineRuns(line).length > 0);

  const bodySize: Pt = pages[0].bodySize;
  const kept = pages.flatMap(keptOf);
  const scout = columnProfile(kept, bodySize, GUTTER_FRAC_SCOUT);
  if (!scout || scout.cols.length < 2) {
    return { tables: [], skippedPages: pages.map((page) => page.pageNumber) };
  }

  const first = tableBand(scout, pages, keptOf, bodySize);
  const strict =
    first.length >= 3
      ? (columnProfile(
          first.map((band) => band.line),
          bodySize,
          GUTTER_FRAC_STRICT,
        ) ?? scout)
      : scout;
  const second = tableBand(strict, pages, keptOf, bodySize);
  const band = second.length >= first.length * 0.5 ? second : first;
  if (band.length === 0) {
    return { tables: [], skippedPages: pages.map((page) => page.pageNumber) };
  }

  // A page whose layout disagrees with the document's is left out rather than guessed at
  const skipped: number[] = [];
  const kepts: BandLine[] = [];
  for (const page of pages) {
    const mine = band.filter((line) => line.page === page.pageNumber);
    if (mine.length === 0) {
      skipped.push(page.pageNumber);
      continue;
    }
    if (pageFit(strict, mine.map((line) => line.line)) > PAGE_FIT_MAX) {
      skipped.push(page.pageNumber);
      continue;
    }
    kepts.push(...mine);
  }
  if (kepts.length === 0) return { tables: [], skippedPages: pages.map((p) => p.pageNumber) };

  const moneyCols = rightColumns(strict);
  const rows = cellRowsOfLines(kepts, strict, bodySize);
  const used = [...new Set(kepts.map((line) => line.page))].sort((a, b) => a - b);
  if (used.length === 1 && !singlePageIsSafe(rows, strict, moneyCols)) {
    return { tables: [], skippedPages: pages.map((page) => page.pageNumber) };
  }

  const notes: SheetNote[] = [];
  if (skipped.length > 0) notes.push({ code: 'pageNotRead', pages: skipped });

  return {
    tables: [
      {
        path: 'columns',
        key: 'columns',
        pages: used,
        rows,
        profile: strict,
        moneyCols,
        notes,
        firstPage: used[0],
      },
    ],
    skippedPages: skipped,
  };
}

// Consecutive pages drawing the same grid are one table, not one per page
function stitchRuled(tables: readonly DetectedTable[]): DetectedTable[] {
  const out: DetectedTable[] = [];
  for (const table of tables) {
    const last = out[out.length - 1];
    if (
      last &&
      last.key === table.key &&
      table.firstPage === last.pages[last.pages.length - 1] + 1
    ) {
      last.rows.push(...table.rows);
      last.pages.push(...table.pages);
      last.notes.push(...table.notes);
      continue;
    }
    out.push({ ...table, rows: [...table.rows], pages: [...table.pages], notes: [...table.notes] });
  }
  return out;
}

// Tagged tree first, then a ruled grid, then the column model; a page that fits none is skipped
export function detectTables(pages: readonly PageRead[]): Detection {
  const readable = pages.filter((page) => page.cls === 'text' && page.lines.length > 0);
  const tables: DetectedTable[] = [];
  const claimed = new Set<number>();

  for (const table of taggedTables(readable)) {
    tables.push(table);
    for (const page of table.pages) claimed.add(page);
  }

  const ruled: DetectedTable[] = [];
  for (const page of readable) {
    if (claimed.has(page.pageNumber)) continue;
    const found = ruledTables(page);
    if (found.length === 0) continue;
    ruled.push(...found);
    claimed.add(page.pageNumber);
  }
  tables.push(...stitchRuled(ruled));

  const rest = readable.filter((page) => !claimed.has(page.pageNumber));
  const skipped: number[] = [];
  if (rest.length > 0) {
    const run = columnTable(rest, pages);
    tables.push(...run.tables);
    skipped.push(...run.skippedPages);
    for (const table of run.tables) for (const page of table.pages) claimed.add(page);
  }

  for (const page of readable) {
    if (!claimed.has(page.pageNumber) && !skipped.includes(page.pageNumber)) {
      skipped.push(page.pageNumber);
    }
  }

  return {
    tables: tables.sort((a, b) => a.firstPage - b.firstPage),
    skippedPages: [...new Set(skipped)].sort((a, b) => a - b),
  };
}
