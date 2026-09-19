import type { PageViewport, PDFPageProxy } from 'pdfjs-dist';
import type { PDFOperatorList } from 'pdfjs-dist/types/src/display/api';
import { ALIGN_RESYNC_WINDOW, LIGATURES, PUA_MAP, RULE_MIN_LEN, RULE_THICK_MAX } from '../constants';
import type { FillBox, ImagePlacement, Pt, Rect, RenderMode, RuleSeg, Span } from '../types';

/** What `page.objs.get(id)` hands back once pdf.js has decoded an image. */
export interface PdfImage {
  width: number;
  height: number;
  /** ImageKind: 1 grayscale, 2 RGB 24bpp, 3 RGBA 32bpp. */
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray | null;
  /** PDF object reference such as '49R'. */
  ref?: string;
  interpolate?: boolean;
}

export interface OpScan {
  glyphs: { unicode: string; colour: string; mode: RenderMode }[];
  images: ImagePlacement[];
  rules: RuleSeg[];
  fills: FillBox[];
  artPathCount: number;
  artCoverage: number;
}

/** Op codes read from pdfjs-dist 4.8.69; `ensureOps` re-reads them from the library at runtime. */
const OP = {
  setLineWidth: 2,
  save: 10,
  restore: 11,
  transform: 12,
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  curveTo2: 16,
  curveTo3: 17,
  closePath: 18,
  rectangle: 19,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
  setTextRenderingMode: 38,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  paintImageMaskXObject: 83,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  constructPath: 91,
};

let opsRead = false;

/** Optional: extract/page.ts may await this once so the codes come from pdf.js rather than the table. */
export async function ensureOps(): Promise<void> {
  if (opsRead) return;
  opsRead = true;
  const { OPS } = await import('pdfjs-dist');
  const table = OPS as unknown as Record<string, number>;
  for (const key of Object.keys(OP) as (keyof typeof OP)[]) {
    const code = table[key];
    if (typeof code === 'number') OP[key] = code;
  }
}

const IMAGE_TIMEOUT_MS = 5000;
/** A stroke's own bbox is often zero-thickness, so its weight comes from the line width. */
const MIN_THICKNESS: Pt = 0.24;
/** Corner slop when deciding whether a filled subpath is an upright rectangle. */
const RECT_EPS: Pt = 0.05;
/** Past this the page is vector art by count alone, so the exact coverage stops mattering. */
const ART_UNION_CAP = 128;

const SKIP_CHAR = /^[\s\p{Cf}]$/u;

type Matrix = readonly [number, number, number, number, number, number];
type Point = readonly [number, number];

const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const apply = (m: Matrix, x: number, y: number): Point => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

const scaleOf = (m: Matrix): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

function prop(v: unknown, key: string | number): unknown {
  return v !== null && typeof v === 'object' ? (v as Record<string | number, unknown>)[key] : undefined;
}

