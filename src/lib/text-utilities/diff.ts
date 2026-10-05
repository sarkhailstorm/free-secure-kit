import type { ChangeObject } from 'diff';

export type DiffMode = 'lines' | 'words' | 'chars';

export interface DiffOptions {
  mode: DiffMode;
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
  // Skips the size ceiling; the timeout still applies
  allowOversize?: boolean;
}

export interface InlineSpan {
  kind: 'same' | 'add' | 'del';
  text: string;
}

export interface DiffRow {
  kind: 'same' | 'add' | 'del';
  // 1-based, null for an added line
  oldNumber: number | null;
  // 1-based, null for a removed line
  newNumber: number | null;
  text: string;
  // Only set on the two halves of a modified pair
  spans: InlineSpan[] | null;
}

// Stands in for a run of collapsed unchanged lines
export interface GapRow {
  kind: 'gap';
  count: number;
}

export type RenderRow = DiffRow | GapRow;

export interface DiffStats {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  // Nothing differs under the current ignore options
  identical: boolean;
  // The two inputs are byte-for-byte the same
  exact: boolean;
}

export interface LineDiffResult {
  kind: 'lines';
  rows: DiffRow[];
  stats: DiffStats;
  // Word-level highlighting was skipped to stay responsive
  inlineSkipped: boolean;
}

export interface InlineDiffResult {
  kind: 'inline';
  mode: 'words' | 'chars';
  spans: InlineSpan[];
  stats: DiffStats;
}

export type DiffResult = LineDiffResult | InlineDiffResult;

// Total characters across both sides, above which it refuses rather than freezing the tab
export const DIFF_LIMITS: Readonly<Record<DiffMode, number>> = {
  lines: 400_000,
  words: 150_000,
  chars: 30_000,
};

const DIFF_TIMEOUT_MS = 5_000;

// Changed line pairs that get word-level highlighting before it gives up
const INLINE_PAIR_BUDGET = 600;
// Lines longer than this are not word-diffed against their counterpart
const INLINE_LINE_MAX = 3_000;
// Share of shared characters needed before two lines count as modified
const SIMILARITY_THRESHOLD = 0.25;

// Returns the limit that was exceeded, or null when the input is fine
export function diffSizeLimit(a: string, b: string, mode: DiffMode): number | null {
  const limit = DIFF_LIMITS[mode];
  return a.length + b.length > limit ? limit : null;
}

// No trailing empty line for empty input
export function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.split(/\r\n|\n|\r/);
}

function trimEveryLine(text: string): string {
  return splitLines(text)
    .map((line) => line.trim())
    .join('\n');
}

type Block = {
  kind: 'same' | 'add' | 'del';
  oldStart: number;
  newStart: number;
  count: number;
};

