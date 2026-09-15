import {
  ALIGN_TOL,
  HEAD_RATIO_1,
  HEAD_RATIO_2,
  HEAD_RATIO_3,
  INDENT_BUCKET,
  INDENT_STEP,
  PARA_GAP,
  SUPER_OFFSET,
  SUPER_SIZE_MAX,
} from '../constants';
import { isListMarker } from '../text';
import type {
  Align,
  Block,
  FontInfo,
  Line,
  LinkBox,
  PageFacts,
  ParaBlock,
  Pt,
  Run,
  Span,
  StructBlock,
} from '../types';
import { findColumns, type ColumnBand } from './columns';
import { applyJustification, buildLines, fragmentRunTexts } from './lines';

/** DocModel['body'] — passed in so a page can be laid out against the document's body text. */
export interface BodyMetrics {
  family: string;
  sizePt: Pt;
  leadingPt: Pt;
}

export interface PageContext {
  fonts: ReadonlyMap<string, FontInfo>;
  body: BodyMetrics;
  /** Spans already claimed by a running header or footer (§4.8). */
  consumed?: ReadonlySet<Span>;
  /** Pre-computed bands; findColumns runs when this is absent. */
  columns?: readonly ColumnBand[];
  flattenColumns?: boolean;
}

type HeadingLevel = NonNullable<ParaBlock['level']>;
type Kind = ParaBlock['kind'];

/** What §4.4 scores on, plus the struct position model.ts needs to splice tables back in. */
export interface BlockMetrics {
  /** Struct block index, or -1 on the geometry path. */
  structIndex: number;
  column: number;
  sizePt: Pt;
  widthPt: Pt;
  columnWidthPt: Pt;
  lineCount: number;
  allBold: boolean;
  allCaps: boolean;
  notSentence: boolean;
  /** Level claimed by a producer tag or struct role; null when nothing claimed it. */
  tagLevel: HeadingLevel | null;
  baseKind: Kind;
  markerX: Pt | null;
  /** Right edge measured from the column's left, which is what §4.4's shortLine tests. */
  rightExtentPt: Pt;
  /** First baseline, so model.ts can put a page's pictures back where the page drew them. */
  topPt: Pt;
}

export interface MeasuredPara extends ParaBlock {
  metrics: BlockMetrics;
}

/** §4.4 candidate guards. */
const HEAD_MAX_LINES = 2;
const HEAD_SHORT = 0.7;
/** §4.2 size-change break; also the size bucket for the leading history and heading ranks. */
const SIZE_TOL: Pt = 0.6;
const LEAD_FALLBACK = 1.15;
const GAP_HISTORY = 5;
/** §4.2 short previous line, in ems of the block's own size. */
const SHORT_TAIL = 2.5;
/** §4.1 split a struct block whose internal gap runs away. */
const STRUCT_SPLIT = 2.5;
/** §4.5 gap after the marker, and how far a continuation line may stray from textX. */
const MARKER_GAP = 1.2;
const CONTINUATION_TOL: Pt = 2;
const MAX_LIST_DEPTH = 3;
/** §4.7 alignment. */
const CENTRE_TOL = 0.02;
const X0_VARY: Pt = 3;
const SHARE_MIN = 0.7;
const JUSTIFY_SHARE = 0.8;
const JUSTIFY_LINES = 3;
const SINGLE_CENTRE_WIDTH = 0.8;
const FIRST_LINE_TOL: Pt = 1;
const RIGHT_INDENT_MIN = 1;
const TAB_STOP_TOL: Pt = 2;
/** §4.10 line-end hyphens. U+2013/U+2014 are deliberately not here. */
const HYPHEN_RE = /[-\u2010\u00ad]$/;
const SOFT_HYPHEN_RE = /\u00ad/g;
const HEAD_TAG_RE = /^(?:h\s*([1-6])|heading\s*([1-6]))$/i;

const rightEdge = (span: Span): Pt => span.x + span.w;
const isInk = (span: Span): boolean => !span.synthetic && span.text.trim().length > 0;
const round2 = (value: number): number => Math.round(value * 100) / 100;
const snap = (pt: Pt): Pt => Math.round(pt / INDENT_BUCKET) * INDENT_BUCKET;

