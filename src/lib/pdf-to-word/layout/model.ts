/**
 * PageFacts[] -> DocModel. Chooses the struct or geometry path per page, cuts
 * sections only where the geometry genuinely changes, and collects every note
 * the conversion owes the user.
 */

import { GRID_CLOSED_MIN, LINE_TOL, SEG_TOL } from '../constants';
import { structCovers } from '../extract/struct';
import { isSubstituted } from '../fonts';
import { placeholderLine } from '../notes';
import { degradeReasonFor } from '../scanned';
import type {
  Block,
  ConversionNote,
  DegradeReason,
  DocModel,
  FontInfo,
  ImageBlock,
  ImagePlacement,
  Line,
  PageFacts,
  ParaBlock,
  Pt,
  RuleSeg,
  Section,
  Span,
  TableBlock,
  WordOptions,
} from '../types';
import { blocksFromGeometry, blocksFromStruct, type MeasuredPara } from './blocks';
import { findColumns, type ColumnBand } from './columns';
import { buildLines } from './lines';
import { deriveMargins, detectRunning, noRunning, type RunningContent } from './running';
import { components } from './rules';
import { scoreGrid, tablesFromRules, tablesFromStruct, type GridScore } from './tables';

/** What layout/blocks.ts needs that PageFacts does not carry. */
export interface LayoutContext {
  pageIndex: number;
  pageNumber: number;
  fonts: ReadonlyMap<string, FontInfo>;
  options: WordOptions;
  body: DocModel['body'];
  bodySize: Pt;
  columns: readonly ColumnBand[];
  flattenColumns: boolean;
  margins: Section['margins'];
  notes: ConversionNote[];
}

/** §4.9: slack at the foot of a page this deep is an authored break, not reflow. */
const BREAK_LEADINGS = 3;
const GUTTER_AGREE: Pt = 3;
const COLUMN_WIDTH_TOL = 0.05;
const COLUMN_COVER = 0.7;
/** A band crossing the gutter lower than this is a pull-quote, not a masthead. */
const MASTHEAD_ZONE = 0.25;
/** How far a carried-over column band may drift before it is a new section. */
const CARRY_TOL: Pt = 6;
const SIZE_TOL: Pt = 0.6;
const FALLBACK_SIZE: Pt = 11;
const FALLBACK_FAMILY = 'Calibri';
const DEFAULT_LEADING = 1.15;
/** §4.11 — Hebrew, Arabic, Syriac, Thaana, NKo and the presentation forms. */
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

const isInk = (span: Span): boolean => span.text.trim().length > 0;
const isBody = (facts: PageFacts): boolean =>
  facts.cls === 'text' || facts.cls === 'searchableScan';

/* ---------- per page ---------- */

interface Prepared {
  facts: PageFacts;
  spans: Span[];
  lines: Line[];
  bands: ColumnBand[];
  columns: Section['columns'];
  flattened: boolean;
  masthead: Span[] | null;
}

type Plan = Pick<Prepared, 'bands' | 'columns' | 'flattened' | 'masthead'>;

const overlaps = (span: Span, band: ColumnBand): boolean =>
  span.x < band.x1 && span.x + span.w > band.x0;

