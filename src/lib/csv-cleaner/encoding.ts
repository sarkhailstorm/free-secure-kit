/**
 * Bytes in, text out — and the two guesses a delimited file needs before it can
 * be parsed at all: what it was saved in, and what separates the fields.
 *
 * Every decoder used here is the browser's own `TextDecoder`, so none of this
 * adds a byte to the bundle. Nothing touches the network.
 */

import type {
  BomKind,
  Confidence,
  DecodeReport,
  DelimiterCandidate,
  DelimiterReport,
  EncodingCandidate,
  EncodingId,
  MojibakeReport,
} from './types';

export const ENCODING_LABELS: Record<EncodingId, string> = {
  'utf-8': 'Unicode (UTF-8)',
  'utf-16le': 'Unicode (UTF-16, little-endian)',
  'utf-16be': 'Unicode (UTF-16, big-endian)',
  'windows-1252': 'Western European (Windows)',
  'windows-1251': 'Cyrillic (Windows)',
  'iso-8859-2': 'Central European (ISO)',
  'iso-8859-7': 'Greek (ISO)',
  'iso-8859-15': 'Western European (ISO, with €)',
  macintosh: 'Western European (Mac)',
  shift_jis: 'Japanese (Shift JIS)',
  gb18030: 'Chinese, simplified (GB18030)',
  big5: 'Chinese, traditional (Big5)',
  'euc-kr': 'Korean (EUC-KR)',
};

/**
 * windows-1252's own 0x80–0x9F block. Every other byte is the same code point,
 * which is why this is the whole table.
 *
 * It is written out rather than read back from a TextDecoder because Node's
 * decoder for this label is really Latin-1, and because a windows-1252 ENCODER
 * cannot be built any other way: `TextEncoder` is UTF-8 only by specification
 * and silently ignores its argument.
 */
const CP1252_HIGH =
  '\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u008D\u017D\u008F' +
  '\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178';

const C1_RANGE = /[\u0080-\u009F]/;
const C1_RANGE_ALL = /[\u0080-\u009F]/g;

/** How many bytes are read before a guess is made. The whole file is decoded. */
const SNIFF_BYTES = 64 * 1024;
const SAMPLE_CHARS = 400;

export interface BomMatch {
  kind: BomKind;
  /** Bytes to skip before decoding. */
  length: number;
}

export function sniffBom(bytes: Uint8Array): BomMatch | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { kind: 'utf-8', length: 3 };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { kind: 'utf-16le', length: 2 };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { kind: 'utf-16be', length: 2 };
  return null;
}

function decodeWith(id: EncodingId, bytes: Uint8Array): string {
  const text = new TextDecoder(id).decode(bytes);
  // Repair the one label browsers and Node disagree about, so a 0x80 byte is
  // always € and never an invisible control character.
  if (id === 'windows-1252' && C1_RANGE.test(text)) {
    return text.replace(C1_RANGE_ALL, (c) => CP1252_HIGH[c.charCodeAt(0) - 0x80]);
  }
  return text;
}

let reverse1252: Map<string, number> | null = null;

/**
 * Text back to windows-1252 bytes. Anything the table cannot hold becomes `?`,
 * which is what Excel itself writes.
 *
 * `strict` makes an unmappable character throw instead, which is what the
 * mojibake check relies on.
 */
export function encodeWindows1252(text: string, strict = false): Uint8Array {
  if (!reverse1252) {
    reverse1252 = new Map();
    for (let b = 0; b < 256; b += 1) {
      reverse1252.set(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b), b);
    }
  }
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const byte = reverse1252.get(text[i]);
    if (byte === undefined) {
      if (strict) throw new RangeError('not windows-1252');
      out[i] = 0x3f;
    } else {
      out[i] = byte;
    }
  }
  return out;
}

// ── Scoring one reading of the same bytes ──────────────────────────────────

const ASCII_LETTER = /[A-Za-z]/;
const LETTER = /\p{L}/u;
const SYMBOLIC = /[\p{S}\p{N}]/u;
const LATIN_HIGH = /[\u00C0-\u024F\u1E00-\u1EFF]/u;
const CYRILLIC = /[\u0400-\u04FF]/u;
const GREEK = /[\u0370-\u03FF]/u;
const CJK = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/u;

/** The eight slots where iso-8859-15 differs from windows-1252. */
const LATIN9_SLOTS = /[\u00A4\u00A6\u00A8\u00B4\u00B8\u00BC\u00BD\u00BE]/;

