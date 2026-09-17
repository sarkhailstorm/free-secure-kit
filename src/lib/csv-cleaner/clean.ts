/**
 * The cleaning pipeline.
 *
 * `cleanSheet` is a pure function of (the sheet as it was read, the options).
 * It ALWAYS starts from the original rows, never from a previous result, so
 * flipping a toggle can never compound earlier edits — cleaning is idempotent
 * and the preview is always a faithful picture of the options as they stand.
 *
 * The date analysis is deliberately NOT a parameter. It is run here, on the
 * rows below the chosen heading row and after placeholders have been blanked,
 * because a banner line such as "Report run 13/09/2026" sitting above the
 * heading would otherwise cast a real day-first vote on a column nothing else
 * in the file can settle.
 */

import { findInvisible } from '@/lib/text-utilities/whitespace';
import { RemovalRecorder } from './changes';
import { analyseDateColumns, normaliseCell, type DateColumnAnalysis } from './dates';
import { standardiseHeaders } from './headers';
import {
  INVISIBLE_CHARACTER_PATTERN,
  ODD_SPACE_PATTERN,
  type CellChangeReason,
  type CleanOptions,
  type CleanResult,
  type CleanStats,
  type DateOrder,
} from './types';

/** The sheet as it was read. `ParsedSheet` satisfies this. */
export interface CleanSource {
  rows: readonly string[][];
  columnCount: number;
}

/** What `structure.ts` found, for the options that depend on it. */
export interface CleanContext {
  /** Original index of an unnamed pandas/R index column. */
  indexColumn?: number | null;
}

/**
 * Enough of the pass to work out afterwards what happened to one row, without
 * the pass having had to remember anything about it.
 */
export interface CleanPlan {
  source: readonly string[][];
  columnCount: number;
  /** First row that was treated as data; everything above it is not. */
  firstDataRow: number;
  /** The whole per-cell pipeline for one ORIGINAL column. Pure. */
  cellFor(value: string, originalColumn: number, reasons?: CellChangeReason[]): string;
}

/** One kind of invisible character the pass took out, for the summary line. */
export interface InvisibleCharacterTally {
  /** e.g. `U+200B`. */
  code: string;
  /** e.g. `Zero-width space`. */
  name: string;
  count: number;
  /** Odd spaces become a plain space; everything else is removed outright. */
  action: 'removed' | 'replaced';
}

/** A `CleanResult` plus everything the panels around the preview need. */
export interface CleanOutcome extends CleanResult {
  plan: CleanPlan;
  /** Columns found to be dates, keyed by ORIGINAL column index. */
  dateColumns: readonly DateColumnAnalysis[];
  /** Descending by count. Empty unless `removeInvisibleCharacters` is on. */
  invisibleCharacters: readonly InvisibleCharacterTally[];
  /** Headings left as they were because tidying them would have merged two. */
  headersKeptDistinct: number;
}

/** Runs of spaces and tabs, but not newlines. */
const SPACE_RUN = /[^\S\r\n]+/g;
/** A line break plus any whitespace hugging it. */
const NEWLINE_RUN = /\s*[\r\n]+\s*/g;
/**
 * A hash of a row's text AND its shape, used to find rows worth comparing.
 *
 * Joining cells into one key is what made two different rows look like one:
 * any separator can itself appear in a cell, a NUL included. Equal hashes are
 * compared cell by cell below, so the hash only ever has to be fast.
 */
function rowHash(row: readonly string[]): number {
  let hash = 0x811c9dc5;
  for (const cell of row) {
    for (let i = 0; i < cell.length; i += 1) {
      hash = Math.imul(hash ^ cell.charCodeAt(i), 0x01000193);
    }
    hash = Math.imul(hash ^ 0xff, 0x01000193);
  }
  return hash >>> 0;
}

