import { PdfToolsError } from './errors';
import { tick } from './pdf';

export type PageSizeId = 'a4' | 'letter' | 'legal' | 'a3' | 'a5' | 'fit';
export type OrientationId = 'auto' | 'portrait' | 'landscape';
export type MarginId = 'none' | 'small' | 'medium' | 'large';
export type QualityId = 'original' | 'balanced' | 'smaller';

/** Points (1/72 inch), portrait, matching pdf-lib's own PageSizes. */
const PAGE_POINTS: Record<Exclude<PageSizeId, 'fit'>, readonly [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
};

const MARGIN_POINTS: Record<MarginId, number> = {
  none: 0,
  small: 18,
  medium: 36,
  large: 72,
};

/** A CSS pixel is 1/96in and a point 1/72in. Also the cap on enlargement. */
const POINTS_PER_PIXEL = 72 / 96;

/** Resampling targets. `null` never resamples. */
const QUALITY_DPI: Record<QualityId, number | null> = {
  original: null,
  balanced: 150,
  smaller: 96,
};

/** A forced re-encode is invisible to the user, so it must not be where artefacts appear. */
const REENCODE_QUALITY = 0.82;
/** iOS caps total canvas area and returns a blank canvas rather than throwing. */
const MAX_RASTER_PIXELS = 16_777_216;
/** More than any APP1 segment needs. */
const HEAD_BYTES = 65_536;

export const PAGE_SIZE_LABELS: Record<PageSizeId, string> = {
  a4: 'A4',
  letter: 'Letter',
  legal: 'Legal',
  a3: 'A3',
  a5: 'A5',
  fit: 'Match each image',
};

export const MARGIN_LABELS: Record<MarginId, string> = {
  none: 'None',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

export const QUALITY_LABELS: Record<QualityId, string> = {
  original: 'Original',
  balanced: 'Balanced',
  smaller: 'Smaller file',
};

export interface ImageToPdfOptions {
  pageSize: PageSizeId;
  orientation: OrientationId;
  margin: MarginId;
  quality: QualityId;
}

export const DEFAULT_IMAGE_OPTIONS: ImageToPdfOptions = {
  pageSize: 'a4',
  orientation: 'auto',
  margin: 'small',
  quality: 'balanced',
};

export interface LoadedImage {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
  /** Stored pixels, 0 when the header could not be read cheaply. */
  width: number;
  height: number;
  /** Object URL for the preview thumbnail. The caller revokes it. */
  previewUrl: string;
}

export interface SkippedImage {
  name: string;
  reason: string;
}

export interface ImagesToPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  skipped: SkippedImage[];
}

let nextId = 1;

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|avif|gif|bmp|ico|tiff?|heic|heif)$/i;

export function looksLikeImage(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name);
}

interface Probe {
  kind: 'jpeg' | 'png' | 'other';
  width: number;
  height: number;
  /** EXIF 1-8. Anything but 1 means the stored pixels are not upright. */
  orientation: number;
  /** Progressive, arithmetic and 12-bit JPEGs embed fine and then render wrong. */
  embeddable: boolean;
  components: number;
  alpha: boolean;
}

const BLANK: Probe = {
  kind: 'other',
  width: 0,
  height: 0,
  orientation: 1,
  embeddable: false,
  components: 3,
  alpha: false,
};

export function probeJpeg(bytes: Uint8Array): Probe | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const probe: Probe = { ...BLANK, kind: 'jpeg' };
  let pos = 2;

  while (pos + 4 <= view.byteLength) {
    // Resync over fill bytes rather than giving up on the first one.
    if (view.getUint8(pos) !== 0xff) {
      pos++;
      continue;
    }
    const marker = view.getUint8(pos + 1);
    pos += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) break;

    const length = view.getUint16(pos, false);
    if (length < 2 || pos + length > view.byteLength) break;

    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && pos + 8 <= view.byteLength) {
      probe.height = view.getUint16(pos + 3, false);
      probe.width = view.getUint16(pos + 5, false);
      probe.components = view.getUint8(pos + 7);
      // Only baseline and extended sequential render reliably everywhere.
      probe.embeddable = (marker === 0xc0 || marker === 0xc1) && view.getUint8(pos + 2) === 8;
    }

    if (
      marker === 0xe1 &&
      length >= 16 &&
      view.getUint32(pos + 2, false) === 0x45786966 &&
      view.getUint16(pos + 6, false) === 0
    ) {
      probe.orientation = readExifOrientation(view, pos + 8, pos + length);
    }
    pos += length;
  }
  return probe;
}

