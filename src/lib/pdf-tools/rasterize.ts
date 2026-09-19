import { PdfToolsError } from './errors';
import { downloadName, tick, type LoadedPdf, type NamedFile } from './pdf';
import { baseName } from '@/lib/format';

export type ImageFormat = 'png' | 'jpeg';
export type ImageQualityId = 'screen' | 'good' | 'print';

/** A CSS pixel is 1/96 inch, which is what a PDF point maps to on screen. */
const CSS_DPI = 96;
/** iOS caps total canvas area and hands back a blank canvas rather than throwing. */
const MAX_RASTER_PIXELS = 16_777_216;
const JPEG_QUALITY = 0.9;

export const IMAGE_FORMAT_LABELS: Record<ImageFormat, string> = {
  png: 'PNG — sharp text, bigger files',
  jpeg: 'JPEG — smaller files, best for photos',
};

export const IMAGE_QUALITY_LABELS: Record<ImageQualityId, string> = {
  screen: 'Screen (96 DPI)',
  good: 'Good (150 DPI)',
  print: 'Print (300 DPI)',
};

const QUALITY_DPI: Record<ImageQualityId, number> = {
  screen: 96,
  good: 150,
  print: 300,
};

export interface ImageExportOptions {
  format: ImageFormat;
  quality: ImageQualityId;
}

export const DEFAULT_EXPORT_OPTIONS: ImageExportOptions = {
  format: 'png',
  quality: 'good',
};

export function imageExtension(format: ImageFormat): string {
  return format === 'jpeg' ? 'jpg' : 'png';
}

export function pixelsPerPage(widthPt: number, heightPt: number, quality: ImageQualityId): number {
  const scale = QUALITY_DPI[quality] / CSS_DPI;
  return Math.round(widthPt * scale) * Math.round(heightPt * scale);
}

export async function pagesToImages(
  source: LoadedPdf,
  pages: readonly number[],
  options: ImageExportOptions,
  onProgress: (done: number, total: number) => void,
): Promise<NamedFile[]> {
  if (pages.length === 0) {
    throw new PdfToolsError('Choose at least one page to save as an image.');
  }

  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: source.bytes.slice() }).promise;

  const stem = baseName(source.name);
  const extension = imageExtension(options.format);
  const type = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const out: NamedFile[] = [];

  try {
    for (let i = 0; i < pages.length; i++) {
      const number = pages[i];
      onProgress(i, pages.length);
      await tick();

      const page = await doc.getPage(number);
      const canvas = document.createElement('canvas');
      try {
        let scale = QUALITY_DPI[options.quality] / CSS_DPI;
        const base = page.getViewport({ scale });
        if (base.width * base.height > MAX_RASTER_PIXELS) {
          scale *= Math.sqrt(MAX_RASTER_PIXELS / (base.width * base.height));
        }
        const viewport = page.getViewport({ scale });

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const context = canvas.getContext('2d');
        if (!context) throw new PdfToolsError('This browser would not provide a 2D canvas.');

        // A PDF page has no background of its own, and JPEG has no alpha.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, type, options.format === 'jpeg' ? JPEG_QUALITY : undefined);
        });
        if (!blob) throw new PdfToolsError(`Page ${number} could not be turned into an image.`);

        out.push({
          name: downloadName(`${stem} - page ${number}`, extension, `page-${number}.${extension}`),
          bytes: new Uint8Array(await blob.arrayBuffer()),
        });
      } finally {
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  } finally {
    void doc.destroy().catch(() => undefined);
  }

  onProgress(pages.length, pages.length);
  return out;
}
