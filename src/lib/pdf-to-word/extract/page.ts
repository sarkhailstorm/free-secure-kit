import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';
import type { StructTreeNode, TextStyle } from 'pdfjs-dist/types/src/display/api';
import { PdfToolsError } from '@/lib/pdf-tools/errors';
import {
  DEFAULT_ASCENT,
  DEFAULT_DESCENT,
  LINE_TOL,
  NO_SPACE_MAX,
  ROTATED_RUN_LIMIT,
} from '../constants';
import { mapFont } from '../fonts';
import { SCAN_DPI, classifyPage, degradeReasonFor, rasterPage } from '../scanned';
import { repairUnicode } from '../text';
import type {
  FontInfo,
  Generic,
  LinkBox,
  PageClass,
  PageFacts,
  Pt,
  Rect,
  Span,
  WordOptions,
} from '../types';
import { attachColours, ensureOps, scanOperators } from './glyphs';
import { indexStruct } from './struct';

/** Only so a textless page cannot divide the size-relative thresholds by zero. */
const FALLBACK_BODY_SIZE: Pt = 12;
const SKIP_CHAR = /[\s\p{Cf}]/u;
const GENERICS: ReadonlySet<string> = new Set(['serif', 'sans-serif', 'monospace']);
/** PageFacts deliberately carries no pdf.js handles, but releasePage still has to free the page. */
const openPages = new WeakMap<PageFacts, PDFPageProxy>();

/** pdf.js's font object, whose own .d.ts describes it as `any`. */
interface FontFace {
  name?: unknown;
  fallbackName?: unknown;
  missingFile?: unknown;
}

interface Frame {
  tag: string;
  id: string | null;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PdfToolsError('Conversion cancelled.');
}

function glyphCount(text: string): number {
  let n = 0;
  for (const ch of text) if (!SKIP_CHAR.test(ch)) n++;
  return n;
}

function toGeneric(raw: string | undefined): Generic {
  if (raw !== undefined && GENERICS.has(raw)) return raw as Generic;
  const name = (raw ?? '').toLowerCase();
  if (name.includes('mono')) return 'monospace';
  if (name.includes('serif') && !name.includes('sans')) return 'serif';
  return 'sans-serif';
}

/** Upright in device space. /Rotate 90 fakes horizontal on item.transform, so test the device matrix. */
function isUpright(m: readonly number[]): boolean {
  return m[0] > 0 && m[3] < 0 && Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6;
}

function normaliseRotate(deg: number): 0 | 90 | 180 | 270 {
  const r = (((deg % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  return r === 90 || r === 180 || r === 270 ? r : 0;
}

/** Char-weighted modal size, 2 dp. Ties go to the smaller size — the body, not a heading. */
function modalSize(spans: readonly Span[]): Pt {
  const weight = new Map<number, number>();
  for (const span of spans) {
    if (span.synthetic) continue;
    const n = glyphCount(span.text);
    if (n === 0) continue;
    const key = Math.round(span.size * 100) / 100;
    weight.set(key, (weight.get(key) ?? 0) + n);
  }
  let best = FALLBACK_BODY_SIZE;
  let most = 0;
  for (const [size, n] of weight) {
    if (n > most || (n === most && size < best)) {
      best = size;
      most = n;
    }
  }
  return best;
}

function unionArea(rects: readonly Rect[]): number {
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const bands = rects
      .filter((r) => r.x <= x0 && r.x + r.w >= x1)
      .map((r) => [r.y, r.y + r.h] as const)
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let end = -Infinity;
    for (const [y0, y1] of bands) {
      if (y1 <= end) continue;
      covered += y1 - Math.max(y0, end);
      end = y1;
    }
    area += covered * (x1 - x0);
  }
  return area;
}

function nearestId(stack: readonly Frame[]): string | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].id !== null) return stack[i].id;
  }
  return null;
}

