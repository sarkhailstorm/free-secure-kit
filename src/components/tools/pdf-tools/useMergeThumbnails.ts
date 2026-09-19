'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { describePdfError } from '@/lib/pdf-tools/errors';
import { planKey, type LoadedPdf } from '@/lib/pdf-tools/pdf';
import { renderPage } from './useThumbnails';

/** pdf.js keeps its own copy of the bytes per open document, so hold few. */
const MAX_OPEN_DOCS = 3;
/** A preview is roughly 5-15 KB, so this caps blob memory in the low tens of MB. */
const MAX_CACHED_URLS = 600;

export interface MergeThumbnails {
  urls: Record<string, string>;
  failed: Record<string, true>;
  broken: Record<string, string>;
  outstanding: number;
  request: (fileId: string, page: number) => void;
}

export function useMergeThumbnails(
  items: readonly LoadedPdf[],
  active: boolean,
): MergeThumbnails {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [broken, setBroken] = useState<Record<string, string>>({});
  const [outstanding, setOutstanding] = useState(0);

  const files = useRef<Map<string, LoadedPdf>>(new Map());
  const docs = useRef<Map<string, PDFDocumentProxy>>(new Map());
  const queue = useRef<{ fileId: string; page: number }[]>([]);
  const queued = useRef<Set<string>>(new Set());
  const settled = useRef<Set<string>>(new Set());
  const liveUrls = useRef<Map<string, string>>(new Map());
  const urlOrder = useRef<string[]>([]);
  const brokenIds = useRef<Set<string>>(new Set());
  const draining = useRef(false);
  const wanted = useRef(false);

  const closeDoc = useCallback((fileId: string) => {
    const doc = docs.current.get(fileId);
    if (!doc) return;
    docs.current.delete(fileId);
    void doc.destroy().catch(() => undefined);
  }, []);

  const capUrls = useCallback(() => {
    if (urlOrder.current.length <= MAX_CACHED_URLS) return;
    const dropped: string[] = [];
    while (urlOrder.current.length > MAX_CACHED_URLS) {
      const key = urlOrder.current.shift();
      if (key === undefined) break;
      const url = liveUrls.current.get(key);
      if (url) {
        URL.revokeObjectURL(url);
        liveUrls.current.delete(key);
      }
      settled.current.delete(key);
      dropped.push(key);
    }
    if (dropped.length === 0) return;
    setUrls((previous) => {
      const next = { ...previous };
      for (const key of dropped) delete next[key];
      return next;
    });
  }, []);

  const openDoc = useCallback(
    async (fileId: string): Promise<PDFDocumentProxy | null> => {
      const existing = docs.current.get(fileId);
      if (existing) {
        // Touch for LRU: re-inserting moves it to the end of the Map.
        docs.current.delete(fileId);
        docs.current.set(fileId, existing);
        return existing;
      }

      const file = files.current.get(fileId);
      if (!file) return null;

      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const doc = await pdfjs.getDocument({ data: file.bytes.slice() }).promise;

        if (!files.current.has(fileId)) {
          void doc.destroy().catch(() => undefined);
          return null;
        }

        docs.current.set(fileId, doc);
        while (docs.current.size > MAX_OPEN_DOCS) {
          const oldest = docs.current.keys().next().value;
          if (oldest === undefined || oldest === fileId) break;
          closeDoc(oldest);
        }
        return doc;
      } catch (err) {
        if (!files.current.has(fileId)) return null;
        brokenIds.current.add(fileId);
        setBroken((previous) => ({ ...previous, [fileId]: describePdfError(err, file.name) }));
        return null;
      }
    },
    [closeDoc],
  );

  const drain = useCallback(async () => {
    if (draining.current) {
      wanted.current = true;
      return;
    }
    draining.current = true;

    try {
      do {
        wanted.current = false;

        while (queue.current.length > 0) {
          let at = queue.current.findIndex((job) => docs.current.has(job.fileId));
          if (at < 0) at = 0;
          const [job] = queue.current.splice(at, 1);
          if (!job) break;

          const key = planKey(job);
          const alive = () => files.current.has(job.fileId);

          try {
            if (!alive()) continue;

            if (brokenIds.current.has(job.fileId)) {
              settled.current.add(key);
              setFailed((previous) => ({ ...previous, [key]: true }));
              continue;
            }

            const doc = await openDoc(job.fileId);
            if (!alive()) continue;
            if (!doc) {
              settled.current.add(key);
              setFailed((previous) => ({ ...previous, [key]: true }));
              continue;
            }

            const url = await renderPage(doc, job.page);
            if (!alive()) {
              URL.revokeObjectURL(url);
              continue;
            }
            settled.current.add(key);
            liveUrls.current.set(key, url);
            urlOrder.current.push(key);
            setUrls((previous) => ({ ...previous, [key]: url }));
            capUrls();
          } catch {
            if (alive()) {
              settled.current.add(key);
              setFailed((previous) => ({ ...previous, [key]: true }));
            }
          } finally {
            queued.current.delete(key);
            setOutstanding(queue.current.length);
          }
        }
      } while (wanted.current && queue.current.length > 0);
    } finally {
      draining.current = false;
    }
  }, [openDoc, capUrls]);

  const request = useCallback(
    (fileId: string, page: number) => {
      const key = `${fileId}:${page}`;
      if (settled.current.has(key) || queued.current.has(key)) return;
      queued.current.add(key);
      queue.current.push({ fileId, page });
      setOutstanding(queue.current.length);
      void drain();
    },
    [drain],
  );

  useEffect(() => {
    files.current = new Map(items.map((file) => [file.id, file]));
    const live = new Set(items.map((file) => file.id));

    const goneKeys: string[] = [];
    for (const key of liveUrls.current.keys()) {
      if (!live.has(key.slice(0, key.lastIndexOf(':')))) goneKeys.push(key);
    }
    const goneDocs = [...docs.current.keys()].filter((id) => !live.has(id));
    const goneBroken = [...brokenIds.current].filter((id) => !live.has(id));

    for (const key of goneKeys) {
      const url = liveUrls.current.get(key);
      if (url) URL.revokeObjectURL(url);
      liveUrls.current.delete(key);
    }
    for (const id of goneDocs) closeDoc(id);
    for (const id of goneBroken) brokenIds.current.delete(id);

    const stale = (key: string) => !live.has(key.slice(0, key.lastIndexOf(':')));
    urlOrder.current = urlOrder.current.filter((key) => !stale(key));
    for (const key of [...settled.current]) if (stale(key)) settled.current.delete(key);
    for (const key of [...queued.current]) if (stale(key)) queued.current.delete(key);
    queue.current = queue.current.filter((job) => live.has(job.fileId));

    if (goneKeys.length > 0) {
      setUrls((previous) => {
        const next = { ...previous };
        for (const key of goneKeys) delete next[key];
        return next;
      });
    }
    setFailed((previous) => {
      const next: Record<string, true> = {};
      for (const key of Object.keys(previous)) if (!stale(key)) next[key] = true;
      return Object.keys(next).length === Object.keys(previous).length ? previous : next;
    });
    if (goneBroken.length > 0) {
      setBroken((previous) => {
        const next = { ...previous };
        for (const id of goneBroken) delete next[id];
        return next;
      });
    }
    setOutstanding(queue.current.length);
  }, [items, closeDoc]);

  useEffect(() => {
    if (active) return;
    for (const id of [...docs.current.keys()]) closeDoc(id);
  }, [active, closeDoc]);

  useEffect(() => {
    const urlsAtMount = liveUrls.current;
    const docsAtMount = docs.current;
    return () => {
      for (const url of urlsAtMount.values()) URL.revokeObjectURL(url);
      urlsAtMount.clear();
      for (const doc of docsAtMount.values()) void doc.destroy().catch(() => undefined);
      docsAtMount.clear();
    };
  }, []);

  return { urls, failed, broken, outstanding, request };
}
