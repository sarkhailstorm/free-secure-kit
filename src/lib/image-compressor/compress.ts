import type { CompressOutcome, CompressSettings, Dimensions } from './types';
import { outputFilename, resolveMaxDimension, resolveOutputType } from './settings';

/**
 * How many images are encoded at the same time.
 *
 * Encoding runs on the main thread (see the note in `compressImage` about why
 * we do not use the library's web-worker path), so a small window keeps the
 * page responsive while still overlapping the async decode/encode steps.
 */
export const CONCURRENCY = 3;

/** Vector images can't be meaningfully re-encoded here, so we turn them away. */
const REJECTED_IMAGE_TYPES = new Set(['image/svg+xml']);

export function isSupportedImage(file: File): boolean {
  return file.type.startsWith('image/') && !REJECTED_IMAGE_TYPES.has(file.type);
}

/** Short explanation of why a dropped file was skipped. */
export function rejectionReason(file: File): string {
  if (REJECTED_IMAGE_TYPES.has(file.type)) return 'SVG images can’t be compressed this way';
  return 'not an image';
}

/* ----------------------------------------------------------- dimensions -- */

function readDimensionsViaElement(blob: Blob): Promise<Dimensions> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const dimensions = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('the file could not be decoded as an image'));
    };
    img.src = url;
  });
}

/**
 * Pixel size of an image blob. Uses `createImageBitmap` where available and
 * closes the bitmap immediately — a decoded bitmap of a 40 MP photo is well
 * over 100 MB of memory, so holding on to one per image would be ruinous.
 */
export async function readDimensions(blob: Blob): Promise<Dimensions> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    } catch {
      // Fall through to the <img> path (older Safari, odd colour profiles).
    }
  }
  return readDimensionsViaElement(blob);
}

/* ------------------------------------------------------------- compress -- */

/**
 * Re-encode one image.
 *
 * `file` is always the user's ORIGINAL file — re-running with a different
 * quality re-compresses from the source, never from a previous result, so
 * quality loss never compounds.
 */
export async function compressImage(
  file: File,
  source: Dimensions,
  settings: CompressSettings,
  signal?: AbortSignal,
): Promise<CompressOutcome> {
  // Loaded on demand: the library is large and nobody who only reads the page
  // should have to download it.
  const { default: imageCompression } = await import('browser-image-compression');

  const targetType = resolveOutputType(file.type, settings.format);
  const maxWidthOrHeight = resolveMaxDimension(source, settings.resize);

  const compressed = await imageCompression(file, {
    // IMPORTANT: leave this false. The library's web-worker path calls
    // importScripts() against a jsdelivr CDN URL, which would be a
    // third-party runtime request — exactly the thing this site promises
    // never to make. The main-thread path is self-contained.
    useWebWorker: false,
    // We drive the encoder with a quality level, not a target file size, so
    // there is no size budget to iterate towards.
    maxSizeMB: Number.POSITIVE_INFINITY,
    // The library still makes one extra attempt when a result comes out bigger
    // than its source (common for PNG). Cap that at a single retry instead of
    // ten futile re-encodes; if it is still bigger, we report that honestly.
    maxIteration: 1,
    // Our resize preset is the only thing allowed to change the pixel size.
    alwaysKeepResolution: true,
    initialQuality: settings.quality / 100,
    fileType: targetType,
    // Re-encoding through a canvas drops EXIF anyway; this makes sure the
    // library does not copy it back in.
    preserveExif: false,
    ...(maxWidthOrHeight === undefined ? {} : { maxWidthOrHeight }),
    ...(signal ? { signal } : {}),
  });

  // The library copies the source filename onto its output, so the extension
  // can disagree with the bytes. Trust the blob's own type.
  const actualType = compressed.type || targetType;
  const dimensions = await readDimensions(compressed);

  return {
    blob: compressed,
    size: compressed.size,
    type: actualType,
    filename: outputFilename(file.name, actualType),
    width: dimensions.width,
    height: dimensions.height,
  };
}

/* ----------------------------------------------------------- scheduling -- */

/**
 * Run `worker` over `items` with at most `limit` in flight at once.
 *
 * `worker` is expected to swallow its own failures: one bad image must never
 * take down the rest of the batch.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const laneCount = Math.max(1, Math.min(limit, items.length));

  async function lane(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: laneCount }, lane));
}

/* ------------------------------------------------------------------ zip -- */

/**
 * Bundle results into a ZIP. Stored, not deflated: the payloads are already
 * compressed image data, so deflating them costs time and saves nothing.
 */
export async function buildZip(entries: readonly { name: string; blob: Blob }[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.name, entry.blob);
  }
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

/* ---------------------------------------------------------------- error -- */

/** Turn whatever was thrown into one short sentence a person can act on. */
export function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/not an image/i.test(raw)) return 'Not a readable image file.';
  if (/decoded as an image/i.test(raw)) return 'This file could not be decoded — it may be corrupt.';
  if (/memory|allocation/i.test(raw)) return 'Ran out of memory — this image is too large.';
  return raw.trim() ? raw.trim().slice(0, 140) : 'Compression failed for this image.';
}
