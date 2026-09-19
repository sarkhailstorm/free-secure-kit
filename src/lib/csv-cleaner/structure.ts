import { inspectDate } from './dates';
import {
  HEADER_SCAN_ROWS,
  type Confidence,
  type FooterReason,
  type FooterRowCandidate,
  type HeaderRowScore,
  type HeaderScoreReason,
  type StructureReport,
} from './types';

export interface StructureInput {
  rows: readonly string[][];
  columnCount: number;
}

/** Rows below a candidate used to judge what the data underneath looks like. */
const BODY_ROWS = 20;
const FOOTER_SCAN_ROWS = 5;
/** Data rows sampled to learn how full an ordinary row is. */
const BODY_SAMPLE_ROWS = 50;
/** The sum test walks every data row, so it is only worth running on a small sheet. */
const SUM_SCAN_ROWS = 20_000;
/** Cells the sum test may read. Short sheets get every column, long ones a few. */
const SUM_CELL_BUDGET = 400_000;
const NUMBER_COLUMN_ROWS = 12;
const INDEX_SCAN_ROWS = 50;
const INDEX_MIN_ROWS = 3;
/** A header cell longer than this is prose, not a label. */
const LABEL_MAX_CHARS = 60;
const SHORT_VALUE_CHARS = 40;
const PREVIEW_CELLS = 6;
const PREVIEW_CHARS = 120;

/** Best and runner-up closer than this is a coin toss; see `looksHeaderless`. */
export const CLOSE_MARGIN = 0.4;
/** A row further down only takes the header over row 0 if it beats it by this. */
const MOVE_MARGIN = 0.5;
/** Half the non-blank cells must read as labels before a row can be a header. */
const LABEL_SHARE_FLOOR = 0.5;
/** Half the names must differ. Exports repeat one; data repeats itself. */
const LABEL_DISTINCT_FLOOR = 0.5;
/** Stand-in for the body score on a sheet too short to measure one. */
const TYPICAL_DATA_SCORE = 2.2;

const WEIGHT = {
  filled: 1.0,
  label: 1.2,
  distinct: 0.6,
  short: 0.4,
  contrast: 1.5,
  repeats: 1.0,
  narrower: 1.2,
  title: 1.0,
  depth: 0.03,
};

type CellType = 'blank' | 'number' | 'date' | 'text';

// Numbers as a spreadsheet writes them: 1,234.50, -12, (99), 45%, 1.234,56.
const NUMBER_LIKE =
  /^[-+(]?\s*[£$€¥]?\s*(?:\d{1,3}(?:[ .,]\d{3})+|\d+)(?:[.,]\d+)?\s*[)%]?$/;
/** A clock time with no date, which `inspectDate` deliberately refuses. */
const CLOCK_TIME = /^\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?$/i;
const HAS_LETTER = /\p{L}/u;
/** A bare whole number short enough to name a column: a year, a quarter, a code. */
const CODE_LABEL = /^\d{1,6}$/;

function classify(trimmed: string): CellType {
  if (!trimmed) return 'blank';
  if (NUMBER_LIKE.test(trimmed)) return 'number';
  if (CLOCK_TIME.test(trimmed) || inspectDate(trimmed).kind !== 'not-a-date') return 'date';
  return 'text';
}

function isLabel(trimmed: string, type: CellType): boolean {
  return type === 'text' && trimmed.length <= LABEL_MAX_CHARS && HAS_LETTER.test(trimmed);
}

