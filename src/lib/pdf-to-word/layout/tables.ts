import { GRID_CLOSED_MIN, SEG_TOL } from '../constants';
import type {
  FillBox,
  Line,
  PageFacts,
  Pt,
  Rect,
  RuleSeg,
  StructBlock,
  StructTable,
  TableBlock,
  TableCellBlock,
} from '../types';
import { components, dedupeFills } from './rules';

/** §4.6c: gap starts agree within 3 pt over at least 3 consecutive lines. */
const TAB_ALIGN: Pt = 3;
const TAB_RUN_MIN = 3;
/** A text extent sits inside its cell, so grid matching needs more slack than SEG_TOL. */
const CELL_SLACK: Pt = 2;
/** A page-wide wash is a background, not cell shading. */
const SHADE_MAX_COVER = 0.5;
/** Word shades an unshaded cell white; that is not a header signal. */
const WHITE = 'FFFFFF';
/** Only used when a struct table has no text at all to measure. */
const BLANK_COLUMN: Pt = 72;
/** Word's own ceiling, and past it a fine vector lattice would cost more to score than to rasterise. */
const GRID_MAX_COLS = 63;
const GRID_MAX_ROWS = 256;

interface Box {
  x0: Pt;
  y0: Pt;
  x1: Pt;
  y1: Pt;
}

export interface GridScore {
  /** Column boundaries left to right. */
  xs: Pt[];
  /** Row boundaries top to bottom. */
  ys: Pt[];
  rows: number;
  cols: number;
  /** §4.6b: drawn boundary segments over the boundary segments a full grid would have. */
  closed: number;
}

const boxOf = (rect: Rect): Box => ({
  x0: rect.x,
  y0: rect.y,
  x1: rect.x + rect.w,
  y1: rect.y + rect.h,
});

const areaOf = (box: Box): number => Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);

const grow = (a: Box, b: Box): Box => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});

const wraps = (outer: Box, inner: Box, slack: Pt): boolean =>
  outer.x0 <= inner.x0 + slack &&
  outer.y0 <= inner.y0 + slack &&
  outer.x1 >= inner.x1 - slack &&
  outer.y1 >= inner.y1 - slack;

/** Cluster one axis's rules into the distinct grid positions they draw. */
function axisPositions(rules: readonly RuleSeg[], axis: 'h' | 'v'): Pt[] {
  const ats = rules
    .filter((rule) => rule.axis === axis)
    .map((rule) => rule.at)
    .sort((a, b) => a - b);
  const out: Pt[] = [];
  for (let i = 0; i < ats.length; ) {
    let j = i;
    let sum = 0;
    while (j < ats.length && ats[j] - ats[i] <= SEG_TOL) sum += ats[j++];
    out.push(sum / (j - i));
    i = j;
  }
  return out;
}

const onAxis = (rule: RuleSeg, axis: 'h' | 'v', at: Pt): boolean =>
  rule.axis === axis && Math.abs(rule.at - at) <= SEG_TOL;

/** Whole boundary segment drawn — the closed-ratio test. */
const drawn = (rules: readonly RuleSeg[], axis: 'h' | 'v', at: Pt, from: Pt, to: Pt): boolean =>
  rules.some(
    (rule) => onAxis(rule, axis, at) && rule.from <= from + SEG_TOL && rule.to >= to - SEG_TOL,
  );

/** Any ink on the boundary at all — merging cells is the dangerous direction, so it is the test. */
const touched = (rules: readonly RuleSeg[], axis: 'h' | 'v', at: Pt, from: Pt, to: Pt): boolean =>
  rules.some((rule) => onAxis(rule, axis, at) && rule.from < to - SEG_TOL && rule.to > from + SEG_TOL);

