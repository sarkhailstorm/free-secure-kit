/**
 * Things to check — what is wrong that cleaning cannot fix.
 *
 * The hard part of this file is restraint. Forty warnings on an ordinary file
 * teaches people to ignore warnings, which makes the tool less safe than
 * saying nothing. So every check here has to clear the same bar: something is
 * lost, changed or hidden, the user can act on it, and it stays silent on a
 * file that is fine. One kind of trouble is also one card, however many
 * columns it turns up in — twenty cards saying the same sentence is the same
 * failure as twenty warnings.
 *
 * Pure: a sheet in, a report out. Memoise it on (sheet, headerRowIndex,
 * indexColumn) — nothing here depends on the cleaning options, so it must not
 * be re-run when a toggle moves. That is also why the wording below states
 * what an option does rather than telling the reader to go and switch it on:
 * advice phrased as an instruction is wrong the moment they follow it, and
 * this report is deliberately not recomputed to notice.
 */

import { plural } from '@/lib/format';
import { findInvisible } from '@/lib/text-utilities/whitespace';
import {
  INVISIBLE_CHARACTER_PATTERN,
  MAX_LINKED_ROWS,
  ODD_SPACE_PATTERN,
  type CheckFinding,
  type CheckKind,
  type ChecksReport,
  type ParsedSheet,
  type ReadIssue,
  type Severity,
} from './types';

/** Data rows read before we stop looking. Beyond this the report is a sample. */
export const MAX_SCAN_ROWS = 200_000;

/** Offending values carried with a finding, for the UI to show. */
const MAX_SAMPLES = 4;

/** Columns named inside one card. The rest are counted, not listed. */
const MAX_NAMED_COLUMNS = 3;

/**
 * A single odd value in a 50,000-row free-text column is not worth a warning.
 * A single odd value in a 10-row file is. Hence a count floor OR a share floor.
 */
const MANGLE_MIN_COUNT = 3;
const MANGLE_MIN_SHARE = 0.01;

// ─────────────────────────────────────────────────────────────────────────
//  Patterns
// ─────────────────────────────────────────────────────────────────────────

/** Spreadsheet error values. `#N/A` is the one without a trailing mark. */
const EXCEL_ERROR_PATTERN =
  /^#(?:N\/A|REF!|DIV\/0!|VALUE!|NAME\?|NULL!|NUM!|SPILL!|CALC!|FIELD!|BLOCKED!|CONNECT!|UNKNOWN!|GETTING_DATA)$/;

/**
 * Values Excel rewrites the moment the file is reopened. Checked against
 * Excel 16.0: `00123`→`123`, `SEPT2`→`Sep-02`, `2310009E13`→`2.31E+19`,
 * `1-2`→`01-Feb`. Sixteen digits is where a whole number loses its last digit.
 */
const LEADING_ZERO_PATTERN = /^0\d+$/;
const LONG_DIGITS_PATTERN = /^\d{16,}$/;
const DIGITS_WITH_E_PATTERN = /^\d+[eE]\d+$/;
const MONTH_CODE_PATTERN = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\d{1,2}$/i;
const SHORT_PAIR_PATTERN = /^(\d{1,2})[-/](\d{1,2})$/;

/**
 * One cheap non-global test for characters that survive a trim and still break
 * matching — JS `\s` covers none of the zero-width ones.
 *
 * Exactly the two patterns `removeInvisibleCharacters` uses in clean.ts, and
 * nothing wider: the wording on this finding names that option, so anything
 * flagged here has to be something that option actually takes out.
 */
const INVISIBLE_GATE = new RegExp(
  `${INVISIBLE_CHARACTER_PATTERN.source}|${ODD_SPACE_PATTERN.source}`,
  'u',
);

/** True when reopening this value in Excel would silently rewrite it. */
export function wouldExcelChange(value: string): boolean {
  if (value.length < 2) return false;
  if (LEADING_ZERO_PATTERN.test(value)) return true;
  if (LONG_DIGITS_PATTERN.test(value)) return true;
  if (DIGITS_WITH_E_PATTERN.test(value)) return true;
  if (MONTH_CODE_PATTERN.test(value)) return true;

  const pair = SHORT_PAIR_PATTERN.exec(value);
  if (!pair) return false;
  const a = Number(pair[1]);
  const b = Number(pair[2]);
  // Only a pair Excel can read as a day and a month is turned into a date.
  return a >= 1 && b >= 1 && a <= 31 && b <= 31 && (a <= 12 || b <= 12);
}

