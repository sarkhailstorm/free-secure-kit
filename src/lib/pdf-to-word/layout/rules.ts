import { RULE_MIN_LEN, RULE_THICK_MAX, SEG_TOL } from '../constants';
import type { FillBox, Pt, Rect, RuleSeg } from '../types';

/** The graphics half of OpScan, declared structurally so this file does not depend on the extractor. */
export interface RuleScan {
  rules: readonly RuleSeg[];
  fills: readonly FillBox[];
}

export type PathShape =
  | { kind: 'rule'; seg: RuleSeg }
  | { kind: 'fill'; box: FillBox }
  /** `degenerate` marks a dot with no content — never count one towards `artPathCount`. */
  | { kind: 'art'; degenerate: boolean };

/** Word's cell margin is 5.4 pt, so its shading twin never sits further in than this. */
const TWIN_INSET_MAX: Pt = 8;
/** LibreOffice strokes arrive with a zero-thickness bbox, so the resolved weight needs a floor. */
const MIN_RULE_THICK: Pt = 0.24;
const EPS: Pt = 0.01;

/** One painted subpath's device-space bbox becomes a rule, a fill or nothing; the thin axis decides. */
export function classifyPath(bbox: Rect, colour: string | null, strokeWidthPt = 0): PathShape {
  const short = Math.min(bbox.w, bbox.h);
  const long = Math.max(bbox.w, bbox.h);
  // <=, not <: a LibreOffice stroke's bbox has exactly w === 0 or h === 0.
  if (short <= RULE_THICK_MAX && long >= RULE_MIN_LEN) {
    const horizontal = bbox.w > bbox.h;
    return {
      kind: 'rule',
      seg: {
        axis: horizontal ? 'h' : 'v',
        at: horizontal ? bbox.y + bbox.h / 2 : bbox.x + bbox.w / 2,
        from: horizontal ? bbox.x : bbox.y,
        to: horizontal ? bbox.x + bbox.w : bbox.y + bbox.h,
        thickness: Math.max(short, strokeWidthPt, MIN_RULE_THICK),
        colour,
      },
    };
  }
  if (short > RULE_THICK_MAX) {
    return { kind: 'fill', box: { rect: { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h }, colour } };
  }
  // Word joins its per-cell border rects with a 0.48 pt corner square that would otherwise trip VECTOR_ART_PATHS.
  return { kind: 'art', degenerate: long <= RULE_THICK_MAX };
}

export function collectRules(scan: RuleScan): { rules: RuleSeg[]; fills: FillBox[] } {
  return { rules: mergeCollinear(scan.rules), fills: dedupeFills(scan.fills) };
}

/** Collapses the per-cell edges Word emits into the whole-table lines LibreOffice strokes. */
export function mergeCollinear(rules: readonly RuleSeg[]): RuleSeg[] {
  const merged = [...mergeAxis(rules, 'h'), ...mergeAxis(rules, 'v')];
  return merged.sort(byPlacement);
}

/** Splits rules into the boxes they draw: two rules join when each crosses the other's span. */
export function components(rules: readonly RuleSeg[]): RuleSeg[][] {
  const parent = rules.map((_, i) => i);
  const find = (start: number): number => {
    let root = start;
    while (parent[root] !== root) root = parent[root];
    for (let at = start; parent[at] !== root; ) {
      const next = parent[at];
      parent[at] = root;
      at = next;
    }
    return root;
  };

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      if (rules[i].axis === rules[j].axis || !touches(rules[i], rules[j])) continue;
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

  return [...groups.values()]
    .map((group) => group.sort(byPlacement))
    .sort((a, b) => topLeft(a).top - topLeft(b).top || topLeft(a).left - topLeft(b).left);
}

/** Word shades the cell and again the paragraph inside it; the inner copy is a twin, not a shade. */
export function dedupeFills(fills: readonly FillBox[]): FillBox[] {
  const largestFirst = [...fills].sort((a, b) => area(b.rect) - area(a.rect));
  const kept: FillBox[] = [];
  for (const fill of largestFirst) {
    if (!kept.some((outer) => isTwin(outer.rect, fill.rect))) kept.push(fill);
  }
  return kept.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
}

function mergeAxis(rules: readonly RuleSeg[], axis: 'h' | 'v'): RuleSeg[] {
  const onAxis = rules.filter((r) => r.axis === axis).sort((a, b) => a.at - b.at);
  const out: RuleSeg[] = [];
  for (let i = 0; i < onAxis.length; ) {
    const anchor = onAxis[i].at;
    let j = i;
    while (j < onAxis.length && onAxis[j].at - anchor <= SEG_TOL) j++;
    out.push(...unionSpans(onAxis.slice(i, j)));
    i = j;
  }
  return out;
}

function unionSpans(bucket: readonly RuleSeg[]): RuleSeg[] {
  const sorted = [...bucket].sort((a, b) => a.from - b.from);
  const out: RuleSeg[] = [];
  let group: RuleSeg[] = [sorted[0]];
  let to = sorted[0].to;
  for (const seg of sorted.slice(1)) {
    if (seg.from - to <= SEG_TOL) {
      group.push(seg);
      to = Math.max(to, seg.to);
    } else {
      out.push(fuse(group, to));
      group = [seg];
      to = seg.to;
    }
  }
  out.push(fuse(group, to));
  return out;
}

/** The longest contributor decides the merged rule's position, weight and colour. */
function fuse(group: readonly RuleSeg[], to: Pt): RuleSeg {
  const lead = group.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
  return {
    axis: lead.axis,
    at: lead.at,
    from: group[0].from,
    to,
    thickness: lead.thickness,
    colour: lead.colour,
  };
}

function touches(a: RuleSeg, b: RuleSeg): boolean {
  return crosses(a, b.at) && crosses(b, a.at);
}

function crosses(rule: RuleSeg, at: Pt): boolean {
  return at >= rule.from - SEG_TOL && at <= rule.to + SEG_TOL;
}

function topLeft(group: readonly RuleSeg[]): { top: Pt; left: Pt } {
  let top = Infinity;
  let left = Infinity;
  for (const r of group) {
    top = Math.min(top, r.axis === 'h' ? r.at : r.from);
    left = Math.min(left, r.axis === 'v' ? r.at : r.from);
  }
  return { top, left };
}

function byPlacement(a: RuleSeg, b: RuleSeg): number {
  if (a.axis !== b.axis) return a.axis === 'h' ? -1 : 1;
  return a.at - b.at || a.from - b.from;
}

function area(rect: Rect): number {
  return rect.w * rect.h;
}

function isTwin(outer: Rect, inner: Rect): boolean {
  const insets = [
    inner.x - outer.x,
    inner.y - outer.y,
    outer.x + outer.w - (inner.x + inner.w),
    outer.y + outer.h - (inner.y + inner.h),
  ];
  return insets.every((d) => d >= -EPS && d <= TWIN_INSET_MAX);
}
