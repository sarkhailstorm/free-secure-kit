import type { CompressOutcome, CompressSettings, Dimensions } from './types';
import { outputFilename, resolveMaxDimension, resolveOutputType } from './settings';

export const CONCURRENCY = 3;

const REJECTED_IMAGE_TYPES = new Set(['image/svg+xml']);

export function isSupportedImage(file: File): boolean {
  return file.type.startsWith('image/') && !REJECTED_IMAGE_TYPES.has(file.type);
}

export function rejectionReason(file: File): string {
  if (REJECTED_IMAGE_TYPES.has(file.type)) return 'SVG images can’t be compressed this way';
  return 'not an image';
}

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

export async function readDimensions(blob: Blob): Promise<Dimensions> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    } catch {
      // Fall through to the <img> path (older Safari, odd colour profiles)
    }
  }
  return readDimensionsViaElement(blob);
}

// `file` must be the user's original; re-encoding a previous result compounds the loss
export async function compressImage(
  file: File,
  source: Dimensions,
  settings: CompressSettings,
  signal?: AbortSignal,
): Promise<CompressOutcome> {
  const { default: imageCompression } = await import('browser-image-compression');

  const targetType = resolveOutputType(file.type, settings.format);
  const maxWidthOrHeight = resolveMaxDimension(source, settings.resize);

  const compressed = await imageCompression(file, {
    // Leave false: the library's worker path fetches a script from a CDN at runtime
    useWebWorker: false,
    // Quality-driven, not size-driven, so there is no size budget to iterate towards
    maxSizeMB: Number.POSITIVE_INFINITY,
    maxIteration: 1,
    alwaysKeepResolution: true,
    initialQuality: settings.quality / 100,
    fileType: targetType,
    preserveExif: false,
    ...(maxWidthOrHeight === undefined ? {} : { maxWidthOrHeight }),
    ...(signal ? { signal } : {}),
  });

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

// `worker` must swallow its own failures, or one rejection abandons the rest of the batch
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

export async function buildZip(entries: readonly { name: string; blob: Blob }[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.name, entry.blob);
  }
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/not an image/i.test(raw)) return 'Not a readable image file.';
  if (/decoded as an image/i.test(raw)) return 'This file could not be decoded — it may be corrupt.';
  if (/memory|allocation/i.test(raw)) return 'Ran out of memory — this image is too large.';
  return raw.trim() ? raw.trim().slice(0, 140) : 'Compression failed for this image.';
}