function columnPlan(facts: PageFacts, spans: readonly Span[], options: WordOptions): Plan {
  // No bands means "measure the content extent yourself" to layout/blocks.ts.
  const flat: Plan = { bands: [], columns: null, flattened: false, masthead: null };
  if (!isBody(facts)) return flat;

  const ink = spans.filter((span) => isInk(span) && !span.artifact);
  const bands = findColumns(ink, facts.width, facts.bodySize);
  if (bands.length < 2) return { ...flat, bands };
  if (options.flattenColumns === true) return { ...flat, flattened: true };

  const widths = bands.map((band) => band.x1 - band.x0);
  const gutters = bands.slice(1).map((band, index) => band.x0 - bands[index].x1);
  const widest = Math.max(...widths);
  const even =
    Math.max(...gutters) - Math.min(...gutters) <= GUTTER_AGREE &&
    widest - Math.min(...widths) <= COLUMN_WIDTH_TOL * widest;

  const straddle = ink.filter((span) => bands.filter((band) => overlaps(span, band)).length >= 2);
  const top = Math.min(...ink.map((span) => span.y));
  const bottom = Math.max(...ink.map((span) => span.y));
  const cut = straddle.length > 0 ? Math.max(...straddle.map((span) => span.y)) : top;
  const region = bottom - cut;
  const covered =
    region > 0 &&
    bands.every((band) => {
      const ys = ink.filter((span) => span.y > cut && overlaps(span, band)).map((span) => span.y);
      return ys.length > 0 && Math.max(...ys) - Math.min(...ys) >= COLUMN_COVER * region;
    });
  const late = straddle.some((span) => span.y > MASTHEAD_ZONE * facts.height);

  if (!even || !covered || late) return { ...flat, flattened: true };

  const slack = LINE_TOL(facts.bodySize);
  return {
    bands,
    columns: { count: bands.length, spacePt: gutters.reduce((a, b) => a + b, 0) / gutters.length },
    flattened: false,
    masthead: straddle.length > 0 ? spans.filter((span) => span.y <= cut + slack) : null,
  };
}

/** A page whose single band matches one column of the page before it is still in that section. */
function carryColumns(prepared: readonly Prepared[]): void {
  for (let i = 1; i < prepared.length; i++) {
    const page = prepared[i];
    const previous = prepared[i - 1];
    if (page.columns || page.flattened || !previous.columns || page.bands.length !== 1) continue;
    if (page.facts.width !== previous.facts.width) continue;
    const band = page.bands[0];
    const fits = previous.bands.some(
      (other) => band.x0 >= other.x0 - CARRY_TOL && band.x1 <= other.x1 + CARRY_TOL,
    );
    if (!fits) continue;
    page.bands = [...previous.bands];
    page.columns = previous.columns;
  }
}

function prepare(facts: PageFacts, running: RunningContent, options: WordOptions): Prepared {
  const spans = facts.spans.filter((span) => !running.consumed.has(span));
  const lines = buildLines(
    spans.filter((span) => !span.artifact),
    facts.bodySize,
  );
  return { facts, spans, lines, ...columnPlan(facts, spans, options) };
}

/* ---------- document metrics ---------- */

function modal(weights: ReadonlyMap<number, number>): Pt {
  let best = 0;
  let top = -1;
  for (const [size, weight] of weights) {
    if (weight > top || (weight === top && size > best)) {
      best = size;
      top = weight;
    }
  }
  return best;
}

function bodyMetrics(
  prepared: readonly Prepared[],
  fonts: ReadonlyMap<string, FontInfo>,
): DocModel['body'] {
  const sizes = new Map<number, number>();
  const families = new Map<string, number>();
  for (const page of prepared) {
    if (!isBody(page.facts)) continue;
    for (const span of page.spans) {
      const chars = span.text.trim().length;
      if (chars === 0 || span.artifact) continue;
      const key = Math.round(span.size * 100) / 100;
      sizes.set(key, (sizes.get(key) ?? 0) + chars);
    }
  }
  const sizePt = modal(sizes) || FALLBACK_SIZE;

  for (const page of prepared) {
    if (!isBody(page.facts)) continue;
    for (const span of page.spans) {
      const chars = span.text.trim().length;
      if (chars === 0 || span.artifact || Math.abs(span.size - sizePt) > SIZE_TOL) continue;
      const font = fonts.get(span.fontId);
      if (!font || font.symbolic) continue;
      families.set(font.family, (families.get(font.family) ?? 0) + chars);
    }
  }
  let family = FALLBACK_FAMILY;
  let top = 0;
  for (const [name, chars] of families) {
    if (chars > top) {
      top = chars;
      family = name;
    }
  }

  const gaps: Pt[] = [];
  for (const page of prepared) {
    for (let i = 1; i < page.lines.length; i++) {
      const a = page.lines[i - 1];
      const b = page.lines[i];
      if (Math.abs(a.size - sizePt) > SIZE_TOL || Math.abs(b.size - sizePt) > SIZE_TOL) continue;
      const gap = b.y - a.y;
      if (gap > 0.5 * sizePt && gap < 3 * sizePt) gaps.push(gap);
    }
  }
  gaps.sort((a, b) => a - b);
  const leadingPt = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : DEFAULT_LEADING * sizePt;
  return { family, sizePt, leadingPt };
}

