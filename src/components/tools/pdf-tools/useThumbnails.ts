'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { describePdfError } from '@/lib/pdf-tools/errors';
import type { LoadedPdf } from '@/lib/pdf-tools/pdf';

/** Small enough that a 500-page document stays comfortably in memory. */
const SCALE = 0.3;
/** How many pages to draw unprompted. The rest wait to be scrolled into view. */
const EAGER_PAGES = 12;

export interface Thumbnails {
  urls: Record<number, string>;
  failed: Record<number, true>;
  opened: boolean;
  error: string | null;
  outstanding: number;
  request: (page: number) => void;
}


export function useThumbnails(source: LoadedPdf | null): Thumbnails {
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState<Record<number, true>>({});
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outstanding, setOutstanding] = useState(0);
  const generation = useRef(0);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const queue = useRef<number[]>([]);
  const queued = useRef<Set<number>>(new Set());
  const settled = useRef<Set<number>>(new Set());
  const draining = useRef(false);
  const wanted = useRef(false);
  const liveUrls = useRef<string[]>([]);

  const drain = useCallback(async () => {
    if (draining.current) {
      wanted.current = true;
      return;
    }
    draining.current = true;

    try {
      do {
        wanted.current = false;
        const mine = generation.current;

        while (queue.current.length > 0 && mine === generation.current) {
          const doc = docRef.current;
          if (!doc) break;
          const page = queue.current.shift();
          if (page === undefined) break;

          try {
            const url = await renderPage(doc, page);
            if (mine !== generation.current) {
              URL.revokeObjectURL(url);
            } else {
              liveUrls.current.push(url);
              settled.current.add(page);
              setUrls((previous) => ({ ...previous, [page]: url }));
            }
          } catch {
            if (mine === generation.current) {
              settled.current.add(page);
              setFailed((previous) => ({ ...previous, [page]: true }));
            }
          } finally {
            queued.current.delete(page);
            if (mine === generation.current) setOutstanding(queue.current.length);
          }
        }
      } while (wanted.current && docRef.current && queue.current.length > 0);
    } finally {
      draining.current = false;
    }
  }, []);

  const request = useCallback(
    (page: number) => {
      // Queueing before the document has opened is fine; drain() picks it up.
      if (settled.current.has(page) || queued.current.has(page)) return;
      queued.current.add(page);
      queue.current.push(page);
      setOutstanding(queue.current.length);
      void drain();
    },
    [drain],
  );

  useEffect(() => {
    generation.current += 1;
    const mine = generation.current;

    const stale = liveUrls.current;
    liveUrls.current = [];
    stale.forEach((url) => URL.revokeObjectURL(url));
    const previousDoc = docRef.current;
    docRef.current = null;
    queue.current = [];
    queued.current = new Set();
    settled.current = new Set();
    if (previousDoc) void previousDoc.destroy().catch(() => undefined);

    setUrls({});
    setFailed({});
    setOutstanding(0);
    setOpened(false);
    setError(null);

    if (!source) return;

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const doc = await pdfjs.getDocument({ data: source.bytes.slice() }).promise;

        if (mine !== generation.current) {
          void doc.destroy().catch(() => undefined);
          return;
        }
        docRef.current = doc;
        setOpened(true);

        const eager = Math.min(EAGER_PAGES, source.pageCount);
        for (let page = 1; page <= eager; page++) {
          if (queued.current.has(page)) continue;
          queued.current.add(page);
          queue.current.push(page);
        }
        setOutstanding(queue.current.length);
        void drain();
      } catch (err) {
        if (mine !== generation.current) return;
        queue.current = [];
        queued.current = new Set();
        setOutstanding(0);
        setError(describePdfError(err, source.name));
      }
    })();
  }, [source, drain]);

  useEffect(() => {
    return () => {
      generation.current += 1;
      liveUrls.current.forEach((url) => URL.revokeObjectURL(url));
      liveUrls.current = [];
      const doc = docRef.current;
      docRef.current = null;
      if (doc) void doc.destroy().catch(() => undefined);
    };
  }, []);

  return { urls, failed, opened, error, outstanding, request };
}

export async function renderPage(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext('2d');

  try {
    if (!context) throw new Error('This browser would not provide a 2D canvas.');
    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.72);
    });
    if (!blob) throw new Error('The preview could not be encoded.');
    return URL.createObjectURL(blob);
  } finally {
    page.cleanup();
    // Release the backing store now rather than waiting for the collector.
    canvas.width = 0;
    canvas.height = 0;
  }
}
