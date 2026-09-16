import { GRID_CLOSED_MIN, SEG_TOL } from '@/lib/pdf-to-word/constants';
import { scoreGrid, type GridScore } from '@/lib/pdf-to-word/layout/tables';
import type { Pt, RuleSeg, Span } from '@/lib/pdf-to-word/types';
import { RULE_JOIN_GAP, RULE_TOUCH_TOL } from '../constants';
import type { PageRead } from '../extract/read';
import type { CellRow } from '../rows';
import type { SheetNote } from '../types';
import type { DetectedTable } from './tables';
import { cellText } from './text';

const isInk = (span: Span): boolean =>
  !span.synthetic && !span.artifact && span.text.trim().length > 0;

/**
 * Union collinear segments across the producer's own per-cell gap.
 *
 * Word writes one border rectangle per cell and leaves 3.4–3.5 pt between them, which mergeCollinear
 * (1.2 pt) never closes — so a 24-row table stays 168 separate verticals and scores no grid at all.
 */
export function joinRules(rules: readonly RuleSeg[], gap: Pt): RuleSeg[] {
  const out: RuleSeg[] = [];
  for (const axis of ['h', 'v'] as const) {
    const mine = rules
      .filter((rule) => rule.axis === axis)
      .sort((a, b) => a.at - b.at || a.from - b.from);
    let run: RuleSeg | null = null;
    for (const rule of mine) {
      if (run && Math.abs(rule.at - run.at) <= SEG_TOL && rule.from <= run.to + gap) {
        run.to = Math.max(run.to, rule.to);
        run.thickness = Math.max(run.thickness, rule.thickness);
        continue;
      }
      if (run) out.push(run);
      run = { ...rule };
    }
    if (run) out.push(run);
  }
  return out;
}

/** Connectivity at a wider tolerance than SEG_TOL: Word's top border clears the first vertical. */
function tolerantComponents(rules: readonly RuleSeg[], touchTol: Pt): RuleSeg[][] {
  const parent = rules.map((_, i) => i);
  const find = (start: number): number => {
    let root = start;
    while (parent[root] !== root) root = parent[root];
    return root;
  };
  const crosses = (rule: RuleSeg, at: Pt): boolean =>
    at >= rule.from - touchTol && at <= rule.to + touchTol;

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      if (rules[i].axis === rules[j].axis) continue;
      if (!crosses(rules[i], rules[j].at) || !crosses(rules[j], rules[i].at)) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[b] = a;
    }
  }

  const groups = new Map<number, RuleSeg[]>();
  for (let i = 0; i < rules.length; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(rules[i]);
    else groups.set(root, [rules[i]]);
  }
  return [...groups.values()];
}

export interface Grid extends GridScore {
  rulesOf: RuleSeg[];
}

/** Every grid the page's rules draw. Scoring stays on the unpadded segments. */
export function gridsOf(rules: readonly RuleSeg[], touchTol: Pt): Grid[] {
  const out: Grid[] = [];
  for (const component of tolerantComponents(rules, touchTol)) {
    const score = scoreGrid(component);
    if (score && score.rows >= 2 && score.cols >= 2 && score.closed >= GRID_CLOSED_MIN) {
      out.push({ ...score, rulesOf: component });
    }
  }
  return out.sort((a, b) => a.ys[0] - b.ys[0] || a.xs[0] - b.xs[0]);
}

const slotOf = (edges: readonly Pt[], at: Pt, slack: Pt): number => {
  for (let i = 0; i + 1 < edges.length; i++) {
    if (at >= edges[i] - slack && at <= edges[i + 1] + slack) return i;
  }
  return -1;
};

function gridRows(grid: Grid, page: PageRead): { rows: CellRow[]; baselines: number } {
  const cells: string[][] = [];
  const spans: Span[][][] = [];
  for (let r = 0; r < grid.rows; r++) {
    cells.push(new Array<string>(grid.cols).fill(''));
    spans.push(Array.from({ length: grid.cols }, () => [] as Span[]));
  }

  const inside = new Set<Pt>();
  for (const line of page.lines) {
    for (const span of line.spans) {
      if (!isInk(span)) continue;
      const c = slotOf(grid.xs, span.x + span.w / 2, SEG_TOL);
      const r = slotOf(grid.ys, span.y, SEG_TOL);
      if (c < 0 || r < 0) continue;
      spans[r][c].push(span);
      inside.add(line.y);
    }
  }

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) cells[r][c] = cellText(spans[r][c], page.bodySize);
  }

  return {
    rows: cells.map((row) => ({ cells: row, page: page.pageNumber })),
    baselines: inside.size,
  };
}

/** Ruled tables on one page: the joined grid, its cells, and a note if it swallowed a row. */
export function ruledTables(page: PageRead): DetectedTable[] {
  const joined = joinRules(page.rules, RULE_JOIN_GAP(page.bodySize));
  const out: DetectedTable[] = [];

  for (const grid of gridsOf(joined, RULE_TOUCH_TOL)) {
    const { rows, baselines } = gridRows(grid, page);
    if (baselines === 0) continue;
    const notes: SheetNote[] = [];
    if (baselines > grid.rows) {
      notes.push({ code: 'rowsMissing', count: baselines - grid.rows, pages: [page.pageNumber] });
    }
    out.push({
      path: 'ruled',
      key: `ruled-${grid.cols}-${grid.xs.map((x) => Math.round(x)).join(',')}`,
      pages: [page.pageNumber],
      rows,
      profile: null,
      moneyCols: null,
      notes,
      firstPage: page.pageNumber,
    });
  }

  return out;
}