/** Lower median: with two samples the leading is the smaller gap, not the paragraph break. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Largest share of values agreeing within ALIGN_TOL. */
function shareRatio(values: readonly Pt[]): number {
  if (values.length === 0) return 0;
  let best = 0;
  for (const value of values) {
    const shared = values.filter((other) => Math.abs(other - value) <= ALIGN_TOL).length;
    if (shared > best) best = shared;
  }
  return best / values.length;
}

const spread = (values: readonly Pt[]): Pt =>
  values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);

/* ---------- §4.7 alignment ---------- */

export function detectAlignment(lines: readonly Line[], left: Pt, right: Pt, em: Pt): Align {
  if (lines.length === 0) return 'left';
  const width = Math.max(1, right - left);
  const centre = (left + right) / 2;
  // A table-cell column makes 0.02 x width sub-point, so the em floors it.
  const tol = Math.max(CENTRE_TOL * width, 0.15 * em);
  const centred =
    lines.filter((line) => Math.abs((line.x0 + line.x1) / 2 - centre) <= tol).length / lines.length;

  if (lines.length === 1) {
    const only = lines[0];
    return centred >= 1 && only.x1 - only.x0 < SINGLE_CENTRE_WIDTH * width ? 'center' : 'left';
  }

  const body = lines.slice(0, -1);
  if (
    lines.length >= JUSTIFY_LINES &&
    shareRatio(body.map((line) => line.x1)) >= JUSTIFY_SHARE &&
    shareRatio(body.map((line) => line.x0)) >= JUSTIFY_SHARE
  ) {
    return 'justify';
  }

  // A left-aligned block has a fixed x0, which is what keeps ragged text out of both branches.
  const varies = spread(lines.map((line) => line.x0)) > X0_VARY;
  if (centred >= SHARE_MIN && varies) return 'center';
  if (shareRatio(lines.map((line) => line.x1)) >= SHARE_MIN && varies) return 'right';
  return 'left';
}

/* ---------- §4.5 markers ---------- */

interface Marker {
  text: string;
  markerX: Pt;
  textX: Pt;
}

function markerOf(line: Line): Marker | null {
  const ink = line.spans.filter(isInk);
  if (ink.length < 2) return null;
  const first = ink[0];
  const glyph = first.text.trim();
  const size = first.size || line.size;
  if (size <= 0) return null;
  // The advance can include a trailing space, which would break both the width and the gap test.
  const inkWidth = (first.w * glyph.length) / Math.max(1, first.text.length);
  if (!isListMarker(glyph, inkWidth, size)) return null;
  const next = ink[1];
  // Measured from the marker's own x: Word's bullet leaves 12.9 pt of clear gap at an
  // 11.04 pt body, just under §4.5's 1.2 S, but a full 18 pt from marker start to text.
  if (next.x - first.x < MARKER_GAP * size) return null;
  return { text: glyph, markerX: first.x, textX: next.x };
}

/** Where a line's body text starts — past its marker, when it has one. */
const textStart = (line: Line): Pt => markerOf(line)?.textX ?? line.x0;

/* ---------- runs ---------- */

function hrefOf(span: Span, links: readonly LinkBox[]): string | null {
  if (links.length === 0) return null;
  const x = span.x + span.w / 2;
  const y = span.y - span.size * 0.35;
  for (const link of links) {
    const r = link.rect;
    if (x >= r.x - 1 && x <= r.x + r.w + 1 && y >= r.y - 1 && y <= r.y + r.h + 1) return link.url;
  }
  return null;
}

function verticalOf(span: Span, line: Line): Run['vertical'] {
  if (line.size <= 0 || span.size > SUPER_SIZE_MAX * line.size) return 'baseline';
  const offset = span.y - line.y;
  if (offset <= -SUPER_OFFSET * line.size) return 'super';
  if (offset >= SUPER_OFFSET * line.size) return 'sub';
  return 'baseline';
}

const styleKey = (run: Run): string =>
  [run.fontId, run.size.toFixed(2), run.colour, run.vertical, run.href ?? ''].join('|');