const LATIN_VOWEL =
  /[aeiouyAEIOUY\u00C0-\u00C6\u00C8-\u00CF\u00D2-\u00D6\u00D8-\u00DD\u00E0-\u00E6\u00E8-\u00EF\u00F2-\u00F6\u00F8-\u00FD\u00FF]/;
const CYRILLIC_VOWEL = /[\u0430\u0435\u0451\u0438\u043E\u0443\u044B\u044D\u044E\u044F\u0410\u0415\u0401\u0418\u041E\u0423\u042B\u042D\u042E\u042F]/;
const GREEK_VOWEL =
  /[\u03B1\u03B5\u03B7\u03B9\u03BF\u03C5\u03C9\u03AC\u03AD\u03AE\u03AF\u03CC\u03CD\u03CE\u03CA\u03CB\u0390\u03B0\u0391\u0395\u0397\u0399\u039F\u03A5\u03A9\u0386\u0388\u0389\u038A\u038C\u038E\u038F]/;

/** How likely a file is to be in each encoding before we look at it at all. */
const PRIORS: Array<[EncodingId, number]> = [
  ['utf-8', 1],
  ['windows-1252', 1],
  ['iso-8859-15', 0.97],
  ['windows-1251', 0.95],
  ['iso-8859-2', 0.93],
  ['iso-8859-7', 0.93],
  ['shift_jis', 0.9],
  ['gb18030', 0.88],
  ['big5', 0.85],
  ['euc-kr', 0.85],
  ['macintosh', 0.7],
];

interface Reading {
  score: number;
  replacements: number;
}

/**
 * Judge a reading by how much of it could not be real writing.
 *
 * The signals are all things a wrong byte table produces and real text does
 * not: replacement characters, invisible controls, a currency sign wedged
 * inside a word, a Cyrillic letter in the middle of an English one, nothing but
 * accented letters, or a run of letters with no vowels in it.
 */
function scoreReading(text: string, prior: number): Reading {
  let replacements = 0;
  let controls = 0;
  let symbolInWord = 0;
  let mixedScript = 0;
  let latin9 = 0;
  let ascii = 0;
  let latin = 0;
  let cyrillic = 0;
  let greek = 0;
  let cjk = 0;
  let latinVowels = 0;
  let cyrillicVowels = 0;
  let greekVowels = 0;

  const n = text.length;
  for (let i = 0; i < n; i += 1) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    if (code === 0xfffd) {
      replacements += 1;
      continue;
    }
    if (code < 0x80) {
      if (ASCII_LETTER.test(ch)) {
        ascii += 1;
        if (LATIN_VOWEL.test(ch)) latinVowels += 1;
      }
      continue;
    }
    if (code <= 0x9f) {
      controls += 1;
      continue;
    }
    const before = i > 0 ? text[i - 1] : '';
    const after = i + 1 < n ? text[i + 1] : '';
    const touchesAscii = ASCII_LETTER.test(before) || ASCII_LETTER.test(after);

    if (LATIN_HIGH.test(ch)) {
      latin += 1;
      if (LATIN_VOWEL.test(ch)) latinVowels += 1;
    } else if (CYRILLIC.test(ch)) {
      cyrillic += 1;
      if (CYRILLIC_VOWEL.test(ch)) cyrillicVowels += 1;
      if (touchesAscii) mixedScript += 1;
    } else if (GREEK.test(ch)) {
      greek += 1;
      if (GREEK_VOWEL.test(ch)) greekVowels += 1;
      if (touchesAscii) mixedScript += 1;
    } else if (CJK.test(ch)) {
      cjk += 1;
      if (touchesAscii) mixedScript += 1;
    } else {
      if (LATIN9_SLOTS.test(ch)) latin9 += 1;
      if (SYMBOLIC.test(ch) && (LETTER.test(before) || LETTER.test(after))) symbolInWord += 1;
    }
  }

  const letters = ascii + latin + cyrillic + greek + cjk;
  const scripts = latin + cyrillic + greek + cjk;
  const top = Math.max(latin, cyrillic, greek, cjk);
  const coherence = scripts === 0 ? 1 : top / scripts;
  const accented = letters === 0 ? 0 : latin / letters;

  let vowelPenalty = 0;
  const vowelCheck = (count: number, vowels: number): void => {
    if (count >= 12) vowelPenalty = Math.max(vowelPenalty, Math.max(0, 0.22 - vowels / count) * 6);
  };
  if (top === cyrillic && cyrillic > 0) vowelCheck(cyrillic, cyrillicVowels);
  else if (top === greek && greek > 0) vowelCheck(greek, greekVowels);
  else if (cjk === 0) vowelCheck(ascii + latin, latinVowels);

  const d = Math.max(n, 1);
  const penalty =
    (replacements / d) * 12 +
    (controls / d) * 10 +
    (symbolInWord / d) * 10 +
    (mixedScript / d) * 10 +
    (latin9 / d) * 12 +
    (Math.max(0, accented - 0.35) / 0.65) * 1.5 +
    (1 - coherence) +
    vowelPenalty;

  return { score: prior * Math.max(0, 1 - penalty), replacements };
}

