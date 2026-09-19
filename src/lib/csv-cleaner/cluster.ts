import type {
  ClusterMember,
  ClusterReason,
  ClusterReport,
  Grid,
  MergePlan,
  ValueCluster,
} from './types';

/** Distinct values the exact pass will compare. Beyond this the commonest win. */
export const MAX_DISTINCT_VALUES = 50_000;

export const MAX_CLUSTERS = 500;

export const MAX_LOOSE_VALUES = 3_000;

/** Distinct-to-value ratio at or above which a column is not worth offering. */
export const CATEGORICAL_RATIO = 0.5;

export const MIN_VALUES_FOR_CLUSTERING = 6;

const NOT_ALPHANUMERIC = /[^\p{L}\p{N}]+/u;
const NOT_ALPHANUMERIC_ALL = /[^\p{L}\p{N}]+/gu;
const COMBINING_MARKS = /\p{M}+/gu;
const WHITESPACE_RUN = /\s+/g;
const DIGITS = /\d+/g;
const PLAIN_NUMBER = /^[+-]?(?:\d{1,3}(?:,\d{3})*|\d*)(?:\.\d+)?%?$/;
const ID_SHAPE = /^(?=.*\d)[\p{L}\p{N}][\p{L}\p{N}_/.-]*$/u;

const ID_HEADER_WORDS = new Set([
  'id', 'ids', 'uuid', 'guid', 'key', 'code', 'codes', 'ref', 'refs',
  'reference', 'references', 'sku', 'isbn', 'ean', 'barcode', 'account',
  'number', 'no', 'num', 'postcode', 'zip', 'phone', 'mobile', 'email',
  'url', 'link', 'hash', 'token',
]);

function isAscii(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 127) return false;
  }
  return true;
}

/** NFKD is the expensive part, and almost every value is plain ASCII. */
function foldAccents(value: string): string {
  return isAscii(value) ? value : value.normalize('NFKD').replace(COMBINING_MARKS, '');
}

function squashSpaces(value: string): string {
  return value.replace(WHITESPACE_RUN, ' ').trim();
}

function words(value: string): string[] {
  return foldAccents(value.toLowerCase()).split(NOT_ALPHANUMERIC).filter((w) => w.length > 0);
}

/** OpenRefine's fingerprint, repeats dropped; the clustering key below keeps them. */
export function fingerprint(value: string): string {
  const parts = words(value);
  if (parts.length === 0) return '';
  return Array.from(new Set(parts)).sort().join(' ');
}

/** Both keys off one tokenising pass — the pass is the expensive part. */
function keysOf(value: string): { key: string; ordered: string } {
  const parts = words(value);
  if (parts.length === 0) return { key: '', ordered: '' };
  const ordered = parts.join(' ');
  if (parts.length === 1) return { key: ordered, ordered };
  return { key: parts.slice().sort().join(' '), ordered };
}

/** Sorted distinct n-grams. Used to block the looser pass, not to merge on. */
export function ngramFingerprint(value: string, size = 3): string {
  const base = foldAccents(value.toLowerCase()).replace(NOT_ALPHANUMERIC_ALL, '');
  if (base.length <= size) return base;
  const grams = new Set<string>();
  for (let i = 0; i + size <= base.length; i += 1) grams.add(base.slice(i, i + size));
  return Array.from(grams).sort().join('');
}

const SINGLE_SPACE = /\s/;
const NUMERIC_SIGNS = '+-−–—';
const NUMERIC_SEPARATORS = ".,'  ";
const CURRENCY_OR_PERCENT = /[\p{Sc}%]/u;

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isSpace(c: string): boolean {
  return c === ' ' || SINGLE_SPACE.test(c);
}

/** The nearest character either side, stepping over spaces and currency marks. */
function beside(value: string, from: number, step: number): number {
  for (let i = from; i >= 0 && i < value.length; i += step) {
    const c = value[i];
    if (isSpace(c) || CURRENCY_OR_PERCENT.test(c)) continue;
    return value.charCodeAt(i);
  }
  return -1;
}

