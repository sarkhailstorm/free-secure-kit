import { A4, DEFAULT_ASCENT, DEFAULT_DESCENT, SEG_TOL } from '../constants';
import type {
  Align,
  FontInfo,
  Line,
  PageFacts,
  ParaBlock,
  Pt,
  Rect,
  Run,
  Section,
  Span,
} from '../types';
import { buildLines, fragmentRunTexts } from './lines';
import { components, mergeCollinear } from './rules';

/** Which Word field replaced the digits: PAGE or NUMPAGES. */
export type PageField = 'current' | 'total';

/** Run.field is not in the frozen Run, so the emitter reads it through pageFieldOf. */
export interface FieldRun extends Run {
  field: PageField;
}

export interface RunningContent {
  header: ParaBlock[] | null;
  footer: ParaBlock[] | null;
  headerPageField: boolean;
  footerPageField: boolean;
  headerPt: Pt;
  footerPt: Pt;
  consumed: Set<Span>;
}

type Zone = 'header' | 'footer';

const ZONE_SPLIT = 0.5;
const HEADER_BAND = 0.09;
const FOOTER_BAND = 0.9;
const ROW_TOL: Pt = 3;
const SMALL_DOC = 3;
const REPEAT_RATIO = 0.6;
const MAX_RUNNING_LINES = 3;
const CENTRE_TOL = 0.02;
const DEFAULT_EDGE: Pt = 36;
const DEFAULT_MARGIN: Pt = 72;
/** Word's own set; nothing measured on the corpus lands between two of them. */
const SNAP: readonly Pt[] = [36, 54, 72, 90, 108];
const SNAP_TOL: Pt = 2;
const MARGIN_MAX = 0.45;

const isInk = (span: Span): boolean => span.text.trim().length > 0;
const skeleton = (text: string): string => text.replace(/\d+/g, '#').trim();
const isBody = (facts: PageFacts): boolean =>
  facts.cls === 'text' || facts.cls === 'searchableScan';

export function noRunning(): RunningContent {
  return {
    header: null,
    footer: null,
    headerPageField: false,
    footerPageField: false,
    headerPt: DEFAULT_EDGE,
    footerPt: DEFAULT_EDGE,
    consumed: new Set(),
  };
}

interface Candidate {
  page: PageFacts;
  line: Line;
}

interface Row {
  y: Pt;
  variants: Map<string, Candidate[]>;
}

function zoneLines(page: PageFacts, lines: readonly Line[], zone: Zone, tagged: boolean): Line[] {
  const height = page.height || 1;
  const picked = lines.filter((line) => {
    const ink = line.spans.filter(isInk);
    if (ink.length === 0) return false;
    if (tagged) {
      if (!ink.every((span) => span.artifact)) return false;
      return zone === 'header' ? line.y < ZONE_SPLIT * height : line.y >= ZONE_SPLIT * height;
    }
    return zone === 'header' ? line.y <= HEADER_BAND * height : line.y >= FOOTER_BAND * height;
  });
  // A page whose whole top is marked Artifact is a mis-tag, not a four-line header.
  return picked.length > MAX_RUNNING_LINES ? [] : picked;
}

function rowsOf(
  pages: readonly PageFacts[],
  lineMap: ReadonlyMap<number, Line[]>,
  zone: Zone,
  tagged: boolean,
): Row[] {
  const rows: Row[] = [];
  for (const page of pages) {
    for (const line of zoneLines(page, lineMap.get(page.index) ?? [], zone, tagged)) {
      const key = skeleton(line.text);
      if (!key) continue;
      let row = rows.find((candidate) => Math.abs(candidate.y - line.y) <= ROW_TOL);
      if (!row) {
        row = { y: line.y, variants: new Map() };
        rows.push(row);
      }
      const list = row.variants.get(key) ?? [];
      if (list.some((item) => item.page.index === page.index)) continue;
      list.push({ page, line });
      row.variants.set(key, list);
    }
  }
  return rows.sort((a, b) => a.y - b.y);
}