/* ---------- sections ---------- */

interface Segment {
  page: Prepared;
  spans: Span[];
  columns: Section['columns'];
  bands: readonly ColumnBand[];
  /** A page's pictures follow its last segment, wherever that segment lands. */
  last: boolean;
}

function segmentsOf(page: Prepared, exact: boolean): Segment[] {
  if (!exact && page.masthead && page.columns) {
    const above = new Set(page.masthead);
    return [
      { page, spans: page.masthead, columns: null, bands: [], last: false },
      {
        page,
        spans: page.spans.filter((span) => !above.has(span)),
        columns: page.columns,
        bands: page.bands,
        last: true,
      },
    ];
  }
  return [
    {
      page,
      spans: page.spans,
      columns: exact ? null : page.columns,
      bands: exact ? [] : page.bands,
      last: true,
    },
  ];
}

const columnKey = (columns: Section['columns']): string =>
  columns ? `${columns.count}:${Math.round(columns.spacePt)}` : '1';

function groupSections(segments: readonly Segment[], exact: boolean): Segment[][] {
  const groups: Segment[][] = [];
  for (const segment of segments) {
    const last = groups[groups.length - 1];
    const previous = last?.[last.length - 1];
    const same =
      !exact &&
      previous !== undefined &&
      previous.page.facts.width === segment.page.facts.width &&
      previous.page.facts.height === segment.page.facts.height &&
      columnKey(previous.columns) === columnKey(segment.columns);
    if (same && last) last.push(segment);
    else groups.push([segment]);
  }
  return groups;
}

function realBreak(page: Prepared, margins: Section['margins'], leading: Pt): boolean {
  const last = page.lines[page.lines.length - 1];
  const slack = page.facts.height - margins.top - (last?.y ?? 0);
  return slack > BREAK_LEADINGS * Math.max(1, leading);
}

/* ---------- blocks ---------- */

function para(text: string, ctx: LayoutContext, align: ParaBlock['align']): ParaBlock {
  return {
    kind: 'paragraph',
    runs: text
      ? [
          {
            text,
            fontId: '',
            size: ctx.body.sizePt,
            bold: false,
            italic: false,
            colour: '000000',
            vertical: 'baseline',
            href: null,
          },
        ]
      : [],
    align,
    indentLeftPt: 0,
    indentRightPt: 0,
    firstLinePt: 0,
    hangingPt: 0,
    spaceBeforePt: 0,
    leadingPt: ctx.body.leadingPt,
    tabStops: [],
    source: 'geometry',
  };
}

function pagePicture(facts: PageFacts, ctx: LayoutContext): Block | null {
  const raster = facts.raster;
  if (!raster) return null;
  const width = Math.max(1, facts.width - ctx.margins.left - ctx.margins.right);
  const height = Math.max(1, facts.height - ctx.margins.top - ctx.margins.bottom);
  const scale = Math.min(1, width / facts.width, height / facts.height);
  const placement: ImagePlacement = {
    objId: null,
    ref: null,
    kind: 'xobject',
    rect: { x: 0, y: 0, w: facts.width, h: facts.height },
    srcW: raster.w,
    srcH: raster.h,
    rotationDeg: 0,
  };
  return {
    kind: 'image',
    placement,
    data: raster.bytes,
    type: raster.type,
    widthPt: facts.width * scale,
    heightPt: facts.height * scale,
    align: 'center',
    alt: `Page ${facts.pageNumber} of the original PDF`,
  };
}

/* ---------- tables: blocks.ts skips them, so they are spliced back here ---------- */

