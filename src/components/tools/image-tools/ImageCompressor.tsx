'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, FileArchive, Images, LoaderCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import { downloadBlob } from '@/lib/download';
import { formatBytes, percentChange, plural } from '@/lib/format';
import {
  CONCURRENCY,
  buildZip,
  compressImage,
  isSupportedImage,
  readDimensions,
  readableError,
  rejectionReason,
  runWithConcurrency,
} from '@/lib/image-compressor/compress';
import { DEFAULT_SETTINGS, settingsKey, uniqueNames } from '@/lib/image-compressor/settings';
import type { CompressSettings, ImageItem, ReadyItem } from '@/lib/image-compressor/types';
import { ControlPanel } from './ControlPanel';
import { ImageCard } from './ImageCard';

const ZIP_NAME = 'compressed-images.zip';

let itemSequence = 0;
let runSequence = 0;

function makeItem(file: File): ImageItem {
  itemSequence += 1;
  return {
    id: `img-${itemSequence}`,
    file,
    status: 'queued',
    error: null,
    source: null,
    result: null,
    appliedKey: null,
    runId: null,
  };
}

function isReady(item: ImageItem): item is ReadyItem {
  return item.status === 'done' && item.result !== null;
}

export function ImageCompressor() {
  const toast = useToast();

  const [items, setItems] = useState<ImageItem[]>([]);
  const [settings, setSettings] = useState<CompressSettings>(DEFAULT_SETTINGS);
  const [activeRuns, setActiveRuns] = useState(0);
  const [zipping, setZipping] = useState(false);

  const urlsRef = useRef<Set<string>>(new Set());
  const runsRef = useRef<Set<AbortController>>(new Set());
  const removedRef = useRef<Set<string>>(new Set());
  const itemsRef = useRef<ImageItem[]>([]);
  const settingsRef = useRef<CompressSettings>(settings);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const processing = activeRuns > 0;

  const releaseUrl = useCallback((url: string | null | undefined) => {
    if (!url) return;
    // Guarded by the set, so calling this twice for the same URL is harmless.
    if (urlsRef.current.delete(url)) URL.revokeObjectURL(url);
  }, []);

  const abortAll = useCallback(() => {
    runsRef.current.forEach((controller) => controller.abort());
    runsRef.current.clear();
  }, []);

  useEffect(() => {
    const urls = urlsRef.current;
    const runs = runsRef.current;
    return () => {
      runs.forEach((controller) => controller.abort());
      runs.clear();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const startRun = useCallback(async (targets: readonly ImageItem[]) => {
    if (targets.length === 0) return;

    const controller = new AbortController();
    const { signal } = controller;
    runsRef.current.add(controller);
    runSequence += 1;
    const runId = runSequence;

    const runSettings = settingsRef.current;
    const key = settingsKey(runSettings);

    const revertToQueued = (id: string) => {
      setItems((prev) =>
        prev.map<ImageItem>((i) =>
          i.id === id && i.runId === runId && i.status === 'compressing'
            ? { ...i, status: 'queued', runId: null }
            : i,
        ),
      );
    };

    setActiveRuns((n) => n + 1);

    try {
      await new Promise((resolve) => setTimeout(resolve, 0));

      await runWithConcurrency(targets, CONCURRENCY, async (target) => {
        if (signal.aborted || removedRef.current.has(target.id)) return;

        setItems((prev) =>
          prev.map<ImageItem>((i) =>
            i.id === target.id ? { ...i, status: 'compressing', error: null, runId } : i,
          ),
        );

        await new Promise((resolve) => setTimeout(resolve, 0));
        if (removedRef.current.has(target.id)) return;
        if (signal.aborted) {
          revertToQueued(target.id);
          return;
        }

        try {
          const source = target.source ?? (await readDimensions(target.file));
          const outcome = await compressImage(target.file, source, runSettings, signal);

          if (removedRef.current.has(target.id)) return;
          if (signal.aborted) {
            revertToQueued(target.id);
            return;
          }

          const previewUrl = URL.createObjectURL(outcome.blob);
          urlsRef.current.add(previewUrl);

          setItems((prev) =>
            prev.map<ImageItem>((i) =>
              i.id === target.id
                ? {
                    ...i,
                    status: 'done',
                    error: null,
                    source,
                    result: { ...outcome, previewUrl },
                    appliedKey: key,
                    runId: null,
                  }
                : i,
            ),
          );
        } catch (err) {
          if (signal.aborted || removedRef.current.has(target.id)) {
            revertToQueued(target.id);
            return;
          }
          const message = readableError(err);
          setItems((prev) =>
            prev.map<ImageItem>((i) =>
              i.id === target.id ? { ...i, status: 'failed', error: message, runId: null } : i,
            ),
          );
        }
      });
    } finally {
      runsRef.current.delete(controller);
      setActiveRuns((n) => Math.max(0, n - 1));
    }
  }, []);

  const addFiles = useCallback(
    (incoming: File[]) => {
      const accepted: File[] = [];
      const rejected: { name: string; why: string }[] = [];

      for (const file of incoming) {
        if (isSupportedImage(file)) accepted.push(file);
        else rejected.push({ name: file.name, why: rejectionReason(file) });
      }

      if (rejected.length === 1) {
        toast.error(`Skipped “${rejected[0].name}” — ${rejected[0].why}.`);
      } else if (rejected.length > 1) {
        const named = rejected
          .slice(0, 2)
          .map((r) => `“${r.name}”`)
          .join(', ');
        const rest = rejected.length - 2;
        const reasons = new Set(rejected.map((r) => r.why));
        const why = reasons.size === 1 ? ` — ${[...reasons][0]}` : '';
        toast.error(
          `Skipped ${rejected.length} files: ${named}${rest > 0 ? ` and ${rest} more` : ''}${why}.`,
        );
      }

      if (accepted.length === 0) return;

      const fresh = accepted.map(makeItem);
      setItems((prev) => [...prev, ...fresh]);
      void startRun(fresh);
    },
    [startRun, toast],
  );

  const removeItem = useCallback(
    (id: string) => {
      removedRef.current.add(id);
      const victim = itemsRef.current.find((i) => i.id === id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      releaseUrl(victim?.result?.previewUrl);
    },
    [releaseUrl],
  );

  const clearAll = useCallback(() => {
    abortAll();
    itemsRef.current.forEach((i) => removedRef.current.add(i.id));
    setItems([]);
    const urls = urlsRef.current;
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.clear();
  }, [abortAll]);

  const rerunAll = useCallback(() => {
    const current = itemsRef.current;
    if (current.length === 0) return;
    abortAll();

    const staleUrls = current
      .map((i) => i.result?.previewUrl)
      .filter((url): url is string => Boolean(url));

    const reset = current.map<ImageItem>((i) => ({
      ...i,
      status: 'queued',
      error: null,
      result: null,
      appliedKey: null,
      runId: null,
    }));

    setItems(reset);
    staleUrls.forEach(releaseUrl);
    void startRun(reset);
  }, [abortAll, releaseUrl, startRun]);

  const downloadOne = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item?.result) return;
      downloadBlob(item.result.blob, item.result.filename);
      toast.celebrate(`Saved ${item.result.filename}.`);
    },
    [toast],
  );

  const downloadZip = useCallback(async () => {
    const readyNow = itemsRef.current.filter(isReady);
    if (readyNow.length === 0) {
      toast.info('No finished images to download yet.');
      return;
    }

    setZipping(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const names = uniqueNames(readyNow.map((i) => i.result.filename));
      const blob = await buildZip(
        readyNow.map((item, index) => ({ name: names[index], blob: item.result.blob })),
      );
      downloadBlob(blob, ZIP_NAME);
      toast.celebrate(`Downloaded ${plural(readyNow.length, 'image')} as ${ZIP_NAME}.`);
    } catch (err) {
      toast.error(`Could not build the ZIP — ${readableError(err)}`);
    } finally {
      setZipping(false);
    }
  }, [toast]);

  const currentKey = settingsKey(settings);
  const ready = useMemo(() => items.filter(isReady), [items]);

  const totals = useMemo(() => {
    const before = ready.reduce((sum, i) => sum + i.file.size, 0);
    const after = ready.reduce((sum, i) => sum + i.result.size, 0);
    return { before, after, delta: percentChange(before, after) };
  }, [ready]);

  const stale = items.some((i) => i.status === 'done' && i.appliedKey !== currentKey);
  const failedCount = items.filter((i) => i.status === 'failed').length;
  const pendingCount = items.filter((i) => i.status === 'queued').length;
  const settled = items.filter((i) => i.status === 'done' || i.status === 'failed').length;
  const progress = items.length > 0 ? Math.round((settled / items.length) * 100) : 0;

  const notes: string[] = [];
  if (stale) notes.push('Settings changed since the last run — re-compress to apply them.');
  if (!processing && pendingCount > 0) {
    notes.push(`${plural(pendingCount, 'image')} still waiting — “Re-compress all” finishes them.`);
  }
  if (failedCount > 0) {
    notes.push(
      `${plural(failedCount, 'image')} failed and ${
        failedCount === 1 ? 'was' : 'were'
      } left out of the totals.`,
    );
  }
  if (notes.length === 0) notes.push('Totals cover the images that have finished compressing.');

  return (
    <div className="flex flex-col gap-5">
      <Dropzone
        multiple
        accept="image/*"
        compact={items.length > 0}
        onFiles={addFiles}
        icon={<Images className={items.length > 0 ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />}
        title={items.length > 0 ? 'Add more images' : 'Drop images here'}
        hint={
          items.length > 0
            ? 'New files are added to the batch, not swapped in'
            : 'JPEG, PNG or WebP · as many at once as you like · never uploaded'
        }
      />

      <ControlPanel
        settings={settings}
        onChange={setSettings}
        onRerun={rerunAll}
        disabled={processing}
        canRerun={items.length > 0}
        stale={stale}
      />

      {items.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Images className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-3.5 text-sm font-semibold text-ink">No images yet</p>
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
            Select as many photos as you like and drop them in together. Each one is decoded,
            resized and re-encoded by this page itself — so the batch can be as big as your machine
            can handle, and nothing leaves it.
          </p>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={
              ready.length > 0 ? (
                <span className="font-mono text-[13px] tabular-nums">
                  {plural(ready.length, 'image')} · {formatBytes(totals.before)} →{' '}
                  {formatBytes(totals.after)} ·{' '}
                  {totals.delta < 0 ? (
                    <span className="text-ok">saved {Math.abs(totals.delta)}%</span>
                  ) : totals.delta > 0 ? (
                    <span className="text-warn">{totals.delta}% larger</span>
                  ) : (
                    <span className="text-muted">no change</span>
                  )}
                </span>
              ) : (
                `${plural(items.length, 'image')} in the batch`
              )
            }
            description={notes.join(' ')}
            actions={
              <>
                {processing ? (
                  <Button variant="ghost" size="sm" onClick={abortAll}>
                    <Ban className="h-3.5 w-3.5" aria-hidden />
                    Stop
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={downloadZip}
                  disabled={ready.length === 0 || zipping}
                >
                  {zipping ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <FileArchive className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {zipping ? (
                    'Zipping…'
                  ) : (
                    <>
                      <span className="hidden sm:inline">Download all as&nbsp;</span>ZIP
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  aria-label="Remove every image from the batch"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Clear<span className="hidden sm:inline">&nbsp;all</span>
                </Button>
              </>
            }
          />

          {processing ? (
            <div className="border-b border-line px-5 py-3">
              <div className="flex items-center justify-between gap-3 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <LoaderCircle className="h-3 w-3 animate-spin text-accent" aria-hidden />
                  Compressing on this device…
                </span>
                <span className="font-mono tabular-nums">
                  {settled} / {items.length}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Batch progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line"
              >
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <ImageCard
                key={item.id}
                item={item}
                onRemove={removeItem}
                onDownload={downloadOne}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
