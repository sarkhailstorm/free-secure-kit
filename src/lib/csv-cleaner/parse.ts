/**
 * Reading the uploaded file.
 *
 * papaparse and SheetJS are both large, so they are imported dynamically inside
 * these functions and never at module scope — the tool page stays small until
 * someone actually drops a file on it.
 *
 * Nothing here touches the network. `File.arrayBuffer()` reads the bytes the
 * browser already has; no request is made and no copy leaves the page. The
 * bytes are let go as soon as the text exists; the caller keeps the `File` and
 * re-reads it if the user disagrees with a guess.
 *
 * Two rules the rest of the tool leans on:
 *   • `ParsedSheet.rows` holds EVERY row, including whatever sits above the
 *     real header. Nothing here decides where the header is.
 *   • Row indexes everywhere else are positions in that array.
 */

import { extension } from '@/lib/format';
import { decodeBytes, detectDelimiter, stripSepLine } from './encoding';
import {
  MAX_LINKED_ROWS,
  type ParsedFile,
  type ParsedSheet,
  type ReadIssue,
  type ReadIssueKind,
  type ReadOptions,
  type Severity,
  type SheetVisibility,
} from './types';

/** Files above this size are refused rather than freezing the tab. */
export const MAX_BYTES = 60 * 1024 * 1024;

/*
 * Nothing here is capped at Excel's ceilings. The reader used to stop at
 * 16,384 columns and 1,048,576 rows and drop the rest — after the whole file
 * had already been read, so it saved nothing and only cost the user data. It
 * also left every file sitting exactly on the limit, which made the refusal in
 * serialize.ts unreachable. A file too big for Excel is still a good CSV, so
 * the file is read whole and it is the save that refuses, not the read.
 */

/** Text files whose fields are separated by a character, and what to expect. */
const DELIMITED_EXTENSIONS: Record<string, string | undefined> = {
  csv: ',',
  tsv: '\t',
  tab: '\t',
  psv: '|',
  txt: undefined,
};

/** Everything SheetJS 0.20.3 can open for us. */
const WORKBOOK_EXTENSIONS: readonly string[] = [
  'xlsx',
  'xlsm',
  'xlsb',
  'xls',
  'ods',
  'fods',
  'numbers',
  'dbf',
  'slk',
  'dif',
];

export const ACCEPTED_EXTENSIONS: readonly string[] = [
  ...Object.keys(DELIMITED_EXTENSIONS),
  ...WORKBOOK_EXTENSIONS,
];

export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',');

export class ParseFailure extends Error {}

// ── Issues ─────────────────────────────────────────────────────────────────

const MAX_SAMPLES = 5;

/** Collects one kind of finding, keeping the row and sample lists bounded. */
class IssueBuilder {
  private count = 0;
  private readonly rows: number[] = [];
  private lastRow = -1;
  private readonly samples: string[] = [];

  add(row: number, sample?: string): void {
    this.count += 1;
    if (row !== this.lastRow && this.rows.length < MAX_LINKED_ROWS) {
      this.rows.push(row);
      this.lastRow = row;
    }
    if (sample !== undefined && sample !== '' && this.samples.length < MAX_SAMPLES) {
      this.samples.push(sample.slice(0, 80));
    }
  }

  build(kind: ReadIssueKind, severity: Severity, extra: Partial<ReadIssue> = {}): ReadIssue | null {
    if (this.count === 0) return null;
    return { kind, severity, count: this.count, rowIndexes: this.rows, samples: this.samples, ...extra };
  }
}

function note(kind: ReadIssueKind, severity: Severity, count: number, extra: Partial<ReadIssue> = {}): ReadIssue {
  return { kind, severity, count, rowIndexes: [], samples: [], ...extra };
}

// ── Shaping ────────────────────────────────────────────────────────────────

/**
 * Square off a ragged table so every row has the same number of cells, and keep
 * the indexes of the rows that were the wrong length.
 *
 * Papaparse only reports that in header mode, which this tool cannot use — a
 * messy file is exactly the case where the header row is not yet trustworthy.
 */
