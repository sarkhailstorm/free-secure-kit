import type { DateFormat, DateOrder, Grid } from './types';

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  febr: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export interface DateParts {
  y: number;
  m: number;
  d: number;
  /** Clock time kept verbatim; empty string when the value had none. */
  time: string;
}

/** `ordered` resolves itself and votes on the column order; `ambiguous` needs the column. */
export type Inspection =
  | { kind: 'not-a-date' }
  | { kind: 'fixed'; parts: DateParts }
  | { kind: 'ordered'; order: DateOrder; parts: DateParts }
  | { kind: 'ambiguous'; a: number; b: number; y: number; time: string };

const NOT_A_DATE: Inspection = { kind: 'not-a-date' };

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  switch (m) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeap(y) ? 29 : 28;
    default:
      return 0;
  }
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || y < 1 || y > 9999) return false;
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

// Two-digit years: 00-68 are 2000s, 69-99 are 1900s (the POSIX window).
function expandYear(raw: string): number {
  const n = Number(raw);
  if (raw.length === 4) return n;
  if (raw.length !== 2) return NaN;
  return n <= 68 ? 2000 + n : 1900 + n;
}

/** Pull a trailing clock time off the end, so `2024-03-04 09:30` keeps 09:30. */
const TIME_SUFFIX =
  /^(.*?)[T\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,6})?(?:\s?[APap]\.?[Mm]\.?)?(?:\s?(?:Z|UTC|GMT|[+-]\d{2}:?\d{2}))?)$/;

const ISO_LIKE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const SEP = '[\\s\\-/]+';
const MONTH_FIRST_TEXT = new RegExp(
  `^([A-Za-z]{3,9})\\.?${SEP}(\\d{1,2})(?:st|nd|rd|th)?,?${SEP}(\\d{2}|\\d{4})$`,
);
const DAY_FIRST_TEXT = new RegExp(
  `^(\\d{1,2})(?:st|nd|rd|th)?${SEP}([A-Za-z]{3,9})\\.?,?${SEP}(\\d{2}|\\d{4})$`,
);
const YEAR_FIRST_TEXT = new RegExp(
  `^(\\d{4})${SEP}([A-Za-z]{3,9})\\.?${SEP}(\\d{1,2})(?:st|nd|rd|th)?$`,
);
/** Slash- and dash-separated numerics tolerate a 2-digit year. */
const NUMERIC_SLASH = /^(\d{1,2})([-/])(\d{1,2})\2(\d{2}|\d{4})$/;
/** Dot-separated numerics demand a 4-digit year, so `1.2.3` stays a version number. */
const NUMERIC_DOT = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

function month(name: string): number | null {
  const key = name.toLowerCase().replace(/\.$/, '');
  return MONTHS[key] ?? null;
}

/** Classify one raw cell value. Pure, allocation-light, never throws. */
export function inspectDate(raw: string): Inspection {
  const value = raw.trim();
  if (value.length < 4 || value.length > 40) return NOT_A_DATE;
  if (!/\d/.test(value)) return NOT_A_DATE;

  let body = value;
  let time = '';
  const withTime = TIME_SUFFIX.exec(value);
  if (withTime) {
    body = withTime[1].trim();
    time = withTime[2].trim();
    if (!body) return NOT_A_DATE;
  }

  const iso = ISO_LIKE.exec(body);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (!isRealDate(y, m, d)) return NOT_A_DATE;
    return { kind: 'fixed', parts: { y, m, d, time } };
  }

  const textual: Array<[RegExpExecArray | null, 'md' | 'dm' | 'ym']> = [
    [MONTH_FIRST_TEXT.exec(body), 'md'],
    [DAY_FIRST_TEXT.exec(body), 'dm'],
    [YEAR_FIRST_TEXT.exec(body), 'ym'],
  ];
  for (const [match, shape] of textual) {
    if (!match) continue;
    let y: number;
    let m: number | null;
    let d: number;
    if (shape === 'md') {
      m = month(match[1]);
      d = Number(match[2]);
      y = expandYear(match[3]);
    } else if (shape === 'dm') {
      d = Number(match[1]);
      m = month(match[2]);
      y = expandYear(match[3]);
    } else {
      y = Number(match[1]);
      m = month(match[2]);
      d = Number(match[3]);
    }
    if (m === null || !isRealDate(y, m, d)) return NOT_A_DATE;
    return { kind: 'fixed', parts: { y, m, d, time } };
  }

  const slash = NUMERIC_SLASH.exec(body);
  const dot = slash ? null : NUMERIC_DOT.exec(body);
  if (!slash && !dot) return NOT_A_DATE;

  const a = Number(slash ? slash[1] : dot![1]);
  const b = Number(slash ? slash[3] : dot![2]);
  const y = expandYear(slash ? slash[4] : dot![3]);
  if (!Number.isFinite(y)) return NOT_A_DATE;

  const dmyWorks = isRealDate(y, b, a); // a = day,   b = month
  const mdyWorks = isRealDate(y, a, b); // a = month, b = day

  if (dmyWorks && mdyWorks) return { kind: 'ambiguous', a, b, y, time };
  if (dmyWorks) return { kind: 'ordered', order: 'dmy', parts: { y, m: b, d: a, time } };
  if (mdyWorks) return { kind: 'ordered', order: 'mdy', parts: { y, m: a, d: b, time } };
  return NOT_A_DATE;
}

export function formatDate(parts: DateParts, format: DateFormat): string {
  const y = String(parts.y).padStart(4, '0');
  const m = String(parts.m).padStart(2, '0');
  const d = String(parts.d).padStart(2, '0');
  const core =
    format === 'iso' ? `${y}-${m}-${d}` : format === 'us' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
  return parts.time ? `${core} ${parts.time}` : core;
}

