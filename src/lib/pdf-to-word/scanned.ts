/**
 * Scanned and no-text pages. Classification runs before line building; pages we
 * give up on are rendered with page.render, the machinery rasterize.ts already
 * proves on phones, which costs ~9 MB against ~24 MB for the XObject route.
 */

import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';
import { PdfToolsError } from '@/lib/pdf-tools/errors';
import {
  FULLPAGE_IMAGE,
  MAX_RUNS_PER_PAGE,
  SCAN_COVERAGE_MIN,
  SCAN_GLYPH_MAX,
  VECTOR_ART_COVER,
  VECTOR_ART_PATHS,
} from './constants';
import type { DegradeReason, PageClass, PageFacts } from './types';

/** A PDF point is 1/72 inch, so 150 DPI on A4 is the fixtures' own 1240×1754. */
const PT_PER_INCH = 72;
export const SCAN_DPI = 150;
/** iOS caps total canvas area and hands back a blank canvas rather than throwing. */
const MAX_RASTER_PIXELS = 16_777_216;
const SCAN_JPEG_QUALITY = 0.82;

export function classifyPage(p: PageFacts): PageClass {
  if (p.visibleGlyphs === 0 && p.invisibleGlyphs > 0) {
    return p.imageCoverage >= FULLPAGE_IMAGE ? 'searchableScan' : 'text';
  }
  if (p.visibleGlyphs + p.invisibleGlyphs === 0) {
    return p.imageCoverage >= FULLPAGE_IMAGE ? 'imageOnly' : 'blank';
  }
  if (p.imageCoverage >= SCAN_COVERAGE_MIN && p.visibleGlyphs < SCAN_GLYPH_MAX) return 'imageOnly';
  if (p.spans.length > MAX_RUNS_PER_PAGE) return 'rasterFallback';
  if (p.artPathCount > VECTOR_ART_PATHS || p.artCoverage >= VECTOR_ART_COVER) return 'rasterFallback';
  return 'text';
}

/** Why a page was demoted, for the conversion notes. Undefined for a clean text page. */
export function degradeReasonFor(p: PageFacts, cls: PageClass): DegradeReason | undefined {
  switch (cls) {
    case 'searchableScan':
      return 'invisible-text-only';
    case 'imageOnly':
    case 'blank':
      return 'no-text';
    case 'rasterFallback':
      return p.spans.length > MAX_RUNS_PER_PAGE ? 'too-many-runs' : 'vector-art';
    default:
      return undefined;
  }
}

/**
 * Render a whole page to a JPEG. `vp` is the caller's own viewport — its scale
 * and rotation are honoured so the bitmap lines up with the facts taken from it.
 */
export async function rasterPage(
  page: PDFPageProxy,
  vp: PageViewport,
  dpi: number,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; type: 'png' | 'jpg'; w: number; h: number }> {
  const basis = vp.scale || 1;
  const widthPt = vp.width / basis;
  const heightPt = vp.height / basis;

  let scale = dpi / PT_PER_INCH;
  const pixels = widthPt * scale * heightPt * scale;
  if (pixels > MAX_RASTER_PIXELS) scale *= Math.sqrt(MAX_RASTER_PIXELS / pixels);
  const viewport = page.getViewport({ scale, rotation: vp.rotation });

  const canvas = document.createElement('canvas');
  try {
    // Round, not floor: A4 at 150 DPI is 1753.94 pt tall and the source scan is 1754 px.
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new PdfToolsError('This browser can’t make a picture of a page.');

    // A PDF page has no background of its own, and JPEG has no alpha.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Rendering a scan is the longest single step in a conversion, so Stop has to reach inside it.
    const task = page.render({ canvasContext: context, viewport });
    const stop = (): void => task.cancel();
    signal?.addEventListener('abort', stop, { once: true });
    try {
      await task.promise;
    } finally {
      signal?.removeEventListener('abort', stop);
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', SCAN_JPEG_QUALITY);
    });
    if (!blob) throw new PdfToolsError('This page could not be turned into a picture.');

    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      type: 'jpg',
      w: canvas.width,
      h: canvas.height,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