function pad(
  rows: string[][],
  separator: string,
): { rows: string[][]; columnCount: number; ragged: ReadIssue | null } {
  let width = 0;
  for (const row of rows) if (row.length > width) width = row.length;

  const ragged = new IssueBuilder();
  const out = rows.map((row, index) => {
    if (row.length !== width) ragged.add(index, row.join(separator));
    const padded = new Array<string>(width);
    for (let i = 0; i < width; i += 1) padded[i] = row[i] ?? '';
    return padded;
  });
  return { rows: out, columnCount: width, ragged: ragged.build('ragged-rows', 'info') };
}

/** Excel's stated range usually overshoots; phantom rows are not blank rows. */
function trimTrailingBlankRows(rows: string[][]): void {
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell === '')) rows.pop();
}

function makeSheet(
  name: string,
  index: number,
  visibility: SheetVisibility,
  rows: string[][],
  issues: readonly ReadIssue[],
  /** What goes between cells when a row is quoted back to the user. */
  separator: string,
): ParsedSheet {
  const padded = pad(rows, separator);
  const all = [...issues];
  if (padded.ragged) all.push(padded.ragged);
  if (padded.rows.length === 0 || padded.columnCount === 0) {
    all.push(note('empty-sheet', 'info', 1, { sheetIndex: index }));
  }
  return {
    name,
    index,
    visibility,
    rows: padded.rows,
    columnCount: padded.columnCount,
    rowCount: padded.rows.length,
    truncated: false, // nothing is ever left behind; kept so the shape is stable
    issues: all,
  };
}

// ── Delimited text ─────────────────────────────────────────────────────────

/**
 * How many source lines an unclosed quote swallowed into one cell.
 *
 * This is the honest number: the rows did not "run together", they are gone,
 * and that is what the UI has to be able to say.
 */
function linesSwallowed(row: readonly string[]): number {
  let breaks = 0;
  let endsWithBreak = false;
  for (const cell of row) {
    for (let i = 0; i < cell.length; i += 1) if (cell.charCodeAt(i) === 10) breaks += 1;
    if (cell !== '') endsWithBreak = cell.endsWith('\n');
  }
  return Math.max(0, breaks - (endsWithBreak ? 1 : 0));
}

async function parseDelimited(file: File, ext: string, options: ReadOptions): Promise<ParsedFile> {
  const Papa = await import('papaparse');
  const decoded = decodeBytes(new Uint8Array(await file.arrayBuffer()), {
    encoding: options.encoding,
    repairMojibake: options.repairMojibake,
  });

  const stripped = stripSepLine(decoded.text);
  if (stripped.text.trim() === '') {
    throw new ParseFailure('That file is empty — there are no rows to clean.');
  }

  const delimiter = detectDelimiter(stripped.text, {
    delimiter: options.delimiter,
    declared: stripped.delimiter,
    preferred: DELIMITED_EXTENSIONS[ext],
    sepLine: stripped.sepLine,
  });

  const result = Papa.parse<string[]>(stripped.text, {
    delimiter: delimiter.delimiter,
    skipEmptyLines: false,
    header: false,
    dynamicTyping: false,
  });

  const rows = result.data.filter(Array.isArray);

  // Almost every CSV ends with a newline, and papaparse turns that final line
  // terminator into one extra row holding a single empty string. It is an
  // artefact of the file ending, not a blank row the user typed, so drop it —
  // otherwise every well-formed file would be reported as ragged and as having
  // had "1 blank row removed", and a clean file could never say it was clean.
  const last = rows[rows.length - 1];
  if (rows.length > 1 && last.length === 1 && last[0] === '' && /[\r\n]$/.test(stripped.text)) {
    rows.pop();
  }
  if (rows.length === 0) {
    throw new ParseFailure('Nothing could be read from that file — is it really a CSV?');
  }

  const issues: ReadIssue[] = [];

  const quoteRows: number[] = [];
  const quoteSamples: string[] = [];
  const counted = new Set<number>();
  let rowsLost = 0;
  for (const error of result.errors) {
    if (error.code !== 'MissingQuotes' && error.code !== 'InvalidQuotes') continue;
    const index = error.row ?? 0;
    const row = rows[index];
    // papaparse raises a second error for the same row when the quote reopens
    // further down the file. That is still one damaged row.
    if (!row || counted.has(index)) continue;
    counted.add(index);
    rowsLost += linesSwallowed(row);
    if (quoteRows.length < MAX_LINKED_ROWS) quoteRows.push(index);
    if (quoteSamples.length < MAX_SAMPLES) {
      quoteSamples.push(row.join(delimiter.delimiter).slice(0, 80));
    }
  }
  // A quote left open on the last line of the file costs nothing, and nobody
  // needs to be told in red that no rows were lost.
  if (rowsLost > 0) {
    issues.push({
      kind: 'unclosed-quote',
      severity: 'serious',
      count: rowsLost,
      rowIndexes: quoteRows,
      samples: quoteSamples,
    });
  }

  if (stripped.sepLine !== null) {
    issues.push(note('sep-line-removed', 'info', 1, { samples: [stripped.sepLine] }));
  }
  if (decoded.report.replacements > 0) {
    issues.push(note('replacement-characters', 'warning', decoded.report.replacements));
  }

  return {
    filename: file.name,
    kind: 'delimited',
    extension: ext,
    sheets: [makeSheet(file.name, 0, 'visible', rows, [], delimiter.delimiter)],
    decode: decoded.report,
    delimiter,
    issues,
  };
}