/** §4.6b steps 2–3 for one connected component. Null when it draws no grid at all. */
export function scoreGrid(component: readonly RuleSeg[]): GridScore | null {
  const xs = axisPositions(component, 'v');
  const ys = axisPositions(component, 'h');
  if (xs.length < 2 || ys.length < 2) return null;
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  if (cols > GRID_MAX_COLS || rows > GRID_MAX_ROWS) return null;

  let painted = 0;
  for (const y of ys) {
    for (let c = 0; c < cols; c++) if (drawn(component, 'h', y, xs[c], xs[c + 1])) painted++;
  }
  for (const x of xs) {
    for (let r = 0; r < rows; r++) if (drawn(component, 'v', x, ys[r], ys[r + 1])) painted++;
  }

  const total = (rows + 1) * cols + (cols + 1) * rows;
  return { xs, ys, rows, cols, closed: total > 0 ? painted / total : 0 };
}

/** §4.6b: a 1x1 component is a bordered paragraph, not a table. */
export function singleCellBoxes(
  rules: readonly RuleSeg[],
): { rect: Rect; colour: string | null; thicknessPt: Pt }[] {
  const out: { rect: Rect; colour: string | null; thicknessPt: Pt }[] = [];
  for (const component of components(rules)) {
    const grid = scoreGrid(component);
    if (!grid || grid.rows !== 1 || grid.cols !== 1 || grid.closed < GRID_CLOSED_MIN) continue;
    const lead = component.reduce((a, b) => (b.thickness > a.thickness ? b : a));
    out.push({
      rect: {
        x: grid.xs[0],
        y: grid.ys[0],
        w: grid.xs[1] - grid.xs[0],
        h: grid.ys[1] - grid.ys[0],
      },
      colour: lead.colour,
      thicknessPt: lead.thickness,
    });
  }
  return out;
}

function shadeFor(cell: Box, shades: readonly FillBox[], maxArea: number): string | null {
  let best: FillBox | null = null;
  for (const fill of shades) {
    if (!fill.colour || fill.colour.toUpperCase() === WHITE) continue;
    const box = boxOf(fill.rect);
    const area = areaOf(box);
    if (area > maxArea || !wraps(box, cell, CELL_SLACK)) continue;
    if (!best || area < areaOf(boxOf(best.rect))) best = fill;
  }
  return best?.colour ?? null;
}

const shadedHeader = (cells: readonly TableCellBlock[]): number =>
  cells.length > 0 && cells.filter((cell) => cell.shade !== null).length * 2 >= cells.length ? 1 : 0;

export function tablesFromRules(
  rules: readonly RuleSeg[],
  lines: readonly Line[],
  fills: readonly FillBox[],
): TableBlock[] {
  const shades = dedupeFills(fills);
  const out: TableBlock[] = [];
  for (const component of components(rules)) {
    const grid = scoreGrid(component);
    if (!grid || grid.cols < 2 || grid.rows < 2 || grid.closed < GRID_CLOSED_MIN) continue;
    if (!lines.some((line) => insideGrid(grid, line))) continue;
    out.push(ruledTable(grid, component, shades));
  }
  return out;
}

/** §4.6b: a line belongs to the cell containing (x0 + 2, y). */
function insideGrid(grid: GridScore, line: Line): boolean {
  const x = line.x0 + 2;
  return (
    x >= grid.xs[0] - SEG_TOL &&
    x <= grid.xs[grid.cols] + SEG_TOL &&
    line.y >= grid.ys[0] - SEG_TOL &&
    line.y <= grid.ys[grid.rows] + SEG_TOL
  );
}

function ruledTable(
  grid: GridScore,
  component: readonly RuleSeg[],
  shades: readonly FillBox[],
): TableBlock {
  const { xs, ys, rows, cols } = grid;
  const maxArea = 1.8 * Math.max(1, (xs[cols] - xs[0]) * (ys[rows] - ys[0]));
  const taken: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  const out: { cells: TableCellBlock[]; heightPt: Pt }[] = [];

  for (let r = 0; r < rows; r++) {
    const cells: TableCellBlock[] = [];
    for (let c = 0; c < cols; c++) {
      if (taken[r][c]) continue;

      // An undrawn interior boundary is a merge, so only untouched boundaries widen a cell.
      let colSpan = 1;
      while (
        c + colSpan < cols &&
        !taken[r][c + colSpan] &&
        !touched(component, 'v', xs[c + colSpan], ys[r], ys[r + 1])
      )
        colSpan++;

      let rowSpan = 1;
      while (
        r + rowSpan < rows &&
        !taken[r + rowSpan][c] &&
        !touched(component, 'h', ys[r + rowSpan], xs[c], xs[c + colSpan])
      )
        rowSpan++;

      for (let rr = r; rr < r + rowSpan; rr++)
        for (let cc = c; cc < c + colSpan; cc++) taken[rr][cc] = true;

      const cell: Box = { x0: xs[c], y0: ys[r], x1: xs[c + colSpan], y1: ys[r + rowSpan] };
      cells.push({
        row: r,
        col: c,
        rowSpan,
        colSpan,
        blocks: [],
        shade: shadeFor(cell, shades, maxArea),
      });
    }
    out.push({ cells, heightPt: ys[r + 1] - ys[r] });
  }

  return {
    kind: 'table',
    gridPt: xs.slice(),
    rows: out,
    ruled: true,
    headerRows: shadedHeader(out[0].cells),
    source: 'rules',
  };
}

