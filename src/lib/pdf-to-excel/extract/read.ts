import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfToolsError } from '@/lib/pdf-tools/errors';
import { tick } from '@/lib/pdf-tools/pdf';
import { readPage, releasePage } from '@/lib/pdf-to-word/extract/page';
import { buildLines } from '@/lib/pdf-to-word/layout/lines';
import { mergeCollinear } from '@/lib/pdf-to-word/layout/rules';
import type {
  FillBox,
  FontInfo,
  Line,
  PageClass,
  Pt,
  RuleSeg,
  StructIndex,
} from '@/lib/pdf-to-word/types';
import type { ExcelOptions } from '../types';

// One page reduced to what a table needs; the page's own facts are released as soon as this is built
export interface PageRead {
  pageNumber: number;
  cls: PageClass;
  width: Pt;
  height: Pt;
  bodySize: Pt;
  lines: Line[];
  struct: StructIndex;
  rules: RuleSeg[];
  fills: FillBox[];
  // True when the tree tags every character on the page
  tagged: boolean;
}

export async function readPages(
  doc: PDFDocumentProxy,
  options: ExcelOptions,
  onPage: (pageNumber: number) => void,
): Promise<{ pages: PageRead[]; failed: number[] }> {
  const { structCovers } = await import('@/lib/pdf-to-word/extract/struct');
  const fonts = new Map<string, FontInfo>();
  const pages: PageRead[] = [];
  const failed: number[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    if (options.signal?.aborted) throw new PdfToolsError('Cancelled.');
    onPage(n);
    await tick();

    try {
      // No page is ever turned into a picture: this tool has no use for one
      const facts = await readPage(doc, n, fonts, {
        mode: 'editable',
        imagesForScannedPages: false,
        signal: options.signal,
      });
      pages.push({
        pageNumber: n,
        cls: facts.cls,
        width: facts.width,
        height: facts.height,
        bodySize: facts.bodySize,
        lines: facts.cls === 'text' ? buildLines(facts.spans, facts.bodySize) : [],
        struct: facts.struct,
        rules: mergeCollinear(facts.rules),
        fills: facts.fills,
        tagged: facts.struct.present && structCovers(facts.struct, facts.spans),
      });
      releasePage(facts);
    } catch (err) {
      if (options.signal?.aborted) throw err;
      failed.push(n);
    }
  }

  return { pages, failed };
}