function lineRuns(
  line: Line,
  ctx: PageContext,
  facts: PageFacts,
  justified: boolean,
  skipBefore: Pt,
): Run[] {
  const out: Run[] = [];
  line.fragments.forEach((fragment, index) => {
    const texts = fragmentRunTexts(fragment, facts.bodySize, justified);
    if (index > 0) {
      const anchor = out[out.length - 1];
      out.push({
        text: '',
        fontId: anchor?.fontId ?? line.spans[0]?.fontId ?? '',
        size: anchor?.size ?? line.size,
        bold: anchor?.bold ?? false,
        italic: anchor?.italic ?? false,
        colour: anchor?.colour ?? '000000',
        vertical: 'baseline',
        href: null,
        tab: true,
      });
    }
    fragment.spans.forEach((span, i) => {
      const text = texts[i] ?? '';
      if (text.length === 0) return;
      if (rightEdge(span) <= skipBefore) return;
      const font = ctx.fonts.get(span.fontId);
      const run: Run = {
        text,
        fontId: span.fontId,
        size: span.size,
        bold: font?.bold ?? false,
        italic: font?.italic ?? false,
        colour: span.colour ?? '000000',
        vertical: verticalOf(span, line),
        href: hrefOf(span, facts.links),
      };
      const last = out[out.length - 1];
      if (last && last.tab !== true && styleKey(last) === styleKey(run)) last.text += run.text;
      else out.push(run);
    });
  });
  return out;
}

const runsText = (runs: readonly Run[]): string =>
  runs.map((run) => (run.tab === true ? '\t' : run.text)).join('');

const isLower = (ch: string): boolean => ch !== '' && ch.toLowerCase() === ch && /\p{L}/u.test(ch);
const isUpper = (ch: string): boolean => ch !== '' && ch.toUpperCase() === ch && /\p{L}/u.test(ch);

/** §4.10: a single space between lines, unless a line-end hyphen says otherwise. */
function joinLine(out: Run[], previousText: string, nextText: string): void {
  let index = out.length - 1;
  while (index >= 0 && (out[index].tab === true || out[index].text.length === 0)) index -= 1;
  if (index < 0) return;
  const last = out[index];

  const match = HYPHEN_RE.exec(previousText);
  const stem = match ? previousText.slice(0, -1) : '';
  const word = stem.split(/\s+/).pop() ?? '';
  // A dash standing on its own (a '- 1 -' folio) is not a word broken across lines.
  if (!match || word.length === 0) {
    if (!/\s$/.test(last.text)) last.text += ' ';
    return;
  }

  const next = nextText.trimStart().charAt(0);
  const remove =
    match[0] === '\u00ad' ||
    (isLower(next) && word.length >= 2 && !isUpper(word.charAt(0)) && !/\d$/.test(word));
  if (!remove || !HYPHEN_RE.test(last.text)) return;
  last.text = last.text.slice(0, -1);
  if (last.text.length === 0) out.splice(index, 1);
}

function blockRuns(
  lines: readonly Line[],
  ctx: PageContext,
  facts: PageFacts,
  justified: boolean,
  skipBefore: Pt,
): Run[] {
  const perLine = lines.map((line, i) =>
    lineRuns(line, ctx, facts, justified, i === 0 ? skipBefore : 0),
  );
  const texts = perLine.map(runsText);

  const out: Run[] = [];
  perLine.forEach((runs, i) => {
    if (runs.length === 0) return;
    if (out.length > 0) joinLine(out, texts[i - 1] ?? '', texts[i]);
    for (const run of runs) {
      const last = out[out.length - 1];
      if (last && last.tab !== true && run.tab !== true && styleKey(last) === styleKey(run)) {
        last.text += run.text;
      } else out.push(run);
    }
  });

  // U+00AD survives a join only where the hyphen rule kept it; anywhere else it is invisible noise.
  for (const run of out) run.text = run.text.replace(SOFT_HYPHEN_RE, '');
  const first = out.find((run) => run.tab !== true);
  if (first) first.text = first.text.replace(/^\s+/, '');
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].tab === true) continue;
    out[i].text = out[i].text.replace(/\s+$/, '');
    break;
  }
  return out.filter((run) => run.tab === true || run.text.length > 0);
}

/* ---------- §4.7 measurement ---------- */

function tabStopsFor(lines: readonly Line[], left: Pt): ParaBlock['tabStops'] {
  const stops: Pt[] = [];
  for (const line of lines) {
    for (const fragment of line.fragments.slice(1)) {
      const pos = fragment.x0 - left;
      if (pos > 0 && !stops.some((other) => Math.abs(other - pos) <= TAB_STOP_TOL)) stops.push(pos);
    }
  }
  return stops.sort((a, b) => a - b).map((posPt) => ({ type: 'left' as const, posPt }));
}

