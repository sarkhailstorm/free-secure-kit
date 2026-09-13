/**
 * All the PDF work, kept away from React.
 *
 * Every function here runs in the browser tab that called it. pdf-lib and
 * jszip are imported dynamically inside the functions that need them so they
 * never land in the initial page bundle, and nothing is ever sent anywhere:
 * bytes go File -> memory -> Blob -> your downloads folder.
 */

import type {
  PDFContext as PdfContext,
  PDFDict as PdfDict,
  PDFObject as PdfObject,
  PDFRawStream as PdfRawStream,
  PDFRef as PdfRef,
} from 'pdf-lib';
import { PdfToolsError } from './errors';
import { describeGroup } from './ranges';
import { baseName } from '@/lib/format';
import { safeFilename } from '@/lib/download';

/** A PDF the user has handed us, already parsed enough to describe. */
export interface LoadedPdf {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  /** The original file bytes. Every operation works from a copy of these. */
  bytes: Uint8Array;
}

export interface NamedPdf {
  name: string;
  bytes: Uint8Array;
  pages: number[];
}

let nextId = 1;

/** Let the browser paint before we hog the main thread again. */
export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Build a download name that always still ends in its extension.
 *
 * `safeFilename` caps at 180 characters, so a long original name — or a
 * scattered selection like "pages 1, 3, 5, 7, …" — would otherwise be cut off
 * mid-way and lose the ".pdf", leaving the user with an extensionless file.
 * Array spreading rather than `slice` so a trim never splits a surrogate pair.
 */
export function downloadName(base: string, extension: string, fallback: string): string {
  const chars = [...base];
  const capped = chars.length > 120 ? `${chars.slice(0, 120).join('').trimEnd()}…` : base;
  return safeFilename(`${capped}.${extension}`, fallback);
}

/**
 * "pages 4-9" for something contiguous, but a plain count once the list is so
 * scattered that spelling it out would swamp the filename.
 */
export function groupLabel(pages: readonly number[]): string {
  const described = describeGroup([...pages]);
  return described.length > 48 ? `${pages.length} pages` : described;
}

/**
 * Read a picked file and count its pages.
 *
 * Loading with `ignoreEncryption` left at its default is deliberate: it makes
 * pdf-lib throw for password-protected files, which is exactly the case we
 * want to report by name rather than fail mysteriously later.
 */
export async function readPdf(file: File): Promise<LoadedPdf> {
  const { PDFDocument } = await import('pdf-lib');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
  const pageCount = doc.getPageCount();
  if (pageCount === 0) {
    throw new PdfToolsError(
      `“${file.name}” opened, but it contains no pages at all.`,
    );
  }
  return {
    id: `pdf-${nextId++}`,
    name: file.name,
    size: file.size,
    pageCount,
    bytes,
  };
}

/* ------------------------------------------------------------------ merge */

export async function mergePdfs(
  items: readonly LoadedPdf[],
  onProgress: (done: number, total: number) => void,
): Promise<Uint8Array> {
  if (items.length === 0) {
    throw new PdfToolsError('There are no PDFs queued up to merge.');
  }

  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();

  for (let i = 0; i < items.length; i++) {
    onProgress(i, items.length);
    await tick();
    const src = await PDFDocument.load(items[i].bytes.slice(), { updateMetadata: false });
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const page of copied) out.addPage(page);
  }

  onProgress(items.length, items.length);
  out.setProducer('Privly');
  return out.save({ useObjectStreams: true, addDefaultPage: false });
}

/* ------------------------------------------------------------------ split */

/**
 * Reject a page list that would silently produce nonsense — an empty document,
 * or a page that is not in the source. pdf-lib itself fails these with an
 * internal TypeError, which is no use to anyone reading the screen.
 */
function checkPages(source: LoadedPdf, pages: readonly number[]): void {
  if (pages.length === 0) {
    throw new PdfToolsError('Choose at least one page first — an empty PDF is not much use.');
  }
  for (const page of pages) {
    if (!Number.isInteger(page) || page < 1 || page > source.pageCount) {
      throw new PdfToolsError(
        `“${source.name}” has ${source.pageCount} ${source.pageCount === 1 ? 'page' : 'pages'}, so page ${page} can’t be pulled out of it.`,
      );
    }
  }
}

/** Pull the given 1-based pages into a single new document. */
export async function extractPages(
  source: LoadedPdf,
  pages: readonly number[],
): Promise<Uint8Array> {
  checkPages(source, pages);
  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(source.bytes.slice(), { updateMetadata: false });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    pages.map((p) => p - 1),
  );
  for (const page of copied) out.addPage(page);
  out.setProducer('Privly');
  return out.save({ useObjectStreams: true, addDefaultPage: false });
}

