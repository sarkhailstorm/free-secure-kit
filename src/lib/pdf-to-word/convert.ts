import type { ISectionOptions } from 'docx';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfToolsError } from '@/lib/pdf-tools/errors';
import { tick, type LoadedPdf } from '@/lib/pdf-tools/pdf';
import { MAX_FRAMES_PER_PAGE } from './constants';
import { editableSections } from './emit/editable';
import { boxCount, exactSections, type ExactImage, type PageLayout } from './emit/exact';
import { encodeImage, resetImageBudget } from './emit/images';
import { loadImageObject } from './extract/glyphs';
import { readPage, releasePage } from './extract/page';
import { buildLines } from './layout/lines';
import { buildModel } from './layout/model';
import { buildReport, packDocument } from './pack';
import { SCAN_DPI, rasterPage } from './scanned';
import type {
  ConversionNote,
  DocModel,
  FontInfo,
  ImageBlock,
  ImagePlacement,
  Line,
  PageFacts,
  Pt,
  WordOptions,
  WordProgress,
  WordResult,
} from './types';

/** Word's own default side margin — the only text width an image is sure to fit. */
const SAFE_MARGIN: Pt = 72;
/** Equal gaps either side within this are a picture the author centred. */
const CENTRE_TOL: Pt = 6;
/** Past this share of pages failing, the remainder isn't worth handing back. */
const FAILURE_SHARE = 0.5;

interface Picture {
  place: ImagePlacement;
  data: Uint8Array;
  type: 'png' | 'jpg';
}

interface PageRead {
  facts: PageFacts;
  lines: Line[];
  pictures: Picture[];
}

interface ImageTally {
  downscaled: number;
  dropped: number;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PdfToolsError('Conversion cancelled.');
}

async function encodePictures(
  doc: PDFDocumentProxy,
  facts: PageFacts,
  options: WordOptions,
  pdfBytes: Uint8Array,
  tally: ImageTally,
): Promise<Picture[]> {
  // A whole-page picture already holds every image on it, and a scan's bitmap stays out of Editable mode.
  if (facts.raster || facts.cls !== 'text' || facts.images.length === 0) return [];

  const page = await doc.getPage(facts.pageNumber);
  const out: Picture[] = [];

  for (const place of facts.images) {
    throwIfAborted(options.signal);
    // Images drawn straight into the page content have no id to fetch them by.
    if (place.objId === null) continue;
    try {
      const encoded = await encodeImage(
        await loadImageObject(page, place.objId),
        place,
        pdfBytes,
      );
      if (!encoded) {
        tally.dropped += 1;
        continue;
      }
      if (encoded.downscaled) tally.downscaled += 1;
      out.push({ place, data: encoded.data, type: encoded.type });
    } catch {
      tally.dropped += 1;
    }
  }

  return out;
}

async function readOnePage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  fonts: Map<string, FontInfo>,
  options: WordOptions,
  pdfBytes: Uint8Array,
  tally: ImageTally,
): Promise<PageRead> {
  const facts = await readPage(doc, pageNumber, fonts, options);
  const exact = options.mode === 'exact';
  const lines = exact ? buildLines(facts.spans, facts.bodySize) : [];

  // More boxes than Word can place: photograph the page rather than rebuild it.
  if (exact && boxCount(lines, fonts) > MAX_FRAMES_PER_PAGE && !facts.raster) {
    const page = await doc.getPage(pageNumber);
    facts.raster = await rasterPage(
      page,
      page.getViewport({ scale: 1 }),
      SCAN_DPI,
      options.signal,
    ).catch(() => undefined);
    if (facts.raster) {
      facts.cls = 'rasterFallback';
      facts.degradeReason = 'too-many-lines';
    }
  }

  return { facts, lines, pictures: await encodePictures(doc, facts, options, pdfBytes, tally) };
}