interface Segment {
  lines: Line[];
  band: ColumnBand;
  column: number;
  previousY: Pt | null;
  structIndex: number;
  tagLevel: HeadingLevel | null;
  baseKind: Kind;
  marker: Marker | null;
  listDepth: number | null;
}

function makePara(segment: Segment, facts: PageFacts, ctx: PageContext): MeasuredPara | null {
  const lines = segment.lines;
  if (lines.length === 0) return null;

  const justified = applyJustification(lines, facts.bodySize);
  const marker = segment.marker ?? markerOf(lines[0]);
  const runs = blockRuns(lines, ctx, facts, justified, segment.marker ? 0 : (marker?.textX ?? 0));
  if (runs.every((run) => run.tab === true || run.text.trim().length === 0)) return null;

  const band = segment.band;
  const size = median(lines.map((line) => line.size)) || facts.bodySize;
  const em = size || facts.bodySize;
  const align = detectAlignment(lines, band.x0, band.x1, em);

  const starts = lines.map((line) => line.x0);
  let indentLeft = Math.min(...starts) - band.x0;
  let firstLinePt = 0;
  let hangingPt = 0;
  if (marker) {
    indentLeft = marker.textX - band.x0;
    hangingPt = Math.max(0, marker.textX - marker.markerX);
  } else if (lines.length >= 2) {
    const rest = Math.min(...starts.slice(1));
    const diff = starts[0] - rest;
    if (diff > FIRST_LINE_TOL) {
      firstLinePt = diff;
      indentLeft = rest - band.x0;
    } else if (diff < -FIRST_LINE_TOL) {
      hangingPt = -diff;
      indentLeft = rest - band.x0;
    }
  }

  // Only wrapped text evidences a narrower measure; one short line is just a short line.
  const rightGap = lines.length < 2 ? 0 : band.x1 - Math.max(...lines.map((line) => line.x1));
  const centredOrRight = align === 'center' || align === 'right';
  const gaps: Pt[] = [];
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i].y - lines[i - 1].y;
    if (gap > 0) gaps.push(gap);
  }
  const leadingPt = gaps.length > 0 ? median(gaps) : ctx.body.leadingPt;
  const spaceBefore =
    segment.previousY === null ? 0 : Math.max(0, lines[0].y - segment.previousY - leadingPt);

  const text = runsText(runs);
  const words = text.split(/\s+/).filter((word) => /\p{L}/u.test(word));
  const inkRuns = runs.filter((run) => run.tab !== true && run.text.trim().length > 0);
  const kind: Kind = marker && segment.baseKind === 'paragraph' ? 'listItem' : segment.baseKind;

  const block: MeasuredPara = {
    kind,
    runs,
    align,
    indentLeftPt: centredOrRight ? 0 : Math.max(0, snap(indentLeft)),
    indentRightPt:
      centredOrRight || rightGap <= RIGHT_INDENT_MIN * em ? 0 : Math.max(0, snap(rightGap)),
    firstLinePt,
    hangingPt,
    spaceBeforePt: spaceBefore,
    leadingPt,
    tabStops: tabStopsFor(lines, band.x0),
    source: segment.structIndex >= 0 ? 'struct' : 'geometry',
    metrics: {
      structIndex: segment.structIndex,
      column: segment.column,
      sizePt: size,
      widthPt: Math.max(...lines.map((line) => line.x1)) - Math.min(...starts),
      columnWidthPt: Math.max(1, band.x1 - band.x0),
      lineCount: lines.length,
      allBold: inkRuns.length > 0 && inkRuns.every((run) => run.bold),
      allCaps: words.length >= 2 && /\p{L}/u.test(text) && !/\p{Ll}/u.test(text),
      notSentence: !/[.,;:]$/.test(text.trimEnd()),
      tagLevel: segment.tagLevel,
      baseKind: kind,
      markerX: marker ? marker.markerX : null,
      rightExtentPt: Math.max(...lines.map((line) => line.x1)) - band.x0,
      topPt: lines[0].y,
    },
  };
  if (marker) block.marker = marker.text;
  if (kind === 'listItem') block.listDepth = segment.listDepth ?? 1;
  return block;
}