/** Build one document per group of pages, named after the original file. */
export async function splitIntoFiles(
  source: LoadedPdf,
  groups: readonly number[][],
  onProgress: (done: number, total: number) => void,
): Promise<NamedPdf[]> {
  for (const group of groups) checkPages(source, group);

  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(source.bytes.slice(), { updateMetadata: false });
  const stem = baseName(source.name);
  const files: NamedPdf[] = [];

  for (let i = 0; i < groups.length; i++) {
    onProgress(i, groups.length);
    await tick();
    const pages = groups[i];
    const out = await PDFDocument.create();
    const copied = await out.copyPages(
      src,
      pages.map((p) => p - 1),
    );
    for (const page of copied) out.addPage(page);
    out.setProducer('Privly');
    files.push({
      name: downloadName(`${stem} - ${groupLabel(pages)}`, 'pdf', `part-${i + 1}.pdf`),
      bytes: await out.save({ useObjectStreams: true, addDefaultPage: false }),
      pages,
    });
  }

  onProgress(groups.length, groups.length);
  return files;
}

/** Bundle several outputs into one archive. PDFs are already compressed, so
 *  the archive is stored rather than deflated — much faster, same size. */
export async function zipFiles(
  files: readonly NamedPdf[],
  onProgress: (done: number, total: number) => void,
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set<string>();

  for (const file of files) {
    let name = file.name;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      name = downloadName(`${baseName(file.name)} (${n++})`, 'pdf', `part-${n}.pdf`);
    }
    used.add(name.toLowerCase());
    zip.file(name, file.bytes);
  }

  return zip.generateAsync({ type: 'blob', compression: 'STORE' }, (meta) => {
    onProgress(Math.round(meta.percent), 100);
  });
}

/* --------------------------------------------------------------- compress */

export type CompressStage = 'reading' | 'images' | 'saving';

export interface CompressProgress {
  stage: CompressStage;
  done: number;
  total: number;
}

export interface CompressReport {
  /** The bytes the user should actually download. */
  bytes: Uint8Array;
  originalSize: number;
  /** Size of our re-saved document, even when that turned out to be bigger. */
  rebuiltSize: number;
  /** True when re-saving gained nothing, so we hand back the original file. */
  keptOriginal: boolean;
  pageCount: number;
  /** Every image XObject in the file. */
  imagesFound: number;
  /** Images stored as plain JPEG, which is all we can safely re-encode. */
  jpegImages: number;
  /** Images we actually replaced with a smaller version. */
  imagesRewritten: number;
  imageBytesBefore: number;
  imageBytesAfter: number;
}

/** Keys worth carrying across to a re-encoded image. */
const CARRY_OVER = ['SMask', 'Mask', 'Intent', 'Interpolate', 'OC', 'StructParent'];

/** Below this an image is not worth the round trip through a canvas. */
const MIN_IMAGE_BYTES = 4 * 1024;
/** Only swap an image in when the new one is a real improvement. */
const MIN_IMAGE_GAIN = 0.97;

function nameOf(obj: PdfObject | undefined): string | null {
  // PDFName#asString() includes the leading slash: "/DCTDecode".
  const asString = (obj as { asString?: () => string } | undefined)?.asString;
  if (typeof asString !== 'function') return null;
  const value = asString.call(obj);
  return typeof value === 'string' && value.startsWith('/') ? value.slice(1) : null;
}

/**
 * Shrink a PDF by re-encoding its JPEG images at a lower quality, plus the
 * free structural wins (object streams, dropping XMP and application private
 * data). Pure JS cannot do much more than this: images that are not stored as
 * plain JPEG are left untouched rather than risked, and the report says so.
 */