/** A lone narrow span starting its line with a gap after it — the shape of a bullet. */
function isLeadingRun(spans: readonly Span[], i: number, bodySize: Pt): boolean {
  const span = spans[i];
  if (span.w >= 1.5 * span.size) return false;
  const tol = LINE_TOL(bodySize);
  const prev = spans[i - 1];
  const startsLine = prev === undefined || prev.eol || Math.abs(span.y - prev.y) > tol;
  if (!startsLine) return false;
  const next = spans[i + 1];
  if (span.eol || next === undefined || Math.abs(next.y - span.y) > tol) return false;
  return next.synthetic || next.x - (span.x + span.w) > NO_SPACE_MAX * span.size;
}

export async function readPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  fonts: Map<string, FontInfo>,
  opts: WordOptions,
): Promise<PageFacts> {
  const { Util } = await import('pdfjs-dist');
  await ensureOps();

  const page = await doc.getPage(pageNumber);
  let vp: PageViewport = page.getViewport({ scale: 1 });
  const [tc, ol] = await Promise.all([
    page.getTextContent({ includeMarkedContent: true, disableNormalization: true }),
    page.getOperatorList(),
  ]);
  throwIfAborted(opts.signal);
  const tree: StructTreeNode | null = await page.getStructTree().catch(() => null);
  const annots: unknown[] = await page.getAnnotations().catch(() => []);
  throwIfAborted(opts.signal);

  // §4.7: a /Rotate page drawn in unrotated user space reads straight — only the paper turned.
  if (page.rotate % 180 !== 0) {
    const flat = page.getViewport({ scale: 1, rotation: 0 });
    let turned = 0;
    let straight = 0;
    for (const item of tc.items) {
      if (!('str' in item) || item.str.trim() === '' || !Array.isArray(item.transform)) continue;
      if (isUpright(Util.transform(vp.transform, item.transform))) turned++;
      if (isUpright(Util.transform(flat.transform, item.transform))) straight++;
    }
    if (straight > turned) vp = flat;
  }

  const registerFont = (id: string): void => {
    if (fonts.has(id)) return;
    const style: TextStyle | undefined = tc.styles[id];
    let face: FontFace | undefined;
    try {
      face = page.commonObjs.get(id) as FontFace;
    } catch {
      face = undefined;
    }
    const generic = toGeneric(
      typeof face?.fallbackName === 'string' ? face.fallbackName : style?.fontFamily,
    );
    const psName = typeof face?.name === 'string' ? face.name : '';
    fonts.set(id, {
      ...mapFont(psName, generic, face?.missingFile !== false),
      id,
      ascent: style?.ascent ?? DEFAULT_ASCENT,
      descent: style?.descent ?? DEFAULT_DESCENT,
    });
  };

  const stack: Frame[] = [];
  const tagOf = new Map<string, string>();
  let artifactDepth = 0;
  let rotatedSpanCount = 0;
  let rotatedGlyphs = 0;
  let raw: Span[] = [];

  for (const item of tc.items) {
    if (!('str' in item)) {
      const mark = item as { type: string; id?: string | null; tag?: string };
      if (mark.type === 'endMarkedContent') {
        const frame = stack.pop();
        if (frame?.tag === 'Artifact') artifactDepth = Math.max(0, artifactDepth - 1);
        continue;
      }
      const tag = typeof mark.tag === 'string' ? mark.tag : '';
      const id = typeof mark.id === 'string' ? mark.id : null;
      stack.push({ tag, id });
      if (tag === 'Artifact') artifactDepth++;
      if (id !== null) tagOf.set(id, tag);
      continue;
    }

    // Both EOL shapes: a zero-length marker closes the previous span, hasEOL closes its own.
    if (item.str === '') {
      if (item.hasEOL && raw.length > 0) raw[raw.length - 1].eol = true;
      continue;
    }
    if (!Array.isArray(item.transform)) continue;

    const m: number[] = Util.transform(vp.transform, item.transform);
    if (!isUpright(m)) {
      if (item.str.trim() !== '') {
        rotatedSpanCount++;
        rotatedGlyphs += glyphCount(item.str);
      }
      continue;
    }

    registerFont(item.fontName);
    raw.push({
      text: item.str,
      fontId: item.fontName,
      size: Math.hypot(m[2], m[3]),
      colour: null,
      mode: 0,
      x: m[4],
      y: m[5],
      w: Math.abs(item.width),
      synthetic: item.str === ' ' && item.height === 0,
      eol: item.hasEOL === true,
      mcid: nearestId(stack),
      artifact: artifactDepth > 0,
      rotationDeg: 0,
    });
  }

  const scan = scanOperators(ol, vp);
  // getTextContent drops glyphs clipped by the viewBox; the aligner is the only thing that sees them.
  const attached = attachColours(raw, scan.glyphs);
  raw = attached.spans;

  const bodySize = modalSize(raw);
  const spans: Span[] = [];
  for (let i = 0; i < raw.length; i++) {
    const span = raw[i];
    const font = fonts.get(span.fontId) ?? mapFont('', 'sans-serif', true);
    const fixed = repairUnicode(span.text, font, isLeadingRun(raw, i, bodySize));
    span.text = fixed.text;
    if (fixed.repaired) span.repaired = fixed.repaired;
    if (span.text !== '') spans.push(span);
    else if (span.eol && spans.length > 0) spans[spans.length - 1].eol = true;
  }

  const links: LinkBox[] = [];
  for (const entry of annots) {
    const a = entry as { subtype?: unknown; url?: unknown; rect?: unknown };
    if (a.subtype !== 'Link' || typeof a.url !== 'string' || !Array.isArray(a.rect)) continue;
    const r: number[] = a.rect;
    if (r.length < 4) continue;
    const p0: number[] = Util.applyTransform([r[0], r[1]], vp.transform);
    const p1: number[] = Util.applyTransform([r[2], r[3]], vp.transform);
    links.push({
      rect: {
        x: Math.min(p0[0], p1[0]),
        y: Math.min(p0[1], p1[1]),
        w: Math.abs(p1[0] - p0[0]),
        h: Math.abs(p1[1] - p0[1]),
      },
      url: a.url,
    });
  }

  let visibleGlyphs = 0;
  let invisibleGlyphs = 0;
  for (const span of spans) {
    const n = glyphCount(span.text);
    if (span.mode === 3 || span.mode === 7) invisibleGlyphs += n;
    else visibleGlyphs += n;
  }

  const pageArea = vp.width * vp.height;
  const facts: PageFacts = {
    index: pageNumber - 1,
    pageNumber,
    cls: 'text',
    width: vp.width,
    height: vp.height,
    rotate: normaliseRotate(page.rotate),
    spans,
    rotatedSpanCount,
    droppedGlyphs: attached.dropped + rotatedGlyphs,
    rules: scan.rules,
    fills: scan.fills,
    images: scan.images,
    links,
    struct: indexStruct(tree, tagOf),
    bodySize,
    visibleGlyphs,
    invisibleGlyphs,
    imageCoverage:
      pageArea > 0 ? Math.min(1, unionArea(scan.images.map((i) => i.rect)) / pageArea) : 0,
    artPathCount: scan.artPathCount,
    artCoverage: scan.artCoverage,
  };

  facts.cls = classifyPage(facts);
  facts.degradeReason = degradeReasonFor(facts, facts.cls);

  // §4.7: rotated text is dropped from the flow, so past the limit the page goes in as a picture.
  const runs = spans.length + rotatedSpanCount;
  if (
    runs > 0 &&
    rotatedSpanCount > ROTATED_RUN_LIMIT * runs &&
    (facts.cls === 'text' || facts.cls === 'blank')
  ) {
    facts.cls = 'rasterFallback';
    facts.degradeReason = 'rotated-text';
  }

  if (wantsRaster(facts.cls, opts)) {
    throwIfAborted(opts.signal);
    facts.raster = await rasterPage(page, vp, SCAN_DPI, opts.signal).catch(() => undefined);
    throwIfAborted(opts.signal);
  }

  openPages.set(facts, page);
  return facts;
}

function wantsRaster(cls: PageClass, opts: WordOptions): boolean {
  if (cls === 'rasterFallback') return true;
  if (opts.imagesForScannedPages === false) return false;
  // Editable mode drops a searchable scan's bitmap: text sitting on a picture is unusable.
  return cls === 'imageOnly' || (cls === 'searchableScan' && opts.mode === 'exact');
}

export function releasePage(facts: PageFacts): void {
  const page = openPages.get(facts);
  openPages.delete(facts);
  facts.raster = undefined;
  page?.cleanup();
}