// Throws errors whose messages are already fit to show the user
export async function computeDiff(
  original: string,
  changed: string,
  options: DiffOptions,
): Promise<DiffResult> {
  const limit = diffSizeLimit(original, changed, options.mode);
  if (limit !== null && !options.allowOversize) {
    throw new Error(
      `That is a lot of text for ${labelForMode(options.mode)} comparison (limit ${limit.toLocaleString()} characters across both sides).`,
    );
  }

  const { diffArrays, diffWords, diffWordsWithSpace, diffChars } = await import('diff');

  if (options.mode !== 'lines') {
    const left = options.ignoreWhitespace ? trimEveryLine(original) : original;
    const right = options.ignoreWhitespace ? trimEveryLine(changed) : changed;

    let parts: ChangeObject<string>[] | undefined;
    if (options.mode === 'words') {
      parts = diffWords(left, right, { ignoreCase: options.ignoreCase, timeout: DIFF_TIMEOUT_MS });
      // `diffWords` ignores whitespace, so its parts do not always add back up to the input
      if (parts && !rebuildsExactly(parts, left, right, options.ignoreCase)) {
        parts = diffWordsWithSpace(left, right, {
          ignoreCase: options.ignoreCase,
          timeout: DIFF_TIMEOUT_MS,
        });
      }
    } else {
      parts = diffChars(left, right, { ignoreCase: options.ignoreCase, timeout: DIFF_TIMEOUT_MS });
    }

    if (!parts) throw new Error(timeoutMessage(options.mode));

    const spans: InlineSpan[] = parts.map(
      (part): InlineSpan => ({
        kind: part.added ? 'add' : part.removed ? 'del' : 'same',
        text: part.value,
      }),
    );

    let added = 0;
    let removed = 0;
    let unchanged = 0;
    for (const part of parts) {
      if (part.added) added += part.count;
      else if (part.removed) removed += part.count;
      else unchanged += part.count;
    }

    return {
      kind: 'inline',
      mode: options.mode,
      spans,
      stats: {
        added,
        removed,
        modified: 0,
        unchanged,
        identical: added === 0 && removed === 0,
        exact: original === changed,
      },
    };
  }

  const oldLines = splitLines(original);
  const newLines = splitLines(changed);

  const normalise = (line: string): string => {
    let value = options.ignoreWhitespace ? line.trim() : line;
    if (options.ignoreCase) value = value.toLowerCase();
    return value;
  };

  const changes = diffArrays(oldLines, newLines, {
    comparator: (left: string, right: string) => normalise(left) === normalise(right),
    timeout: DIFF_TIMEOUT_MS,
  });

  if (!changes) throw new Error(timeoutMessage('lines'));

  const blocks = toBlocks(changes);

  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  let modified = 0;
  let unchanged = 0;
  let inlineBudget = INLINE_PAIR_BUDGET;
  let inlineSkipped = false;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];

    if (block.kind === 'same') {
      for (let j = 0; j < block.count; j += 1) {
        rows.push({
          kind: 'same',
          oldNumber: block.oldStart + j + 1,
          newNumber: block.newStart + j + 1,
          text: newLines[block.newStart + j] ?? oldLines[block.oldStart + j] ?? '',
          spans: null,
        });
      }
      unchanged += block.count;
      continue;
    }

    const next = blocks[i + 1];
    if (block.kind === 'del' && next && next.kind === 'add') {
      // A removal immediately followed by an insertion is almost always an edit
      const pairCount = Math.min(block.count, next.count);
      const delSpans: (InlineSpan[] | null)[] = new Array(block.count).fill(null);
      const addSpans: (InlineSpan[] | null)[] = new Array(next.count).fill(null);
      let modifiedHere = 0;

      for (let j = 0; j < pairCount; j += 1) {
        const before = oldLines[block.oldStart + j] ?? '';
        const after = newLines[next.newStart + j] ?? '';

        if (inlineBudget <= 0 || before.length > INLINE_LINE_MAX || after.length > INLINE_LINE_MAX) {
          // Too much work to highlight precisely, but still counts as an edit
          inlineSkipped = true;
          modifiedHere += 1;
          continue;
        }

        inlineBudget -= 1;
        let parts = diffWords(before, after, { ignoreCase: options.ignoreCase });
        // Same whitespace caveat: re-run exact when the round trip does not hold
        if (!rebuildsExactly(parts, before, after, options.ignoreCase)) {
          parts = diffWordsWithSpace(before, after, { ignoreCase: options.ignoreCase });
        }
        if (!isSimilar(parts, before, after)) continue;

        modifiedHere += 1;
        // Sliced from the real inputs, so each side reads back exactly as typed
        const sliced = spansFromParts(parts, before, after);
        if (sliced) {
          delSpans[j] = sliced.del;
          addSpans[j] = sliced.add;
        } else {
          inlineSkipped = true;
        }
      }

      for (let j = 0; j < block.count; j += 1) {
        rows.push({
          kind: 'del',
          oldNumber: block.oldStart + j + 1,
          newNumber: null,
          text: oldLines[block.oldStart + j] ?? '',
          spans: delSpans[j],
        });
      }
      for (let j = 0; j < next.count; j += 1) {
        rows.push({
          kind: 'add',
          oldNumber: null,
          newNumber: next.newStart + j + 1,
          text: newLines[next.newStart + j] ?? '',
          spans: addSpans[j],
        });
      }

      modified += modifiedHere;
      removed += block.count - modifiedHere;
      added += next.count - modifiedHere;
      i += 1; // the paired "add" block is already rendered
      continue;
    }

    if (block.kind === 'del') {
      for (let j = 0; j < block.count; j += 1) {
        rows.push({
          kind: 'del',
          oldNumber: block.oldStart + j + 1,
          newNumber: null,
          text: oldLines[block.oldStart + j] ?? '',
          spans: null,
        });
      }
      removed += block.count;
    } else {
      for (let j = 0; j < block.count; j += 1) {
        rows.push({
          kind: 'add',
          oldNumber: null,
          newNumber: block.newStart + j + 1,
          text: newLines[block.newStart + j] ?? '',
          spans: null,
        });
      }
      added += block.count;
    }
  }

  return {
    kind: 'lines',
    rows,
    stats: {
      added,
      removed,
      modified,
      unchanged,
      identical: added === 0 && removed === 0 && modified === 0,
      exact: original === changed,
    },
    inlineSkipped,
  };
}