export async function compressPdf(
  source: LoadedPdf,
  quality: number,
  onProgress: (progress: CompressProgress) => void,
): Promise<CompressReport> {
  const lib = await import('pdf-lib');
  const { PDFDocument, PDFName, PDFNumber, PDFDict, PDFArray, PDFRawStream, PDFBool } = lib;

  onProgress({ stage: 'reading', done: 0, total: 0 });
  await tick();

  const originalSize = source.bytes.byteLength;
  const doc = await PDFDocument.load(source.bytes.slice(), { updateMetadata: false });
  const ctx = doc.context;
  const pageCount = doc.getPageCount();

  // --- free wins: XMP packets and editor scratch data are often several KB.
  doc.catalog.delete(PDFName.of('Metadata'));
  doc.catalog.delete(PDFName.of('PieceInfo'));
  for (const page of doc.getPages()) {
    page.node.delete(PDFName.of('PieceInfo'));
  }
  doc.setProducer('Privly');

  const resolve = (dict: PdfDict, key: string): PdfObject | undefined =>
    ctx.lookup(dict.get(PDFName.of(key)));

  // --- find the image XObjects we are allowed to touch.
  const candidates: { ref: PdfRef; stream: PdfRawStream }[] = [];
  let imagesFound = 0;

  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (nameOf(resolve(dict, 'Subtype')) !== 'Image') continue;
    imagesFound++;

    // Stencil masks are 1-bit; a Decode array may invert the samples. Both
    // would be silently corrupted by a round trip through a canvas.
    const imageMask = resolve(dict, 'ImageMask');
    if (imageMask instanceof PDFBool && imageMask.asBoolean()) continue;
    if (resolve(dict, 'Decode')) continue;
    // A colour-key mask is expressed in the *original* colour space, which we
    // are about to replace with DeviceRGB.
    if (resolve(dict, 'Mask') instanceof PDFArray) continue;

    const filter = resolve(dict, 'Filter');
    let isJpeg = nameOf(filter) === 'DCTDecode';
    if (!isJpeg && filter instanceof PDFArray) {
      const names = filter.asArray().map((entry) => nameOf(ctx.lookup(entry)));
      isJpeg = names.length === 1 && names[0] === 'DCTDecode';
    }
    if (!isJpeg) continue;
    if (obj.getContentsSize() < MIN_IMAGE_BYTES) continue;

    candidates.push({ ref, stream: obj });
  }

  const jpegImages = candidates.length;
  let imagesRewritten = 0;
  let imageBytesBefore = 0;
  let imageBytesAfter = 0;

  onProgress({ stage: 'images', done: 0, total: jpegImages });

  for (let i = 0; i < candidates.length; i++) {
    const { ref, stream } = candidates[i];
    const before = stream.getContents();

    try {
      const reencoded = await reencodeJpeg(before, quality);
      if (reencoded && reencoded.byteLength < before.byteLength * MIN_IMAGE_GAIN) {
        const dict = PDFDict.withContext(ctx);
        dict.set(PDFName.of('Type'), PDFName.of('XObject'));
        dict.set(PDFName.of('Subtype'), PDFName.of('Image'));
        dict.set(PDFName.of('Width'), PDFNumber.of(reencoded.width));
        dict.set(PDFName.of('Height'), PDFNumber.of(reencoded.height));
        // A canvas always hands back 8-bit RGB, whatever went in.
        dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
        dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
        dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
        for (const key of CARRY_OVER) {
          const value = stream.dict.get(PDFName.of(key));
          if (value) dict.set(PDFName.of(key), value);
        }
        ctx.assign(ref, PDFRawStream.of(dict, reencoded.bytes));
        imagesRewritten++;
        imageBytesBefore += before.byteLength;
        imageBytesAfter += reencoded.byteLength;
      }
    } catch {
      // An image the browser cannot decode (CMYK oddity, JPEG the decoder
      // rejects) simply stays as it was. Never fatal.
    }

    onProgress({ stage: 'images', done: i + 1, total: jpegImages });
  }

  onProgress({ stage: 'saving', done: 0, total: 0 });
  await tick();

  // Everything we just unlinked — and anything the document had already
  // orphaned — would otherwise be written straight back out.
  dropUnreachableObjects(ctx, lib);

  const rebuilt = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  const rebuiltSize = rebuilt.byteLength;
  const keptOriginal = rebuiltSize >= originalSize;

  return {
    bytes: keptOriginal ? source.bytes : rebuilt,
    originalSize,
    rebuiltSize,
    keptOriginal,
    pageCount,
    imagesFound,
    jpegImages,
    imagesRewritten,
    imageBytesBefore,
    imageBytesAfter,
  };
}

/**
 * Delete indirect objects that nothing points at any more.
 *
 * pdf-lib faithfully writes back every object it parsed, including ones the
 * document itself abandoned: XMP packets we just unlinked, editor scratch
 * data, whole revisions left behind by an incremental save. Walking the graph
 * from the trailer and dropping the unreachable remainder is the only
 * structural saving available without touching page content.
 *
 * It is deliberately all-or-nothing. The reachable set is built first, and if
 * anything at all goes wrong while building it, not a single object is
 * removed and the document is saved exactly as it was parsed.
 */