export function tablesFromStruct(facts: PageFacts): TableBlock[] {
  const index = facts.struct;
  if (!index.present || index.tables.length === 0) return [];
  const boxes = blockBoxes(facts);
  const shades = dedupeFills(facts.fills);
  const frames = components(facts.rules)
    .map(frameOf)
    .filter((frame): frame is Frame => frame !== null);
  const maxArea = SHADE_MAX_COVER * Math.max(1, facts.width * facts.height);
  const cells = index.tables.map((_, t) => cellExtents(index.blocks, boxes, t));
  adoptEmptyBoxes(index.tables, cells, frames);
  return index.tables.map((table, t) =>
    structTable(table, cells[t], shades, frames, facts.rules, maxArea),
  );
}

function cellExtents(
  blocks: readonly StructBlock[],
  boxes: ReadonlyMap<number, Box>,
  tableIndex: number,
): Map<string, Box> {
  const cells = new Map<string, Box>();
  for (const block of blocks) {
    if (block.tableIndex !== tableIndex || block.row === null || block.col === null) continue;
    const box = boxes.get(block.index);
    if (!box) continue;
    const key = `${block.row}:${block.col}`;
    const prev = cells.get(key);
    cells.set(key, prev ? grow(prev, box) : box);
  }
  return cells;
}

/** A 1x1 table with no text at all is locatable only by the box drawn between its neighbours. */
function adoptEmptyBoxes(
  tables: readonly StructTable[],
  cells: readonly Map<string, Box>[],
  frames: readonly Frame[],
): void {
  const extents = cells.map(spread);
  for (let t = 0; t < tables.length; t++) {
    if (cells[t].size > 0 || tables[t].rows !== 1 || tables[t].cols !== 1) continue;
    let above = -Infinity;
    let below = Infinity;
    for (let i = t - 1; i >= 0; i--) {
      const seen = extents[i];
      if (seen) {
        above = seen.y1;
        break;
      }
    }
    for (let i = t + 1; i < tables.length; i++) {
      const seen = extents[i];
      if (seen) {
        below = seen.y0;
        break;
      }
    }
    const free = frames.filter(({ box }) => {
      const mid = (box.y0 + box.y1) / 2;
      return mid > above && mid < below && !extents.some((e) => e && wraps(box, e, CELL_SLACK));
    });
    if (free.length === 1) cells[t].set('0:0', free[0].box);
  }
}

function spread(cells: ReadonlyMap<string, Box>): Box | null {
  let out: Box | null = null;
  for (const box of cells.values()) out = out ? grow(out, box) : box;
  return out;
}

function blockBoxes(facts: PageFacts): Map<number, Box> {
  const out = new Map<number, Box>();
  for (const span of facts.spans) {
    if (span.artifact || span.synthetic || span.mcid === null || span.text.trim() === '') continue;
    const block = facts.struct.blockOf.get(span.mcid);
    if (block === undefined) continue;
    const box: Box = {
      x0: span.x,
      y0: span.y - span.size,
      x1: span.x + span.w,
      y1: span.y + 0.25 * span.size,
    };
    const prev = out.get(block);
    out.set(block, prev ? grow(prev, box) : box);
  }
  return out;
}