function countReplacements(text: string): number {
  if (!text.includes('\uFFFD')) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 0xfffd) n += 1;
  return n;
}

function toCandidate(id: EncodingId, text: string, score: number, replacements: number): EncodingCandidate {
  return {
    id,
    label: ENCODING_LABELS[id],
    score: Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000,
    replacements,
    sample: text.slice(0, SAMPLE_CHARS),
  };
}

/** UTF-16 with no byte-order mark still gives itself away: half the bytes are zero. */
function sniffUtf16(bytes: Uint8Array): EncodingId | null {
  const n = Math.min(bytes.length, 4096);
  if (n < 16) return null;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let i = 0; i < n; i += 1) {
    if (bytes[i] !== 0) continue;
    if (i % 2 === 0) evenZeros += 1;
    else oddZeros += 1;
  }
  if ((evenZeros + oddZeros) / n < 0.25) return null;
  return oddZeros > evenZeros * 3 ? 'utf-16le' : evenZeros > oddZeros * 3 ? 'utf-16be' : null;
}

// ── Mojibake ───────────────────────────────────────────────────────────────

/**
 * UTF-8 bytes that were read as windows-1252 once already, so `Café` arrived
 * as `CafÃ©`.
 *
 * The inverse trip is its own safety net: text that merely happens to contain
 * `Ã` sequences fails the strict UTF-8 re-read and the repair refuses itself.
 */
function undoMojibake(text: string): string | null {
  try {
    const repaired = new TextDecoder('utf-8', { fatal: true }).decode(encodeWindows1252(text, true));
    return repaired === text ? null : repaired;
  } catch {
    return null;
  }
}

/** As much of the text as is worth testing, ending on a line break. */
function mojibakeProbe(text: string): string {
  const limit = SNIFF_BYTES * 4;
  if (text.length <= limit) return text;
  const lastLine = text.lastIndexOf('\n', limit);
  return text.slice(0, lastLine > 0 ? lastLine + 1 : limit);
}

function mojibakeExamples(before: string, after: string): Array<{ before: string; after: string }> {
  const examples: Array<{ before: string; after: string }> = [];
  const seen = new Set<string>();
  const beforeWords = before.split(/[\s,;\t]+/);
  const afterWords = after.split(/[\s,;\t]+/);
  for (let i = 0; i < beforeWords.length && examples.length < 5; i += 1) {
    const b = beforeWords[i];
    const a = afterWords[i];
    if (a === undefined || a === b || b === '' || seen.has(b)) continue;
    seen.add(b);
    examples.push({ before: b.slice(0, 40), after: a.slice(0, 40) });
  }
  return examples;
}

// ── Decoding ───────────────────────────────────────────────────────────────

export interface DecodeResult {
  text: string;
  report: DecodeReport;
}

export interface DecodeOptions {
  /** The user's choice, which is taken as given. */
  encoding?: EncodingId;
  /** Left undefined, a repair that round-trips is applied. */
  repairMojibake?: boolean;
}