/** Every amount a value states, sorted; empty when it states none. */
export function numericSignature(value: string): string {
  const amounts: string[] = [];
  let amount = '';
  let started = false;
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];
    let keep = '';
    let digit = false;
    if (isDigit(value.charCodeAt(i))) {
      keep = c;
      digit = true;
    } else if (NUMERIC_SIGNS.includes(c)) {
      // Leading: "- 500". Trailing: "500-" tight against the digits, or it is a dash in prose.
      if (isDigit(beside(value, i + 1, 1)) || isDigit(value.charCodeAt(i - 1))) {
        keep = c === '+' ? '+' : '-';
      }
    } else if (NUMERIC_SEPARATORS.includes(c)) {
      // Strictly between two digits, or it is ordinary punctuation.
      if (isDigit(value.charCodeAt(i + 1)) && isDigit(value.charCodeAt(i - 1))) {
        keep = c === '.' ? '.' : ',';
      }
    } else if (c === '(') {
      if (isDigit(beside(value, i + 1, 1))) keep = c;
    } else if (c === ')') {
      if (isDigit(beside(value, i - 1, -1))) keep = c;
    } else if (CURRENCY_OR_PERCENT.test(c)) {
      if (isDigit(beside(value, i + 1, 1)) || isDigit(beside(value, i - 1, -1))) keep = c;
    }

    if (keep !== '') {
      amount += keep;
      started = started || digit;
    } else if (amount !== '' && (started || !isSpace(c))) {
      // A space only ends an amount once its digits have started.
      amounts.push(amount);
      amount = '';
      started = false;
    }
  }
  if (amount !== '') amounts.push(amount);
  return amounts.length === 0 ? '' : amounts.sort().join('|');
}

function splitByAmount(indices: readonly number[], values: readonly string[]): Map<string, number[]> {
  const parts = new Map<string, number[]>();
  for (const i of indices) {
    const signature = numericSignature(values[i]);
    const part = parts.get(signature);
    if (part) part.push(i);
    else parts.set(signature, [i]);
  }
  return parts;
}

function allSame(values: readonly string[]): boolean {
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] !== values[0]) return false;
  }
  return true;
}

// Only ever called on values sharing a word key, order and amount, so 'punctuation' is last.
function classify(values: readonly string[]): ClusterReason {
  const lowered = values.map((v) => v.toLowerCase());
  if (allSame(lowered)) return 'case';
  const squashed = lowered.map(squashSpaces);
  if (allSame(squashed)) return 'whitespace';
  if (allSame(squashed.map(foldAccents))) return 'accents';
  return 'punctuation';
}

export interface ValueTally {
  /** Distinct value -> how many rows hold it. Iteration order is first-seen. */
  counts: Map<string, number>;
  /** Non-blank cells counted. */
  values: number;
  blanks: number;
}

const BLANK = /^\s*$/;

function isBlank(value: string): boolean {
  const first = value.charCodeAt(0);
  // Below this there is no whitespace character except the two named.
  if (first > 32 && first !== 0xa0 && first < 0x1680) return false;
  return BLANK.test(value);
}