// ── Workbooks ──────────────────────────────────────────────────────────────

type CellObject = import('xlsx').CellObject;

interface DateParts {
  y: number;
  m: number;
  d: number;
  H: number;
  M: number;
  S: number;
}
type ParseDateCode = (serial: number) => DateParts | null | undefined;

/**
 * A number format with its literals taken out, so the tokens that are left
 * really are tokens. `[h]` is elapsed hours and has to survive; `[$-409]` and
 * `[Red]` do not.
 */
function formatTokens(z: string): string {
  return z
    .replace(/\\./g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/\[(h+|m+|s+)\]/gi, '$1')
    .replace(/\[[^\]]*\]/g, '');
}

type NumberKind = 'percent' | 'time' | 'date' | 'named' | 'plain';

function numberKind(z: string | undefined, w: string | undefined): NumberKind {
  if (z !== undefined && z !== 'General') {
    const tokens = formatTokens(z);
    if (tokens.includes('%')) return 'percent';
    // mmm and dddd render a month or day NAME. Nothing rebuilt from the serial
    // can reproduce it, so Excel's own text is the only faithful reading.
    if (/m{3,}|d{3,}/i.test(tokens)) return 'named';
    const hasDate = /[yd]/i.test(tokens);
    if (/[hs]/i.test(tokens) && !hasDate) return 'time';
    return hasDate ? 'date' : 'plain';
  }
  // No format string to read: fall back to what Excel displayed.
  if (w === undefined) return 'plain';
  if (/%\s*$/.test(w)) return 'percent';
  return /^\d{1,2}:\d{2}(:\d{2})?(\.\d+)?(\s*[AaPp]\.?[Mm]\.?)?$/.test(w.trim()) ? 'time' : 'plain';
}

/**
 * A number written as a percentage.
 *
 * The decimal point is moved rather than the number multiplied by 100, because
 * 0.123 * 100 is 12.299999999999999. Reading Excel's displayed text instead
 * would be worse: its Percent Style button shows 0.123456789 as "12%", and the
 * digits it drops are the user's, not ours to throw away.
 */