/** §4.5: depth is the rank of markerX among the page's distinct marker positions. */
function rankListDepths(blocks: readonly MeasuredPara[]): void {
  const items = blocks.filter((block) => block.metrics.markerX !== null);
  const positions: Pt[] = [];
  for (const block of items) {
    const x = block.metrics.markerX ?? 0;
    if (!positions.some((other) => Math.abs(other - x) <= INDENT_BUCKET)) positions.push(x);
  }
  positions.sort((a, b) => a - b);
  for (const block of items) {
    const x = block.metrics.markerX ?? 0;
    const rank = positions.findIndex((other) => Math.abs(other - x) <= INDENT_BUCKET);
    block.listDepth = Math.min(MAX_LIST_DEPTH, Math.max(1, rank + 1));
  }
}

/* ---------- §4.2 paragraph segmentation ---------- */

interface GapSample {
  size: Pt;
  gap: Pt;
}

function expectedLeading(history: readonly GapSample[], size: Pt): Pt {
  const recent = history.filter((s) => Math.abs(s.size - size) <= SIZE_TOL).slice(-GAP_HISTORY);
  return Math.max(median(recent.map((s) => s.gap)), LEAD_FALLBACK * size);
}

const mcidOf = (line: Line): string | null => line.spans.filter(isInk)[0]?.mcid ?? null;
const lastMcid = (line: Line): string | null => {
  const ink = line.spans.filter(isInk);
  return ink.length > 0 ? ink[ink.length - 1].mcid : null;
};

function breaksBefore(
  previous: Line,
  line: Line,
  group: readonly Line[],
  gap: Pt,
  history: readonly GapSample[],
  bodySize: Pt,
): boolean {
  const size = Math.max(previous.size, line.size) || bodySize;
  if (gap > PARA_GAP * expectedLeading(history, line.size || size)) return true;
  if (Math.abs(previous.size - line.size) > SIZE_TOL) return true;

  const start = textStart(previous);
  const indented = start === previous.x0 ? INDENT_STEP * size : CONTINUATION_TOL;
  if (Math.abs(line.x0 - start) > indented) return true;

  if (markerOf(line)) return true;
  if (group.length >= 2) {
    const measure = Math.max(...group.map((member) => member.x1));
    if (measure - previous.x1 > SHORT_TAIL * size) return true;
  }
  const before = lastMcid(previous);
  const here = mcidOf(line);
  return before !== null && here !== null && before !== here;
}

function segment(lines: readonly Line[], bodySize: Pt): Line[][] {
  const groups: Line[][] = [];
  const history: GapSample[] = [];
  let current: Line[] = [];

  for (const line of lines) {
    if (current.length === 0) {
      current = [line];
      continue;
    }
    const previous = current[current.length - 1];
    const gap = line.y - previous.y;
    if (breaksBefore(previous, line, current, gap, history, bodySize)) {
      groups.push(current);
      current = [line];
    } else {
      current.push(line);
    }
    if (gap > 0) history.push({ size: line.size, gap });
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** §4.1: a struct block whose own gap runs away is two paragraphs the tag failed to separate. */
function splitStructLines(lines: readonly Line[], bodySize: Pt): Line[][] {
  if (lines.length < 3) return [[...lines]];
  const gaps: Pt[] = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i].y - lines[i - 1].y);
  const leading = Math.max(median(gaps), LEAD_FALLBACK * (lines[0].size || bodySize));

  const groups: Line[][] = [];
  let current: Line[] = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    if (gaps[i - 1] > STRUCT_SPLIT * leading) {
      groups.push(current);
      current = [];
    }
    current.push(lines[i]);
  }
  groups.push(current);
  return groups;
}

/* ---------- shared page plumbing ---------- */

function bodySpans(facts: PageFacts, ctx: PageContext): Span[] {
  const consumed = ctx.consumed;
  return consumed ? facts.spans.filter((span) => !consumed.has(span)) : [...facts.spans];
}

function bandsFor(facts: PageFacts, ctx: PageContext, spans: readonly Span[]): ColumnBand[] {
  if (ctx.columns && ctx.columns.length > 0) return [...ctx.columns];
  if (ctx.flattenColumns) {
    const ink = spans.filter(isInk);
    if (ink.length === 0) return [{ x0: 0, x1: Math.max(1, facts.width) }];
    return [{ x0: Math.min(...ink.map((s) => s.x)), x1: Math.max(...ink.map(rightEdge)) }];
  }
  return findColumns(spans, facts.width, facts.bodySize);
}