export function tallyValues(values: Iterable<string>): ValueTally {
  const counts = new Map<string, number>();
  let total = 0;
  let blanks = 0;
  for (const raw of values) {
    if (raw === undefined || raw === null || isBlank(raw)) {
      blanks += 1;
      continue;
    }
    total += 1;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return { counts, values: total, blanks };
}

export function tallyColumn(rows: readonly string[][], position: number): ValueTally {
  const counts = new Map<string, number>();
  let total = 0;
  let blanks = 0;
  for (let r = 0; r < rows.length; r += 1) {
    const cell = rows[r][position];
    if (cell === undefined || isBlank(cell)) {
      blanks += 1;
      continue;
    }
    total += 1;
    counts.set(cell, (counts.get(cell) ?? 0) + 1);
  }
  return { counts, values: total, blanks };
}

export interface ColumnRef {
  /** Position in the cleaned grid. */
  position: number;
  /** ORIGINAL column index — what `spellingMerges` is keyed by. */
  columnIndex: number;
  columnName: string;
}

export type UnsuitableReason =
  | 'no-values'
  | 'too-few-values'
  | 'too-varied'
  | 'looks-numeric'
  | 'looks-like-a-reference';

export interface ColumnSuitability extends ColumnRef {
  values: number;
  distinctValues: number;
  /** distinct / values. Low means the column repeats itself, which is the point. */
  ratio: number;
  suitable: boolean;
  reason: UnsuitableReason | null;
  /** When true, `distinctValues` and `ratio` are a floor, not a total. */
  distinctValuesCapped: boolean;
}

/** Enough to judge the shape of a column without walking 20,000 distinct values. */
const SHAPE_SAMPLE = 400;

interface DistinctValues {
  readonly size: number;
  keys(): Iterable<string>;
}

function shapeShare(counts: DistinctValues, test: (value: string) => boolean): number {
  let seen = 0;
  let hits = 0;
  for (const value of counts.keys()) {
    if (test(value)) hits += 1;
    seen += 1;
    if (seen >= SHAPE_SAMPLE) break;
  }
  return seen === 0 ? 0 : hits / seen;
}

function headerLooksLikeReference(name: string): boolean {
  for (const word of name.toLowerCase().split(NOT_ALPHANUMERIC)) {
    if (word.length > 0 && ID_HEADER_WORDS.has(word)) return true;
  }
  return false;
}

function judge(
  column: ColumnRef,
  distinct: DistinctValues,
  values: number,
  distinctValuesCapped: boolean,
): ColumnSuitability {
  const distinctValues = distinct.size;
  const ratio = values === 0 ? 0 : distinctValues / values;
  const base = { ...column, values, distinctValues, ratio, distinctValuesCapped };

  let reason: UnsuitableReason | null = null;
  if (values === 0) reason = 'no-values';
  else if (values < MIN_VALUES_FOR_CLUSTERING) reason = 'too-few-values';
  else if (shapeShare(distinct, (v) => PLAIN_NUMBER.test(v)) >= 0.8) reason = 'looks-numeric';
  else if (headerLooksLikeReference(column.columnName)) reason = 'looks-like-a-reference';
  else if (shapeShare(distinct, (v) => ID_SHAPE.test(v)) >= 0.8) reason = 'looks-like-a-reference';
  else if (distinctValuesCapped || ratio >= CATEGORICAL_RATIO) reason = 'too-varied';

  return { ...base, suitable: reason === null, reason };
}

export function assessColumn(column: ColumnRef, tally: ValueTally): ColumnSuitability {
  return judge(column, tally.counts, tally.values, false);
}

/** Without `columnSources` the grid is assumed to be in its original column order. */
export function assessColumns(
  grid: Grid,
  columnSources?: readonly number[],
): ColumnSuitability[] {
  const width = grid.header.length;
  const rows = grid.rows;
  const distinct: Set<string>[] = [];
  const values = new Array<number>(width).fill(0);
  const capped = new Array<boolean>(width).fill(false);
  for (let c = 0; c < width; c += 1) distinct.push(new Set<string>());

  // Past this a column can only come out 'too varied', so stop collecting distinct values.
  const limit = Math.max(SHAPE_SAMPLE, Math.floor(rows.length * CATEGORICAL_RATIO));

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    for (let c = 0; c < width; c += 1) {
      const cell = row[c];
      if (cell === undefined || isBlank(cell)) continue;
      values[c] += 1;
      if (capped[c]) continue;
      const seen = distinct[c];
      seen.add(cell);
      if (seen.size > limit) capped[c] = true;
    }
  }

  return grid.header.map((name, position) =>
    judge(
      { position, columnIndex: columnSources?.[position] ?? position, columnName: name },
      distinct[position],
      values[position],
      capped[position],
    ),
  );
}

export interface ClusterOptions {
  maxDistinctValues?: number;
  maxClusters?: number;
}

export interface SpellingReport extends ClusterReport {
  /** Non-blank cells behind the tally. */
  totalValues: number;
  /** Groups that matched only on word order. Never also in `clusters`. */
  wordOrderClusters: ValueCluster[];
  /** True when groups were dropped to stay under `maxClusters`. */
  clustersTruncated: boolean;
  /** Loose pass only: comparisons were cut short. Always false for the exact pass. */
  searchCapped: boolean;
}

function membersOf(values: readonly string[], counts: Map<string, number>): ClusterMember[] {
  const members = new Array<ClusterMember>(values.length);
  for (let i = 0; i < values.length; i += 1) {
    members[i] = { value: values[i], count: counts.get(values[i]) ?? 0 };
  }
  // Sort is stable and `values` is first-seen order, so ties keep the earliest spelling.
  if (members.length === 2) {
    if (members[1].count > members[0].count) members.reverse();
    return members;
  }
  return members.sort((a, b) => b.count - a.count);
}

