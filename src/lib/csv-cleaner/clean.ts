/**
 * The cleaning pipeline.
 *
 * `cleanGrid` is a pure function of (original grid, options, date analysis).
 * It ALWAYS starts from the original parsed data, never from a previous
 * result, so flipping a toggle can never compound earlier edits — cleaning is
 * idempotent and the preview is always a faithful picture of the options as
 * they stand right now.
 */

import { normaliseCell, type DateColumnAnalysis } from './dates';
import { standardiseHeaders } from './headers';
import type { CleanOptions, CleanResult, CleanStats, DateOrder, Grid } from './types';

function emptyStats(grid: Grid): CleanStats {
  return {
    rowsBefore: grid.rows.length,
    rowsAfter: grid.rows.length,
    columnsBefore: grid.header.length,
    columnsAfter: grid.header.length,
    duplicateRows: 0,
    blankRows: 0,
    blankColumns: 0,
    trimmedCells: 0,
    collapsedCells: 0,
    renamedHeaders: 0,
    dedupedHeaders: 0,
    datesNormalised: 0,
    dateColumns: 0,
    pendingDateColumns: 0,
  };
}

/** Join a row into a stable key for duplicate detection. */
function rowKey(row: string[]): string {
  // A NUL byte cannot appear in text parsed from a spreadsheet, so it is a safe
  // separator — "a,b" and "a","b" must not collide.
  return row.join('\u0000');
}

export function cleanGrid(
  grid: Grid,
  options: CleanOptions,
  dateColumns: readonly DateColumnAnalysis[],
): CleanResult {
  const stats = emptyStats(grid);

  // ── 1. Whitespace ────────────────────────────────────────────────────
  // Applied first so every later step compares values that already agree.
  let header = grid.header.slice();
  let rows = grid.rows;

  if (options.trimCells || options.collapseWhitespace) {
    const scrub = (cell: string): string => {
      let next = cell;
      if (options.collapseWhitespace) next = next.replace(/\s+/g, ' ');
      if (options.trimCells) next = next.trim();
      if (next === cell) return cell;
      // Attribute the change to whichever option actually caused it, so the
      // summary never credits an option the user has switched off. Trimming
      // alone would have produced `trimmedOnly`; anything beyond that is the
      // collapse step's doing.
      const trimmedOnly = options.trimCells ? cell.trim() : cell;
      if (next === trimmedOnly) stats.trimmedCells += 1;
      else stats.collapsedCells += 1;
      return next;
    };

    header = header.map(scrub);
    rows = grid.rows.map((row) => row.map(scrub));
  }

  // ── 2. Blank columns (header blank AND every cell blank) ─────────────
  let columnSources = header.map((_, i) => i);

  if (options.removeBlankColumns) {
    const keep: number[] = [];
    for (let c = 0; c < header.length; c += 1) {
      if (header[c].trim() !== '') {
        keep.push(c);
        continue;
      }
      let hasValue = false;
      for (const row of rows) {
        const cell = row[c];
        if (cell !== undefined && cell.trim() !== '') {
          hasValue = true;
          break;
        }
      }
      if (hasValue) keep.push(c);
    }

    if (keep.length !== header.length) {
      stats.blankColumns = header.length - keep.length;
      header = keep.map((c) => header[c]);
      columnSources = keep.map((c) => columnSources[c]);
      rows = rows.map((row) => keep.map((c) => row[c] ?? ''));
    }
  }

  // ── 3. Entirely blank rows ───────────────────────────────────────────
  if (options.removeBlankRows) {
    const kept = rows.filter((row) => row.some((cell) => cell.trim() !== ''));
    stats.blankRows = rows.length - kept.length;
    rows = kept;
  }

  // ── 4. Exact duplicate rows (full row comparison, first one wins) ────
  if (options.dedupeRows) {
    const seen = new Set<string>();
    const kept: string[][] = [];
    for (const row of rows) {
      const key = rowKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(row);
    }
    stats.duplicateRows = rows.length - kept.length;
    rows = kept;
  }

  // ── 5. Headers ───────────────────────────────────────────────────────
  const headerResult = standardiseHeaders(header, {
    standardise: options.standardiseHeaders,
    lowercase: options.lowercaseHeaders,
    snakeCase: options.snakeCaseHeaders,
  });
  header = headerResult.headers;
  stats.renamedHeaders = headerResult.renamed;
  stats.dedupedHeaders = headerResult.deduped;

  // ── 6. Dates ─────────────────────────────────────────────────────────
  if (options.normaliseDates && dateColumns.length > 0) {
    // Rows are mutated in place below, so copy every one first. With all the
    // earlier options off, `rows` still holds the caller's own row arrays and
    // writing into them would corrupt the original grid.
    rows = rows.map((row) => row.slice());

    const byOriginalIndex = new Map<number, DateColumnAnalysis>();
    for (const column of dateColumns) byOriginalIndex.set(column.index, column);

    for (let c = 0; c < columnSources.length; c += 1) {
      const analysis = byOriginalIndex.get(columnSources[c]);
      if (!analysis) continue;

      const decision = options.columnDecisions[analysis.index];

      // "Leave this column alone" always wins, for any column.
      if (decision === 'skip') continue;

      let order: DateOrder | null;
      if (analysis.status === 'auto') {
        // Resolved on evidence inside the column itself; an explicit user
        // choice still overrides it.
        order = decision ?? analysis.order;
      } else if (decision === undefined) {
        // Genuinely undecidable and unanswered: refuse to guess, and leave the
        // column exactly as it came in until the user says which way to read it.
        stats.pendingDateColumns += 1;
        continue;
      } else {
        order = decision;
      }

      let changedInColumn = 0;
      for (const row of rows) {
        const value = row[c];
        if (!value) continue;
        const next = normaliseCell(value, order, options.dateFormat);
        if (next !== null && next !== value) {
          row[c] = next;
          changedInColumn += 1;
        }
      }
      if (changedInColumn > 0) {
        stats.datesNormalised += changedInColumn;
        stats.dateColumns += 1;
      }
    }
  }

  stats.rowsAfter = rows.length;
  stats.columnsAfter = header.length;

  return { header, rows, columnSources, stats };
}