/** §4.6b, restated because tables.ts keeps its own copy private. */
function insideGrid(grid: GridScore, x: Pt, y: Pt): boolean {
  return (
    x + 2 >= grid.xs[0] - SEG_TOL &&
    x + 2 <= grid.xs[grid.cols] + SEG_TOL &&
    y >= grid.ys[0] - SEG_TOL &&
    y <= grid.ys[grid.rows] + SEG_TOL
  );
}

function tableGrids(rules: readonly RuleSeg[], lines: readonly Line[]): GridScore[] {
  const out: GridScore[] = [];
  for (const component of components(rules)) {
    const grid = scoreGrid(component);
    if (!grid || grid.cols < 2 || grid.rows < 2 || grid.closed < GRID_CLOSED_MIN) continue;
    if (!lines.some((line) => insideGrid(grid, line.x0, line.y))) continue;
    out.push(grid);
  }
  return out;
}

/**
 * tables.ts measures the grid but leaves every cell empty — only here are the page's own spans to
 * hand, so this is where a cell gets its paragraphs. Without it a table arrives in Word as a
 * correct but blank grid.
 */
function cellBlocks(
  spans: readonly Span[],
  scoped: PageFacts,
  ctx: LayoutContext,
): ParaBlock[] {
  if (spans.length === 0) return [];
  const inner: LayoutContext = { ...ctx, columns: [], flattenColumns: true };
  const out: ParaBlock[] = [];
  for (const block of blocksFromGeometry({ ...scoped, spans: [...spans] }, inner)) {
    if (block.kind === 'table' || block.kind === 'image' || block.kind === 'pageBreak') continue;
    // A cell is no place for a heading style; the run's own weight already shows it.
    out.push(block.kind === 'heading' ? { ...block, kind: 'paragraph', level: undefined } : block);
  }
  return out;
}

function fillStructCells(
  table: TableBlock,
  tableIndex: number,
  scoped: PageFacts,
  ctx: LayoutContext,
): void {
  const byCell = new Map<string, Span[]>();
  for (const span of scoped.spans) {
    const at = span.mcid === null ? undefined : scoped.struct.blockOf.get(span.mcid);
    const block = at === undefined ? undefined : scoped.struct.blocks[at];
    if (!block || block.tableIndex !== tableIndex || block.row === null || block.col === null) {
      continue;
    }
    const key = `${block.row}:${block.col}`;
    const bucket = byCell.get(key);
    if (bucket) bucket.push(span);
    else byCell.set(key, [span]);
  }

  for (const row of table.rows) {
    // tables.ts keys a cell by its position in the row, which is the tagged column.
    row.cells.forEach((cell, i) => {
      cell.blocks = cellBlocks(byCell.get(`${cell.row}:${i}`) ?? [], scoped, ctx);
    });
  }
}

function fillRuledCells(
  table: TableBlock,
  grid: GridScore,
  scoped: PageFacts,
  ctx: LayoutContext,
): void {
  if (table.rows.length !== grid.rows) return;
  table.rows.forEach((row, r) => {
    for (const cell of row.cells) {
      const x0 = grid.xs[Math.min(cell.col, grid.cols)];
      const x1 = grid.xs[Math.min(cell.col + cell.colSpan, grid.cols)];
      const y1 = grid.ys[Math.min(r + cell.rowSpan, grid.rows)];
      const inside = scoped.spans.filter((span) => {
        const mid = span.x + span.w / 2;
        return (
          mid >= x0 - SEG_TOL &&
          mid <= x1 + SEG_TOL &&
          span.y > grid.ys[r] &&
          span.y <= y1 + SEG_TOL
        );
      });
      cell.blocks = cellBlocks(inside, scoped, ctx);
    }
  });
}

/** A picture belongs where the page draws it; appended, a dense page pushes it onto the next one. */
function spliceImages(blocks: readonly Block[], images: readonly ImageBlock[]): Block[] {
  if (images.length === 0) return [...blocks];
  const sorted = [...images].sort((a, b) => a.placement.rect.y - b.placement.rect.y);
  const out: Block[] = [];
  let next = 0;

  for (const block of blocks) {
    const top = 'metrics' in block ? (block as MeasuredPara).metrics.topPt : null;
    while (next < sorted.length && top !== null && top >= bottomOf(sorted[next])) {
      out.push(sorted[next++]);
    }
    out.push(block);
  }
  while (next < sorted.length) out.push(sorted[next++]);
  return out;
}