export function decodeBytes(bytes: Uint8Array, options: DecodeOptions = {}): DecodeResult {
  const bom = sniffBom(bytes);
  const body = bom ? bytes.subarray(bom.length) : bytes;
  const sniff = body.subarray(0, SNIFF_BYTES);

  // Every reading is scored every time, even when the answer is obvious, so the
  // "that looks wrong" picker always has something to show.
  const readings = new Map<EncodingId, string>();
  const scored = PRIORS.map(([id, prior]) => {
    const reading = decodeWith(id, sniff);
    readings.set(id, reading);
    const { score, replacements } = scoreReading(reading, prior);
    return toCandidate(id, reading, score, replacements);
  }).sort((a, b) => b.score - a.score);

  let encoding: EncodingId;
  let source: DecodeReport['source'];
  let confidence: Confidence;

  const utf16 = bom ? null : sniffUtf16(body);
  if (options.encoding) {
    encoding = options.encoding;
    source = 'chosen';
    confidence = 'high';
  } else if (bom) {
    encoding = bom.kind;
    source = 'bom';
    confidence = 'high';
  } else if (utf16) {
    encoding = utf16;
    source = 'detected';
    confidence = 'medium';
  } else if (isValidUtf8(sniff, body)) {
    encoding = 'utf-8';
    source = 'detected';
    confidence = 'high';
  } else {
    encoding = scored[0].id;
    source = 'detected';
    // Only a reading that would actually give different text counts as a rival.
    // Plenty of files use no byte the runners-up disagree about, and there is
    // nothing uncertain about a choice that changes nothing.
    const winner = readings.get(encoding);
    const rival = scored.find((c) => c.id !== encoding && readings.get(c.id) !== winner);
    confidence = !rival
      ? 'high'
      : scored[0].score >= 0.9 && scored[0].score - rival.score >= 0.05
        ? 'medium'
        : 'low';
  }

  let text = decodeWith(encoding, body);
  const replacements = countReplacements(text);

  const candidates: EncodingCandidate[] = [
    scored.find((c) => c.id === encoding) ??
      toCandidate(encoding, decodeWith(encoding, sniff), 1, replacements),
    ...scored.filter((c) => c.id !== encoding),
  ];

  // The probe ends on a whole line: half a damaged character at the edge would
  // fail the strict re-read, and the repair would refuse a file that needed it.
  const probe = mojibakeProbe(text);
  const repaired = undoMojibake(probe);
  const mojibake: MojibakeReport = {
    available: repaired !== null,
    applied: false,
    examples: repaired === null ? [] : mojibakeExamples(probe, repaired),
  };
  if (repaired !== null && options.repairMojibake !== false) {
    const whole = undoMojibake(text);
    if (whole !== null) {
      text = whole;
      mojibake.applied = true;
    }
  }

  return {
    text,
    report: { encoding, source, confidence, bom: bom?.kind ?? null, candidates, replacements, mojibake },
  };
}

/**
 * A strict UTF-8 read either succeeds or throws, which makes it an exact test
 * rather than a guess. The sniff is checked first so a 60 MB file is not
 * decoded twice when it is plainly not UTF-8.
 */
function isValidUtf8(sniff: Uint8Array, body: Uint8Array): boolean {
  try {
    if (body.length <= SNIFF_BYTES) {
      new TextDecoder('utf-8', { fatal: true }).decode(body);
      return true;
    }
    // The sniff can cut a character in half, so the decoder is left open for
    // the bytes that would have followed. A large file that survives the sniff
    // is then checked in full.
    new TextDecoder('utf-8', { fatal: true }).decode(sniff, { stream: true });
    new TextDecoder('utf-8', { fatal: true }).decode(body);
    return true;
  } catch {
    return false;
  }
}

// ── Delimiters ─────────────────────────────────────────────────────────────

const DELIMITERS: ReadonlyArray<{ delimiter: string; label: string }> = [
  { delimiter: ',', label: 'Comma' },
  { delimiter: ';', label: 'Semicolon' },
  { delimiter: '\t', label: 'Tab' },
  { delimiter: '|', label: 'Pipe' },
  { delimiter: '\u001F', label: 'Unit separator' },
];

export function delimiterLabel(delimiter: string): string {
  return DELIMITERS.find((d) => d.delimiter === delimiter)?.label ?? `"${delimiter}"`;
}

/** Lines read before the delimiter is decided. */
const DELIMITER_SCAN_LINES = 200;

/**
 * Excel writes `sep=;` above the data in several locales. Left in place it
 * parses as a one-column row and takes the real header with it.
 */
export function stripSepLine(text: string): { text: string; sepLine: string | null; delimiter: string | null } {
  const match = /^sep=(.)\r?\n/i.exec(text);
  if (!match) return { text, sepLine: null, delimiter: null };
  return { text: text.slice(match[0].length), sepLine: match[0].replace(/\r?\n$/, ''), delimiter: match[1] };
}

interface Tally {
  counts: number[];
  /** Times the delimiter sat between two digits — the `1.234,50` tell. */
  betweenDigits: number;
  /** Times it was followed by a space, as punctuation inside a sentence is. */
  beforeSpace: number;
  occurrences: number;
}