function toNumber(raw: string): number | null {
  const value = raw.trim();
  if (!NUMBER_LIKE.test(value)) return null;
  const negative = value.startsWith('-') || (value.startsWith('(') && value.endsWith(')'));
  const digits = value.replace(/[^\d.,]/g, '');
  if (!digits) return null;

  const cut = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
  let whole = digits;
  let fraction = '';
  if (cut >= 0) {
    const other = digits[cut] === '.' ? ',' : '.';
    // Three digits after the only separator present groups thousands; anything else is a decimal point.
    const grouped = digits.length - cut - 1 === 3 && !digits.includes(other);
    if (!grouped) {
      whole = digits.slice(0, cut);
      fraction = digits.slice(cut + 1);
    }
  }
  const n = Number(`${whole.replace(/[.,]/g, '') || '0'}.${fraction || '0'}`);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

interface ScanWindow {
  width: number;
  depth: number;
  types: CellType[][];
  keys: string[][];
  filled: Int32Array;
  labels: Int32Array;
  distinct: Int32Array;
  short: Int32Array;
  /** Per column: the last scanned row each value appeared on. */
  lastSeen: Array<Map<string, number>>;
}

function buildWindow(rows: readonly string[][], columnCount: number): ScanWindow {
  const width = Math.max(1, columnCount);
  const depth = Math.min(rows.length, HEADER_SCAN_ROWS + 2 * BODY_ROWS);
  const types: CellType[][] = [];
  const keys: string[][] = [];
  const filled = new Int32Array(depth);
  const labels = new Int32Array(depth);
  const distinct = new Int32Array(depth);
  const short = new Int32Array(depth);
  const lastSeen = Array.from({ length: width }, () => new Map<string, number>());

  for (let r = 0; r < depth; r += 1) {
    const row = rows[r] ?? [];
    const rowTypes: CellType[] = new Array<CellType>(width);
    const rowKeys: string[] = new Array<string>(width);
    const unique = new Set<string>();

    for (let c = 0; c < width; c += 1) {
      const value = (row[c] ?? '').trim();
      const type = classify(value);
      const key = value.toLowerCase();
      rowTypes[c] = type;
      rowKeys[c] = key;
      if (type === 'blank') continue;
      filled[r] += 1;
      if (value.length <= SHORT_VALUE_CHARS) short[r] += 1;
      if (isLabel(value, type)) labels[r] += 1;
      unique.add(key);
      lastSeen[c].set(key, r);
    }

    distinct[r] = unique.size;
    types.push(rowTypes);
    keys.push(rowKeys);
  }

  return { width, depth, types, keys, filled, labels, distinct, short, lastSeen };
}

interface RowScore {
  raw: number;
  reasons: HeaderScoreReason[];
}

function scoreRow(w: ScanWindow, index: number): RowScore {
  const width = w.width;
  const nonBlank = w.filled[index];
  const rowTypes = w.types[index];

  const fillShare = nonBlank / width;
  const labelShare = nonBlank === 0 ? 0 : w.labels[index] / nonBlank;
  const distinctShare = nonBlank === 0 ? 0 : w.distinct[index] / nonBlank;
  const shortShare = nonBlank === 0 ? 0 : w.short[index] / nonBlank;

  const bodyStart = index + 1;
  const bodyEnd = Math.min(w.depth, bodyStart + BODY_ROWS);
  const bodyRows = bodyEnd - bodyStart;

  let bodyFillTotal = 0;
  for (let r = bodyStart; r < bodyEnd; r += 1) bodyFillTotal += w.filled[r] / width;
  const bodyFill = bodyRows === 0 ? fillShare : bodyFillTotal / bodyRows;

  // A header is text sitting on top of a column that is not text.
  let comparable = 0;
  let contrasting = 0;
  for (let c = 0; c < width; c += 1) {
    if (rowTypes[c] === 'blank') continue;
    let numbers = 0;
    let dates = 0;
    let texts = 0;
    for (let r = bodyStart; r < bodyEnd; r += 1) {
      const t = w.types[r][c];
      if (t === 'number') numbers += 1;
      else if (t === 'date') dates += 1;
      else if (t === 'text') texts += 1;
    }
    const total = numbers + dates + texts;
    if (total === 0) continue;
    comparable += 1;
    if (rowTypes[c] === 'text' && (numbers + dates) / total >= 0.6) contrasting += 1;
  }
  const contrast = comparable === 0 ? 0 : contrasting / comparable;

  let repeated = 0;
  for (let c = 0; c < width; c += 1) {
    if (rowTypes[c] === 'blank') continue;
    const last = w.lastSeen[c].get(w.keys[index][c]);
    if (last !== undefined && last > index) repeated += 1;
  }
  const repeatShare = nonBlank === 0 ? 0 : repeated / nonBlank;

  let raw =
    WEIGHT.filled * fillShare +
    WEIGHT.label * labelShare +
    WEIGHT.distinct * distinctShare +
    WEIGHT.short * shortShare +
    WEIGHT.contrast * contrast -
    WEIGHT.repeats * repeatShare -
    WEIGHT.narrower * Math.max(0, bodyFill - fillShare);

  const reasons: HeaderScoreReason[] = [];
  if (fillShare === 1) reasons.push('every-cell-filled');
  if (nonBlank > 0 && labelShare === 1) reasons.push('all-text');
  if (nonBlank >= 2 && distinctShare === 1) reasons.push('all-distinct');
  if (nonBlank > 0 && shortShare === 1) reasons.push('short-values');
  if (contrast >= 0.4) reasons.push('types-settle-below');
  if (nonBlank === 1 && width >= 3) {
    raw -= WEIGHT.title;
    reasons.push('reads-like-a-title');
  }
  if (bodyFill - fillShare > 0.25) reasons.push('narrower-than-rows');
  if (fillShare <= 0.25) reasons.push('mostly-blank');
  if (repeatShare >= 0.5) reasons.push('repeats-below');

  return { raw, reasons };
}

function namesAndCodes(w: ScanWindow, index: number): boolean {
  if (w.labels[index] < 1) return false;
  const types = w.types[index];
  const values = w.keys[index];
  for (let c = 0; c < w.width; c += 1) {
    if (types[c] === 'blank') continue;
    if (isLabel(values[c], types[c])) continue;
    if (!CODE_LABEL.test(values[c])) return false;
  }
  return true;
}

function looksLikeLabels(w: ScanWindow, index: number): boolean {
  const nonBlank = w.filled[index];
  if (nonBlank < Math.min(2, w.width)) return false;
  if (w.distinct[index] / nonBlank < LABEL_DISTINCT_FLOOR) return false;
  if (w.labels[index] / nonBlank >= LABEL_SHARE_FLOOR) return true;
  return namesAndCodes(w, index);
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function preview(row: readonly string[] | undefined): string[] {
  return (row ?? []).slice(0, PREVIEW_CELLS).map((cell) => cell.slice(0, PREVIEW_CHARS));
}

/** How far the best-scoring row beat the runner-up; under `CLOSE_MARGIN` it is a coin toss. */
export function headerMargin(scores: readonly HeaderRowScore[]): number {
  if (scores.length < 2) return Infinity;
  let best = -Infinity;
  let second = -Infinity;
  for (const score of scores) {
    if (score.score > best) {
      second = best;
      best = score.score;
    } else if (score.score > second) {
      second = score.score;
    }
  }
  return best - second;
}

/** True when no row near the top stands out, so `headerRowIndex` is only a guess. */
export function looksHeaderless(report: StructureReport): boolean {
  return report.headerRowIndex === null || headerMargin(report.scores) < CLOSE_MARGIN;
}

/** `Total`, `Grand total`, `Subtotal`, `Sum` at the start of a cell. */
const TOTAL_LABEL = /^(grand\s+)?(total|subtotal|sum)\b/i;
/** The same word with nothing meaningful after it — `Total:`, `TOTAL -`. */
const TOTAL_ONLY = /^(grand\s+)?(total|subtotal|sum)s?\b[\s:.,\-–—]*$/i;
/** What pandas writes for an index it has no name for. */
const UNNAMED_HEADER = /^unnamed:?\s*\d*$/i;

/** Two numbers agree when they agree to the penny — a printed total is rounded. */
function sumsMatch(total: number, sum: number): boolean {
  return Math.abs(total - sum) <= Math.max(0.01, Math.abs(sum) * 1e-9);
}

// `targets` must be in order; one pass up the sheet carries a running total per column.
function sumMatches(
  rows: readonly string[][],
  dataStart: number,
  width: number,
  skipColumn: number | null,
  targets: readonly number[],
): Set<number> {
  const hits = new Set<number>();
  const testable = targets.filter((r) => r - dataStart >= 2 && r - dataStart <= SUM_SCAN_ROWS);
  if (testable.length === 0) return hits;

  const last = testable[testable.length - 1];
  const span = last - dataStart + 1;
  const maxColumns = Math.max(1, Math.floor(SUM_CELL_BUDGET / span));

  const columns: number[] = [];
  for (const r of testable) {
    for (let c = 0; c < width && columns.length < maxColumns; c += 1) {
      if (c === skipColumn || columns.includes(c)) continue;
      if (toNumber(rows[r]?.[c] ?? '') !== null) columns.push(c);
    }
  }
  if (columns.length === 0) return hits;

  const count = columns.length;
  const sum = new Float64Array(count);
  const seen = new Int32Array(count);
  const nonZero = new Uint8Array(count);
  // A column with anything unreadable above the row can never be totalled again.
  const broken = new Uint8Array(count);

  let next = 0;
  for (let r = dataStart; r <= last; r += 1) {
    while (next < testable.length && testable[next] === r) {
      for (let i = 0; i < count; i += 1) {
        if (broken[i] || seen[i] < 2 || !nonZero[i]) continue;
        const total = toNumber(rows[r]?.[columns[i]] ?? '');
        if (total !== null && sumsMatch(total, sum[i])) {
          hits.add(r);
          break;
        }
      }
      next += 1;
    }
    if (r === last) break;

    for (let i = 0; i < count; i += 1) {
      if (broken[i]) continue;
      const raw = (rows[r]?.[columns[i]] ?? '').trim();
      if (!raw) continue;
      const value = toNumber(raw);
      if (value === null) {
        broken[i] = 1;
        continue;
      }
      sum[i] += value;
      seen[i] += 1;
      if (value !== 0) nonZero[i] = 1;
    }
  }
  return hits;
}

/** Columns the body fills with numbers and nothing else. */
function numberColumns(
  rows: readonly string[][],
  dataStart: number,
  end: number,
  width: number,
  skipColumn: number | null,
): Set<number> {
  const filled = new Int32Array(width);
  const numeric = new Int32Array(width);
  const limit = Math.min(end, dataStart + NUMBER_COLUMN_ROWS);

  for (let r = dataStart; r < limit; r += 1) {
    for (let c = 0; c < width; c += 1) {
      if (c === skipColumn) continue;
      const raw = (rows[r]?.[c] ?? '').trim();
      if (!raw) continue;
      filled[c] += 1;
      if (toNumber(raw) !== null) numeric[c] += 1;
    }
  }

  const found = new Set<number>();
  for (let c = 0; c < width; c += 1) {
    if (filled[c] >= 2 && filled[c] === numeric[c]) found.add(c);
  }
  return found;
}

/** Suggestions only: a row is never offered on the word "total" alone. */
export function findFooterRows(
  sheet: StructureInput,
  headerRowIndex: number | null,
): FooterRowCandidate[] {
  const rows = sheet.rows;
  const width = Math.max(1, sheet.columnCount);
  const dataStart = headerRowIndex === null ? 0 : headerRowIndex + 1;
  if (rows.length - dataStart < 3) return [];

  // A row holding only its own row number is a blank row, not a total.
  const skipColumn = findIndexColumn(sheet, headerRowIndex);
  const countFilled = (row: readonly string[] | undefined): number => {
    let n = 0;
    for (let c = 0; c < width; c += 1) {
      if (c !== skipColumn && (row?.[c] ?? '').trim() !== '') n += 1;
    }
    return n;
  };

  // Two rows always stay above the window, so a short sheet still has something to compare.
  const windowStart = Math.max(dataStart + 2, rows.length - FOOTER_SCAN_ROWS);
  const sample: number[] = [];
  for (let r = dataStart; r < windowStart && sample.length < BODY_SAMPLE_ROWS; r += 1) {
    const filled = countFilled(rows[r]);
    if (filled > 0) sample.push(filled);
  }
  if (sample.length === 0) return [];
  const typical = median(sample);

  interface Candidate {
    index: number;
    filled: number;
    sparse: boolean;
    wordHit: boolean;
    bareLabel: boolean;
    onlyCell: string;
  }

  const candidates: Candidate[] = [];
  for (let r = windowStart; r < rows.length; r += 1) {
    const row = rows[r];
    const filled = countFilled(row);
    if (filled === 0) continue; // A blank row is the blank-row option's business.

    let wordHit = false;
    let bareLabel = false;
    let onlyCell = '';
    for (let c = 0; c < width; c += 1) {
      if (c === skipColumn) continue;
      const value = (row?.[c] ?? '').trim();
      if (!value) continue;
      if (filled === 1) onlyCell = value;
      if (TOTAL_LABEL.test(value)) wordHit = true;
      if (TOTAL_ONLY.test(value)) bareLabel = true;
    }

    candidates.push({
      index: r,
      filled,
      sparse: filled <= Math.max(1, Math.floor(typical * 0.6)),
      wordHit,
      bareLabel,
      onlyCell,
    });
  }

  // Adding a column up is expensive, so only rows that already look like a footer start it.
  const addsUp = sumMatches(
    rows,
    dataStart,
    width,
    skipColumn,
    candidates.filter((c) => c.sparse || c.bareLabel).map((c) => c.index),
  );

  // One column adding up is thin on its own: small whole numbers land on each other by chance.
  let bodyNumbers: Set<number> | null = null;
  const totalsEveryNumberColumn = (row: readonly string[] | undefined): boolean => {
    bodyNumbers ??= numberColumns(rows, dataStart, windowStart, width, skipColumn);
    for (const c of bodyNumbers) if ((row?.[c] ?? '').trim() === '') return false;
    return true;
  };

  const found: FooterRowCandidate[] = [];
  for (const c of candidates) {
    const row = rows[c.index];
    const sums = addsUp.has(c.index);

    let reason: FooterReason | null = null;
    if (c.wordHit && (c.bareLabel || sums)) reason = 'total-word';
    else if (sums && totalsEveryNumberColumn(row)) reason = 'fewer-values';
    else if (c.filled === 1 && width >= 3 && (c.onlyCell.length >= 25 || /\s\S+\s/.test(c.onlyCell)))
      reason = 'trailing-note';
    else if (c.filled === 1 && width >= 3) reason = 'mostly-blank';

    if (reason) found.push({ index: c.index, reason, preview: preview(row) });
  }

  return found;
}

/** The unnamed pandas/R index: a run counting up from 0 or 1, one at a time, or null. */
export function findIndexColumn(
  sheet: StructureInput,
  headerRowIndex: number | null,
): number | null {
  const rows = sheet.rows;
  const width = Math.max(1, sheet.columnCount);
  if (width < 2) return null;

  const header = headerRowIndex === null ? null : rows[headerRowIndex];
  const start = headerRowIndex === null ? 0 : headerRowIndex + 1;
  const limit = Math.min(rows.length, start + INDEX_SCAN_ROWS);

  for (let c = 0; c < width; c += 1) {
    if (header) {
      const name = (header[c] ?? '').trim();
      if (name && !UNNAMED_HEADER.test(name)) continue;
    } else if (c !== 0) {
      continue; // With no header row, only the leading column can be an index.
    }

    let previous = 0;
    let seen = 0;
    let ok = true;
    for (let r = start; r < limit; r += 1) {
      const value = (rows[r]?.[c] ?? '').trim();
      if (!/^\d{1,9}$/.test(value)) {
        ok = false;
        break;
      }
      const n = Number(value);
      if (seen === 0 ? n > 1 : n !== previous + 1) {
        ok = false;
        break;
      }
      previous = n;
      seen += 1;
    }
    if (ok && seen >= INDEX_MIN_ROWS) return c;
  }
  return null;
}

function grade(standout: number, margin: number): Confidence {
  if (standout >= 0.9 && margin >= 0.5) return 'high';
  if (standout >= 0.6 && margin >= CLOSE_MARGIN) return 'medium';
  return 'low';
}

/** `headerRowIndex` is null when the best row reads as data rather than column names. */
export function analyseStructure(sheet: StructureInput): StructureReport {
  const rows = sheet.rows;
  const scan = buildWindow(rows, sheet.columnCount);
  const candidates = Math.min(scan.depth, HEADER_SCAN_ROWS);

  const raws: number[] = [];
  const scores: HeaderRowScore[] = [];
  for (let r = 0; r < candidates; r += 1) {
    const { raw, reasons } = scoreRow(scan, r);
    raws.push(raw);
    scores.push({ index: r, score: raw - WEIGHT.depth * r, reasons, preview: preview(rows[r]) });
  }

  if (scores.length === 0) {
    return {
      headerRowIndex: null,
      confidence: 'low',
      scores,
      footerCandidates: [],
      indexColumn: null,
    };
  }

  let best = 0;
  for (let i = 1; i < scores.length; i += 1) {
    if (scores[i].score > scores[best].score) best = i;
  }

  // Moving the header off row 0 drops everything above it, so row 0 keeps the job by default.
  let chosen = best;
  if (best !== 0 && looksLikeLabels(scan, 0) && scores[best].score - scores[0].score < MOVE_MARGIN)
    chosen = 0;

  const baseline: number[] = [];
  for (let r = chosen + 1; r < Math.min(scan.depth, chosen + 1 + BODY_ROWS); r += 1) {
    baseline.push(scoreRow(scan, r).raw);
  }
  const bodyScore = baseline.length >= 2 ? median(baseline) : TYPICAL_DATA_SCORE;
  const standout = raws[chosen] - bodyScore;

  const headerRowIndex = looksLikeLabels(scan, chosen) ? scores[chosen].index : null;
  const confidence: Confidence =
    headerRowIndex === null
      ? // Telling a headerless sheet from a weakly-marked one is guesswork.
        'medium'
      : grade(standout, headerMargin(scores));

  return {
    headerRowIndex,
    confidence,
    scores,
    footerCandidates: findFooterRows(sheet, headerRowIndex),
    indexColumn: findIndexColumn(sheet, headerRowIndex),
  };
}