function makeCluster(
  columnIndex: number,
  kind: string,
  key: string,
  values: readonly string[],
  counts: Map<string, number>,
  reason: ClusterReason,
): ValueCluster {
  const members = membersOf(values, counts);
  let total = 0;
  for (let i = 0; i < members.length; i += 1) total += members[i].count;
  return {
    id: `${columnIndex}:${kind}:${key}`,
    columnIndex,
    members,
    suggested: members[0].value,
    reason,
    total,
  };
}

function byTotal(a: ValueCluster, b: ValueCluster): number {
  return b.total - a.total || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function emptyReport(
  column: ColumnRef,
  tally: ValueTally,
  truncated: boolean,
  searchCapped: boolean,
): SpellingReport {
  return {
    columnIndex: column.columnIndex,
    columnName: column.columnName,
    distinctValues: tally.counts.size,
    totalValues: tally.values,
    clusters: [],
    wordOrderClusters: [],
    truncated,
    clustersTruncated: false,
    searchCapped,
  };
}

/** Distinct values to work with, commonest first once the cap bites. */
function entriesWithin(tally: ValueTally, cap: number): [string[], boolean] {
  const values = Array.from(tally.counts.keys());
  if (values.length <= cap) return [values, false];
  const sorted = values.sort((a, b) => (tally.counts.get(b) ?? 0) - (tally.counts.get(a) ?? 0));
  return [sorted.slice(0, cap), true];
}

export function clusterTally(
  column: ColumnRef,
  tally: ValueTally,
  options: ClusterOptions = {},
): SpellingReport {
  const [values, truncated] = entriesWithin(tally, options.maxDistinctValues ?? MAX_DISTINCT_VALUES);

  const ordering: string[] = new Array<string>(values.length);
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < values.length; i += 1) {
    const { key, ordered } = keysOf(values[i]);
    if (key === '') continue;
    ordering[i] = ordered;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(i);
    else buckets.set(key, [i]);
  }

  const clusters: ValueCluster[] = [];
  const wordOrderClusters: ValueCluster[] = [];

  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue;

    // Word order first: a different order is the one thing this key gets dangerously wrong.
    const byOrder = new Map<string, number[]>();
    for (const i of bucket) {
      const group = byOrder.get(ordering[i]);
      if (group) group.push(i);
      else byOrder.set(ordering[i], [i]);
    }

    for (const [ordered, group] of byOrder) {
      if (group.length < 2) continue;
      const parts = splitByAmount(group, values);
      for (const [signature, part] of parts) {
        if (part.length < 2) continue;
        const members = part.map((i) => values[i]);
        const id = parts.size === 1 ? ordered : `${ordered}#${signature}`;
        clusters.push(
          makeCluster(column.columnIndex, 'o', id, members, tally.counts, classify(members)),
        );
      }
    }

    if (byOrder.size > 1) {
      const parts = splitByAmount(bucket, values);
      for (const [signature, part] of parts) {
        if (part.length < 2) continue;
        // Still a reordering once the amounts are separated, or nothing new.
        const orders = new Set<string>();
        for (const i of part) orders.add(ordering[i]);
        if (orders.size < 2) continue;
        const id = parts.size === 1 ? key : `${key}#${signature}`;
        wordOrderClusters.push(
          makeCluster(
            column.columnIndex,
            'w',
            id,
            part.map((i) => values[i]),
            tally.counts,
            'word-order',
          ),
        );
      }
    }
  }

  clusters.sort(byTotal);
  wordOrderClusters.sort(byTotal);

  const max = options.maxClusters ?? MAX_CLUSTERS;
  const clustersTruncated = clusters.length > max || wordOrderClusters.length > max;

  return {
    columnIndex: column.columnIndex,
    columnName: column.columnName,
    distinctValues: tally.counts.size,
    totalValues: tally.values,
    clusters: clusters.slice(0, max),
    wordOrderClusters: wordOrderClusters.slice(0, max),
    truncated,
    clustersTruncated,
    searchCapped: false,
  };
}

export function clusterColumn(
  grid: Grid,
  column: ColumnRef,
  options: ClusterOptions = {},
): SpellingReport {
  return clusterTally(column, tallyColumn(grid.rows, column.position), options);
}

export interface LooseClusterOptions extends ClusterOptions {
  /** Characters two long spellings may differ by. Short ones get less. */
  maxEditDistance?: number;
  maxLooseValues?: number;
}

