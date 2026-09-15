/**
 * Turning a pdf.js image object into bytes docx can embed. Path A lifts the
 * untouched JPEG stream with pdf-lib when the source really is a plain
 * DCTDecode; everything else falls through to Path B, a canvas re-encode.
 */

import type { PDFDocument } from 'pdf-lib';
import type { ImagePlacement } from '../types';

/** pdf.js hands the main thread decoded pixels; `ref` bridges back to the raw stream. */
export interface PdfImage {
  width: number;
  height: number;
  /** pdf.js ImageKind: 1 = 1 bit per pixel, 2 = RGB 24bpp, 3 = RGBA 32bpp. */
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray | null;
  ref?: string | null;
  bitmap?: ImageBitmap | null;
}

const MAX_IMAGE_PIXELS = 4_000_000;
const MAX_LONG_SIDE = 2000;
/** iOS caps total canvas area and hands back a blank canvas rather than throwing. */
const MAX_RASTER_PIXELS = 16_777_216;
const PNG_PIXEL_MAX = 250_000;
const IMAGE_BUDGET_BYTES = 48_000_000;
const SOFT_DOC_BUDGET_BYTES = 96_000_000;
const JPEG_QUALITY = 0.82;
const JPEG_QUALITY_TIGHT = 0.6;
const CHUNK_ROWS = 64;

let embedded = 0;
let libCache: { bytes: Uint8Array; doc: PDFDocument } | null = null;

/** Call once per conversion: the budget and the pdf-lib handle are per document. */
export function resetImageBudget(): void {
  embedded = 0;
  libCache = null;
}

export async function encodeImage(
  img: PdfImage,
  place: ImagePlacement,
  pdfBytes: Uint8Array,
): Promise<{ data: Uint8Array; type: 'png' | 'jpg'; downscaled: boolean } | null> {
  const srcW = Math.floor(img.width || place.srcW);
  const srcH = Math.floor(img.height || place.srcH);
  if (!(srcW > 0) || !(srcH > 0) || srcW * srcH > MAX_RASTER_PIXELS) return null;
  if (embedded >= SOFT_DOC_BUDGET_BYTES) return null;

  const factor = Math.min(
    1,
    MAX_LONG_SIDE / Math.max(srcW, srcH),
    Math.sqrt(MAX_IMAGE_PIXELS / (srcW * srcH)),
  );
  const downscaled = factor < 1;

  const ref = place.ref ?? img.ref ?? null;
  if (!downscaled && place.kind === 'xobject' && ref) {
    const original = await liftOriginalJpeg(pdfBytes, ref);
    if (original && spend(original.length)) return { data: original, type: 'jpg', downscaled: false };
  }

  const type: 'png' | 'jpg' =
    place.kind === 'mask' || srcW * srcH <= PNG_PIXEL_MAX ? 'png' : 'jpg';
  const quality = embedded >= IMAGE_BUDGET_BYTES ? JPEG_QUALITY_TIGHT : JPEG_QUALITY;

  let bytes: Uint8Array | null = null;
  try {
    bytes = await reEncode(img, place, srcW, srcH, Math.max(1, Math.round(srcW * factor)),
      Math.max(1, Math.round(srcH * factor)), type, quality);
  } catch {
    return null;
  }
  if (!bytes || bytes.length === 0 || !spend(bytes.length)) return null;
  return { data: bytes, type, downscaled };
}

export async function liftOriginalJpeg(pdfBytes: Uint8Array, ref: string): Promise<Uint8Array | null> {
  const match = /^(\d+)R(\d*)$/.exec(ref);
  if (!match || pdfBytes.length === 0) return null;
  try {
    const { PDFDocument: Doc, PDFName, PDFRawStream, PDFRef } = await import('pdf-lib');
    if (libCache?.bytes !== pdfBytes) {
      libCache = { bytes: pdfBytes, doc: await Doc.load(pdfBytes, { ignoreEncryption: true }) };
    }
    const obj = libCache.doc.context.lookup(
      PDFRef.of(Number(match[1]), match[2] ? Number(match[2]) : 0),
    );
    if (!(obj instanceof PDFRawStream)) return null;

    // A soft mask, a stencil or an inverted /Decode all need the composited pixels instead.
    for (const key of ['SMask', 'Mask', 'Decode', 'ColorSpace'] as const) {
      const value = obj.dict.get(PDFName.of(key));
      if (key === 'ColorSpace') {
        if (value && /CMYK|Indexed|Separation|DeviceN/.test(String(value))) return null;
      } else if (value) {
        return null;
      }
    }
    const filter = String(obj.dict.get(PDFName.of('Filter')) ?? '');
    if (filter !== '/DCTDecode' && !/^\[\s*\/DCTDecode\s*\]$/.test(filter)) return null;

    const raw = obj.getContents();
    const components = jpegComponents(raw);
    return components === 1 || components === 3 ? raw : null;
  } catch {
    return null;
  }
}