function dropUnreachableObjects(
  ctx: PdfContext,
  lib: typeof import('pdf-lib'),
): number {
  const { PDFRef, PDFDict, PDFArray, PDFStream } = lib;
  const root = ctx.trailerInfo.Root;
  // Without a catalog we have no idea what is live. Do nothing.
  if (!root) return 0;

  const reachable = new Set<string>();

  try {
    const stack: PdfObject[] = [root];
    for (const seed of [ctx.trailerInfo.Info, ctx.trailerInfo.ID, ctx.trailerInfo.Encrypt]) {
      if (seed) stack.push(seed);
    }

    let steps = 0;
    while (stack.length > 0) {
      // A pathological file should degrade to "change nothing", not hang.
      if (++steps > 4_000_000) return 0;
      const obj = stack.pop();
      if (!obj) continue;

      if (obj instanceof PDFRef) {
        if (reachable.has(obj.tag)) continue;
        reachable.add(obj.tag);
        const target = ctx.lookup(obj);
        if (target) stack.push(target);
      } else if (obj instanceof PDFStream) {
        stack.push(obj.dict);
      } else if (obj instanceof PDFDict) {
        for (const value of obj.values()) stack.push(value);
      } else if (obj instanceof PDFArray) {
        for (const value of obj.asArray()) stack.push(value);
      }
    }
  } catch {
    return 0;
  }

  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!reachable.has(ref.tag)) {
      ctx.delete(ref);
      removed++;
    }
  }
  return removed;
}

interface Reencoded {
  bytes: Uint8Array;
  byteLength: number;
  width: number;
  height: number;
}

/**
 * Decode a JPEG, redraw it at its original size, and re-encode it at the
 * requested quality. Dimensions are preserved on purpose so that any soft
 * mask attached to the image still lines up.
 */
async function reencodeJpeg(jpeg: Uint8Array, quality: number): Promise<Reencoded | null> {
  // `none` keeps the stored sample order: a PDF positions an image itself, so
  // honouring an EXIF orientation tag here would rotate it on the page.
  const bitmap = await createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' }), {
    imageOrientation: 'none',
  });
  const width = bitmap.width;
  const height = bitmap.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return null;
  }

  // JPEG has no alpha; painting white first keeps any transparency sane.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob | null>((res) => {
    canvas.toBlob(res, 'image/jpeg', quality);
  });

  // Release the backing store straight away; scanned pages are enormous.
  canvas.width = 0;
  canvas.height = 0;

  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, byteLength: bytes.byteLength, width, height };
}

/**
 * The honest summary shown after compressing. It never invents a saving, and
 * explains *why* when there was nothing to gain.
 */
export function summariseCompression(report: CompressReport): {
  tone: 'good' | 'flat';
  headline: string;
  detail: string;
} {
  const outputSize = report.bytes.byteLength;
  const saved = report.originalSize - outputSize;
  const ratio = report.originalSize > 0 ? saved / report.originalSize : 0;

  if (report.keptOriginal) {
    return {
      tone: 'flat',
      headline: 'Nothing to gain here — your original is already smaller.',
      detail:
        'Rebuilding this PDF produced a larger file, so the download below is your original, untouched. That usually means it was already well optimised.',
    };
  }

  if (ratio >= 0.03) {
    return {
      tone: 'good',
      headline: `${Math.round(ratio * 100)}% smaller.`,
      detail:
        report.imagesRewritten > 0
          ? `Re-encoded ${report.imagesRewritten} of ${report.imagesFound} ${report.imagesFound === 1 ? 'image' : 'images'}, plus structural savings.`
          : 'Savings came from rebuilding the file structure and dropping unused metadata.',
    };
  }

  if (report.imagesFound === 0) {
    return {
      tone: 'flat',
      headline: 'This PDF is mostly text, so there was little to compress.',
      detail:
        'There are no embedded images to re-encode. Text and vector artwork are already stored compactly, and nothing here can shrink them further without losing the text.',
    };
  }

  if (report.jpegImages === 0) {
    return {
      tone: 'flat',
      headline: 'The images in this PDF aren’t in a format we can re-encode.',
      detail: `Found ${report.imagesFound} ${report.imagesFound === 1 ? 'image' : 'images'}, but none are stored as plain JPEG. Re-encoding the other formats in the browser would risk corrupting them, so they were left alone.`,
    };
  }

  return {
    tone: 'flat',
    headline: 'Barely any saving on this one.',
    detail: `Its ${report.jpegImages} JPEG ${report.jpegImages === 1 ? 'image is' : 'images are'} already compressed at least as hard as this quality setting. Lowering the slider further may help a little.`,
  };
}