const bottomOf = (image: ImageBlock): Pt => image.placement.rect.y + image.placement.rect.h;

function structIndexOf(block: Block): number {
  if (!('metrics' in block)) return Number.POSITIVE_INFINITY;
  const index = (block as MeasuredPara).metrics.structIndex;
  return index >= 0 ? index : Number.POSITIVE_INFINITY;
}

/** A lone cell with neither text nor a drawn box is a stray grid, not a construct on the page. */
function strayTable(table: TableBlock): boolean {
  if (table.ruled || table.rows.length !== 1) return false;
  return table.rows[0].cells.every((cell) => cell.blocks.length === 0);
}

function structBlocks(scoped: PageFacts, ctx: LayoutContext): Block[] {
  const paragraphs = blocksFromStruct(scoped, ctx);
  const tables = tablesFromStruct(scoped);
  if (tables.length === 0) return paragraphs;

  const anchored = tables
    .map((table, t) => {
      fillStructCells(table, t, scoped, ctx);
      const owned = scoped.struct.blocks.filter((block) => block.tableIndex === t);
      const at = owned.length > 0 ? Math.min(...owned.map((block) => block.index)) : Infinity;
      return { table, at };
    })
    .filter((entry) => !strayTable(entry.table))
    .sort((a, b) => a.at - b.at);

  const out: Block[] = [];
  let next = 0;
  for (const block of paragraphs) {
    const at = structIndexOf(block);
    while (next < anchored.length && anchored[next].at <= at) out.push(anchored[next++].table);
    out.push(block);
  }
  while (next < anchored.length) out.push(anchored[next++].table);
  return out;
}

function geometryBlocks(scoped: PageFacts, ctx: LayoutContext): Block[] {
  const lines = buildLines(scoped.spans, scoped.bodySize);
  const grids = tableGrids(scoped.rules, lines);
  const tables = tablesFromRules(scoped.rules, lines, scoped.fills);
  // The two walks share a filter, so a length mismatch means the pairing is unsafe.
  if (grids.length === 0 || grids.length !== tables.length) return blocksFromGeometry(scoped, ctx);

  const ordered = grids
    .map((grid, i) => ({ grid, table: tables[i] }))
    .sort((a, b) => a.grid.ys[0] - b.grid.ys[0]);
  const free = scoped.spans.filter(
    (span) => !grids.some((grid) => insideGrid(grid, span.x, span.y)),
  );

  const out: Block[] = [];
  let top = -Infinity;
  for (const entry of ordered) {
    const band = free.filter((span) => span.y > top && span.y < entry.grid.ys[0]);
    if (band.length > 0) out.push(...blocksFromGeometry({ ...scoped, spans: band }, ctx));
    fillRuledCells(entry.table, entry.grid, scoped, ctx);
    out.push(entry.table);
    top = Math.max(top, entry.grid.ys[entry.grid.rows]);
  }
  const tail = free.filter((span) => span.y > top);
  if (tail.length > 0) out.push(...blocksFromGeometry({ ...scoped, spans: tail }, ctx));
  return out;
}

function segmentBlocks(segment: Segment, ctx: LayoutContext, untagged: Set<number>): Block[] {
  const { facts } = segment.page;
  if (!isBody(facts)) {
    if (facts.cls === 'blank') return [para('', ctx, 'left')];
    const wanted = ctx.options.imagesForScannedPages !== false;
    const picture = wanted ? pagePicture(facts, ctx) : null;
    if (picture) return [picture];
    return [para(placeholderLine(facts.pageNumber, facts.degradeReason), ctx, 'center')];
  }

  const scoped: PageFacts = { ...facts, spans: segment.spans };
  if (facts.struct.present && structCovers(facts.struct, segment.spans)) {
    return structBlocks(scoped, ctx);
  }
  untagged.add(facts.pageNumber);
  return geometryBlocks(scoped, ctx);
}