function numAt(v: unknown, key: string | number): number | null {
  const n = prop(v, key);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function matrixFrom(v: unknown): Matrix | null {
  const m: number[] = [];
  for (let i = 0; i < 6; i++) {
    const n = numAt(v, i);
    if (n === null) return null;
    m.push(n);
  }
  return [m[0], m[1], m[2], m[3], m[4], m[5]];
}

const channel = (n: number): string =>
  Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();

/** setFill/StrokeRGBColor hand over a Uint8ClampedArray(3) as the args object itself. */
function rgbFrom(args: unknown): string | null {
  const source = numAt(args, 0) === null ? prop(args, 0) : args;
  const r = numAt(source, 0);
  const g = numAt(source, 1);
  const b = numAt(source, 2);
  return r === null || g === null || b === null ? null : channel(r) + channel(g) + channel(b);
}

interface SubPath {
  pts: Point[];
  closed: boolean;
  curved: boolean;
}

function operandCount(code: number): number {
  switch (code) {
    case OP.moveTo:
    case OP.lineTo:
      return 2;
    case OP.curveTo:
      return 6;
    case OP.curveTo2:
    case OP.curveTo3:
    case OP.rectangle:
      return 4;
    default:
      return 0;
  }
}

/** args = [subOpCodes, flatCoords, minMax]; minMax is pre-CTM local and deliberately ignored. */
function decodePath(args: unknown): SubPath[] {
  const codes = prop(args, 0);
  const coords = prop(args, 1);
  if (!Array.isArray(codes)) return [];
  const out: SubPath[] = [];
  let cur: SubPath | null = null;
  let k = 0;
  for (const raw of codes as unknown[]) {
    const code = typeof raw === 'number' ? raw : -1;
    const n = operandCount(code);
    const a: number[] = [];
    for (let j = 0; j < n; j++) a.push(numAt(coords, k + j) ?? 0);
    k += n;
    switch (code) {
      case OP.moveTo:
        cur = { pts: [[a[0], a[1]]], closed: false, curved: false };
        out.push(cur);
        break;
      case OP.lineTo:
        if (!cur) {
          cur = { pts: [], closed: false, curved: false };
          out.push(cur);
        }
        cur.pts.push([a[0], a[1]]);
        break;
      case OP.curveTo:
      case OP.curveTo2:
      case OP.curveTo3:
        if (cur) {
          cur.pts.push([a[n - 2], a[n - 1]]);
          cur.curved = true;
        }
        break;
      case OP.closePath:
        if (cur) cur.closed = true;
        break;
      case OP.rectangle:
        out.push({
          pts: [
            [a[0], a[1]],
            [a[0] + a[2], a[1]],
            [a[0] + a[2], a[1] + a[3]],
            [a[0], a[1] + a[3]],
          ],
          closed: true,
          curved: false,
        });
        cur = null;
        break;
    }
  }
  return out;
}

function boxOf(pts: readonly Point[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Only an upright rectangle may become a shaded box; a triangle's bbox is not its shape. */
function rectangular(pts: readonly Point[]): boolean {
  let p = pts;
  const last = p[p.length - 1];
  if (p.length === 5 && Math.abs(p[0][0] - last[0]) < RECT_EPS && Math.abs(p[0][1] - last[1]) < RECT_EPS) {
    p = p.slice(0, 4);
  }
  if (p.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = p[i];
    const b = p[(i + 1) % 4];
    if (Math.abs(a[0] - b[0]) > RECT_EPS && Math.abs(a[1] - b[1]) > RECT_EPS) return false;
  }
  return true;
}

/** Word joins its cell edges with 0.48 pt squares: too short to be a rule, far too small to be art. */
const speck = (box: Rect): boolean =>
  Math.min(box.w, box.h) <= RULE_THICK_MAX && Math.max(box.w, box.h) < RULE_MIN_LEN;

function ruleFrom(box: Rect, thickness: Pt, colour: string | null): RuleSeg | null {
  const thin = Math.min(box.w, box.h) <= RULE_THICK_MAX;
  const long = Math.max(box.w, box.h) >= RULE_MIN_LEN;
  if (!thin || !long) return null;
  const horizontal = box.w > box.h;
  return {
    axis: horizontal ? 'h' : 'v',
    at: horizontal ? box.y + box.h / 2 : box.x + box.w / 2,
    from: horizontal ? box.x : box.y,
    to: horizontal ? box.x + box.w : box.y + box.h,
    thickness: Math.max(MIN_THICKNESS, thickness),
    colour,
  };
}

function edgesOf(sp: SubPath, pts: readonly Point[]): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (let i = 1; i < pts.length; i++) out.push([pts[i - 1], pts[i]]);
  if (sp.closed && pts.length > 2) out.push([pts[pts.length - 1], pts[0]]);
  return out;
}

/** Area of the union of the boxes, swept in x-strips so overlapping art is not counted twice. */
function unionArea(boxes: readonly Rect[]): number {
  if (boxes.length === 0) return 0;
  const xs = [...new Set(boxes.flatMap((b) => [b.x, b.x + b.w]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const width = xs[i + 1] - xs[i];
    if (width <= 0) continue;
    const mid = (xs[i] + xs[i + 1]) / 2;
    const ivals = boxes
      .filter((b) => b.x <= mid && mid <= b.x + b.w && b.h > 0)
      .map((b): [number, number] => [b.y, b.y + b.h])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let end = -Infinity;
    for (const [s, e] of ivals) {
      if (e <= end) continue;
      covered += e - Math.max(s, end);
      end = e;
    }
    area += width * covered;
  }
  return area;
}

function clampTo(box: Rect, page: Rect): Rect | null {
  const x0 = Math.max(box.x, page.x);
  const y0 = Math.max(box.y, page.y);
  const x1 = Math.min(box.x + box.w, page.x + page.w);
  const y1 = Math.min(box.y + box.h, page.y + page.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

interface GState {
  ctm: Matrix;
  fill: string;
  stroke: string;
  mode: RenderMode;
  lineWidth: number;
}

const isFill = (fn: number): boolean =>
  fn === OP.fill ||
  fn === OP.eoFill ||
  fn === OP.fillStroke ||
  fn === OP.eoFillStroke ||
  fn === OP.closeFillStroke ||
  fn === OP.closeEOFillStroke;

const isStroke = (fn: number): boolean =>
  fn === OP.stroke ||
  fn === OP.closeStroke ||
  fn === OP.fillStroke ||
  fn === OP.eoFillStroke ||
  fn === OP.closeFillStroke ||
  fn === OP.closeEOFillStroke;

/** Walks the operator list once; every rectangle comes out in device space, and clip paths are discarded. */
export function scanOperators(ol: PDFOperatorList, vp: PageViewport): OpScan {
  const base = matrixFrom(vp.transform) ?? [1, 0, 0, -1, 0, vp.height];
  const page: Rect = { x: 0, y: 0, w: vp.width, h: vp.height };
  const glyphs: OpScan['glyphs'] = [];
  const images: ImagePlacement[] = [];
  const rules: RuleSeg[] = [];
  const fills: FillBox[] = [];
  const art: Rect[] = [];
  let artPathCount = 0;

  let gs: GState = { ctm: base, fill: '000000', stroke: '000000', mode: 0, lineWidth: 1 };
  const stack: GState[] = [];
  let pending: { subpaths: SubPath[]; ctm: Matrix; lineWidth: number } | null = null;

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const args: unknown = ol.argsArray[i];

    switch (fn) {
      case OP.save:
        stack.push({ ...gs });
        continue;
      case OP.restore:
        gs = stack.pop() ?? gs;
        continue;
      case OP.transform: {
        const m = matrixFrom(args);
        if (m) gs.ctm = mul(gs.ctm, m);
        continue;
      }
      case OP.setLineWidth:
        gs.lineWidth = numAt(args, 0) ?? gs.lineWidth;
        continue;
      case OP.setFillRGBColor:
        gs.fill = rgbFrom(args) ?? gs.fill;
        continue;
      case OP.setStrokeRGBColor:
        gs.stroke = rgbFrom(args) ?? gs.stroke;
        continue;
      case OP.setTextRenderingMode: {
        const m = numAt(args, 0) ?? 0;
        gs.mode = (m >= 0 && m <= 7 ? m : 0) as RenderMode;
        continue;
      }
      case OP.showText:
      case OP.showSpacedText:
      case OP.nextLineShowText:
      case OP.nextLineSetSpacingShowText: {
        const run = prop(args, fn === OP.nextLineSetSpacingShowText ? 2 : 0);
        if (!Array.isArray(run)) continue;
        const colour = gs.mode === 1 || gs.mode === 5 ? gs.stroke : gs.fill;
        for (const g of run as unknown[]) {
          // TJ kerning arrives as bare numbers between the glyph objects.
          if (typeof g === 'number' || !g) continue;
          const unicode = prop(g, 'unicode');
          if (typeof unicode === 'string' && unicode.length > 0) {
            glyphs.push({ unicode, colour, mode: gs.mode });
          }
        }
        continue;
      }
      case OP.constructPath:
        pending = { subpaths: decodePath(args), ctm: gs.ctm, lineWidth: gs.lineWidth };
        continue;
      case OP.paintImageXObject:
      case OP.paintImageMaskXObject:
      case OP.paintInlineImageXObject: {
        const xobject = fn === OP.paintImageXObject;
        // A mask's args[0] is an object carrying the objId in .data; an inline image has no id.
        const held = xobject ? null : prop(args, 0);
        const id = xobject ? prop(args, 0) : prop(held, 'data');
        images.push({
          objId: typeof id === 'string' ? id : null,
          ref: null,
          kind: xobject ? 'xobject' : fn === OP.paintImageMaskXObject ? 'mask' : 'inline',
          rect: boxOf([
            apply(gs.ctm, 0, 0),
            apply(gs.ctm, 1, 0),
            apply(gs.ctm, 0, 1),
            apply(gs.ctm, 1, 1),
          ]),
          srcW: (xobject ? numAt(args, 1) : numAt(held, 'width')) ?? 0,
          srcH: (xobject ? numAt(args, 2) : numAt(held, 'height')) ?? 0,
          rotationDeg: rotationOf(gs.ctm),
        });
        continue;
      }
    }

    if (!pending) continue;
    const filled = isFill(fn);
    const stroked = isStroke(fn);
    if (!filled && !stroked) {
      // clip, eoClip, endPath and everything else: the path was never painted.
      pending = null;
      continue;
    }

    const { ctm, subpaths } = pending;
    const weight = Math.max(MIN_THICKNESS, pending.lineWidth * scaleOf(ctm));
    for (const sp of subpaths) {
      const pts = sp.pts.map(([x, y]) => apply(ctm, x, y));
      if (pts.length === 0) continue;
      const box = boxOf(pts);
      let used = false;

      if (filled && !sp.curved) {
        const seg = ruleFrom(box, Math.min(box.w, box.h), gs.fill);
        if (seg) {
          rules.push(seg);
          used = true;
        } else if (Math.min(box.w, box.h) > RULE_THICK_MAX && rectangular(pts)) {
          fills.push({ rect: box, colour: gs.fill });
          used = true;
        }
      }
      if (stroked && !sp.curved) {
        for (const [a, b] of edgesOf(sp, pts)) {
          const seg = ruleFrom(boxOf([a, b]), weight, gs.stroke);
          if (seg) {
            rules.push(seg);
            used = true;
          }
        }
      }
      if (!used && !speck(box)) {
        artPathCount++;
        const inside = clampTo(box, page);
        if (inside && art.length < ART_UNION_CAP) art.push(inside);
      }
    }
    pending = null;
  }

  const pageArea = page.w * page.h;
  return {
    glyphs,
    images,
    rules,
    fills,
    artPathCount,
    artCoverage: pageArea > 0 ? Math.min(1, unionArea(art) / pageArea) : 0,
  };
}

/** Clockwise-positive in device space, and 0 unless the CTM really carries a rotation. */
function rotationOf(m: Matrix): number {
  const scale = Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
  if (Math.abs(m[1]) <= 0.01 * scale && Math.abs(m[2]) <= 0.01 * scale) return 0;
  return (Math.atan2(m[1], m[0]) * 180) / Math.PI;
}

const sameChar = (glyph: string, span: string): boolean =>
  glyph === span || PUA_MAP.get(glyph.codePointAt(0) ?? -1) === span.codePointAt(0);

/** How many characters of `text` from `k` this glyph accounts for, 0 if it is not a match. */
function matchLength(unicode: string, text: string, k: number): number {
  const u = LIGATURES.get(unicode) ?? unicode;
  if (k + u.length > text.length) return 0;
  for (let j = 0; j < u.length; j++) {
    if (!sameChar(u[j], text[k + j])) return 0;
  }
  return u.length;
}

function piece(span: Span, start: number, end: number, colour: string | null, mode: RenderMode): Span {
  const n = span.text.length;
  return {
    ...span,
    text: span.text.slice(start, end),
    x: span.x + (span.w * start) / n,
    w: (span.w * (end - start)) / n,
    colour,
    mode,
    eol: end === n ? span.eol : false,
  };
}

/** Attaches colour and render mode by walking the glyph stream alongside the spans; losing colour never loses text. */
export function attachColours(
  spans: Span[],
  glyphs: OpScan['glyphs'],
): { spans: Span[]; dropped: number } {
  const stream = glyphs.filter((g) => !SKIP_CHAR.test(g.unicode));
  const out: Span[] = [];
  let gi = 0;
  let dropped = 0;
  let resolved: { colour: string | null; mode: RenderMode } = { colour: null, mode: 0 };
  let aligning = true;

  for (const span of spans) {
    const text = span.text;
    const marks: (OpScan['glyphs'][number] | null)[] = new Array(text.length).fill(null);
    let matched = false;

    for (let k = 0; aligning && k < text.length; ) {
      if (SKIP_CHAR.test(text[k])) {
        k++;
        continue;
      }
      let scanned = 0;
      while (
        gi < stream.length &&
        matchLength(stream[gi].unicode, text, k) === 0 &&
        scanned < ALIGN_RESYNC_WINDOW
      ) {
        gi++;
        scanned++;
        dropped++;
      }
      const take = gi < stream.length ? matchLength(stream[gi].unicode, text, k) : 0;
      if (take === 0) {
        aligning = false;
        break;
      }
      for (let j = 0; j < take; j++) marks[k + j] = stream[gi];
      matched = true;
      gi++;
      k += take;
    }

    if (!aligning && !matched) {
      out.push({ ...span, colour: null, mode: 0 });
      continue;
    }
    if (!matched) {
      // Whitespace-only and synthetic spans keep the colour and mode around them.
      out.push({ ...span, colour: resolved.colour, mode: resolved.mode });
      continue;
    }

    // The span takes its first matched glyph's colour, and splits where that colour changes.
    let start = 0;
    let run = { colour: '', mode: 0 as RenderMode };
    let open = false;
    for (let k = 0; k < text.length; k++) {
      const g = marks[k];
      if (!g) continue;
      if (!open) {
        run = { colour: g.colour, mode: g.mode };
        open = true;
        continue;
      }
      if (g.colour === run.colour && g.mode === run.mode) continue;
      out.push(piece(span, start, k, run.colour, run.mode));
      start = k;
      run = { colour: g.colour, mode: g.mode };
    }
    out.push(
      start === 0
        ? { ...span, colour: run.colour, mode: run.mode }
        : piece(span, start, text.length, run.colour, run.mode),
    );
    resolved = run;
  }

  return { spans: out, dropped };
}

/** The callback form is mandatory: `objs.has(id)` is false on some pages right after getOperatorList resolves. */
export async function loadImageObject(page: PDFPageProxy, objId: string): Promise<PdfImage> {
  const store = objId.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise<PdfImage>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Image ${objId} did not decode.`)), IMAGE_TIMEOUT_MS);
    store.get(objId, (value: unknown) => {
      clearTimeout(timer);
      if (value && typeof value === 'object') resolve(value as PdfImage);
      else reject(new Error(`Image ${objId} came back empty.`));
    });
  });
}