function percentText(value: number): string {
  if (value === 0) return '0';
  const parts = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(value.toExponential());
  if (!parts) return String(value * 100);
  const [, sign, lead, rest = '', exponent] = parts;
  const digits = lead + rest;
  const point = Number(exponent) + 3;
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return sign + digits + '0'.repeat(point - digits.length);
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoFromSerial(p: DateParts): string {
  const date = `${String(p.y).padStart(4, '0')}-${pad2(p.m)}-${pad2(p.d)}`;
  if (p.H === 0 && p.M === 0 && p.S === 0) return date;
  return `${date} ${pad2(p.H)}:${pad2(p.M)}:${pad2(p.S)}`;
}

function dateToText(value: Date): string {
  const date = `${String(value.getFullYear()).padStart(4, '0')}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  if (value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0) return date;
  return `${date} ${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;
}

interface SheetTallies {
  errors: IssueBuilder;
  times: IssueBuilder;
  percentages: IssueBuilder;
  formulas: IssueBuilder;
}

/**
 * One cell as text.
 *
 * Three things a plain read gets wrong, and that this fixes: an error cell is
 * its own text and not a blank, a clock time stays a time instead of becoming a
 * date in 1899, and a percentage keeps its sign instead of arriving as the
 * decimal underneath it.
 */
function cellToText(cell: CellObject, row: number, tallies: SheetTallies, parseDateCode: ParseDateCode): string {
  if (cell.f !== undefined) tallies.formulas.add(row, cell.f);

  if (cell.t === 'e') {
    const text = cell.w ?? '#VALUE!';
    tallies.errors.add(row, text);
    return text;
  }
  if (cell.t === 'z' || cell.v === undefined || cell.v === null) return '';
  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE';
  if (cell.t === 'd') return cell.v instanceof Date ? dateToText(cell.v) : String(cell.v);
  if (cell.t !== 'n') return String(cell.v);

  const value = Number(cell.v);
  if (!Number.isFinite(value)) return '';

  switch (numberKind(typeof cell.z === 'string' ? cell.z : undefined, cell.w)) {
    case 'percent': {
      const text = `${percentText(value)}%`;
      tallies.percentages.add(row, text);
      return text;
    }
    case 'time':
      tallies.times.add(row, cell.w);
      return cell.w ?? String(value);
    case 'named':
      return cell.w ?? String(value);
    case 'date': {
      const parts = parseDateCode(value);
      return parts ? isoFromSerial(parts) : (cell.w ?? String(value));
    }
    default:
      return String(value);
  }
}

const VISIBILITY: readonly SheetVisibility[] = ['visible', 'hidden', 'very-hidden'];

async function parseWorkbook(file: File, ext: string): Promise<ParsedFile> {
  const XLSX = await import('xlsx');
  const bytes = new Uint8Array(await file.arrayBuffer());

  let workbook: import('xlsx').WorkBook;
  try {
    // `cellNF` is what lets a percentage tell itself apart from a clock time.
    // `cellDates` is deliberately off: it is the option that turns 12:30 into
    // the 31st of December 1899.
    workbook = XLSX.read(bytes, { type: 'array', cellNF: true, cellText: true, cellDates: false });
  } catch {
    throw new ParseFailure(
      'That workbook could not be opened. It may be password-protected, or not really a spreadsheet.',
    );
  }

  const parseDateCode = XLSX.SSF.parse_date_code as ParseDateCode;
  const declared = workbook.Workbook?.Sheets ?? [];
  const sheets: ParsedSheet[] = [];

  workbook.SheetNames.forEach((name, index) => {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) return;

    const tallies: SheetTallies = {
      errors: new IssueBuilder(),
      times: new IssueBuilder(),
      percentages: new IssueBuilder(),
      formulas: new IssueBuilder(),
    };
    const issues: ReadIssue[] = [];
    const rows: string[][] = [];

    // Walking the cells that exist, rather than the stated rectangle, keeps a
    // sheet whose range overshoots from costing anything.
    for (const key in worksheet) {
      if (key.charCodeAt(0) === 33) continue; // '!ref', '!merges', …
      const at = XLSX.utils.decode_cell(key);
      const text = cellToText(worksheet[key] as CellObject, at.r, tallies, parseDateCode);
      if (text === '') continue;
      const row = rows[at.r] ?? (rows[at.r] = []);
      row[at.c] = text;
    }
    for (let r = 0; r < rows.length; r += 1) rows[r] ??= [];
    trimTrailingBlankRows(rows);
    for (const row of rows) for (let c = 0; c < row.length; c += 1) row[c] ??= '';


    const visibility = VISIBILITY[declared[index]?.Hidden ?? 0] ?? 'visible';
    if (visibility !== 'visible') {
      issues.push(note('hidden-sheet', 'warning', 1, { sheetIndex: index, samples: [name] }));
    }
    const merges = worksheet['!merges']?.length ?? 0;
    if (merges > 0) issues.push(note('merged-cells', 'warning', merges, { sheetIndex: index }));

    for (const issue of [
      tallies.errors.build('excel-error-cells', 'warning', { sheetIndex: index }),
      tallies.times.build('time-only-cells', 'info', { sheetIndex: index }),
      tallies.percentages.build('percentage-cells', 'info', { sheetIndex: index }),
      tallies.formulas.build('formula-cells', 'info', { sheetIndex: index }),
    ]) {
      if (issue) issues.push(issue);
    }

    sheets.push(makeSheet(name, index, visibility, rows, issues, '\t'));
  });

  if (sheets.length === 0) throw new ParseFailure('That workbook has no sheets in it.');
  if (sheets.every((s) => s.rowCount === 0)) throw new ParseFailure('Every sheet in that workbook is empty.');

  return { filename: file.name, kind: 'workbook', extension: ext, sheets, decode: null, delimiter: null, issues: [] };
}

// ── Dispatch ───────────────────────────────────────────────────────────────

/**
 * What a file is when its name does not say — an iOS or WhatsApp share often
 * arrives with no extension at all.
 */
function looksLikeAWorkbook(bytes: Uint8Array): boolean {
  const [b0, b1, b2, b3] = bytes;
  if (b0 === 0x50 && b1 === 0x4b) return true; // zip: xlsx, xlsb, ods, numbers
  if (b0 === 0xd0 && b1 === 0xcf && b2 === 0x11 && b3 === 0xe0) return true; // the old xls
  const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 16));
  if (/^\s*</.test(head)) return true; // fods, SpreadsheetML, an HTML table
  if (head.startsWith('ID;') || head.startsWith('TABLE')) return true; // slk, dif
  // dBASE: a version byte, then a plausible year-month-day stamp.
  const dbase = [0x02, 0x03, 0x04, 0x05, 0x30, 0x31, 0x32, 0x43, 0x63, 0x83, 0x8b, 0x8c, 0xcb, 0xe5, 0xf5, 0xfb];
  return dbase.includes(b0) && b2 >= 1 && b2 <= 12 && b3 >= 1 && b3 <= 31;
}

/** Read a dropped file into one or more sheets of strings. */
export async function parseFile(file: File, options: ReadOptions = {}): Promise<ParsedFile> {
  if (file.size > MAX_BYTES) {
    throw new ParseFailure(
      'That file is larger than 60 MB. Everything runs in this tab, so very large files would freeze it.',
    );
  }
  if (file.size === 0) throw new ParseFailure('That file is empty.');

  const ext = extension(file.name);
  if (ext === 'prn') {
    // A .prn lines its columns up with spaces and never records where one
    // ends, so any split is a guess dressed up as a table.
    throw new ParseFailure(
      'A .prn file lines its columns up with spaces, so there is no way to tell where one column ends and the next begins. Open it in Excel and save it as a .csv file instead.',
    );
  }
  if (ext in DELIMITED_EXTENSIONS) return parseDelimited(file, ext, options);
  if (WORKBOOK_EXTENSIONS.includes(ext)) return parseWorkbook(file, ext);
  if (ext === '') {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    return looksLikeAWorkbook(head) ? parseWorkbook(file, ext) : parseDelimited(file, 'csv', options);
  }
  throw new ParseFailure(`.${ext} files are not supported — try a .csv, .tsv or .xlsx file instead.`);
}