/**
 * Names of the invisible characters in one value, for the UI to quote.
 *
 * Driven by the same gate as the check, so it can never name a character the
 * check ignored or stay silent about one the check flagged.
 */
export function describeInvisible(value: string): string[] {
  const names: string[] = [];
  for (const char of value) {
    if (names.length >= MAX_SAMPLES) break;
    if (!INVISIBLE_GATE.test(char)) continue;
    const name = findInvisible(char, 1)[0]?.name ?? 'Invisible character';
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

// ─────────────────────────────────────────────────────────────────────────
//  Tallies
// ─────────────────────────────────────────────────────────────────────────

class Tally {
  count = 0;
  /** Non-blank cells looked at, so a finding can be judged against the column. */
  seen = 0;
  readonly rows: number[] = [];
  readonly samples: string[] = [];

  hit(rowIndex: number, value: string): void {
    this.count += 1;
    if (this.rows.length < MAX_LINKED_ROWS && this.rows[this.rows.length - 1] !== rowIndex) {
      this.rows.push(rowIndex);
    }
    if (this.samples.length < MAX_SAMPLES && !this.samples.includes(value)) {
      this.samples.push(value);
    }
  }
}

function tallyFor(map: Map<number, Tally>, column: number): Tally {
  let tally = map.get(column);
  if (!tally) {
    tally = new Tally();
    map.set(column, tally);
  }
  return tally;
}

// ─────────────────────────────────────────────────────────────────────────
//  Input
// ─────────────────────────────────────────────────────────────────────────

export interface CheckInput {
  sheet: ParsedSheet;
  /** ORIGINAL row index of the header row; `null` when the sheet has none. */
  headerRowIndex: number | null;
  /** `StructureReport.indexColumn`. Without it the index-only check is skipped. */
  indexColumn?: number | null;
  /**
   * `ParsedFile.issues`. A delimited file's read problems are recorded against
   * the file rather than the sheet, and an unclosed quote — the one finding
   * here that means rows were silently lost — arrives that way.
   */
  fileIssues?: readonly ReadIssue[];
}

function headerTexts(sheet: ParsedSheet, headerRowIndex: number | null): string[] {
  const row = headerRowIndex === null ? undefined : sheet.rows[headerRowIndex];
  const out: string[] = [];
  for (let c = 0; c < sheet.columnCount; c += 1) {
    out.push((row?.[c] ?? '').trim());
  }
  return out;
}

/** "a", "a and b", "a, b and c". */
function listed(parts: readonly string[]): string {
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Where a finding sits, ready to sit in the middle of a sentence.
 *
 * One column keeps its position as well as its heading: header tidying may
 * have renamed it by the time this is read, and the position is the part that
 * cannot go stale. A card covering several columns leans on the headings
 * alone — a run of bracketed numbers reads like a puzzle, and with the names
 * side by side the reader can find the columns anyway.
 */
function columnPhrase(columns: readonly number[], headers: readonly string[]): string {
  const first = columns[0] ?? 0;
  if (columns.length === 1) {
    const position = `column ${first + 1}`;
    return headers[first] ? `“${headers[first]}” (${position})` : position;
  }
  const named = columns
    .slice(0, MAX_NAMED_COLUMNS)
    .map((c) => (headers[c] ? `“${headers[c]}”` : `column ${c + 1}`));
  const rest = columns.length - named.length;
  return `${plural(columns.length, 'column')} (${listed(rest > 0 ? [...named, `${rest} more`] : named)})`;
}

/**
 * Every column with this kind of trouble, as ONE finding.
 *
 * `columnName` carries the finished wording for all of them, which is what the
 * field is for — nothing outside this file reads it, and `describeCheck` is the
 * only thing that does. `columnIndex` stays the worst-affected column so the UI
 * still has something to key and link on.
 */
function columnCard(
  kind: CheckKind,
  severity: Severity,
  tallies: Map<number, Tally>,
  headers: readonly string[],
  keep: (tally: Tally) => boolean,
): CheckFinding | null {
  const hits = [...tallies]
    .filter(([, tally]) => tally.count > 0 && keep(tally))
    .sort((a, b) => b[1].count - a[1].count || a[0] - b[0]);
  if (hits.length === 0) return null;

  const rows = new Set<number>();
  let count = 0;
  let capped = false;
  for (const [, tally] of hits) {
    count += tally.count;
    if (tally.count > tally.rows.length) capped = true;
    for (const row of tally.rows) rows.add(row);
  }

  // A chip from each column in turn, so the examples span the card.
  const samples: string[] = [];
  for (let depth = 0; depth < MAX_SAMPLES && samples.length < MAX_SAMPLES; depth += 1) {
    for (const [, tally] of hits) {
      const value = tally.samples[depth];
      if (value === undefined || samples.includes(value)) continue;
      samples.push(value);
      if (samples.length >= MAX_SAMPLES) break;
    }
  }

  const rowIndexes = [...rows].sort((a, b) => a - b);
  return {
    kind,
    severity,
    count,
    rowIndexes: rowIndexes.slice(0, MAX_LINKED_ROWS),
    truncated: capped || rowIndexes.length > MAX_LINKED_ROWS,
    columnIndex: hits[0][0],
    columnName: columnPhrase(
      hits.map(([column]) => column),
      headers,
    ),
    samples,
  };
}

/**
 * A ragged-row report with the title block taken out of it.
 *
 * Rows above the chosen header row are the preamble — already set aside and
 * labelled as left out — so their width is not a fault, and a file whose only
 * complaint is its own title block must say nothing. Rows swallowed by an
 * unclosed quote come out too: that is the same damage, reported once already
 * and far more plainly, by the quote finding.
 *
 * Taking the dropped rows off the count is exact: the row list is only ever
 * cut short at its tail, so every row above the header is in it.
 */
function raggedBelowHeader(
  issue: ReadIssue,
  start: number,
  swallowed: ReadonlySet<number>,
): CheckFinding | null {
  const wanted = (row: number | undefined) =>
    row !== undefined && row >= start && !swallowed.has(row);

  const rowIndexes = issue.rowIndexes.filter(wanted);
  const count = issue.count - (issue.rowIndexes.length - rowIndexes.length);
  if (count <= 0) return null;

  return {
    kind: 'ragged-rows',
    // Carried across unchanged: the same fact must not read as more serious
    // here than it does in the list of read problems it came from.
    severity: issue.severity,
    count,
    rowIndexes: rowIndexes.slice(0, MAX_LINKED_ROWS),
    truncated: count > Math.min(rowIndexes.length, MAX_LINKED_ROWS),
    // Samples are collected in row order, so the row a sample really came from
    // is never earlier than the one it lines up with here. Lining them up can
    // therefore drop an example we could have kept, but it can never put a row
    // from the title block on screen.
    samples: issue.samples.filter((_, i) => wanted(issue.rowIndexes[i])).slice(0, MAX_SAMPLES),
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  The pass
// ─────────────────────────────────────────────────────────────────────────

export function runChecks({ sheet, headerRowIndex, indexColumn, fileIssues }: CheckInput): ChecksReport {
  const headers = headerTexts(sheet, headerRowIndex);
  const findings: CheckFinding[] = [];

  // A header choice kept from a longer sheet can point past the end of this one.
  const start = Math.min(headerRowIndex === null ? 0 : headerRowIndex + 1, sheet.rows.length);
  const dataRows = sheet.rows.length - start;
  const end = Math.min(sheet.rows.length, start + MAX_SCAN_ROWS);

  // Rows were lost or shuffled while reading, and no later step can tell.
  // Promoted rather than recomputed: the parser's own errors are gone by now.
  const readIssues = [...sheet.issues, ...(fileIssues ?? [])];
  const swallowed = new Set<number>();
  const promoted = new Set<CheckKind>();

  for (const issue of readIssues) {
    if (issue.kind !== 'unclosed-quote' || issue.count === 0) continue;
    for (const row of issue.rowIndexes) swallowed.add(row);
    if (promoted.has('unclosed-quote')) continue;
    promoted.add('unclosed-quote');
    findings.push({
      kind: 'unclosed-quote',
      severity: issue.severity,
      count: issue.count,
      rowIndexes: issue.rowIndexes.slice(0, MAX_LINKED_ROWS),
      truncated: issue.count > Math.min(issue.rowIndexes.length, MAX_LINKED_ROWS),
      samples: issue.samples.slice(0, MAX_SAMPLES),
    });
  }

  for (const issue of readIssues) {
    if (issue.kind !== 'ragged-rows' || issue.count === 0) continue;
    if (promoted.has('ragged-rows')) continue;
    promoted.add('ragged-rows');
    const ragged = raggedBelowHeader(issue, start, swallowed);
    if (ragged) findings.push(ragged);
  }

  // Workbooks get error cells from the reader, cell by cell, so scanning the
  // text again would put one fact in two lists. A delimited file gets nothing
  // from the reader, and there this scan is the only report there is.
  const readerHasErrors = sheet.issues.some((i) => i.kind === 'excel-error-cells' && i.count > 0);

  const errors = new Map<number, Tally>();
  const invisible = new Map<number, Tally>();
  const mangled = new Map<number, Tally>();
  const indexOnly = new Tally();
  const filled = new Int32Array(sheet.columnCount);

  // The header row is data too as far as invisible characters go — a
  // zero-width space in a column name breaks every lookup against it.
  if (headerRowIndex !== null) {
    const row = sheet.rows[headerRowIndex] ?? [];
    for (let c = 0; c < sheet.columnCount; c += 1) {
      const value = (row[c] ?? '').trim();
      if (value !== '' && INVISIBLE_GATE.test(value)) {
        tallyFor(invisible, c).hit(headerRowIndex, value);
      }
    }
  }

  for (let r = start; r < end; r += 1) {
    const row = sheet.rows[r];
    if (!row) continue;

    let populated = 0;
    let indexCellValue = '';

    for (let c = 0; c < sheet.columnCount; c += 1) {
      const raw = row[c];
      if (raw === undefined || raw === '') continue;
      const value = raw.trim();
      if (value === '') continue;

      if (c === indexColumn) indexCellValue = value;
      else populated += 1;
      filled[c] += 1;

      if (!readerHasErrors && value.charCodeAt(0) === 35 && EXCEL_ERROR_PATTERN.test(value)) {
        tallyFor(errors, c).hit(r, value);
      }
      if (wouldExcelChange(value)) {
        tallyFor(mangled, c).hit(r, value);
      }
      if (INVISIBLE_GATE.test(value)) {
        tallyFor(invisible, c).hit(r, value);
      }
    }

    if (indexCellValue !== '' && populated === 0) indexOnly.hit(r, indexCellValue);
  }

  for (const [column, tally] of errors) tally.seen = filled[column];
  for (const [column, tally] of mangled) tally.seen = filled[column];
  for (const [column, tally] of invisible) tally.seen = filled[column];

  const cards = [
    columnCard('excel-error-cells', 'warning', errors, headers, () => true),
    columnCard(
      'leading-zeros',
      'warning',
      mangled,
      headers,
      (t) => t.count >= MANGLE_MIN_COUNT || t.count >= t.seen * MANGLE_MIN_SHARE,
    ),
    columnCard('invisible-characters', 'warning', invisible, headers, () => true),
    headerCollisions(headers),
  ];
  for (const card of cards) if (card) findings.push(card);

  if (indexOnly.count > 0) {
    findings.push({
      kind: 'index-only-rows',
      severity: 'info',
      count: indexOnly.count,
      rowIndexes: indexOnly.rows,
      truncated: indexOnly.count > indexOnly.rows.length,
      columnIndex: indexColumn ?? undefined,
      samples: indexOnly.samples,
    });
  }

  const order: Record<Severity, number> = { serious: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);

  return { findings, rowsScanned: end - start, sampled: dataRows > MAX_SCAN_ROWS };
}

/**
 * Columns whose names are the same name written twice.
 *
 * Only case and the space/underscore/hyphen between words are ignored —
 * `Price (£)` and `Price (€)` are two different names and must stay apart.
 * This is about the file, not about our own tidying, which is why the wording
 * promises nothing: whether a suffix is added here depends on options this
 * file is deliberately not given.
 */
function sameName(raw: string): string {
  return raw.toLowerCase().replace(/[\s_-]+/gu, '');
}

function headerCollisions(headers: readonly string[]): CheckFinding | null {
  const groups = new Map<string, number[]>();

  headers.forEach((raw, i) => {
    // A blank header is named after its position, so it can never collide.
    if (raw === '') return;
    const key = sameName(raw);
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  });

  const repeated = [...groups.values()].filter((columns) => columns.length > 1);
  if (repeated.length === 0) return null;

  return {
    kind: 'duplicate-headers',
    severity: 'warning',
    count: repeated.length,
    rowIndexes: [],
    truncated: false,
    columnIndex: repeated[0][0],
    // The names themselves go on the chips below the card, so the sentence
    // does not repeat them.
    samples: repeated.slice(0, MAX_SAMPLES).map((columns) => headers[columns[0]]),
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  Wording
// ─────────────────────────────────────────────────────────────────────────

export interface CheckCopy {
  /** Short label for the row in the list. */
  title: string;
  /** A finished sentence or two, with the numbers already in it. */
  detail: string;
}

/** The columns a finding covers, worded when the finding was raised. */
function where(finding: CheckFinding): string {
  if (finding.columnName) return finding.columnName;
  if (finding.columnIndex === undefined) return 'this sheet';
  return `column ${finding.columnIndex + 1}`;
}

/**
 * Plain-English wording for one finding. Kept beside the logic that raised it.
 *
 * Counts and verbs are picked together — a card that says "1 value … contain"
 * reads as carelessness, and carelessness is not what you want on the one
 * panel telling someone their figures may be wrong.
 */
export function describeCheck(finding: CheckFinding): CheckCopy {
  const place = where(finding);
  const one = finding.count === 1;

  switch (finding.kind) {
    case 'unclosed-quote':
      return {
        title: 'A quote mark is not closed',
        detail: `A quote mark is opened and never closed, so ${plural(finding.count, 'row was', 'rows were')} pulled into the value above and ${one ? 'is' : 'are'} missing from the table. Close the quote in a text editor and load the file again.`,
      };
    case 'ragged-rows':
      return {
        title: 'Rows have different numbers of values',
        detail: `${plural(finding.count, 'row has', 'rows have')} a different number of values to the widest row, and ${one ? 'the short one was' : 'the short ones were'} filled out with blanks. Check the values have landed under the right headings.`,
      };
    case 'excel-error-cells':
      return {
        title: 'Spreadsheet error values',
        detail: `${plural(finding.count, 'value')} in ${place} ${one ? 'is' : 'are'} a spreadsheet error such as #REF! or #N/A. The sum behind ${one ? 'it' : 'them'} did not work, so the real ${one ? 'number was' : 'numbers were'} never saved and cannot be recovered here.`,
      };
    case 'leading-zeros':
      return {
        title: 'Excel would change these values',
        detail: `${plural(finding.count, 'value')} in ${place} would be changed if this file were opened in Excel — a leading zero dropped, or a code read as a date. Saving as Excel rather than CSV keeps ${one ? 'it' : 'them'} exactly as ${one ? 'it is' : 'they are'}.`,
      };
    case 'invisible-characters':
      return {
        title: 'Invisible characters',
        detail: `${plural(finding.count, 'value')} in ${place} ${one ? 'has a character that takes' : 'have characters that take'} up no space on screen. ${one ? 'It looks' : 'They look'} right but will not match when you search, sort or join on ${one ? 'it' : 'them'}. “Remove invisible characters” is the option that takes ${one ? 'it' : 'them'} out.`,
      };
    case 'index-only-rows':
      return {
        title: 'Rows holding only a row number',
        detail: `${plural(finding.count, 'row is', 'rows are')} empty apart from a row number. ${one ? 'It comes' : 'They come'} out only when “Remove blank rows” and “Ignore the row-number column” are both on.`,
      };
    case 'duplicate-headers':
      return {
        title: 'Columns sharing a name',
        detail: `${plural(finding.count, 'heading is', 'headings are')} used by more than one column, once capitals and the spaces between words are set aside. Anything that looks a column up by name will only find the first of them, so it is worth renaming the others.`,
      };
    default:
      return { title: 'Something to check', detail: `${plural(finding.count, 'value')} in ${place}.` };
  }
}