/* ---------- notes ---------- */

interface Tally {
  scanned: number[];
  /** Scanned pages no picture was made of, which come out blank. */
  blank: number[];
  ocr: number[];
  symbolic: number[];
  rotated: number[];
  flattened: number[];
  rtl: number[];
  vectorPages: number[];
  vectorCount: number;
  raster: Map<string, { reason: DegradeReason; pictured: boolean; pages: number[] }>;
}

function tallyPages(pages: readonly PageFacts[], options: WordOptions): Tally {
  const wanted = options.imagesForScannedPages !== false;
  const tally: Tally = {
    scanned: [],
    blank: [],
    ocr: [],
    symbolic: [],
    rotated: [],
    flattened: [],
    rtl: [],
    vectorPages: [],
    vectorCount: 0,
    raster: new Map(),
  };
  for (const facts of pages) {
    const n = facts.pageNumber;
    // A note may only claim a picture went in when one actually did.
    const pictured = wanted && facts.raster !== undefined;
    if (facts.cls === 'imageOnly') (pictured ? tally.scanned : tally.blank).push(n);
    if (facts.cls === 'searchableScan') tally.ocr.push(n);
    if (facts.cls === 'rasterFallback') {
      const reason = facts.degradeReason ?? degradeReasonFor(facts, facts.cls) ?? 'vector-art';
      const key = `${reason}:${pictured}`;
      const entry = tally.raster.get(key) ?? { reason, pictured, pages: [] };
      entry.pages.push(n);
      tally.raster.set(key, entry);
    } else {
      if (facts.rotatedSpanCount > 0) tally.rotated.push(n);
      if (facts.artPathCount > 0) {
        tally.vectorPages.push(n);
        tally.vectorCount += facts.artPathCount;
      }
    }
    if (facts.spans.some((span) => span.repaired === 'symbolic-dropped')) tally.symbolic.push(n);
    if (facts.spans.some((span) => RTL_RE.test(span.text))) tally.rtl.push(n);
  }
  return tally;
}

function missingPages(pages: readonly PageFacts[]): number[] {
  if (pages.length === 0) return [];
  const seen = new Set(pages.map((facts) => facts.pageNumber));
  const highest = Math.max(...seen);
  const gaps: number[] = [];
  for (let n = 1; n <= highest; n++) if (!seen.has(n)) gaps.push(n);
  return gaps;
}

function scanBlocks(
  blocks: readonly Block[],
  pageNumber: number,
  tabbed: Set<number>,
  guessed: { pages: Set<number>; count: number },
): void {
  for (const block of blocks) {
    if (block.kind === 'table') {
      if (block.source === 'rules') {
        guessed.pages.add(pageNumber);
        guessed.count += 1;
      }
      for (const row of block.rows) {
        for (const cell of row.cells) scanBlocks(cell.blocks, pageNumber, tabbed, guessed);
      }
    } else if (block.kind !== 'image' && block.kind !== 'pageBreak') {
      if (block.kind !== 'listItem' && block.tabStops.length > 0) tabbed.add(pageNumber);
    }
  }
}

/* ---------- assembly ---------- */

