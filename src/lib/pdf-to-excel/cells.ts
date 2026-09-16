import type { Pt } from '@/lib/pdf-to-word/types';
import {
  DECIMALS_MAX,
  MONEY_DECIMALS_MIN,
  TYPE_MIN_SAMPLE,
  TYPE_SHARE_MIN,
} from './constants';
import type { Cell, CellValue, Column, ColumnAlign, ColumnKind, DateOrder } from './types';

/* ---------- amounts ---------- */

export type Grouping = 'none' | 'plain' | 'indian' | 'european' | 'space';

export interface Amount {
  /** Signed: DR, brackets and a leading or trailing minus all make it negative. */
  value: number;
  negative: boolean;
  currency: string | null;
  marker: 'CR' | 'DR' | null;
  grouping: Grouping;
  decimals: number;
}

const SYMBOL = /[£$€₹¥₨]/g;
const CODE = /(?:\b(?:GBP|USD|EUR|INR|AUD|CAD|SGD|AED)\b|\bRs\.?|\bINR\.?)/gi;
const SPACE = /[\s   ]/g;
/** 1 234 567,89 — here a space is a thousands separator and nothing else. */
const GROUP_SPACE = /^\d{1,3}(?:[    ]\d{3})+(?:[.,]\d{1,2})?$/;
const GROUP_PLAIN = /^\d{1,3}(?:,\d{3})+$/;
const GROUP_INDIAN = /^\d{1,2}(?:,\d{2})+,\d{3}$/;
const GROUP_EURO = /^\d{1,3}(?:\.\d{3})+$/;
const CR_DR = /(^|[\s\d.])(CR|DR|Cr|Dr|cr|dr)(\.?)(\s|$)/;
const BRACKETED = /^\(\s*(.*?)\s*\)$/;

function currencyOf(raw: string): string | null {
  const symbol = raw.match(SYMBOL);
  if (symbol) return symbol[0];
  const code = raw.match(CODE);
  return code ? code[0].toUpperCase().replace(/\.$/, '') : null;
}

/** Anything genuinely ambiguous returns null rather than a guess. */
export function parseAmount(input: string): Amount | null {
  if (typeof input !== 'string') return null;
  let s = input.replace(/[−–—]/g, '-').trim();
  if (s === '') return null;
  const currency = currencyOf(s);
  s = s.replace(SYMBOL, '').replace(CODE, '').trim();

  let negative = false;
  let marker: 'CR' | 'DR' | null = null;
  const outer = BRACKETED.exec(s);
  if (outer) {
    negative = true;
    s = outer[1];
  }

  const crdr = CR_DR.exec(s);
  if (crdr) {
    marker = crdr[2].toUpperCase() === 'DR' ? 'DR' : 'CR';
    if (marker === 'DR') negative = true;
    s = (
      s.slice(0, crdr.index + crdr[1].length) +
      ' ' +
      s.slice(crdr.index + crdr[0].length)
    ).trim();
  }
  const inner = BRACKETED.exec(s);
  if (inner) {
    negative = true;
    s = inner[1];
  }

  const spaced = GROUP_SPACE.test(s.trim()) ? s.trim() : null;
  if (spaced) {
    const at = Math.max(spaced.lastIndexOf('.'), spaced.lastIndexOf(','));
    const int = (at >= 0 ? spaced.slice(0, at) : spaced).replace(SPACE, '');
    const frac = at >= 0 ? spaced.slice(at + 1) : '';
    const value = Number(int + (frac ? '.' + frac : ''));
    if (!/^\d+$/.test(int) || !Number.isFinite(value)) return null;
    return {
      value: negative ? -value : value,
      negative,
      currency,
      marker,
      grouping: 'space',
      decimals: frac.length,
    };
  }

  s = s.replace(SYMBOL, '').replace(CODE, '').replace(SPACE, '').trim();
  if (/^-/.test(s)) {
    negative = true;
    s = s.slice(1);
  }
  if (/-$/.test(s)) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (/^\+/.test(s)) s = s.slice(1);
  if (s === '' || !/\d/.test(s) || /[^\d.,]/.test(s)) return null;

  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let int = s;
  let frac = '';
  let grouping: Grouping = 'none';

  if (dots > 0 && commas > 0) {
    // The separator nearer the end is the decimal point.
    const at = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    int = s.slice(0, at);
    frac = s.slice(at + 1);
    if (!/^\d{1,3}$/.test(frac)) return null;
    if (decimal === '.') {
      if (GROUP_INDIAN.test(int)) grouping = 'indian';
      else if (GROUP_PLAIN.test(int)) grouping = 'plain';
      else return null;
      int = int.replace(/,/g, '');
    } else {
      if (!GROUP_EURO.test(int)) return null;
      grouping = 'european';
      int = int.replace(/\./g, '');
    }
  } else if (dots === 1) {
    const [head, tail] = s.split('.');
    // 1.234 is a thousands group in one country and a decimal in another.
    if (!/^\d{1,2}$/.test(tail)) return null;
    int = head;
    frac = tail;
  } else if (dots > 1) {
    if (!GROUP_EURO.test(s)) return null;
    grouping = 'european';
    int = s.replace(/\./g, '');
  } else if (commas > 0) {
    if (GROUP_INDIAN.test(s)) {
      grouping = 'indian';
      int = s.replace(/,/g, '');
    } else if (GROUP_PLAIN.test(s)) {
      grouping = 'plain';
      int = s.replace(/,/g, '');
    } else if (commas === 1 && /^\d{1,3},\d{1,2}$/.test(s)) {
      const [head, tail] = s.split(',');
      int = head;
      frac = tail;
      grouping = 'european';
    } else return null;
  }

  if (!/^\d+$/.test(int)) return null;
  const value = Number(int + (frac ? '.' + frac : ''));
  if (!Number.isFinite(value)) return null;
  return {
    value: negative ? -value : value,
    negative,
    currency,
    marker,
    grouping,
    decimals: frac.length,
  };
}

