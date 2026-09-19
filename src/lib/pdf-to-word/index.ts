import type { LoadedPdf } from '@/lib/pdf-tools/pdf';
import { convert, openDocument } from './convert';
export { PAGE_WARN_THRESHOLD } from './constants';
import { readPage, releasePage } from './extract/page';
import type { PageClass, WordOptions, WordProgress, WordResult } from './types';

export type {
  ConversionNote,
  PageClass,
  WordMode,
  WordOptions,
  WordProgress,
  WordReport,
  WordResult,
  WordStage,
} from './types';

export function pdfToWord(
  source: LoadedPdf,
  options: WordOptions,
  onProgress: (progress: WordProgress) => void,
): Promise<WordResult> {
  return convert(source, options, onProgress);
}

export async function inspectFirstPage(source: LoadedPdf): Promise<PageClass> {
  const doc = await openDocument(source);
  try {
    const facts = await readPage(doc, 1, new Map(), {
      mode: 'editable',
      imagesForScannedPages: false,
    });
    releasePage(facts);
    return facts.cls;
  } finally {
    void doc.destroy().catch(() => undefined);
  }
}