export function buildModel(
  pages: readonly PageFacts[],
  fonts: Map<string, FontInfo>,
  options: WordOptions,
  /** Encoded pictures per page index — only convert.ts can read the image bytes. */
  pictures: ReadonlyMap<number, ImageBlock[]> = new Map(),
): DocModel {
  const exact = options.mode === 'exact';
  const running = exact ? noRunning() : detectRunning(pages, fonts);
  const prepared = pages.map((facts) => prepare(facts, running, options));
  if (!exact) carryColumns(prepared);
  const body = bodyMetrics(prepared, fonts);

  const notes: ConversionNote[] = [];
  const tally = tallyPages(pages, options);
  const untagged = new Set<number>();
  const tabbed = new Set<number>();
  const guessed = { pages: new Set<number>(), count: 0 };
  // Flattening the user asked for is not a caveat about their PDF, so it raises no note.
  const chose = options.flattenColumns === true;
  for (const page of prepared) {
    if (page.flattened && !chose) tally.flattened.push(page.facts.pageNumber);
  }

  const sections: Section[] = [];
  const measured = new Map<string, Section['margins']>();
  for (const group of groupSections(
    prepared.flatMap((page) => segmentsOf(page, exact)),
    exact,
  )) {
    const first = group[0].page.facts;
    // §4.9 measures margins over the whole document, so every page of this size votes.
    const key = `${first.width}x${first.height}`;
    let margins = measured.get(key);
    if (!margins) {
      margins = deriveMargins(
        pages.filter((facts) => facts.width === first.width && facts.height === first.height),
        running,
        fonts,
      );
      measured.set(key, margins);
    }
    const blocks: Block[] = [];
    let previous: Prepared | null = null;

    for (const segment of group) {
      const facts = segment.page.facts;
      if (previous && previous.facts.index !== facts.index && realBreak(previous, margins, body.leadingPt)) {
        blocks.push({ kind: 'pageBreak' });
      }
      const ctx: LayoutContext = {
        pageIndex: facts.index,
        pageNumber: facts.pageNumber,
        fonts,
        options,
        body,
        bodySize: facts.bodySize,
        columns: segment.bands,
        flattenColumns: segment.page.flattened || segment.bands.length === 0,
        margins,
        notes,
      };
      const produced = segmentBlocks(segment, ctx, untagged);
      scanBlocks(produced, facts.pageNumber, tabbed, guessed);
      const drawn = segment.last && isBody(facts) ? (pictures.get(facts.index) ?? []) : [];
      blocks.push(...spliceImages(produced, drawn));
      previous = segment.page;
    }

    sections.push({
      widthPt: first.width,
      heightPt: first.height,
      margins,
      columns: group[0].columns,
      header: running.header,
      footer: running.footer,
      headerHasPageField: running.headerPageField,
      footerHasPageField: running.footerPageField,
      blocks,
      firstPageIndex: first.index,
      lastPageIndex: group[group.length - 1].page.facts.index,
    });
  }

  const failed = missingPages(pages);
  if (failed.length > 0) notes.push({ code: 'pageFailed', pages: failed });
  if (tally.scanned.length > 0) {
    notes.push({ code: 'scannedPages', pages: tally.scanned, pictured: true });
  }
  if (tally.blank.length > 0) {
    notes.push({ code: 'scannedPages', pages: tally.blank, pictured: false });
  }
  for (const entry of tally.raster.values()) {
    notes.push({ code: 'rasterPage', pages: entry.pages, reason: entry.reason, pictured: entry.pictured });
  }
  if (tally.ocr.length > 0) notes.push({ code: 'ocrLayerUsed', pages: tally.ocr });
  if (untagged.size > 0) notes.push({ code: 'untagged', pages: [...untagged] });
  if (tally.flattened.length > 0) notes.push({ code: 'columnsFlattened', pages: tally.flattened });
  if (guessed.count > 0) {
    notes.push({ code: 'tableGuessed', pages: [...guessed.pages], count: guessed.count });
  }
  if (tabbed.size > 0) notes.push({ code: 'tabColumns', pages: [...tabbed] });
  if (tally.rotated.length > 0) notes.push({ code: 'rotatedText', pages: tally.rotated });
  if (tally.symbolic.length > 0) notes.push({ code: 'symbolicDropped', pages: tally.symbolic });
  if (tally.vectorCount > 0) {
    notes.push({ code: 'vectorDropped', pages: tally.vectorPages, count: tally.vectorCount });
  }
  const seenFont = new Set<string>();
  for (const font of fonts.values()) {
    if (!isSubstituted(font) || seenFont.has(font.psName)) continue;
    seenFont.add(font.psName);
    notes.push({ code: 'missingFont', psName: font.psName, family: font.family });
  }
  if (tally.rtl.length > 0) notes.push({ code: 'rtl', pages: tally.rtl });

  return { sections, body, notes };
}