interface Frame {
  box: Box;
  xs: Pt[];
  ys: Pt[];
}

/** A component that draws a closed box on both axes — the evidence a struct table is ruled. */
function frameOf(component: readonly RuleSeg[]): Frame | null {
  const xs = axisPositions(component, 'v');
  const ys = axisPositions(component, 'h');
  if (xs.length < 2 || ys.length < 2) return null;
  return { box: { x0: xs[0], y0: ys[0], x1: xs[xs.length - 1], y1: ys[ys.length - 1] }, xs, ys };
}

function structTable(
  table: StructTable,
  cells: ReadonlyMap<string, Box>,
  shades: readonly FillBox[],
  frames: readonly Frame[],
  rules: readonly RuleSeg[],
  maxArea: number,
): TableBlock {
  const rows = table.rows;
  const cols = Math.max(1, table.cols);
  const count = table.cellBlocks.map((row) => row.length);
  const extent = spread(cells);
  let bands = rowBands(cells, rows, count);
  let gridPt = columnGrid(cells, rows, cols, rules, bands[0], bands[rows]);
  let span: Box = { x0: gridPt[0], y0: bands[0], x1: gridPt[cols], y1: bands[rows] };

  // §4.6a measures the grid off the text, which sits a cell margin inside the ink; the ink is the true boundary.
  const frame = frameFor(frames, extent ?? span, span);
  if (frame) {
    if (frame.xs.length === cols + 1) gridPt = frame.xs.slice();
    if (frame.ys.length === rows + 1) bands = frame.ys.slice();
    span = { x0: gridPt[0], y0: bands[0], x1: gridPt[cols], y1: bands[rows] };
  }
  const carried = rowSpans(cells, count, bands, rows, cols);

  const out: { cells: TableCellBlock[]; heightPt: Pt }[] = [];
  for (let r = 0; r < rows; r++) {
    const taken = carried.covered[r];
    const n = Math.min(count[r], cols - taken);
    const row: TableCellBlock[] = [];
    const deficit = Math.max(0, cols - taken - n);
    const wide = deficit > 0 ? deficitCell(cells, r, n, gridPt, deficit) : -1;

    let cursor = 0;
    for (let i = 0; i < n; i++) {
      const colSpan = 1 + (i === wide ? deficit : 0);
      // The grid runs through the text, a cell margin inside the drawn box, so probe the text itself.
      const probe = cells.get(`${r}:${i}`) ?? {
        x0: gridPt[cursor],
        y0: bands[r],
        x1: gridPt[cursor + colSpan],
        y1: bands[r + 1],
      };
      row.push({
        row: r,
        col: cursor,
        rowSpan: i === n - 1 ? (carried.span.get(r) ?? 1) : 1,
        colSpan,
        blocks: [],
        shade: shadeFor(probe, shades, maxArea),
      });
      cursor += colSpan;
    }
    out.push({ cells: row, heightPt: Math.max(1, bands[r + 1] - bands[r]) });
  }

  return {
    kind: 'table',
    gridPt,
    rows: out,
    ruled: frame !== null,
    headerRows: out.length > 0 ? shadedHeader(out[0].cells) : 0,
    source: 'struct',
  };
}

/** The smallest box around the whole table, or failing that around one of its columns. */
function frameFor(frames: readonly Frame[], extent: Box, span: Box): Frame | null {
  let around: Frame | null = null;
  let inside: Frame | null = null;
  for (const frame of frames) {
    const smaller = (best: Frame | null): boolean => !best || areaOf(frame.box) < areaOf(best.box);
    if (wraps(frame.box, extent, CELL_SLACK)) {
      if (smaller(around)) around = frame;
    } else if (spansColumn(frame.box, span) && smaller(inside)) inside = frame;
  }
  return around ?? inside;
}

/** forms-like boxes only the field, so the ink covers the table's band but just one of its columns. */
const spansColumn = (frame: Box, span: Box): boolean =>
  frame.y0 <= span.y0 + CELL_SLACK &&
  frame.y1 >= span.y1 - CELL_SLACK &&
  frame.x0 >= span.x0 - CELL_SLACK &&
  frame.x1 <= span.x1 + CELL_SLACK;

