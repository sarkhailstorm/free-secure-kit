/**
 * PDF to Word, entirely in this browser tab. Nothing here talks to a network,
 * and the heavy libraries are only imported once a conversion actually starts.
 */

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

/** What page 1 is made of, so a scan can be owned up to before the whole run. */
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