function runOf(span: Span, text: string, fonts: ReadonlyMap<string, FontInfo> | undefined): Run {
  const font = fonts?.get(span.fontId);
  return {
    text,
    fontId: span.fontId,
    size: span.size,
    bold: font?.bold ?? false,
    italic: font?.italic ?? false,
    colour: span.colour ?? '000000',
    vertical: 'baseline',
    href: null,
  };
}

function runsOf(line: Line, bodySize: Pt, fonts: ReadonlyMap<string, FontInfo> | undefined): Run[] {
  const runs: Run[] = [];
  line.fragments.forEach((fragment, index) => {
    if (index > 0 && fragment.spans.length > 0) {
      runs.push({ ...runOf(fragment.spans[0], '', fonts), tab: true });
    }
    const texts = fragmentRunTexts(fragment, bodySize);
    fragment.spans.forEach((span, slot) => {
      const text = texts[slot] ?? span.text;
      if (text.length > 0) runs.push(runOf(span, text, fonts));
    });
  });
  return runs;
}

const sameStyle = (a: Run, b: Run): boolean =>
  a.tab !== true &&
  b.tab !== true &&
  a.fontId === b.fontId &&
  a.size === b.size &&
  a.bold === b.bold &&
  a.italic === b.italic &&
  a.colour === b.colour;

function mergeRuns(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && sameStyle(last, run)) last.text += run.text;
    else out.push({ ...run });
  }
  return out;
}

/** Digit-run slots that track the 1-based page index, then the page count. */
function fieldSlots(group: readonly Candidate[], total: number): Map<number, PageField> {
  const slots = new Map<number, PageField>();
  if (group.length < 2) return slots;

  const digits = group.map((item) => item.line.text.match(/\d+/g) ?? []);
  const width = digits[0].length;
  if (width === 0 || digits.some((list) => list.length !== width)) return slots;

  for (let slot = 0; slot < width; slot++) {
    const values = digits.map((list) => Number(list[slot]));
    if (values.every((value, index) => value === group[index].page.pageNumber)) {
      slots.set(slot, 'current');
    } else if (slots.size > 0 && values.every((value) => value === total)) {
      slots.set(slot, 'total');
    }
  }
  return slots;
}

function applyFields(runs: readonly Run[], slots: ReadonlyMap<number, PageField>): Run[] {
  if (slots.size === 0) return [...runs];
  const whole = runs.map((run) => run.text).join('').match(/\d+/g)?.length ?? 0;
  const perRun = runs.reduce((sum, run) => sum + (run.text.match(/\d+/g)?.length ?? 0), 0);
  // A number split across two runs would shift every slot; leave the digits alone.
  if (whole !== perRun) return [...runs];

  const out: Run[] = [];
  let slot = 0;
  for (const run of runs) {
    if (run.tab === true || !/\d/.test(run.text)) {
      out.push({ ...run });
      continue;
    }
    for (const piece of run.text.split(/(\d+)/)) {
      if (piece.length === 0) continue;
      if (!/^\d+$/.test(piece)) {
        out.push({ ...run, text: piece });
        continue;
      }
      const field = slots.get(slot);
      slot += 1;
      const next: Run = { ...run, text: piece };
      if (!field) {
        out.push(next);
        continue;
      }
      const marked: FieldRun = { ...next, field };
      out.push(marked);
    }
  }
  return out;
}

/** The emitter's only way in: Run has no field slot in the frozen types. */
export function pageFieldOf(run: Run): PageField | null {
  const field = (run as Partial<FieldRun>).field;
  return field === 'current' || field === 'total' ? field : null;
}

function alignOf(line: Line, width: Pt): Align {
  const left = line.x0;
  const right = width - line.x1;
  if (Math.abs(left - right) <= CENTRE_TOL * width) return 'center';
  return right < left ? 'right' : 'left';
}