/** §4.6a: aggregate per column index, never per row — a column's cells do not share an x0. */
function columnGrid(
  cells: ReadonlyMap<string, Box>,
  rows: number,
  cols: number,
  rules: readonly RuleSeg[],
  top: Pt,
  bottom: Pt,
): Pt[] {
  const left: (Pt | null)[] = [];
  let right = -Infinity;
  for (let c = 0; c < cols; c++) {
    let min = Infinity;
    for (let r = 0; r < rows; r++) {
      const box = cells.get(`${r}:${c}`);
      if (box) min = Math.min(min, box.x0);
    }
    left.push(Number.isFinite(min) ? min : null);
  }
  for (const box of cells.values()) right = Math.max(right, box.x1);

  const edges = rules
    .filter((rule) => rule.axis === 'v' && rule.from < bottom + SEG_TOL && rule.to > top - SEG_TOL)
    .map((rule) => rule.at)
    .sort((a, b) => a - b);

  const grid: Pt[] = [];
  for (let c = 0; c < cols; c++) {
    const measured = left[c];
    if (measured !== null) {
      grid.push(c === 0 ? measured : Math.max(measured, grid[c - 1] + 1));
      continue;
    }
    const prev = c === 0 ? -Infinity : grid[c - 1] + 1;
    const next = left.slice(c + 1).find((x): x is Pt => x !== null) ?? Infinity;
    const edge = edges.find((at) => at > prev && at < next - 1);
    grid.push(edge ?? (c === 0 ? 0 : grid[c - 1] + BLANK_COLUMN));
  }

  let end = Number.isFinite(right) ? right : -Infinity;
  if (end <= grid[cols - 1] + 1) {
    end = [...edges].reverse().find((at) => at > grid[cols - 1] + 1) ?? grid[cols - 1] + BLANK_COLUMN;
  }
  grid.push(Math.max(end, grid[cols - 1] + 1));
  return grid;
}

/** Row boundaries, midway between one row's text and the next so a band owns its whole row. */
function rowBands(cells: ReadonlyMap<string, Box>, rows: number, count: readonly number[]): Pt[] {
  const tops: Pt[] = [];
  const bottoms: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    let top = Infinity;
    let bottom = -Infinity;
    for (let c = 0; c < count[r]; c++) {
      const box = cells.get(`${r}:${c}`);
      if (!box) continue;
      top = Math.min(top, box.y0);
      bottom = Math.max(bottom, box.y1);
    }
    tops.push(top);
    bottoms.push(bottom);
  }

  const bands: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    const top = Number.isFinite(tops[r]) ? tops[r] : bands[r - 1] ?? 0;
    // Never start a band below its own text: a vertically merged cell above would push it there.
    const at = Math.min(top, midway(bottoms[r - 1], top));
    bands.push(r === 0 ? top : Math.max(bands[r - 1] + 1, at));
  }
  const last = Number.isFinite(bottoms[rows - 1]) ? bottoms[rows - 1] : (bands[rows - 1] ?? 0) + 12;
  bands.push(Math.max(last, (bands[rows - 1] ?? 0) + 1));
  return bands;
}

const midway = (bottom: Pt, top: Pt): Pt =>
  Number.isFinite(bottom) && Number.isFinite(top) ? (bottom + top) / 2 : top;

/** V7 gives no /RowSpan, so a cell merges down only when its own text fills the next band. */
function rowSpans(
  cells: ReadonlyMap<string, Box>,
  count: readonly number[],
  bands: readonly Pt[],
  rows: number,
  cols: number,
): { span: Map<number, number>; covered: number[] } {
  const span = new Map<number, number>();
  const covered = new Array<number>(rows).fill(0);
  for (let r = 0; r + 1 < rows; r++) {
    if (covered[r] > 0) continue;
    const last = cells.get(`${r}:${count[r] - 1}`);
    if (!last) continue;
    let k = 1;
    while (
      r + k < rows &&
      covered[r + k] === 0 &&
      count[r + k] < cols &&
      last.y0 <= bands[r + k] + CELL_SLACK &&
      last.y1 >= bands[r + k + 1] - CELL_SLACK
    )
      k++;
    if (k === 1) continue;
    const width = Math.max(1, cols - (count[r] - 1));
    span.set(r, k);
    for (let j = 1; j < k; j++) covered[r + j] = Math.min(width, cols - count[r + j]);
  }
  return { span, covered };
}