function readExifOrientation(view: DataView, tiff: number, limit: number): number {
  if (tiff + 8 > limit) return 1;
  const endian = view.getUint16(tiff, false);
  if (endian !== 0x4949 && endian !== 0x4d4d) return 1;
  const little = endian === 0x4949;
  if (view.getUint16(tiff + 2, little) !== 0x2a) return 1;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > limit) return 1;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > limit) return 1;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

export function probePng(bytes: Uint8Array): Probe | null {
  if (
    bytes.length < 26 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const colourType = bytes[25];
  // 4 and 6 carry an alpha channel; a palette only does when tRNS is present.
  const alpha =
    colourType === 4 ||
    colourType === 6 ||
    (colourType === 3 && indexOfChunk(bytes, 'tRNS') >= 0);
  return {
    ...BLANK,
    kind: 'png',
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
    alpha,
  };
}

function indexOfChunk(bytes: Uint8Array, name: string): number {
  const [a, b, c, d] = [...name].map((ch) => ch.charCodeAt(0));
  for (let i = 8; i + 8 <= bytes.length && i < 4096; i++) {
    if (bytes[i] === a && bytes[i + 1] === b && bytes[i + 2] === c && bytes[i + 3] === d) return i;
  }
  return -1;
}

export async function readImage(file: File): Promise<LoadedImage> {
  if (!looksLikeImage(file)) {
    throw new PdfToolsError(`“${file.name}” isn’t an image, so it can’t be added.`);
  }
  if (file.size === 0) {
    throw new PdfToolsError(`“${file.name}” is empty.`);
  }

  let width = 0;
  let height = 0;
  try {
    const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
    const probe = probeJpeg(head) ?? probePng(head);
    if (probe) {
      width = probe.width;
      height = probe.height;
    }
  } catch {
    // Dimensions are optional here.
  }

  return {
    id: `img-${nextId++}`,
    name: file.name,
    size: file.size,
    type: file.type,
    file,
    width,
    height,
    previewUrl: URL.createObjectURL(file),
  };
}

/** Strips EXIF/XMP so GPS and camera details don't ride along into the PDF. */
function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const keep: { start: number; end: number }[] = [{ start: 0, end: 2 }];
  let pos = 2;

  while (pos + 4 <= view.byteLength) {
    if (view.getUint8(pos) !== 0xff) {
      pos++;
      continue;
    }
    const marker = view.getUint8(pos + 1);
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      keep.push({ start: pos, end: pos + 2 });
      pos += 2;
      continue;
    }
    if (marker === 0xda) {
      keep.push({ start: pos, end: bytes.length });
      break;
    }
    const length = view.getUint16(pos + 2, false);
    if (length < 2 || pos + 2 + length > bytes.length) break;
    const end = pos + 2 + length;
    const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!metadata) keep.push({ start: pos, end });
    pos = end;
  }

  // Never a subarray: pdf-lib reads .buffer and ignores byteOffset.
  const size = keep.reduce((sum, part) => sum + (part.end - part.start), 0);
  const out = new Uint8Array(size);
  let cursor = 0;
  for (const part of keep) {
    out.set(bytes.subarray(part.start, part.end), cursor);
    cursor += part.end - part.start;
  }
  return out;
}

interface Placement {
  pageW: number;
  pageH: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
  /** Size of the drawn picture in points, for choosing a resample target. */
  boxW: number;
  boxH: number;
}

/** Keep "match each image" inside something a printer can conceive of. */
const FIT_MAX = PAGE_POINTS.a3[1];
const FIT_MIN = 72;