function spend(n: number): boolean {
  if (embedded + n > SOFT_DOC_BUDGET_BYTES) return false;
  embedded += n;
  return true;
}

/** Component count of a baseline, extended or progressive JPEG; null if it is none of those. */
function jpegComponents(raw: Uint8Array): number | null {
  if (raw.length < 4 || raw[0] !== 0xff || raw[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < raw.length) {
    if (raw[i] !== 0xff) return null;
    const marker = raw[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = (raw[i + 2] << 8) | raw[i + 3];
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xc2) return i + 9 < raw.length ? raw[i + 9] : null;
    i += 2 + length;
  }
  return null;
}

async function reEncode(
  img: PdfImage,
  place: ImagePlacement,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  type: 'png' | 'jpg',
  quality: number,
): Promise<Uint8Array | null> {
  const source = document.createElement('canvas');
  let scaled: HTMLCanvasElement | null = null;
  try {
    source.width = srcW;
    source.height = srcH;
    const sourceCtx = source.getContext('2d');
    if (!sourceCtx) return null;
    if (img.bitmap) sourceCtx.drawImage(img.bitmap, 0, 0);
    else if (!paintPixels(sourceCtx, img, srcW, srcH, place.kind === 'mask')) return null;

    let canvas = source;
    if (targetW !== srcW || targetH !== srcH || type === 'jpg') {
      scaled = document.createElement('canvas');
      scaled.width = targetW;
      scaled.height = targetH;
      const scaledCtx = scaled.getContext('2d');
      if (!scaledCtx) return null;
      // JPEG has no alpha, and a transparent source would otherwise composite onto black.
      if (type === 'jpg') {
        scaledCtx.fillStyle = '#ffffff';
        scaledCtx.fillRect(0, 0, targetW, targetH);
      }
      scaledCtx.imageSmoothingEnabled = true;
      scaledCtx.imageSmoothingQuality = 'high';
      scaledCtx.drawImage(source, 0, 0, targetW, targetH);
      canvas = scaled;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type === 'jpg' ? 'image/jpeg' : 'image/png', type === 'jpg' ? quality : undefined);
    });
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } finally {
    source.width = 0;
    source.height = 0;
    if (scaled) {
      scaled.width = 0;
      scaled.height = 0;
    }
  }
}

/** Expand pdf.js's packed pixels a band at a time, so no full RGBA copy is held. */
function paintPixels(
  ctx: CanvasRenderingContext2D,
  img: PdfImage,
  w: number,
  h: number,
  mask: boolean,
): boolean {
  const src = img.data;
  const kind = img.kind ?? 0;
  if (!src || (kind !== 1 && kind !== 2 && kind !== 3)) return false;

  const stride = (w + 7) >> 3;
  const band = ctx.createImageData(w, Math.min(CHUNK_ROWS, h));
  const dest = band.data;
  for (let top = 0; top < h; top += CHUNK_ROWS) {
    const rows = Math.min(CHUNK_ROWS, h - top);
    let p = 0;
    for (let y = top; y < top + rows; y++) {
      if (kind === 3) {
        let s = y * w * 4;
        for (let i = w * 4; i-- > 0; ) dest[p++] = src[s++];
      } else if (kind === 2) {
        let s = y * w * 3;
        for (let x = 0; x < w; x++) {
          dest[p++] = src[s++];
          dest[p++] = src[s++];
          dest[p++] = src[s++];
          dest[p++] = 255;
        }
      } else {
        const row = y * stride;
        for (let x = 0; x < w; x++) {
          // A set bit is white in an image and transparent in a stencil mask.
          const set = ((src[row + (x >> 3)] ?? 255) & (0x80 >> (x & 7))) !== 0;
          const value = mask ? 0 : set ? 255 : 0;
          dest[p++] = value;
          dest[p++] = value;
          dest[p++] = value;
          dest[p++] = mask && set ? 0 : 255;
        }
      }
    }
    ctx.putImageData(band, 0, top, 0, 0, w, rows);
  }
  return true;
}