// Short values get nothing: "UK" and "US" are one character apart and not the same country.
function allowedDistance(a: string, b: string, ceiling: number): number {
  const shortest = Math.min(a.length, b.length);
  if (shortest < 5) return 0;
  return Math.min(ceiling, shortest < 10 ? 1 : 2);
}

function stripDigits(value: string): string {
  return value.replace(DIGITS, '');
}

/** Reused across comparisons: two fresh rows per pair was most of the cost. */
let rowA: number[] = [];
let rowB: number[] = [];

function withinDistance(a: string, b: string, max: number): boolean {
  if (max <= 0) return false;
  if (Math.abs(a.length - b.length) > max) return false;

  if (rowA.length < b.length + 1) {
    rowA = new Array<number>(b.length + 1);
    rowB = new Array<number>(b.length + 1);
  }
  let previous = rowA;
  let current = rowB;
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let best = current[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current[j] = value;
      if (value < best) best = value;
    }
    if (best > max) return false;
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length] <= max;
}

class Unions {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[i] !== root) {
      const next = this.parent[i];
      this.parent[i] = root;
      i = next;
    }
    return root;
  }

  join(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

/** Buckets this big are not evidence of anything and cost O(n²) to pair up. */
const MAX_BLOCK = 400;
const BLOCK_SIZE = 4;
// Set to keep the worst case under about a quarter of a second; this blocks the page.
const MAX_COMPARISONS = 250_000;

/** Costs hundreds of milliseconds, so never put it on the default path; extra groups only. */
export function clusterTallyLoosely(
  column: ColumnRef,
  tally: ValueTally,
  options: LooseClusterOptions = {},
): SpellingReport {
  const cap = Math.min(options.maxLooseValues ?? MAX_LOOSE_VALUES, MAX_LOOSE_VALUES);
  const ceiling = options.maxEditDistance ?? 2;

  // Over the cap this refuses rather than trims: a misspelling is by definition a rare one.
  if (tally.counts.size > cap) return emptyReport(column, tally, true, false);

  const values = Array.from(tally.counts.keys());

  // One representative per WORD-ORDER group; the sorted key would pull reorderings in.
  const groups = new Map<string, string[]>();
  const wordSets = new Map<string, string>();
  for (const value of values) {
    const { key, ordered } = keysOf(value);
    if (ordered === '') continue;
    const group = groups.get(ordered);
    if (group) group.push(value);
    else {
      groups.set(ordered, [value]);
      wordSets.set(ordered, key);
    }
  }

  const keys = Array.from(groups.keys());
  const weights = new Array<number>(keys.length);
  const reps = keys.map((key, i) => {
    const group = groups.get(key) as string[];
    let rows = 0;
    for (const value of group) rows += tally.counts.get(value) ?? 0;
    weights[i] = rows;
    return membersOf(group, tally.counts)[0].value;
  });
  const normalised = reps.map((value) => squashSpaces(foldAccents(value.toLowerCase())));
  const plain = normalised.map((value) => PLAIN_NUMBER.test(value));
  const withoutDigits = normalised.map(stripDigits);

  const blocks = new Map<string, number[]>();
  for (let i = 0; i < normalised.length; i += 1) {
    const text = normalised[i].replace(NOT_ALPHANUMERIC_ALL, '');
    if (text.length < BLOCK_SIZE) continue;
    const seen = new Set<string>();
    for (let s = 0; s + BLOCK_SIZE <= text.length; s += 1) {
      const gram = text.slice(s, s + BLOCK_SIZE);
      if (seen.has(gram)) continue;
      seen.add(gram);
      const block = blocks.get(gram);
      if (block) block.push(i);
      else blocks.set(gram, [i]);
    }
  }

  const unions = new Unions(reps.length);
  const tested = new Set<number>();
  let joined = 0;
  let comparisons = 0;
  let searchCapped = false;

  // Smallest blocks first: a rare four-letter run is evidence, a common one is noise.
  const ordered = Array.from(blocks.values()).sort((a, b) => a.length - b.length);

  // Budget every pair the loops touch: blocks overlap, and skipping a repeat still costs time.
  search:
  for (const block of ordered) {
    if (block.length < 2) continue;
    if (block.length > MAX_BLOCK) {
      searchCapped = true;
      continue;
    }
    for (let x = 0; x < block.length; x += 1) {
      for (let y = x + 1; y < block.length; y += 1) {
        if (comparisons >= MAX_COMPARISONS) {
          searchCapped = true;
          break search;
        }
        comparisons += 1;

        const i = block[x];
        const j = block[y];
        if (plain[i] || plain[j]) continue;
        const pair = i * reps.length + j;
        if (tested.has(pair)) continue;
        tested.add(pair);

        const a = normalised[i];
        const b = normalised[j];
        // "2018 Q1" and "2019 Q1" are one character apart and not the same quarter.
        if (withoutDigits[i] === withoutDigits[j]) continue;
        if (!withinDistance(a, b, allowedDistance(a, b, ceiling))) continue;

        unions.join(i, j);
        joined += 1;
      }
    }
  }

  const clusters: ValueCluster[] = [];
  if (joined > 0) {
    const merged = new Map<number, number[]>();
    for (let i = 0; i < reps.length; i += 1) {
      const root = unions.find(i);
      const group = merged.get(root);
      if (group) group.push(i);
      else merged.set(root, [i]);
    }

    for (const group of merged.values()) {
      // Only groups that join two or more word-order groups are new here.
      if (group.length < 2) continue;

      // A reordering is not a near spelling, so at most one spelling of each word set stays.
      const perWordSet = new Map<string, number>();
      for (const i of group) {
        const set = wordSets.get(keys[i]) as string;
        const held = perWordSet.get(set);
        if (held === undefined || weights[i] > weights[held]) perWordSet.set(set, i);
      }
      const kept = Array.from(perWordSet.values());
      if (kept.length < 2) continue;

      const raw: string[] = [];
      const owner: number[] = [];
      for (const i of kept) {
        for (const value of groups.get(keys[i]) as string[]) {
          raw.push(value);
          owner.push(i);
        }
      }

      const parts = splitByAmount(raw.map((_, i) => i), raw);
      for (const [signature, part] of parts) {
        if (part.length < 2) continue;
        // A part inside one word-order group is the exact pass's find, not this pass's.
        if (new Set(part.map((i) => owner[i])).size < 2) continue;
        const id = parts.size === 1 ? keys[kept[0]] : `${keys[kept[0]]}#${signature}`;
        clusters.push(
          makeCluster(
            column.columnIndex,
            'n',
            id,
            part.map((i) => raw[i]),
            tally.counts,
            'near-spelling',
          ),
        );
      }
    }
    clusters.sort(byTotal);
  }

  const max = options.maxClusters ?? MAX_CLUSTERS;

  return {
    columnIndex: column.columnIndex,
    columnName: column.columnName,
    distinctValues: tally.counts.size,
    totalValues: tally.values,
    clusters: clusters.slice(0, max),
    // Empty by design: the exact pass has already offered every reordering this pass can see.
    wordOrderClusters: [],
    truncated: false,
    clustersTruncated: clusters.length > max,
    searchCapped,
  };
}

export function clusterColumnLoosely(
  grid: Grid,
  column: ColumnRef,
  options: LooseClusterOptions = {},
): SpellingReport {
  return clusterTallyLoosely(column, tallyColumn(grid.rows, column.position), options);
}

export interface AcceptedCluster {
  cluster: ValueCluster;
  /** Defaults to `cluster.suggested`. */
  keep?: string;
}

/** Rows a group would change — its total, less the spelling being kept. */
export function rowsAffected(cluster: ValueCluster, keep?: string): number {
  const target = keep ?? cluster.suggested;
  return cluster.members.reduce((sum, m) => (m.value === target ? sum : sum + m.count), 0);
}

/** Later groups win, and a target merged onward is followed through to the end. */
export function buildMergePlan(accepted: readonly AcceptedCluster[]): MergePlan {
  const plan: MergePlan = {};
  for (const { cluster, keep } of accepted) {
    const target = keep ?? cluster.suggested;
    for (const member of cluster.members) {
      if (member.value === target) delete plan[member.value];
      else plan[member.value] = target;
    }
  }

  for (const source of Object.keys(plan)) {
    let target = plan[source];
    const seen = new Set<string>([source]);
    while (plan[target] !== undefined && !seen.has(target)) {
      seen.add(target);
      target = plan[target];
    }
    plan[source] = target;
  }

  return plan;
}