function place(
  storedW: number,
  storedH: number,
  orientation: number,
  options: ImageToPdfOptions,
): Placement {
  const swap = orientation >= 5;
  const shownW = swap ? storedH : storedW;
  const shownH = swap ? storedW : storedH;
  const margin = MARGIN_POINTS[options.margin];

  let pageW: number;
  let pageH: number;
  let boxW: number;
  let boxH: number;

  if (options.pageSize === 'fit') {
    let scale = POINTS_PER_PIXEL;
    const longest = Math.max(shownW, shownH) * scale + margin * 2;
    if (longest > FIT_MAX) scale *= FIT_MAX / longest;
    if (Math.max(shownW, shownH) * scale < FIT_MIN) {
      scale = FIT_MIN / Math.max(1, Math.max(shownW, shownH));
    }
    boxW = shownW * scale;
    boxH = shownH * scale;
    pageW = boxW + margin * 2;
    pageH = boxH + margin * 2;
  } else {
    const [shortSide, longSide] = PAGE_POINTS[options.pageSize];
    const landscape =
      options.orientation === 'landscape' ||
      (options.orientation === 'auto' && shownW > shownH);
    pageW = landscape ? longSide : shortSide;
    pageH = landscape ? shortSide : longSide;
    const scale = Math.min(
      (pageW - margin * 2) / shownW,
      (pageH - margin * 2) / shownH,
      POINTS_PER_PIXEL,
    );
    boxW = shownW * scale;
    boxH = shownH * scale;
  }

  const left = (pageW - boxW) / 2;
  const bottom = (pageH - boxH) / 2;
  // drawImage sizes before rotating, and pivots on (x, y).
  const drawW = swap ? boxH : boxW;
  const drawH = swap ? boxW : boxH;

  const base = { pageW, pageH, width: drawW, height: drawH, boxW, boxH };
  switch (orientation) {
    case 3:
      return { ...base, x: left + boxW, y: bottom + boxH, rotate: 180 };
    case 6:
      return { ...base, x: left + boxW, y: bottom, rotate: 90 };
    case 8:
      return { ...base, x: left, y: bottom + boxH, rotate: -90 };
    default:
      return { ...base, x: left, y: bottom, rotate: 0 };
  }
}

interface Prepared {
  format: 'jpeg' | 'png';
  bytes: Uint8Array;
  orientation: number;
}

async function raster(
  file: File,
  targetW: number,
  targetH: number,
  alpha: boolean,
): Promise<Prepared> {
  // Pinned: the spec default for imageOrientation changed between versions.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let width = targetW > 0 ? Math.min(targetW, bitmap.width) : bitmap.width;
  let height = targetH > 0 ? Math.min(targetH, bitmap.height) : bitmap.height;

  if (width * height > MAX_RASTER_PIXELS) {
    const shrink = Math.sqrt(MAX_RASTER_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * shrink));
    height = Math.max(1, Math.floor(height * shrink));
  }
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));

  const canvas = document.createElement('canvas');
  try {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new PdfToolsError('This browser would not provide a 2D canvas.');
    if (!alpha) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, alpha ? 'image/png' : 'image/jpeg', REENCODE_QUALITY);
    });
    if (!blob) throw new PdfToolsError('The image could not be re-encoded.');
    return {
      format: alpha ? 'png' : 'jpeg',
      bytes: new Uint8Array(await blob.arrayBuffer()),
      orientation: 1,
    };
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

function describeImageError(err: unknown, name: string): string {
  if (err instanceof Error && err.name === 'PdfToolsError') return err.message;
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (/\.(heic|heif)$/i.test(name)) {
    return `“${name}” is a HEIC photo, which browsers can’t open. Export it as JPEG first.`;
  }
  if (/\.tiff?$/i.test(name)) {
    return `“${name}” is a TIFF, which browsers can’t open. Convert it to JPEG or PNG first.`;
  }
  if (/memory|allocation|Maximum call stack/i.test(message)) {
    return `“${name}” is too large for this browser tab to hold in memory.`;
  }
  return `“${name}” couldn’t be read as an image, so it was left out.`;
}