function sameRow(a: readonly string[], b: readonly string[]): boolean {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function emptyStats(sourceRows: number, columnCount: number): CleanStats {
  return {
    sourceRows,
    rowsBefore: sourceRows,
    rowsAfter: 0,
    columnsBefore: columnCount,
    columnsAfter: columnCount,
    preambleRows: 0,
    footerRows: 0,
    duplicateRows: 0,
    blankRows: 0,
    indexOnlyRows: 0,
    blankColumns: 0,
    rescuedRows: 0,
    trimmedCells: 0,
    collapsedSpaceCells: 0,
    flattenedNewlineCells: 0,
    invisibleCharacterCells: 0,
    sentinelCells: 0,
    spellingMergedCells: 0,
    spellingMergedColumns: 0,
    renamedHeaders: 0,
    dedupedHeaders: 0,
    namedBlankHeaders: 0,
    datesNormalised: 0,
    dateColumns: 0,
    pendingDateColumns: 0,
  };
}

const invisibleNames = new Map<number, string>();

function invisibleName(code: number): string {
  const known = invisibleNames.get(code);
  if (known !== undefined) return known;
  const [hit] = findInvisible(String.fromCodePoint(code), 1);
  const name = hit ? hit.name : 'Invisible character';
  invisibleNames.set(code, name);
  return name;
}

function padRow(row: readonly string[], width: number): string[] {
  const out = new Array<string>(width);
  for (let i = 0; i < width; i += 1) out[i] = row[i] ?? '';
  return out;
}

function isBlank(value: string): boolean {
  return value === '' || value.trim() === '';
}

/** Header text for the date analysis and for the blank-column test. */
function headerRowOf(source: CleanSource, headerRowIndex: number | null, width: number): string[] {
  if (headerRowIndex === null) return new Array<string>(width).fill('');
  return padRow(source.rows[headerRowIndex] ?? [], width);
}

/**
 * The per-cell pipeline.
 *
 * Invisible characters go first so that what is left can be trimmed and
 * squeezed like ordinary text; placeholders are blanked before the spelling
 * merges, because a merge plan is written against values as they stand at that
 * point (see `CleanOptions.spellingMerges`).
 *
 * Nothing in here counts anything. The pass reads the reasons it hands back and
 * keeps the tally itself, so re-running one cell for the preview long after the
 * pass has finished cannot disturb the numbers on screen.
 */
function makePipeline(options: CleanOptions, columnCount: number) {
  const lower = (value: string) => value.trim().toLowerCase();
  const defaultSentinels = new Set(options.defaultBlankSentinels.map(lower));
  const columnSentinels = new Map<number, Set<string>>();
  for (const [key, list] of Object.entries(options.columnBlankSentinels)) {
    columnSentinels.set(Number(key), new Set(list.map(lower)));
  }

  const merges = options.spellingMerges;
  const invisible = new Map<number, InvisibleCharacterTally>();
  /** Columns the pass deletes as blank. Nothing is applied to them. */
  const dropped = new Uint8Array(columnCount);
  const dateOrders = new Array<DateOrder | null | false>(columnCount).fill(false);

  const count = (value: string, pattern: RegExp, action: 'removed' | 'replaced') => {
    for (const match of value.matchAll(pattern)) {
      const code = match[0].codePointAt(0) ?? 0;
      const seen = invisible.get(code);
      if (seen) {
        seen.count += 1;
        continue;
      }
      invisible.set(code, {
        code: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`,
        name: invisibleName(code),
        count: 1,
        action,
      });
    }
  };

  const scrub = (value: string, column: number, reasons?: CellChangeReason[]): string => {
    let next = value;

    if (options.removeInvisibleCharacters && next !== '') {
      const stripped = next.replace(INVISIBLE_CHARACTER_PATTERN, '').replace(ODD_SPACE_PATTERN, ' ');
      if (stripped !== next) {
        next = stripped;
        reasons?.push('invisible');
      }
    }

    if (options.collapseSpaces && next !== '') {
      const squeezed = next.replace(SPACE_RUN, ' ');
      if (squeezed !== next) {
        next = squeezed;
        reasons?.push('collapse-spaces');
      }
    }

    if (options.flattenNewlines && next !== '') {
      const flat = next.replace(NEWLINE_RUN, ' ');
      if (flat !== next) {
        next = flat;
        reasons?.push('flatten-newlines');
      }
    }

    if (options.trimCells && next !== '') {
      const trimmed = next.trim();
      if (trimmed !== next) {
        next = trimmed;
        reasons?.push('trim');
      }
    }

    if (options.blankSentinels && next !== '') {
      const list = columnSentinels.get(column) ?? defaultSentinels;
      if (list.has(lower(next))) {
        next = '';
        reasons?.push('sentinel-blank');
      }
    }

    const plan = merges[column];
    if (plan !== undefined) {
      const merged = Object.hasOwn(plan, next) ? plan[next] : undefined;
      if (merged !== undefined && merged !== next) {
        next = merged;
        reasons?.push('spelling-merge');
      }
    }

    return next;
  };

  const date = (value: string, column: number, reasons?: CellChangeReason[]): string => {
    const order = dateOrders[column];
    if (order === false || value === '') return value;
    const next = normaliseCell(value, order, options.dateFormat);
    if (next === null || next === value) return value;
    reasons?.push('date');
    return next;
  };

  return {
    scrub,
    date,
    dateOrders,
    dropped,
    /** Called by the pass for a cell the invisible step actually changed. */
    countInvisible: (value: string) => {
      count(value, INVISIBLE_CHARACTER_PATTERN, 'removed');
      count(value, ODD_SPACE_PATTERN, 'replaced');
    },
    cellFor: (value: string, column: number, reasons?: CellChangeReason[]) =>
      dropped[column] === 1 ? value : date(scrub(value, column, reasons), column, reasons),
    invisibleCharacters: (): InvisibleCharacterTally[] =>
      [...invisible.values()]
        .map((entry) => ({ ...entry }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
  };
}

/**
 * The date analysis is the one expensive thing that does not depend on most of
 * the options, so the last answer for a sheet is kept and reused while the
 * options that feed it stay put.
 */
const analysisCache = new WeakMap<object, { key: string; analyses: DateColumnAnalysis[] }>();

function analyseDates(
  source: CleanSource,
  header: string[],
  rows: string[][],
  key: string,
): DateColumnAnalysis[] {
  const hit = analysisCache.get(source.rows);
  if (hit && hit.key === key) return hit.analyses;
  const analyses = analyseDateColumns({ header, rows });
  analysisCache.set(source.rows, { key, analyses });
  return analyses;
}

/** Everything that changes what the rows below the heading row look like. */
function analysisKey(options: CleanOptions, headerRowIndex: number | null): string {
  return JSON.stringify([
    headerRowIndex,
    options.trimCells,
    options.collapseSpaces,
    options.flattenNewlines,
    options.removeInvisibleCharacters,
    options.blankSentinels,
    options.defaultBlankSentinels,
    options.columnBlankSentinels,
    options.spellingMerges,
    options.dropFooterRows,
    options.footerRowIndexes,
  ]);
}

export function cleanSheet(
  source: CleanSource,
  options: CleanOptions,
  context: CleanContext = {},
): CleanOutcome {
  const sourceRows = source.rows.length;
  let columnCount = source.columnCount;
  if (!columnCount) for (const row of source.rows) columnCount = Math.max(columnCount, row.length);

  // A heading row outside the sheet means the sheet has no heading row.
  const headerRowIndex =
    options.headerRowIndex !== null &&
    options.headerRowIndex >= 0 &&
    options.headerRowIndex < sourceRows
      ? options.headerRowIndex
      : null;
  const firstDataRow = headerRowIndex === null ? 0 : headerRowIndex + 1;

  const stats = emptyStats(sourceRows, columnCount);
  stats.preambleRows = headerRowIndex ?? 0;
  stats.rowsBefore = sourceRows - firstDataRow;

  const pipeline = makePipeline(options, columnCount);
  const removals = new RemovalRecorder();
  const rowChanged = new Uint8Array(sourceRows);
  let changedRows = 0;

  for (let row = 0; row < firstDataRow; row += 1) {
    removals.record(row, row === headerRowIndex ? 'header' : 'preamble');
  }

  const footers = new Set<number>();
  if (options.dropFooterRows) {
    for (const row of options.footerRowIndexes) {
      if (row >= firstDataRow && row < sourceRows) footers.add(row);
    }
  }

  const scrubbing =
    options.trimCells ||
    options.collapseSpaces ||
    options.flattenNewlines ||
    options.removeInvisibleCharacters ||
    options.blankSentinels ||
    Object.keys(options.spellingMerges).length > 0;

  // ── 1. Columns that are blank from top to bottom ──────────────────────
  // Settled before anything is counted, so work on a column this same pass
  // then deletes never reaches the summary or the row detail.
  const rawHeader = headerRowOf(source, headerRowIndex, columnCount);
  const columnSources: number[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    if (!options.removeBlankColumns || !isBlank(rawHeader[column])) {
      columnSources.push(column);
      continue;
    }
    let hasValue = false;
    for (let row = firstDataRow; row < sourceRows && !hasValue; row += 1) {
      if (footers.has(row)) continue;
      const value = source.rows[row][column] ?? '';
      if (!isBlank(scrubbing ? pipeline.scrub(value, column) : value)) hasValue = true;
    }
    if (hasValue) columnSources.push(column);
    else pipeline.dropped[column] = 1;
  }
  stats.blankColumns = columnCount - columnSources.length;
  const projecting = columnSources.length !== columnCount;

  // ── 2. Cell transforms, on the data rows only ─────────────────────────
  // The heading row is not touched here: counting its cells is what made
  // "trimmed whitespace from N cells" overstate itself on every file.
  const working: string[][] = [];
  const reasons: CellChangeReason[] = [];
  const mergedColumns = new Set<number>();
  for (let row = firstDataRow; row < sourceRows; row += 1) {
    if (footers.has(row)) continue;
    const original = source.rows[row];
    let out = original.length === columnCount ? original : padRow(original, columnCount);
    let owned = out !== original;

    if (scrubbing) {
      for (let column = 0; column < columnCount; column += 1) {
        const value = out[column];
        const counted = pipeline.dropped[column] === 0;
        reasons.length = 0;
        const next = pipeline.scrub(value, column, counted ? reasons : undefined);
        if (next === value) continue;
        if (!owned) {
          out = out.slice();
          owned = true;
        }
        out[column] = next;
        if (!counted) continue;
        if (rowChanged[row] === 0) {
          rowChanged[row] = 1;
          changedRows += 1;
        }
        for (const reason of reasons) {
          switch (reason) {
            case 'invisible':
              stats.invisibleCharacterCells += 1;
              pipeline.countInvisible(value);
              break;
            case 'collapse-spaces':
              stats.collapsedSpaceCells += 1;
              break;
            case 'flatten-newlines':
              stats.flattenedNewlineCells += 1;
              break;
            case 'trim':
              stats.trimmedCells += 1;
              break;
            case 'sentinel-blank':
              stats.sentinelCells += 1;
              break;
            case 'spelling-merge':
              stats.spellingMergedCells += 1;
              mergedColumns.add(column);
              break;
            default:
              break;
          }
        }
      }
    }

    working.push(out);
  }
  stats.spellingMergedColumns = mergedColumns.size;

  // ── 3. Which columns hold dates, and how they read ────────────────────
  // Worked out here but applied row by row below, because a date written two
  // ways is the commonest way for two rows to be the same row: normalising
  // after the duplicate test would send the file out with identical rows in
  // it and the summary saying none were found.
  let dateColumns: readonly DateColumnAnalysis[] = [];
  const dateTargets: number[] = [];
  if (options.normaliseDates) {
    dateColumns = analyseDates(
      source,
      rawHeader.map((name, i) => name.trim() || `Column ${i + 1}`),
      working,
      analysisKey(options, headerRowIndex),
    );

    for (const analysis of dateColumns) {
      const decision = options.columnDecisions[analysis.index];
      if (decision === 'skip') continue;
      if (analysis.status === 'auto') {
        pipeline.dateOrders[analysis.index] = decision ?? analysis.order;
      } else if (decision === undefined) {
        // Genuinely undecidable and unanswered: leave the column exactly as it
        // came in until the user says which way to read it.
        stats.pendingDateColumns += 1;
      } else {
        pipeline.dateOrders[analysis.index] = decision;
      }
    }

    for (let c = 0; c < columnSources.length; c += 1) {
      if (pipeline.dateOrders[columnSources[c]] !== false) dateTargets.push(c);
    }
  }

  // ── 4. Footer, blank, index-only and duplicate rows ───────────────────
  const indexColumn =
    options.removeBlankRows && options.ignoreIndexColumnInBlankRows
      ? (context.indexColumn ?? -1)
      : -1;
  // Hash to the row, or to the rows, it might be the same as.
  const seen = options.dedupeRows ? new Map<number, number | number[]>() : null;
  const rows: string[][] = [];
  const keptSources: number[] = [];
  const datedInColumn = new Int32Array(columnSources.length);
  const dated: number[] = [];
  let at = 0;

  for (let row = firstDataRow; row < sourceRows; row += 1) {
    if (footers.has(row)) {
      removals.record(row, 'footer');
      stats.footerRows += 1;
      continue;
    }

    const full = working[at];
    at += 1;
    // Always its own array: handing back one of the sheet's rows turns a
    // single write anywhere downstream into a corrupted original.
    let out: string[];
    if (projecting) {
      out = new Array<string>(columnSources.length);
      for (let c = 0; c < columnSources.length; c += 1) out[c] = full[columnSources[c]];
    } else {
      out = full.slice();
    }

    // Dates can neither empty a cell nor fill one, so the blank tests below
    // read the same either side of them and are cheaper first.
    if (options.removeBlankRows) {
      let values = 0;
      let outside = 0;
      for (let c = 0; c < out.length && outside === 0; c += 1) {
        if (isBlank(out[c])) continue;
        values += 1;
        if (columnSources[c] !== indexColumn) outside += 1;
      }
      if (values === 0) {
        removals.record(row, 'blank');
        stats.blankRows += 1;
        continue;
      }
      if (outside === 0) {
        removals.record(row, 'index-only');
        stats.indexOnlyRows += 1;
        continue;
      }
    }

    dated.length = 0;
    for (const c of dateTargets) {
      const value = out[c];
      const next = pipeline.date(value, columnSources[c]);
      if (next === value) continue;
      out[c] = next;
      dated.push(c);
    }

    if (seen) {
      const hash = rowHash(out);
      const alike = seen.get(hash);
      let twin = -1;
      if (alike === undefined) {
        seen.set(hash, rows.length);
      } else if (typeof alike === 'number') {
        if (sameRow(rows[alike], out)) twin = alike;
        else seen.set(hash, [alike, rows.length]);
      } else {
        for (const other of alike) {
          if (sameRow(rows[other], out)) {
            twin = other;
            break;
          }
        }
        if (twin === -1) alike.push(rows.length);
      }
      if (twin !== -1) {
        removals.record(row, 'duplicate', keptSources[twin]);
        stats.duplicateRows += 1;
        continue;
      }
    }

    // Counted only now the row is staying, so nothing the user cannot find in
    // the file they download is ever reported as work done to it.
    if (dated.length > 0) {
      for (const c of dated) datedInColumn[c] += 1;
      stats.datesNormalised += dated.length;
      if (rowChanged[row] === 0) {
        rowChanged[row] = 1;
        changedRows += 1;
      }
    }

    rows.push(out);
    keptSources.push(row);
  }

  for (const count of datedInColumn) if (count > 0) stats.dateColumns += 1;

  // ── 5. Headings ──────────────────────────────────────────────────────
  const headerCells = columnSources.map((column) => rawHeader[column]);
  const named = standardiseHeaders(headerCells, {
    standardise: options.standardiseHeaders,
    lowercase: options.lowercaseHeaders,
    snakeCase: options.snakeCaseHeaders,
  });
  stats.namedBlankHeaders = named.namedBlank;
  stats.dedupedHeaders = named.deduped;
  stats.renamedHeaders = named.renamed;

  stats.rowsAfter = rows.length;
  stats.columnsAfter = columnSources.length;

  return {
    header: named.headers,
    rows,
    columnSources,
    rowSources: Int32Array.from(keptSources),
    stats,
    changes: { rowChanged, changedRows, removed: removals.finish() },
    plan: {
      source: source.rows,
      columnCount,
      firstDataRow,
      cellFor: pipeline.cellFor,
    },
    dateColumns,
    invisibleCharacters: pipeline.invisibleCharacters(),
    headersKeptDistinct: named.keptToStayDistinct,
  };
}