/* ---------- dates ---------- */

export interface DateRead {
  iso: string | null;
  order: DateOrder | null;
  ambiguous: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const iso = (y: number, m: number, d: number): string =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const valid = (y: number, m: number, d: number): boolean =>
  m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();

const year4 = (y: number): number => (y >= 100 ? y : y >= 70 ? 1900 + y : 2000 + y);

function monthOf(name: string): number | undefined {
  const key = name.toLowerCase();
  return MONTHS[key.length > 4 ? key.slice(0, 3) : key] ?? MONTHS[key.slice(0, 3)];
}

const YMD = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const D_MONTH_Y = /^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ](\d{2,4})$/;
const MONTH_D_Y = /^([A-Za-z]{3,9})[-/. ](\d{1,2}),?[-/. ](\d{2,4})$/;
const NUMERIC = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/;

/** `order` settles a numeric date whose first two parts are both 12 or under. */
export function parseDate(input: string, order: DateOrder | null = null): DateRead | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/ /g, ' ');
  if (s === '') return null;

  const ymd = YMD.exec(s);
  if (ymd) {
    const [y, m, d] = [+ymd[1], +ymd[2], +ymd[3]];
    return valid(y, m, d) ? { iso: iso(y, m, d), order: 'ymd', ambiguous: false } : null;
  }

  const dmy = D_MONTH_Y.exec(s);
  if (dmy) {
    const m = monthOf(dmy[2]);
    const y = year4(+dmy[3]);
    const d = +dmy[1];
    return m && valid(y, m, d) ? { iso: iso(y, m, d), order: 'dmy', ambiguous: false } : null;
  }

  const mdy = MONTH_D_Y.exec(s);
  if (mdy) {
    const m = monthOf(mdy[1]);
    const y = year4(+mdy[3]);
    const d = +mdy[2];
    return m && valid(y, m, d) ? { iso: iso(y, m, d), order: 'mdy', ambiguous: false } : null;
  }

  const numeric = NUMERIC.exec(s);
  if (numeric) {
    const a = +numeric[1];
    const b = +numeric[2];
    const y = year4(+numeric[3]);
    if (a > 12 && b <= 12) return valid(y, b, a) ? { iso: iso(y, b, a), order: 'dmy', ambiguous: false } : null;
    if (b > 12 && a <= 12) return valid(y, a, b) ? { iso: iso(y, a, b), order: 'mdy', ambiguous: false } : null;
    if (a > 12 && b > 12) return null;
    if (order === 'dmy') return valid(y, b, a) ? { iso: iso(y, b, a), order: 'dmy', ambiguous: true } : null;
    if (order === 'mdy') return valid(y, a, b) ? { iso: iso(y, a, b), order: 'mdy', ambiguous: true } : null;
    return { iso: null, order: null, ambiguous: true };
  }
  return null;
}