function runningBlock(
  rep: Candidate,
  group: readonly Candidate[],
  total: number,
  fonts: ReadonlyMap<string, FontInfo> | undefined,
): { block: ParaBlock; field: boolean } {
  const runs = applyFields(mergeRuns(runsOf(rep.line, rep.page.bodySize, fonts)), fieldSlots(group, total));
  const block: ParaBlock = {
    kind: 'paragraph',
    runs,
    align: alignOf(rep.line, rep.page.width),
    indentLeftPt: 0,
    indentRightPt: 0,
    firstLinePt: 0,
    hangingPt: 0,
    spaceBeforePt: 0,
    leadingPt: Math.max(1, 1.15 * rep.line.size),
    tabStops: [],
    source: 'geometry',
  };
  return { block, field: runs.some((run) => pageFieldOf(run) !== null) };
}

interface ZoneResult {
  blocks: ParaBlock[];
  field: boolean;
  edge: Pt;
  consumed: Span[];
}

function glyphTop(line: Line, fonts: ReadonlyMap<string, FontInfo> | undefined): Pt {
  const ink = line.spans.filter(isInk);
  return Math.min(
    ...ink.map((span) => span.y - (fonts?.get(span.fontId)?.ascent ?? DEFAULT_ASCENT) * span.size),
  );
}

function glyphBottom(line: Line, fonts: ReadonlyMap<string, FontInfo> | undefined): Pt {
  const ink = line.spans.filter(isInk);
  return Math.max(
    ...ink.map((span) => span.y - (fonts?.get(span.fontId)?.descent ?? DEFAULT_DESCENT) * span.size),
  );
}

function zoneContent(
  pages: readonly PageFacts[],
  lineMap: ReadonlyMap<number, Line[]>,
  zone: Zone,
  total: number,
  fonts: ReadonlyMap<string, FontInfo> | undefined,
): ZoneResult | null {
  const tagged = pages.some(
    (page) => zoneLines(page, lineMap.get(page.index) ?? [], zone, true).length > 0,
  );
  const repeat = pages.length <= SMALL_DOC ? 2 : Math.ceil(REPEAT_RATIO * pages.length);
  // The Artifact tag is evidence on its own, so a one-page document still has one.
  const need = tagged ? Math.min(repeat, pages.length) : repeat;

  const blocks: ParaBlock[] = [];
  const consumed: Span[] = [];
  let field = false;
  let edge = Infinity;

  for (const row of rowsOf(pages, lineMap, zone, tagged)) {
    if (blocks.length >= MAX_RUNNING_LINES) break;
    let group: Candidate[] = [];
    for (const variant of row.variants.values()) if (variant.length > group.length) group = variant;
    if (group.length < need) continue;

    const rep = group.reduce((best, item) => (item.page.index < best.page.index ? item : best));
    const built = runningBlock(rep, group, total, fonts);
    blocks.push(built.block);
    field = field || built.field;

    for (const item of group) {
      for (const span of item.line.spans) consumed.push(span);
      const value =
        zone === 'header'
          ? glyphTop(item.line, fonts)
          : item.page.height - glyphBottom(item.line, fonts);
      edge = Math.min(edge, value);
    }
  }

  if (blocks.length === 0) return null;
  return { blocks, field, edge: Number.isFinite(edge) ? Math.max(0, edge) : DEFAULT_EDGE, consumed };
}

export function detectRunning(
  pages: readonly PageFacts[],
  fonts?: ReadonlyMap<string, FontInfo>,
): RunningContent {
  const body = pages.filter(isBody);
  if (body.length === 0) return noRunning();

  const lineMap = new Map<number, Line[]>();
  for (const page of body) lineMap.set(page.index, buildLines(page.spans, page.bodySize));

  const header = zoneContent(body, lineMap, 'header', pages.length, fonts);
  const footer = zoneContent(body, lineMap, 'footer', pages.length, fonts);

  const consumed = new Set<Span>();
  for (const span of header?.consumed ?? []) consumed.add(span);
  for (const span of footer?.consumed ?? []) consumed.add(span);

  return {
    header: header?.blocks ?? null,
    footer: footer?.blocks ?? null,
    headerPageField: header?.field ?? false,
    footerPageField: footer?.field ?? false,
    headerPt: header?.edge ?? DEFAULT_EDGE,
    footerPt: footer?.edge ?? DEFAULT_EDGE,
    consumed,
  };
}