function tally(text: string, delimiter: string, maxLines: number): Tally {
  const counts: number[] = [];
  let fields = 1;
  let quoted = false;
  let betweenDigits = 0;
  let beforeSpace = 0;
  let occurrences = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') continue;
      if (text[i + 1] === '"') i += 1;
      else quoted = false;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === delimiter) {
      fields += 1;
      occurrences += 1;
      const next = text.charCodeAt(i + 1);
      if (next === 32) beforeSpace += 1;
      if (i > 0 && text.charCodeAt(i - 1) >= 48 && text.charCodeAt(i - 1) <= 57 && next >= 48 && next <= 57) {
        betweenDigits += 1;
      }
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      counts.push(fields);
      fields = 1;
      if (counts.length >= maxLines) break;
    }
  }
  if (fields > 1 || counts.length === 0) counts.push(fields);
  return { counts, betweenDigits, beforeSpace, occurrences };
}

interface ScoredDelimiter extends DelimiterCandidate {
  score: number;
  spaceRate: number;
}

function summarise(delimiter: string, label: string, t: Tally): ScoredDelimiter {
  const tallies = new Map<number, number>();
  for (const c of t.counts) tallies.set(c, (tallies.get(c) ?? 0) + 1);

  let columns = 1;
  let best = 0;
  for (const [count, times] of tallies) {
    // Ties go to the wider reading: two columns beat one every time.
    if (times > best || (times === best && count > columns)) {
      best = times;
      columns = count;
    }
  }
  const consistency = t.counts.length === 0 ? 0 : best / t.counts.length;
  const digitRate = t.occurrences === 0 ? 0 : t.betweenDigits / t.occurrences;
  return {
    delimiter,
    label,
    columns,
    consistency: Math.round(consistency * 100) / 100,
    score: columns < 2 ? 0 : consistency * (1 - digitRate * 0.6),
    spaceRate: t.occurrences === 0 ? 0 : t.beforeSpace / t.occurrences,
  };
}

export interface DelimiterOptions {
  /** The user's choice, which is taken as given. */
  delimiter?: string;
  /** What a `sep=` line said, if there was one. */
  declared?: string | null;
  /** What the file extension implies, used only to break a genuine tie. */
  preferred?: string;
  sepLine?: string | null;
}

export function detectDelimiter(text: string, options: DelimiterOptions = {}): DelimiterReport {
  const sample = text.slice(0, SNIFF_BYTES);
  const scored = DELIMITERS.map((d) => summarise(d.delimiter, d.label, tally(sample, d.delimiter, DELIMITER_SCAN_LINES))).sort(
    (a, b) => b.score - a.score,
  );
  const candidates: DelimiterCandidate[] = scored.map(({ delimiter, label, columns, consistency }) => ({
    delimiter,
    label,
    columns,
    consistency,
  }));
  const sepLine = options.sepLine ?? null;

  if (options.delimiter) {
    return { delimiter: options.delimiter, source: 'chosen', confidence: 'high', candidates, sepLine };
  }
  if (options.declared) {
    return { delimiter: options.declared, source: 'declared', confidence: 'high', candidates, sepLine };
  }

  if (scored.length === 0 || scored[0].score === 0) {
    // One column per line, or nothing recognisable. Papaparse calls this an
    // undetectable delimiter; it is reported rather than swallowed.
    return { delimiter: ',', source: 'assumed', confidence: 'low', candidates, sepLine };
  }

  // Several candidates can split a file equally well — `Name;Town` where every
  // town holds one comma splits cleanly either way. A delimiter followed by a
  // space is punctuation inside a sentence, not a separator, so that settles it
  // first; the file extension only gets a say after that.
  const tied = scored.filter((c) => scored[0].score - c.score <= 0.02);
  const quietest = Math.min(...tied.map((c) => c.spaceRate));
  const shortlist = tied.filter((c) => c.spaceRate <= quietest + 0.2);
  const best = shortlist.find((c) => c.delimiter === options.preferred) ?? shortlist[0];

  // Confidence reads the agreement between rows, not the score: the digit
  // penalty is there to rank candidates against each other and would otherwise
  // make a perfectly clean `1|2|3` file look doubtful.
  const margin = best.score - (scored.find((c) => c.delimiter !== best.delimiter)?.score ?? 0);
  const confidence: Confidence =
    best.consistency >= 0.95 && margin >= 0.15 ? 'high' : best.consistency >= 0.8 ? 'medium' : 'low';
  return { delimiter: best.delimiter, source: 'detected', confidence, candidates, sepLine };
}