/** One unambiguous date in the column settles every other date in it. */
export function columnDateOrder(values: readonly string[]): DateOrder | null {
  let dmy = 0;
  let mdy = 0;
  for (const value of values) {
    const read = parseDate(value);
    if (!read || read.ambiguous) continue;
    if (read.order === 'dmy') dmy++;
    else if (read.order === 'mdy') mdy++;
  }
  if (dmy === 0 && mdy === 0) return null;
  return dmy >= mdy ? 'dmy' : 'mdy';
}

/** Nothing to vote with, but the column holds numeric dates: read them day first and say so. */
function resolveOrder(values: readonly string[]): DateOrder | null {
  const voted = columnDateOrder(values);
  if (voted) return voted;
  for (const value of values) {
    const read = parseDate(value);
    if (read && read.ambiguous) return 'dmy';
  }
  return null;
}

/* ---------- column typing ---------- */

/** The part of a grouped row that typing reads. */
export interface TypingRow {
  cells: readonly string[];
}

/** The part of a column profile that typing reads. */
export interface TypingProfile {
  cols: readonly { x0: Pt; x1: Pt; align: ColumnAlign }[];
}

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));

function sameRow(cells: readonly string[], header: readonly string[]): boolean {
  if (cells.length !== header.length) return false;
  return cells.every((cell, i) => cell.trim() === header[i].trim());
}

export function typeColumns(
  rows: readonly TypingRow[],
  profile: TypingProfile | null,
  header: readonly string[] | null,
): Column[] {
  const body = header && rows.length > 0 && sameRow(rows[0].cells, header) ? rows.slice(1) : rows;

  let width = Math.max(profile?.cols.length ?? 0, header?.length ?? 0);
  for (const row of body) width = Math.max(width, row.cells.length);

  const columns: Column[] = [];
  for (let i = 0; i < width; i++) {
    const values: string[] = [];
    for (const row of body) {
      const raw = (row.cells[i] ?? '').trim();
      if (raw !== '') values.push(raw);
    }
    const sampled = values.length;
    const order = resolveOrder(values);

    let dates = 0;
    let amounts = 0;
    let decimals = 0;
    let moneyish = false;
    for (const value of values) {
      if (parseDate(value, order)?.iso) dates++;
      const amount = parseAmount(value);
      if (!amount) continue;
      amounts++;
      decimals = Math.max(decimals, amount.decimals);
      if (
        amount.currency !== null ||
        amount.marker !== null ||
        amount.decimals >= MONEY_DECIMALS_MIN ||
        BRACKETED.test(value)
      ) {
        moneyish = true;
      }
    }

    const enough = sampled >= TYPE_MIN_SAMPLE;
    let kind: ColumnKind = 'text';
    let agreed = sampled;
    if (enough && dates / sampled >= TYPE_SHARE_MIN) {
      kind = 'date';
      agreed = dates;
    } else if (enough && amounts / sampled >= TYPE_SHARE_MIN) {
      kind = moneyish ? 'money' : 'number';
      agreed = amounts;
    }

    const geometry = profile?.cols[i];
    columns.push({
      index: i,
      x0: geometry?.x0 ?? 0,
      x1: geometry?.x1 ?? 0,
      // Without a profile the kind decides it, the way a spreadsheet would.
      align: geometry?.align ?? (kind === 'money' || kind === 'number' ? 'right' : 'left'),
      kind,
      header: (header?.[i] ?? '').trim(),
      decimals:
        kind === 'money'
          ? clamp(decimals, MONEY_DECIMALS_MIN, DECIMALS_MAX)
          : kind === 'number'
            ? Math.min(decimals, DECIMALS_MAX)
            : 0,
      dateOrder: kind === 'date' ? order : null,
      balance: false,
      sampled,
      agreed,
    });
  }
  return columns;
}

/** A cell that does not match its column keeps its page text and is marked, never blanked. */
export function typeCell(raw: string, column: Column): Cell {
  const text = raw.trim();
  if (text === '') return { raw, value: { kind: 'empty' }, offType: false };

  let value: CellValue | null = null;
  if (column.kind === 'date') {
    const read = parseDate(text, column.dateOrder);
    if (read?.iso) value = { kind: 'date', iso: read.iso, ambiguous: read.ambiguous };
  } else if (column.kind === 'money' || column.kind === 'number') {
    const amount = parseAmount(text);
    if (amount) {
      value = {
        kind: 'number',
        value: amount.value,
        decimals: column.decimals,
        currency: amount.currency,
        marker: amount.marker,
      };
    }
  } else {
    value = { kind: 'text', text };
  }

  if (value) return { raw, value, offType: false };
  return { raw, value: { kind: 'text', text }, offType: true };
}