export async function imagesToPdf(
  images: readonly LoadedImage[],
  options: ImageToPdfOptions,
  onProgress: (done: number, total: number) => void,
): Promise<ImagesToPdfResult> {
  if (images.length === 0) {
    throw new PdfToolsError('Add at least one image first.');
  }

  const { PDFDocument, degrees, rgb } = await import('pdf-lib');
  const out = await PDFDocument.create();
  const skipped: SkippedImage[] = [];
  const dpi = QUALITY_DPI[options.quality];

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    onProgress(i, images.length);
    await tick();

    try {
      const bytes = new Uint8Array(await image.file.arrayBuffer());
      const probe = probeJpeg(bytes) ?? probePng(bytes) ?? { ...BLANK };

      let storedW = probe.width;
      let storedH = probe.height;
      if (storedW === 0 || storedH === 0) {
        const bitmap = await createImageBitmap(image.file, { imageOrientation: 'from-image' });
        storedW = bitmap.width;
        storedH = bitmap.height;
        bitmap.close();
        probe.orientation = 1;
      }

      const box = place(storedW, storedH, probe.orientation, options);

      let targetW = 0;
      let targetH = 0;
      if (dpi !== null) {
        const swap = probe.orientation >= 5;
        const shownW = swap ? storedH : storedW;
        const shownH = swap ? storedW : storedH;
        const allowedW = Math.ceil((box.boxW / 72) * dpi);
        const allowedH = Math.ceil((box.boxH / 72) * dpi);
        if (shownW > allowedW || shownH > allowedH) {
          const shrink = Math.min(allowedW / shownW, allowedH / shownH);
          targetW = Math.max(1, Math.round(storedW * shrink));
          targetH = Math.max(1, Math.round(storedH * shrink));
        }
      }

      const passThrough =
        probe.kind === 'jpeg' &&
        probe.embeddable &&
        probe.components !== 4 &&
        targetW === 0 &&
        (probe.orientation === 1 ||
          probe.orientation === 3 ||
          probe.orientation === 6 ||
          probe.orientation === 8);

      let ready: Prepared;
      if (passThrough) {
        ready = { format: 'jpeg', bytes: stripJpegMetadata(bytes), orientation: probe.orientation };
      } else if (probe.kind === 'png' && targetW === 0) {
        // pdf-lib re-flates PNG rather than passing it through; pixels survive.
        ready = { format: 'png', bytes, orientation: 1 };
      } else {
        ready = await raster(image.file, targetW, targetH, probe.alpha);
      }

      const embedded =
        ready.format === 'jpeg'
          ? await out.embedJpg(ready.bytes)
          : await out.embedPng(ready.bytes);

      const spot =
        ready.orientation === probe.orientation
          ? box
          : place(embedded.width, embedded.height, 1, options);

      const page = out.addPage([spot.pageW, spot.pageH]);
      // A page has no background, so transparency would vanish in dark viewers.
      page.drawRectangle({
        x: (spot.pageW - spot.boxW) / 2,
        y: (spot.pageH - spot.boxH) / 2,
        width: spot.boxW,
        height: spot.boxH,
        color: rgb(1, 1, 1),
      });
      page.drawImage(embedded, {
        x: spot.x,
        y: spot.y,
        width: spot.width,
        height: spot.height,
        rotate: degrees(spot.rotate),
      });
    } catch (err) {
      skipped.push({ name: image.name, reason: describeImageError(err, image.name) });
    }
  }

  onProgress(images.length, images.length);

  if (out.getPageCount() === 0) {
    throw new PdfToolsError(
      images.length === 1
        ? (skipped[0]?.reason ?? 'That image could not be added to a PDF.')
        : 'None of those images could be turned into pages.',
    );
  }

  out.setProducer('FreeSecureKit');
  return {
    bytes: await out.save({ useObjectStreams: true, addDefaultPage: false }),
    pageCount: out.getPageCount(),
    skipped,
  };
}