export const dateFormatLabels: Record<DateFormat, { label: string; example: string }> = {
  iso: { label: 'ISO', example: 'YYYY-MM-DD' },
  us: { label: 'US', example: 'MM/DD/YYYY' },
  eu: { label: 'EU', example: 'DD/MM/YYYY' },
};

/** Returns null to mean "leave this cell exactly as it is". */
export function normaliseCell(
  raw: string,
  order: DateOrder | null,
  format: DateFormat,
): string | null {
  const seen = inspectDate(raw);
  switch (seen.kind) {
    case 'not-a-date':
      return null;
    case 'fixed':
    case 'ordered':
      return formatDate(seen.parts, format);
    case 'ambiguous': {
      if (!order) return null;
      const parts: DateParts =
        order === 'dmy'
          ? { y: seen.y, m: seen.b, d: seen.a, time: seen.time }
          : { y: seen.y, m: seen.a, d: seen.b, time: seen.time };
      return formatDate(parts, format);
    }
  }
}

export type DateColumnReason =
  /** Every value was ISO or used a month name — nothing to decide. */
  | 'unambiguous'
  /** Some value had a day above 12, which settles the whole column. */
  | 'day-over-12'
  /** Values disagree: some read only as DD/MM, others only as MM/DD. */
  | 'conflict'
  /** Every numeric value reads both ways. Genuinely undecidable. */
  | 'all-ambiguous';

export interface DateColumnAnalysis {
  /** Index into the ORIGINAL header, so decisions survive column removal. */
  index: number;
  header: string;
  /** Non-blank cells inspected. */
  values: number;
  dateLike: number;
  /** `auto` → safe to rewrite now. `undecidable` → ask before touching it. */
  status: 'auto' | 'undecidable';
  /** Agreed reading for ambiguous values; `null` when none were present. */
  order: DateOrder | null;
  reason: DateColumnReason;
  samples: string[];
}

/** A column must be at least this date-ish before we will touch it. */
const DATE_COLUMN_THRESHOLD = 0.7;
/** Bail out of obviously-textual columns early on very large files. */
const EARLY_EXIT_AFTER = 300;
const EARLY_EXIT_RATIO = 0.3;

function analyseColumn(header: string, rows: string[][], index: number): DateColumnAnalysis | null {
  let values = 0;
  let dateLike = 0;
  let dmyVotes = 0;
  let mdyVotes = 0;
  let ambiguous = 0;
  const ambiguousSamples: string[] = [];
  const dmySamples: string[] = [];
  const mdySamples: string[] = [];
  const seenSamples = new Set<string>();

  const remember = (bucket: string[], value: string) => {
    if (bucket.length >= 4 || seenSamples.has(value)) return;
    seenSamples.add(value);
    bucket.push(value);
  };

  for (const row of rows) {
    const raw = row[index];
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    values += 1;

    const seen = inspectDate(trimmed);
    if (seen.kind !== 'not-a-date') {
      dateLike += 1;
      if (seen.kind === 'ordered') {
        if (seen.order === 'dmy') {
          dmyVotes += 1;
          remember(dmySamples, trimmed);
        } else {
          mdyVotes += 1;
          remember(mdySamples, trimmed);
        }
      } else if (seen.kind === 'ambiguous') {
        ambiguous += 1;
        remember(ambiguousSamples, trimmed);
      }
    } else if (values >= EARLY_EXIT_AFTER && dateLike / values < EARLY_EXIT_RATIO) {
      return null;
    }
  }

  if (values === 0 || dateLike / values < DATE_COLUMN_THRESHOLD) return null;

  const base = { index, header, values, dateLike };
  const contradicts = dmyVotes > 0 && mdyVotes > 0;
  const conflictSamples = [
    ...dmySamples.slice(0, 1),
    ...mdySamples.slice(0, 1),
    ...ambiguousSamples.slice(0, 2),
  ];

  if (ambiguous === 0) {
    // Every value settles itself, so this is safe even when the column contradicts.
    const order: DateOrder | null = contradicts
      ? null
      : dmyVotes > 0
        ? 'dmy'
        : mdyVotes > 0
          ? 'mdy'
          : null;
    return {
      ...base,
      status: 'auto',
      order,
      reason: contradicts ? 'conflict' : order ? 'day-over-12' : 'unambiguous',
      samples: contradicts ? conflictSamples : [],
    };
  }

  if (dmyVotes > 0 && mdyVotes === 0) {
    return {
      ...base,
      status: 'auto',
      order: 'dmy',
      reason: 'day-over-12',
      samples: [...dmySamples.slice(0, 1), ...ambiguousSamples.slice(0, 3)],
    };
  }
  if (mdyVotes > 0 && dmyVotes === 0) {
    return {
      ...base,
      status: 'auto',
      order: 'mdy',
      reason: 'day-over-12',
      samples: [...mdySamples.slice(0, 1), ...ambiguousSamples.slice(0, 3)],
    };
  }

  return {
    ...base,
    status: 'undecidable',
    order: null,
    reason: contradicts ? 'conflict' : 'all-ambiguous',
    samples: contradicts ? conflictSamples : ambiguousSamples.slice(0, 4),
  };
}

/** Always run against the ORIGINAL parsed grid, so the answer cannot wobble. */
export function analyseDateColumns(grid: Grid): DateColumnAnalysis[] {
  const out: DateColumnAnalysis[] = [];
  for (let i = 0; i < grid.header.length; i += 1) {
    const found = analyseColumn(grid.header[i], grid.rows, i);
    if (found) out.push(found);
  }
  return out;
}