function bandIndex(span: Span, bands: readonly ColumnBand[]): number {
  // A masthead straddling the gutter belongs to the column it starts in, so it reads first.
  const starts = bands.findIndex((band) => span.x >= band.x0 - ALIGN_TOL && span.x <= band.x1);
  if (starts >= 0) return starts;
  let best = 0;
  let bestOverlap = -Infinity;
  bands.forEach((band, i) => {
    const overlap = Math.min(rightEdge(span), band.x1) - Math.max(span.x, band.x0);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = i;
    }
  });
  return best;
}

function bandOfSpans(spans: readonly Span[], bands: readonly ColumnBand[]): number {
  const tally = new Map<number, number>();
  for (const span of spans.filter(isInk)) {
    const index = bandIndex(span, bands);
    tally.set(index, (tally.get(index) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [index, count] of tally) {
    if (count > bestCount) {
      best = index;
      bestCount = count;
    }
  }
  return best;
}

/* ---------- §4.2 geometry path ---------- */

export function blocksFromGeometry(facts: PageFacts, ctx: PageContext): Block[] {
  const spans = bodySpans(facts, ctx);
  if (spans.length === 0) return [];
  const bands = bandsFor(facts, ctx, spans);
  const out: MeasuredPara[] = [];

  bands.forEach((band, column) => {
    const mine =
      bands.length === 1 ? spans : spans.filter((span) => bandIndex(span, bands) === column);
    const lines = buildLines(mine, facts.bodySize, column);
    let previousY: Pt | null = null;
    for (const group of segment(lines, facts.bodySize)) {
      const block = makePara(
        {
          lines: group,
          band,
          column,
          previousY,
          structIndex: -1,
          tagLevel: null,
          baseKind: 'paragraph',
          marker: null,
          listDepth: null,
        },
        facts,
        ctx,
      );
      previousY = group[group.length - 1].y;
      if (block) out.push(block);
    }
  });

  rankListDepths(out);
  classifyHeadings(out, ctx.body);
  return out;
}

/* ---------- §4.1 struct path ---------- */

function tagLevelOf(block: StructBlock): HeadingLevel | null {
  for (const name of [block.producerTag, block.role]) {
    const tag = name?.trim();
    if (!tag) continue;
    if (/^title$/i.test(tag)) return 1;
    const match = HEAD_TAG_RE.exec(tag);
    if (match) return clampLevel(Number(match[1] ?? match[2]));
    if (/^h$/i.test(tag)) return 2;
  }
  return null;
}

function clampLevel(level: number): HeadingLevel {
  const bounded = Math.min(6, Math.max(1, Math.round(level)));
  return bounded as HeadingLevel;
}

function structKind(block: StructBlock): Kind {
  if (/^caption$/i.test(block.role)) return 'caption';
  if (block.path.some((role) => role === 'LI') || /^(lbl|lbody)$/i.test(block.role)) {
    return 'listItem';
  }
  return 'paragraph';
}

/** The ...L,LI prefix an Lbl and its LBody share. */
function listPrefix(block: StructBlock): string | null {
  const li = block.path.lastIndexOf('LI');
  return li < 0 ? null : block.path.slice(0, li + 1).join('/');
}

/** LibreOffice nests a P inside LBody, so the body block's own role is not always 'LBody'. */
function pairsWith(label: StructBlock, body: StructBlock): boolean {
  const prefix = listPrefix(label);
  return (
    /^lbl$/i.test(label.role) &&
    prefix !== null &&
    prefix === listPrefix(body) &&
    body.path.includes('LBody')
  );
}

export function blocksFromStruct(facts: PageFacts, ctx: PageContext): Block[] {
  const spans = bodySpans(facts, ctx);
  if (spans.length === 0) return [];
  const bands = bandsFor(facts, ctx, spans);

  const byBlock = new Map<number, Span[]>();
  for (const span of spans) {
    const index = span.mcid === null ? undefined : facts.struct.blockOf.get(span.mcid);
    if (index === undefined) continue;
    const bucket = byBlock.get(index);
    if (bucket) bucket.push(span);
    else byBlock.set(index, [span]);
  }

  const indices = [...byBlock.keys()].sort((a, b) => a - b);
  const out: MeasuredPara[] = [];
  let previousY: Pt | null = null;

  for (let i = 0; i < indices.length; i++) {
    const index = indices[i];
    const struct = facts.struct.blocks[index];
    // A table's own blocks belong to layout/tables.ts, and the gap across one is no evidence.
    if (!struct || struct.tableIndex !== null) {
      previousY = null;
      continue;
    }

    let mine = byBlock.get(index) ?? [];
    let marker: Marker | null = null;

    // §4.1: Lbl carries the glyph, LBody the text; one paragraph with a hanging indent.
    const next = facts.struct.blocks[indices[i + 1] ?? -1];
    if (next && pairsWith(struct, next)) {
      const label = mine.filter(isInk);
      const body = (byBlock.get(next.index) ?? []).filter(isInk);
      if (label.length > 0 && body.length > 0) {
        marker = {
          text: label.map((span) => span.text).join('').trim(),
          markerX: Math.min(...label.map((span) => span.x)),
          textX: Math.min(...body.map((span) => span.x)),
        };
        mine = byBlock.get(next.index) ?? [];
        i += 1;
      }
    }

    const owner = marker ? (facts.struct.blocks[indices[i]] ?? struct) : struct;
    const column = bandOfSpans(mine, bands);
    const band = bands[column] ?? bands[0];
    const lines = buildLines(mine, facts.bodySize, column);
    const depth = struct.path.filter((role) => role === 'L').length;

    for (const group of splitStructLines(lines, facts.bodySize)) {
      if (group.length === 0) continue;
      const block = makePara(
        {
          lines: group,
          band,
          column,
          previousY: previousY !== null && group[0].y > previousY ? previousY : null,
          structIndex: index,
          tagLevel: tagLevelOf(owner),
          baseKind: structKind(struct),
          marker,
          listDepth: depth > 0 ? Math.min(MAX_LIST_DEPTH, depth) : null,
        },
        facts,
        ctx,
      );
      previousY = group[group.length - 1].y;
      marker = null;
      if (block) out.push(block);
    }
  }

  classifyHeadings(out, ctx.body);
  return out;
}

/* ---------- §4.4 headings ---------- */

const isMeasured = (block: ParaBlock): block is MeasuredPara =>
  'metrics' in block && typeof (block as MeasuredPara).metrics === 'object';

function scoreHeading(m: BlockMetrics, body: BodyMetrics): HeadingLevel | null {
  if (m.baseKind !== 'paragraph' || m.lineCount > HEAD_MAX_LINES) return null;
  if (!m.notSentence && !m.allCaps) return null;
  const ratio = body.sizePt > 0 ? m.sizePt / body.sizePt : 1;
  // Measured to the column's left edge, not the block's own width: 'TOTAL DUE  GBP 1,201.39'
  // is only 157 pt wide but runs to the right margin, and §4.4 names it as a false positive.
  const shortLine = m.rightExtentPt < HEAD_SHORT * m.columnWidthPt;
  if (ratio >= HEAD_RATIO_1) return 1;
  if (ratio >= HEAD_RATIO_2) return 2;
  if (ratio >= HEAD_RATIO_3) return (m.allBold || m.allCaps) && shortLine ? 3 : null;
  return m.allBold && m.allCaps && shortLine ? 3 : null;
}

export function classifyHeadings(blocks: ParaBlock[], body: BodyMetrics): void {
  const claimed = new Map<MeasuredPara, HeadingLevel>();
  for (const block of blocks) {
    if (!isMeasured(block)) continue;
    const level = block.metrics.tagLevel ?? scoreHeading(block.metrics, body);
    if (level === null) {
      block.kind = block.metrics.baseKind;
      block.level = undefined;
      continue;
    }
    claimed.set(block, level);
  }

  const sizes = [...claimed.keys()].map((block) => round2(block.metrics.sizePt));
  const buckets = [...new Set(sizes)].sort((a, b) => b - a);
  for (const [block, level] of claimed) {
    const rank = buckets.indexOf(round2(block.metrics.sizePt)) + 1;
    block.kind = 'heading';
    block.level = block.metrics.tagLevel ?? clampLevel(rank || level);
  }
}