function labelForMode(mode: DiffMode): string {
  return mode === 'lines' ? 'line-by-line' : mode === 'words' ? 'word-by-word' : 'character-by-character';
}

function timeoutMessage(mode: DiffMode): string {
  return `The ${labelForMode(mode)} comparison was taking too long and stopped. Try line mode, or compare a smaller section.`;
}

function toBlocks(changes: ChangeObject<string[]>[]): Block[] {
  const blocks: Block[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  for (const change of changes) {
    const count = change.value.length;
    if (count === 0) continue;

    if (change.added) {
      blocks.push({ kind: 'add', oldStart: oldIndex, newStart: newIndex, count });
      newIndex += count;
    } else if (change.removed) {
      blocks.push({ kind: 'del', oldStart: oldIndex, newStart: newIndex, count });
      oldIndex += count;
    } else {
      blocks.push({ kind: 'same', oldStart: oldIndex, newStart: newIndex, count });
      oldIndex += count;
      newIndex += count;
    }
  }

  return blocks;
}

function rebuildsExactly(
  parts: ChangeObject<string>[],
  before: string,
  after: string,
  ignoreCase: boolean,
): boolean {
  let oldSide = '';
  let newSide = '';
  for (const part of parts) {
    if (!part.added) oldSide += part.value;
    if (!part.removed) newSide += part.value;
  }
  if (!ignoreCase) return oldSide === before && newSide === after;
  return (
    oldSide.toLowerCase() === before.toLowerCase() && newSide.toLowerCase() === after.toLowerCase()
  );
}

// Null when the token lengths do not line up with the sources
function spansFromParts(
  parts: ChangeObject<string>[],
  before: string,
  after: string,
): { del: InlineSpan[]; add: InlineSpan[] } | null {
  const del: InlineSpan[] = [];
  const add: InlineSpan[] = [];
  let oldPos = 0;
  let newPos = 0;

  for (const part of parts) {
    const length = part.value.length;
    if (part.added) {
      add.push({ kind: 'add', text: after.slice(newPos, newPos + length) });
      newPos += length;
    } else if (part.removed) {
      del.push({ kind: 'del', text: before.slice(oldPos, oldPos + length) });
      oldPos += length;
    } else {
      del.push({ kind: 'same', text: before.slice(oldPos, oldPos + length) });
      add.push({ kind: 'same', text: after.slice(newPos, newPos + length) });
      oldPos += length;
      newPos += length;
    }
  }

  if (oldPos !== before.length || newPos !== after.length) return null;
  return { del, add };
}

function isSimilar(parts: ChangeObject<string>[], before: string, after: string): boolean {
  let shared = 0;
  for (const part of parts) {
    if (!part.added && !part.removed) shared += part.value.trim().length;
  }
  const longest = Math.max(before.trim().length, after.trim().length);
  if (longest === 0) return true;
  return shared / longest >= SIMILARITY_THRESHOLD;
}

export function collapseUnchanged(rows: DiffRow[], context: number): RenderRow[] {
  const keep: boolean[] = new Array(rows.length).fill(false);

  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].kind === 'same') continue;
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k += 1) {
      keep[k] = true;
    }
  }

  const out: RenderRow[] = [];
  let gap = 0;
  for (let i = 0; i < rows.length; i += 1) {
    if (keep[i]) {
      if (gap > 0) {
        out.push({ kind: 'gap', count: gap });
        gap = 0;
      }
      out.push(rows[i]);
    } else {
      gap += 1;
    }
  }
  if (gap > 0) out.push({ kind: 'gap', count: gap });
  return out;
}

export function diffToText(result: DiffResult): string {
  if (result.kind === 'lines') {
    return result.rows
      .map((row) => `${row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '}${row.text}`)
      .join('\n');
  }
  return result.spans
    .map((span) =>
      span.kind === 'add' ? `{+${span.text}+}` : span.kind === 'del' ? `[-${span.text}-]` : span.text,
    )
    .join('');
}

export function unitForMode(mode: DiffMode, count: number): string {
  const word = mode === 'lines' ? 'line' : mode === 'words' ? 'word' : 'character';
  return count === 1 ? word : `${word}s`;
}

export function summariseStats(stats: DiffStats): string {
  if (stats.identical) return 'No differences';
  const bits: string[] = [];
  if (stats.added > 0) bits.push(`+${stats.added} added`);
  if (stats.removed > 0) bits.push(`−${stats.removed} removed`);
  if (stats.modified > 0) bits.push(`${stats.modified} modified`);
  return bits.join(', ');
}