/** Which cell of a short row carries the missing columns; §4.6a puts them on the last cell. */
function deficitCell(
  cells: ReadonlyMap<string, Box>,
  row: number,
  n: number,
  gridPt: readonly Pt[],
  deficit: number,
): number {
  const straddlers: number[] = [];
  for (let i = 0; i < n; i++) {
    const box = cells.get(`${row}:${i}`);
    if (!box) continue;
    let crossed = 0;
    for (let c = 1; c < gridPt.length - 1; c++) {
      if (gridPt[c] > box.x0 + CELL_SLACK && gridPt[c] < box.x1 - CELL_SLACK) crossed++;
    }
    if (crossed >= deficit) straddlers.push(i);
  }
  return straddlers.length === 1 ? straddlers[0] : n - 1;
}

interface TabRun {
  lines: Line[];
  columns: Pt[][];
}

/** Page-absolute positions: the emitter subtracts the column left, since a <w:tabs> stop is relative. */
export function tabColumns(
  lines: readonly Line[],
  em: Pt,
): { type: 'left' | 'right'; posPt: Pt }[] | null {
  // The run decides whether this is a tab grid; the lines' own fragments decide where the stops go.
  const found = longestTabRun(lines);
  const run = blockRun(found ? found.lines : lines) ?? found;
  if (!run) return null;

  const right = Math.max(...run.lines.map((line) => line.x1));
  const edge = em > 0 ? 0.5 * em : 0;
  // resume's job/date lines keep a constant x1 while x0 wanders, which is a right stop.
  const flush = run.lines.every((line) => right - line.x1 <= edge);

  const out: { type: 'left' | 'right'; posPt: Pt }[] = [];
  for (let i = 0; i < run.columns.length; i++) {
    const at = median(run.columns[i]);
    const agrees = run.columns[i].every((stop) => Math.abs(stop - at) <= TAB_ALIGN);
    // The right stop is for a column whose starts wander under a fixed right edge.
    if (i === run.columns.length - 1 && flush && (!agrees || run.lines.length === 1)) {
      out.push({ type: 'right', posPt: right });
      continue;
    }
    // A ragged left edge is not a column, and a left stop would move the text.
    if (!agrees) return null;
    out.push({ type: 'left', posPt: at });
  }
  return out.length > 0 ? out : null;
}

/** A block too short for §4.6c's run still needs its stops, or Word's default grid mangles it. */
function blockRun(lines: readonly Line[]): TabRun | null {
  if (lines.length === 0) return null;
  const stops = lines.map((line) => line.fragments.slice(1).map((fragment) => fragment.x0));
  if (stops.some((row) => row.length !== stops[0].length || row.length === 0)) return null;
  return {
    lines: [...lines],
    columns: stops[0].map((_, i) => stops.map((row) => row[i])),
  };
}

function longestTabRun(lines: readonly Line[]): TabRun | null {
  let best: TabRun | null = null;
  let current: TabRun | null = null;

  const keep = (): void => {
    if (!current || current.lines.length < TAB_RUN_MIN) return;
    if (!best || current.lines.length > best.lines.length) best = current;
  };

  for (const line of lines) {
    const stops = line.fragments.slice(1).map((fragment) => fragment.x0);
    if (stops.length === 0) {
      keep();
      current = null;
      continue;
    }
    if (current) {
      const merged: Pt[][] = [];
      for (const column of current.columns) {
        const at = median(column);
        const hit = stops.find((stop) => Math.abs(stop - at) <= TAB_ALIGN);
        if (hit !== undefined) merged.push([...column, hit]);
      }
      if (merged.length > 0) {
        current = { lines: [...current.lines, line], columns: merged };
        continue;
      }
      keep();
    }
    current = { lines: [line], columns: stops.map((stop) => [stop]) };
  }
  keep();
  return best;
}

function median(values: readonly Pt[]): Pt {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