function imageBlock(picture: Picture, facts: PageFacts): ImageBlock {
  const { rect } = picture.place;
  // Word will not shrink an oversized picture itself, so it is fitted here.
  const scale = Math.min(1, (facts.width - 2 * SAFE_MARGIN) / Math.max(1, rect.w));
  const centred = Math.abs(rect.x - (facts.width - rect.x - rect.w)) <= CENTRE_TOL;
  return {
    kind: 'image',
    placement: picture.place,
    data: picture.data,
    type: picture.type,
    widthPt: rect.w * scale,
    heightPt: rect.h * scale,
    align: centred ? 'center' : 'left',
    alt: null,
  };
}

function picturesByPage(
  reads: readonly PageRead[],
  options: WordOptions,
): Map<number, ImageBlock[]> {
  const out = new Map<number, ImageBlock[]>();
  // Exact mode positions its own pictures from the same bytes.
  if (options.mode === 'exact') return out;
  for (const read of reads) {
    if (read.pictures.length === 0) continue;
    out.set(
      read.facts.index,
      read.pictures.map((picture) => imageBlock(picture, read.facts)),
    );
  }
  return out;
}

async function packOrExplain(sections: ISectionOptions[], model: DocModel): Promise<Blob> {
  try {
    return await packDocument(sections, model);
  } catch {
    throw new PdfToolsError(
      'This PDF is too big to fit in one Word file. Try a few pages at a time.',
    );
  }
}

export async function openDocument(source: LoadedPdf): Promise<PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return pdfjs.getDocument({
    data: source.bytes.slice(),
    // Raw image bytes rather than an ImageBitmap, whose pixels cannot be read back.
    isOffscreenCanvasSupported: false,
    // A user who opens the console should see their own errors, not pdf.js font chatter.
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  }).promise;
}

export async function convert(
  source: LoadedPdf,
  options: WordOptions,
  onProgress: (progress: WordProgress) => void,
): Promise<WordResult> {
  const doc = await openDocument(source);

  resetImageBudget();
  const fonts = new Map<string, FontInfo>();
  const reads: PageRead[] = [];
  const failed: number[] = [];
  const tally: ImageTally = { downscaled: 0, dropped: 0 };

  try {
    const total = doc.numPages;

    for (let i = 0; i < total; i++) {
      throwIfAborted(options.signal);
      onProgress({ stage: 'reading', done: i, total, page: i + 1 });
      await tick();

      try {
        reads.push(await readOnePage(doc, i + 1, fonts, options, source.bytes, tally));
      } catch (err) {
        if (options.signal?.aborted) throw err;
        failed.push(i + 1);
      }
    }

    if (failed.length > FAILURE_SHARE * total) {
      throw new PdfToolsError(
        'Most of the pages in this PDF couldn’t be read. It may be damaged.',
      );
    }
    throwIfAborted(options.signal);
    onProgress({ stage: 'analysing', done: total, total });
    await tick();

    const model = buildModel(
      reads.map((read) => read.facts),
      fonts,
      options,
      picturesByPage(reads, options),
    );

    const extra: ConversionNote[] = [];
    if (failed.length > 0) extra.push({ code: 'pageFailed', pages: failed });
    if (tally.downscaled > 0) extra.push({ code: 'imageDownscaled', count: tally.downscaled });
    if (tally.dropped > 0) extra.push({ code: 'imagesDropped', count: tally.dropped });
    model.notes.push(...extra);

    const layouts: PageLayout[] = reads.map((read) => ({
      facts: read.facts,
      lines: read.lines,
      images: read.pictures.map(
        (picture): ExactImage => ({
          rect: picture.place.rect,
          data: picture.data,
          type: picture.type,
          rotationDeg: picture.place.rotationDeg,
        }),
      ),
      fonts,
      bodyFamily: model.body.family,
    }));

    onProgress({ stage: 'writing', done: total, total });
    await tick();

    const sections =
      options.mode === 'exact'
        ? await exactSections(layouts, options)
        : await editableSections(model, options, fonts);

    throwIfAborted(options.signal);
    const blob = await packOrExplain(sections, model);

    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      report: buildReport({ layouts, model, pageCount: total }, options),
    };
  } finally {
    for (const read of reads) releasePage(read.facts);
    void doc.destroy().catch(() => undefined);
  }
}
