import type { Pt, Span } from '@/lib/pdf-to-word/types';
import type { PageRead } from '../extract/read';
import type { CellRow } from '../rows';
import type { SheetNote } from '../types';
import type { DetectedTable } from './tables';
import { cellText } from './text';

export interface TaggedCell {
  row: number;
  treeCol: number;
  spans: Span[];
  x0: Pt;
  x1: Pt;
}

// Bands may not line up to the point, so a cell edge this close is the same edge
const BAND_EDGE_TOL: Pt = 3;

const isInk = (span: Span): boolean =>
  !span.synthetic && !span.artifact && span.text.trim().length > 0;

// The x extent is what the text actually covers, not what the tree declares
export function taggedCells(page: PageRead, tableIndex: number): TaggedCell[] {
  const buckets = new Map<string, TaggedCell>();
  for (const line of page.lines) {
    for (const span of line.spans) {
      if (!isInk(span) || span.mcid === null) continue;
      const index = page.struct.blockOf.get(span.mcid);
      if (index === undefined) continue;
      const block = page.struct.blocks[index];
      if (!block || block.tableIndex !== tableIndex || block.row === null || block.col === null) {
        continue;
      }
      const key = `${block.row}:${block.col}`;
      const cell = buckets.get(key);
      if (cell) {
        cell.spans.push(span);
        cell.x0 = Math.min(cell.x0, span.x);
        cell.x1 = Math.max(cell.x1, span.x + span.w);
      } else {
        buckets.set(key, {
          row: block.row,
          treeCol: block.col,
          spans: [span],
          x0: span.x,
          x1: span.x + span.w,
        });
      }
    }
  }
  return [...buckets.values()];
}

// Union across pages: LibreOffice omits an empty cell, which shifts later ones left
export function columnBands(cells: readonly TaggedCell[]): [Pt, Pt][] {
  const sorted = [...cells].sort((a, b) => a.x0 - b.x0);
  const bands: [Pt, Pt][] = [];
  for (const cell of sorted) {
    const last = bands[bands.length - 1];
    if (last && cell.x0 <= last[1]) last[1] = Math.max(last[1], cell.x1);
    else bands.push([cell.x0, cell.x1]);
  }
  return bands;
}

function bandOf(bands: readonly [Pt, Pt][], cell: TaggedCell): number {
  const mid = (cell.x0 + cell.x1) / 2;
  for (let i = 0; i < bands.length; i++) {
    if (mid >= bands[i][0] && mid <= bands[i][1]) return i;
  }
  let best = 0;
  let gap = Infinity;
  for (let i = 0; i < bands.length; i++) {
    const distance = Math.min(Math.abs(mid - bands[i][0]), Math.abs(mid - bands[i][1]));
    if (distance < gap) {
      gap = distance;
      best = i;
    }
  }
  return best;
}

interface PageTable {
  pageNumber: number;
  bands: [Pt, Pt][];
  rows: CellRow[];
}

function pageTable(page: PageRead, tableIndex: number, bands: [Pt, Pt][]): PageTable | null {
  const cells = taggedCells(page, tableIndex);
  if (cells.length === 0) return null;

  const byRow = new Map<number, CellRow>();
  for (const cell of cells) {
    const row = byRow.get(cell.row) ?? { cells: new Array<string>(bands.length).fill(''), page: page.pageNumber };
    const at = bandOf(bands, cell);
    const text = cellText(cell.spans, page.bodySize);
    row.cells[at] = row.cells[at] === '' ? text : `${row.cells[at]} ${text}`;
    byRow.set(cell.row, row);
  }

  const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
  return { pageNumber: page.pageNumber, bands, rows };
}

const sameBands = (a: readonly [Pt, Pt][], b: readonly [Pt, Pt][]): boolean =>
  a.length === b.length &&
  a.every(
    (band, i) =>
      Math.abs(band[0] - b[i][0]) <= BAND_EDGE_TOL && Math.abs(band[1] - b[i][1]) <= BAND_EDGE_TOL,
  );

// A tree table with one row, one column or one filled cell is a layout box, not a table
function worthKeeping(rows: readonly CellRow[], bands: readonly [Pt, Pt][]): boolean {
  if (rows.length < 2 || bands.length < 2) return false;
  let filled = 0;
  for (const row of rows) for (const cell of row.cells) if (cell.trim() !== '') filled += 1;
  return filled > 1;
}

// Stitched where the same table continues onto the next page
export function taggedTables(pages: readonly PageRead[]): DetectedTable[] {
  const out: DetectedTable[] = [];
  const width = Math.max(0, ...pages.map((page) => page.struct.tables.length));

  for (let t = 0; t < width; t++) {
    const usable = pages.filter((page) => page.tagged && t < page.struct.tables.length);
    if (usable.length === 0) continue;

    const everyCell = usable.flatMap((page) => taggedCells(page, t));
    if (everyCell.length === 0) continue;
    const bands = columnBands(everyCell);

    const built = usable
      .map((page) => pageTable(page, t, bands))
      .filter((table): table is PageTable => table !== null);

    let current: PageTable[] = [];
    const flush = (): void => {
      if (current.length === 0) return;
      const rows = current.flatMap((table) => table.rows);
      if (worthKeeping(rows, bands)) {
        out.push({
          path: 'tagged',
          key: `tagged-${t}-${out.length}`,
          pages: current.map((table) => table.pageNumber),
          rows,
          profile: null,
          moneyCols: null,
          notes: [] as SheetNote[],
          firstPage: current[0].pageNumber,
        });
      }
      current = [];
    };

    for (const table of built) {
      const last = current[current.length - 1];
      const joins =
        last !== undefined &&
        table.pageNumber === last.pageNumber + 1 &&
        sameBands(table.bands, last.bands);
      if (last && !joins) flush();
      current.push(table);
    }
    flush();
  }

  return out.sort((a, b) => a.firstPage - b.firstPage);
}