function snap(value: Pt, limit: Pt): Pt {
  const clamped = Math.max(0, Math.min(MARGIN_MAX * limit, value));
  for (const target of SNAP) if (Math.abs(clamped - target) <= SNAP_TOL) return target;
  return clamped;
}

function axisValues(group: readonly { axis: 'h' | 'v'; at: Pt }[], axis: 'h' | 'v'): Pt[] {
  const sorted = group
    .filter((rule) => rule.axis === axis)
    .map((rule) => rule.at)
    .sort((a, b) => a - b);
  const out: Pt[] = [];
  for (const value of sorted) {
    if (out.length === 0 || value - out[out.length - 1] > SEG_TOL) out.push(value);
  }
  return out;
}

/** Word tables legally overhang the text margin, so their content cannot set one. */
function tableRects(facts: PageFacts): Rect[] {
  const rects: Rect[] = [];
  for (const group of components(mergeCollinear(facts.rules))) {
    const xs = axisValues(group, 'v');
    const ys = axisValues(group, 'h');
    if (xs.length < 3 || ys.length < 3) continue;
    rects.push({
      x: xs[0],
      y: ys[0],
      w: xs[xs.length - 1] - xs[0],
      h: ys[ys.length - 1] - ys[0],
    });
  }
  return rects;
}

function tableMcids(facts: PageFacts): Set<string> {
  const ids = new Set<string>();
  if (!facts.struct.present) return ids;
  for (const [mcid, index] of facts.struct.blockOf) {
    if (facts.struct.blocks[index]?.tableIndex !== null) ids.add(mcid);
  }
  return ids;
}

function marginSpans(facts: PageFacts, running: RunningContent): Span[] {
  const ids = tableMcids(facts);
  const rects = tableRects(facts);
  return facts.spans.filter((span) => {
    if (!isInk(span) || span.artifact || running.consumed.has(span)) return false;
    if (span.mcid !== null && ids.has(span.mcid)) return false;
    const cx = span.x + span.w / 2;
    return !rects.some(
      (rect) =>
        cx >= rect.x - SEG_TOL &&
        cx <= rect.x + rect.w + SEG_TOL &&
        span.y >= rect.y - SEG_TOL &&
        span.y <= rect.y + rect.h + SEG_TOL,
    );
  });
}

export function deriveMargins(
  pages: readonly PageFacts[],
  running: RunningContent,
  fonts: ReadonlyMap<string, FontInfo>,
): Section['margins'] {
  const width = pages[0]?.width ?? A4.widthPt;
  const height = pages[0]?.height ?? A4.heightPt;

  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let baseline = -Infinity;

  for (const page of pages) {
    if (!isBody(page)) continue;
    const spans = marginSpans(page, running);
    if (spans.length === 0) continue;
    for (const span of spans) {
      const ascent = fonts.get(span.fontId)?.ascent ?? DEFAULT_ASCENT;
      top = Math.min(top, span.y - ascent * span.size);
    }
    for (const line of buildLines(spans, page.bodySize)) {
      left = Math.min(left, line.x0);
      right = Math.max(right, line.x1);
      baseline = Math.max(baseline, line.y);
    }
  }

  const topPt = Number.isFinite(top) ? snap(top, height) : DEFAULT_MARGIN;
  const margins: Section['margins'] = {
    top: topPt,
    right: Number.isFinite(right) ? snap(width - right, width) : DEFAULT_MARGIN,
    // Text never reached this far down, so the slack is evidence of nothing; Word documents are symmetric.
    bottom: Number.isFinite(baseline)
      ? Math.min(snap(height - baseline, height), topPt)
      : DEFAULT_MARGIN,
    left: Number.isFinite(left) ? snap(left, width) : DEFAULT_MARGIN,
    header: 0,
    footer: 0,
  };
  margins.header = Math.min(snap(running.headerPt, height), margins.top);
  margins.footer = Math.min(snap(running.footerPt, height), margins.bottom);
  return margins;
}
